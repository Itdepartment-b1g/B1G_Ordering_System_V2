-- Add user_name column to existing system_audit_log table
-- This migration is safe to run on existing databases

-- Add the user_name column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'system_audit_log' 
    AND column_name = 'user_name'
  ) THEN
    ALTER TABLE system_audit_log ADD COLUMN user_name TEXT;
    
    -- Add comment
    COMMENT ON COLUMN system_audit_log.user_name IS 'Full name of the user who performed the action';
    
    -- Optionally backfill existing records with full names from profiles
    -- This is optional and may take time on large datasets
    UPDATE system_audit_log 
    SET user_name = profiles.full_name
    FROM profiles
    WHERE system_audit_log.user_id = profiles.id
    AND system_audit_log.user_name IS NULL;
    
    RAISE NOTICE 'Added user_name column to system_audit_log table';
  ELSE
    RAISE NOTICE 'user_name column already exists in system_audit_log table';
  END IF;
END $$;
