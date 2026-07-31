-- Physical count lines: persist box-based count breakdown for audit.

ALTER TABLE public.physical_count_lines
  ADD COLUMN IF NOT EXISTS box_count integer,
  ADD COLUMN IF NOT EXISTS units_per_box integer;

ALTER TABLE public.physical_count_lines
  DROP CONSTRAINT IF EXISTS physical_count_lines_box_count_check;

ALTER TABLE public.physical_count_lines
  ADD CONSTRAINT physical_count_lines_box_count_check
  CHECK (box_count IS NULL OR box_count >= 0);

ALTER TABLE public.physical_count_lines
  DROP CONSTRAINT IF EXISTS physical_count_lines_units_per_box_check;

ALTER TABLE public.physical_count_lines
  ADD CONSTRAINT physical_count_lines_units_per_box_check
  CHECK (units_per_box IS NULL OR units_per_box >= 0);

COMMENT ON COLUMN public.physical_count_lines.box_count IS
  'Number of boxes counted for this line (optional audit breakdown).';
COMMENT ON COLUMN public.physical_count_lines.units_per_box IS
  'Units per box for this line (optional audit breakdown).';

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
  v_performer_name text;
  v_line jsonb;
  v_variant_id uuid;
  v_lot_id uuid;
  v_physical_qty integer;
  v_system_qty integer;
  v_variance integer;
  v_brand_name text;
  v_variant_name text;
  v_expiration_date date;
  v_box_count integer;
  v_units_per_box integer;
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

  IF NOT public.can_submit_physical_count(v_company_id) THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized to submit physical count at this location');
  END IF;

  IF public.is_warehouse()
     AND NOT public.is_main_warehouse_user(v_actor)
     AND p_warehouse_location_id IS DISTINCT FROM public.get_warehouse_location_id(v_actor) THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized to submit physical count at this location');
  END IF;

  SELECT NULLIF(trim(p.full_name), '')
  INTO v_performer_name
  FROM public.profiles p
  WHERE p.id = v_actor;

  INSERT INTO public.physical_count_sessions (
    company_id, warehouse_location_id, batch_id,
    performed_by, performed_by_name, signature_url, signature_path, notes, status
  ) VALUES (
    v_company_id, p_warehouse_location_id, p_batch_id,
    v_actor, COALESCE(v_performer_name, 'Unknown'),
    trim(p_signature_url), trim(p_signature_path), p_notes, 'submitted'
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
    v_box_count := (v_line->>'box_count')::integer;
    v_units_per_box := (v_line->>'units_per_box')::integer;

    IF v_variant_id IS NULL THEN
      RAISE EXCEPTION 'Each line must include variant_id';
    END IF;

    IF v_physical_qty IS NULL OR v_physical_qty < 0 THEN
      RAISE EXCEPTION 'Physical quantity must be a non-negative integer';
    END IF;

    IF v_system_qty < 0 THEN
      RAISE EXCEPTION 'System quantity snapshot must be non-negative';
    END IF;

    IF v_box_count IS NULL OR v_units_per_box IS NULL OR v_box_count < 0 OR v_units_per_box < 0 THEN
      RAISE EXCEPTION 'Each line must include non-negative box_count and units_per_box';
    END IF;

    IF v_physical_qty <> v_box_count * v_units_per_box THEN
      RAISE EXCEPTION 'Physical quantity must equal box_count × units_per_box';
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

    INSERT INTO public.physical_count_lines (
      session_id, lot_id, variant_id, brand_name, variant_name,
      system_qty_snapshot, physical_qty, variance, adjustment_id, expiration_date,
      box_count, units_per_box
    ) VALUES (
      v_session_id, v_lot_id, v_variant_id, v_brand_name, v_variant_name,
      v_system_qty, v_physical_qty, v_variance, NULL, v_expiration_date,
      v_box_count, v_units_per_box
    );
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'session_id', v_session_id
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_physical_count(uuid, uuid, jsonb, text, text, text, uuid) TO authenticated;
