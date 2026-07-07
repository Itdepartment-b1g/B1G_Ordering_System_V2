-- Physical count: finance is view-only and can read all warehouse hub companies (same as accounting).

-- Allow finance to read warehouse hub company rows for the picker.
DROP POLICY IF EXISTS "Finance can view warehouse hub companies" ON public.companies;
CREATE POLICY "Finance can view warehouse hub companies"
  ON public.companies FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'finance'
    )
    AND (
      role = 'Warehouse'
      OR company_account_type = 'Warehouse'
    )
  );

-- All active warehouse hubs a finance user may view physical counts for.
CREATE OR REPLACE FUNCTION public.get_finance_inventory_company_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(ARRAY_AGG(DISTINCT c.id), ARRAY[]::uuid[])
  FROM public.companies c
  WHERE c.status = 'active'
    AND (c.role = 'Warehouse' OR c.company_account_type = 'Warehouse');
$$;

GRANT EXECUTE ON FUNCTION public.get_finance_inventory_company_ids() TO authenticated;

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

  IF public.is_accounting()
     AND p_company_id = ANY(public.get_accounting_inventory_company_ids()) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'finance'
  ) AND p_company_id = ANY(public.get_finance_inventory_company_ids()) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

DROP POLICY IF EXISTS "Physical count sessions: finance select company"
  ON public.physical_count_sessions;
CREATE POLICY "Physical count sessions: finance select all warehouses"
  ON public.physical_count_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'finance'
    )
    AND company_id = ANY(public.get_finance_inventory_company_ids())
  );

DROP POLICY IF EXISTS "Physical count lines: finance select company"
  ON public.physical_count_lines;
CREATE POLICY "Physical count lines: finance select all warehouses"
  ON public.physical_count_lines FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'finance'
    )
    AND EXISTS (
      SELECT 1 FROM public.physical_count_sessions pcs
      WHERE pcs.id = physical_count_lines.session_id
        AND pcs.company_id = ANY(public.get_finance_inventory_company_ids())
    )
  );

DROP POLICY IF EXISTS "Warehouse locations: finance select own company"
  ON public.warehouse_locations;
CREATE POLICY "Warehouse locations: finance select all warehouses"
  ON public.warehouse_locations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'finance'
    )
    AND company_id = ANY(public.get_finance_inventory_company_ids())
  );

DROP POLICY IF EXISTS "Inventory batches: finance select own company"
  ON public.inventory_batches;
CREATE POLICY "Inventory batches: finance select all warehouses"
  ON public.inventory_batches FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'finance'
    )
    AND company_id = ANY(public.get_finance_inventory_company_ids())
  );

DROP POLICY IF EXISTS "Inventory batch lots: finance select own company"
  ON public.inventory_batch_lots;
CREATE POLICY "Inventory batch lots: finance select all warehouses"
  ON public.inventory_batch_lots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'finance'
    )
    AND company_id = ANY(public.get_finance_inventory_company_ids())
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
        AND (storage.foldername(name))[1]::uuid = ANY(public.get_executive_inventory_company_ids())
      )
      OR (
        public.is_accounting()
        AND (storage.foldername(name))[1]::uuid = ANY(public.get_accounting_inventory_company_ids())
      )
      OR (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.role = 'finance'
        )
        AND (storage.foldername(name))[1]::uuid = ANY(public.get_finance_inventory_company_ids())
      )
    )
  );

COMMENT ON FUNCTION public.get_finance_inventory_company_ids() IS
  'Active warehouse hub company IDs finance may view physical counts for.';
