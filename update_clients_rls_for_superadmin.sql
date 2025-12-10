-- ============================================================================
-- UPDATE CLIENTS RLS TO ALLOW SUPER ADMINS TO CREATE UNASSIGNED CLIENTS
-- ============================================================================
-- This script updates the RLS policies on the clients table to allow
-- super admins to create clients without an agent_id (unassigned clients)
-- ============================================================================

-- First, let's make the agent_id column nullable if it isn't already
-- (Skip this if agent_id is already nullable)
ALTER TABLE clients 
ALTER COLUMN agent_id DROP NOT NULL;

-- ============================================================================
-- DROP EXISTING INSERT POLICY IF IT EXISTS
-- ============================================================================

DROP POLICY IF EXISTS "Users can insert clients in their company" ON clients;
DROP POLICY IF EXISTS "Agents can insert clients" ON clients;
DROP POLICY IF EXISTS "Allow insert for agents and admins" ON clients;

-- ============================================================================
-- CREATE NEW INSERT POLICY WITH SUPER ADMIN SUPPORT
-- ============================================================================

CREATE POLICY "Users can insert clients with proper permissions"
ON clients
FOR INSERT
TO authenticated
WITH CHECK (
  -- Super admins can insert clients without agent_id (unassigned)
  (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'super_admin'
      AND company_id = clients.company_id
    )
  )
  OR
  -- Admins can insert clients assigned to themselves
  (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND company_id = clients.company_id
    )
    AND agent_id = auth.uid()
  )
  OR
  -- Regular agents can insert clients assigned to themselves
  (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('mobile_sales', 'team_leader')
      AND company_id = clients.company_id
    )
    AND agent_id = auth.uid()
  )
);

-- ============================================================================
-- UPDATE SELECT POLICY TO SHOW UNASSIGNED CLIENTS TO SUPER ADMINS
-- ============================================================================

DROP POLICY IF EXISTS "Users can view clients in their company" ON clients;

CREATE POLICY "Users can view clients with proper permissions"
ON clients
FOR SELECT
TO authenticated
USING (
  -- Super admins can see all clients in their company (including unassigned)
  (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'super_admin'
      AND company_id = clients.company_id
    )
  )
  OR
  -- Admins can see all clients in their company
  (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND company_id = clients.company_id
    )
  )
  OR
  -- Team leaders can see all clients in their company
  (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'team_leader'
      AND company_id = clients.company_id
    )
  )
  OR
  -- Agents can see their own clients
  (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'mobile_sales'
      AND company_id = clients.company_id
    )
    AND agent_id = auth.uid()
  )
);

-- ============================================================================
-- UPDATE POLICY TO ALLOW SUPER ADMINS TO UPDATE UNASSIGNED CLIENTS
-- ============================================================================

DROP POLICY IF EXISTS "Users can update clients in their company" ON clients;

CREATE POLICY "Users can update clients with proper permissions"
ON clients
FOR UPDATE
TO authenticated
USING (
  -- Super admins can update any client in their company
  (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'super_admin'
      AND company_id = clients.company_id
    )
  )
  OR
  -- Admins can update any client in their company
  (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND company_id = clients.company_id
    )
  )
  OR
  -- Team leaders can update any client in their company
  (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'team_leader'
      AND company_id = clients.company_id
    )
  )
  OR
  -- Agents can update their own clients
  (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'mobile_sales'
      AND company_id = clients.company_id
    )
    AND agent_id = auth.uid()
  )
)
WITH CHECK (
  -- Same permissions as USING clause
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND (
      role IN ('super_admin', 'admin', 'team_leader')
      OR (role = 'mobile_sales' AND clients.agent_id = auth.uid())
    )
    AND company_id = clients.company_id
  )
);

-- ============================================================================
-- DELETE POLICY (unchanged, but included for completeness)
-- ============================================================================

DROP POLICY IF EXISTS "Users can delete clients in their company" ON clients;

CREATE POLICY "Users can delete clients with proper permissions"
ON clients
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'admin')
    AND company_id = clients.company_id
  )
);

-- ============================================================================
-- VERIFY CHANGES
-- ============================================================================

-- Check if agent_id is nullable
SELECT 
  column_name,
  is_nullable,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'clients'
  AND column_name = 'agent_id';

-- List all policies on clients table
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'clients'
ORDER BY cmd, policyname;

-- ============================================================================
-- USAGE NOTES
-- ============================================================================
-- 
-- After running this script:
-- 1. Super admins can create clients with agent_id = NULL (unassigned)
-- 2. Super admins can see ALL clients in their company
-- 3. Super admins can update and delete any client in their company
-- 4. Regular admins still need to assign clients to themselves
-- 5. Agents can only create/view/update clients assigned to them
--
-- Unassigned clients (agent_id = NULL) can be:
-- - Assigned to an agent later by a super admin or admin
-- - Viewed in the clients list with "Unassigned" label
-- - Included in the War Room map
-- ============================================================================

