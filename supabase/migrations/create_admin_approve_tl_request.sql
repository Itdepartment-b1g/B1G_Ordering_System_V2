-- RPC Function: Admin Approve TL Stock Request
-- Allows admin to approve or modify TL stock requests

CREATE OR REPLACE FUNCTION admin_approve_tl_request(
  p_request_id UUID,
  p_approved_quantity INTEGER,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_admin_id UUID;
  v_admin_role TEXT;
  v_request RECORD;
  v_available_quantity INTEGER;
  v_source_name TEXT;
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
      'error', 'Only admins can approve requests'
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
  
  -- Validate approved quantity
  IF p_approved_quantity <= 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Approved quantity must be greater than 0'
    );
  END IF;
  
  IF p_approved_quantity > v_request.requested_quantity THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Approved quantity cannot exceed requested quantity'
    );
  END IF;
  
  -- Check source TL's available stock
  SELECT COALESCE(stock, 0) INTO v_available_quantity
  FROM agent_inventory
  WHERE agent_id = v_request.source_leader_id
  AND variant_id = v_request.variant_id;
  
  IF v_available_quantity IS NULL THEN
    v_available_quantity := 0;
  END IF;
  
  -- Validate sufficient stock
  IF v_available_quantity < p_approved_quantity THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Insufficient stock',
      'available_quantity', v_available_quantity,
      'approved_quantity', p_approved_quantity
    );
  END IF;
  
  -- Update request
  UPDATE tl_stock_requests
  SET 
    status = 'pending_source_tl',
    admin_approved_at = NOW(),
    admin_approved_by = v_admin_id,
    admin_approved_quantity = p_approved_quantity,
    admin_notes = p_notes
  WHERE id = p_request_id;
  
  -- Get names for notification
  SELECT full_name INTO v_source_name
  FROM profiles WHERE id = v_request.source_leader_id;
  
  SELECT full_name INTO v_requester_name
  FROM profiles WHERE id = v_request.requester_leader_id;
  
  -- Notify source TL
  INSERT INTO notifications (company_id, user_id, type, title, message, link)
  VALUES (
    v_request.company_id,
    v_request.source_leader_id,
    'stock_request_approved',
    'Stock Request Approved by Admin',
    'Admin approved a stock request from ' || v_requester_name || ' for ' || p_approved_quantity || ' units. Please review and approve.',
    '/inventory/leader-inventory'
  );
  
  RETURN json_build_object(
    'success', true,
    'request_id', p_request_id,
    'approved_quantity', p_approved_quantity,
    'available_quantity', v_available_quantity
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
