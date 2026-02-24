-- Migration to add pricing_strategy to client_orders
ALTER TABLE client_orders 
ADD COLUMN IF NOT EXISTS pricing_strategy TEXT DEFAULT 'rsp' 
CHECK (pricing_strategy IN ('rsp', 'dsp', 'special'));

-- Add index for filtering/reporting
CREATE INDEX IF NOT EXISTS idx_client_orders_pricing_strategy ON client_orders(pricing_strategy);

COMMENT ON COLUMN client_orders.pricing_strategy IS 'The pricing strategy used for this order (rsp, dsp, or special)';
