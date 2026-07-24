-- Extend PO history for delivery shortage investigation + resolution.

-- ---------------------------------------------------------------------------
-- 1) Schema: new event types + optional discrepancy link
-- ---------------------------------------------------------------------------
ALTER TABLE public.purchase_order_events
  DROP CONSTRAINT IF EXISTS purchase_order_events_event_type_check;

ALTER TABLE public.purchase_order_events
  ADD CONSTRAINT purchase_order_events_event_type_check CHECK (
    event_type = ANY (ARRAY[
      'created'::text,
      'approved'::text,
      'rejected'::text,
      'dispatched'::text,
      'receive_confirmed'::text,
      'cancelled'::text,
      'shortage_opened'::text,
      'shortage_resolved_redeliver'::text,
      'shortage_resolved_write_off_replace'::text,
      'shortage_resolved_write_off'::text
    ])
  );

ALTER TABLE public.purchase_order_events
  ADD COLUMN IF NOT EXISTS discrepancy_id uuid
    REFERENCES public.purchase_order_delivery_discrepancies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_order_events_discrepancy
  ON public.purchase_order_events(discrepancy_id)
  WHERE discrepancy_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) Helper accepts shortage event types + discrepancy_id
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_purchase_order_event(
  p_purchase_order_id uuid,
  p_event_type text,
  p_note text DEFAULT NULL,
  p_lines jsonb DEFAULT NULL,
  p_short_quantity integer DEFAULT NULL,
  p_proof_image_url text DEFAULT NULL,
  p_proof_image_path text DEFAULT NULL,
  p_signature_url text DEFAULT NULL,
  p_signature_path text DEFAULT NULL,
  p_delivery_id uuid DEFAULT NULL,
  p_created_by uuid DEFAULT auth.uid(),
  p_created_at timestamptz DEFAULT now(),
  p_discrepancy_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid;
  v_event_id uuid;
  v_type text;
  v_po RECORD;
  v_company_id uuid;
BEGIN
  v_type := lower(btrim(COALESCE(p_event_type, '')));
  IF v_type NOT IN (
    'created', 'approved', 'rejected', 'dispatched', 'receive_confirmed', 'cancelled',
    'shortage_opened',
    'shortage_resolved_redeliver',
    'shortage_resolved_write_off_replace',
    'shortage_resolved_write_off'
  ) THEN
    RAISE EXCEPTION 'Invalid purchase_order_events.event_type: %', p_event_type;
  END IF;

  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_purchase_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase order not found';
  END IF;

  v_actor := COALESCE(p_created_by, auth.uid());
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'created_by required when not authenticated';
  END IF;

  IF auth.uid() IS NOT NULL THEN
    v_company_id := public.get_auth_company_id();
    IF v_company_id IS NULL
       OR (
         v_po.company_id IS DISTINCT FROM v_company_id
         AND v_po.warehouse_company_id IS DISTINCT FROM v_company_id
       ) THEN
      RAISE EXCEPTION 'Not allowed to log events for this purchase order';
    END IF;
  END IF;

  INSERT INTO public.purchase_order_events (
    purchase_order_id,
    delivery_id,
    discrepancy_id,
    event_type,
    note,
    lines,
    short_quantity,
    proof_image_url,
    proof_image_path,
    signature_url,
    signature_path,
    created_by,
    created_at
  ) VALUES (
    p_purchase_order_id,
    p_delivery_id,
    p_discrepancy_id,
    v_type,
    NULLIF(btrim(COALESCE(p_note, '')), ''),
    CASE WHEN p_lines IS NULL OR p_lines = 'null'::jsonb THEN NULL ELSE p_lines END,
    p_short_quantity,
    NULLIF(btrim(COALESCE(p_proof_image_url, '')), ''),
    NULLIF(btrim(COALESCE(p_proof_image_path, '')), ''),
    NULLIF(btrim(COALESCE(p_signature_url, '')), ''),
    NULLIF(btrim(COALESCE(p_signature_path, '')), ''),
    v_actor,
    COALESCE(p_created_at, now())
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

COMMENT ON FUNCTION public.log_purchase_order_event(
  uuid, text, text, jsonb, integer, text, text, text, text, uuid, uuid, timestamptz, uuid
) IS
  'Append a purchase_order_events row for PO timeline history (includes shortage events).';

GRANT EXECUTE ON FUNCTION public.log_purchase_order_event(
  uuid, text, text, jsonb, integer, text, text, text, text, uuid, uuid, timestamptz, uuid
) TO authenticated;

-- Drop prior 12-arg overload so calls stay unambiguous (13th arg defaults to NULL).
DROP FUNCTION IF EXISTS public.log_purchase_order_event(
  uuid, text, text, jsonb, integer, text, text, text, text, uuid, uuid, timestamptz
);

-- ---------------------------------------------------------------------------
-- 3) Log resolve events inside resolve_po_delivery_discrepancy
--     (body = latest from 20260716140000 + history insert)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_po_delivery_discrepancy(
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
  po_record RECORD;
  d_rec RECORD;
  v_resolver RECORD;
  v_is_main_location boolean;
  v_resolution text;
  v_restore_stock boolean;
  v_reopen boolean;
  v_status text;
  v_batch_result jsonb;
  v_event_type text;
  v_lines jsonb;
  v_variant_name text;
  v_brand_name text;
  v_reason_label text;
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

  SELECT * INTO disc
  FROM public.purchase_order_delivery_discrepancies
  WHERE id = p_discrepancy_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Discrepancy not found');
  END IF;

  IF disc.status <> 'open' THEN
    RETURN json_build_object('success', false, 'error', 'Discrepancy is already resolved');
  END IF;

  SELECT * INTO po_record FROM public.purchase_orders WHERE id = disc.purchase_order_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Purchase order not found');
  END IF;

  SELECT * INTO d_rec FROM public.purchase_order_deliveries WHERE id = disc.delivery_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Delivery not found');
  END IF;

  SELECT p.id, p.role, p.company_id INTO v_resolver
  FROM public.profiles p
  WHERE p.id = p_resolved_by;

  IF NOT FOUND
     OR v_resolver.role IS DISTINCT FROM 'warehouse'
     OR v_resolver.company_id IS DISTINCT FROM disc.company_id THEN
    RETURN json_build_object('success', false, 'error', 'Only warehouse staff for this hub can resolve discrepancies');
  END IF;

  SELECT COALESCE(wl.is_main, false) INTO v_is_main_location
  FROM public.warehouse_locations wl
  WHERE wl.id = disc.warehouse_location_id;

  v_restore_stock := (v_resolution = 'redeliver');
  v_reopen := (v_resolution IN ('redeliver', 'write_off_replace'));
  v_status := CASE v_resolution
    WHEN 'redeliver' THEN 'resolved_redeliver'
    WHEN 'write_off_replace' THEN 'resolved_write_off_replace'
    ELSE 'resolved_write_off'
  END;

  IF v_restore_stock THEN
    v_batch_result := public.restore_po_fulfill_out_inventory_lots(
      disc.company_id,
      disc.warehouse_location_id,
      disc.variant_id,
      disc.quantity,
      disc.purchase_order_id,
      'purchase_order',
      disc.purchase_order_id,
      p_resolved_by,
      'Discrepancy found — batch restore PO ' || po_record.po_number
        || ' DR ' || COALESCE(d_rec.dr_number, '')
        || COALESCE(' — ' || NULLIF(btrim(COALESCE(p_notes, '')), ''), '')
    );

    IF NOT COALESCE((v_batch_result->>'success')::boolean, false) THEN
      RETURN json_build_object(
        'success', false,
        'error', COALESCE(v_batch_result->>'error', 'Failed to restore batch lots'),
        'discrepancy_id', p_discrepancy_id
      );
    END IF;

    IF COALESCE(v_is_main_location, true) THEN
      UPDATE public.main_inventory
      SET stock = stock + disc.quantity,
          updated_at = NOW()
      WHERE company_id = disc.company_id
        AND variant_id = disc.variant_id;

      IF NOT FOUND THEN
        INSERT INTO public.main_inventory (
          company_id, variant_id, stock, unit_price, reorder_level, created_at, updated_at
        ) VALUES (
          disc.company_id, disc.variant_id, disc.quantity,
          0, 10, NOW(), NOW()
        );
      END IF;
    ELSE
      UPDATE public.warehouse_location_inventory
      SET stock = stock + disc.quantity,
          updated_at = NOW()
      WHERE company_id = disc.company_id
        AND location_id = disc.warehouse_location_id
        AND variant_id = disc.variant_id;

      IF NOT FOUND THEN
        INSERT INTO public.warehouse_location_inventory (
          company_id, location_id, variant_id, stock, created_at, updated_at
        ) VALUES (
          disc.company_id, disc.warehouse_location_id, disc.variant_id, disc.quantity,
          NOW(), NOW()
        );
      END IF;

      UPDATE public.main_inventory
      SET allocated_stock = COALESCE(allocated_stock, 0) + disc.quantity,
          updated_at = NOW()
      WHERE company_id = disc.company_id
        AND variant_id = disc.variant_id;
    END IF;

    INSERT INTO public.inventory_transactions (
      company_id, variant_id, transaction_type, quantity,
      reference_type, reference_id, performed_by, notes, created_at
    ) VALUES (
      disc.company_id, disc.variant_id, 'warehouse_transfer_in', disc.quantity,
      'purchase_order', disc.purchase_order_id, p_resolved_by,
      'Discrepancy found — restore PO ' || po_record.po_number
        || ' DR ' || COALESCE(d_rec.dr_number, '')
        || COALESCE(' — ' || NULLIF(btrim(COALESCE(p_notes, '')), ''), ''),
      NOW()
    );
  END IF;

  IF v_reopen THEN
    UPDATE public.warehouse_transfer_reservations
    SET quantity_fulfilled = GREATEST(0, quantity_fulfilled - disc.quantity),
        status = CASE
          WHEN GREATEST(0, quantity_fulfilled - disc.quantity) <= 0 THEN 'reserved'
          WHEN GREATEST(0, quantity_fulfilled - disc.quantity) < quantity_reserved THEN 'partial'
          ELSE 'fulfilled'
        END,
        updated_at = NOW()
    WHERE purchase_order_id = disc.purchase_order_id
      AND warehouse_location_id = disc.warehouse_location_id
      AND variant_id = disc.variant_id;

    UPDATE public.warehouse_transfer_location_status s
    SET status = CASE
        WHEN NOT EXISTS (
          SELECT 1
          FROM public.warehouse_transfer_reservations r
          WHERE r.purchase_order_id = s.purchase_order_id
            AND r.warehouse_location_id = s.warehouse_location_id
            AND r.status <> 'cancelled'
            AND (r.quantity_reserved - r.quantity_fulfilled) > 0
        ) THEN 'fulfilled'
        WHEN EXISTS (
          SELECT 1
          FROM public.warehouse_transfer_reservations r
          WHERE r.purchase_order_id = s.purchase_order_id
            AND r.warehouse_location_id = s.warehouse_location_id
            AND r.quantity_fulfilled > 0
            AND r.status <> 'cancelled'
        ) THEN 'partial'
        ELSE 'ready'
      END,
      updated_at = NOW()
    WHERE s.purchase_order_id = disc.purchase_order_id
      AND s.warehouse_location_id = disc.warehouse_location_id;

    UPDATE public.purchase_orders
    SET
      status = 'partially_fulfilled',
      workflow_status = 'partial_delivered',
      updated_at = NOW()
    WHERE id = disc.purchase_order_id;
  END IF;

  UPDATE public.purchase_order_delivery_discrepancies
  SET status = v_status,
      resolved_by = p_resolved_by,
      resolved_at = NOW(),
      resolution_notes = NULLIF(btrim(COALESCE(p_notes, '')), ''),
      updated_at = NOW()
  WHERE id = p_discrepancy_id;

  v_event_type := CASE v_resolution
    WHEN 'redeliver' THEN 'shortage_resolved_redeliver'
    WHEN 'write_off_replace' THEN 'shortage_resolved_write_off_replace'
    ELSE 'shortage_resolved_write_off'
  END;

  SELECT v.name, b.name
  INTO v_variant_name, v_brand_name
  FROM public.variants v
  LEFT JOIN public.brands b ON b.id = v.brand_id
  WHERE v.id = disc.variant_id;

  v_reason_label := CASE disc.reason
    WHEN 'missing_in_transit' THEN 'Missing / lost in transit'
    WHEN 'damaged' THEN 'Damaged on arrival'
    WHEN 'wrong_item' THEN 'Wrong / incomplete packaging'
    WHEN 'other' THEN 'Other'
    ELSE COALESCE(disc.reason, 'Shortage')
  END;

  v_lines := jsonb_build_array(
    jsonb_build_object(
      'variant_id', disc.variant_id,
      'quantity', disc.quantity,
      'variant_name', COALESCE(v_variant_name, disc.variant_id::text),
      'brand_name', v_brand_name,
      'reason', v_reason_label
    )
  );

  PERFORM public.log_purchase_order_event(
    disc.purchase_order_id,
    v_event_type,
    NULLIF(btrim(COALESCE(p_notes, '')), ''),
    v_lines,
    disc.quantity,
    NULL,
    NULL,
    NULL,
    NULL,
    disc.delivery_id,
    p_resolved_by,
    NOW(),
    p_discrepancy_id
  );

  RETURN json_build_object(
    'success', true,
    'discrepancy_id', p_discrepancy_id,
    'resolution', v_resolution,
    'quantity', disc.quantity,
    'restored_stock', v_restore_stock,
    'reopened', v_reopen,
    'batch_restored', CASE WHEN v_restore_stock THEN v_batch_result->'restored' ELSE '[]'::jsonb END
  );
END;
$$;

COMMENT ON FUNCTION public.resolve_po_delivery_discrepancy(uuid, text, text, uuid) IS
  'Resolve buyer delivery shortfall and append purchase_order_events for timeline history.';

GRANT EXECUTE ON FUNCTION public.resolve_po_delivery_discrepancy(uuid, text, text, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) Backfill shortage timeline from existing discrepancies (idempotent)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  disc RECORD;
  v_lines jsonb;
  v_variant_name text;
  v_brand_name text;
  v_reason_label text;
  v_resolve_type text;
BEGIN
  FOR disc IN
    SELECT d.*
    FROM public.purchase_order_delivery_discrepancies d
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.purchase_order_events e
      WHERE e.discrepancy_id = d.id
        AND e.event_type = 'shortage_opened'
    )
    ORDER BY d.created_at
  LOOP
    SELECT v.name, b.name
    INTO v_variant_name, v_brand_name
    FROM public.variants v
    LEFT JOIN public.brands b ON b.id = v.brand_id
    WHERE v.id = disc.variant_id;

    v_reason_label := CASE disc.reason
      WHEN 'missing_in_transit' THEN 'Missing / lost in transit'
      WHEN 'damaged' THEN 'Damaged on arrival'
      WHEN 'wrong_item' THEN 'Wrong / incomplete packaging'
      WHEN 'other' THEN 'Other'
      ELSE COALESCE(disc.reason, 'Shortage')
    END;

    v_lines := jsonb_build_array(
      jsonb_build_object(
        'variant_id', disc.variant_id,
        'quantity', disc.quantity,
        'variant_name', COALESCE(v_variant_name, disc.variant_id::text),
        'brand_name', v_brand_name,
        'reason', v_reason_label
      )
    );

    INSERT INTO public.purchase_order_events (
      purchase_order_id, delivery_id, discrepancy_id, event_type, note, lines,
      short_quantity, created_by, created_at
    ) VALUES (
      disc.purchase_order_id,
      disc.delivery_id,
      disc.id,
      'shortage_opened',
      COALESCE(
        NULLIF(btrim(COALESCE(disc.buyer_notes, '')), ''),
        v_reason_label
      ),
      v_lines,
      disc.quantity,
      disc.reported_by,
      disc.created_at
    );

    IF disc.status IN (
      'resolved_redeliver',
      'resolved_write_off_replace',
      'resolved_write_off'
    ) AND NOT EXISTS (
      SELECT 1
      FROM public.purchase_order_events e
      WHERE e.discrepancy_id = disc.id
        AND e.event_type LIKE 'shortage_resolved_%'
    ) THEN
      v_resolve_type := CASE disc.status
        WHEN 'resolved_redeliver' THEN 'shortage_resolved_redeliver'
        WHEN 'resolved_write_off_replace' THEN 'shortage_resolved_write_off_replace'
        ELSE 'shortage_resolved_write_off'
      END;

      INSERT INTO public.purchase_order_events (
        purchase_order_id, delivery_id, discrepancy_id, event_type, note, lines,
        short_quantity, created_by, created_at
      ) VALUES (
        disc.purchase_order_id,
        disc.delivery_id,
        disc.id,
        v_resolve_type,
        disc.resolution_notes,
        v_lines,
        disc.quantity,
        disc.resolved_by,
        COALESCE(disc.resolved_at, disc.updated_at, disc.created_at)
      );
    END IF;
  END LOOP;
END;
$$;
