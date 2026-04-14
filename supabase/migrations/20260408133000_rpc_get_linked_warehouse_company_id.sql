-- Return the linked warehouse hub company_id for the current tenant (client company).
-- This avoids RLS issues where tenant users cannot read the warehouse user's profile row directly.

CREATE OR REPLACE FUNCTION public.get_linked_warehouse_company_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT wp.company_id
  FROM public.warehouse_company_assignments wca
  JOIN public.profiles wp ON wp.id = wca.warehouse_user_id
  WHERE wca.client_company_id = public.get_auth_company_id()
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_linked_warehouse_company_id() TO authenticated;

