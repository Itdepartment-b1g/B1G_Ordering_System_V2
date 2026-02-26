-- Add notes/remarks column to cash_deposits table
ALTER TABLE cash_deposits
  ADD COLUMN IF NOT EXISTS notes TEXT;

COMMENT ON COLUMN cash_deposits.notes IS 'Optional notes or remarks recorded by the team leader when submitting a deposit';
