-- Sub-stock receive shortages → investigation queue (mirror PO delivery discrepancies).
-- On partial receive: require reason, create open discrepancies, hold allocated_stock,
-- and zero open_receive until Main resolves (Found re-unlocks; write-off releases).

-- ---------------------------------------------------------------------------
-- 1) Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.internal_stock_request_discrepancies (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES public.internal_stock_requests(id) ON DELETE CASCADE,
  request_item_id uuid REFERENCES public.internal_stock_request_items(id) ON DELETE SET NULL,
  receive_id uuid REFERENCES public.internal_stock_request_receives(id) ON DELETE SET NULL,
  from_location_id uuid NOT NULL REFERENCES public.warehouse_locations(id) ON DELETE RESTRICT,
  variant_id uuid NOT NULL REFERENCES public.variants(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  reason text NOT NULL CHECK (
    reason = ANY (ARRAY[
      'missing_in_transit'::text,
      'damaged'::text,
      'wrong_item'::text,
      'other'::text
    ])
  ),
  reporter_notes text,
  status text NOT NULL DEFAULT 'open' CHECK (
    status = ANY (ARRAY[
      'open'::text,
      'resolved_redeliver'::text,
      'resolved_write_off_replace'::text,
      'resolved_write_off'::text,
      'cancelled'::text
    ])
  ),
  dr_number text,
  reported_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_internal_stock_request_discrepancies_company_status
  ON public.internal_stock_request_discrepancies(company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_internal_stock_request_discrepancies_request
  ON public.internal_stock_request_discrepancies(request_id);

CREATE INDEX IF NOT EXISTS idx_internal_stock_request_discrepancies_location
  ON public.internal_stock_request_discrepancies(from_location_id);

COMMENT ON TABLE public.internal_stock_request_discrepancies IS
  'Sub-warehouse reported shortfalls on internal stock receive, awaiting main warehouse investigation.';

DROP TRIGGER IF EXISTS update_internal_stock_request_discrepancies_updated_at
  ON public.internal_stock_request_discrepancies;
CREATE TRIGGER update_internal_stock_request_discrepancies_updated_at
  BEFORE UPDATE ON public.internal_stock_request_discrepancies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.internal_stock_request_discrepancies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Warehouse can view internal stock discrepancies"
  ON public.internal_stock_request_discrepancies;
CREATE POLICY "Warehouse can view internal stock discrepancies"
  ON public.internal_stock_request_discrepancies
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_auth_company_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'warehouse'
        AND p.company_id = internal_stock_request_discrepancies.company_id
    )
  );

GRANT SELECT ON public.internal_stock_request_discrepancies TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) Events: discrepancy_id + shortage event types
-- ---------------------------------------------------------------------------
ALTER TABLE public.internal_stock_request_events
  ADD COLUMN IF NOT EXISTS discrepancy_id uuid
    REFERENCES public.internal_stock_request_discrepancies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_internal_stock_request_events_discrepancy
  ON public.internal_stock_request_events(discrepancy_id)
  WHERE discrepancy_id IS NOT NULL;

ALTER TABLE public.internal_stock_request_events
  DROP CONSTRAINT IF EXISTS internal_stock_request_events_event_type_check;

ALTER TABLE public.internal_stock_request_events
  ADD CONSTRAINT internal_stock_request_events_event_type_check
  CHECK (
    event_type IN (
      'created',
      'main_allocated',
      'approved',
      'delivered',
      'approved_released',
      'remaining_released',
      'receive_confirmed',
      'rejected',
      'shortage_opened',
      'shortage_resolved_redeliver',
      'shortage_resolved_write_off_replace',
      'shortage_resolved_write_off'
    )
  );

