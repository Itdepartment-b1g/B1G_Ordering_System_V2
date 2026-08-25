-- Existing table (reference shape for executive reads).
-- Already applied via supabase/migrations. Query logic: src/server/repositories.

CREATE TABLE IF NOT EXISTS main_inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
    stock INTEGER DEFAULT 0,
    allocated_stock INTEGER DEFAULT 0,
    unit_price DECIMAL(10, 2) DEFAULT 0,
    selling_price DECIMAL(10, 2) DEFAULT 0,
    dsp_price DECIMAL(10, 2) DEFAULT 0,
    rsp_price DECIMAL(10, 2) DEFAULT 0,
    reorder_level INTEGER DEFAULT 10,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
