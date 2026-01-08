-- ============================================================================
-- UPDATE SUB_TEAMS RLS POLICIES (STRICT HIERARCHY)
-- ============================================================================
-- Requirements:
-- 1. Super Admin / Admin -> View All
-- 2. Manager -> View sub-teams they manage (manager_id = me)
-- 3. Team Leader -> View sub-team they lead (leader_id = me)
-- 4. Mobile Sales -> View sub-team they are a member of (via leader_teams)
-- ============================================================================

-- Ensure RLS is on
ALTER TABLE public.sub_teams ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to be clean
DROP POLICY IF EXISTS "Admins view all sub-teams" ON public.sub_teams;
DROP POLICY IF EXISTS "Managers view own sub-teams" ON public.sub_teams;
DROP POLICY IF EXISTS "Leaders view own sub-team" ON public.sub_teams;
DROP POLICY IF EXISTS "Members view assigned sub-team" ON public.sub_teams;

-- 1. Admin Policy (View All)
CREATE POLICY "Admins view all sub-teams" 
ON public.sub_teams FOR SELECT 
TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin')
    )
);

-- 2. Manager Policy (View Own Managed Teams)
CREATE POLICY "Managers view own sub-teams" 
ON public.sub_teams FOR SELECT 
TO authenticated 
USING (
    manager_id = auth.uid()
);

-- 3. Team Leader Policy (View Own Lead Team)
CREATE POLICY "Leaders view own sub-team" 
ON public.sub_teams FOR SELECT 
TO authenticated 
USING (
    leader_id = auth.uid()
);

-- 4. Mobile Sales Policy (View Team They Are Assigned To)
CREATE POLICY "Members view assigned sub-team" 
ON public.sub_teams FOR SELECT 
TO authenticated 
USING (
    -- Allow if I am assigned to this sub_team in leader_teams
    EXISTS (
        SELECT 1 FROM public.leader_teams
        WHERE leader_teams.sub_team_id = sub_teams.id
        AND leader_teams.agent_id = auth.uid()
    )
    -- Also allow if I am the active "agent" record? (Usually covered above)
);

-- Note on "View": The 'sub_teams_overview' will inherit these rules 
-- if accessed via standard Supabase client, as views respect underlying table RLS 
-- UNLESS the view is defined with 'security_invoker' which we haven't explicitly set, 
-- but Supabase/Postgres default behavior for simple views generally applies permissions 
-- of the view owner unless simpler RLS is used. 
-- Wait - by default Views run as OWNER. To respect RLS, we must ALTER VIEW to SECURITY INVOKER.
-- Let's make sure the view respects these policies.

ALTER VIEW public.sub_teams_overview OWNER TO postgres; -- Ensure owner references are standard
-- Apply standard "Security Invoker" causing the view to use the USER'S permissions on underlying tables
ALTER VIEW public.sub_teams_overview SET (security_invoker = on);
