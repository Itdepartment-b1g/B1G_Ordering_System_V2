-- ============================================================================
-- INVENTORY RETURNS SCHEMA
-- ============================================================================
-- This schema handles inventory returns from agents to leaders
-- Use cases: Resignation, leave, termination, recalls, etc.
-- ============================================================================

-- Main returns table
CREATE TABLE IF NOT EXISTS inventory_returns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id),
  agent_id UUID NOT NULL REFERENCES profiles(id),
  receiver_id UUID NOT NULL REFERENCES profiles(id),
  return_date TIMESTAMP NOT NULL DEFAULT NOW(),
  return_type TEXT NOT NULL CHECK (return_type IN ('full', 'partial')),
  return_reason TEXT NOT NULL,
  reason_notes TEXT,
  signature_url TEXT,
  signature_path TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Return items detail
CREATE TABLE IF NOT EXISTS inventory_return_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_id UUID NOT NULL REFERENCES inventory_returns(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES variants(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  allocated_price NUMERIC(10,2),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_inventory_returns_agent 
ON inventory_returns(agent_id, return_date DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_returns_receiver 
ON inventory_returns(receiver_id, return_date DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_returns_company 
ON inventory_returns(company_id, return_date DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_return_items_return 
ON inventory_return_items(return_id);

CREATE INDEX IF NOT EXISTS idx_inventory_return_items_variant 
ON inventory_return_items(variant_id);

-- Enable Row Level Security
ALTER TABLE inventory_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_return_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for inventory_returns
CREATE POLICY "Users can view their own returns" ON inventory_returns
  FOR SELECT USING (
    agent_id = auth.uid() OR 
    receiver_id = auth.uid() OR 
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'super_admin', 'system_administrator')
    )
  );

CREATE POLICY "Agents can create returns" ON inventory_returns
  FOR INSERT WITH CHECK (agent_id = auth.uid());

CREATE POLICY "System can update returns" ON inventory_returns
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'super_admin', 'system_administrator')
    )
  );

-- RLS Policies for inventory_return_items
CREATE POLICY "Users can view return items" ON inventory_return_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM inventory_returns 
      WHERE id = return_id 
      AND (agent_id = auth.uid() OR receiver_id = auth.uid())
    ) OR
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'super_admin', 'system_administrator')
    )
  );

CREATE POLICY "System can insert return items" ON inventory_return_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM inventory_returns 
      WHERE id = return_id 
      AND agent_id = auth.uid()
    )
  );

-- Enable realtime for inventory_returns
ALTER PUBLICATION supabase_realtime ADD TABLE inventory_returns;

