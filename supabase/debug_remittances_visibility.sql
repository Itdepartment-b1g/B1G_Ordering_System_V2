-- ============================================================================
-- DEBUG AND FIX REMITTANCES VISIBILITY
-- ============================================================================

DO $$
DECLARE
    v_total_count INTEGER;
    v_missing_company_count INTEGER;
    v_missing_agent_count INTEGER;
    v_missing_leader_count INTEGER;
    v_fixed_count INTEGER;
BEGIN
    -- 1. DIAGNOSTICS
    SELECT COUNT(*) INTO v_total_count FROM remittances_log;
    
    SELECT COUNT(*) INTO v_missing_company_count 
    FROM remittances_log 
    WHERE company_id IS NULL;

    SELECT COUNT(*) INTO v_missing_agent_count 
    FROM remittances_log 
    WHERE agent_id IS NULL;

    SELECT COUNT(*) INTO v_missing_leader_count 
    FROM remittances_log 
    WHERE leader_id IS NULL;

    RAISE NOTICE 'Diagnostic Results:';
    RAISE NOTICE '-------------------';
    RAISE NOTICE 'Total Remittances: %', v_total_count;
    RAISE NOTICE 'Missing Company ID: %', v_missing_company_count;
    RAISE NOTICE 'Missing Agent ID: %', v_missing_agent_count;
    RAISE NOTICE 'Missing Leader ID: %', v_missing_leader_count;

    -- 2. FIX MISSING COMPANY_ID
    -- Update based on agent's profile
    WITH updated_rows AS (
        UPDATE remittances_log r
        SET company_id = p.company_id
        FROM profiles p
        WHERE r.agent_id = p.id
        AND r.company_id IS NULL
        RETURNING r.id
    )
    SELECT COUNT(*) INTO v_fixed_count FROM updated_rows;

    RAISE NOTICE 'Fixed % records with missing company_id', v_fixed_count;

    -- 3. FINAL VERIFICATION
    SELECT COUNT(*) INTO v_missing_company_count 
    FROM remittances_log 
    WHERE company_id IS NULL;

    RAISE NOTICE 'Remaining Missing Company ID: %', v_missing_company_count;

END $$;
