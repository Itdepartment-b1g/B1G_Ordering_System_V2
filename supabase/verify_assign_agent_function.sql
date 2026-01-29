-- Verification script for assign_agent_to_leader function
-- Run this after creating the function to verify it exists and works

-- 1. Check if the function exists
SELECT 
  routine_name,
  routine_type,
  data_type as return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'assign_agent_to_leader';

-- 2. Check function parameters
SELECT 
  parameter_name,
  data_type,
  parameter_mode
FROM information_schema.parameters
WHERE specific_schema = 'public'
  AND specific_name LIKE '%assign_agent_to_leader%'
ORDER BY ordinal_position;

-- 3. Verify required tables exist
SELECT 
  table_name,
  CASE 
    WHEN table_name = 'profiles' THEN '✓ Stores user/agent/leader information'
    WHEN table_name = 'leader_teams' THEN '✓ Stores team assignments'
  END as purpose
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('profiles', 'leader_teams')
ORDER BY table_name;

-- 4. Check leader_teams table structure
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'leader_teams'
ORDER BY ordinal_position;

-- 5. Sample query to see mobile sales agents available for assignment
SELECT 
  id,
  full_name as agent_name,
  email,
  role,
  company_id
FROM profiles
WHERE role = 'mobile_sales'
  AND status = 'active'
ORDER BY full_name
LIMIT 10;

-- 6. Sample query to see team leaders
SELECT 
  id,
  full_name as leader_name,
  email,
  role,
  company_id
FROM profiles
WHERE role = 'team_leader'
  AND status = 'active'
ORDER BY full_name
LIMIT 10;

-- 7. Sample query to see existing team assignments
SELECT 
  lt.id,
  l.full_name as leader_name,
  a.full_name as agent_name,
  lt.company_id,
  lt.assigned_at
FROM leader_teams lt
JOIN profiles l ON lt.leader_id = l.id
JOIN profiles a ON lt.agent_id = a.id
ORDER BY lt.assigned_at DESC
LIMIT 10;

-- Expected output:
-- 1. Should show the assign_agent_to_leader function exists with return type 'json'
-- 2. Should show 3 parameters: p_agent_id, p_leader_id, p_admin_id
-- 3. Should show both required tables exist
-- 4. Should show leader_teams table structure
-- 5. Should show mobile sales agents
-- 6. Should show team leaders
-- 7. Should show existing team assignments

