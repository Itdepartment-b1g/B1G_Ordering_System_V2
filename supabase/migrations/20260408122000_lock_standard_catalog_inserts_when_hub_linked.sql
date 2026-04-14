-- When a client company is linked to a warehouse hub, the standard tenant should not be able
-- to create new brands/variants. Warehouse users manage the catalog.

-- Update brands insert policy
DROP POLICY IF EXISTS "Admins and managers can insert brands" ON public.brands;
CREATE POLICY "Admins and managers can insert brands"
ON public.brands
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.company_id = brands.company_id
      AND p.role IN ('admin', 'super_admin', 'manager', 'warehouse')
      AND (
        p.role = 'warehouse'
        OR NOT EXISTS (
          SELECT 1
          FROM public.warehouse_company_assignments wca
          WHERE wca.client_company_id = brands.company_id
        )
      )
  )
);

-- Update variants insert policy
DROP POLICY IF EXISTS "Admins and managers can insert variants" ON public.variants;
CREATE POLICY "Admins and managers can insert variants"
ON public.variants
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.brands
    JOIN public.profiles p ON p.company_id = public.brands.company_id
    WHERE public.brands.id = variants.brand_id
      AND p.id = auth.uid()
      AND p.role IN ('admin', 'super_admin', 'manager', 'warehouse')
      AND (
        p.role = 'warehouse'
        OR NOT EXISTS (
          SELECT 1
          FROM public.warehouse_company_assignments wca
          WHERE wca.client_company_id = public.brands.company_id
        )
      )
  )
);

