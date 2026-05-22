-- Allow warehouse users to read KAM profiles for Key Account internal-transfer POs
-- they are already allowed to see (same gates as purchase_orders SELECT for warehouse).
-- Without this, key_account_* tables are visible via dedicated policies but profiles
-- stays company-scoped, so the PO embed kam:profiles and client-side lookups return null.

CREATE OR REPLACE FUNCTION public.warehouse_can_view_key_account_kam_profile(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.purchase_orders po
    WHERE po.kam_id = p_profile_id
      AND po.company_account_type = 'Key Accounts'
      AND po.fulfillment_type = 'warehouse_transfer'
      AND public.is_warehouse()
      AND public.warehouse_can_access_transfer_po(po.id, auth.uid())
      AND public.key_account_transfer_po_visible_to_warehouse(po.id)
  );
$$;

COMMENT ON FUNCTION public.warehouse_can_view_key_account_kam_profile(uuid) IS
  'True when the caller is a warehouse user who may SELECT this Key Account transfer PO; allows limited profiles read for po.kam_id (cross-company).';

GRANT EXECUTE ON FUNCTION public.warehouse_can_view_key_account_kam_profile(uuid) TO authenticated;

DROP POLICY IF EXISTS "Warehouse users can view KAM profile for visible Key Account transfer POs" ON public.profiles;
CREATE POLICY "Warehouse users can view KAM profile for visible Key Account transfer POs"
  ON public.profiles
  FOR SELECT
  USING (public.warehouse_can_view_key_account_kam_profile(profiles.id));
