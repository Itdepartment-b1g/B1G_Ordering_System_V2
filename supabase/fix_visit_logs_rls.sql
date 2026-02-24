-- Fix RLS policies for visit_logs to allows Admins to view logs
-- Currently only Agents, Managers, and Leaders have policies.

-- Policy: Admins can view company visit logs
-- This assumes admins have a profile with role 'admin' OR are super admins (service_role checks bypass RLS anyway, but authenticated admins need this).

DROP POLICY IF EXISTS "Admins can view company visit logs" ON public.visit_logs;

CREATE POLICY "Admins can view company visit logs" ON public.visit_logs
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
        AND (p.role = 'admin' OR p.role = 'super_admin')
        AND p.company_id = visit_logs.company_id
    )
);

-- Also, just in case, backfill company_id for any logs that might have missed it (e.g. if user.company_id was undefined during dev)
UPDATE public.visit_logs v
SET company_id = p.company_id
FROM public.profiles p
WHERE v.agent_id = p.id
AND v.company_id IS NULL
OR v.company_id = '00000000-0000-0000-0000-000000000000'; -- UUID nil
