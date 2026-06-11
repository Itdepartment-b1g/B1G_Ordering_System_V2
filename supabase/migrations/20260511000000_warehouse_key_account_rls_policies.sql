-- ============================================================================
-- WAREHOUSE KEY ACCOUNT RLS POLICIES
-- Allows warehouse users to view Key Account data for POs assigned to them
-- ============================================================================

-- 1. Key Account Clients - Warehouse can view clients for their assigned POs
CREATE POLICY "Key Account clients viewable by warehouse for assigned POs" 
ON public.key_account_clients
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.purchase_orders
    JOIN public.profiles ON profiles.company_id = purchase_orders.warehouse_company_id
    WHERE purchase_orders.key_account_client_id = key_account_clients.id
    AND profiles.id = auth.uid()
    AND profiles.role = 'warehouse'
  )
);

-- 2. Key Account Shops - Warehouse can view shops for their assigned POs
CREATE POLICY "Key Account shops viewable by warehouse for assigned POs" 
ON public.key_account_shops
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.purchase_orders
    JOIN public.profiles ON profiles.company_id = purchase_orders.warehouse_company_id
    WHERE purchase_orders.key_account_shop_id = key_account_shops.id
    AND profiles.id = auth.uid()
    AND profiles.role = 'warehouse'
  )
);

-- 3. Key Account Delivery Addresses - Warehouse can view addresses for their assigned POs
CREATE POLICY "Key Account addresses viewable by warehouse for assigned POs" 
ON public.key_account_delivery_addresses
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.purchase_orders
    JOIN public.profiles ON profiles.company_id = purchase_orders.warehouse_company_id
    WHERE purchase_orders.key_account_address_id = key_account_delivery_addresses.id
    AND profiles.id = auth.uid()
    AND profiles.role = 'warehouse'
  )
);
