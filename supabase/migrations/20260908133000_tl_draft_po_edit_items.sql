-- Team Leaders may replace line items on their own draft warehouse-transfer POs
-- (before Super Admin endorses). Generic company item update/delete excludes team_leader.

DROP POLICY IF EXISTS "Users can update purchase_order_items in their company"
  ON public.purchase_order_items;
CREATE POLICY "Users can update purchase_order_items in their company"
  ON public.purchase_order_items FOR UPDATE
  USING (
    company_id = public.get_auth_company_id()
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'team_leader'
    )
  )
  WITH CHECK (
    company_id = public.get_auth_company_id()
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'team_leader'
    )
  );

DROP POLICY IF EXISTS "Users can delete purchase_order_items in their company"
  ON public.purchase_order_items;
CREATE POLICY "Users can delete purchase_order_items in their company"
  ON public.purchase_order_items FOR DELETE
  USING (
    company_id = public.get_auth_company_id()
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'team_leader'
    )
  );

DROP POLICY IF EXISTS "Team leaders can update items on own draft transfer POs"
  ON public.purchase_order_items;
CREATE POLICY "Team leaders can update items on own draft transfer POs"
  ON public.purchase_order_items FOR UPDATE
  USING (
    company_id = public.get_auth_company_id()
    AND EXISTS (
      SELECT 1
      FROM public.purchase_orders po
      WHERE po.id = purchase_order_items.purchase_order_id
        AND po.created_by = auth.uid()
        AND po.assigned_team_leader_id = auth.uid()
        AND po.fulfillment_type = 'warehouse_transfer'
        AND po.status = 'draft'
    )
  )
  WITH CHECK (
    company_id = public.get_auth_company_id()
    AND EXISTS (
      SELECT 1
      FROM public.purchase_orders po
      WHERE po.id = purchase_order_items.purchase_order_id
        AND po.created_by = auth.uid()
        AND po.assigned_team_leader_id = auth.uid()
        AND po.fulfillment_type = 'warehouse_transfer'
        AND po.status = 'draft'
    )
  );

DROP POLICY IF EXISTS "Team leaders can delete items on own draft transfer POs"
  ON public.purchase_order_items;
CREATE POLICY "Team leaders can delete items on own draft transfer POs"
  ON public.purchase_order_items FOR DELETE
  USING (
    company_id = public.get_auth_company_id()
    AND EXISTS (
      SELECT 1
      FROM public.purchase_orders po
      WHERE po.id = purchase_order_items.purchase_order_id
        AND po.created_by = auth.uid()
        AND po.assigned_team_leader_id = auth.uid()
        AND po.fulfillment_type = 'warehouse_transfer'
        AND po.status = 'draft'
    )
  );
