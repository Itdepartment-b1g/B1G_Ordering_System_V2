-- ============================================================================
-- FIX CLIENT ORDERS STAGE CONSTRAINT
-- ============================================================================
-- The previous constraint was missing 'finance_pending'.
-- This script replaces the old constraint with an updated one.
-- ============================================================================

-- 1. Drop the existing constraint
-- Note: Supabase often names check constraints as "table_column_check"
ALTER TABLE client_orders DROP CONSTRAINT IF EXISTS client_orders_stage_check;

-- 2. Add the updated constraint including 'finance_pending'
ALTER TABLE client_orders ADD CONSTRAINT client_orders_stage_check 
CHECK (stage IN ('agent_pending', 'finance_pending', 'leader_approved', 'admin_approved', 'leader_rejected', 'admin_rejected'));

-- 3. Verify
COMMENT ON COLUMN client_orders.stage IS 'Current approval stage of the order: agent_pending, finance_pending, leader_approved, admin_approved, leader_rejected, admin_rejected';
