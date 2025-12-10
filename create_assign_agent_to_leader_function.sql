-- ============================================================================
-- ASSIGN AGENT TO LEADER FUNCTION
-- ============================================================================
-- This function assigns a mobile sales agent to a team leader's team.
-- It handles:
--   1. Validates agent and leader exist and belong to same company
--   2. Checks if assignment already exists
--   3. Inserts new assignment into leader_teams table
--   4. Returns success/error status
--
-- Parameters:
--   - p_agent_id: UUID of the mobile sales agent to assign
--   - p_leader_id: UUID of the team leader
--   - p_admin_id: UUID of the admin performing the assignment
--
-- Returns:
--   JSON object with success status and message
-- ============================================================================

-- Drop the function if it exists
DROP FUNCTION IF EXISTS assign_agent_to_leader(UUID, UUID, UUID);

-- Create the assign_agent_to_leader function
CREATE OR REPLACE FUNCTION assign_agent_to_leader(
  p_agent_id UUID,
  p_leader_id UUID,
  p_admin_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent_company_id UUID;
  v_leader_company_id UUID;
  v_company_id UUID;
  v_existing_assignment UUID;
  v_agent_role TEXT;
  v_leader_role TEXT;
BEGIN
  -- Validate that agent exists and get their company_id and role
  SELECT company_id, role INTO v_agent_company_id, v_agent_role
  FROM profiles
  WHERE id = p_agent_id;

  IF v_agent_company_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Agent not found'
    );
  END IF;

  -- Validate agent is a mobile sales agent
  IF v_agent_role != 'mobile_sales' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Selected user is not a mobile sales agent'
    );
  END IF;

  -- Validate that leader exists and get their company_id and role
  SELECT company_id, role INTO v_leader_company_id, v_leader_role
  FROM profiles
  WHERE id = p_leader_id;

  IF v_leader_company_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Leader not found'
    );
  END IF;

  -- Validate leader is a team leader
  IF v_leader_role != 'team_leader' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Selected user is not a team leader'
    );
  END IF;

  -- Ensure agent and leader belong to the same company
  IF v_agent_company_id != v_leader_company_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Agent and leader must belong to the same company'
    );
  END IF;

  v_company_id := v_agent_company_id;

  -- Check if assignment already exists
  SELECT id INTO v_existing_assignment
  FROM leader_teams
  WHERE agent_id = p_agent_id
    AND leader_id = p_leader_id
    AND company_id = v_company_id;

  IF v_existing_assignment IS NOT NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Agent is already assigned to this leader'
    );
  END IF;

  -- Check if agent is already assigned to another leader
  SELECT id INTO v_existing_assignment
  FROM leader_teams
  WHERE agent_id = p_agent_id
    AND company_id = v_company_id
    AND leader_id != p_leader_id;

  IF v_existing_assignment IS NOT NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Agent is already assigned to another leader. Please unassign first.'
    );
  END IF;

  -- Insert new assignment
  INSERT INTO leader_teams (
    company_id,
    leader_id,
    agent_id,
    assigned_at,
    created_at,
    updated_at
  ) VALUES (
    v_company_id,
    p_leader_id,
    p_agent_id,
    NOW(),
    NOW(),
    NOW()
  );

  -- Return success
  RETURN json_build_object(
    'success', true,
    'message', 'Agent successfully assigned to leader',
    'company_id', v_company_id,
    'leader_id', p_leader_id,
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
GRANT EXECUTE ON FUNCTION assign_agent_to_leader(UUID, UUID, UUID) TO authenticated;

-- Test the function (optional - comment out if not needed)
-- SELECT assign_agent_to_leader(
--   'agent-uuid-here'::UUID,
--   'leader-uuid-here'::UUID,
--   'admin-uuid-here'::UUID
-- );