-- ---------------------------------------------------------------------------
-- 3) confirm_internal_stock_request_receive — reasons + hold reservation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_internal_stock_request_receive(
  p_request_id uuid,
  p_lines jsonb,
  p_proof_image_url text,
  p_signature_url text,
  p_notes text DEFAULT NULL,
  p_proof_image_path text DEFAULT NULL,
  p_proof_image_name text DEFAULT NULL,
  p_signature_path text DEFAULT NULL,
  p_received_by uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := COALESCE(p_received_by, auth.uid());
  v_company_id uuid;
  v_from_location uuid;
  v_status text;
  v_dr_number text;
  v_line jsonb;
  v_variant_id uuid;
  v_qty integer;
  v_open integer;
  v_received integer;
  v_delivered integer;
  v_item_id uuid;
  v_wave_short integer;
  v_shortfall_reason text;
  v_shortfall_notes text;
  v_reporter_notes text;
  v_history jsonb := '[]'::jsonb;
  v_shortage_lines jsonb := '[]'::jsonb;
  v_short integer := 0;
  v_wave_short_total integer := 0;
  v_any_short boolean;
  v_next_status text;
  v_receive_id uuid;
  v_disc_id uuid;
  v_open_item RECORD;
BEGIN
  IF v_actor IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  IF p_proof_image_url IS NULL OR btrim(p_proof_image_url) = '' THEN
    RETURN json_build_object('success', false, 'error', 'Proof image is required');
  END IF;
  IF p_signature_url IS NULL OR btrim(p_signature_url) = '' THEN
    RETURN json_build_object('success', false, 'error', 'Signature is required');
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Receive lines are required');
  END IF;

  SELECT r.company_id, r.from_location_id, r.status, r.dr_number
    INTO v_company_id, v_from_location, v_status, v_dr_number
  FROM public.internal_stock_requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF v_company_id IS NULL OR v_company_id IS DISTINCT FROM public.get_auth_company_id() THEN
    RETURN json_build_object('success', false, 'error', 'Request not found');
  END IF;

  IF v_status NOT IN ('pending_receive', 'partially_received') THEN
    RETURN json_build_object('success', false, 'error', 'Request is not awaiting receive');
  END IF;

  IF NOT public.is_main_warehouse_user(v_actor)
     AND v_from_location IS DISTINCT FROM public.get_warehouse_location_id(v_actor) THEN
    RETURN json_build_object('success', false, 'error', 'Only the requesting sub-warehouse can confirm receive');
  END IF;

  -- Every unlocked line must appear in p_lines (qty may be 0 when fully short).
  FOR v_open_item IN
    SELECT i.id, i.variant_id, i.open_receive_quantity
    FROM public.internal_stock_request_items i
    WHERE i.request_id = p_request_id
      AND i.open_receive_quantity > 0
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_lines) elem
      WHERE NULLIF(elem->>'variant_id', '')::uuid = v_open_item.variant_id
    ) THEN
      RETURN json_build_object(
        'success', false,
        'error', 'All unlocked lines must be included when confirming receive',
        'variant_id', v_open_item.variant_id
      );
    END IF;
  END LOOP;

  -- Validate qtys + shortfall reasons; build receive history (positive only).
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_variant_id := NULLIF(v_line->>'variant_id', '')::uuid;
    v_qty := COALESCE(
      (v_line->>'quantity')::integer,
      (v_line->>'quantity_this_receive')::integer,
      0
    );
    IF v_variant_id IS NULL THEN
      CONTINUE;
    END IF;
    IF v_qty < 0 THEN
      RETURN json_build_object('success', false, 'error', 'Receive quantity cannot be negative');
    END IF;

    SELECT i.id, i.open_receive_quantity, i.received_quantity, i.delivered_quantity
      INTO v_item_id, v_open, v_received, v_delivered
    FROM public.internal_stock_request_items i
    WHERE i.request_id = p_request_id AND i.variant_id = v_variant_id;

    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'Variant not on request');
    END IF;
    IF v_qty > v_open THEN
      RETURN json_build_object('success', false, 'error', 'Receive quantity exceeds unlocked quantity');
    END IF;

    v_wave_short := GREATEST(0, v_open - v_qty);
    IF v_wave_short > 0 THEN
      v_shortfall_reason := NULLIF(btrim(COALESCE(v_line->>'shortfall_reason', '')), '');
      v_shortfall_notes := NULLIF(btrim(COALESCE(v_line->>'shortfall_notes', '')), '');

      IF v_shortfall_reason IS NULL OR v_shortfall_reason NOT IN (
        'missing_in_transit', 'damaged', 'wrong_item', 'other'
      ) THEN
        RETURN json_build_object(
          'success', false,
          'error', 'Shortfall reason is required when receiving less than unlocked quantity',
          'variant_id', v_variant_id,
          'shortfall', v_wave_short
        );
      END IF;

      IF v_shortfall_reason = 'other' AND v_shortfall_notes IS NULL THEN
        RETURN json_build_object(
          'success', false,
          'error', 'Please describe the shortfall when reason is Other',
          'variant_id', v_variant_id,
          'shortfall', v_wave_short
        );
      END IF;

      v_wave_short_total := v_wave_short_total + v_wave_short;
      v_shortage_lines := v_shortage_lines || jsonb_build_array(
        jsonb_build_object(
          'variant_id', v_variant_id,
          'request_item_id', v_item_id,
          'quantity', v_wave_short,
          'reason', v_shortfall_reason,
          'shortfall_notes', v_shortfall_notes
        )
      );
    END IF;

    IF v_qty > 0 THEN
      v_history := v_history || jsonb_build_array(
        jsonb_build_object('variant_id', v_variant_id, 'quantity', v_qty)
      );
    END IF;
  END LOOP;

  IF jsonb_array_length(v_history) = 0 AND jsonb_array_length(v_shortage_lines) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Nothing received');
  END IF;

  IF jsonb_array_length(v_history) = 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Enter at least one line with received greater than 0 to confirm'
    );
  END IF;

  -- Apply receive qty updates; leave short open_receive held then lock below.
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_variant_id := NULLIF(v_line->>'variant_id', '')::uuid;
    v_qty := COALESCE(
      (v_line->>'quantity')::integer,
      (v_line->>'quantity_this_receive')::integer,
      0
    );
    IF v_variant_id IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT i.open_receive_quantity
      INTO v_open
    FROM public.internal_stock_request_items i
    WHERE i.request_id = p_request_id AND i.variant_id = v_variant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'Variant not on request');
    END IF;
    IF v_qty > v_open THEN
      RETURN json_build_object('success', false, 'error', 'Receive quantity exceeds unlocked quantity');
    END IF;

    UPDATE public.internal_stock_request_items
    SET received_quantity = received_quantity + v_qty,
        open_receive_quantity = open_receive_quantity - v_qty,
        updated_at = now()
    WHERE request_id = p_request_id AND variant_id = v_variant_id;
  END LOOP;

  -- Hold reservation: zero remaining unlock for short lines (no short_release).
  IF jsonb_array_length(v_shortage_lines) > 0 THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(v_shortage_lines)
    LOOP
      v_variant_id := NULLIF(v_line->>'variant_id', '')::uuid;
      UPDATE public.internal_stock_request_items
      SET open_receive_quantity = 0,
          updated_at = now()
      WHERE request_id = p_request_id AND variant_id = v_variant_id;
    END LOOP;
  END IF;

  SELECT
    COALESCE(SUM(GREATEST(0, delivered_quantity - received_quantity)), 0),
    bool_or(delivered_quantity > received_quantity)
  INTO v_short, v_any_short
  FROM public.internal_stock_request_items
  WHERE request_id = p_request_id;

  IF NOT v_any_short THEN
    v_next_status := 'fully_received';
  ELSE
    v_next_status := 'partially_received';
  END IF;

  PERFORM public.internal_stock_request_receive_to_sub(
    v_company_id,
    v_from_location,
    p_request_id,
    v_history,
    v_actor,
    p_notes
  );

  UPDATE public.internal_stock_requests
  SET status = v_next_status,
      receive_notes = COALESCE(nullif(btrim(COALESCE(p_notes, '')), ''), receive_notes),
      updated_at = now()
  WHERE id = p_request_id;

  INSERT INTO public.internal_stock_request_receives (
    request_id, notes, lines, proof_image_url, proof_image_path, proof_image_name,
    signature_url, signature_path, short_quantity, received_by
  ) VALUES (
    p_request_id,
    nullif(btrim(COALESCE(p_notes, '')), ''),
    v_history,
    p_proof_image_url,
    p_proof_image_path,
    p_proof_image_name,
    p_signature_url,
    p_signature_path,
    COALESCE(v_wave_short_total, v_short),
    v_actor
  )
  RETURNING id INTO v_receive_id;

  INSERT INTO public.internal_stock_request_events (
    request_id, event_type, note, lines, short_quantity,
    proof_image_url, proof_image_path, signature_url, signature_path, created_by
  ) VALUES (
    p_request_id, 'receive_confirmed', nullif(btrim(COALESCE(p_notes, '')), ''), v_history,
    COALESCE(v_wave_short_total, v_short),
    p_proof_image_url, p_proof_image_path, p_signature_url, p_signature_path, v_actor
  );

  -- Open investigation rows + shortage_opened events
  FOR v_line IN SELECT * FROM jsonb_array_elements(v_shortage_lines)
  LOOP
    v_variant_id := NULLIF(v_line->>'variant_id', '')::uuid;
    v_item_id := NULLIF(v_line->>'request_item_id', '')::uuid;
    v_wave_short := COALESCE((v_line->>'quantity')::integer, 0);
    v_shortfall_reason := v_line->>'reason';
    v_shortfall_notes := NULLIF(btrim(COALESCE(v_line->>'shortfall_notes', '')), '');
    v_reporter_notes := NULLIF(
      btrim(
        CONCAT_WS(
          E'\n',
          v_shortfall_notes,
          NULLIF(btrim(COALESCE(p_notes, '')), '')
        )
      ),
      ''
    );

    INSERT INTO public.internal_stock_request_discrepancies (
      company_id,
      request_id,
      request_item_id,
      receive_id,
      from_location_id,
      variant_id,
      quantity,
      reason,
      reporter_notes,
      status,
      dr_number,
      reported_by
    ) VALUES (
      v_company_id,
      p_request_id,
      v_item_id,
      v_receive_id,
      v_from_location,
      v_variant_id,
      v_wave_short,
      v_shortfall_reason,
      v_reporter_notes,
      'open',
      v_dr_number,
      v_actor
    )
    RETURNING id INTO v_disc_id;

    INSERT INTO public.internal_stock_request_events (
      request_id, event_type, note, lines, short_quantity,
      discrepancy_id, created_by
    ) VALUES (
      p_request_id,
      'shortage_opened',
      CASE v_shortfall_reason
        WHEN 'missing_in_transit' THEN 'Missing / lost in transit'
        WHEN 'damaged' THEN 'Damaged on arrival'
        WHEN 'wrong_item' THEN 'Wrong / incomplete packaging'
        WHEN 'other' THEN COALESCE('Other — ' || v_shortfall_notes, 'Other')
        ELSE v_shortfall_reason
      END,
      jsonb_build_array(
        jsonb_build_object(
          'variant_id', v_variant_id,
          'quantity', v_wave_short,
          'reason', v_shortfall_reason,
          'shortfall_notes', v_shortfall_notes
        )
      ),
      v_wave_short,
      v_disc_id,
      v_actor
    );
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'request_id', p_request_id,
    'status', v_next_status,
    'short_quantity', COALESCE(v_wave_short_total, v_short),
    'discrepancy_count', jsonb_array_length(v_shortage_lines)
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_internal_stock_request_receive(
  uuid, jsonb, text, text, text, text, text, text, uuid
) TO authenticated;

