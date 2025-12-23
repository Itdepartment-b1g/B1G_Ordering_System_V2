-- ============================================================================
-- CREATE VARIANT TYPES TABLE FOR FUTURE-PROOF TYPE MANAGEMENT
-- ============================================================================
-- This script:
-- 1. Creates a variant_types table to manage variant types dynamically
-- 2. Migrates existing CHECK constraint to foreign key reference
-- 3. Inserts default types (flavor, battery, POSM)
-- 4. Updates variants table to reference variant_types
-- Run this script in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- STEP 1: Create variant_types table
-- ============================================================================
CREATE TABLE IF NOT EXISTS variant_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT,
    color_code TEXT, -- For UI badge colors (e.g., 'blue', 'green', 'purple')
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_variant_types_company_id ON variant_types(company_id);
CREATE INDEX IF NOT EXISTS idx_variant_types_name ON variant_types(name);
CREATE INDEX IF NOT EXISTS idx_variant_types_is_active ON variant_types(is_active);
COMMENT ON TABLE variant_types IS 'Variant types per company - allows dynamic type management';

-- ============================================================================
-- STEP 2: Insert default types for existing companies
-- ============================================================================
-- Insert default types for each company
DO $$
DECLARE
    company_record RECORD;
BEGIN
    FOR company_record IN SELECT id FROM companies LOOP
        -- Insert Flavor type
        INSERT INTO variant_types (company_id, name, display_name, description, color_code, sort_order)
        VALUES (company_record.id, 'flavor', 'Flavor', 'Product flavor variants', 'blue', 1)
        ON CONFLICT (company_id, name) DO NOTHING;
        
        -- Insert Battery type
        INSERT INTO variant_types (company_id, name, display_name, description, color_code, sort_order)
        VALUES (company_record.id, 'battery', 'Battery', 'Battery/device variants', 'green', 2)
        ON CONFLICT (company_id, name) DO NOTHING;
        
        -- Insert POSM type
        INSERT INTO variant_types (company_id, name, display_name, description, color_code, sort_order)
        VALUES (company_record.id, 'POSM', 'POSM', 'Point of Sale Materials', 'purple', 3)
        ON CONFLICT (company_id, name) DO NOTHING;
    END LOOP;
END $$;

-- ============================================================================
-- STEP 3: Add variant_type_id column to variants table (nullable initially)
-- ============================================================================
ALTER TABLE variants ADD COLUMN IF NOT EXISTS variant_type_id UUID REFERENCES variant_types(id) ON DELETE RESTRICT;

-- ============================================================================
-- STEP 4: Migrate existing variant_type values to variant_type_id
-- ============================================================================
-- Update variants to reference variant_types based on their current variant_type value
UPDATE variants v
SET variant_type_id = vt.id
FROM variant_types vt
WHERE v.company_id = vt.company_id
  AND LOWER(v.variant_type) = LOWER(vt.name)
  AND v.variant_type_id IS NULL;

-- ============================================================================
-- STEP 5: Make variant_type_id NOT NULL and remove old variant_type column
-- ============================================================================
-- First, ensure all variants have a variant_type_id
-- If any variants don't have a type, assign them to 'flavor' as default
UPDATE variants v
SET variant_type_id = (
    SELECT id FROM variant_types vt 
    WHERE vt.company_id = v.company_id 
    AND LOWER(vt.name) = 'flavor' 
    LIMIT 1
)
WHERE v.variant_type_id IS NULL;

-- Now make it NOT NULL
ALTER TABLE variants ALTER COLUMN variant_type_id SET NOT NULL;

-- Drop the old CHECK constraint by recreating the column (PostgreSQL doesn't support dropping CHECK constraints directly)
-- Instead, we'll keep both columns for backward compatibility and add a trigger to sync them
-- OR we can create a view/function to get the type name

-- ============================================================================
-- STEP 6: Create trigger to keep variant_type in sync with variant_type_id
-- ============================================================================
-- Create a function to update variant_type from variant_type_id
CREATE OR REPLACE FUNCTION sync_variant_type_from_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.variant_type_id IS NOT NULL THEN
        SELECT name INTO NEW.variant_type
        FROM variant_types
        WHERE id = NEW.variant_type_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS sync_variant_type_trigger ON variants;
CREATE TRIGGER sync_variant_type_trigger
    BEFORE INSERT OR UPDATE OF variant_type_id ON variants
    FOR EACH ROW
    EXECUTE FUNCTION sync_variant_type_from_id();

-- ============================================================================
-- STEP 7: Enable RLS on variant_types table
-- ============================================================================
ALTER TABLE variant_types ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 8: Create RLS policies for variant_types
-- ============================================================================
-- Policy: Users can view variant types in their company
DROP POLICY IF EXISTS "Users can view variant types in their company" ON variant_types;
CREATE POLICY "Users can view variant types in their company"
    ON variant_types FOR SELECT
    USING (company_id = get_my_company_id());

-- Policy: Admins and super admins can insert variant types
DROP POLICY IF EXISTS "Admins can insert variant types in their company" ON variant_types;
CREATE POLICY "Admins can insert variant types in their company"
    ON variant_types FOR INSERT
    WITH CHECK (
        company_id = get_my_company_id()
        AND is_admin_or_super_admin()
    );

-- Policy: Admins and super admins can update variant types
DROP POLICY IF EXISTS "Admins can update variant types in their company" ON variant_types;
CREATE POLICY "Admins can update variant types in their company"
    ON variant_types FOR UPDATE
    USING (
        company_id = get_my_company_id()
        AND is_admin_or_super_admin()
    )
    WITH CHECK (
        company_id = get_my_company_id()
        AND is_admin_or_super_admin()
    );

-- Policy: Admins and super admins can delete variant types (only if not in use)
DROP POLICY IF EXISTS "Admins can delete variant types in their company" ON variant_types;
CREATE POLICY "Admins can delete variant types in their company"
    ON variant_types FOR DELETE
    USING (
        company_id = get_my_company_id()
        AND is_admin_or_super_admin()
        -- Additional check: ensure no variants are using this type
        AND NOT EXISTS (
            SELECT 1 FROM variants 
            WHERE variant_type_id = variant_types.id
        )
    );

-- ============================================================================
-- STEP 9: Create trigger to update updated_at timestamp
-- ============================================================================
DROP TRIGGER IF EXISTS update_variant_types_updated_at ON variant_types;
CREATE TRIGGER update_variant_types_updated_at
    BEFORE UPDATE ON variant_types
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- VERIFICATION QUERIES (Optional - uncomment to verify)
-- ============================================================================
-- Check variant types created
-- SELECT * FROM variant_types ORDER BY company_id, sort_order;

-- Check variants with their types
-- SELECT v.id, v.name, v.variant_type, vt.name as type_name, vt.display_name
-- FROM variants v
-- LEFT JOIN variant_types vt ON v.variant_type_id = vt.id
-- LIMIT 10;

