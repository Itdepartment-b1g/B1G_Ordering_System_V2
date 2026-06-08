-- Scope disposal visibility: main warehouse sees all locations (oversight);
-- sub-warehouse users see only disposals for their assigned location.

DROP POLICY IF EXISTS "Warehouse disposals viewable" ON public.warehouse_inventory_disposals;
CREATE POLICY "Warehouse disposals viewable" ON public.warehouse_inventory_disposals
  FOR SELECT
  USING (
    (
      public.is_warehouse()
      AND warehouse_inventory_disposals.company_id = public.get_auth_company_id()
      AND (
        public.is_main_warehouse_user(auth.uid())
        OR warehouse_inventory_disposals.warehouse_location_id = public.get_warehouse_location_id(auth.uid())
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.key_account_po_rebates r
      WHERE r.id = warehouse_inventory_disposals.rebate_id
        AND public.key_account_user_may_manage_rebate(r.purchase_order_id)
    )
  );
