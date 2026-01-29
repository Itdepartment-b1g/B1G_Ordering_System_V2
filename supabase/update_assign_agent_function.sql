-- ============================================================================
-- UPDATE ASSIGN AGENT TO LEADER FUNCTION (Version 2)
-- ============================================================================
-- This update modifies the assignment logic to automatically link the agent
-- to the sub-team managed by the selected Team Leader, if one exists.

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
  v_sub_team_id UUID;
BEGIN
  -- Validate that agent exists and get their company_id and role
  SELECT company_id, role INTO v_agent_company_id, v_agent_role
  FROM profiles
  WHERE id = p_agent_id;

  IF v_agent_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Agent not found');
  END IF;

  -- Validate agent is a mobile sales agent
  IF v_agent_role != 'mobile_sales' THEN
    RETURN json_build_object('success', false, 'error', 'Selected user is not a mobile sales agent');
  END IF;

  -- Validate that leader exists and get their company_id and role
  SELECT company_id, role INTO v_leader_company_id, v_leader_role
  FROM profiles
  WHERE id = p_leader_id;

  IF v_leader_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Leader not found');
  END IF;

  -- Validate leader is a team leader (or Manager acting as leader)
  IF v_leader_role != 'team_leader' AND v_leader_role != 'manager' THEN
    RETURN json_build_object('success', false, 'error', 'Selected user must be a Team Leader or Manager');
  END IF;

  -- Ensure agent and leader belong to the same company
  IF v_agent_company_id != v_leader_company_id THEN
    RETURN json_build_object('success', false, 'error', 'Agent and leader must belong to the same company');
  END IF;

  v_company_id := v_agent_company_id;

  -- LOOKUP SUB-TEAM: Check if this leader leads a sub-team
  SELECT id INTO v_sub_team_id
  FROM sub_teams
  WHERE leader_id = p_leader_id
  LIMIT 1;

  -- Check if assignment already exists
  SELECT id INTO v_existing_assignment
  FROM leader_teams
  WHERE agent_id = p_agent_id
    AND leader_id = p_leader_id
    AND company_id = v_company_id;

  IF v_existing_assignment IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'Agent is already assigned to this leader');
  END IF;

  -- Check if agent is already assigned to another leader
  SELECT id INTO v_existing_assignment
  FROM leader_teams
  WHERE agent_id = p_agent_id
    AND company_id = v_company_id
    AND leader_id != p_leader_id;

  IF v_existing_assignment IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'Agent is already assigned to another leader. Please unassign first.');
  END IF;

  -- Insert new assignment with inferred sub_team_id
  INSERT INTO leader_teams (
    company_id,
    leader_id,
    agent_id,
    sub_team_id, -- New field
    assigned_at,
    created_at,
    updated_at
  ) VALUES (
    v_company_id,
    p_leader_id,
    p_agent_id,
    v_sub_team_id, -- Inferred value (can be NULL if leader has no sub-team yet)
    NOW(),
    NOW(),
    NOW()
  );

  -- Return success
  RETURN json_build_object(
    'success', true,
    'message', 'Agent assigned to leader ' || (CASE WHEN v_sub_team_id IS NOT NULL THEN 'and linked to sub-team' ELSE '(no sub-team found)' END),
    'company_id', v_company_id,
    'leader_id', p_leader_id,
    'agent_id', p_agent_id,
    'sub_team_id', v_sub_team_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;
