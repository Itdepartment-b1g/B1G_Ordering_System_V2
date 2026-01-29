-- Fix existing users (Test Admin and test2) by assigning them to the super admin's company
-- Replace 'romeyluigi20164@gmail.com' with your super admin email if different

-- First, get the super admin's company_id
WITH super_admin_company AS (
  SELECT company_id 
  FROM profiles 
  WHERE email = 'romeyluigi20164@gmail.com'
  LIMIT 1
)
-- Update Test Admin and test2 to have the same company_id
UPDATE profiles
SET company_id = (SELECT company_id FROM super_admin_company)
WHERE email IN ('admin@gmail.com', 'admin2@gmail.com')
AND company_id IS NULL;

-- Verify the update
SELECT id, full_name, email, company_id, role
FROM profiles
WHERE email IN ('admin@gmail.com', 'admin2@gmail.com', 'romeyluigi20164@gmail.com')
ORDER BY email;
