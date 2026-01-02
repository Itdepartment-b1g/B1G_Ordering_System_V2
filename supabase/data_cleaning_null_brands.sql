-- ============================================================================
-- FINAL DATA CLEANING: REMOVE ORPHANED VARIANTS
-- Removes dependent line items from transactional history since they reference
-- variants that lack a mandatory brand association.
-- ============================================================================

DO $$
DECLARE
    orphaned_variant_ids UUID[];
BEGIN
    -- 1. Identify all variants with NULL brand_id
    SELECT array_agg(id) INTO orphaned_variant_ids 
    FROM public.variants 
    WHERE brand_id IS NULL;

    IF orphaned_variant_ids IS NOT NULL THEN
        -- 2. Delete transactional dependencies (Line Items)
        -- We delete the items because the variant_id column is NOT NULL.
        
        DELETE FROM public.purchase_order_items 
        WHERE variant_id = ANY(orphaned_variant_ids);

        DELETE FROM public.client_order_items 
        WHERE variant_id = ANY(orphaned_variant_ids);

        DELETE FROM public.inventory_transactions 
        WHERE variant_id = ANY(orphaned_variant_ids);

        DELETE FROM public.stock_requests 
        WHERE variant_id = ANY(orphaned_variant_ids);

        -- 3. Delete from child tables that should be removed with the variant (Inventory levels)
        DELETE FROM public.main_inventory WHERE variant_id = ANY(orphaned_variant_ids);
        DELETE FROM public.agent_inventory WHERE variant_id = ANY(orphaned_variant_ids);

        -- 4. Finally, delete the orphaned variants
        DELETE FROM public.variants WHERE id = ANY(orphaned_variant_ids);
        
        RAISE NOTICE 'Successfully cleaned up % orphaned variants and their transactional dependencies.', array_length(orphaned_variant_ids, 1);
    ELSE
        RAISE NOTICE 'No orphaned variants found.';
    END IF;
END $$;
