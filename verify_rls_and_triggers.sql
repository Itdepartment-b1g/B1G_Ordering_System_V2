-- ============================================================================
-- VERIFY RLS STATUS AND TRIGGERS
-- ============================================================================

-- 1. Check RLS status for 'profiles' table
SELECT 
    tablename, 
    rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename = 'profiles';

-- 2. Check for any triggers on 'profiles' table
SELECT 
    event_object_table as table_name,
    trigger_name,
    event_manipulation as event,
    action_statement as definition
FROM information_schema.triggers
WHERE event_object_table = 'profiles';

-- 3. Test a simple SELECT (this will fail/timeout if RLS is still active and recursive)
-- Note: You can't see the output of this in the Supabase UI easily if it times out,
-- but if the script finishes quickly, it means the SELECT worked.
DO $$
BEGIN
    PERFORM * FROM profiles LIMIT 1;
    RAISE NOTICE 'Select query completed successfully';
END $$;
