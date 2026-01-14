-- Create system_audit_log table for comprehensive audit trail
-- This table captures all CRUD operations across the system

CREATE TABLE IF NOT EXISTS system_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- What happened
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  record_id TEXT NOT NULL,
  
  -- Who did it
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  user_email TEXT,
  user_name TEXT,
  user_role TEXT,
  
  -- Data changes
  old_data JSONB,
  new_data JSONB,
  changed_fields TEXT[],
  
  -- Context
  description TEXT,
  ip_address TEXT,
  user_agent TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_audit_company_id ON system_audit_log(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_table_name ON system_audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_user_id ON system_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON system_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_operation ON system_audit_log(operation);
CREATE INDEX IF NOT EXISTS idx_audit_record_id ON system_audit_log(record_id);

-- Composite index for common queries (company + table + date)
CREATE INDEX IF NOT EXISTS idx_audit_company_table_date ON system_audit_log(company_id, table_name, created_at DESC);

-- Add comment to table
COMMENT ON TABLE system_audit_log IS 'Comprehensive audit trail for all database operations';
COMMENT ON COLUMN system_audit_log.table_name IS 'Name of the table that was modified';
COMMENT ON COLUMN system_audit_log.operation IS 'Type of operation: INSERT, UPDATE, or DELETE';
COMMENT ON COLUMN system_audit_log.record_id IS 'ID of the record that was modified';
COMMENT ON COLUMN system_audit_log.old_data IS 'Complete record data before the change (for UPDATE and DELETE)';
COMMENT ON COLUMN system_audit_log.new_data IS 'Complete record data after the change (for INSERT and UPDATE)';
COMMENT ON COLUMN system_audit_log.changed_fields IS 'Array of field names that were modified (for UPDATE operations)';
