-- ============================================================================
-- FIX AUDIT TRIGGER FOR COMPANIES TABLE
-- ============================================================================
-- The audit trigger was failing because it tried to access NEW.company_id
-- on the companies table, but that table uses "id" not "company_id".
-- This fixes the function to handle the companies table as a special case.
-- ============================================================================

CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
DECLARE
  user_record RECORD;
  changed_fields TEXT[];
  v_company_id UUID;
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
  
  -- Special handling for companies table (uses "id" not "company_id")
  IF TG_TABLE_NAME = 'companies' THEN
    v_company_id := COALESCE(NEW.id, OLD.id);
  ELSE
    -- All other tables use "company_id"
    v_company_id := COALESCE(NEW.company_id, OLD.company_id);
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
    v_company_id,
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

COMMENT ON FUNCTION audit_trigger_function IS 'Automatically logs all CRUD operations to system_audit_log table. Handles companies table specially since it uses "id" instead of "company_id".';
