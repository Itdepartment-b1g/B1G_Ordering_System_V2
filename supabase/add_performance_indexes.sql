-- Performance Indexes Migration
-- Adding indexes to foreign keys and commonly filtered columns to optimize joins and filtering

-- 1. Client Orders (Critical for Stats View)
CREATE INDEX IF NOT EXISTS idx_client_orders_company_id ON client_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_client_orders_client_id ON client_orders(client_id);
CREATE INDEX IF NOT EXISTS idx_client_orders_agent_id ON client_orders(agent_id);
CREATE INDEX IF NOT EXISTS idx_client_orders_status ON client_orders(status);
CREATE INDEX IF NOT EXISTS idx_client_orders_stage ON client_orders(stage);

-- 2. Inventory / Brands / Variants / Main Inventory (Critical for Inventory Loading)
CREATE INDEX IF NOT EXISTS idx_brands_company_id ON brands(company_id);
CREATE INDEX IF NOT EXISTS idx_variants_brand_id ON variants(brand_id);
CREATE INDEX IF NOT EXISTS idx_variants_variant_type ON variants(variant_type);
CREATE INDEX IF NOT EXISTS idx_main_inventory_variant_id ON main_inventory(variant_id);

-- 3. Clients (Critical for Clients Page)
CREATE INDEX IF NOT EXISTS idx_clients_company_id ON clients(company_id);
CREATE INDEX IF NOT EXISTS idx_clients_agent_id ON clients(agent_id);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
CREATE INDEX IF NOT EXISTS idx_clients_created_at ON clients(created_at);

-- 4. Profiles (Critical for Login & Agent List)
CREATE INDEX IF NOT EXISTS idx_profiles_company_id ON profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
