CREATE TABLE IF NOT EXISTS public.key_account_monthly_sales_targets (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  assignee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assignee_role text NOT NULL,
  target_month date NOT NULL,
  target_revenue numeric(14,2) NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT key_account_monthly_sales_targets_role_check
    CHECK (assignee_role IN ('sales_head', 'sales_director', 'key_account_manager')),
  CONSTRAINT key_account_monthly_sales_targets_revenue_check
    CHECK (target_revenue >= 0),
  CONSTRAINT key_account_monthly_sales_targets_assignee_month_unique
    UNIQUE (assignee_id, target_month)
);

CREATE INDEX IF NOT EXISTS idx_ka_monthly_sales_targets_company_month
  ON public.key_account_monthly_sales_targets(company_id, target_month);
CREATE INDEX IF NOT EXISTS idx_ka_monthly_sales_targets_assignee
  ON public.key_account_monthly_sales_targets(assignee_id, target_month);