COMMENT ON FUNCTION public.confirm_internal_stock_request_receive(
  uuid, jsonb, text, text, text, text, text, text, uuid
) IS
  'Confirm sub receive; on wave shortfall require reason, open discrepancies, hold allocated and lock open_receive until resolve.';

-- ---------------------------------------------------------------------------
-- 4) resolve_internal_stock_request_discrepancy
-- ---------------------------------------------------------------------------
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

  IF v_resolution = 'redeliver' THEN
    -- Reservation already held; re-unlock for sub receive.
    UPDATE public.internal_stock_request_items
    SET open_receive_quantity = open_receive_quantity + disc.quantity,
        updated_at = now()
    WHERE request_id = disc.request_id AND variant_id = disc.variant_id;

  ELSIF v_resolution IN ('write_off_replace', 'write_off') THEN
    -- Release held reservation back to available.
    UPDATE public.main_inventory
    SET allocated_stock = GREATEST(0, COALESCE(allocated_stock, 0) - disc.quantity),
        updated_at = now()
    WHERE company_id = disc.company_id
      AND variant_id = disc.variant_id;

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
      CASE
        WHEN v_resolution = 'write_off_replace' THEN
          'Shortage write-off & replace — released reservation'
        ELSE
          'Shortage write-off — released reservation'
      END || COALESCE(' — ' || v_notes, '')
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
  'Resolve sub-stock shortage: redeliver (re-unlock), write_off_replace (release + allow allocate), or write_off (release + reduce delivered).';

