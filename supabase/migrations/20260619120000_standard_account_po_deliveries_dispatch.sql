-- Standard Account warehouse transfer dispatch/delivery capture (parity with Key Accounts).

DROP POLICY IF EXISTS "Warehouse can view Standard Account PO deliveries" ON public.purchase_order_deliveries;
CREATE POLICY "Warehouse can view Standard Account PO deliveries"
  ON public.purchase_order_deliveries FOR SELECT
  USING (
    public.is_warehouse()
    AND EXISTS (
      SELECT 1
      FROM public.purchase_orders po
      WHERE po.id = purchase_order_deliveries.purchase_order_id
        AND po.company_account_type = 'Standard Accounts'
        AND public.warehouse_can_access_transfer_po(po.id, auth.uid())
        AND public.key_account_transfer_po_visible_to_warehouse(po.id)
    )
  );

DROP POLICY IF EXISTS "Warehouse can create Standard Account PO deliveries" ON public.purchase_order_deliveries;
CREATE POLICY "Warehouse can create Standard Account PO deliveries"
  ON public.purchase_order_deliveries FOR INSERT
  WITH CHECK (
    public.is_warehouse()
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.purchase_orders po
      WHERE po.id = purchase_order_deliveries.purchase_order_id
        AND po.company_account_type = 'Standard Accounts'
        AND po.company_id = purchase_order_deliveries.company_id
        AND public.warehouse_can_access_transfer_po(po.id, auth.uid())
        AND public.key_account_transfer_po_visible_to_warehouse(po.id)
    )
  );

-- Requesting company (buyer) can view dispatch records on their own transfer POs.
DROP POLICY IF EXISTS "Buyer company can view Standard Account PO deliveries" ON public.purchase_order_deliveries;
CREATE POLICY "Buyer company can view Standard Account PO deliveries"
  ON public.purchase_order_deliveries FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.purchase_orders po
      INNER JOIN public.profiles p ON p.id = auth.uid()
      WHERE po.id = purchase_order_deliveries.purchase_order_id
        AND po.company_account_type = 'Standard Accounts'
        AND po.company_id = purchase_order_deliveries.company_id
        AND po.company_id = p.company_id
        AND po.fulfillment_type = 'warehouse_transfer'
    )
  );
