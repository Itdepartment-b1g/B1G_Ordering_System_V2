-- Fix statement timeouts when warehouse fulfills/delivers Key Account POs (incl. Sales Head–created POs).
-- Root causes:
-- 1) key_account_clients/shops/addresses warehouse policies scanned purchase_orders without workflow/hub gates.
-- 2) key_account_po_warehouse_location_visible scanned all KA POs per location (no warehouse fast path).

-- ---------------------------------------------------------------------------
-- 1) Helpers: warehouse may read KA reference data only for POs they can already see
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.warehouse_can_view_key_account_client(p_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.purchase_orders po
    WHERE po.key_account_client_id = p_client_id
      AND po.company_account_type = 'Key Accounts'
      AND public.is_warehouse()
      AND public.warehouse_can_access_transfer_po(po.id, auth.uid())
      AND public.key_account_transfer_po_visible_to_warehouse(po.id)
  );
$$;

CREATE OR REPLACE FUNCTION public.warehouse_can_view_key_account_shop(p_shop_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.purchase_orders po
    WHERE po.key_account_shop_id = p_shop_id
      AND po.company_account_type = 'Key Accounts'
      AND public.is_warehouse()
      AND public.warehouse_can_access_transfer_po(po.id, auth.uid())
      AND public.key_account_transfer_po_visible_to_warehouse(po.id)
  );
$$;

CREATE OR REPLACE FUNCTION public.warehouse_can_view_key_account_address(p_address_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.purchase_orders po
    WHERE po.key_account_address_id = p_address_id
      AND po.company_account_type = 'Key Accounts'
      AND public.is_warehouse()
      AND public.warehouse_can_access_transfer_po(po.id, auth.uid())
      AND public.key_account_transfer_po_visible_to_warehouse(po.id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.warehouse_can_view_key_account_client(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.warehouse_can_view_key_account_shop(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.warehouse_can_view_key_account_address(uuid) TO authenticated;

DROP POLICY IF EXISTS "Key Account clients viewable by warehouse for assigned POs" ON public.key_account_clients;
CREATE POLICY "Key Account clients viewable by warehouse for assigned POs"
  ON public.key_account_clients
  FOR SELECT
  USING (public.warehouse_can_view_key_account_client(key_account_clients.id));

DROP POLICY IF EXISTS "Key Account shops viewable by warehouse for assigned POs" ON public.key_account_shops;
CREATE POLICY "Key Account shops viewable by warehouse for assigned POs"
  ON public.key_account_shops
  FOR SELECT
  USING (public.warehouse_can_view_key_account_shop(key_account_shops.id));

DROP POLICY IF EXISTS "Key Account addresses viewable by warehouse for assigned POs" ON public.key_account_delivery_addresses;
CREATE POLICY "Key Account addresses viewable by warehouse for assigned POs"
  ON public.key_account_delivery_addresses
  FOR SELECT
  USING (public.warehouse_can_view_key_account_address(key_account_delivery_addresses.id));

-- ---------------------------------------------------------------------------
-- 2) Faster KAM profile check (indexed path, same gates as PO visibility)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.warehouse_can_view_key_account_kam_profile(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
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

-- ---------------------------------------------------------------------------
-- 3) warehouse_locations: warehouse fast path + bounded KA tenant check
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.key_account_po_warehouse_location_visible(p_location_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT
    -- Warehouse hub users: own-company locations (no full KA PO scan)
    (
      public.is_warehouse()
      AND EXISTS (
        SELECT 1
        FROM public.warehouse_locations wl
        WHERE wl.id = p_location_id
          AND wl.company_id = public.get_auth_company_id()
      )
    )
    OR EXISTS (
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
              AND public.key_account_role_can_view_company_po(p.role)
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
      LIMIT 1
    );
$$;

DROP POLICY IF EXISTS "Key Account roles can view PO warehouse locations" ON public.warehouse_locations;
CREATE POLICY "Key Account roles can view PO warehouse locations"
  ON public.warehouse_locations
  FOR SELECT
  TO authenticated
  USING (
    public.is_warehouse()
    OR (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = ANY (ARRAY[
            'key_account_manager'::text,
            'sales_admin'::text,
            'sales_head'::text,
            'sales_director'::text,
            'key_account_accounting'::text
          ])
      )
      AND public.key_account_po_warehouse_location_visible(warehouse_locations.id)
    )
  );

-- ---------------------------------------------------------------------------
-- 4) Indexes for KA PO / delivery lookups under RLS helpers
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_purchase_orders_ka_client
  ON public.purchase_orders(key_account_client_id)
  WHERE company_account_type = 'Key Accounts' AND key_account_client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_ka_shop
  ON public.purchase_orders(key_account_shop_id)
  WHERE company_account_type = 'Key Accounts' AND key_account_shop_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_ka_address
  ON public.purchase_orders(key_account_address_id)
  WHERE company_account_type = 'Key Accounts' AND key_account_address_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_ka_kam
  ON public.purchase_orders(kam_id)
  WHERE company_account_type = 'Key Accounts' AND kam_id IS NOT NULL;
