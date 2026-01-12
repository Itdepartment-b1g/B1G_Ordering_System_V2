-- FIX: Use a SECURITY DEFINER function to bypass RLS recursion when getting the user's company_id
-- This ensures that checks on the 'profiles' table don't trigger the policies on the 'profiles' table themselves.

-- 1. Create the helper function
CREATE OR REPLACE FUNCTION get_auth_user_company_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER -- Run as owner, bypassing RLS
SET search_path = public -- Secure search_path
AS $$
BEGIN
  RETURN (SELECT company_id FROM profiles WHERE id = auth.uid());
END;
$$;

-- 2. Ensure Clients are visible to all internal team members (Finance, Admin, etc.)
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team members can view company clients" ON clients;

CREATE POLICY "Team members can view company clients"
ON clients
FOR SELECT
TO authenticated
USING (
  company_id = get_auth_user_company_id()
);

-- 3. Fix Profiles visibility (also using the helper to avoid recursion)
DROP POLICY IF EXISTS "Team members can view company profiles" ON profiles;

CREATE POLICY "Team members can view company profiles"
ON profiles
FOR SELECT
TO authenticated
USING (
  company_id = get_auth_user_company_id()
);

-- 4. Explicitly allow users to read their own profile (good practice)
DROP POLICY IF EXISTS "Users can see own profile" ON profiles;

CREATE POLICY "Users can see own profile"
ON profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
);

-- 5. Ensure Cash Deposits are visible (just in case Finance is blocked there too)
ALTER TABLE cash_deposits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team members can view company deposits" ON cash_deposits;

CREATE POLICY "Team members can view company deposits"
ON cash_deposits
FOR SELECT
TO authenticated
USING (
  company_id = get_auth_user_company_id()
);
