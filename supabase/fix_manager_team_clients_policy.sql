-- RESTRICT Manager view to ONLY their team's clients (Direct + 2nd Level)
-- Drop the broad policy if it was created
DROP POLICY IF EXISTS "Managers view all company clients" ON clients;
DROP POLICY IF EXISTS "Managers view team clients" ON clients;

CREATE POLICY "Managers view team clients"
ON clients FOR SELECT
USING (
  -- 1. Own clients
  auth.uid() = agent_id
  OR
  -- 2. Direct Reports: Agents I directly lead
  EXISTS (
    SELECT 1 FROM leader_teams 
    WHERE leader_id = auth.uid() 
    AND agent_id = clients.agent_id
  )
  OR
  -- 3. Indirect Reports: Agents led by my direct reports (e.g. Manager -> TL -> Mobile Sales)
  EXISTS (
    SELECT 1 
    FROM leader_teams sub
    JOIN leader_teams parent ON sub.leader_id = parent.agent_id
    WHERE parent.leader_id = auth.uid()
    AND sub.agent_id = clients.agent_id
  )
);
