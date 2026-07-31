-- Found → redeliver must NOT auto-unlock Sub receive.
-- Mirror PO: release held reservation; Main uses Allocate Remaining (rider + proof + DR).

CREATE OR REPLACE FUNCTION public.resolve_internal_stock_request_discrepancy(
  p_discrepancy_id uuid,
  p_resolution text,
  p_notes text DEFAULT NULL,
  p_resolved_by uuid DEFAULT auth.uid()
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  disc RECORD;
  v_resolver RECORD;
  v_resolution text;
  v_status text;
  v_event_type text;
  v_notes text;
  v_any_short boolean;
  v_next_request_status text;
  v_delivered integer;
  v_received integer;
  v_open integer;
  v_new_delivered integer;
  v_release_note text;
BEGIN
  v_resolution := lower(btrim(COALESCE(p_resolution, '')));
  IF v_resolution IN ('found_redeliver', 'restore_redeliver') THEN
    v_resolution := 'redeliver';
  END IF;
  IF v_resolution IN ('lost_replace', 'write_off_and_replace') THEN
    v_resolution := 'write_off_replace';
  END IF;

  IF v_resolution NOT IN ('redeliver', 'write_off_replace', 'write_off') THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Resolution must be redeliver, write_off_replace, or write_off'
    );
  END IF;

  v_notes := nullif(btrim(COALESCE(p_notes, '')), '');
  IF v_notes IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Resolution notes are required');
  END IF;

  SELECT * INTO disc
  FROM public.internal_stock_request_discrepancies
  WHERE id = p_discrepancy_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Discrepancy not found');
  END IF;

  IF disc.status <> 'open' THEN
    RETURN json_build_object('success', false, 'error', 'Discrepancy is already resolved');
  END IF;

  SELECT p.id, p.role, p.company_id INTO v_resolver
  FROM public.profiles p
  WHERE p.id = p_resolved_by;

  IF NOT FOUND
     OR v_resolver.role IS DISTINCT FROM 'warehouse'
     OR v_resolver.company_id IS DISTINCT FROM disc.company_id THEN
    RETURN json_build_object('success', false, 'error', 'Only warehouse staff for this hub can resolve shortages');
  END IF;

  IF NOT public.is_main_warehouse_user(p_resolved_by) THEN
    RETURN json_build_object('success', false, 'error', 'Main warehouse access required');
  END IF;

  SELECT i.delivered_quantity, i.received_quantity, i.open_receive_quantity
    INTO v_delivered, v_received, v_open
  FROM public.internal_stock_request_items i
  WHERE i.request_id = disc.request_id AND i.variant_id = disc.variant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Request line not found');
  END IF;

  v_status := CASE v_resolution
    WHEN 'redeliver' THEN 'resolved_redeliver'
    WHEN 'write_off_replace' THEN 'resolved_write_off_replace'
    ELSE 'resolved_write_off'
  END;

  v_event_type := CASE v_resolution
    WHEN 'redeliver' THEN 'shortage_resolved_redeliver'
    WHEN 'write_off_replace' THEN 'shortage_resolved_write_off_replace'
    ELSE 'shortage_resolved_write_off'
  END;

  -- Found / write-off & replace / write-off: release held reservation.
  -- Do NOT bump open_receive — Main must Allocate Remaining (rider + proof + DR) to re-deliver.
  IF v_resolution IN ('redeliver', 'write_off_replace', 'write_off') THEN
    UPDATE public.main_inventory
    SET allocated_stock = GREATEST(0, COALESCE(allocated_stock, 0) - disc.quantity),
        updated_at = now()
    WHERE company_id = disc.company_id
      AND variant_id = disc.variant_id;

    v_release_note := CASE v_resolution
      WHEN 'redeliver' THEN
        'Shortage found — released reservation; Allocate Remaining to re-deliver'
      WHEN 'write_off_replace' THEN
        'Shortage write-off & replace — released reservation'
      ELSE
        'Shortage write-off — released reservation'
    END || COALESCE(' — ' || v_notes, '');

    INSERT INTO public.inventory_transactions (
      company_id,
      variant_id,
      transaction_type,
      quantity,
      from_location,
      to_location,
      performed_by,
      reference_type,
      reference_id,
      notes
    ) VALUES (
      disc.company_id,
      disc.variant_id,
      'internal_stock_request_short_release',
      disc.quantity,
      'main_inventory',
      'main_inventory',
      p_resolved_by,
      'internal_stock_requests',
      disc.request_id,
      v_release_note
    );

    IF v_resolution = 'write_off' THEN
      v_new_delivered := GREATEST(v_received, v_delivered - disc.quantity);
      UPDATE public.internal_stock_request_items
      SET delivered_quantity = v_new_delivered,
          updated_at = now()
      WHERE request_id = disc.request_id AND variant_id = disc.variant_id;
    END IF;
  END IF;

  UPDATE public.internal_stock_request_discrepancies
  SET status = v_status,
      resolved_by = p_resolved_by,
      resolved_at = now(),
      resolution_notes = v_notes,
      updated_at = now()
  WHERE id = p_discrepancy_id;

  SELECT bool_or(delivered_quantity > received_quantity)
    INTO v_any_short
  FROM public.internal_stock_request_items
  WHERE request_id = disc.request_id;

  IF COALESCE(v_any_short, false) THEN
    v_next_request_status := 'partially_received';
  ELSE
    v_next_request_status := 'fully_received';
  END IF;

  UPDATE public.internal_stock_requests
  SET status = v_next_request_status,
      updated_at = now()
  WHERE id = disc.request_id
    AND status IN ('pending_receive', 'partially_received', 'fully_received');

  INSERT INTO public.internal_stock_request_events (
    request_id, event_type, note, lines, short_quantity,
    discrepancy_id, created_by
  ) VALUES (
    disc.request_id,
    v_event_type,
    v_notes,
    jsonb_build_array(
      jsonb_build_object(
        'variant_id', disc.variant_id,
        'quantity', disc.quantity,
        'resolution', v_resolution
      )
    ),
    disc.quantity,
    p_discrepancy_id,
    p_resolved_by
  );

  RETURN json_build_object(
    'success', true,
    'discrepancy_id', p_discrepancy_id,
    'resolution', v_resolution,
    'status', v_status,
    'quantity', disc.quantity,
    'request_status', v_next_request_status
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_internal_stock_request_discrepancy(
  uuid, text, text, uuid
) TO authenticated;

COMMENT ON FUNCTION public.resolve_internal_stock_request_discrepancy(uuid, text, text, uuid) IS
  'Resolve sub-stock shortage: found/write_off_replace release reservation then Allocate Remaining; write_off reduces delivered. Never auto-unlocks open_receive.';
