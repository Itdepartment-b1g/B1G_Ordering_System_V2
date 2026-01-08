-- ============================================================================
-- ADD REMITTANCE NOTES TO CLIENT ORDERS
-- ============================================================================
-- This adds support for agent notes/remarks on bank transfer orders
-- during the remittance process
-- ============================================================================

-- Add agent_remittance_notes column to client_orders
ALTER TABLE client_orders 
ADD COLUMN IF NOT EXISTS agent_remittance_notes TEXT;

-- Add index for performance (queries filtering by remitted status and notes)
CREATE INDEX IF NOT EXISTS idx_client_orders_remittance_notes 
ON client_orders(agent_id, remitted) 
WHERE agent_remittance_notes IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN client_orders.agent_remittance_notes IS 
'Agent notes/remarks added during end-of-day remittance, particularly for bank transfer orders';

