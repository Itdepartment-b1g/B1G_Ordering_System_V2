-- Super admin should see all mobile_sales / team_leader tasks in scope, not only
-- tasks they created (leader_id = auth.uid()).

-- Backfill company_id from assignee profile so company-scoped policies work.
UPDATE public.tasks t
SET company_id = p.company_id
FROM public.profiles p
WHERE t.agent_id = p.id
  AND t.company_id IS NULL
  AND p.company_id IS NOT NULL;

DROP POLICY IF EXISTS "Super admin can view company tasks" ON public.tasks;
DROP POLICY IF EXISTS "Super admin can update company tasks" ON public.tasks;
DROP POLICY IF EXISTS "Super admin can delete company tasks" ON public.tasks;

CREATE POLICY "Super admin can view company tasks"
ON public.tasks
FOR SELECT
USING (
  public.is_super_admin()
  AND EXISTS (
    SELECT 1
    FROM public.profiles agent
    WHERE agent.id = tasks.agent_id
      AND agent.role IN ('mobile_sales', 'team_leader')
      AND (
        public.get_super_admin_company_id() IS NULL
        OR agent.company_id = public.get_super_admin_company_id()
        OR tasks.company_id = public.get_super_admin_company_id()
        OR (
          tasks.company_id IS NOT NULL
          AND tasks.company_id = agent.company_id
        )
      )
  )
);

CREATE POLICY "Super admin can update company tasks"
ON public.tasks
FOR UPDATE
USING (
  public.is_super_admin()
  AND EXISTS (
    SELECT 1
    FROM public.profiles agent
    WHERE agent.id = tasks.agent_id
      AND agent.role IN ('mobile_sales', 'team_leader')
      AND (
        public.get_super_admin_company_id() IS NULL
        OR agent.company_id = public.get_super_admin_company_id()
        OR tasks.company_id = public.get_super_admin_company_id()
        OR (
          tasks.company_id IS NOT NULL
          AND tasks.company_id = agent.company_id
        )
      )
  )
)
WITH CHECK (
  public.is_super_admin()
  AND company_id = public.get_super_admin_company_id()
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = agent_id
      AND p.company_id = public.get_super_admin_company_id()
      AND p.role IN ('mobile_sales', 'team_leader')
  )
);

CREATE POLICY "Super admin can delete company tasks"
ON public.tasks
FOR DELETE
USING (
  public.is_super_admin()
  AND EXISTS (
    SELECT 1
    FROM public.profiles agent
    WHERE agent.id = tasks.agent_id
      AND agent.role IN ('mobile_sales', 'team_leader')
      AND (
        public.get_super_admin_company_id() IS NULL
        OR agent.company_id = public.get_super_admin_company_id()
        OR tasks.company_id = public.get_super_admin_company_id()
        OR (
          tasks.company_id IS NOT NULL
          AND tasks.company_id = agent.company_id
        )
      )
  )
);
