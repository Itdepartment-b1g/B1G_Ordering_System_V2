-- ============================================================================
-- Add accounting role (view-only finance: same read access, no payment settings writes)
-- ============================================================================

ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_role_check CHECK (
  role = ANY (ARRAY[
    'system_administrator'::text,
    'super_admin'::text,
    'admin'::text,
    'finance'::text,
    'accounting'::text,
    'manager'::text,
    'team_leader'::text,
    'mobile_sales'::text,
    'executive'::text,
    'warehouse'::text,
    'sales_admin'::text,
    'sales_director'::text,
    'key_account_manager'::text
  ])
);

COMMENT ON CONSTRAINT profiles_role_check ON public.profiles IS
  'Includes accounting: view-only finance (no order approval or payment settings writes).';

-- Extend finance read policies to accounting (writes stay finance + super_admin only)

DROP POLICY IF EXISTS business_operations_finance_view ON public.business_operations;
CREATE POLICY business_operations_finance_view ON public.business_operations
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT profiles.company_id FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = ANY (ARRAY['finance'::text, 'accounting'::text])
    )
    AND operation_category = ANY (ARRAY['order'::text, 'finance'::text])
  );

DROP POLICY IF EXISTS finance_audit_access ON public.system_audit_log;
CREATE POLICY finance_audit_access ON public.system_audit_log
  FOR SELECT
  USING (
    company_id IN (
      SELECT profiles.company_id FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = ANY (ARRAY['finance'::text, 'accounting'::text])
    )
    AND table_name = ANY (ARRAY[
      'client_orders'::text,
      'cash_deposits'::text,
      'financial_transactions'::text,
      'purchase_orders'::text,
      'remittances_log'::text,
      'client_order_items'::text,
      'purchase_order_items'::text
    ])
  );

DROP POLICY IF EXISTS finance_business_audit_access ON public.business_audit_log;
CREATE POLICY finance_business_audit_access ON public.business_audit_log
  FOR SELECT
  USING (
    company_id IN (
      SELECT profiles.company_id FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = ANY (ARRAY['finance'::text, 'accounting'::text])
    )
    AND action_category = ANY (ARRAY[
      'orders'::text,
      'finance'::text,
      'cash_deposits'::text,
      'purchase_orders'::text
    ])
  );
