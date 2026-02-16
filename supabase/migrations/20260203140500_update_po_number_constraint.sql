-- Migration to update unique constraint on purchase_orders table
-- to be unique per company_id + po_number instead of just po_number

BEGIN;

-- Drop the existing unique constraint if it exists
ALTER TABLE purchase_orders 
DROP CONSTRAINT IF EXISTS purchase_orders_po_number_key;

-- Add the new unique constraint
ALTER TABLE purchase_orders 
ADD CONSTRAINT purchase_orders_po_number_company_id_key UNIQUE (company_id, po_number);

COMMIT;
