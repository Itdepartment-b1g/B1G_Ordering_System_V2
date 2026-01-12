-- Remove the existing check constraint
ALTER TABLE client_orders DROP CONSTRAINT IF EXISTS client_orders_payment_method_check;

-- Add the new check constraint including 'CHEQUE'
ALTER TABLE client_orders ADD CONSTRAINT client_orders_payment_method_check
  CHECK (payment_method IN ('GCASH', 'BANK_TRANSFER', 'CASH', 'CHEQUE'));
