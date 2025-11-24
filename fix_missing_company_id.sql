-- ============================================================================
-- FIX PROFILES MISSING company_id
-- This script checks for profiles without company_id and attempts to fix them
-- ============================================================================

-- 1. Check for profiles missing company_id
SELECT 
    id,
    email,
    full_name,
    role,
    company_id,
    created_at
FROM profiles
WHERE company_id IS NULL
ORDER BY created_at DESC;

-- 2. For super_admin profiles, try to find their company by matching email
-- Update super_admin profiles that are missing company_id
UPDATE profiles p
SET company_id = c.id
FROM companies c
WHERE p.company_id IS NULL
  AND p.role = 'super_admin'
  AND p.email = c.super_admin_email
  AND c.super_admin_email IS NOT NULL;

-- 3. Check if any profiles still have missing company_id
SELECT 
    id,
    email,
    full_name,
    role,
    company_id,
    created_at
FROM profiles
WHERE company_id IS NULL
ORDER BY created_at DESC;

-- 4. If you need to manually set company_id for a specific user:
-- UPDATE profiles
-- SET company_id = 'YOUR_COMPANY_ID_HERE'
-- WHERE id = 'YOUR_USER_ID_HERE';

-- 5. Verify all profiles now have company_id
SELECT 
    COUNT(*) as total_profiles,
    COUNT(company_id) as profiles_with_company_id,
    COUNT(*) - COUNT(company_id) as profiles_missing_company_id
FROM profiles;

