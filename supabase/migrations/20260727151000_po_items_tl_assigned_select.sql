-- Allow assigned team leaders to read line items on their transfer POs.
-- Events already use "select via parent"; items need an explicit path for TL role.

DROP POLICY IF EXISTS "Team leaders can view items on assigned transfer POs"
  ON public.purchase_order_items;
CREATE POLICY "Team leaders can view items on assigned transfer POs"
  ON public.purchase_order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.purchase_orders po
      WHERE po.id = purchase_order_items.purchase_order_id
        AND po.assigned_team_leader_id = auth.uid()
        AND po.fulfillment_type = 'warehouse_transfer'
    )
  );
