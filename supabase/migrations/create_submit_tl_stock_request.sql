-- RPC Function: Submit TL Stock Request
-- Allows a Team Leader to submit a stock request to another Team Leader

CREATE OR REPLACE FUNCTION submit_tl_stock_request(
  p_company_id UUID,
  p_source_leader_id UUID,
  p_variant_id UUID,
  p_requested_quantity INTEGER
)
RETURNS JSON AS $$
DECLARE
  v_requester_id UUID;
  v_requester_role TEXT;
  v_source_role TEXT;
  v_request_number TEXT;
  v_request_id UUID;
  v_date_str TEXT;
  v_count INTEGER;
BEGIN
  -- Get requester info
  SELECT id, role INTO v_requester_id, v_requester_role
  FROM profiles
  WHERE id = auth.uid() AND company_id = p_company_id;
  
  -- Validate requester is a team leader
  IF v_requester_role != 'team_leader' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Only team leaders can submit stock requests'
    );
  END IF;
  
  -- Validate source is a team leader
  SELECT role INTO v_source_role
  FROM profiles
  WHERE id = p_source_leader_id AND company_id = p_company_id;
  
  IF v_source_role IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Source team leader not found'
    );
  END IF;
  
  IF v_source_role != 'team_leader' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Source must be a team leader'
    );
  END IF;
  
  -- Validate requester and source are different
  IF v_requester_id = p_source_leader_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Cannot request from yourself'
    );
  END IF;
  
  -- Generate unique request number
  v_date_str := TO_CHAR(NOW(), 'YYYYMMDD');
  
  -- Get count of requests today for this company
  SELECT COUNT(*) INTO v_count
  FROM tl_stock_requests
  WHERE company_id = p_company_id
  AND created_at::DATE = CURRENT_DATE;
  
  v_request_number := 'TLREQ-' || v_date_str || '-' || LPAD((v_count + 1)::TEXT, 4, '0');
  
  -- Insert request
  INSERT INTO tl_stock_requests (
    company_id,
    request_number,
    requester_leader_id,
    source_leader_id,
    variant_id,
    requested_quantity,
    status
  ) VALUES (
    p_company_id,
    v_request_number,
    v_requester_id,
    p_source_leader_id,
    p_variant_id,
    p_requested_quantity,
    'pending_admin'
  ) RETURNING id INTO v_request_id;
  
  -- Insert notification for admins
  INSERT INTO notifications (company_id, user_id, type, title, message, link)
  SELECT 
    p_company_id,
    profiles.id,
    'stock_request',
    'New TL Stock Request',
    'Team Leader ' || (SELECT full_name FROM profiles WHERE id = v_requester_id) || 
    ' requests stock from ' || (SELECT full_name FROM profiles WHERE id = p_source_leader_id),
    '/inventory/admin-tl-requests'
  FROM profiles
  WHERE company_id = p_company_id
  AND role IN ('admin', 'super_admin')
  AND status = 'active';
  
  RETURN json_build_object(
    'success', true,
    'request_id', v_request_id,
    'request_number', v_request_number
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
