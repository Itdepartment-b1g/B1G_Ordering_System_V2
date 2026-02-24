-- Create index for stock_requests filtering by leader and status
-- This helps finding pending, forwarded, and approved requests for a specific leader
CREATE INDEX IF NOT EXISTS idx_stock_requests_leader_status 
ON public.stock_requests (leader_id, status, requested_at DESC);

-- Create index for leader_teams to quickly find agents managed by a leader
CREATE INDEX IF NOT EXISTS idx_leader_teams_leader 
ON public.leader_teams (leader_id, agent_id);

-- Create index for agent_inventory lookups
-- Used heavily when calculating available stock for each request
CREATE INDEX IF NOT EXISTS idx_agent_inventory_lookup 
ON public.agent_inventory (agent_id, variant_id);

-- Create index for client_orders filtering by agent and status
-- Used to calculate reserved stock from pending orders
CREATE INDEX IF NOT EXISTS idx_client_orders_agent_status 
ON public.client_orders (agent_id, status);

-- Create index for client_order_items lookup
-- Used to get quantities from pending orders
CREATE INDEX IF NOT EXISTS idx_client_order_items_lookup 
ON public.client_order_items (client_order_id, variant_id);
