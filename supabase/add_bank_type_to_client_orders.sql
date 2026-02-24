-- ============================================================================
-- ADD BANK_TYPE COLUMN TO CLIENT_ORDERS TABLE
-- ============================================================================
-- This script adds a 'bank_type' column to track which bank was used for
-- bank transfer payments (Unionbank, BPI, or PBCOM)
-- ============================================================================

-- Add the bank_type column
ALTER TABLE client_orders
ADD COLUMN IF NOT EXISTS bank_type TEXT CHECK (bank_type IN ('Unionbank', 'BPI', 'PBCOM'));

-- Create an index for better query performance
CREATE INDEX IF NOT EXISTS idx_client_orders_bank_type ON client_orders(bank_type);

-- Add comment to the column
COMMENT ON COLUMN client_orders.bank_type IS 'Bank name used for bank transfer payments. Only populated when payment_method is BANK_TRANSFER.';

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================
-- Run this to verify the column was added:
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--     AND table_name = 'client_orders'
--     AND column_name = 'bank_type';
-- ============================================================================

