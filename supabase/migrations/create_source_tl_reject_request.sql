-- RPC Function: Source TL Reject Request
-- Allows source TL to reject request

CREATE OR REPLACE FUNCTION source_tl_reject_request(
  p_request_id UUID,
  p_reason TEXT
)
RETURNS JSON AS $$
DECLARE
  v_source_id UUID;
  v_source_role TEXT;
  v_request RECORD;
  v_requester_name TEXT;
  v_source_name TEXT;
BEGIN
  -- Get source TL info
  SELECT id, role INTO v_source_id, v_source_role
  FROM profiles
  WHERE id = auth.uid();
  
  -- Validate source is a team leader
  IF v_source_role != 'team_leader' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Only team leaders can reject requests'
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
  IF v_request.status != 'pending_source_tl' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Request is not pending your approval'
    );
  END IF;
  
  -- Validate this is the source TL
  IF v_request.source_leader_id != v_source_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'You are not the source team leader for this request'
    );
  END IF;
  
  -- Update request
  UPDATE tl_stock_requests
  SET 
    status = 'source_tl_rejected',
    rejected_at = NOW(),
    rejected_by = v_source_id,
    rejection_reason = p_reason
  WHERE id = p_request_id;
  
  -- Get names for notifications
  SELECT full_name INTO v_requester_name
  FROM profiles WHERE id = v_request.requester_leader_id;
  
  SELECT full_name INTO v_source_name
  FROM profiles WHERE id = v_source_id;
  
  -- Notify requester TL
  INSERT INTO notifications (company_id, user_id, type, title, message, link)
  VALUES (
    v_request.company_id,
    v_request.requester_leader_id,
    'stock_request_rejected',
    'Stock Request Rejected',
    v_source_name || ' rejected your stock request ' || v_request.request_number || '. Reason: ' || p_reason,
    '/inventory/tl-stock-requests'
  );
  
  -- Notify admins
  INSERT INTO notifications (company_id, user_id, type, title, message, link)
  SELECT 
    v_request.company_id,
    profiles.id,
    'stock_request_rejected',
    'TL Stock Request Rejected',
    v_source_name || ' rejected stock request ' || v_request.request_number || ' from ' || v_requester_name,
    '/inventory/admin-tl-requests'
  FROM profiles
  WHERE company_id = v_request.company_id
  AND role IN ('admin', 'super_admin')
  AND status = 'active';
  
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
