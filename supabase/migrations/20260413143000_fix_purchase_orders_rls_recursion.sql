-- Fix infinite recursion in RLS between purchase_orders <-> purchase_order_items.
-- Root cause: purchase_orders policy referenced purchase_order_items (EXISTS),
-- while purchase_order_items policy referenced purchase_orders (EXISTS).
--
-- Approach: move the cross-table check into a SECURITY DEFINER helper function
-- (bypasses RLS unless FORCE ROW LEVEL SECURITY is enabled), then reference that function
-- from policies so they no longer mutually depend on each other’s RLS evaluation.

-- ---------------------------------------------------------------------------
-- Helper: can this warehouse user access a warehouse_transfer PO?
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.warehouse_can_access_transfer_po(p_po_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  po_record RECORD;
  v_user_location uuid;
BEGIN
  SELECT id, company_id, fulfillment_type, warehouse_company_id, warehouse_location_id
  INTO po_record
  FROM public.purchase_orders
  WHERE id = p_po_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF po_record.fulfillment_type IS DISTINCT FROM 'warehouse_transfer' THEN
    RETURN false;
  END IF;

  -- Warehouse company must match the current warehouse user's company
  IF po_record.warehouse_company_id IS DISTINCT FROM public.get_auth_company_id() THEN
    RETURN false;
  END IF;

  -- Must be assigned to fulfill transfers for this client company
  IF NOT EXISTS (
    SELECT 1
    FROM public.warehouse_company_assignments wca
    WHERE wca.client_company_id = po_record.company_id
      AND wca.warehouse_company_id = po_record.warehouse_company_id
  ) THEN
    RETURN false;
  END IF;

  -- Main warehouse user: can see all transfer POs for their company
  IF public.is_main_warehouse_user(p_user_id) THEN
    RETURN true;
  END IF;

  v_user_location := public.get_warehouse_location_id(p_user_id);
  IF v_user_location IS NULL THEN
    RETURN false;
  END IF;

  -- Legacy single-location PO: header location match
  IF po_record.warehouse_location_id IS NOT NULL AND po_record.warehouse_location_id = v_user_location THEN
    RETURN true;
  END IF;

  -- Multi-location PO: any item for user's location
  IF EXISTS (
    SELECT 1
    FROM public.purchase_order_items poi
    WHERE poi.purchase_order_id = p_po_id
      AND poi.warehouse_location_id = v_user_location
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.warehouse_can_access_transfer_po(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- purchase_orders policies (warehouse inbox) — rebuilt using helper
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Warehouse users can view transfer POs for their hub" ON public.purchase_orders;
CREATE POLICY "Warehouse users can view transfer POs for their hub"
  ON public.purchase_orders FOR SELECT
  USING (
    public.is_warehouse()
    AND public.warehouse_can_access_transfer_po(purchase_orders.id, auth.uid())
  );

DROP POLICY IF EXISTS "Warehouse users can update transfer POs for their hub" ON public.purchase_orders;
CREATE POLICY "Warehouse users can update transfer POs for their hub"
  ON public.purchase_orders FOR UPDATE
  USING (
    public.is_warehouse()
    AND public.warehouse_can_access_transfer_po(purchase_orders.id, auth.uid())
  )
  WITH CHECK (
    public.is_warehouse()
    AND fulfillment_type = 'warehouse_transfer'
    AND warehouse_company_id = public.get_auth_company_id()
  );

-- ---------------------------------------------------------------------------
-- purchase_order_items policies — rebuilt to avoid recursion
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Warehouse users can view items for transfer POs" ON public.purchase_order_items;
CREATE POLICY "Warehouse users can view items for transfer POs"
  ON public.purchase_order_items FOR SELECT
  USING (
    public.is_warehouse()
    AND public.warehouse_can_access_transfer_po(purchase_order_items.purchase_order_id, auth.uid())
    AND (
      public.is_main_warehouse_user(auth.uid())
      OR purchase_order_items.warehouse_location_id = public.get_warehouse_location_id(auth.uid())
    )
  );

