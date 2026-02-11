-- Delete all clients for company_id: e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13
-- WARNING: This is a destructive operation and cannot be undone!

-- First, check how many clients will be deleted
SELECT COUNT(*) as clients_to_delete
FROM clients
WHERE company_id = 'e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13';

-- Delete all clients for this company_id
DELETE FROM clients
WHERE company_id = 'e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13';

-- Verify deletion (should return 0)
SELECT COUNT(*) as remaining_clients
FROM clients
WHERE company_id = 'e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13';
