-- RPC Function to delete an inventory variant and all related records
-- Handles cascading deletion manually for tables with ON DELETE RESTRICT
CREATE OR REPLACE FUNCTION delete_inventory_variant(p_variant_id UUID, p_company_id UUID)
RETURNS void AS $$
BEGIN
    -- Ensure the variant belongs to the company (Multi-tenant check)
    IF NOT EXISTS (
        SELECT 1 FROM variants 
        WHERE id = p_variant_id AND company_id = p_company_id
    ) THEN
        RAISE EXCEPTION 'Variant not found or access denied';
    END IF;

    -- 1. Delete Stock Request Items
    DELETE FROM stock_request_items WHERE variant_id = p_variant_id AND company_id = p_company_id;
    
    -- 2. Delete Stock Requests (if empty or specifically for this variant)
    -- In our schema, stock_requests has variant_id at the top level too
    DELETE FROM stock_requests WHERE variant_id = p_variant_id AND company_id = p_company_id;

    -- 3. Delete Inventory Transactions
    DELETE FROM inventory_transactions WHERE variant_id = p_variant_id AND company_id = p_company_id;

    -- 4. Delete Client Order Items
    DELETE FROM client_order_items WHERE variant_id = p_variant_id AND company_id = p_company_id;

    -- 5. Delete Purchase Order Items
    DELETE FROM purchase_order_items WHERE variant_id = p_variant_id AND company_id = p_company_id;

    -- 6. Delete Agent Inventory
    DELETE FROM agent_inventory WHERE variant_id = p_variant_id AND company_id = p_company_id;

    -- 7. Delete Main Inventory
    DELETE FROM main_inventory WHERE variant_id = p_variant_id AND company_id = p_company_id;

    -- 8. Finally, delete the variant itself
    DELETE FROM variants WHERE id = p_variant_id AND company_id = p_company_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
