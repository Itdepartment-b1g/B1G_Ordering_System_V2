-- Add deposit_type column to cash_deposits table
-- Default to 'CASH' for existing records
ALTER TABLE public.cash_deposits 
ADD COLUMN IF NOT EXISTS deposit_type text DEFAULT 'CASH';

-- Add check constraint to ensure only valid values
ALTER TABLE public.cash_deposits 
ADD CONSTRAINT check_deposit_type CHECK (deposit_type IN ('CASH', 'CHEQUE'));

-- Create index for filtering by deposit_type
CREATE INDEX IF NOT EXISTS idx_cash_deposits_deposit_type ON public.cash_deposits(deposit_type);
