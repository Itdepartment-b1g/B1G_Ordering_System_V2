-- ============================================================================
-- ADD COR, TRADE NAME, AND TIN COLUMNS TO CLIENTS TABLE
-- ============================================================================
-- This script adds:
-- 1. COR (Certificate of Registration) image column
-- 2. Trade Name column
-- 3. TIN (Tax Identification Number) column
-- ============================================================================

-- Add the cor_url column for storing COR image (PNG/JPG)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'clients' 
        AND column_name = 'cor_url'
    ) THEN
        ALTER TABLE clients 
        ADD COLUMN cor_url TEXT;
        
        COMMENT ON COLUMN clients.cor_url IS 'URL to Certificate of Registration image (PNG/JPG)';
        
        RAISE NOTICE 'Successfully added cor_url column to clients table';
    ELSE
        RAISE NOTICE 'cor_url column already exists in clients table';
    END IF;
END $$;

-- Add the contact_person column
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'clients' 
        AND column_name = 'contact_person'
    ) THEN
        ALTER TABLE clients 
        ADD COLUMN contact_person TEXT;
        
        COMMENT ON COLUMN clients.contact_person IS 'Contact person name for the client';
        
        RAISE NOTICE 'Successfully added contact_person column to clients table';
    ELSE
        RAISE NOTICE 'contact_person column already exists in clients table';
    END IF;
END $$;

-- Add the tin column (Tax Identification Number)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'clients' 
        AND column_name = 'tin'
    ) THEN
        ALTER TABLE clients 
        ADD COLUMN tin TEXT;
        
        COMMENT ON COLUMN clients.tin IS 'Tax Identification Number of the client';
        
        RAISE NOTICE 'Successfully added tin column to clients table';
    ELSE
        RAISE NOTICE 'tin column already exists in clients table';
    END IF;
END $$;

-- Optional: Create an index on contact_person for better query performance
CREATE INDEX IF NOT EXISTS idx_clients_contact_person ON clients(contact_person);

-- Optional: Create an index on tin for better query performance
CREATE INDEX IF NOT EXISTS idx_clients_tin ON clients(tin);

-- ============================================================================
-- VERIFY THE CHANGES
-- ============================================================================

-- Check if the columns were added successfully
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default,
    character_maximum_length
FROM information_schema.columns
WHERE table_schema = 'public'
    AND table_name = 'clients'
    AND column_name IN ('cor_url', 'contact_person', 'tin')
ORDER BY column_name;

-- Check the new indexes
SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'clients'
    AND (indexname LIKE '%contact_person%' OR indexname LIKE '%tin%')
ORDER BY indexname;

-- ============================================================================
-- USAGE NOTES
-- ============================================================================
-- 
-- After running this script:
-- 1. The 'cor_url' column will store the URL to COR images uploaded to storage
-- 2. The 'contact_person' column will store the contact person name
-- 3. The 'tin' column will store the Tax Identification Number
-- 4. All existing clients will have NULL values (can be populated later)
-- 5. New clients can have these values set via the app UI
-- 
-- Next steps:
-- 1. Create the storage bucket for COR images
-- 2. Update the client form UI to include these new fields
-- 3. Add upload functionality for COR images
-- ============================================================================
