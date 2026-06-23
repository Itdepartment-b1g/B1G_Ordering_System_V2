-- Super admin: full CRUD on company tasks assigned to mobile_sales / team_leader agents

CREATE POLICY "Super admin can view company tasks"
ON public.tasks
FOR SELECT
USING (
  public.is_super_admin()
  AND company_id = public.get_super_admin_company_id()
);

CREATE POLICY "Super admin can insert company tasks"
ON public.tasks
FOR INSERT
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

CREATE POLICY "Super admin can update company tasks"
ON public.tasks
FOR UPDATE
USING (
  public.is_super_admin()
  AND company_id = public.get_super_admin_company_id()
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
  AND company_id = public.get_super_admin_company_id()
);
