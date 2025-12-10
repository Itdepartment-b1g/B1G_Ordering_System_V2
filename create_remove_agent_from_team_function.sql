-- ============================================================================
-- REMOVE AGENT FROM TEAM FUNCTION
-- ============================================================================
-- This function removes a mobile sales agent from their assigned team leader.
-- It handles:
--   1. Validates agent exists and is assigned to a team
--   2. Removes assignment from leader_teams table
--   3. Returns success/error status
--
-- Parameters:
--   - p_agent_id: UUID of the mobile sales agent to unassign
--   - p_admin_id: UUID of the admin performing the unassignment
--
-- Returns:
--   JSON object with success status and message
-- ============================================================================

-- Drop the function if it exists
DROP FUNCTION IF EXISTS remove_agent_from_team(UUID, UUID);

-- Create the remove_agent_from_team function
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
BEGIN
  -- Check if agent is assigned to a team
  SELECT id, leader_id, company_id INTO v_assignment_id, v_leader_id, v_company_id
  FROM leader_teams
  WHERE agent_id = p_agent_id;

  IF v_assignment_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Agent is not assigned to any team'
    );
  END IF;

  -- Delete the assignment
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

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION remove_agent_from_team(UUID, UUID) TO authenticated;

-- Test the function (optional - comment out if not needed)
-- SELECT remove_agent_from_team(
--   'agent-uuid-here'::UUID,
--   'admin-uuid-here'::UUID
-- );

