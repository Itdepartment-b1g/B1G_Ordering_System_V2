-- Prevent tenants from inserting variants onto another company's brand
-- (e.g. warehouse hub brands still visible via "select via own purchase order items").
-- Also require brand.company_id to match variants.company_id for super_admin inserts.

-- ---------------------------------------------------------------------------
-- 1) Tighten loose "company_id only" insert policy
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert variants in their company" ON public.variants;
CREATE POLICY "Users can insert variants in their company"
ON public.variants
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = public.get_auth_company_id()
  AND EXISTS (
    SELECT 1
    FROM public.brands b
    WHERE b.id = variants.brand_id
      AND b.company_id = public.get_auth_company_id()
  )
);

-- ---------------------------------------------------------------------------
-- 2) Super admin insert must also own the brand
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Super admin can insert variants in their company" ON public.variants;
CREATE POLICY "Super admin can insert variants in their company"
ON public.variants
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_super_admin()
  AND company_id = public.get_super_admin_company_id()
  AND EXISTS (
    SELECT 1
    FROM public.brands b
    WHERE b.id = variants.brand_id
      AND b.company_id = public.get_super_admin_company_id()
  )
);
