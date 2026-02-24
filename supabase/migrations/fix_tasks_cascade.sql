-- ============================================================================
-- FIX TASKS TABLE CASCADE DELETE
-- ============================================================================
-- This migration fixes the foreign key constraints on tasks table
-- to ensure proper cascade behavior when companies or profiles are deleted
-- ============================================================================

-- Fix company_id foreign key - should CASCADE when company is deleted
ALTER TABLE tasks 
DROP CONSTRAINT IF EXISTS tasks_company_id_fkey;

ALTER TABLE tasks
ADD CONSTRAINT tasks_company_id_fkey
FOREIGN KEY (company_id) 
REFERENCES companies(id) 
ON DELETE CASCADE;

-- Fix agent_id foreign key - should CASCADE when agent profile is deleted
-- (tasks belong to agents, so if agent is deleted, tasks should be deleted)
ALTER TABLE tasks 
DROP CONSTRAINT IF EXISTS tasks_agent_id_fkey;

ALTER TABLE tasks
ADD CONSTRAINT tasks_agent_id_fkey
FOREIGN KEY (agent_id) 
REFERENCES profiles(id) 
ON DELETE CASCADE;

-- Fix leader_id foreign key - should SET NULL when leader profile is deleted
-- (leader is optional, so we can keep the task but remove the leader reference)
ALTER TABLE tasks 
DROP CONSTRAINT IF EXISTS tasks_leader_id_fkey;

ALTER TABLE tasks
ADD CONSTRAINT tasks_leader_id_fkey
FOREIGN KEY (leader_id) 
REFERENCES profiles(id) 
ON DELETE SET NULL;

-- Fix client_id foreign key if it exists - should SET NULL when client is deleted
-- (client is optional, so we can keep the task but remove the client reference)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tasks' 
        AND column_name = 'client_id'
    ) THEN
        ALTER TABLE tasks 
        DROP CONSTRAINT IF EXISTS tasks_client_id_fkey;
        
        ALTER TABLE tasks
        ADD CONSTRAINT tasks_client_id_fkey
        FOREIGN KEY (client_id) 
        REFERENCES clients(id) 
        ON DELETE SET NULL;
    END IF;
END $$;

-- Verify the constraints were created correctly
SELECT 
    tc.table_name,
    kcu.column_name,
    rc.delete_rule,
    CASE 
        WHEN rc.delete_rule IN ('CASCADE', 'SET NULL') THEN '✓ OK'
        ELSE '✗ NEEDS FIX'
    END as status
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.referential_constraints rc
    ON rc.constraint_name = tc.constraint_name
WHERE tc.table_name = 'tasks'
    AND tc.table_schema = 'public'
    AND tc.constraint_type = 'FOREIGN KEY'
ORDER BY kcu.column_name;
