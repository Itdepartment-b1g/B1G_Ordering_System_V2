-- Existing table (reference shape for executive reads).
-- Already applied via supabase/migrations. Query logic: src/server/repositories.

CREATE TABLE IF NOT EXISTS agent_inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
    stock INTEGER DEFAULT 0,
    allocated_price DECIMAL(10, 2) DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
