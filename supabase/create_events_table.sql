-- ============================================================================
-- EVENTS TABLE FOR CENTRALIZED HISTORY LOGGING
-- ============================================================================
-- This table stores all user actions and system events for audit trail purposes.
-- It supports the "From [Actor] - [Action] - To [Target]" display format.
-- Multi-tenant isolation is enforced via company_id and RLS policies.
-- ============================================================================

-- Drop existing table if it exists
DROP TABLE IF EXISTS events CASCADE;

-- Create events table
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    
    -- Actor information (who performed the action)
    actor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    actor_role TEXT NOT NULL CHECK (actor_role IN ('system', 'admin', 'leader', 'sales_agent', 'finance', 'manager')),
    performed_by TEXT NOT NULL, -- Human-readable name for display
    actor_label TEXT, -- Additional label for display (e.g., position)
    
    -- Action details
    action TEXT NOT NULL, -- e.g., 'insert', 'update', 'delete', 'approve', 'allocate_stock'
    
    -- Target information (what was affected)
    target_type TEXT NOT NULL, -- e.g., 'client_order', 'profile', 'main_inventory'
    target_id TEXT NOT NULL, -- UUID or identifier of the affected entity
    target_label TEXT, -- Human-readable label for display (e.g., client name, order number)
    
    -- Additional context
    details JSONB DEFAULT '{}'::jsonb, -- Flexible JSON for storing additional event data
    
    -- Timestamps
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index for company isolation (most important)
CREATE INDEX IF NOT EXISTS idx_events_company_id ON events(company_id);

-- Index for actor queries (e.g., "show me all actions by this user")
CREATE INDEX IF NOT EXISTS idx_events_actor_id ON events(actor_id);

-- Index for time-based queries (most recent events)
CREATE INDEX IF NOT EXISTS idx_events_occurred_at ON events(occurred_at DESC);

-- Composite index for company + time (common query pattern)
CREATE INDEX IF NOT EXISTS idx_events_company_occurred ON events(company_id, occurred_at DESC);

-- Index for action filtering
CREATE INDEX IF NOT EXISTS idx_events_action ON events(action);

-- Index for target type filtering
CREATE INDEX IF NOT EXISTS idx_events_target_type ON events(target_type);

-- GIN index for JSONB details column (for efficient JSON queries)
CREATE INDEX IF NOT EXISTS idx_events_details ON events USING GIN (details);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Policy 1: System administrators can view all events across all companies
DROP POLICY IF EXISTS "System administrators can view all events" ON events;
CREATE POLICY "System administrators can view all events"
    ON events FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'system_administrator'
        )
    );

-- Policy 2: Super admins can view all events in their company
DROP POLICY IF EXISTS "Super admins can view all events in their company" ON events;
CREATE POLICY "Super admins can view all events in their company"
    ON events FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'super_admin'
            AND profiles.company_id = events.company_id
        )
    );

-- Policy 3: Admins and finance can view all events in their company
DROP POLICY IF EXISTS "Admins can view all events in their company" ON events;
CREATE POLICY "Admins can view all events in their company"
    ON events FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'finance')
            AND profiles.company_id = events.company_id
        )
    );

-- Policy 4: Leaders can view events performed by themselves or their team members
DROP POLICY IF EXISTS "Leaders can view team events" ON events;
CREATE POLICY "Leaders can view team events"
    ON events FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'team_leader'
            AND profiles.company_id = events.company_id
            AND (
                -- Events performed by the leader themselves
                events.actor_id = auth.uid()
                -- OR events performed by their team members
                OR events.actor_id IN (
                    SELECT agent_id FROM leader_teams
                    WHERE leader_id = auth.uid()
                )
                -- OR events where the leader is mentioned in details
                OR events.details->>'leader_id' = auth.uid()::text
            )
        )
    );

-- Policy 5: Sales agents can view their own events
DROP POLICY IF EXISTS "Sales agents can view their own events" ON events;
CREATE POLICY "Sales agents can view their own events"
    ON events FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('mobile_sales', 'sales_agent')
            AND profiles.company_id = events.company_id
            AND (
                -- Events performed by themselves
                events.actor_id = auth.uid()
                -- OR events where they are mentioned in details
                OR events.details->>'agent_id' = auth.uid()::text
            )
        )
    );

-- Policy 6: Authenticated users can insert events (for logging actions)
DROP POLICY IF EXISTS "Authenticated users can insert events" ON events;
CREATE POLICY "Authenticated users can insert events"
    ON events FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.company_id = events.company_id
        )
    );

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Grant necessary permissions to authenticated users
GRANT SELECT, INSERT ON events TO authenticated;


-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE events IS 'Centralized event logging table for audit trail and history tracking';
COMMENT ON COLUMN events.company_id IS 'Company isolation - each company has separate events';
COMMENT ON COLUMN events.actor_id IS 'User who performed the action';
COMMENT ON COLUMN events.actor_role IS 'Role of the actor at the time of the event';
COMMENT ON COLUMN events.performed_by IS 'Human-readable name of the actor (for display)';
COMMENT ON COLUMN events.action IS 'Type of action performed (insert, update, delete, approve, etc.)';
COMMENT ON COLUMN events.target_type IS 'Type of entity affected (client_order, profile, etc.)';
COMMENT ON COLUMN events.target_id IS 'ID of the affected entity';
COMMENT ON COLUMN events.details IS 'Additional context and metadata in JSON format';

-- ============================================================================
-- VERIFICATION QUERIES (Optional - uncomment to test)
-- ============================================================================

-- Verify table creation
-- SELECT table_name, table_type 
-- FROM information_schema.tables 
-- WHERE table_name = 'events';

-- Verify RLS is enabled
-- SELECT tablename, rowsecurity 
-- FROM pg_tables 
-- WHERE tablename = 'events';

-- Verify indexes
-- SELECT indexname, indexdef 
-- FROM pg_indexes 
-- WHERE tablename = 'events';

-- Verify policies
-- SELECT policyname, roles, cmd, qual 
-- FROM pg_policies 
-- WHERE tablename = 'events';
