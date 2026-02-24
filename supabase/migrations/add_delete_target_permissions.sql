-- ============================================================================
-- ADD DELETE PERMISSIONS FOR AGENT MONTHLY TARGETS
-- ============================================================================
-- This migration adds DELETE permissions and RLS policies to allow
-- Super Admins and Team Leaders to remove/reset agent targets
-- ============================================================================

-- Grant DELETE permission
GRANT DELETE ON agent_monthly_targets TO authenticated;

-- Policy: Admins and Super Admins can delete all targets in their company
CREATE POLICY "Admins can delete all targets" ON agent_monthly_targets
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'super_admin', 'system_administrator')
        )
    );

-- Policy: Team Leaders can delete targets for their team only
CREATE POLICY "Leaders can delete team targets" ON agent_monthly_targets
    FOR DELETE
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
-- SUCCESS MESSAGE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ DELETE permissions added to agent_monthly_targets table!';
    RAISE NOTICE '🔒 RLS policies configured for admins and team leaders';
END $$;