-- ---------------------------------------------------------------------------
-- 5) Bulk resolve wrapper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_internal_stock_request_discrepancies_bulk(
  p_discrepancy_ids uuid[],
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
  v_id uuid;
  v_result json;
  v_ok integer := 0;
  v_fail integer := 0;
  v_errors jsonb := '[]'::jsonb;
  v_qty integer := 0;
BEGIN
  IF p_discrepancy_ids IS NULL OR cardinality(p_discrepancy_ids) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Select at least one shortage line');
  END IF;

  FOREACH v_id IN ARRAY p_discrepancy_ids
  LOOP
    v_result := public.resolve_internal_stock_request_discrepancy(
      v_id,
      p_resolution,
      p_notes,
      p_resolved_by
    );

    IF COALESCE((v_result->>'success')::boolean, false) THEN
      v_ok := v_ok + 1;
      v_qty := v_qty + COALESCE((v_result->>'quantity')::integer, 0);
    ELSE
      v_fail := v_fail + 1;
      v_errors := v_errors || jsonb_build_array(
        jsonb_build_object(
          'discrepancy_id', v_id,
          'error', COALESCE(v_result->>'error', 'Resolve failed')
        )
      );
    END IF;
  END LOOP;

  IF v_ok = 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', COALESCE(v_errors->0->>'error', 'No shortages were resolved'),
      'resolved_count', v_ok,
      'failed_count', v_fail,
      'errors', v_errors
    );
  END IF;

  RETURN json_build_object(
    'success', true,
    'resolution', lower(btrim(COALESCE(p_resolution, ''))),
    'resolved_count', v_ok,
    'failed_count', v_fail,
    'quantity', v_qty,
    'errors', v_errors
  );
