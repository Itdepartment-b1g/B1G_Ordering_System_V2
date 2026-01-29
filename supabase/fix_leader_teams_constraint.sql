-- ============================================================================
-- FIX: ADD UNIQUE CONSTRAINT TO LEADER_TEAMS
-- ============================================================================
-- The previous ON CONFLICT (agent_id) clause failed because agent_id wasn't unique.
-- An agent can only have one leader, so agent_id should indeed be unique.

-- 1. Remove duplicates if any (keeping the most recent assignment)
DELETE FROM leader_teams a USING (
    SELECT MIN(ctid) as ctid, agent_id
    FROM leader_teams 
    GROUP BY agent_id HAVING COUNT(*) > 1
) b
WHERE a.agent_id = b.agent_id 
AND a.ctid <> b.ctid;

-- 2. Add the unique constraint
ALTER TABLE leader_teams ADD CONSTRAINT leader_teams_agent_id_key UNIQUE (agent_id);
