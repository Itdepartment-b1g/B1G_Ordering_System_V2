-- Migration: Add 'needs_revision' stage to client_orders
-- This enables the "Re-evaluate / Return to Agent" workflow

-- Drop existing constraint if it exists
ALTER TABLE client_orders DROP CONSTRAINT IF EXISTS client_orders_stage_check;

-- Add updated constraint including 'needs_revision'
ALTER TABLE client_orders ADD CONSTRAINT client_orders_stage_check 
CHECK (stage IN (
  'agent_pending', 
  'finance_pending', 
  'leader_approved', 
  'admin_approved', 
  'leader_rejected', 
  'admin_rejected',
  'needs_revision'
));

-- Update comment to document the new stage
COMMENT ON COLUMN client_orders.stage IS 'Current approval stage: agent_pending, finance_pending, leader_approved, admin_approved, leader_rejected, admin_rejected, needs_revision (for orders requiring agent revision)';

-- Note: 'needs_revision' stage allows agents to edit their orders before resubmitting to finance
