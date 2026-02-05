-- ============================================================================
-- FIX ALL CASCADE DELETES FOR COMPANY DELETION
-- ============================================================================
-- This comprehensive migration fixes all foreign key constraints to ensure
-- proper cascade behavior when companies or profiles are deleted
-- ============================================================================

-- ============================================================================
-- PART 1: Fix all company_id foreign keys to have ON DELETE CASCADE
-- ============================================================================
DO $$
DECLARE
    constraint_rec RECORD;
    sql_stmt TEXT;
    fixed_count INTEGER := 0;
BEGIN
    -- Loop through all foreign key constraints on company_id columns
    FOR constraint_rec IN
        SELECT 
            tc.table_name,
            tc.constraint_name,
            kcu.column_name,
            rc.delete_rule
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
        JOIN information_schema.referential_constraints rc
            ON rc.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
            AND kcu.column_name = 'company_id'
            AND tc.table_schema = 'public'
            AND rc.delete_rule != 'CASCADE'
    LOOP
        -- Drop the existing constraint
        sql_stmt := format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I',
            constraint_rec.table_name,
            constraint_rec.constraint_name
        );
        EXECUTE sql_stmt;
        
        -- Recreate with CASCADE
        sql_stmt := format(
            'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE',
            constraint_rec.table_name,
            constraint_rec.constraint_name
        );
        EXECUTE sql_stmt;
        
        fixed_count := fixed_count + 1;
        RAISE NOTICE 'Fixed company_id constraint % on table %', constraint_rec.constraint_name, constraint_rec.table_name;
    END LOOP;
    
    IF fixed_count = 0 THEN
        RAISE NOTICE 'All company_id foreign keys already have ON DELETE CASCADE';
    ELSE
        RAISE NOTICE 'Fixed % company_id foreign key constraint(s)', fixed_count;
    END IF;
END $$;

-- ============================================================================
-- PART 2: Fix tasks table foreign keys
-- ============================================================================
-- Fix company_id foreign key
ALTER TABLE tasks 
DROP CONSTRAINT IF EXISTS tasks_company_id_fkey;

ALTER TABLE tasks
ADD CONSTRAINT tasks_company_id_fkey
FOREIGN KEY (company_id) 
REFERENCES companies(id) 
ON DELETE CASCADE;

-- Fix agent_id foreign key - CASCADE (tasks belong to agents)
ALTER TABLE tasks 
DROP CONSTRAINT IF EXISTS tasks_agent_id_fkey;

ALTER TABLE tasks
ADD CONSTRAINT tasks_agent_id_fkey
FOREIGN KEY (agent_id) 
REFERENCES profiles(id) 
ON DELETE CASCADE;

-- Fix leader_id foreign key - SET NULL (leader is optional)
ALTER TABLE tasks 
DROP CONSTRAINT IF EXISTS tasks_leader_id_fkey;

ALTER TABLE tasks
ADD CONSTRAINT tasks_leader_id_fkey
FOREIGN KEY (leader_id) 
REFERENCES profiles(id) 
ON DELETE SET NULL;

-- Fix client_id foreign key if it exists - SET NULL (client is optional)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tasks' 
        AND column_name = 'client_id'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE tasks 
        DROP CONSTRAINT IF EXISTS tasks_client_id_fkey;
        
        ALTER TABLE tasks
        ADD CONSTRAINT tasks_client_id_fkey
        FOREIGN KEY (client_id) 
        REFERENCES clients(id) 
        ON DELETE SET NULL;
        
        RAISE NOTICE 'Fixed tasks.client_id foreign key';
    END IF;
END $$;

-- ============================================================================
-- PART 3: Fix inventory_returns table foreign key
-- ============================================================================
ALTER TABLE inventory_returns 
DROP CONSTRAINT IF EXISTS inventory_returns_company_id_fkey;

ALTER TABLE inventory_returns
ADD CONSTRAINT inventory_returns_company_id_fkey
FOREIGN KEY (company_id) 
REFERENCES companies(id) 
ON DELETE CASCADE;

-- ============================================================================
-- PART 4: Fix all variant_id foreign keys to have ON DELETE CASCADE
-- ============================================================================
-- When a company is deleted, variants are deleted, and we need to ensure
-- all child records that reference variants are also deleted to avoid constraint violations
DO $$
DECLARE
    constraint_rec RECORD;
    sql_stmt TEXT;
    fixed_count INTEGER := 0;
BEGIN
    -- Loop through all foreign key constraints on variant_id columns
    FOR constraint_rec IN
        SELECT 
            tc.table_name,
            tc.constraint_name,
            kcu.column_name,
            rc.delete_rule
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
        JOIN information_schema.referential_constraints rc
            ON rc.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
            AND kcu.column_name = 'variant_id'
            AND tc.table_schema = 'public'
            AND rc.delete_rule != 'CASCADE'
    LOOP
        -- Drop the existing constraint
        sql_stmt := format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I',
            constraint_rec.table_name,
            constraint_rec.constraint_name
        );
        EXECUTE sql_stmt;
        
        -- Recreate with CASCADE
        sql_stmt := format(
            'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (variant_id) REFERENCES variants(id) ON DELETE CASCADE',
            constraint_rec.table_name,
            constraint_rec.constraint_name
        );
        EXECUTE sql_stmt;
        
        fixed_count := fixed_count + 1;
        RAISE NOTICE 'Fixed variant_id constraint % on table %', constraint_rec.constraint_name, constraint_rec.table_name;
    END LOOP;
    
    IF fixed_count = 0 THEN
        RAISE NOTICE 'All variant_id foreign keys already have ON DELETE CASCADE';
    ELSE
        RAISE NOTICE 'Fixed % variant_id foreign key constraint(s)', fixed_count;
    END IF;
END $$;

-- ============================================================================
-- VERIFICATION: Show all foreign key constraints status
-- ============================================================================
SELECT 
    'company_id constraints' as constraint_type,
    tc.table_name,
    kcu.column_name,
    rc.delete_rule,
    CASE 
        WHEN rc.delete_rule = 'CASCADE' THEN '✓ OK'
        ELSE '✗ NEEDS FIX'
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

UNION ALL

SELECT 
    'variant_id constraints' as constraint_type,
    tc.table_name,
    kcu.column_name,
    rc.delete_rule,
    CASE 
        WHEN rc.delete_rule = 'CASCADE' THEN '✓ OK'
        ELSE '✗ NEEDS FIX'
    END as status
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.referential_constraints rc
    ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'variant_id'
    AND tc.table_schema = 'public'

UNION ALL

SELECT 
    'tasks table constraints' as constraint_type,
    tc.table_name,
    kcu.column_name,
    rc.delete_rule,
    CASE 
        WHEN (kcu.column_name = 'agent_id' AND rc.delete_rule = 'CASCADE') OR
             (kcu.column_name = 'leader_id' AND rc.delete_rule = 'SET NULL') OR
             (kcu.column_name = 'client_id' AND rc.delete_rule = 'SET NULL') OR
             (kcu.column_name = 'company_id' AND rc.delete_rule = 'CASCADE')
        THEN '✓ OK'
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
ORDER BY constraint_type, table_name, column_name;
