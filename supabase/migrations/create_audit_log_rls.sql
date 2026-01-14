-- Enable Row-Level Security on system_audit_log table
ALTER TABLE system_audit_log ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "super_admin_admin_all_audit" ON system_audit_log;
DROP POLICY IF EXISTS "finance_audit_access" ON system_audit_log;
DROP POLICY IF EXISTS "manager_audit_access" ON system_audit_log;
DROP POLICY IF EXISTS "team_leader_audit_access" ON system_audit_log;
DROP POLICY IF EXISTS "mobile_sales_audit_access" ON system_audit_log;
DROP POLICY IF EXISTS "sales_agent_audit_access" ON system_audit_log;
DROP POLICY IF EXISTS "system_administrator_all_audit" ON system_audit_log;

-- System Administrator: See everything across all companies
CREATE POLICY "system_administrator_all_audit"
  ON system_audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'system_administrator'
    )
  );

-- Super Admin & Admin: See everything in their company
CREATE POLICY "super_admin_admin_all_audit"
  ON system_audit_log FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('super_admin', 'admin')
    )
  );

-- Finance: See financial-related tables only (orders, cash deposits, financial transactions, purchase orders)
CREATE POLICY "finance_audit_access"
  ON system_audit_log FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'finance'
    )
    AND table_name IN (
      'client_orders', 
      'cash_deposits', 
      'financial_transactions', 
      'purchase_orders',
      'remittances_log',
      'client_order_items',
      'purchase_order_items'
    )
  );

-- Manager: See their teams and sub-teams
CREATE POLICY "manager_audit_access"
  ON system_audit_log FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'manager'
    )
    AND (
      -- Manager's own actions
      user_id = auth.uid() 
      OR
      -- Actions by team leaders in their company
      user_id IN (
        SELECT id FROM profiles 
        WHERE role = 'team_leader' 
        AND company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
      )
      OR
      -- Actions by agents under their team leaders
      user_id IN (
        SELECT agent_id FROM leader_teams 
        WHERE leader_id IN (
          SELECT id FROM profiles 
          WHERE role = 'team_leader' 
          AND company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
        )
      )
    )
  );

-- Team Leader: See their sub-teams (agents assigned to them)
CREATE POLICY "team_leader_audit_access"
  ON system_audit_log FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'team_leader'
    )
    AND (
      -- Team leader's own actions
      user_id = auth.uid() 
      OR
      -- Actions by agents in their team
      user_id IN (
        SELECT agent_id FROM leader_teams 
        WHERE leader_id = auth.uid()
      )
    )
  );

-- Mobile Sales & Sales Agent: See only their own actions
CREATE POLICY "mobile_sales_audit_access"
  ON system_audit_log FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM profiles 
      WHERE id = auth.uid()
    )
    AND user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('mobile_sales', 'sales_agent')
    )
  );

-- Prevent any modifications to audit log (append-only via triggers)
-- Users cannot INSERT, UPDATE, or DELETE audit logs directly
CREATE POLICY "no_direct_modifications"
  ON system_audit_log FOR INSERT
  WITH CHECK (false);

CREATE POLICY "no_updates"
  ON system_audit_log FOR UPDATE
  USING (false);

CREATE POLICY "no_deletes"
  ON system_audit_log FOR DELETE
  USING (false);

-- Add comments
COMMENT ON POLICY "super_admin_admin_all_audit" ON system_audit_log IS 
  'Super admins and admins can view all audit logs in their company';

COMMENT ON POLICY "finance_audit_access" ON system_audit_log IS 
  'Finance users can only view financial-related audit logs';

COMMENT ON POLICY "manager_audit_access" ON system_audit_log IS 
  'Managers can view audit logs for their teams and sub-teams';

COMMENT ON POLICY "team_leader_audit_access" ON system_audit_log IS 
  'Team leaders can view audit logs for their assigned agents';

COMMENT ON POLICY "mobile_sales_audit_access" ON system_audit_log IS 
  'Mobile sales and sales agents can only view their own audit logs';
