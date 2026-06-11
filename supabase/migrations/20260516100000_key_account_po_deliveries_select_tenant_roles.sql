-- Allow Key Account tenant roles (KAM, Sales Admin, Sales Director) to read dispatch rows
-- for their company's Key Account POs. Warehouse already has a separate SELECT policy.

DROP POLICY IF EXISTS "Key Account roles can view PO deliveries for their company" ON public.purchase_order_deliveries;
CREATE POLICY "Key Account roles can view PO deliveries for their company"
  ON public.purchase_order_deliveries
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.purchase_orders po
      WHERE po.id = purchase_order_deliveries.purchase_order_id
        AND po.company_account_type = 'Key Accounts'
        AND po.company_id = purchase_order_deliveries.company_id
        AND (
          po.kam_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role = 'sales_admin'
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
    )
  );
