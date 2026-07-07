-- Physical count: extend access to executive, accounting (submit + view), and finance (view-only).

-- ---------------------------------------------------------------------------
-- 1) Helper functions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_accounting()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'accounting'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_accounting() TO authenticated;

CREATE OR REPLACE FUNCTION public.can_submit_physical_count(p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF public.is_system_administrator() THEN
    RETURN true;
  END IF;

  IF public.is_accounting()
     AND p_company_id = public.get_auth_company_id() THEN
    RETURN true;
  END IF;

  IF public.is_executive()
     AND p_company_id = ANY(public.get_my_executive_company_ids()) THEN
    RETURN true;
  END IF;

  IF public.is_warehouse()
     AND p_company_id = public.get_auth_company_id()
     AND (
       public.is_main_warehouse_user(v_actor)
       OR EXISTS (
         SELECT 1 FROM public.warehouse_location_users wlu
         WHERE wlu.user_id = v_actor
           AND wlu.location_id IN (
             SELECT wl.id FROM public.warehouse_locations wl
             WHERE wl.company_id = p_company_id
           )
       )
     ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_submit_physical_count(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_view_physical_count(p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.can_submit_physical_count(p_company_id) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'finance'
      AND company_id = p_company_id
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_view_physical_count(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) RLS on physical count tables
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Physical count sessions: finance accounting select company"
  ON public.physical_count_sessions;
CREATE POLICY "Physical count sessions: finance accounting select company"
  ON public.physical_count_sessions FOR SELECT
  USING (
    (public.is_accounting() OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'finance'
    ))
    AND company_id = public.get_auth_company_id()
  );

DROP POLICY IF EXISTS "Physical count sessions: executive select assigned"
  ON public.physical_count_sessions;
CREATE POLICY "Physical count sessions: executive select assigned"
  ON public.physical_count_sessions FOR SELECT
  USING (
    public.is_executive()
    AND company_id = ANY(public.get_my_executive_company_ids())
  );

DROP POLICY IF EXISTS "Physical count lines: finance accounting select company"
  ON public.physical_count_lines;
CREATE POLICY "Physical count lines: finance accounting select company"
  ON public.physical_count_lines FOR SELECT
  USING (
    (public.is_accounting() OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'finance'
    ))
    AND EXISTS (
      SELECT 1 FROM public.physical_count_sessions pcs
      WHERE pcs.id = physical_count_lines.session_id
        AND pcs.company_id = public.get_auth_company_id()
    )
  );

DROP POLICY IF EXISTS "Physical count lines: executive select assigned"
  ON public.physical_count_lines;
CREATE POLICY "Physical count lines: executive select assigned"
  ON public.physical_count_lines FOR SELECT
  USING (
    public.is_executive()
    AND EXISTS (
      SELECT 1 FROM public.physical_count_sessions pcs
      WHERE pcs.id = physical_count_lines.session_id
        AND pcs.company_id = ANY(public.get_my_executive_company_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- 3) Supporting inventory reads for accounting + executive (main-warehouse scope)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Warehouse locations: accounting select own company"
  ON public.warehouse_locations;
CREATE POLICY "Warehouse locations: accounting select own company"
  ON public.warehouse_locations FOR SELECT
  USING (
    public.is_accounting()
    AND company_id = public.get_auth_company_id()
  );

DROP POLICY IF EXISTS "Warehouse locations: executive select assigned"
  ON public.warehouse_locations;
CREATE POLICY "Warehouse locations: executive select assigned"
  ON public.warehouse_locations FOR SELECT
  USING (
    public.is_executive()
    AND company_id = ANY(public.get_my_executive_company_ids())
  );

DROP POLICY IF EXISTS "Inventory batches: accounting select own company"
  ON public.inventory_batches;
CREATE POLICY "Inventory batches: accounting select own company"
  ON public.inventory_batches FOR SELECT
  USING (
    public.is_accounting()
    AND company_id = public.get_auth_company_id()
  );

DROP POLICY IF EXISTS "Inventory batches: executive select assigned"
  ON public.inventory_batches;
CREATE POLICY "Inventory batches: executive select assigned"
  ON public.inventory_batches FOR SELECT
  USING (
    public.is_executive()
    AND company_id = ANY(public.get_my_executive_company_ids())
  );

DROP POLICY IF EXISTS "Inventory batch lots: accounting select own company"
  ON public.inventory_batch_lots;
CREATE POLICY "Inventory batch lots: accounting select own company"
  ON public.inventory_batch_lots FOR SELECT
  USING (
    public.is_accounting()
    AND company_id = public.get_auth_company_id()
  );

DROP POLICY IF EXISTS "Inventory batch lots: executive select assigned"
  ON public.inventory_batch_lots;
CREATE POLICY "Inventory batch lots: executive select assigned"
  ON public.inventory_batch_lots FOR SELECT
  USING (
    public.is_executive()
    AND company_id = ANY(public.get_my_executive_company_ids())
  );

-- Finance view-only: read locations and batches for history filters
DROP POLICY IF EXISTS "Warehouse locations: finance select own company"
  ON public.warehouse_locations;
CREATE POLICY "Warehouse locations: finance select own company"
  ON public.warehouse_locations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'finance'
    )
    AND company_id = public.get_auth_company_id()
  );

DROP POLICY IF EXISTS "Inventory batches: finance select own company"
  ON public.inventory_batches;
CREATE POLICY "Inventory batches: finance select own company"
  ON public.inventory_batches FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'finance'
    )
    AND company_id = public.get_auth_company_id()
  );

