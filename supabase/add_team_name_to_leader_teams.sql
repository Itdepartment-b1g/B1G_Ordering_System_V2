-- ============================================================================
-- FEATURE: TEAM NAME FOR LEADER TEAMS
-- ============================================================================

-- 1. Add team_name column
ALTER TABLE leader_teams ADD COLUMN IF NOT EXISTS team_name TEXT;

-- 2. Update assign_agent_to_leader RPC to accept team_name
DROP FUNCTION IF EXISTS public.assign_agent_to_leader(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.assign_agent_to_leader(uuid, uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.assign_agent_to_leader(
    p_agent_id UUID,
    p_leader_id UUID,
    p_admin_id UUID,
    p_team_name TEXT DEFAULT NULL -- Optional new parameter
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_company_id UUID;
    v_leader_role TEXT;
    v_agent_role TEXT;
    v_agent_name TEXT;
    v_sub_team_id UUID;
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
    SELECT role, full_name INTO v_agent_role, v_agent_name FROM profiles WHERE id = p_agent_id AND company_id = v_company_id;

    IF v_leader_role IS NULL OR v_agent_role IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Agent or Leader not found in your company');
    END IF;

    -- 4. Check Hierarchy & Implement Logic
    
    -- Case A: Admin assigning Manager (Creating a Top-Level Team)
    IF v_leader_role IN ('admin', 'super_admin') THEN
        IF v_agent_role != 'manager' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Admins can only have Managers assigned directly');
        END IF;
        
        -- Just insert into leader_teams (Manager Team)
        INSERT INTO leader_teams (agent_id, leader_id, company_id, team_name)
        VALUES (p_agent_id, p_leader_id, v_company_id, p_team_name)
        ON CONFLICT (agent_id) 
        DO UPDATE SET 
            leader_id = EXCLUDED.leader_id,
            team_name = COALESCE(EXCLUDED.team_name, leader_teams.team_name),
            updated_at = NOW();

    -- Case B: Manager assigning Team Leader (Creating a Sub-Team)
    ELSIF v_leader_role = 'manager' THEN
        IF v_agent_role != 'team_leader' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Managers can only have Team Leaders assigned directly');
        END IF;

        -- 1. Create/Ensure Sub-Team Exists for this Team Leader
        -- We name it "{TL Name}'s Team" by default
        INSERT INTO sub_teams (name, manager_id, leader_id, company_id)
        VALUES (COALESCE(v_agent_name, 'Team Leader') || '''s Team', p_leader_id, p_agent_id, v_company_id)
        ON CONFLICT (leader_id) DO NOTHING; -- Already exists, skip

        -- 2. Assign TL to Manager in leader_teams
        INSERT INTO leader_teams (agent_id, leader_id, company_id)
        VALUES (p_agent_id, p_leader_id, v_company_id)
        ON CONFLICT (agent_id) 
        DO UPDATE SET 
            leader_id = EXCLUDED.leader_id,
            updated_at = NOW();

    -- Case C: Team Leader assigning Mobile Sales (Populating Sub-Team)
    ELSIF v_leader_role = 'team_leader' THEN
        IF v_agent_role != 'mobile_sales' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Team Leaders can only have Mobile Sales agents assigned');
        END IF;

        -- 1. Find the Sub-Team led by this Team Leader
        SELECT id INTO v_sub_team_id FROM sub_teams WHERE leader_id = p_leader_id LIMIT 1;
        
        IF v_sub_team_id IS NULL THEN
             RETURN jsonb_build_object('success', false, 'error', 'This Team Leader does not have a sub-team initialized yet.');
        END IF;

        -- 2. Assign Agent to Team Leader AND Sub-Team
        INSERT INTO leader_teams (agent_id, leader_id, company_id, sub_team_id)
        VALUES (p_agent_id, p_leader_id, v_company_id, v_sub_team_id)
        ON CONFLICT (agent_id) 
        DO UPDATE SET 
            leader_id = EXCLUDED.leader_id,
            sub_team_id = EXCLUDED.sub_team_id,
            updated_at = NOW();

    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Invalid hierarchy assignment');
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Agent assigned successfully');

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
