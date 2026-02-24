-- Create sub_teams table
CREATE TABLE IF NOT EXISTS public.sub_teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    manager_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    leader_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, -- The Team Leader managing this sub-team
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    -- Constraints
    CONSTRAINT unique_leader_sub_team UNIQUE (leader_id) -- A leader can only lead one sub-team
);

-- Add indexes for performance
CREATE INDEX idx_sub_teams_manager_id ON public.sub_teams(manager_id);
CREATE INDEX idx_sub_teams_leader_id ON public.sub_teams(leader_id);
CREATE INDEX idx_sub_teams_company_id ON public.sub_teams(company_id);

-- Add sub_team_id to leader_teams for hierarchical assignment
ALTER TABLE public.leader_teams 
ADD COLUMN IF NOT EXISTS sub_team_id UUID REFERENCES public.sub_teams(id) ON DELETE SET NULL;

-- Index for the new column
CREATE INDEX idx_leader_teams_sub_team_id ON public.leader_teams(sub_team_id);

-- RLS Policies for sub_teams

-- Enable RLS
ALTER TABLE public.sub_teams ENABLE ROW LEVEL SECURITY;

-- Policy: Admin and Super Admin can view all sub-teams
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

-- Policy: Managers can view their own sub-teams
CREATE POLICY "Managers view own sub-teams" 
ON public.sub_teams FOR SELECT 
TO authenticated 
USING (
    manager_id = auth.uid() -- Direct ownership
    OR 
    EXISTS ( -- Or check profile role if needed, but ID match is safer/faster
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'manager'
        AND profiles.company_id = sub_teams.company_id
    )
);

-- Policy: Team Leaders can view the sub-team they lead
CREATE POLICY "Leaders view own sub-team" 
ON public.sub_teams FOR SELECT 
TO authenticated 
USING (
    leader_id = auth.uid()
);

-- TRIGGER: Automatically update updated_at
CREATE EXTENSION IF NOT EXISTS moddatetime SCHEMA extensions;

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.sub_teams
  FOR EACH ROW EXECUTE PROCEDURE moddatetime (updated_at);
