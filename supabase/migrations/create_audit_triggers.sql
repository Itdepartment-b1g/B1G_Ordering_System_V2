-- Create audit trigger function
-- This function automatically logs all INSERT, UPDATE, and DELETE operations

CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
DECLARE
  user_record RECORD;
  changed_fields TEXT[];
BEGIN
  -- Get user info from current session
  SELECT id, email, full_name, role INTO user_record
  FROM profiles
  WHERE id = auth.uid();
  
  -- For UPDATE, calculate changed fields
  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(key) INTO changed_fields
    FROM jsonb_each(to_jsonb(NEW))
    WHERE to_jsonb(NEW)->key IS DISTINCT FROM to_jsonb(OLD)->key;
  END IF;
  
  -- Insert audit log
  INSERT INTO system_audit_log (
    company_id,
    table_name,
    operation,
    record_id,
    user_id,
    user_email,
    user_name,
    user_role,
    old_data,
    new_data,
    changed_fields,
    description
  ) VALUES (
    COALESCE(NEW.company_id, OLD.company_id),
    TG_TABLE_NAME,
    TG_OP,
    COALESCE(NEW.id::TEXT, OLD.id::TEXT),
    user_record.id,
    user_record.email,
    user_record.full_name,
    user_record.role,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
    changed_fields,
    format('%s %s on %s', TG_OP, TG_TABLE_NAME, COALESCE(NEW.id::TEXT, OLD.id::TEXT))
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply trigger to all critical tables

-- Clients table
DROP TRIGGER IF EXISTS audit_clients ON clients;
CREATE TRIGGER audit_clients 
  AFTER INSERT OR UPDATE OR DELETE ON clients
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Client Orders table
DROP TRIGGER IF EXISTS audit_client_orders ON client_orders;
CREATE TRIGGER audit_client_orders 
  AFTER INSERT OR UPDATE OR DELETE ON client_orders
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Profiles table
DROP TRIGGER IF EXISTS audit_profiles ON profiles;
CREATE TRIGGER audit_profiles 
  AFTER INSERT OR UPDATE OR DELETE ON profiles
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Main Inventory table
DROP TRIGGER IF EXISTS audit_main_inventory ON main_inventory;
CREATE TRIGGER audit_main_inventory 
  AFTER INSERT OR UPDATE OR DELETE ON main_inventory
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Agent Inventory table
DROP TRIGGER IF EXISTS audit_agent_inventory ON agent_inventory;
CREATE TRIGGER audit_agent_inventory 
  AFTER INSERT OR UPDATE OR DELETE ON agent_inventory
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Purchase Orders table
DROP TRIGGER IF EXISTS audit_purchase_orders ON purchase_orders;
CREATE TRIGGER audit_purchase_orders 
  AFTER INSERT OR UPDATE OR DELETE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Cash Deposits table
DROP TRIGGER IF EXISTS audit_cash_deposits ON cash_deposits;
CREATE TRIGGER audit_cash_deposits 
  AFTER INSERT OR UPDATE OR DELETE ON cash_deposits
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Stock Requests table
DROP TRIGGER IF EXISTS audit_stock_requests ON stock_requests;
CREATE TRIGGER audit_stock_requests 
  AFTER INSERT OR UPDATE OR DELETE ON stock_requests
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Remittances Log table
DROP TRIGGER IF EXISTS audit_remittances_log ON remittances_log;
CREATE TRIGGER audit_remittances_log 
  AFTER INSERT OR UPDATE OR DELETE ON remittances_log
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Financial Transactions table
DROP TRIGGER IF EXISTS audit_financial_transactions ON financial_transactions;
CREATE TRIGGER audit_financial_transactions 
  AFTER INSERT OR UPDATE OR DELETE ON financial_transactions
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Brands table
DROP TRIGGER IF EXISTS audit_brands ON brands;
CREATE TRIGGER audit_brands 
  AFTER INSERT OR UPDATE OR DELETE ON brands
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Variants table
DROP TRIGGER IF EXISTS audit_variants ON variants;
CREATE TRIGGER audit_variants 
  AFTER INSERT OR UPDATE OR DELETE ON variants
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Suppliers table
DROP TRIGGER IF EXISTS audit_suppliers ON suppliers;
CREATE TRIGGER audit_suppliers 
  AFTER INSERT OR UPDATE OR DELETE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Leader Teams table
DROP TRIGGER IF EXISTS audit_leader_teams ON leader_teams;
CREATE TRIGGER audit_leader_teams 
  AFTER INSERT OR UPDATE OR DELETE ON leader_teams
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Companies table
DROP TRIGGER IF EXISTS audit_companies ON companies;
CREATE TRIGGER audit_companies 
  AFTER INSERT OR UPDATE OR DELETE ON companies
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Inventory Transactions table
DROP TRIGGER IF EXISTS audit_inventory_transactions ON inventory_transactions;
CREATE TRIGGER audit_inventory_transactions 
  AFTER INSERT OR UPDATE OR DELETE ON inventory_transactions
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

COMMENT ON FUNCTION audit_trigger_function IS 'Automatically logs all CRUD operations to system_audit_log table';
