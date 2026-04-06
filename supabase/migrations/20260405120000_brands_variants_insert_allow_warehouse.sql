-- Allow warehouse role to insert brands and variants in their company (same as admin/manager policy scope).

DROP POLICY IF EXISTS "Admins and managers can insert brands" ON brands;
CREATE POLICY "Admins and managers can insert brands"
ON brands
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.company_id = brands.company_id
        AND profiles.role IN ('admin', 'super_admin', 'manager', 'warehouse')
    )
);

DROP POLICY IF EXISTS "Admins and managers can insert variants" ON variants;
CREATE POLICY "Admins and managers can insert variants"
ON variants
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM brands
        JOIN profiles ON profiles.company_id = brands.company_id
        WHERE brands.id = variants.brand_id
        AND profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin', 'manager', 'warehouse')
    )
);
