-- ============================================================================
-- CREATE COMPANY PAYMENT SETTINGS TABLE
-- ============================================================================
-- This migration creates a company-specific payment settings system
-- Stores bank accounts, GCash info, and payment method toggles per company
-- ============================================================================

-- Ensure UUID extension is enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create company_payment_settings table
CREATE TABLE IF NOT EXISTS company_payment_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
    
    -- Bank accounts stored as JSONB array
    -- Structure: [{"name": "Unionbank", "account_number": "123", "enabled": true, "qr_code_url": "https://..."}]
    bank_accounts JSONB DEFAULT '[]'::jsonb,
    
    -- GCash configuration
    gcash_number TEXT,
    gcash_name TEXT,
    gcash_qr_url TEXT,
    
    -- Payment method toggles
    cash_enabled BOOLEAN DEFAULT TRUE,
    cheque_enabled BOOLEAN DEFAULT TRUE,
    gcash_enabled BOOLEAN DEFAULT FALSE,
    bank_transfer_enabled BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster company lookups
CREATE INDEX IF NOT EXISTS idx_payment_settings_company_id ON company_payment_settings(company_id);

-- Add table comment
COMMENT ON TABLE company_payment_settings IS 'Company-specific payment configuration including bank accounts, GCash, and payment method toggles';
COMMENT ON COLUMN company_payment_settings.bank_accounts IS 'JSONB array of bank configurations with optional QR codes';

-- 2. Insert default payment settings for all existing companies
DO $$
DECLARE
    company_record RECORD;
    default_banks JSONB;
BEGIN
    -- Default bank accounts (current hardcoded values)
    default_banks := '[
        {
            "name": "Unionbank",
            "account_number": "00-218-002553-7",
            "enabled": true,
            "qr_code_url": null
        },
        {
            "name": "BPI",
            "account_number": "1761-011118",
            "enabled": true,
            "qr_code_url": null
        },
        {
            "name": "PBCOM",
            "account_number": "238101006138",
            "enabled": true,
            "qr_code_url": null
        }
    ]'::jsonb;
    
    -- Insert default settings for all existing companies
    FOR company_record IN SELECT id FROM companies LOOP
        INSERT INTO company_payment_settings (
            company_id,
            bank_accounts,
            cash_enabled,
            cheque_enabled,
            gcash_enabled,
            bank_transfer_enabled
        )
        VALUES (
            company_record.id,
            default_banks,
            TRUE,  -- Cash enabled
            TRUE,  -- Cheque enabled
            FALSE, -- GCash disabled (no number configured)
            TRUE   -- Bank transfer enabled (has default banks)
        )
        ON CONFLICT (company_id) DO NOTHING;
    END LOOP;
    
    RAISE NOTICE 'Migrated payment settings for % existing companies', (SELECT COUNT(*) FROM companies);
END $$;

-- 3. Create function to auto-insert default payment settings for new companies
CREATE OR REPLACE FUNCTION insert_default_payment_settings()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO company_payment_settings (
        company_id,
        bank_accounts,
        cash_enabled,
        cheque_enabled,
        gcash_enabled,
        bank_transfer_enabled
    )
    VALUES (
        NEW.id,
        '[]'::jsonb,  -- New companies start with empty bank accounts
        TRUE,         -- Cash enabled by default
        TRUE,         -- Cheque enabled by default
        FALSE,        -- GCash disabled by default
        FALSE         -- Bank transfer disabled until configured
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Create trigger for new companies
DROP TRIGGER IF EXISTS trigger_insert_default_payment_settings ON companies;
CREATE TRIGGER trigger_insert_default_payment_settings
    AFTER INSERT ON companies
    FOR EACH ROW
    EXECUTE FUNCTION insert_default_payment_settings();

-- 5. Enable Row Level Security (RLS)
ALTER TABLE company_payment_settings ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies

-- Policy: Users can view payment settings from their own company
CREATE POLICY "Users can view their company payment settings"
    ON company_payment_settings FOR SELECT
    USING (
        company_id IN (
            SELECT company_id FROM profiles WHERE id = auth.uid()
        )
    );

-- Policy: Only super_admin and finance can insert payment settings
CREATE POLICY "Super admin and finance can insert payment settings"
    ON company_payment_settings FOR INSERT
    WITH CHECK (
        company_id IN (
            SELECT company_id FROM profiles 
            WHERE id = auth.uid() 
            AND role IN ('super_admin', 'finance')
        )
    );

-- Policy: Only super_admin and finance can update payment settings
CREATE POLICY "Super admin and finance can update payment settings"
    ON company_payment_settings FOR UPDATE
    USING (
        company_id IN (
            SELECT company_id FROM profiles 
            WHERE id = auth.uid() 
            AND role IN ('super_admin', 'finance')
        )
    )
    WITH CHECK (
        company_id IN (
            SELECT company_id FROM profiles 
            WHERE id = auth.uid() 
            AND role IN ('super_admin', 'finance')
        )
    );

-- Policy: Only super_admin and finance can delete payment settings (rarely needed)
CREATE POLICY "Super admin and finance can delete payment settings"
    ON company_payment_settings FOR DELETE
    USING (
        company_id IN (
            SELECT company_id FROM profiles 
            WHERE id = auth.uid() 
            AND role IN ('super_admin', 'finance')
        )
    );

-- 7. Create updated_at trigger
CREATE OR REPLACE FUNCTION update_payment_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_payment_settings_timestamp ON company_payment_settings;
CREATE TRIGGER trigger_update_payment_settings_timestamp
    BEFORE UPDATE ON company_payment_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_payment_settings_updated_at();

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Successfully created company_payment_settings table with RLS policies';
END $$;
