-- ============================================================================
-- FIX STOCK APPROVAL FOR DIRECT LEADER REQUESTS (2026-02-12)
-- ============================================================================
-- Apply the logic from 20240212_fix_stock_approval.sql as a new migration
-- to ensure the function is updated in the database.

CREATE OR REPLACE FUNCTION admin_approve_stock_request(
  p_request_id UUID,
  p_admin_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_request RECORD;
  v_total_quantity INTEGER;
  v_available_stock INTEGER;
  v_allocated_price DECIMAL(10,2);
  v_dsp_price DECIMAL(10,2);
  v_rsp_price DECIMAL(10,2);
BEGIN
  -- Get the request
  SELECT * INTO v_request
  FROM stock_requests
  WHERE id = p_request_id AND status = 'approved_by_leader';
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Request not found or not awaiting admin approval');
  END IF;
  
  -- Calculate total quantity
  v_total_quantity := v_request.requested_quantity + COALESCE(v_request.leader_additional_quantity, 0);
  
  -- Check available stock
  v_available_stock := get_available_stock(v_request.variant_id, v_request.company_id);
  
  IF v_available_stock < v_total_quantity THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', format('Insufficient stock. Available: %s, Requested: %s', v_available_stock, v_total_quantity)
    );
  END IF;
  
  -- ========================================================================
  -- LOGIC BRANCHING
  -- ========================================================================
  
  -- CASE A: DIRECT LEADER REQUEST (Agent = Leader)
  -- Immediate Fulfillment
  IF v_request.agent_id = v_request.leader_id THEN
  
    -- 1. Get pricing from main_inventory
    SELECT 
      COALESCE(selling_price, unit_price, 0),
      COALESCE(dsp_price, 0),
      COALESCE(rsp_price, 0)
    INTO v_allocated_price, v_dsp_price, v_rsp_price
    FROM main_inventory 
    WHERE variant_id = v_request.variant_id AND company_id = v_request.company_id;

    -- 2. Deduct from MAIN INVENTORY (Physical Stock)
    -- Note: We do NOT touch allocated_stock because we are bypassing the allocation phase
    UPDATE main_inventory
    SET 
      stock = stock - v_total_quantity,
      updated_at = NOW()
    WHERE variant_id = v_request.variant_id AND company_id = v_request.company_id;

    -- 3. Add to LEADER INVENTORY
    INSERT INTO agent_inventory (company_id, agent_id, variant_id, stock, allocated_price, dsp_price, rsp_price)
    VALUES (v_request.company_id, v_request.leader_id, v_request.variant_id, v_total_quantity, v_allocated_price, v_dsp_price, v_rsp_price)
    ON CONFLICT (agent_id, variant_id) 
    DO UPDATE SET 
      stock = agent_inventory.stock + v_total_quantity,
      allocated_price = EXCLUDED.allocated_price,
      dsp_price = EXCLUDED.dsp_price,
      rsp_price = EXCLUDED.rsp_price,
      updated_at = NOW();

    -- 4. Mark Request as FULFILLED
    UPDATE stock_requests 
    SET 
      status = 'fulfilled',
      admin_approved_at = NOW(),
      admin_approved_by = p_admin_id,
      admin_notes = COALESCE(p_notes, admin_notes),
      fulfilled_at = NOW(),
      fulfilled_by = p_admin_id, -- Admin fulfilled it directly
      fulfilled_quantity = v_total_quantity,
      updated_at = NOW()
    WHERE id = p_request_id;

    RETURN jsonb_build_object(
      'success', true, 
      'message', 'Request fulfilled and stock transferred to Leader',
      'total_transferred', v_total_quantity
    );

  -- CASE B: INDIRECT REQUEST (Mobile Agent -> Leader)
  -- Allocation Only (Existing Logic)
  ELSE
  
    -- 1. Update main_inventory: add to allocated_stock
    UPDATE main_inventory 
    SET 
      allocated_stock = COALESCE(allocated_stock, 0) + v_total_quantity,
      updated_at = NOW()
    WHERE variant_id = v_request.variant_id AND company_id = v_request.company_id;
    
    -- 2. Update the request status
    UPDATE stock_requests 
    SET 
      status = 'approved_by_admin',
      admin_approved_at = NOW(),
      admin_approved_by = p_admin_id,
      admin_notes = COALESCE(p_notes, admin_notes),
      updated_at = NOW()
    WHERE id = p_request_id;
    
    RETURN jsonb_build_object(
      'success', true, 
      'message', 'Request approved and stock allocated (pending leader distribution)',
      'total_allocated', v_total_quantity,
      'agent_quantity', v_request.requested_quantity,
      'leader_quantity', COALESCE(v_request.leader_additional_quantity, 0)
    );
    
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
