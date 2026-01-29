-- ============================================================================
-- CREATE FUNCTION: reject_purchase_order
-- ============================================================================
-- This function rejects a purchase order
-- It returns success status for the frontend

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

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION reject_purchase_order(UUID) TO authenticated;

-- Add comment
COMMENT ON FUNCTION reject_purchase_order(UUID) IS 
'Rejects a purchase order. Returns JSON with success status and PO number.';

