-- ============================================================================
-- FIX INVENTORY RETURNS CASCADE DELETE
-- ============================================================================
-- This migration fixes the foreign key constraint on inventory_returns
-- to ensure it has ON DELETE CASCADE when a company is deleted
-- ============================================================================

-- Drop the existing constraint if it exists
ALTER TABLE inventory_returns 
DROP CONSTRAINT IF EXISTS inventory_returns_company_id_fkey;

-- Recreate the constraint with ON DELETE CASCADE
ALTER TABLE inventory_returns
ADD CONSTRAINT inventory_returns_company_id_fkey
FOREIGN KEY (company_id) 
REFERENCES companies(id) 
ON DELETE CASCADE;

-- Verify the constraint was created correctly
DO $$
DECLARE
    delete_rule TEXT;
BEGIN
    SELECT rc.delete_rule INTO delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.referential_constraints rc
        ON rc.constraint_name = tc.constraint_name
    WHERE tc.table_name = 'inventory_returns'
        AND kcu.column_name = 'company_id'
        AND tc.constraint_type = 'FOREIGN KEY';
    
    IF delete_rule = 'CASCADE' THEN
        RAISE NOTICE 'Successfully fixed inventory_returns foreign key constraint - now has ON DELETE CASCADE';
    ELSE
        RAISE EXCEPTION 'Failed to fix inventory_returns foreign key constraint. Current delete_rule: %', delete_rule;
    END IF;
END $$;
