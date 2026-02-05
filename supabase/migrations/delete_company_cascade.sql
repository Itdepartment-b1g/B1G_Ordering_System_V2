-- ============================================================================
-- DELETE COMPANY WITH CASCADE FUNCTION
-- ============================================================================
-- This function safely deletes a company and ALL related records across ALL tables
-- 
-- When a company is deleted, the following will be automatically deleted via CASCADE:
--   - profiles (users belonging to the company)
--   - brands, variants, main_inventory, agent_inventory
--   - suppliers, purchase_orders, purchase_order_items
--   - clients, client_orders, client_order_items
--   - remittances_log, inventory_transactions, financial_transactions
--   - notifications, leader_teams, stock_requests, stock_request_items
--   - inventory_returns, inventory_return_items
--   - cash_deposits, events, system_audit_log
--   - executive_company_assignments (for this company)
-- 
-- This function handles special cases:
--   1. Cleans up executive_company_assignments before deletion
--   2. Sets assigned_by to NULL for profiles that will be deleted
--   3. Ensures no foreign key violations occur
-- 
-- Only system administrators can use this function
-- ============================================================================

CREATE OR REPLACE FUNCTION delete_company_cascade(p_company_id UUID)
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    profile_ids UUID[];
BEGIN
    -- Verify the user is a system administrator
    IF NOT EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND role = 'system_administrator'
    ) THEN
        RAISE EXCEPTION 'Only system administrators can delete companies';
    END IF;

    -- Verify the company exists
    IF NOT EXISTS (
        SELECT 1 FROM companies 
        WHERE id = p_company_id
    ) THEN
        RAISE EXCEPTION 'Company not found';
    END IF;

    -- Step 1: Get all profile IDs that belong to this company
    -- These profiles will be deleted when we delete the company, so we need to clean up their assignments first
    SELECT ARRAY_AGG(id) INTO profile_ids
    FROM profiles 
    WHERE company_id = p_company_id;

    -- Step 2: Set assigned_by to NULL for any assignments where assigned_by references profiles that will be deleted
    -- This prevents foreign key violations when profiles are deleted
    IF profile_ids IS NOT NULL AND array_length(profile_ids, 1) > 0 THEN
        UPDATE executive_company_assignments 
        SET assigned_by = NULL
        WHERE assigned_by = ANY(profile_ids);
    END IF;

    -- Step 3: Delete all executive_company_assignments for this company
    -- This removes all executive assignments to the company being deleted
    DELETE FROM executive_company_assignments 
    WHERE company_id = p_company_id;
    
    -- Step 4: Delete any assignments where the executive profile belongs to this company
    -- (even if assigned to other companies) - these executives will be deleted with the company
    IF profile_ids IS NOT NULL AND array_length(profile_ids, 1) > 0 THEN
        DELETE FROM executive_company_assignments 
        WHERE executive_id = ANY(profile_ids);
    END IF;

    -- Step 5: Handle nullable foreign keys that reference profiles
    -- Set to NULL any nullable fields that reference profiles that will be deleted
    -- This prevents foreign key violations for nullable references
    -- Note: Non-nullable fields will be handled by CASCADE when the company is deleted
    IF profile_ids IS NOT NULL AND array_length(profile_ids, 1) > 0 THEN
        -- Update stock_requests nullable approval/rejection fields (these are nullable)
        UPDATE stock_requests 
        SET leader_approved_by = NULL 
        WHERE leader_approved_by = ANY(profile_ids) AND company_id = p_company_id;
        
        UPDATE stock_requests 
        SET admin_approved_by = NULL 
        WHERE admin_approved_by = ANY(profile_ids) AND company_id = p_company_id;
        
        UPDATE stock_requests 
        SET fulfilled_by = NULL 
        WHERE fulfilled_by = ANY(profile_ids) AND company_id = p_company_id;
        
        UPDATE stock_requests 
        SET rejected_by = NULL 
        WHERE rejected_by = ANY(profile_ids) AND company_id = p_company_id;
        
        -- Update client_orders nullable approval field
        UPDATE client_orders 
        SET approved_by = NULL 
        WHERE approved_by = ANY(profile_ids) AND company_id = p_company_id;
        
        -- Update purchase_orders nullable approval field
        UPDATE purchase_orders 
        SET approved_by = NULL 
        WHERE approved_by = ANY(profile_ids) AND company_id = p_company_id;
        
        -- Update financial_transactions nullable agent_id field
        UPDATE financial_transactions 
        SET agent_id = NULL 
        WHERE agent_id = ANY(profile_ids) AND company_id = p_company_id;
        
        -- Note: inventory_transactions.performed_by is NOT NULL, so it will be handled by CASCADE
        -- when the company is deleted (all inventory_transactions for the company will be deleted)
    END IF;

    -- Step 6: Now we can safely delete the company
    -- This will CASCADE delete ALL related records across ALL tables:
    --   - profiles (where company_id = p_company_id)
    --   - brands, variants, main_inventory, agent_inventory
    --   - suppliers, purchase_orders, purchase_order_items
    --   - clients, client_orders, client_order_items
    --   - remittances_log, inventory_transactions, financial_transactions
    --   - notifications, leader_teams, stock_requests, stock_request_items
    --   - inventory_returns, inventory_return_items
    --   - cash_deposits, events, system_audit_log
    --   - executive_company_assignments (for this company)
    -- 
    -- Note: Executives have company_id = NULL, so they won't be deleted
    --       Their assignments to this company have already been removed in Step 3
    DELETE FROM companies 
    WHERE id = p_company_id;

    -- If we get here, deletion was successful
    -- All data related to this company has been removed from all tables
END;
$$;

-- Grant execute permission to authenticated users (RLS will check for system_administrator)
GRANT EXECUTE ON FUNCTION delete_company_cascade(UUID) 
    TO authenticated, service_role;

-- Add comment
COMMENT ON FUNCTION delete_company_cascade(UUID) IS 
    'Safely deletes a company and all related records. Only system administrators can use this function.';
