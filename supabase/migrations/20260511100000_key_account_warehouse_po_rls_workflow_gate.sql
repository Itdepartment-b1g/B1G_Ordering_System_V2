-- Gate warehouse visibility for Key Account internal-transfer POs until Sales Admin
-- releases them (workflow_status = warehouse_reserved) or they reach post-warehouse states.
-- Standard Accounts / non-Key transfers are unchanged.

-- ---------------------------------------------------------------------------
-- Helper: may warehouse users see this transfer PO (Key Account workflow gate)?
-- SECURITY DEFINER so purchase_order_items policies can call it without RLS recursion.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.key_account_transfer_po_visible_to_warehouse(p_po_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (
      SELECT
        CASE
          WHEN po.company_account_type IS DISTINCT FROM 'Key Accounts'::text THEN true
          WHEN po.workflow_status = ANY (
            ARRAY[
              'warehouse_reserved'::text,
              'approved'::text,
              'fulfilled'::text,
              'delivered'::text
            ]
          ) THEN true
          ELSE false
        END
      FROM public.purchase_orders po
      WHERE po.id = p_po_id
    ),
    false
  );
$$;

COMMENT ON FUNCTION public.key_account_transfer_po_visible_to_warehouse(uuid) IS
  'For purchase_orders: Standard (non-Key) transfers always visible to warehouse when other RLS passes. Key Account transfers are hidden until workflow_status is warehouse_reserved or a post-release state (approved/fulfilled/delivered).';

GRANT EXECUTE ON FUNCTION public.key_account_transfer_po_visible_to_warehouse(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- purchase_orders: warehouse hub SELECT / UPDATE
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Warehouse users can view transfer POs for their hub" ON public.purchase_orders;
CREATE POLICY "Warehouse users can view transfer POs for their hub"
  ON public.purchase_orders FOR SELECT
  USING (
    public.is_warehouse()
    AND public.warehouse_can_access_transfer_po(purchase_orders.id, auth.uid())
    AND public.key_account_transfer_po_visible_to_warehouse(purchase_orders.id)
  );

DROP POLICY IF EXISTS "Warehouse users can update transfer POs for their hub" ON public.purchase_orders;
CREATE POLICY "Warehouse users can update transfer POs for their hub"
  ON public.purchase_orders FOR UPDATE
  USING (
    public.is_warehouse()
    AND public.warehouse_can_access_transfer_po(purchase_orders.id, auth.uid())
    AND public.key_account_transfer_po_visible_to_warehouse(purchase_orders.id)
  )
  WITH CHECK (
    public.is_warehouse()
    AND fulfillment_type = 'warehouse_transfer'
    AND warehouse_company_id = public.get_auth_company_id()
  );

-- ---------------------------------------------------------------------------
-- purchase_order_items: warehouse SELECT (same gate on parent PO)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Warehouse users can view items for transfer POs" ON public.purchase_order_items;
CREATE POLICY "Warehouse users can view items for transfer POs"
  ON public.purchase_order_items FOR SELECT
  USING (
    public.is_warehouse()
    AND public.warehouse_can_access_transfer_po(purchase_order_items.purchase_order_id, auth.uid())
    AND public.key_account_transfer_po_visible_to_warehouse(purchase_order_items.purchase_order_id)
    AND (
      public.is_main_warehouse_user(auth.uid())
      OR purchase_order_items.warehouse_location_id = public.get_warehouse_location_id(auth.uid())
    )
  );
