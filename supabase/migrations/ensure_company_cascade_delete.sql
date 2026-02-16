-- ============================================================================
-- ENSURE COMPANY CASCADE DELETE ON ALL TABLES
-- ============================================================================
-- This migration ensures that ALL tables with company_id foreign keys
-- have ON DELETE CASCADE properly configured, so deleting a company
-- automatically deletes all related data across all tables
-- ============================================================================

-- Fix inventory_returns table (missing ON DELETE CASCADE)
DO $$
BEGIN
    -- Check if constraint exists and doesn't have CASCADE
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
            ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.referential_constraints rc
            ON rc.constraint_name = tc.constraint_name
        WHERE tc.table_name = 'inventory_returns'
            AND kcu.column_name = 'company_id'
            AND rc.delete_rule != 'CASCADE'
    ) THEN
        -- Drop and recreate with CASCADE
        ALTER TABLE inventory_returns 
        DROP CONSTRAINT IF EXISTS inventory_returns_company_id_fkey;
        
        ALTER TABLE inventory_returns
        ADD CONSTRAINT inventory_returns_company_id_fkey
        FOREIGN KEY (company_id) 
        REFERENCES companies(id) 
        ON DELETE CASCADE;
    END IF;
END $$;

-- Verify all company_id foreign keys have CASCADE
-- This query will show any that don't have CASCADE
SELECT 
    tc.table_name,
    kcu.column_name,
    rc.delete_rule,
    CASE 
        WHEN rc.delete_rule != 'CASCADE' THEN 'NEEDS FIX'
        ELSE 'OK'
    END as status
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.referential_constraints rc
    ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'company_id'
    AND tc.table_schema = 'public'
ORDER BY tc.table_name;
