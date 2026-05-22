-- Fix statement timeouts on purchase_order_items + warehouse_locations embeds.
-- Previous policy re-scanned POs/items/deliveries per row; warehouse users hit it on every refresh.

CREATE OR REPLACE FUNCTION public.key_account_po_warehouse_location_visible(p_location_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.purchase_orders po
    WHERE po.company_account_type = 'Key Accounts'
      AND (
        po.warehouse_location_id = p_location_id
        OR EXISTS (
          SELECT 1
          FROM public.purchase_order_items poi
          WHERE poi.purchase_order_id = po.id
            AND poi.warehouse_location_id = p_location_id
        )
        OR EXISTS (
          SELECT 1
          FROM public.purchase_order_deliveries pod
          WHERE pod.purchase_order_id = po.id
            AND pod.warehouse_location_id = p_location_id
        )
      )
      AND (
        po.kam_id = auth.uid()
        OR po.created_by = auth.uid()
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

COMMENT ON FUNCTION public.key_account_po_warehouse_location_visible(uuid) IS
  'RLS helper: Key Account roles may read a warehouse_locations row referenced by their visible POs.';

GRANT EXECUTE ON FUNCTION public.key_account_po_warehouse_location_visible(uuid) TO authenticated;

DROP POLICY IF EXISTS "Key Account roles can view PO warehouse locations" ON public.warehouse_locations;
CREATE POLICY "Key Account roles can view PO warehouse locations"
  ON public.warehouse_locations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('key_account_manager', 'sales_admin', 'sales_director')
    )
    AND public.key_account_po_warehouse_location_visible(warehouse_locations.id)
  );

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_warehouse_location_id
  ON public.purchase_order_items(warehouse_location_id)
  WHERE warehouse_location_id IS NOT NULL;
