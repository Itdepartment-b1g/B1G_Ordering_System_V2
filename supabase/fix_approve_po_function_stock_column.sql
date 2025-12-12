-- ============================================================================
-- FIX: Update approve_purchase_order function to use 'stock' instead of 'quantity'
-- ============================================================================
-- The main_inventory table uses 'stock' column, not 'quantity'

DROP FUNCTION IF EXISTS approve_purchase_order(UUID, UUID);

CREATE OR REPLACE FUNCTION approve_purchase_order(
    po_id UUID,
    approver_id UUID
)
RETURNS JSON AS $$
DECLARE
    po_record RECORD;
    item_record RECORD;
    existing_inventory RECORD;
BEGIN
    -- Get the purchase order details
    SELECT * INTO po_record
    FROM purchase_orders
    WHERE id = po_id;

    -- Check if PO exists
    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Purchase order not found'
        );
    END IF;

    -- Check if already approved
    IF po_record.status = 'approved' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Purchase order is already approved'
        );
    END IF;

    -- Check if rejected
    IF po_record.status = 'rejected' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Cannot approve a rejected purchase order'
        );
    END IF;

    -- Update purchase order status
    UPDATE purchase_orders
    SET 
        status = 'approved',
        approved_by = approver_id,
        approved_at = NOW()
    WHERE id = po_id;

    -- Add items to main_inventory
    FOR item_record IN
        SELECT 
            poi.company_id,
            poi.variant_id,
            poi.quantity,
            v.name as variant_name,
            v.variant_type,
            b.name as brand_name
        FROM purchase_order_items poi
        JOIN variants v ON poi.variant_id = v.id
        JOIN brands b ON v.brand_id = b.id
        WHERE poi.purchase_order_id = po_id
    LOOP
        -- Check if variant already exists in main_inventory
        SELECT * INTO existing_inventory
        FROM main_inventory
        WHERE variant_id = item_record.variant_id
        AND company_id = item_record.company_id;

        IF FOUND THEN
            -- Update existing inventory (use 'stock' column)
            UPDATE main_inventory
            SET 
                stock = stock + item_record.quantity,
                updated_at = NOW()
            WHERE variant_id = item_record.variant_id
            AND company_id = item_record.company_id;
        ELSE
            -- Insert new inventory record (use 'stock' column)
            INSERT INTO main_inventory (
                company_id,
                variant_id,
                stock,
                unit_price,
                reorder_level,
                created_at,
                updated_at
            ) VALUES (
                item_record.company_id,
                item_record.variant_id,
                item_record.quantity,
                0, -- default unit_price, can be updated later
                10, -- default reorder_level, can be updated later
                NOW(),
                NOW()
            );
        END IF;

        -- Create inventory transaction record
        INSERT INTO inventory_transactions (
            company_id,
            variant_id,
            transaction_type,
            quantity,
            reference_type,
            reference_id,
            performed_by,
            notes,
            created_at
        ) VALUES (
            item_record.company_id,
            item_record.variant_id,
            'purchase_order_received',
            item_record.quantity,
            'purchase_order',
            po_id,
            approver_id,
            'Purchase order approved: ' || po_record.po_number || ' - ' || 
                item_record.brand_name || ' ' || item_record.variant_name,
            NOW()
        );
    END LOOP;

    -- Return success
    RETURN json_build_object(
        'success', true,
        'po_number', po_record.po_number
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION approve_purchase_order(UUID, UUID) TO authenticated;

-- Add comment
COMMENT ON FUNCTION approve_purchase_order(UUID, UUID) IS 
'Approves a purchase order and adds items to main inventory using the stock column. Returns JSON with success status and PO number.';

-- Verify the function
SELECT 
    routine_name,
    routine_type,
    data_type as return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name = 'approve_purchase_order';

-- Show success message
DO $$
BEGIN
    RAISE NOTICE '✅ Function approve_purchase_order updated successfully!';
    RAISE NOTICE '   Now uses "stock" column instead of "quantity" for main_inventory';
END $$;

