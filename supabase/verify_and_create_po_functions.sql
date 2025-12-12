-- ============================================================================
-- VERIFY AND CREATE PURCHASE ORDER FUNCTIONS
-- ============================================================================

-- First, let's check what functions exist
SELECT 
    routine_name,
    routine_type,
    data_type as return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name LIKE '%purchase_order%'
ORDER BY routine_name;

-- Drop existing functions if they exist (to avoid conflicts)
DROP FUNCTION IF EXISTS approve_purchase_order(UUID, UUID);
DROP FUNCTION IF EXISTS reject_purchase_order(UUID);

-- ============================================================================
-- CREATE FUNCTION: approve_purchase_order
-- ============================================================================
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
            -- Update existing inventory
            UPDATE main_inventory
            SET 
                quantity = quantity + item_record.quantity,
                updated_at = NOW()
            WHERE variant_id = item_record.variant_id
            AND company_id = item_record.company_id;
        ELSE
            -- Insert new inventory record
            INSERT INTO main_inventory (
                company_id,
                variant_id,
                quantity,
                created_at,
                updated_at
            ) VALUES (
                item_record.company_id,
                item_record.variant_id,
                item_record.quantity,
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
            'purchase_order',
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

-- ============================================================================
-- CREATE FUNCTION: reject_purchase_order
-- ============================================================================
CREATE OR REPLACE FUNCTION reject_purchase_order(
    po_id UUID
)
RETURNS JSON AS $$
DECLARE
    po_record RECORD;
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

    -- Check if already approved (can't reject an approved PO)
    IF po_record.status = 'approved' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Cannot reject an already approved purchase order'
        );
    END IF;

    -- Check if already rejected
    IF po_record.status = 'rejected' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Purchase order is already rejected'
        );
    END IF;

    -- Update purchase order status to rejected
    UPDATE purchase_orders
    SET 
        status = 'rejected'
    WHERE id = po_id;

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

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION approve_purchase_order(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION reject_purchase_order(UUID) TO authenticated;

-- Add comments
COMMENT ON FUNCTION approve_purchase_order(UUID, UUID) IS 
'Approves a purchase order and adds items to main inventory. Returns JSON with success status and PO number.';

COMMENT ON FUNCTION reject_purchase_order(UUID) IS 
'Rejects a purchase order. Returns JSON with success status and PO number.';

-- Verify the functions were created
SELECT 
    routine_name,
    routine_type,
    data_type as return_type,
    routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN ('approve_purchase_order', 'reject_purchase_order')
ORDER BY routine_name;

-- Show success message
DO $$
BEGIN
    RAISE NOTICE 'Purchase Order functions created successfully!';
    RAISE NOTICE 'Functions available:';
    RAISE NOTICE '  - approve_purchase_order(po_id UUID, approver_id UUID)';
    RAISE NOTICE '  - reject_purchase_order(po_id UUID)';
END $$;

