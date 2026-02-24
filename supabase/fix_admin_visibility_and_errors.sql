-- Comprehensive fix for Admin/Super Admin visibility and 404 errors

-- 1. Create Missing View: client_order_stats
-- This fixes the 404 error on Clients Page
CREATE OR REPLACE VIEW public.client_order_stats AS
SELECT
    co.client_id,
    co.agent_id,
    co.company_id,
    COUNT(co.id) AS total_orders,
    COALESCE(SUM(co.total_amount), 0) AS total_spent,
    MAX(co.order_date) AS last_order_date
FROM
    public.client_orders co
WHERE
    co.status = 'approved' OR co.stage = 'admin_approved' -- Only count approved orders
GROUP BY
    co.client_id,
    co.agent_id,
    co.company_id;

-- Grant access to the view
GRANT SELECT ON public.client_order_stats TO authenticated;

-- 2. Fix "Unknown" Agent Name (Profiles Visibility)
-- Ensure Admins and Super Admins can view ALL profiles in their company
DROP POLICY IF EXISTS "Admins and Super Admins can view all profiles in their company" ON public.profiles;

CREATE POLICY "Admins and Super Admins can view all profiles in their company"
ON public.profiles
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
        AND (p.role = 'admin' OR p.role = 'super_admin')
        AND p.company_id = profiles.company_id
    )
);

-- 3. Fix "Visits: 0" (Visit Logs Visibility)
-- Ensure Admins and Super Admins can view ALL visit logs in their company
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

-- Backfill missing company_id in visit_logs just in case
UPDATE public.visit_logs v
SET company_id = p.company_id
FROM public.profiles p
WHERE v.agent_id = p.id
AND (v.company_id IS NULL OR v.company_id = '00000000-0000-0000-0000-000000000000');