-- ---------------------------------------------------------------------------
-- 4) Storage policies for signatures
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Warehouse physical count: upload signatures" ON storage.objects;
CREATE POLICY "Warehouse physical count: upload signatures"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'warehouse-physical-count-signatures'
    AND (storage.foldername(name))[1] IN (
      SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'warehouse'
    )
  );

DROP POLICY IF EXISTS "Physical count: accounting upload signatures" ON storage.objects;
CREATE POLICY "Physical count: accounting upload signatures"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'warehouse-physical-count-signatures'
    AND (storage.foldername(name))[1] = public.get_auth_company_id()::text
    AND public.is_accounting()
  );

DROP POLICY IF EXISTS "Physical count: executive upload signatures" ON storage.objects;
CREATE POLICY "Physical count: executive upload signatures"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'warehouse-physical-count-signatures'
    AND (storage.foldername(name))[1]::uuid = ANY(public.get_my_executive_company_ids())
    AND public.is_executive()
  );

DROP POLICY IF EXISTS "Warehouse physical count: view company signatures" ON storage.objects;
CREATE POLICY "Warehouse physical count: view company signatures"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'warehouse-physical-count-signatures'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
      )
      OR (
        public.is_executive()
        AND (storage.foldername(name))[1]::uuid = ANY(public.get_my_executive_company_ids())
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 5) submit_physical_count RPC — use can_submit_physical_count
-- ---------------------------------------------------------------------------
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

  -- Sub-warehouse users may only count at their assigned location.
  IF public.is_warehouse()
     AND NOT public.is_main_warehouse_user(v_actor)
     AND p_warehouse_location_id IS DISTINCT FROM public.get_warehouse_location_id(v_actor) THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized to submit physical count at this location');
  END IF;

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

    INSERT INTO public.physical_count_lines (
      session_id, lot_id, variant_id, brand_name, variant_name,
      system_qty_snapshot, physical_qty, variance, adjustment_id, expiration_date
    ) VALUES (
      v_session_id, v_lot_id, v_variant_id, v_brand_name, v_variant_name,
      v_system_qty, v_physical_qty, v_variance, NULL, v_expiration_date
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

COMMENT ON FUNCTION public.can_submit_physical_count(uuid) IS
  'Warehouse (main or own location), accounting, executive (assigned company), or sysadmin.';
COMMENT ON FUNCTION public.can_view_physical_count(uuid) IS
  'can_submit_physical_count plus finance view-only for own company.';
