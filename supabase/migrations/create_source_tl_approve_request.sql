-- RPC Function: Source TL Approve Request
-- Allows source TL to approve request with e-signature

CREATE OR REPLACE FUNCTION source_tl_approve_request(
  p_request_id UUID,
  p_signature_url TEXT,
  p_signature_path TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_source_id UUID;
  v_source_role TEXT;
  v_request RECORD;
  v_available_quantity INTEGER;
  v_requester_name TEXT;
BEGIN
  -- Get source TL info
  SELECT id, role INTO v_source_id, v_source_role
  FROM profiles
  WHERE id = auth.uid();
  
  -- Validate source is a team leader
  IF v_source_role != 'team_leader' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Only team leaders can approve requests'
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
  
  -- Re-validate sufficient stock (in case it changed)
  SELECT COALESCE(stock, 0) INTO v_available_quantity
  FROM agent_inventory
  WHERE agent_id = v_source_id
  AND variant_id = v_request.variant_id;
  
  IF v_available_quantity IS NULL THEN
    v_available_quantity := 0;
  END IF;
  
  IF v_available_quantity < v_request.admin_approved_quantity THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Insufficient stock',
      'available_quantity', v_available_quantity,
      'required_quantity', v_request.admin_approved_quantity
    );
  END IF;
  
  -- Update request
  UPDATE tl_stock_requests
  SET 
    status = 'pending_receipt',
    source_tl_approved_at = NOW(),
    source_tl_approved_by = v_source_id,
    source_tl_signature_url = p_signature_url,
    source_tl_signature_path = p_signature_path,
    source_tl_notes = p_notes
  WHERE id = p_request_id;
  
  -- Get requester name for notification
  SELECT full_name INTO v_requester_name
  FROM profiles WHERE id = v_request.requester_leader_id;
  
  -- Notify requester TL
  INSERT INTO notifications (company_id, user_id, type, title, message, link)
  VALUES (
    v_request.company_id,
    v_request.requester_leader_id,
    'stock_ready_for_receipt',
    'Stock Ready for Receipt',
    'Your stock request ' || v_request.request_number || ' has been approved. Please sign to receive.',
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
