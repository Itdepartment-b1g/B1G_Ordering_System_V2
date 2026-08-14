-- Let PO owner (kam_id) and creator see payment history, including on-behalf POs.
-- Sales Director can read all company KA payment history (same as Sales Admin/Head).

DROP POLICY IF EXISTS "KA PO payments: tenant select" ON public.purchase_order_key_account_payments;
CREATE POLICY "KA PO payments: tenant select"
  ON public.purchase_order_key_account_payments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.purchase_orders po
      WHERE po.id = purchase_order_key_account_payments.purchase_order_id
        AND po.company_account_type = 'Key Accounts'
        AND po.company_id = purchase_order_key_account_payments.company_id
        AND (
          po.kam_id = auth.uid()
          OR po.created_by = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.company_id = po.company_id
              AND (
                public.key_account_role_can_view_company_po(p.role)
                OR p.role = 'sales_director'
              )
          )
        )
    )
  );

COMMENT ON POLICY "KA PO payments: tenant select" ON public.purchase_order_key_account_payments IS
  'Owner, creator, Sales Director, Sales Admin/Head, and accounting can read all company KA payment history.';
