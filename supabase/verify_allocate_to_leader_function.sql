-- Verification script for allocate_to_leader function
-- Run this after creating the function to verify it exists and works

-- 1. Check if the function exists
SELECT 
  routine_name,
  routine_type,
  data_type as return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'allocate_to_leader';

-- 2. Check function parameters
SELECT 
  parameter_name,
  data_type,
  parameter_mode
FROM information_schema.parameters
WHERE specific_schema = 'public'
  AND specific_name LIKE '%allocate_to_leader%'
ORDER BY ordinal_position;

-- 3. Verify required tables exist
SELECT 
  table_name,
  CASE 
    WHEN table_name = 'main_inventory' THEN '✓ Stores company inventory'
    WHEN table_name = 'agent_inventory' THEN '✓ Stores leader/agent inventory'
    WHEN table_name = 'inventory_transactions' THEN '✓ Logs all inventory movements'
    WHEN table_name = 'profiles' THEN '✓ Stores user/leader information'
  END as purpose
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('main_inventory', 'agent_inventory', 'inventory_transactions', 'profiles')
ORDER BY table_name;

-- 4. Check if transaction_type enum includes 'allocated_to_agent'
SELECT 
  enumlabel as transaction_type
FROM pg_enum
WHERE enumtypid = (
  SELECT oid 
  FROM pg_type 
  WHERE typname = 'transaction_type'
)
ORDER BY enumlabel;

-- 5. Sample query to see available stock in main_inventory
SELECT 
  mi.id,
  b.name as brand_name,
  v.name as variant_name,
  v.variant_type,
  mi.stock as available_stock,
  mi.selling_price,
  mi.company_id
FROM main_inventory mi
JOIN variants v ON mi.variant_id = v.id
JOIN brands b ON v.brand_id = b.id
WHERE mi.stock > 0
ORDER BY b.name, v.name
LIMIT 10;

-- 6. Sample query to see team leaders who can receive allocations
SELECT 
  id as leader_id,
  full_name as leader_name,
  email,
  role,
  company_id
FROM profiles
WHERE role = 'team_leader'
  AND status = 'active'
ORDER BY full_name
LIMIT 10;

-- Expected output:
-- 1. Should show the allocate_to_leader function exists with return type 'json'
-- 2. Should show 4 parameters: p_leader_id, p_variant_id, p_quantity, p_performed_by
-- 3. Should show all 4 required tables exist
-- 4. Should show 'allocated_to_agent' in the transaction types
-- 5. Should show available inventory items
-- 6. Should show team leaders who can receive allocations

