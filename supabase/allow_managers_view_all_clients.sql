-- Allow Managers to view all clients in their company
-- This is necessary because Managers need to see clients assigned to their Team Leaders and Mobile Sales agents.

DROP POLICY IF EXISTS "Managers view all company clients" ON clients;

CREATE POLICY "Managers view all company clients"
ON clients FOR SELECT
USING (
  auth.uid() IN (
    SELECT id FROM profiles
    WHERE role IN ('manager', 'admin', 'super_admin', 'system_administrator')
    AND company_id = clients.company_id
  )
);
