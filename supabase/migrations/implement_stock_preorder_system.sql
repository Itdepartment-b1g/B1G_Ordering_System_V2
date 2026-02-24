-- ============================================================================
-- STOCK PRE-ORDER SYSTEM IMPLEMENTATION
-- ============================================================================
-- Implements the new stock request flow:
-- 1. Mobile Sales requests stock (e.g., 10 units)
-- 2. Team Leader can add their own quantity (e.g., +40 units) when forwarding
-- 3. Admin approves combined request (50 total)
--    - Minus from available_stock, Plus to allocated_stock
-- 4. Team Leader accepts and distributes:
--    - Leader gets their portion (40)
--    - Mobile Sales gets their portion (10)
-- ============================================================================

-- ============================================================================
-- STEP 1: ADD ALLOCATED_STOCK COLUMN TO MAIN_INVENTORY
-- ============================================================================
-- stock = total physical stock
-- allocated_stock = stock reserved/allocated to team leaders (not yet distributed to agents)
-- available_stock = stock - allocated_stock (computed)

ALTER TABLE main_inventory 
ADD COLUMN IF NOT EXISTS allocated_stock INTEGER DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN main_inventory.allocated_stock IS 
'Stock reserved for approved requests but not yet distributed. Available = stock - allocated_stock';

