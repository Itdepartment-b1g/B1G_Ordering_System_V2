-- Let buyer-company users read per-location fulfillment status on their transfer POs
-- (needed for Standard Account PO view modal — multi-warehouse progress).

DROP POLICY IF EXISTS "Buyer company can read transfer location statuses" ON public.warehouse_transfer_location_status;
CREATE POLICY "Buyer company can read transfer location statuses"
  ON public.warehouse_transfer_location_status FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.purchase_orders po
      INNER JOIN public.profiles p ON p.id = auth.uid()
      WHERE po.id = warehouse_transfer_location_status.purchase_order_id
        AND po.company_id = p.company_id
        AND po.fulfillment_type = 'warehouse_transfer'
    )
  );
