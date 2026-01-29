-- ============================================================================
-- REJECT CLIENT ORDER FUNCTION
-- ============================================================================
-- This function handles the rejection of an order by an admin or finance user.
-- 1. Updates order status and stage
-- 2. Records who rejected the order and when
-- 3. Stores the rejection reason
-- ============================================================================

DROP FUNCTION IF EXISTS reject_client_order(UUID, UUID, TEXT) CASCADE;

CREATE OR REPLACE FUNCTION reject_client_order(
  p_order_id UUID,
  p_approver_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Validate order
  IF NOT EXISTS (SELECT 1 FROM client_orders WHERE id = p_order_id) THEN
    RETURN json_build_object('success', false, 'message', 'Order not found');
  END IF;

  -- 2. Update order status
  UPDATE client_orders
  SET 
    status = 'rejected',
    stage = 'admin_rejected',
    notes = COALESCE(notes, '') || E'\nRejection Reason: ' || COALESCE(p_reason, 'No reason provided'),
    approved_by = p_approver_id,
    approved_at = NOW(),
    updated_at = NOW()
  WHERE id = p_order_id;

  RETURN json_build_object(
    'success', true, 
    'message', 'Order rejected successfully'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION reject_client_order(UUID, UUID, TEXT) TO authenticated;
