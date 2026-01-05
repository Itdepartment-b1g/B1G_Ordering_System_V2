-- ============================================================================
-- REMIT INVENTORY TO LEADER FUNCTION
-- ============================================================================
-- This function handles the end-of-day remittance process:
-- 1. UNSOLD INVENTORY: Transfers ALL remaining stock from Agent -> Leader
-- 2. SOLD INVENTORY (Orders): Marks orders as 'remitted' for reporting (stock was already deducted at sale)
-- 3. LOGGING: Creates a comprehensive audit log in remittances_log
-- ============================================================================

DROP FUNCTION IF EXISTS remit_inventory_to_leader(UUID, UUID, UUID, UUID[], TEXT, TEXT);

CREATE OR REPLACE FUNCTION remit_inventory_to_leader(
  p_agent_id UUID,
  p_leader_id UUID,
  p_performed_by UUID,
  p_order_ids UUID[],
  p_signature_url TEXT DEFAULT NULL,
  p_signature_path TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_leader_company_id UUID;
  v_items_remitted INTEGER := 0;
  v_total_units_remitted INTEGER := 0;
  v_orders_count INTEGER := 0;
  v_total_revenue DECIMAL(10,2) := 0;
  v_remittance_id UUID;
  v_item RECORD;
  v_leader_inventory_id UUID;
BEGIN
  -- 1. Validate Agent and Get Company
  SELECT company_id INTO v_company_id
  FROM profiles
  WHERE id = p_agent_id;

  IF v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Agent not found');
  END IF;

  -- 2. Validate Leader
  SELECT company_id INTO v_leader_company_id
  FROM profiles
  WHERE id = p_leader_id;

  IF v_leader_company_id IS NULL OR v_leader_company_id != v_company_id THEN
    RETURN json_build_object('success', false, 'message', 'Invalid leader or company mismatch');
  END IF;

  -- 3. PROCESS UNSOLD INVENTORY (Transfer Agent -> Leader)
  -- Loop through all items currently in agent's inventory with stock > 0
  FOR v_item IN 
    SELECT * FROM agent_inventory 
    WHERE agent_id = p_agent_id 
    AND company_id = v_company_id 
    AND stock > 0
  LOOP
    -- A. Update Leader's Inventory (Add Stock)
    SELECT id INTO v_leader_inventory_id
    FROM agent_inventory
    WHERE agent_id = p_leader_id
    AND variant_id = v_item.variant_id
    AND company_id = v_company_id;

    IF v_leader_inventory_id IS NOT NULL THEN
      -- Update existing leader inventory
      UPDATE agent_inventory
      SET stock = stock + v_item.stock,
          updated_at = NOW()
      WHERE id = v_leader_inventory_id;
    ELSE
      -- Insert new leader inventory record (copying pricing from agent's record or defaults)
      INSERT INTO agent_inventory (
        company_id, agent_id, variant_id, stock, 
        allocated_price, dsp_price, rsp_price, status
      ) VALUES (
        v_company_id, p_leader_id, v_item.variant_id, v_item.stock,
        v_item.allocated_price, v_item.dsp_price, v_item.rsp_price, 'available'
      );
    END IF;

    -- B. Log the Transaction
    INSERT INTO inventory_transactions (
      company_id, variant_id, transaction_type, quantity,
      from_location, to_location, performed_by, notes
    ) VALUES (
      v_company_id, v_item.variant_id, 'return', v_item.stock,
      'agent_inventory', 'leader_inventory', p_performed_by,
      'Remittance: Unsold inventory returned to leader'
    );

    -- C. Clear Agent's Inventory
    UPDATE agent_inventory
    SET stock = 0, updated_at = NOW()
    WHERE id = v_item.id;

    -- D. Track Stats
    v_items_remitted := v_items_remitted + 1; -- Count of distinct variants
    v_total_units_remitted := v_total_units_remitted + v_item.stock; -- Count of total units

  END LOOP;

  -- 4. PROCESS SOLD INVENTORY (Orders)
  -- Calculate revenue and mark as remitted
  IF p_order_ids IS NOT NULL AND array_length(p_order_ids, 1) > 0 THEN
    
    -- Calculate totals
    SELECT 
      COUNT(*), 
      COALESCE(SUM(total_amount), 0)
    INTO 
      v_orders_count,
      v_total_revenue
    FROM client_orders
    WHERE id = ANY(p_order_ids)
    AND company_id = v_company_id;

    -- Mark orders as remitted
    UPDATE client_orders
    SET remitted = TRUE, updated_at = NOW()
    WHERE id = ANY(p_order_ids)
    AND company_id = v_company_id;
    
  END IF;

  -- 5. CREATE REMITTANCE LOG
  INSERT INTO remittances_log (
    company_id, agent_id, leader_id, remittance_date,
    items_remitted, total_units, orders_count, total_revenue,
    order_ids, signature_url, signature_path
  ) VALUES (
    v_company_id, p_agent_id, p_leader_id, CURRENT_DATE,
    v_items_remitted, v_total_units_remitted, v_orders_count, v_total_revenue,
    p_order_ids, p_signature_url, p_signature_path
  ) RETURNING id INTO v_remittance_id;

  RETURN json_build_object(
    'success', true, 
    'message', 'Remittance processed successfully',
    'remittance_id', v_remittance_id,
    'units_returned', v_total_units_remitted,
    'revenue_recorded', v_total_revenue
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION remit_inventory_to_leader(UUID, UUID, UUID, UUID[], TEXT, TEXT) TO authenticated;
