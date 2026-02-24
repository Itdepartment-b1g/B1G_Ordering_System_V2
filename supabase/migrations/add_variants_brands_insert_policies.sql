-- Migration: Add INSERT policies for brands and variants tables
-- This allows admins and managers to create new brands and variants during Purchase Order creation

-- Enable RLS on variants if not already enabled (safety check)
ALTER TABLE variants ENABLE ROW LEVEL SECURITY;

-- Enable RLS on brands if not already enabled (safety check)
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;

-- Policy: Allow admin and manager roles to insert brands for their company
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
        AND profiles.role IN ('admin', 'super_admin', 'manager')
    )
);

-- Policy: Allow admin and manager roles to insert variants for brands in their company
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
        AND profiles.role IN ('admin', 'super_admin', 'manager')
    )
);

-- Also ensure SELECT policies exist for both tables (for reading during PO creation)
DROP POLICY IF EXISTS "Users can read brands from their company" ON brands;
CREATE POLICY "Users can read brands from their company"
ON brands
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.company_id = brands.company_id
    )
);

DROP POLICY IF EXISTS "Users can read variants from their company brands" ON variants;
CREATE POLICY "Users can read variants from their company brands"
ON variants
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM brands
        JOIN profiles ON profiles.company_id = brands.company_id
        WHERE brands.id = variants.brand_id
        AND profiles.id = auth.uid()
    )
);
