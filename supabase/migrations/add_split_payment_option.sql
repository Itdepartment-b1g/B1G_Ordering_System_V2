-- ============================================================================
-- ADD SPLIT PAYMENT OPTION TO CLIENT ORDERS
-- ============================================================================
-- This migration adds the ability to split payments across multiple methods
-- while keeping the existing full payment flow completely unchanged
-- ============================================================================

-- Add payment mode column (defaults to FULL for backward compatibility)
ALTER TABLE client_orders 
  ADD COLUMN IF NOT EXISTS payment_mode TEXT 
    CHECK (payment_mode IN ('FULL', 'SPLIT')) 
    DEFAULT 'FULL';

-- Store split payment details as JSONB
-- Only populated when payment_mode = 'SPLIT'
-- Structure: [{"method": "BANK_TRANSFER", "bank": "BPI", "amount": 5000, "proof_url": "https://..."}]
ALTER TABLE client_orders 
  ADD COLUMN IF NOT EXISTS payment_splits JSONB DEFAULT '[]'::jsonb;

-- Index for filtering by payment mode
CREATE INDEX IF NOT EXISTS idx_client_orders_payment_mode 
  ON client_orders(payment_mode);

-- GIN index for querying JSONB data
CREATE INDEX IF NOT EXISTS idx_client_orders_payment_splits 
  ON client_orders USING GIN (payment_splits);

-- Add column comments
COMMENT ON COLUMN client_orders.payment_mode 
  IS 'Payment mode: FULL (current flow, single method) or SPLIT (2-3 methods)';

COMMENT ON COLUMN client_orders.payment_splits 
  IS 'Split payment details: [{method, bank, amount, proof_url}]. Empty for FULL payment.';

-- Note: Existing payment_method and payment_proof_url columns remain for FULL payment
-- This ensures backward compatibility with all existing orders

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Successfully added split payment option to client_orders table';
END $$;
