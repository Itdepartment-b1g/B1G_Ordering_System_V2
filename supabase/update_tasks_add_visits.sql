-- 1. Add columns to 'tasks' table
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id),
ADD COLUMN IF NOT EXISTS location_latitude FLOAT,
ADD COLUMN IF NOT EXISTS location_longitude FLOAT,
ADD COLUMN IF NOT EXISTS location_address TEXT;

-- Update the view to include new columns
DROP VIEW IF EXISTS public.task_details;
CREATE VIEW public.task_details AS
SELECT
    t.id,
    t.leader_id,
    l.full_name AS leader_name,
    l.email AS leader_email,
    t.agent_id,
    a.full_name AS agent_name,
    a.email AS agent_email,
    t.client_id,
    c.name AS client_name,
    c.company AS client_company,
    c.location_latitude AS client_latitude,
    c.location_longitude AS client_longitude,
    t.title,
    t.description,
    t.status,
    t.priority,
    t.created_at,
    t.given_at,
    t.completed_at,
    t.due_date,
    t.time,
    t.notes,
    t.attachment_url,
    t.location_latitude,
    t.location_longitude,
    t.location_address,
    -- Calculate urgency status dynamically
    CASE
        WHEN t.status = 'completed' THEN 'on_time'
        WHEN t.due_date < NOW() AND t.status != 'completed' THEN 'overdue'
        WHEN t.due_date < (NOW() + INTERVAL '1 day') AND t.status != 'completed' THEN 'due_soon'
        ELSE 'on_time'
    END AS urgency_status,
    t.company_id
FROM
    public.tasks t
LEFT JOIN
    public.profiles l ON t.leader_id = l.id
LEFT JOIN
    public.profiles a ON t.agent_id = a.id
LEFT JOIN
    public.clients c ON t.client_id = c.id;

-- 2. Create 'visit_logs' table
CREATE TABLE IF NOT EXISTS public.visit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID REFERENCES public.companies(id),
    agent_id UUID REFERENCES public.profiles(id) NOT NULL,
    client_id UUID REFERENCES public.clients(id) NOT NULL,
    task_id UUID REFERENCES public.tasks(id), -- Optional: link to a specific task
    
    visited_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Location where the visit log was created (Agent's location)
    latitude FLOAT NOT NULL,
    longitude FLOAT NOT NULL,
    address TEXT,
    
    -- Verification details
    is_within_radius BOOLEAN DEFAULT false,
    distance_meters FLOAT,
    radius_limit_meters FLOAT DEFAULT 100.0,
    
    photo_url TEXT,
    notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for visit_logs
ALTER TABLE public.visit_logs ENABLE ROW LEVEL SECURITY;

-- Policies for visit_logs

-- Agents can insert their own logs
CREATE POLICY "Agents can add visit logs" ON public.visit_logs
FOR INSERT
WITH CHECK (agent_id = auth.uid());

-- Agents can view their own logs
CREATE POLICY "Agents can view own visit logs" ON public.visit_logs
FOR SELECT
USING (agent_id = auth.uid());

-- Managers can view company logs
CREATE POLICY "Managers can view company visit logs" ON public.visit_logs
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
        AND p.role = 'manager'
        AND p.company_id = visit_logs.company_id
    )
);

-- Leaders can view team logs
CREATE POLICY "Leaders can view team visit logs" ON public.visit_logs
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.leader_teams lt
        WHERE lt.leader_id = auth.uid()
        AND lt.agent_id = visit_logs.agent_id
    )
);

GRANT SELECT, INSERT ON public.visit_logs TO authenticated;
