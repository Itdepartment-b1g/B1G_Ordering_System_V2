-- Function for Leader to reject a stock request from their team
-- This allows team leaders to deny stock requests when they cannot fulfill them

CREATE OR REPLACE FUNCTION reject_stock_request(
  p_request_id UUID,
  p_rejector_id UUID,
  p_reason TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_request RECORD;
BEGIN
  -- Get the request and verify it belongs to this leader
  SELECT * INTO v_request 
  FROM stock_requests 
  WHERE id = p_request_id AND leader_id = p_rejector_id AND status = 'pending';
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Request not found or not pending'
    );
  END IF;

  -- Update the request status to rejected
  UPDATE stock_requests 
  SET 
    status = 'rejected',
    rejected_at = NOW(),
    rejected_by = p_rejector_id,
    rejection_reason = p_reason,
    updated_at = NOW()
  WHERE id = p_request_id;
  
  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Request rejected successfully'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION reject_stock_request(UUID, UUID, TEXT) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION reject_stock_request IS 'Allows team leaders to reject stock requests from their team members when they cannot fulfill them';
