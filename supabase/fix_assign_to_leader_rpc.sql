-- ============================================================================
-- FIX: ASSIGN AGENT TO LEADER RPC
-- ============================================================================
-- Updates the assignment logic to automatically link the agent to the leader's
-- sub-team (if one exists).

DROP FUNCTION IF EXISTS public.assign_agent_to_leader(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.assign_agent_to_leader(
    p_agent_id UUID,
    p_leader_id UUID,
    p_admin_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_company_id UUID;
    v_leader_role TEXT;
    v_agent_role TEXT;
    v_sub_team_id UUID;
    v_result JSONB;
BEGIN
    -- 1. Verify Admin Permissions
    IF NOT EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = p_admin_id 
        AND role IN ('admin', 'super_admin') -- Strict restriction: Only Admins
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only Admins can assign agents');
    END IF;

    -- 2. get company_id from admin/manager
    SELECT company_id INTO v_company_id FROM profiles WHERE id = p_admin_id;

    -- 3. Verify IDs and Roles
    SELECT role INTO v_leader_role FROM profiles WHERE id = p_leader_id AND company_id = v_company_id;
    SELECT role INTO v_agent_role FROM profiles WHERE id = p_agent_id AND company_id = v_company_id;

    IF v_leader_role IS NULL OR v_agent_role IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Agent or Leader not found in your company');
    END IF;

    -- 4. Check Hierarchy
    IF v_leader_role IN ('admin', 'super_admin') AND v_agent_role != 'manager' THEN
         RETURN jsonb_build_object('success', false, 'error', 'Admins can only have Managers assigned directly');
    END IF;

    IF v_leader_role = 'manager' AND v_agent_role != 'team_leader' THEN
         RETURN jsonb_build_object('success', false, 'error', 'Managers can only have Team Leaders assigned directly');
    END IF;

    IF v_leader_role = 'team_leader' AND v_agent_role != 'mobile_sales' THEN
         RETURN jsonb_build_object('success', false, 'error', 'Team Leaders can only have Mobile Sales agents assigned');
    END IF;
    
    -- 5. Find Sub-Team (Crucial Fix)
    -- If the leader LEADS a sub-team, we get that ID.
    SELECT id INTO v_sub_team_id FROM sub_teams WHERE leader_id = p_leader_id LIMIT 1;

    -- 6. Insert Assignment
    INSERT INTO leader_teams (agent_id, leader_id, company_id, sub_team_id)
    VALUES (p_agent_id, p_leader_id, v_company_id, v_sub_team_id)
    ON CONFLICT (agent_id) 
    DO UPDATE SET 
        leader_id = EXCLUDED.leader_id,
        sub_team_id = EXCLUDED.sub_team_id,
        updated_at = NOW();

    RETURN jsonb_build_object('success', true, 'message', 'Agent assigned successfully');

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
