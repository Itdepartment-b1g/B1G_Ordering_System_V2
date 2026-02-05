-- ============================================================================
-- ENSURE ALL COMPANY_ID FOREIGN KEYS HAVE CASCADE DELETE
-- ============================================================================
-- This migration ensures that ALL tables with company_id foreign keys
-- have ON DELETE CASCADE properly configured
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
        RAISE NOTICE 'Fixed constraint % on table %', constraint_rec.constraint_name, constraint_rec.table_name;
    END LOOP;
    
    IF fixed_count = 0 THEN
        RAISE NOTICE 'All company_id foreign keys already have ON DELETE CASCADE';
    ELSE
        RAISE NOTICE 'Fixed % foreign key constraint(s)', fixed_count;
    END IF;
END $$;

-- Verify all company_id foreign keys now have CASCADE
SELECT 
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
ORDER BY tc.table_name;
