-- Check the role of "Manager2"
SELECT id, full_name, role, email FROM profiles WHERE full_name ILIKE '%Manager2%';

-- If you see it has role 'team_leader' instead of 'manager', run this to fix it:
-- UPDATE profiles SET role = 'manager' WHERE full_name ILIKE '%Manager2%';
