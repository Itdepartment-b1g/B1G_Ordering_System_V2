-- ============================================================================
-- TEAM MANAGEMENT FUNCTIONS
-- ============================================================================
-- This script creates both functions needed for team management:
--   1. assign_agent_to_leader - Assigns a mobile sales agent to a team leader
--   2. remove_agent_from_team - Removes an agent from their assigned team
-- ============================================================================
-- ASSIGN AGENT TO LEADER FUNCTION
-- ============================================================================
DROP FUNCTION IF EXISTS assign_agent_to_leader(UUID, UUID, UUID);

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

  -- Validate agent is a mobile sales agent or team leader
  -- If leader is a manager, they can have both mobile_sales and team_leader agents
  -- If leader is a team_leader, they can only have mobile_sales agents
  IF v_agent_role NOT IN ('mobile_sales', 'team_leader') THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Selected user must be a mobile sales agent or team leader'
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

  -- Validate leader is a team leader or manager
  IF v_leader_role NOT IN ('team_leader', 'manager') THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Selected user is not a team leader or manager'
    );
  END IF;

  -- If leader is a team_leader, they can only have mobile_sales agents
  IF v_leader_role = 'team_leader' AND v_agent_role != 'mobile_sales' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Team leaders can only have mobile sales agents in their team'
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

-- ============================================================================
-- REMOVE AGENT FROM TEAM FUNCTION
-- ============================================================================
-- Drop the function if it exists (handle both possible parameter orders)
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

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================
GRANT EXECUTE ON FUNCTION assign_agent_to_leader(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION remove_agent_from_team(UUID, UUID) TO authenticated;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Verify functions were created successfully
SELECT 
  routine_name,
  routine_type,
  data_type as return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('assign_agent_to_leader', 'remove_agent_from_team')
ORDER BY routine_name;

