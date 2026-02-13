-- Fix sub_teams RLS policy to allow team leaders to view all sub_teams in their company
-- This enables the TL-to-TL stock request feature where TLs need to see all managers and team leaders

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "Leaders view own sub-team" ON public.sub_teams;

-- Create a new policy that allows team leaders to see all sub_teams in their company
CREATE POLICY "Leaders view company sub-teams"
ON public.sub_teams FOR SELECT 
TO authenticated 
USING (
    leader_id = auth.uid()  -- Can see their own team
    OR 
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'team_leader'
        AND profiles.company_id = sub_teams.company_id  -- Can see all teams in their company
    )
);

-- Explanation:
-- Team leaders can now:
-- 1. View their own sub_team (leader_id = auth.uid())
-- 2. View all sub_teams in their company (for TL-to-TL stock requests)
-- This allows them to see all manager teams and select any team leader to request stock from
