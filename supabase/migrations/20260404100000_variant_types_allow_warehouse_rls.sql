-- Allow warehouse users to manage variant_types for their own company (inventory tenant),
-- same scope as admin/super_admin: company_id must equal get_my_company_id().

DROP POLICY IF EXISTS "Admins can insert variant types in their company" ON public.variant_types;
CREATE POLICY "Admins can insert variant types in their company"
    ON public.variant_types FOR INSERT
    WITH CHECK (
        company_id = public.get_my_company_id()
        AND (public.is_admin_or_super_admin() OR public.is_warehouse())
    );

DROP POLICY IF EXISTS "Admins can update variant types in their company" ON public.variant_types;
CREATE POLICY "Admins can update variant types in their company"
    ON public.variant_types FOR UPDATE
    USING (
        company_id = public.get_my_company_id()
        AND (public.is_admin_or_super_admin() OR public.is_warehouse())
    )
    WITH CHECK (
        company_id = public.get_my_company_id()
        AND (public.is_admin_or_super_admin() OR public.is_warehouse())
    );

DROP POLICY IF EXISTS "Admins can delete variant types in their company" ON public.variant_types;
CREATE POLICY "Admins can delete variant types in their company"
    ON public.variant_types FOR DELETE
    USING (
        company_id = public.get_my_company_id()
        AND (public.is_admin_or_super_admin() OR public.is_warehouse())
        AND NOT EXISTS (
            SELECT 1 FROM public.variants
            WHERE variants.variant_type_id = variant_types.id
        )
    );
