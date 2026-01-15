-- Function for Leader to approve request using their OWN stock
-- 1. Checks if leader has enough stock in agent_inventory
-- 2. Deducts from leader's agent_inventory
-- 3. Adds to agent's agent_inventory
-- 4. Marks request as fulfilled (skips admin)

CREATE OR REPLACE FUNCTION approve_stock_request_by_leader(
  p_request_id UUID,
  p_leader_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_request RECORD;
  v_leader_inventory RECORD;
  v_allocated_price DECIMAL(10,2);
  v_dsp_price DECIMAL(10,2);
  v_rsp_price DECIMAL(10,2);
BEGIN
  -- Get the original request
  SELECT * INTO v_request 
  FROM stock_requests 
  WHERE id = p_request_id AND leader_id = p_leader_id AND status = 'pending';
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Request not found or not pending');
  END IF;

  -- Check Leader's Inventory for this variant
  SELECT * INTO v_leader_inventory
  FROM agent_inventory
  WHERE agent_id = p_leader_id AND variant_id = v_request.variant_id;

  IF v_leader_inventory IS NULL OR v_leader_inventory.stock < v_request.requested_quantity THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Insufficient leader stock availability'
    );
  END IF;

  -- Get pricing from main_inventory for consistency (or could use leader's inventory price)
  SELECT 
    COALESCE(selling_price, unit_price, 0),
    COALESCE(dsp_price, 0),
    COALESCE(rsp_price, 0)
  INTO v_allocated_price, v_dsp_price, v_rsp_price
  FROM main_inventory 
  WHERE variant_id = v_request.variant_id AND company_id = v_request.company_id;

  -- 1. Deduct from Leader's Stock
  UPDATE agent_inventory
  SET stock = stock - v_request.requested_quantity,
      updated_at = NOW()
  WHERE id = v_leader_inventory.id;

  -- 2. Add to Agent's Inventory
  INSERT INTO agent_inventory (company_id, agent_id, variant_id, stock, allocated_price, dsp_price, rsp_price)
  VALUES (v_request.company_id, v_request.agent_id, v_request.variant_id, v_request.requested_quantity, v_allocated_price, v_dsp_price, v_rsp_price)
  ON CONFLICT (agent_id, variant_id) 
  DO UPDATE SET 
    stock = agent_inventory.stock + v_request.requested_quantity,
    allocated_price = EXCLUDED.allocated_price,
    dsp_price = EXCLUDED.dsp_price,
    rsp_price = EXCLUDED.rsp_price,
    updated_at = NOW();

  -- 3. Mark request as Fulfilled (Directly by Leader)
  UPDATE stock_requests 
  SET 
    status = 'fulfilled',
    leader_approved_at = NOW(),
    leader_approved_by = p_leader_id,
    leader_notes = COALESCE(p_notes, leader_notes),
    fulfilled_at = NOW(),
    fulfilled_by = p_leader_id,
    fulfilled_quantity = v_request.requested_quantity,
    updated_at = NOW()
  WHERE id = p_request_id;
  
  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Request approved and distributed from leader stock',
    'distributed_quantity', v_request.requested_quantity
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
