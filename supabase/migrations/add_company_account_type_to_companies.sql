-- Add company_account_type column to companies table
ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS company_account_type text DEFAULT 'Standard Accounts';

-- Add check constraint to ensure only valid values are accepted
ALTER TABLE companies 
DROP CONSTRAINT IF EXISTS check_company_account_type;

ALTER TABLE companies 
ADD CONSTRAINT check_company_account_type 
CHECK (company_account_type IN ('Key Accounts', 'Standard Accounts'));
