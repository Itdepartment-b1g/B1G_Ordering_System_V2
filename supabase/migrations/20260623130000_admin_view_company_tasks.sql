-- Company admins can view all tasks in their company (same scope as managers)

CREATE POLICY "Admins can view company tasks"
ON public.tasks
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
      AND p.company_id = tasks.company_id
  )
);
