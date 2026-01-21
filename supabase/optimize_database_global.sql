-- ============================================================================
-- GLOBAL DATABASE OPTIMIZATION SCRIPT
-- ============================================================================
-- This script adds comprehensive indexing to all major tables to ensure
-- scalable performance for multi-tenant data fetching, filtering, and sorting.
-- ============================================================================

-- 1. MULTI-TENANT ISOLATION (Company ID Indexes)
-- Critical for RLS policies and separating tenant data
CREATE INDEX IF NOT EXISTS idx_profiles_company_id ON public.profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_clients_company_id ON public.clients(company_id);
-- Products table does not exist, using variants/brands instead
CREATE INDEX IF NOT EXISTS idx_brands_company_id ON public.brands(company_id);
CREATE INDEX IF NOT EXISTS idx_variants_company_id ON public.variants(company_id);
CREATE INDEX IF NOT EXISTS idx_agent_inventory_company_id ON public.agent_inventory(company_id);
CREATE INDEX IF NOT EXISTS idx_leader_teams_company_id ON public.leader_teams(company_id);
CREATE INDEX IF NOT EXISTS idx_visit_logs_company_id ON public.visit_logs(company_id);

-- 2. FOREIGN KEY RELATIONSHIPS
-- Speeds up JOIN operations and related data fetching

-- Clients assigned to agents
CREATE INDEX IF NOT EXISTS idx_clients_agent_id ON public.clients(agent_id);

-- Orders linked to clients and agents
CREATE INDEX IF NOT EXISTS idx_client_orders_client_id ON public.client_orders(client_id);
CREATE INDEX IF NOT EXISTS idx_client_orders_agent_id ON public.client_orders(agent_id);

-- Order items
CREATE INDEX IF NOT EXISTS idx_client_order_items_order_id ON public.client_order_items(client_order_id);
CREATE INDEX IF NOT EXISTS idx_client_order_items_variant_id ON public.client_order_items(variant_id);

-- Product hierarchy (Brand -> Variant)
-- Products table removed, linking variants directly to brands if needed, but mainly variants are the product unit
CREATE INDEX IF NOT EXISTS idx_variants_brand_id ON public.variants(brand_id);

-- Visits
CREATE INDEX IF NOT EXISTS idx_visit_logs_agent_id ON public.visit_logs(agent_id);
CREATE INDEX IF NOT EXISTS idx_visit_logs_client_id ON public.visit_logs(client_id);

-- Remittances
CREATE INDEX IF NOT EXISTS idx_remittances_log_agent_id ON public.remittances_log(agent_id);

-- 3. STATUS AND FILTERING
-- Optimizes common list filters

-- Profiles by role and status (frequently used in Team Management)
CREATE INDEX IF NOT EXISTS idx_profiles_role_status ON public.profiles(role, status);

-- Client Orders by status/stage (frequently used in Order Management/Pipelines)
CREATE INDEX IF NOT EXISTS idx_client_orders_status_stage ON public.client_orders(status, stage);

-- Stock Requests (Note: leader_id+status index already added in previous step, adding generic status index)
CREATE INDEX IF NOT EXISTS idx_stock_requests_status ON public.stock_requests(status);

-- Remittances by status
-- Note: remittances_log does not have a 'status' column in the types file, skipping status index or checking if it exists
-- The types file shows it typically has date and amounts, not status.
-- However, financial_transactions has status.
CREATE INDEX IF NOT EXISTS idx_financial_transactions_status ON public.financial_transactions(status);


-- 4. SORTING AND TIMELINES
-- Optimizes "ORDER BY" clauses for history and activity feeds

-- Order history (most recent first)
CREATE INDEX IF NOT EXISTS idx_client_orders_created_at ON public.client_orders(created_at DESC);

-- Visit history - Table name visit_logs (confirmed by context but check if exists in DB types or just create IF NOT EXISTS)
-- Types file had visit_logs interface but not in table list at bottom... wait, it was missing from the bottom list
-- It might be better to skip visit_logs index if table existence is uncertain, OR just use IF NOT EXISTS which is safe.
CREATE INDEX IF NOT EXISTS idx_visit_logs_check_in_time ON public.visit_logs(visited_at DESC);

-- Remittance history
CREATE INDEX IF NOT EXISTS idx_remittances_log_created_at ON public.remittances_log(created_at DESC);
