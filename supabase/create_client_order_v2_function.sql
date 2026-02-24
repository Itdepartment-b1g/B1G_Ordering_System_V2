-- ============================================================================
-- CREATE CLIENT ORDER V2 FUNCTION
-- ============================================================================
-- This function handles the entire order creation process in a single transaction:
-- 1. Generates a unique order number
-- 2. Inserts the order record
-- 3. Inserts the order items
-- 4. Deducts stock hierarchically:
--    a. Global Stock (main_inventory)
--    b. Agent Stock (agent_inventory)
--    c. Recursive Supervisor Stock (Leaders/Managers)
-- ============================================================================

DROP FUNCTION IF EXISTS create_client_order_v2(UUID, UUID, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, DATE);

CREATE OR REPLACE FUNCTION create_client_order_v2(
  p_agent_id UUID,
  p_client_id UUID,
  p_items JSONB, -- Array of { variant_id, quantity, unit_price, selling_price, dsp_price, rsp_price, total_price }
  p_notes TEXT,
  p_signature_url TEXT,
  p_payment_method TEXT,
  p_payment_proof_url TEXT,
  p_pricing_strategy TEXT,
  p_order_date DATE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_order_number TEXT;
  v_company_id UUID;
  v_client_account_type TEXT;
  v_subtotal DECIMAL(10,2) := 0;
  v_total_amount DECIMAL(10,2) := 0;
  v_item RECORD;
  v_supervisor_id UUID;
BEGIN
  -- 1. Get company_id and account_type
  SELECT company_id, account_type INTO v_company_id, v_client_account_type
  FROM clients WHERE id = p_client_id;

  IF v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Client not found');
  END IF;

  -- 2. Generate Order Number
  SELECT generate_order_number(v_company_id) INTO v_order_number;

  -- 3. Calculate totals from JSON items
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(total_price DECIMAL) LOOP
    v_total_amount := v_total_amount + v_item.total_price;
  END LOOP;
  v_subtotal := v_total_amount; -- Simplification: subtotal = total for now (no tax/discount logic here yet)

  -- 4. Insert Order
  INSERT INTO client_orders (
    company_id, order_number, agent_id, client_id, client_account_type,
    order_date, subtotal, total_amount, status, stage, notes,
    signature_url, payment_method, payment_proof_url, pricing_strategy
  ) VALUES (
    v_company_id, v_order_number, p_agent_id, p_client_id, v_client_account_type,
    p_order_date, v_subtotal, v_total_amount, 'pending', 'finance_pending', p_notes,
    p_signature_url, p_payment_method, p_payment_proof_url, p_pricing_strategy
  ) RETURNING id INTO v_order_id;

  -- 5. Insert Items and Deduct Stock
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
    variant_id UUID, quantity INTEGER, unit_price DECIMAL, 
    selling_price DECIMAL, dsp_price DECIMAL, rsp_price DECIMAL, total_price DECIMAL
  ) LOOP
    
    -- A. Insert Order Item
    INSERT INTO client_order_items (
      company_id, client_order_id, variant_id, quantity, 
      unit_price, selling_price, dsp_price, rsp_price, total_price
    ) VALUES (
      v_company_id, v_order_id, v_item.variant_id, v_item.quantity,
      v_item.unit_price, v_item.selling_price, v_item.dsp_price, v_item.rsp_price, v_item.total_price
    );

    -- B. Deduct Global Stock (main_inventory)
    UPDATE main_inventory
    SET stock = stock - v_item.quantity, updated_at = NOW()
    WHERE variant_id = v_item.variant_id AND company_id = v_company_id;

    -- C. Deduct Agent Stock (agent_inventory)
    UPDATE agent_inventory
    SET stock = stock - v_item.quantity, updated_at = NOW()
    WHERE agent_id = p_agent_id AND variant_id = v_item.variant_id;

    -- D. Deduct Recursive Supervisor Stock
    FOR v_supervisor_id IN (
      WITH RECURSIVE supervisor_chain AS (
        -- Base case: find the direct leader(s) of the agent
        SELECT leader_id
        FROM leader_teams
        WHERE agent_id = p_agent_id
        
        UNION
        
        -- Recursive step: find the leader(s) of the current leaders
        SELECT lt.leader_id
        FROM leader_teams lt
        JOIN supervisor_chain sc ON lt.agent_id = sc.leader_id
      )
      SELECT leader_id FROM supervisor_chain
    ) LOOP
      UPDATE agent_inventory
      SET stock = stock - v_item.quantity, updated_at = NOW()
      WHERE agent_id = v_supervisor_id AND variant_id = v_item.variant_id;
    END LOOP;

  END LOOP;

  RETURN json_build_object(
    'success', true, 
    'message', 'Order created and stock deducted', 
    'data', json_build_object('id', v_order_id, 'order_number', v_order_number)
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION create_client_order_v2(UUID, UUID, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, DATE) TO authenticated;
