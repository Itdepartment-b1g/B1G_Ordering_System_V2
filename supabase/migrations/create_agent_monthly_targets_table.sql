-- ============================================================================
-- CREATE AGENT MONTHLY TARGETS TABLE
-- ============================================================================
-- This table stores monthly targets and achievements for sales agents
-- Used for KPI tracking and performance evaluation
-- ============================================================================

-- Ensure UUID extension is enabled (required for uuid_generate_v4())
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create the table
CREATE TABLE IF NOT EXISTS agent_monthly_targets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    target_month DATE NOT NULL, -- First day of the month (YYYY-MM-01)
    
    -- Target values (set by leaders/admins)
    target_clients INTEGER,
    target_revenue NUMERIC(12, 2),
    target_qty INTEGER,
    target_orders INTEGER, -- Legacy field for backward compatibility
    
    -- Metadata
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure one target per agent per month
    UNIQUE(agent_id, target_month)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_agent_monthly_targets_agent_id ON agent_monthly_targets(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_monthly_targets_month ON agent_monthly_targets(target_month);
CREATE INDEX IF NOT EXISTS idx_agent_monthly_targets_agent_month ON agent_monthly_targets(agent_id, target_month);

-- Add table comment
COMMENT ON TABLE agent_monthly_targets IS 'Monthly sales targets for agents (KPI tracking)';
COMMENT ON COLUMN agent_monthly_targets.target_month IS 'First day of the target month (YYYY-MM-01)';
COMMENT ON COLUMN agent_monthly_targets.target_clients IS 'Target number of new clients for the month';
COMMENT ON COLUMN agent_monthly_targets.target_revenue IS 'Target revenue amount for the month';
COMMENT ON COLUMN agent_monthly_targets.target_qty IS 'Target total quantity to sell for the month';

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
-- Access Control:
-- - Super Admin & Admin: View and set targets for ALL agents in their company
-- - Team Leader: View and set targets for agents in their team
-- - Agents: View their own targets only
-- - Manager: No direct access (viewing handled elsewhere)
-- ============================================================================

-- Enable RLS
ALTER TABLE agent_monthly_targets ENABLE ROW LEVEL SECURITY;

-- Policy 1: Admins and Super Admins can view all targets in their company
CREATE POLICY "Admins can view all targets" ON agent_monthly_targets
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'super_admin', 'system_administrator')
        )
    );

-- Policy 2: Team Leaders can view targets for their assigned agents
CREATE POLICY "Leaders can view their team targets" ON agent_monthly_targets
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role = 'team_leader'
            AND agent_monthly_targets.agent_id IN (
                SELECT agent_id FROM leader_teams
                WHERE leader_id = auth.uid()
            )
        )
    );

-- Policy 3: Agents can view their own targets
CREATE POLICY "Agents can view own targets" ON agent_monthly_targets
    FOR SELECT
    USING (agent_id = auth.uid());

-- Policy 3.5: Managers can view targets for agents in their team
CREATE POLICY "Managers can view their team targets" ON agent_monthly_targets
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role = 'manager'
            AND agent_monthly_targets.agent_id IN (
                -- Get all agents under this manager's leaders
                SELECT lt2.agent_id 
                FROM leader_teams lt1
                INNER JOIN leader_teams lt2 ON lt2.leader_id = lt1.agent_id
                WHERE lt1.leader_id = auth.uid()
                AND lt2.agent_id IN (
                    SELECT id FROM profiles WHERE role = 'mobile_sales'
                )
            )
        )
    );

-- Policy 4: Admins and Super Admins can manage all targets in their company
CREATE POLICY "Admins can manage all targets" ON agent_monthly_targets
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'super_admin', 'system_administrator')
        )
    );

CREATE POLICY "Admins can update all targets" ON agent_monthly_targets
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'super_admin', 'system_administrator')
        )
    );

-- Policy 5: Team Leaders can manage targets for their team only
CREATE POLICY "Leaders can manage team targets" ON agent_monthly_targets
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role = 'team_leader'
            AND agent_monthly_targets.agent_id IN (
                SELECT agent_id FROM leader_teams
                WHERE leader_id = auth.uid()
            )
        )
    );

CREATE POLICY "Leaders can update team targets" ON agent_monthly_targets
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role = 'team_leader'
            AND agent_monthly_targets.agent_id IN (
                SELECT agent_id FROM leader_teams
                WHERE leader_id = auth.uid()
            )
        )
    );

-- ============================================================================
-- TRIGGER FOR UPDATED_AT
-- ============================================================================

-- Create or replace the trigger function
CREATE OR REPLACE FUNCTION update_agent_monthly_targets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_update_agent_monthly_targets_updated_at ON agent_monthly_targets;
CREATE TRIGGER trigger_update_agent_monthly_targets_updated_at
    BEFORE UPDATE ON agent_monthly_targets
    FOR EACH ROW
    EXECUTE FUNCTION update_agent_monthly_targets_updated_at();

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Grant permissions to authenticated users (RLS policies will control access)
GRANT SELECT, INSERT, UPDATE ON agent_monthly_targets TO authenticated;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ agent_monthly_targets table created successfully!';
    RAISE NOTICE '📊 Table includes: targets (clients, revenue, qty) and achievement tracking';
    RAISE NOTICE '🔒 RLS policies configured for role-based access';
END $$;
