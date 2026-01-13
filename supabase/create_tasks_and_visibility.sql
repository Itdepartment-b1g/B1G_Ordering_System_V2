-- Create tasks table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID REFERENCES public.companies(id),
    agent_id UUID REFERENCES public.profiles(id) NOT NULL,
    leader_id UUID REFERENCES public.profiles(id), -- The one who assigned the task (optional)
    title TEXT NOT NULL,
    description TEXT,
    status TEXT CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')) DEFAULT 'pending',
    priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
    due_date TIMESTAMPTZ,
    time TEXT, -- Stored as HH:MM or similar text format
    notes TEXT,
    attachment_url TEXT,
    given_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------------------------
-- RLS POLICIES
-- -------------------------------------------------------------------------

-- Policy 1: Agents can see their own tasks
CREATE POLICY "Agents can view own tasks" ON public.tasks
FOR SELECT
USING (agent_id = auth.uid());

-- Policy 2: Agents can update their own tasks (e.g., status, notes)
CREATE POLICY "Agents can update own tasks" ON public.tasks
FOR UPDATE
USING (agent_id = auth.uid());

-- Policy 3: Agents can insert tasks for themselves (Daily tasks)
CREATE POLICY "Agents can insert own tasks" ON public.tasks
FOR INSERT
WITH CHECK (agent_id = auth.uid());

-- Policy 4: Leaders can view tasks of agents in their sub-teams
-- They can also view tasks they assigned (leader_id = auth.uid())
CREATE POLICY "Leaders can view team tasks" ON public.tasks
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.leader_teams lt
        WHERE lt.leader_id = auth.uid()
        AND lt.agent_id = tasks.agent_id
    ) OR leader_id = auth.uid()
);

-- Policy 5: Leaders can insert/update tasks for their team
CREATE POLICY "Leaders can manage team tasks" ON public.tasks
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.leader_teams lt
        WHERE lt.leader_id = auth.uid()
        AND lt.agent_id = tasks.agent_id
    ) OR leader_id = auth.uid()
);

-- Policy 6: Managers can view ALL tasks in their company
CREATE POLICY "Managers can view company tasks" ON public.tasks
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
        AND p.role = 'manager'
        AND p.company_id = tasks.company_id
    )
);

-- Policy 7: Managers can manage ALL tasks in their company
CREATE POLICY "Managers can manage company tasks" ON public.tasks
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
        AND p.role = 'manager'
        AND p.company_id = tasks.company_id
    )
);

-- -------------------------------------------------------------------------
-- VIEW: task_details
-- -------------------------------------------------------------------------

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
    public.profiles a ON t.agent_id = a.id;

-- Grant permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT SELECT ON public.task_details TO authenticated;
