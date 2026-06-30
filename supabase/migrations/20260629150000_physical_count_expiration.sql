-- Physical count: lot-level expiration snapshots and FEFO-compatible lot bootstrap.

ALTER TABLE public.physical_count_lines
  ADD COLUMN IF NOT EXISTS expiration_date date;

COMMENT ON COLUMN public.physical_count_lines.expiration_date IS
  'Expiration date snapshot from inventory_batch_lots at count time (nullable).';

CREATE OR REPLACE FUNCTION public.submit_physical_count(
  p_warehouse_location_id uuid,
  p_batch_id uuid,
  p_lines jsonb,
  p_signature_url text,
  p_signature_path text,
  p_notes text DEFAULT NULL,
  p_performed_by uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid;
  v_company_id uuid;
  v_session_id uuid;
  v_line jsonb;
  v_variant_id uuid;
  v_lot_id uuid;
  v_physical_qty integer;
  v_system_qty integer;
  v_variance integer;
  v_brand_name text;
  v_variant_name text;
  v_expiration_date date;
  v_adjust_result json;
  v_adjustment_id uuid;
  v_adjustments_applied integer := 0;
  v_batch_received_at timestamptz;
  v_new_lot_id uuid;
BEGIN
  v_actor := COALESCE(p_performed_by, auth.uid());

  IF p_signature_url IS NULL OR length(trim(p_signature_url)) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Signature is required');
  END IF;

  IF p_signature_path IS NULL OR length(trim(p_signature_path)) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Signature path is required');
  END IF;

  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'At least one count line is required');
  END IF;

  SELECT wl.company_id INTO v_company_id
  FROM public.warehouse_locations wl
  WHERE wl.id = p_warehouse_location_id;

  IF v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Warehouse location not found');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.inventory_batches ib
    WHERE ib.id = p_batch_id AND ib.company_id = v_company_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Batch not found');
  END IF;

  IF NOT (
    public.is_system_administrator()
    OR (
      public.is_warehouse()
      AND v_company_id = public.get_auth_company_id()
      AND (
        public.is_main_warehouse_user(v_actor)
        OR p_warehouse_location_id = public.get_warehouse_location_id(v_actor)
      )
    )
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized to submit physical count at this location');
  END IF;

  SELECT ib.received_at INTO v_batch_received_at
  FROM public.inventory_batches ib
  WHERE ib.id = p_batch_id;

  INSERT INTO public.physical_count_sessions (
    company_id, warehouse_location_id, batch_id,
    performed_by, signature_url, signature_path, notes, status
  ) VALUES (
    v_company_id, p_warehouse_location_id, p_batch_id,
    v_actor, trim(p_signature_url), trim(p_signature_path), p_notes, 'submitted'
  )
  RETURNING id INTO v_session_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_variant_id := (v_line->>'variant_id')::uuid;
    v_lot_id := NULLIF(v_line->>'lot_id', '')::uuid;
    v_physical_qty := (v_line->>'physical_qty')::integer;
    v_system_qty := COALESCE((v_line->>'system_qty_snapshot')::integer, 0);
    v_brand_name := COALESCE(v_line->>'brand_name', '');
    v_variant_name := COALESCE(v_line->>'variant_name', '');
    v_expiration_date := NULLIF(trim(v_line->>'expiration_date'), '')::date;

    IF v_variant_id IS NULL THEN
      RAISE EXCEPTION 'Each line must include variant_id';
    END IF;

    IF v_physical_qty IS NULL OR v_physical_qty < 0 THEN
      RAISE EXCEPTION 'Physical quantity must be a non-negative integer';
    END IF;

    IF v_system_qty < 0 THEN
      RAISE EXCEPTION 'System quantity snapshot must be non-negative';
    END IF;

    IF v_brand_name = '' OR v_variant_name = '' THEN
      SELECT b.name, v.name
      INTO v_brand_name, v_variant_name
      FROM public.variants v
      JOIN public.brands b ON b.id = v.brand_id
      WHERE v.id = v_variant_id AND v.company_id = v_company_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Variant not found: %', v_variant_id;
      END IF;
    END IF;

    IF v_lot_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.inventory_batch_lots ibl
        WHERE ibl.id = v_lot_id
          AND ibl.batch_id = p_batch_id
          AND ibl.warehouse_location_id = p_warehouse_location_id
          AND ibl.variant_id = v_variant_id
          AND ibl.company_id = v_company_id
      ) THEN
        RAISE EXCEPTION 'Invalid lot for batch, location, and variant';
      END IF;

      IF v_expiration_date IS NULL THEN
        SELECT ibl.expiration_date INTO v_expiration_date
        FROM public.inventory_batch_lots ibl
        WHERE ibl.id = v_lot_id;
      END IF;
    END IF;

    v_variance := v_physical_qty - v_system_qty;
    v_adjustment_id := NULL;

    IF v_variance != 0 THEN
      IF v_variance < 0 AND v_lot_id IS NULL THEN
        RAISE EXCEPTION 'Cannot remove stock without a batch lot for variant %', v_variant_name;
      END IF;

      IF v_variance > 0 AND v_lot_id IS NULL THEN
        v_new_lot_id := public.merge_inventory_batch_lot_at_location(
          v_company_id,
          p_batch_id,
          v_variant_id,
          p_warehouse_location_id,
          0,
          COALESCE(v_batch_received_at, now()),
          NULL,
          v_expiration_date,
          NULL
        );
        v_lot_id := v_new_lot_id;
      END IF;

      v_adjust_result := public.apply_warehouse_stock_adjustment(
        p_warehouse_location_id,
        v_variant_id,
        v_variance,
        'Cycle count correction',
        'Physical count session ' || v_session_id::text,
        v_actor,
        v_lot_id
      );

      IF NOT COALESCE((v_adjust_result->>'success')::boolean, false) THEN
        RAISE EXCEPTION 'Adjustment failed for %: %',
          v_variant_name,
          COALESCE(v_adjust_result->>'error', 'Unknown error');
      END IF;

      v_adjustment_id := (v_adjust_result->>'adjustment_id')::uuid;
      v_adjustments_applied := v_adjustments_applied + 1;
    END IF;

    INSERT INTO public.physical_count_lines (
      session_id, lot_id, variant_id, brand_name, variant_name,
      system_qty_snapshot, physical_qty, variance, adjustment_id, expiration_date
    ) VALUES (
      v_session_id, v_lot_id, v_variant_id, v_brand_name, v_variant_name,
      v_system_qty, v_physical_qty, v_variance, v_adjustment_id, v_expiration_date
    );
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'session_id', v_session_id,
    'adjustments_applied', v_adjustments_applied
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_physical_count(uuid, uuid, jsonb, text, text, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.submit_physical_count(uuid, uuid, jsonb, text, text, text, uuid) IS
  'Submit a signed physical count session; lines are lot-level (variant + expiration). Applies cycle count adjustments for variances.';
