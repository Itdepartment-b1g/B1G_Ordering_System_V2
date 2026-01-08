-- ============================================================================
-- PERFORMANCE OPTIMIZATION INDEXES
-- ============================================================================
-- Adds indexes to foreign keys and frequently queried columns to improve
-- initialization speed and general query performance.

-- 1. Profiles Table Indexes
-- Used in AuthContext for profile fetching and role checks
CREATE INDEX IF NOT EXISTS idx_profiles_company_id ON profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
-- Composite index for frequent "active user in company" lookups
CREATE INDEX IF NOT EXISTS idx_profiles_company_status ON profiles(company_id, status);

-- 2. Companies Table Indexes
-- Used in AuthContext for status checks
CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(status);

-- 3. Leader Teams Indexes
-- Used in TeamManagement and hierarchical queries
CREATE INDEX IF NOT EXISTS idx_leader_teams_agent_id ON leader_teams(agent_id);
CREATE INDEX IF NOT EXISTS idx_leader_teams_leader_id ON leader_teams(leader_id);
CREATE INDEX IF NOT EXISTS idx_leader_teams_sub_team_id ON leader_teams(sub_team_id);
CREATE INDEX IF NOT EXISTS idx_leader_teams_company_id ON leader_teams(company_id);

-- 4. Sub Teams Indexes
-- Used in hierarchical queries
CREATE INDEX IF NOT EXISTS idx_sub_teams_leader_id ON sub_teams(leader_id);
CREATE INDEX IF NOT EXISTS idx_sub_teams_manager_id ON sub_teams(manager_id);
CREATE INDEX IF NOT EXISTS idx_sub_teams_company_id ON sub_teams(company_id);

-- 5. Inventory Indexes (Bonus for Dashboard speed)
CREATE INDEX IF NOT EXISTS idx_agent_inventory_agent_id ON agent_inventory(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_inventory_variant_id ON agent_inventory(variant_id);

-- Optimize RLS Policy Performance
-- Ensure indexes exist for columns frequently used in "using" clauses
-- (already covered by company_id and role above)

COMMENT ON INDEX idx_profiles_company_id IS 'Optimizes profile fetches by company';
