-- Key Account PO workflow support:
-- - Add RFPF number field
-- - Allow Sales Admin / Sales Director to view + update Key Account POs for workflow steps

-- ---------------------------------------------------------------------------
-- 1) Add RFPF field to purchase_orders
-- ---------------------------------------------------------------------------
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS rfpf_number text;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_rfpf_number
  ON public.purchase_orders(rfpf_number)
  WHERE rfpf_number IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) RLS policies for Key Account workflow updates
-- ---------------------------------------------------------------------------
-- NOTE: We keep existing policies and add update policies scoped to Key Accounts workflow.
-- Directors can update POs that belong to KAMs assigned to them.
-- Sales Admin can view/update all Key Account POs inside their company.

-- Sales Admin visibility (SELECT) - if not already covered by existing policies
DROP POLICY IF EXISTS "Key Account POs viewable by sales_admin" ON public.purchase_orders;
CREATE POLICY "Key Account POs viewable by sales_admin" ON public.purchase_orders
  FOR SELECT USING (
    company_account_type = 'Key Accounts'
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'sales_admin'
        AND p.company_id = purchase_orders.company_id
    )
  );

-- Sales Admin can update workflow fields for Key Account POs in their company
DROP POLICY IF EXISTS "Key Account POs updatable by sales_admin" ON public.purchase_orders;
CREATE POLICY "Key Account POs updatable by sales_admin" ON public.purchase_orders
  FOR UPDATE USING (
    company_account_type = 'Key Accounts'
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'sales_admin'
        AND p.company_id = purchase_orders.company_id
    )
  )
  WITH CHECK (
    company_account_type = 'Key Accounts'
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'sales_admin'
        AND p.company_id = purchase_orders.company_id
    )
  );

-- Sales Director can update workflow fields for POs from their assigned KAMs
DROP POLICY IF EXISTS "Key Account POs updatable by director" ON public.purchase_orders;
CREATE POLICY "Key Account POs updatable by director" ON public.purchase_orders
  FOR UPDATE USING (
    company_account_type = 'Key Accounts'
    AND EXISTS (
      SELECT 1 FROM public.kam_director_assignments a
      WHERE a.kam_id = purchase_orders.kam_id
        AND a.director_id = auth.uid()
    )
  )
  WITH CHECK (
    company_account_type = 'Key Accounts'
    AND EXISTS (
      SELECT 1 FROM public.kam_director_assignments a
      WHERE a.kam_id = purchase_orders.kam_id
        AND a.director_id = auth.uid()
    )
  );

