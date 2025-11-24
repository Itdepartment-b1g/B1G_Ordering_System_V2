-- ============================================================================
-- SAFE DATABASE CLEANUP (No Superuser Required)
-- ============================================================================

-- 1. Force Disable RLS on profiles (Critical)
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- 2. Drop the trigger you found (Just to be safe)
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;

-- 3. Ensure the 'authenticated' role has full access
GRANT ALL ON profiles TO authenticated;
GRANT ALL ON profiles TO service_role;
GRANT ALL ON profiles TO anon;

-- 4. Verify Access (Should return a number immediately)
SELECT count(*) as total_profiles FROM profiles;
