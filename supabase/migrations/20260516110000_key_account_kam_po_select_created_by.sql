-- Restrict KAM purchase order visibility to POs they created.
-- Sales Directors still use the separate director policy for assigned KAM approvals,
-- and can view their own created POs because director-created POs set kam_id = created_by.

DROP POLICY IF EXISTS "Key Account POs viewable by assigned KAM" ON public.purchase_orders;

CREATE POLICY "Key Account POs viewable by assigned KAM" ON public.purchase_orders
  FOR SELECT USING (
    company_account_type = 'Key Accounts'
    AND kam_id = auth.uid()
    AND created_by = auth.uid()
  );
