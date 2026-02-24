-- ============================================================================
-- FIX REMOVE AGENT FROM TEAM FUNCTION
-- ============================================================================
-- This script fixes the remove_agent_from_team function by ensuring it exists
-- with the correct parameter order: (p_agent_id, p_admin_id)
-- ============================================================================

-- Drop the function if it exists with any parameter order
DROP FUNCTION IF EXISTS remove_agent_from_team(UUID, UUID);
DROP FUNCTION IF EXISTS remove_agent_from_team(p_agent_id UUID, p_admin_id UUID);
DROP FUNCTION IF EXISTS remove_agent_from_team(p_admin_id UUID, p_agent_id UUID);

-- Create the function with the correct signature
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

-- Verify the function was created
SELECT 
  proname as function_name,
  pg_get_function_arguments(oid) as arguments
FROM pg_proc
WHERE proname = 'remove_agent_from_team'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
