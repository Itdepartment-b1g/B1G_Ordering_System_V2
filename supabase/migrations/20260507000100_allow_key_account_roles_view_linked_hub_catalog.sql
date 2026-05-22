-- Allow Key Account roles (sales_admin, sales_director, key_account_manager)
-- to view linked warehouse hub catalog + stock for internal transfer ordering.
--
-- This mirrors existing "tenant select linked hub" policies that were previously
-- limited to super_admin/admin/etc. Key Account users are tenant users too.

-- ---------------------------------------------------------------------------
-- brands: key account roles select linked hub
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Brands: tenant select linked hub" ON public.brands;
CREATE POLICY "Brands: tenant select linked hub"
  ON public.brands FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = ANY (ARRAY[
          'super_admin'::text,
          'admin'::text,
          'sales_admin'::text,
          'sales_director'::text,
          'key_account_manager'::text
        ])
    )
    AND public.get_linked_warehouse_company_id() IS NOT NULL
    AND brands.company_id = public.get_linked_warehouse_company_id()
  );

-- ---------------------------------------------------------------------------
-- variants: key account roles select linked hub
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Variants: tenant select linked hub" ON public.variants;
CREATE POLICY "Variants: tenant select linked hub"
  ON public.variants FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = ANY (ARRAY[
          'super_admin'::text,
          'admin'::text,
          'sales_admin'::text,
          'sales_director'::text,
          'key_account_manager'::text
        ])
    )
    AND public.get_linked_warehouse_company_id() IS NOT NULL
    AND variants.company_id = public.get_linked_warehouse_company_id()
  );

-- ---------------------------------------------------------------------------
-- variant_types: key account roles select linked hub
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Variant types: tenant select linked hub" ON public.variant_types;
CREATE POLICY "Variant types: tenant select linked hub"
  ON public.variant_types FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = ANY (ARRAY[
          'super_admin'::text,
          'admin'::text,
          'sales_admin'::text,
          'sales_director'::text,
          'key_account_manager'::text
        ])
    )
    AND public.get_linked_warehouse_company_id() IS NOT NULL
    AND variant_types.company_id = public.get_linked_warehouse_company_id()
  );

-- ---------------------------------------------------------------------------
-- main_inventory: allow key account roles to view linked hub main inventory
-- (needed to compute available stock for main warehouse location)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Tenant can view linked hub main inventory" ON public.main_inventory;
CREATE POLICY "Tenant can view linked hub main inventory"
  ON public.main_inventory FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = ANY (ARRAY[
          'super_admin'::text,
          'admin'::text,
          'manager'::text,
          'team_leader'::text,
          'mobile_sales'::text,
          'sales_admin'::text,
          'sales_director'::text,
          'key_account_manager'::text
        ])
    )
    AND public.get_linked_warehouse_company_id() IS NOT NULL
    AND main_inventory.company_id = public.get_linked_warehouse_company_id()
  );

-- Keep grants consistent with previous migration (safe if already applied)
GRANT SELECT (id, company_id, variant_id, stock, allocated_stock) ON public.main_inventory TO authenticated;

-- ---------------------------------------------------------------------------
-- warehouse_location_inventory: allow key account roles to view linked hub per-location inventory
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Tenant can view linked hub location inventory" ON public.warehouse_location_inventory;
CREATE POLICY "Tenant can view linked hub location inventory"
  ON public.warehouse_location_inventory FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = ANY (ARRAY[
          'super_admin'::text,
          'admin'::text,
          'manager'::text,
          'team_leader'::text,
          'mobile_sales'::text,
          'sales_admin'::text,
          'sales_director'::text,
          'key_account_manager'::text
        ])
    )
    AND public.get_linked_warehouse_company_id() IS NOT NULL
    AND warehouse_location_inventory.company_id = public.get_linked_warehouse_company_id()
  );

