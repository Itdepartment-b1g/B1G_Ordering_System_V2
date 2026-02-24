-- ============================================================================
-- ADD SHOP TYPE TO CLIENTS
-- ============================================================================
-- This migration adds shop type categorization to clients
-- Default types: Vape Shop, Sari-Sari Store, Convenience Store
-- Custom types can be added per company and are visible to all users in that company
-- ============================================================================

-- 1. Create shop_types table to store custom shop types
CREATE TABLE IF NOT EXISTS shop_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    type_name TEXT NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    UNIQUE(company_id, type_name)
);

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_shop_types_company_id ON shop_types(company_id);
CREATE INDEX IF NOT EXISTS idx_shop_types_is_default ON shop_types(is_default);

COMMENT ON TABLE shop_types IS 'Stores shop type categories for clients, including default and custom types per company';

-- 2. Add shop_type column to clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS shop_type TEXT;

-- Add index for filtering by shop_type
CREATE INDEX IF NOT EXISTS idx_clients_shop_type ON clients(shop_type);

-- 3. Insert default shop types for all existing companies
DO $$
DECLARE
    company_record RECORD;
BEGIN
    FOR company_record IN SELECT id FROM companies LOOP
        -- Insert default types if they don't exist
        INSERT INTO shop_types (company_id, type_name, is_default)
        VALUES 
            (company_record.id, 'Vape Shop', TRUE),
            (company_record.id, 'Sari-Sari Store', TRUE),
            (company_record.id, 'Convenience Store', TRUE)
        ON CONFLICT (company_id, type_name) DO NOTHING;
    END LOOP;
END $$;

-- 4. Create function to auto-insert default shop types for new companies
CREATE OR REPLACE FUNCTION insert_default_shop_types()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO shop_types (company_id, type_name, is_default)
    VALUES 
        (NEW.id, 'Vape Shop', TRUE),
        (NEW.id, 'Sari-Sari Store', TRUE),
        (NEW.id, 'Convenience Store', TRUE)
    ON CONFLICT (company_id, type_name) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Create trigger to auto-insert default shop types when new company is created
DROP TRIGGER IF EXISTS trigger_insert_default_shop_types ON companies;
CREATE TRIGGER trigger_insert_default_shop_types
    AFTER INSERT ON companies
    FOR EACH ROW
    EXECUTE FUNCTION insert_default_shop_types();

-- 6. Set up RLS (Row Level Security) for shop_types table
ALTER TABLE shop_types ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view shop types from their own company
CREATE POLICY "Users can view their company shop types"
    ON shop_types FOR SELECT
    USING (
        company_id IN (
            SELECT company_id FROM profiles WHERE id = auth.uid()
        )
    );

-- Policy: Users can insert new shop types for their company
CREATE POLICY "Users can insert shop types for their company"
    ON shop_types FOR INSERT
    WITH CHECK (
        company_id IN (
            SELECT company_id FROM profiles WHERE id = auth.uid()
        )
    );

-- Policy: Admins can update shop types
CREATE POLICY "Admins can update shop types"
    ON shop_types FOR UPDATE
    USING (
        company_id IN (
            SELECT company_id FROM profiles 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'super_admin')
        )
    );

-- Policy: Admins can delete non-default shop types
CREATE POLICY "Admins can delete custom shop types"
    ON shop_types FOR DELETE
    USING (
        is_default = FALSE
        AND company_id IN (
            SELECT company_id FROM profiles 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'super_admin')
        )
    );

-- 7. Add comment
COMMENT ON COLUMN clients.shop_type IS 'Type of shop (e.g., Vape Shop, Sari-Sari Store, Convenience Store, or custom type)';

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Successfully added shop type categorization to clients table';
END $$;
