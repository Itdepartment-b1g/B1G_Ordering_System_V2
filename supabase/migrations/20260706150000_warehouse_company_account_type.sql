-- Allow Warehouse as a company_account_type for warehouse hub companies.
-- Idempotent: safe if constraint was already extended manually on prod.

ALTER TABLE public.companies
DROP CONSTRAINT IF EXISTS check_company_account_type;

ALTER TABLE public.companies
ADD CONSTRAINT check_company_account_type
CHECK (company_account_type IN ('Key Accounts', 'Standard Accounts', 'Warehouse'));

-- Backfill existing warehouse hub companies (profiles.role = 'warehouse').
UPDATE public.companies c
SET
  company_account_type = 'Warehouse',
  role = 'Warehouse',
  updated_at = now()
WHERE c.id IN (
  SELECT DISTINCT p.company_id
  FROM public.profiles p
  WHERE p.role = 'warehouse'
    AND p.company_id IS NOT NULL
)
AND (
  c.company_account_type IS DISTINCT FROM 'Warehouse'
  OR c.role IS DISTINCT FROM 'Warehouse'
);
