-- Allow Key Account roles to read the warehouse user's profile for delivery
-- records they can already view. The delivery table already stores the actor
-- as purchase_order_deliveries.created_by; this policy only exposes that
-- profile row for display (full_name/email via the app query).

CREATE OR REPLACE FUNCTION public.key_account_role_can_view_delivery_creator_profile(p_profile_id uuid)
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
    WHERE pod.created_by = p_profile_id
      AND po.company_account_type = 'Key Accounts'
      AND po.company_id = pod.company_id
      AND (
        po.kam_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role = 'sales_admin'
            AND p.company_id = po.company_id
        )
        OR EXISTS (
          SELECT 1
          FROM public.profiles p
          INNER JOIN public.kam_director_assignments a ON a.director_id = p.id
          WHERE p.id = auth.uid()
            AND p.role = 'sales_director'
            AND a.kam_id = po.kam_id
        )
      )
  );
$$;

COMMENT ON FUNCTION public.key_account_role_can_view_delivery_creator_profile(uuid) IS
  'Lets Key Account KAM/Sales Admin/Sales Director read the warehouse profile that created a delivery row they can view.';

GRANT EXECUTE ON FUNCTION public.key_account_role_can_view_delivery_creator_profile(uuid) TO authenticated;

DROP POLICY IF EXISTS "Key Account roles can view delivery creator profiles" ON public.profiles;
CREATE POLICY "Key Account roles can view delivery creator profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.key_account_role_can_view_delivery_creator_profile(profiles.id));
