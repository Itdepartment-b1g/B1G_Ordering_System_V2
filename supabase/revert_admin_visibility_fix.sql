-- Revert the changes made by fix_admin_visibility_and_errors.sql
-- "remove this and the other policies to go back the way it was"

-- 1. Drop the view
DROP VIEW IF EXISTS public.client_order_stats;

-- 2. Drop the Profiles policy for Admins
DROP POLICY IF EXISTS "Admins and Super Admins can view all profiles in their company" ON public.profiles;

-- 3. Drop the Visit Logs policy for Admins
DROP POLICY IF EXISTS "Admins can view company visit logs" ON public.visit_logs;
