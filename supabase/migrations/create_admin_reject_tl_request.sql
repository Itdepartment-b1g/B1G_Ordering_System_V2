-- RPC Function: Admin Reject TL Stock Request
-- Allows admin to reject TL stock requests

CREATE OR REPLACE FUNCTION admin_reject_tl_request(
  p_request_id UUID,
  p_reason TEXT
)
RETURNS JSON AS $$
DECLARE
  v_admin_id UUID;
  v_admin_role TEXT;
  v_request RECORD;
  v_requester_name TEXT;
BEGIN
  -- Get admin info
  SELECT id, role INTO v_admin_id, v_admin_role
  FROM profiles
  WHERE id = auth.uid();
  
  -- Validate admin role
  IF v_admin_role NOT IN ('admin', 'super_admin') THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Only admins can reject requests'
    );
  END IF;
  
  -- Get request details
  SELECT * INTO v_request
  FROM tl_stock_requests
  WHERE id = p_request_id;
  
  IF v_request IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Request not found'
    );
  END IF;
  
  -- Validate request status
  IF v_request.status != 'pending_admin' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Request is not pending admin approval'
    );
  END IF;
  
  -- Update request
  UPDATE tl_stock_requests
  SET 
    status = 'admin_rejected',
    rejected_at = NOW(),
    rejected_by = v_admin_id,
    rejection_reason = p_reason
  WHERE id = p_request_id;
  
  -- Get requester name for notification
  SELECT full_name INTO v_requester_name
  FROM profiles WHERE id = v_request.requester_leader_id;
  
  -- Notify requester TL
  INSERT INTO notifications (company_id, user_id, type, title, message, link)
  VALUES (
    v_request.company_id,
    v_request.requester_leader_id,
    'stock_request_rejected',
    'Stock Request Rejected',
    'Your stock request ' || v_request.request_number || ' has been rejected by admin. Reason: ' || p_reason,
    '/inventory/tl-stock-requests'
  );
  
  RETURN json_build_object(
    'success', true,
    'request_id', p_request_id
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
