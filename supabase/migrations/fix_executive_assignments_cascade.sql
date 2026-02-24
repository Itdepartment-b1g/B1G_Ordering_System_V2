-- ============================================================================
-- FIX EXECUTIVE COMPANY ASSIGNMENTS CASCADE CONSTRAINT
-- ============================================================================
-- This migration ensures that the foreign key constraint on executive_company_assignments
-- has ON DELETE CASCADE properly set for both executive_id and company_id
-- ============================================================================

-- Check current constraint
SELECT 
    tc.constraint_name, 
    tc.table_name, 
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.delete_rule
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints AS rc
  ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND tc.table_name = 'executive_company_assignments';

-- Drop and recreate the constraint for executive_id if it doesn't have CASCADE
DO $$
BEGIN
    -- Drop existing constraint if it exists
    ALTER TABLE executive_company_assignments 
    DROP CONSTRAINT IF EXISTS executive_company_assignments_executive_id_fkey;
    
    -- Recreate with CASCADE
    ALTER TABLE executive_company_assignments
    ADD CONSTRAINT executive_company_assignments_executive_id_fkey
    FOREIGN KEY (executive_id) 
    REFERENCES profiles(id) 
    ON DELETE CASCADE;
END $$;

-- Drop and recreate the constraint for company_id if it doesn't have CASCADE
DO $$
BEGIN
    -- Drop existing constraint if it exists
    ALTER TABLE executive_company_assignments 
    DROP CONSTRAINT IF EXISTS executive_company_assignments_company_id_fkey;
    
    -- Recreate with CASCADE
    ALTER TABLE executive_company_assignments
    ADD CONSTRAINT executive_company_assignments_company_id_fkey
    FOREIGN KEY (company_id) 
    REFERENCES companies(id) 
    ON DELETE CASCADE;
END $$;

-- Fix the assigned_by constraint to SET NULL on delete (instead of RESTRICT)
DO $$
BEGIN
    -- Drop existing constraint if it exists
    ALTER TABLE executive_company_assignments 
    DROP CONSTRAINT IF EXISTS executive_company_assignments_assigned_by_fkey;
    
    -- Recreate with SET NULL so assigned_by becomes NULL when the profile is deleted
    ALTER TABLE executive_company_assignments
    ADD CONSTRAINT executive_company_assignments_assigned_by_fkey
    FOREIGN KEY (assigned_by) 
    REFERENCES profiles(id) 
    ON DELETE SET NULL;
END $$;

-- Verify the constraints are set correctly
SELECT 
    tc.constraint_name, 
    kcu.column_name,
    rc.delete_rule
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.referential_constraints AS rc
  ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND tc.table_name = 'executive_company_assignments'
ORDER BY kcu.column_name;
