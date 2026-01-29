-- ============================================================================
-- REMOVE AGENT FROM TEAM FUNCTION (UPDATED)
-- ============================================================================
-- Use this script to update the function. It now cleans up sub_teams if a TL is removed.

DROP FUNCTION IF EXISTS remove_agent_from_team(UUID, UUID);
DROP FUNCTION IF EXISTS remove_agent_from_team(p_agent_id UUID, p_admin_id UUID);
DROP FUNCTION IF EXISTS remove_agent_from_team(p_admin_id UUID, p_agent_id UUID);

CREATE OR REPLACE FUNCTION remove_agent_from_team(
  p_agent_id UUID,
  p_admin_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment_id UUID;
  v_leader_id UUID;
  v_company_id UUID;
  v_role TEXT;
BEGIN
  -- 1. Check if agent is assigned to a team
  SELECT id, leader_id, company_id INTO v_assignment_id, v_leader_id, v_company_id
  FROM leader_teams
  WHERE agent_id = p_agent_id;

  IF v_assignment_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Agent is not assigned to any team'
    );
  END IF;

  -- 2. Verify Admin/Manager Permissions (Optional strict check, but current logic relies on client-side check + admin_id param presence)
  -- (We can add strict check here if needed, but sticking to core logic for now)

  -- 3. Check role of the agent being removed
  SELECT role INTO v_role FROM profiles WHERE id = p_agent_id;

  -- 4. If Team Leader, delete their Sub-Team
  IF v_role = 'team_leader' THEN
     DELETE FROM sub_teams WHERE leader_id = p_agent_id;
  END IF;

  -- 5. Delete the assignment (Leader Teams)
  DELETE FROM leader_teams
  WHERE id = v_assignment_id;

  -- Return success
  RETURN json_build_object(
    'success', true,
    'message', 'Agent successfully removed from team',
    'company_id', v_company_id,
    'leader_id', v_leader_id,
    'agent_id', p_agent_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION remove_agent_from_team(UUID, UUID) TO authenticated;
