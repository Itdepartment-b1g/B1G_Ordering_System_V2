-- ============================================================================
-- RENAME TRADE_NAME TO CONTACT_PERSON IN CLIENTS TABLE
-- ============================================================================
-- This script renames the trade_name column to contact_person to better
-- reflect that it stores the contact person's name rather than business name
-- ============================================================================

-- Rename the column from trade_name to contact_person
DO $$ 
BEGIN
    -- Check if trade_name exists and contact_person doesn't
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'clients' 
        AND column_name = 'trade_name'
    ) AND NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'clients' 
        AND column_name = 'contact_person'
    ) THEN
        -- Rename the column
        ALTER TABLE clients 
        RENAME COLUMN trade_name TO contact_person;
        
        -- Update the column comment
        COMMENT ON COLUMN clients.contact_person IS 'Contact person name for the client';
        
        RAISE NOTICE 'Successfully renamed trade_name to contact_person';
    ELSIF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'clients' 
        AND column_name = 'contact_person'
    ) THEN
        RAISE NOTICE 'contact_person column already exists, skipping rename';
    ELSE
        RAISE NOTICE 'trade_name column does not exist, cannot rename';
    END IF;
END $$;

-- Drop old index if it exists
DROP INDEX IF EXISTS idx_clients_trade_name;

-- Create new index on contact_person for better query performance
CREATE INDEX IF NOT EXISTS idx_clients_contact_person ON clients(contact_person);

-- ============================================================================
-- VERIFY THE CHANGES
-- ============================================================================

-- Check if the column was renamed successfully
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default,
    character_maximum_length
FROM information_schema.columns
WHERE table_schema = 'public'
    AND table_name = 'clients'
    AND column_name = 'contact_person';

-- Check the new index
SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'clients'
    AND indexname LIKE '%contact_person%'
ORDER BY indexname;

-- ============================================================================
-- USAGE NOTES
-- ============================================================================
-- 
-- After running this script:
-- 1. The 'trade_name' column will be renamed to 'contact_person'
-- 2. The old index 'idx_clients_trade_name' will be dropped
-- 3. A new index 'idx_clients_contact_person' will be created
-- 4. All existing data will be preserved
-- 
-- You will need to update your frontend code to use 'contact_person' instead
-- of 'trade_name' in the TypeScript types and forms.
-- ============================================================================
