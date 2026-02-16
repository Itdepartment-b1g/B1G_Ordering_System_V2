-- RPC Function: Requester TL Receive Stock
-- Handles final receipt with e-signature and automatic stock transfer

CREATE OR REPLACE FUNCTION requester_tl_receive_stock(
  p_request_id UUID,
  p_signature_url TEXT,
  p_signature_path TEXT
)
RETURNS JSON AS $$
DECLARE
  v_requester_id UUID;
  v_requester_role TEXT;
  v_request RECORD;
  v_source_quantity INTEGER;
  v_requester_quantity INTEGER;
  v_transfer_quantity INTEGER;
  v_source_name TEXT;
  v_requester_name TEXT;
BEGIN
  -- Get requester TL info
  SELECT id, role INTO v_requester_id, v_requester_role
  FROM profiles
  WHERE id = auth.uid();
  
  -- Validate requester is a team leader
  IF v_requester_role != 'team_leader' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Only team leaders can receive stock'
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
  IF v_request.status != 'pending_receipt' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Request is not pending receipt'
    );
  END IF;
  
  -- Validate this is the requester TL
  IF v_request.requester_leader_id != v_requester_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'You are not the requester for this request'
    );
  END IF;
  
  v_transfer_quantity := v_request.admin_approved_quantity;
  
  -- Get current quantities
  SELECT COALESCE(stock, 0) INTO v_source_quantity
  FROM agent_inventory
  WHERE agent_id = v_request.source_leader_id
  AND variant_id = v_request.variant_id;
  
  SELECT COALESCE(stock, 0) INTO v_requester_quantity
  FROM agent_inventory
  WHERE agent_id = v_requester_id
  AND variant_id = v_request.variant_id;
  
  -- Final validation of source stock
  IF v_source_quantity < v_transfer_quantity THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Source TL has insufficient stock',
      'available', v_source_quantity,
      'required', v_transfer_quantity
    );
  END IF;
  
  -- Deduct from source TL
  UPDATE agent_inventory
  SET stock = stock - v_transfer_quantity
  WHERE agent_id = v_request.source_leader_id
  AND variant_id = v_request.variant_id;
  
  -- Add to requester TL (insert or update)
  INSERT INTO agent_inventory (agent_id, variant_id, stock, company_id, allocated_price, dsp_price, rsp_price)
  SELECT 
    v_requester_id,
    v_request.variant_id,
    v_transfer_quantity,
    v_request.company_id,
    COALESCE(source.allocated_price, 0),
    COALESCE(source.dsp_price, 0),
    COALESCE(source.rsp_price, 0)
  FROM agent_inventory source
  WHERE source.agent_id = v_request.source_leader_id
  AND source.variant_id = v_request.variant_id
  ON CONFLICT (agent_id, variant_id)
  DO UPDATE SET 
    stock = agent_inventory.stock + v_transfer_quantity,
    allocated_price = EXCLUDED.allocated_price,
    dsp_price = EXCLUDED.dsp_price,
    rsp_price = EXCLUDED.rsp_price;
  
  -- Update request to completed
  UPDATE tl_stock_requests
  SET 
    status = 'completed',
    received_at = NOW(),
    received_by = v_requester_id,
    received_quantity = v_transfer_quantity,
    received_signature_url = p_signature_url,
    received_signature_path = p_signature_path
  WHERE id = p_request_id;
  
  -- Get names for notifications
  SELECT full_name INTO v_source_name
  FROM profiles WHERE id = v_request.source_leader_id;
  
  SELECT full_name INTO v_requester_name
  FROM profiles WHERE id = v_requester_id;
  
  -- Notify source TL
  INSERT INTO notifications (company_id, user_id, type, title, message, link)
  VALUES (
    v_request.company_id,
    v_request.source_leader_id,
    'stock_transfer_completed',
    'Stock Transfer Completed',
    v_requester_name || ' has received ' || v_transfer_quantity || ' units from stock request ' || v_request.request_number,
    '/inventory/leader-inventory'
  );
  
  -- Notify admins
  INSERT INTO notifications (company_id, user_id, type, title, message, link)
  SELECT 
    v_request.company_id,
    profiles.id,
    'stock_transfer_completed',
    'TL Stock Transfer Completed',
    'Stock request ' || v_request.request_number || ' completed: ' || v_transfer_quantity || ' units transferred from ' || v_source_name || ' to ' || v_requester_name,
    '/inventory/admin-tl-requests'
  FROM profiles
  WHERE company_id = v_request.company_id
  AND role IN ('admin', 'super_admin')
  AND status = 'active';
  
  RETURN json_build_object(
    'success', true,
    'request_id', p_request_id,
    'transferred_quantity', v_transfer_quantity
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
