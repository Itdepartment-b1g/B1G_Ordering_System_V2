-- ============================================================================
-- ADD REMITTED COLUMN TO CLIENT_ORDERS TABLE (OPTIONAL)
-- ============================================================================
-- This script adds a 'remitted' boolean column to track if an order was included
-- in a remittance report. Note: Sold orders are NOT actually "remitted" (returned),
-- they are only included in remittance reports for tracking/reporting purposes.
-- Only unsold inventory is actually returned to the leader/manager.
-- ============================================================================
-- NOTE: This column is optional. If you prefer to query remittances_log.order_ids
-- directly, you can skip this migration. This column is mainly for easier filtering.
-- ============================================================================

-- Add the remitted column with default value false
ALTER TABLE client_orders 
ADD COLUMN IF NOT EXISTS remitted BOOLEAN DEFAULT FALSE NOT NULL;

-- Create an index for better query performance
CREATE INDEX IF NOT EXISTS idx_client_orders_remitted ON client_orders(remitted);

-- Update existing orders: mark as remitted if they exist in remittances_log
-- (for reporting purposes - these orders were included in a remittance report)
UPDATE client_orders co
SET remitted = TRUE
WHERE EXISTS (
    SELECT 1 
    FROM remittances_log rl
    WHERE co.id = ANY(rl.order_ids)
);

-- Add comment to the column
COMMENT ON COLUMN client_orders.remitted IS 'Indicates if this order was included in a remittance report (for reporting/tracking only - sold orders are not actually returned)';

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================
-- Run this to verify the column was added:
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--     AND table_name = 'client_orders'
--     AND column_name = 'remitted';
-- ============================================================================

