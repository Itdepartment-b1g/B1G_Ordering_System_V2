-- ============================================================================
-- CHECK CLIENT_ORDERS TABLE COLUMNS
-- ============================================================================
-- This script shows all columns in the client_orders table
-- ============================================================================

SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default,
    ordinal_position
FROM information_schema.columns
WHERE table_schema = 'public'
    AND table_name = 'client_orders'
ORDER BY ordinal_position;

-- ============================================================================
-- CURRENT COLUMNS IN client_orders TABLE (based on schema):
-- ============================================================================
-- 1. id (uuid, primary key)
-- 2. company_id (uuid, not null)
-- 3. order_number (text, not null, unique)
-- 4. agent_id (uuid, not null)
-- 5. client_id (uuid, not null)
-- 6. client_account_type (text, not null)
-- 7. order_date (date, not null)
-- 8. subtotal (decimal(10,2), default 0)
-- 9. tax_rate (decimal(5,2), default 0)
-- 10. tax_amount (decimal(10,2), default 0)
-- 11. discount (decimal(10,2), default 0)
-- 12. total_amount (decimal(10,2), default 0)
-- 13. status (text, default 'pending')
-- 14. notes (text, nullable)
-- 15. signature_url (text, nullable)
-- 16. payment_method (text, nullable)
-- 17. payment_proof_url (text, nullable)
-- 18. stage (text, nullable)
-- 19. approved_by (uuid, nullable)
-- 20. approved_at (timestamp, nullable)
-- 21. created_at (timestamp, default now())
-- 22. updated_at (timestamp, default now())
--
-- NOTE: There is NO 'remitted' column in client_orders table
-- Remittances are tracked via remittances_log.order_ids (UUID array)
-- ============================================================================

