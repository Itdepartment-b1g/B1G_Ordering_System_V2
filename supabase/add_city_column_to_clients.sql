-- ============================================================================
-- ADD CITY COLUMN TO CLIENTS TABLE
-- ============================================================================
-- This script adds a 'city' column to the clients table for tracking
-- client locations and territory assignment
-- ============================================================================

-- Add the city column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'clients' 
        AND column_name = 'city'
    ) THEN
        ALTER TABLE clients 
        ADD COLUMN city TEXT;
        
        -- Add a comment to describe the column
        COMMENT ON COLUMN clients.city IS 'City where the client is located, used for territory assignment';
        
        RAISE NOTICE 'Successfully added city column to clients table';
    ELSE
        RAISE NOTICE 'City column already exists in clients table';
    END IF;
END $$;

-- Optional: Create an index on city for better query performance
CREATE INDEX IF NOT EXISTS idx_clients_city ON clients(city);

-- Optional: Create an index on city + company_id for multi-tenant queries
CREATE INDEX IF NOT EXISTS idx_clients_company_city ON clients(company_id, city);

-- ============================================================================
-- VERIFY THE CHANGES
-- ============================================================================

-- Check if the column was added successfully
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default,
    character_maximum_length
FROM information_schema.columns
WHERE table_schema = 'public'
    AND table_name = 'clients'
    AND column_name = 'city';

-- Check the indexes
SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'clients'
    AND indexname LIKE '%city%';

-- Sample: Update existing clients with city from address (optional)
-- Uncomment if you want to try extracting city from existing address data
-- This is a best-effort extraction and may need manual review

-- UPDATE clients
-- SET city = TRIM(SPLIT_PART(address, ',', -1))
-- WHERE city IS NULL 
--   AND address IS NOT NULL 
--   AND address LIKE '%,%';

-- ============================================================================
-- USAGE NOTES
-- ============================================================================
-- 
-- After running this script:
-- 1. The 'city' column will be available in the clients table
-- 2. Existing clients will have NULL city values (you may want to populate them)
-- 3. New clients created via the app will have city values
-- 4. City is used for:
--    - Agent territory assignment
--    - Client filtering and search
--    - Analytics and reporting
--    - Approval workflow for clients outside assigned cities
-- 
-- To populate existing clients with city data:
-- - Manually update through SQL
-- - Use address parsing if addresses include city
-- - Import from external data source
-- - Edit clients one by one through the app UI
-- ============================================================================

