-- Let Standard Account buyer-company users read the warehouse profile that
-- fulfilled/dispatched a delivery row they can already view (full_name/email).

CREATE OR REPLACE FUNCTION public.standard_account_can_view_delivery_creator_profile(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.purchase_order_deliveries pod
    INNER JOIN public.purchase_orders po ON po.id = pod.purchase_order_id
    INNER JOIN public.profiles viewer ON viewer.id = auth.uid()
    WHERE pod.created_by = p_profile_id
      AND po.company_account_type = 'Standard Accounts'
      AND po.company_id = pod.company_id
      AND po.fulfillment_type = 'warehouse_transfer'
      AND viewer.company_id = po.company_id
  );
$$;

COMMENT ON FUNCTION public.standard_account_can_view_delivery_creator_profile(uuid) IS
  'Lets buyer-company users (e.g. super_admin) read the warehouse profile that created a Standard Account transfer delivery they can view.';

GRANT EXECUTE ON FUNCTION public.standard_account_can_view_delivery_creator_profile(uuid) TO authenticated;

DROP POLICY IF EXISTS "Standard Account buyers can view delivery creator profiles" ON public.profiles;
CREATE POLICY "Standard Account buyers can view delivery creator profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.standard_account_can_view_delivery_creator_profile(profiles.id));