-- Create a computed column view or helper function for available stock
CREATE OR REPLACE FUNCTION get_available_stock(p_variant_id UUID, p_company_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_stock INTEGER;
  v_allocated INTEGER;
BEGIN
  SELECT stock, COALESCE(allocated_stock, 0) 
  INTO v_stock, v_allocated
  FROM main_inventory 
  WHERE variant_id = p_variant_id AND company_id = p_company_id;
  
  RETURN COALESCE(v_stock, 0) - COALESCE(v_allocated, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 2: ADD LEADER ADDITIONAL QUANTITY TO STOCK_REQUESTS
-- ============================================================================
-- When team leader forwards a request, they can add their own quantity

ALTER TABLE stock_requests 
ADD COLUMN IF NOT EXISTS leader_additional_quantity INTEGER DEFAULT 0;

ALTER TABLE stock_requests 
ADD COLUMN IF NOT EXISTS is_combined_request BOOLEAN DEFAULT false;

-- Track how much of the total request is for the leader vs agent
COMMENT ON COLUMN stock_requests.leader_additional_quantity IS 
'Additional quantity the team leader requests for themselves when forwarding agent request to admin';

COMMENT ON COLUMN stock_requests.is_combined_request IS 
'True if this request includes leader additional quantity (combined agent + leader request)';

-- ============================================================================
-- STEP 3: CREATE RPC FUNCTION - LEADER FORWARDS REQUEST WITH ADDITIONAL QTY
-- ============================================================================
CREATE OR REPLACE FUNCTION forward_stock_request_with_leader_qty(
  p_request_id UUID,
  p_leader_id UUID,
  p_leader_additional_quantity INTEGER DEFAULT 0,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_request RECORD;
  v_total_quantity INTEGER;
BEGIN
  -- Get the original request
  SELECT * INTO v_request 
  FROM stock_requests 
  WHERE id = p_request_id AND leader_id = p_leader_id AND status = 'pending';
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Request not found or not pending');
  END IF;
  
  -- Calculate total quantity
  v_total_quantity := v_request.requested_quantity + COALESCE(p_leader_additional_quantity, 0);
  
  -- Update the request
  UPDATE stock_requests 
  SET 
    status = 'approved_by_leader',
    leader_additional_quantity = COALESCE(p_leader_additional_quantity, 0),
    is_combined_request = (COALESCE(p_leader_additional_quantity, 0) > 0),
    leader_approved_at = NOW(),
    leader_approved_by = p_leader_id,
    leader_notes = COALESCE(p_notes, leader_notes),
    updated_at = NOW()
  WHERE id = p_request_id;
  
  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Request forwarded to admin',
    'total_quantity', v_total_quantity,
    'agent_quantity', v_request.requested_quantity,
    'leader_quantity', COALESCE(p_leader_additional_quantity, 0)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 4: CREATE RPC FUNCTION - ADMIN APPROVES REQUEST
-- ============================================================================
-- When admin approves:
-- 1. Check available stock
-- 2. Deduct from available (add to allocated)
-- 3. Update request status

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
BEGIN
  -- Get the request (stock_requests already has company_id)
  SELECT * INTO v_request
  FROM stock_requests
  WHERE id = p_request_id AND status = 'approved_by_leader';
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Request not found or not awaiting admin approval');
  END IF;
  
  -- Calculate total quantity needed
  v_total_quantity := v_request.requested_quantity + COALESCE(v_request.leader_additional_quantity, 0);
  
  -- Check available stock
  v_available_stock := get_available_stock(v_request.variant_id, v_request.company_id);
  
  IF v_available_stock < v_total_quantity THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', format('Insufficient stock. Available: %s, Requested: %s', v_available_stock, v_total_quantity)
    );
  END IF;
  
  -- Update main_inventory: add to allocated_stock
  UPDATE main_inventory 
  SET 
    allocated_stock = COALESCE(allocated_stock, 0) + v_total_quantity,
    updated_at = NOW()
  WHERE variant_id = v_request.variant_id AND company_id = v_request.company_id;
  
  -- Update the request status
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
    'message', 'Request approved and stock allocated',
    'total_allocated', v_total_quantity,
    'agent_quantity', v_request.requested_quantity,
    'leader_quantity', COALESCE(v_request.leader_additional_quantity, 0)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 5: CREATE RPC FUNCTION - LEADER ACCEPTS AND DISTRIBUTES STOCK
-- ============================================================================
-- When leader accepts:
-- 1. Deduct from main_inventory.allocated_stock
-- 2. Add leader's portion to leader's agent_inventory
-- 3. Add agent's portion to agent's agent_inventory
-- 4. Mark request as fulfilled

CREATE OR REPLACE FUNCTION leader_accept_and_distribute_stock(
  p_request_id UUID,
  p_leader_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_request RECORD;
  v_total_quantity INTEGER;
  v_agent_quantity INTEGER;
  v_leader_quantity INTEGER;
  v_allocated_price DECIMAL(10,2);
  v_dsp_price DECIMAL(10,2);
  v_rsp_price DECIMAL(10,2);
BEGIN
  -- Get the approved request
  SELECT * INTO v_request 
  FROM stock_requests 
  WHERE id = p_request_id AND leader_id = p_leader_id AND status = 'approved_by_admin';
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Request not found or not approved by admin');
  END IF;
  
  -- Calculate quantities
  v_agent_quantity := v_request.requested_quantity;
  v_leader_quantity := COALESCE(v_request.leader_additional_quantity, 0);
  v_total_quantity := v_agent_quantity + v_leader_quantity;
  
  -- Get pricing from main_inventory
  SELECT 
    COALESCE(selling_price, unit_price, 0),
    COALESCE(dsp_price, 0),
    COALESCE(rsp_price, 0)
  INTO v_allocated_price, v_dsp_price, v_rsp_price
  FROM main_inventory 
  WHERE variant_id = v_request.variant_id AND company_id = v_request.company_id;
  
  -- 1. Deduct from main_inventory.allocated_stock and stock
  UPDATE main_inventory 
  SET 
    stock = stock - v_total_quantity,
    allocated_stock = COALESCE(allocated_stock, 0) - v_total_quantity,
    updated_at = NOW()
  WHERE variant_id = v_request.variant_id AND company_id = v_request.company_id;
  
  -- 2. Add leader's portion to leader's inventory (if any)
  IF v_leader_quantity > 0 THEN
    INSERT INTO agent_inventory (company_id, agent_id, variant_id, stock, allocated_price, dsp_price, rsp_price)
    VALUES (v_request.company_id, p_leader_id, v_request.variant_id, v_leader_quantity, v_allocated_price, v_dsp_price, v_rsp_price)
    ON CONFLICT (agent_id, variant_id) 
    DO UPDATE SET 
      stock = agent_inventory.stock + v_leader_quantity,
      allocated_price = EXCLUDED.allocated_price,
      dsp_price = EXCLUDED.dsp_price,
      rsp_price = EXCLUDED.rsp_price,
      updated_at = NOW();
  END IF;
  
  -- 3. Add agent's portion to agent's inventory
  INSERT INTO agent_inventory (company_id, agent_id, variant_id, stock, allocated_price, dsp_price, rsp_price)
  VALUES (v_request.company_id, v_request.agent_id, v_request.variant_id, v_agent_quantity, v_allocated_price, v_dsp_price, v_rsp_price)
  ON CONFLICT (agent_id, variant_id) 
  DO UPDATE SET 
    stock = agent_inventory.stock + v_agent_quantity,
    allocated_price = EXCLUDED.allocated_price,
    dsp_price = EXCLUDED.dsp_price,
    rsp_price = EXCLUDED.rsp_price,
    updated_at = NOW();
  
  -- 4. Mark request as fulfilled
  UPDATE stock_requests 
  SET 
    status = 'fulfilled',
    fulfilled_at = NOW(),
    fulfilled_by = p_leader_id,
    fulfilled_quantity = v_total_quantity,
    updated_at = NOW()
  WHERE id = p_request_id;
  
  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Stock distributed successfully',
    'total_distributed', v_total_quantity,
    'agent_received', v_agent_quantity,
    'leader_received', v_leader_quantity
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 6: CREATE RPC FUNCTION - ADMIN REJECTS REQUEST
-- ============================================================================
CREATE OR REPLACE FUNCTION admin_reject_stock_request(
  p_request_id UUID,
  p_admin_id UUID,
  p_reason TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_request RECORD;
BEGIN
  -- Get the request
  SELECT * INTO v_request 
  FROM stock_requests 
  WHERE id = p_request_id AND status = 'approved_by_leader';
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Request not found or not awaiting admin approval');
  END IF;
  
  -- Update the request status
  UPDATE stock_requests 
  SET 
    status = 'rejected',
    rejected_at = NOW(),
    rejected_by = p_admin_id,
    rejection_reason = p_reason,
    updated_at = NOW()
  WHERE id = p_request_id;
  
  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Request rejected'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 7: CREATE VIEW FOR MAIN INVENTORY WITH AVAILABLE STOCK
-- ============================================================================
CREATE OR REPLACE VIEW main_inventory_with_availability AS
SELECT 
  mi.*,
  (mi.stock - COALESCE(mi.allocated_stock, 0)) AS available_stock
FROM main_inventory mi;

-- Grant access
GRANT SELECT ON main_inventory_with_availability TO authenticated;

-- ============================================================================
-- STEP 8: UPDATE EXISTING RECORDS
-- ============================================================================
-- Set allocated_stock to 0 for existing records
UPDATE main_inventory 
SET allocated_stock = 0 
WHERE allocated_stock IS NULL;

-- Set leader_additional_quantity to 0 for existing requests
UPDATE stock_requests 
SET leader_additional_quantity = 0 
WHERE leader_additional_quantity IS NULL;

UPDATE stock_requests 
SET is_combined_request = false 
WHERE is_combined_request IS NULL;

-- ============================================================================
-- DONE
-- ============================================================================
-- New columns added:
--   main_inventory.allocated_stock
--   stock_requests.leader_additional_quantity
--   stock_requests.is_combined_request
--
-- New functions created:
--   get_available_stock(variant_id, company_id)
--   forward_stock_request_with_leader_qty(request_id, leader_id, additional_qty, notes)
--   admin_approve_stock_request(request_id, admin_id, notes)
--   leader_accept_and_distribute_stock(request_id, leader_id)
--   admin_reject_stock_request(request_id, admin_id, reason)
--
-- New view created:
--   main_inventory_with_availability
-- ============================================================================