END;
$$;

COMMENT ON FUNCTION public.resolve_internal_stock_request_discrepancies_bulk(uuid[], text, text, uuid) IS
  'Resolve multiple open internal stock shortage lines with the same action.';

GRANT EXECUTE ON FUNCTION public.resolve_internal_stock_request_discrepancies_bulk(
  uuid[], text, text, uuid
) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6) Gate allocate_remaining while open shortages exist
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.allocate_internal_stock_request_remaining(
  p_request_id uuid,
  p_lines jsonb,
  p_proof_image_url text,
  p_signature_url text,
  p_note text DEFAULT NULL,
  p_proof_image_path text DEFAULT NULL,
  p_signature_path text DEFAULT NULL,
  p_allocated_by uuid DEFAULT NULL,
  p_rider_name text DEFAULT NULL,
  p_rider_plate_number text DEFAULT NULL,
  p_rider_photo_url text DEFAULT NULL,
  p_rider_photo_path text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := COALESCE(p_allocated_by, auth.uid());
  v_company_id uuid;
  v_status text;
  v_line jsonb;
  v_variant_id uuid;
  v_qty integer;
  v_allocatable integer;
  v_open integer;
  v_history jsonb := '[]'::jsonb;
  v_reserve_lines jsonb := '[]'::jsonb;
  v_total integer := 0;
  v_main_loc_id uuid;
  v_dr_number text;
  v_rider_name text := nullif(btrim(COALESCE(p_rider_name, '')), '');
  v_rider_plate text := nullif(btrim(COALESCE(p_rider_plate_number, '')), '');
  v_rider_photo text := nullif(btrim(COALESCE(p_rider_photo_url, '')), '');
  v_open_shortage_count integer := 0;
BEGIN
  IF v_actor IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  IF NOT public.is_main_warehouse_user(v_actor) THEN
    RETURN json_build_object('success', false, 'error', 'Main warehouse access required');
  END IF;
  IF p_proof_image_url IS NULL OR btrim(p_proof_image_url) = '' THEN
    RETURN json_build_object('success', false, 'error', 'Proof image is required');
  END IF;
  IF p_signature_url IS NULL OR btrim(p_signature_url) = '' THEN
    RETURN json_build_object('success', false, 'error', 'Signature is required');
  END IF;
  IF v_rider_name IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Rider name is required');
  END IF;
  IF v_rider_plate IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Rider plate number is required');
  END IF;
  IF v_rider_photo IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Rider photo is required');
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Allocate lines are required');
  END IF;

  SELECT r.company_id, r.status INTO v_company_id, v_status
  FROM public.internal_stock_requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF v_company_id IS NULL OR v_company_id IS DISTINCT FROM public.get_auth_company_id() THEN
    RETURN json_build_object('success', false, 'error', 'Request not found');
  END IF;
  IF v_status <> 'partially_received' THEN
    RETURN json_build_object('success', false, 'error', 'Only partially received requests can allocate remaining');
  END IF;

  SELECT COUNT(*)::integer INTO v_open_shortage_count
  FROM public.internal_stock_request_discrepancies d
  WHERE d.request_id = p_request_id
    AND d.status = 'open';

  IF COALESCE(v_open_shortage_count, 0) > 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Resolve open sub-stock shortages before allocating remaining.'
    );
  END IF;

  v_main_loc_id := public.get_main_warehouse_location_id(v_company_id);
  IF v_main_loc_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Main warehouse location not found');
  END IF;

  v_dr_number := public.generate_dr_number(v_main_loc_id);
  IF v_dr_number IS NULL OR btrim(v_dr_number) = '' THEN
    RETURN json_build_object('success', false, 'error', 'Failed to generate DR number');
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_variant_id := NULLIF(v_line->>'variant_id', '')::uuid;
    v_qty := COALESCE((v_line->>'quantity')::integer, 0);
    IF v_variant_id IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT GREATEST(0, (i.delivered_quantity - i.received_quantity) - i.open_receive_quantity),
           i.open_receive_quantity
      INTO v_allocatable, v_open
    FROM public.internal_stock_request_items i
    WHERE i.request_id = p_request_id AND i.variant_id = v_variant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'Variant not on request');
    END IF;

    IF v_qty > v_allocatable THEN
      RETURN json_build_object(
        'success', false,
        'error', format('Cannot allocate more than %s for a line', v_allocatable)
      );
    END IF;

    v_reserve_lines := v_reserve_lines || jsonb_build_array(
      jsonb_build_object('variant_id', v_variant_id, 'quantity', v_qty)
    );
  END LOOP;

  IF jsonb_array_length(v_reserve_lines) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Nothing to allocate');
  END IF;

  PERFORM public.internal_stock_request_assert_main_available(v_company_id, v_reserve_lines);
  PERFORM public.internal_stock_request_reserve_main(
    v_company_id,
    p_request_id,
    v_reserve_lines,
    v_actor,
    COALESCE(nullif(btrim(COALESCE(p_note, '')), ''), 'Allocated remaining short for internal stock request')
  );

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_variant_id := NULLIF(v_line->>'variant_id', '')::uuid;
    v_qty := COALESCE((v_line->>'quantity')::integer, 0);
    IF v_variant_id IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    UPDATE public.internal_stock_request_items
    SET open_receive_quantity = open_receive_quantity + v_qty,
        updated_at = now()
    WHERE request_id = p_request_id AND variant_id = v_variant_id;

    v_history := v_history || jsonb_build_array(
      jsonb_build_object('variant_id', v_variant_id, 'quantity', v_qty)
    );
    v_total := v_total + v_qty;
  END LOOP;

  IF v_total <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Nothing to allocate');
  END IF;

  UPDATE public.internal_stock_requests
  SET rider_name = v_rider_name,
      rider_plate_number = v_rider_plate,
      rider_photo_url = v_rider_photo,
      rider_photo_path = nullif(btrim(COALESCE(p_rider_photo_path, '')), ''),
      dr_number = v_dr_number,
      updated_at = now()
  WHERE id = p_request_id;

  INSERT INTO public.internal_stock_request_events (
    request_id, event_type, note, lines,
    proof_image_url, proof_image_path, signature_url, signature_path,
    rider_name, rider_plate_number, rider_photo_url, rider_photo_path,
    dr_number,
    created_by
  ) VALUES (
    p_request_id,
    'remaining_released',
    COALESCE(nullif(btrim(COALESCE(p_note, '')), ''), format('Allocated %s unit(s) of remaining short', v_total)),
    v_history,
    p_proof_image_url,
    p_proof_image_path,
    p_signature_url,
    p_signature_path,
    v_rider_name,
    v_rider_plate,
    v_rider_photo,
    nullif(btrim(COALESCE(p_rider_photo_path, '')), ''),
    v_dr_number,
    v_actor
  );

  RETURN json_build_object(
    'success', true,
    'request_id', p_request_id,
    'allocated', v_total,
    'status', 'partially_received',
    'dr_number', v_dr_number
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.allocate_internal_stock_request_remaining(
  uuid, jsonb, text, text, text, text, text, uuid, text, text, text, text
) TO authenticated;

COMMENT ON FUNCTION public.allocate_internal_stock_request_remaining(
  uuid, jsonb, text, text, text, text, text, uuid, text, text, text, text
) IS
  'Unlock remaining short for partial receive; blocked while open sub-stock shortages exist.';
