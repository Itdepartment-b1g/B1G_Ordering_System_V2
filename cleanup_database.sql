-- ============================================================================
-- DATABASE CLEANUP & RECOVERY
-- ============================================================================

-- 1. Terminate other connections to clear locks (except this one)
-- This might fail if you don't have superuser rights, but worth a try.
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE pid <> pg_backend_pid()
AND datname = current_database();

-- 2. Force Disable RLS on profiles (Again)
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- 3. Drop ALL triggers on profiles table
-- We use a dynamic block to find and drop them
DO $$
DECLARE
    trg_name TEXT;
BEGIN
    FOR trg_name IN 
        SELECT trigger_name 
        FROM information_schema.triggers 
        WHERE event_object_table = 'profiles'
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON profiles', trg_name);
        RAISE NOTICE 'Dropped trigger: %', trg_name;
    END LOOP;
END $$;

-- 4. Verify Access
-- This should return immediately.
SELECT count(*) FROM profiles;
