-- Allow tenant users (super_admin/admin) to view the linked warehouse hub catalog
-- (brands, variants, variant_types) for internal transfer PO item selection.
--
-- Uses get_linked_warehouse_company_id() to avoid relying on selecting the warehouse profile row.

-- ---------------------------------------------------------------------------
-- brands: tenant select linked hub
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Brands: tenant select linked hub" ON public.brands;
CREATE POLICY "Brands: tenant select linked hub"
  ON public.brands FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = ANY (ARRAY['super_admin'::text, 'admin'::text])
    )
    AND public.get_linked_warehouse_company_id() IS NOT NULL
    AND brands.company_id = public.get_linked_warehouse_company_id()
  );

-- ---------------------------------------------------------------------------
-- variants: tenant select linked hub (via variants.company_id)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Variants: tenant select linked hub" ON public.variants;
CREATE POLICY "Variants: tenant select linked hub"
  ON public.variants FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = ANY (ARRAY['super_admin'::text, 'admin'::text])
    )
    AND public.get_linked_warehouse_company_id() IS NOT NULL
    AND variants.company_id = public.get_linked_warehouse_company_id()
  );

-- ---------------------------------------------------------------------------
-- variant_types: tenant select linked hub
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Variant types: tenant select linked hub" ON public.variant_types;
CREATE POLICY "Variant types: tenant select linked hub"
  ON public.variant_types FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = ANY (ARRAY['super_admin'::text, 'admin'::text])
    )
    AND public.get_linked_warehouse_company_id() IS NOT NULL
    AND variant_types.company_id = public.get_linked_warehouse_company_id()
  );

