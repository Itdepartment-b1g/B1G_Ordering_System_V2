-- RLS updates for multi-location warehouse transfers + tenant visibility of location stock

-- ---------------------------------------------------------------------------
-- 1) purchase_orders: warehouse inbox should work for both single-location and multi-location transfers
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Warehouse users can view transfer POs for their hub" ON public.purchase_orders;
CREATE POLICY "Warehouse users can view transfer POs for their hub"
  ON public.purchase_orders FOR SELECT
  USING (
    public.is_warehouse()
    AND fulfillment_type = 'warehouse_transfer'
    AND warehouse_company_id = public.get_auth_company_id()
    AND (
      public.is_main_warehouse_user(auth.uid())
      OR warehouse_location_id = public.get_warehouse_location_id(auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.purchase_order_items poi
        WHERE poi.purchase_order_id = purchase_orders.id
          AND poi.warehouse_location_id = public.get_warehouse_location_id(auth.uid())
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.warehouse_company_assignments wca
      JOIN public.profiles wp ON wp.id = wca.warehouse_user_id
      WHERE wca.client_company_id = purchase_orders.company_id
        AND wp.company_id = purchase_orders.warehouse_company_id
    )
  );

DROP POLICY IF EXISTS "Warehouse users can update transfer POs for their hub" ON public.purchase_orders;
CREATE POLICY "Warehouse users can update transfer POs for their hub"
  ON public.purchase_orders FOR UPDATE
  USING (
    public.is_warehouse()
    AND fulfillment_type = 'warehouse_transfer'
    AND warehouse_company_id = public.get_auth_company_id()
    AND (
      public.is_main_warehouse_user(auth.uid())
      OR warehouse_location_id = public.get_warehouse_location_id(auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.purchase_order_items poi
        WHERE poi.purchase_order_id = purchase_orders.id
          AND poi.warehouse_location_id = public.get_warehouse_location_id(auth.uid())
      )
    )
  )
  WITH CHECK (
    public.is_warehouse()
    AND fulfillment_type = 'warehouse_transfer'
    AND warehouse_company_id = public.get_auth_company_id()
  );

-- ---------------------------------------------------------------------------
-- 2) purchase_order_items: sub-warehouse should only see its slice; main sees all
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Warehouse users can view items for transfer POs" ON public.purchase_order_items;
CREATE POLICY "Warehouse users can view items for transfer POs"
  ON public.purchase_order_items FOR SELECT
  USING (
    public.is_warehouse()
    AND EXISTS (
      SELECT 1
      FROM public.purchase_orders po
      WHERE po.id = purchase_order_items.purchase_order_id
        AND po.fulfillment_type = 'warehouse_transfer'
        AND po.warehouse_company_id = public.get_auth_company_id()
        AND (
          public.is_main_warehouse_user(auth.uid())
          OR po.warehouse_location_id = public.get_warehouse_location_id(auth.uid())
          OR purchase_order_items.warehouse_location_id = public.get_warehouse_location_id(auth.uid())
        )
        AND EXISTS (
          SELECT 1
          FROM public.warehouse_company_assignments wca
          JOIN public.profiles wp ON wp.id = wca.warehouse_user_id
          WHERE wca.client_company_id = po.company_id
            AND wp.company_id = po.warehouse_company_id
        )
    )
  );

-- ---------------------------------------------------------------------------
-- 3) New tables: reservations + location statuses
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Warehouse can read transfer reservations" ON public.warehouse_transfer_reservations;
CREATE POLICY "Warehouse can read transfer reservations"
  ON public.warehouse_transfer_reservations FOR SELECT
  USING (
    public.is_warehouse()
    AND warehouse_company_id = public.get_auth_company_id()
    AND (
      public.is_main_warehouse_user(auth.uid())
      OR warehouse_location_id = public.get_warehouse_location_id(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Warehouse can read transfer location statuses" ON public.warehouse_transfer_location_status;
CREATE POLICY "Warehouse can read transfer location statuses"
  ON public.warehouse_transfer_location_status FOR SELECT
  USING (
    public.is_warehouse()
    AND warehouse_company_id = public.get_auth_company_id()
    AND (
      public.is_main_warehouse_user(auth.uid())
      OR warehouse_location_id = public.get_warehouse_location_id(auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 4) Tenant visibility: allow linked client company to see per-location stock for requested hub
--    Needed for moto sales stock-by-location UI when building internal transfer POs.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Tenant can view linked hub location inventory" ON public.warehouse_location_inventory;
CREATE POLICY "Tenant can view linked hub location inventory"
  ON public.warehouse_location_inventory FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'manager'::text, 'team_leader'::text, 'mobile_sales'::text])
    )
    AND public.get_linked_warehouse_company_id() IS NOT NULL
    AND warehouse_location_inventory.company_id = public.get_linked_warehouse_company_id()
  );

