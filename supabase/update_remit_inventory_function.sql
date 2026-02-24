-- ============================================================================
-- UPDATE REMIT INVENTORY TO LEADER FUNCTION
-- ============================================================================
-- Enhanced to handle bank transfer order notes/remarks
-- Now accepts:
--   - p_order_ids: Array of ALL order IDs (cash + bank transfer)
--   - p_bank_order_notes: JSONB array of {order_id, notes} for bank transfers
-- 
-- Behavior:
--   - CASH orders: Create cash deposit + mark remitted
--   - BANK TRANSFER/GCASH orders: Just mark remitted + add notes (no cash deposit)
-- ============================================================================

DROP FUNCTION IF EXISTS remit_inventory_to_leader(UUID, UUID, UUID, UUID[], TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS remit_inventory_to_leader(UUID, UUID, UUID, UUID[], TEXT, TEXT);

CREATE OR REPLACE FUNCTION remit_inventory_to_leader(
  p_agent_id UUID,
  p_leader_id UUID,
  p_performed_by UUID,
  p_order_ids UUID[],
  p_signature_url TEXT DEFAULT NULL,
  p_signature_path TEXT DEFAULT NULL,
  p_bank_order_notes JSONB DEFAULT '[]'::jsonb
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
  v_cash_orders UUID[];
  v_cash_total DECIMAL(10,2) := 0;
  v_bank_orders_count INTEGER := 0;
  v_bank_total DECIMAL(10,2) := 0;
  v_deposit_id UUID;
  v_reference_number TEXT;
  v_note_item JSONB;
  v_note_order_id UUID;
  v_note_text TEXT;
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

  -- 3. UNSOLD INVENTORY - NO LONGER TRANSFERRED
  -- NEW BEHAVIOR: Agents keep their unsold inventory for the next day
  -- Only CASH order proceeds are remitted to the leader
  -- This section is intentionally left empty as inventory stays with agent
  v_items_remitted := 0;
  v_total_units_remitted := 0;

  -- 4. PROCESS SOLD INVENTORY (Orders)
  -- Calculate revenue and mark as remitted
  -- Also check for cash orders and create cash deposits
  IF p_order_ids IS NOT NULL AND array_length(p_order_ids, 1) > 0 THEN
    
    -- Calculate totals for ALL orders (only this agent's orders)
    SELECT 
      COUNT(*), 
      COALESCE(SUM(total_amount), 0)
    INTO 
      v_orders_count,
      v_total_revenue
    FROM client_orders
    WHERE id = ANY(p_order_ids)
    AND company_id = v_company_id
    AND agent_id = p_agent_id;

    -- Get CASH orders for cash deposit creation (only this agent's orders)
    SELECT 
      ARRAY_AGG(id),
      COALESCE(SUM(total_amount), 0)
    INTO 
      v_cash_orders,
      v_cash_total
    FROM client_orders
    WHERE id = ANY(p_order_ids)
    AND company_id = v_company_id
    AND agent_id = p_agent_id
    AND payment_method = 'CASH'
    AND deposit_id IS NULL;

    -- If there are cash orders, create a cash deposit
    IF v_cash_orders IS NOT NULL AND array_length(v_cash_orders, 1) > 0 AND v_cash_total > 0 THEN
      -- Generate reference number: REMIT-{date}-{agent_id first 8 chars}
      v_reference_number := 'REMIT-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || SUBSTRING(p_agent_id::text, 1, 8);

      -- Create cash deposit record
      -- IMPORTANT: Status is set to 'pending_verification' because the leader
      -- receives physical cash during remittance but hasn't deposited it yet.
      -- The leader must verify the deposit after actually depositing the cash.
      INSERT INTO cash_deposits (
        company_id,
        agent_id,
        performed_by,
        amount,
        bank_account,
        reference_number,
        deposit_date,
        status
      ) VALUES (
        v_company_id,
        p_agent_id,
        p_performed_by,
        v_cash_total,
        'Cash Remittance', -- Default bank account for remittance
        v_reference_number,
        CURRENT_DATE,
        'pending_verification' -- MUST be pending - leader receives cash but hasn't deposited yet
      ) RETURNING id INTO v_deposit_id;

      -- Link cash orders to the deposit (safeguard: only this agent's orders)
      UPDATE client_orders
      SET 
        deposit_id = v_deposit_id,
        updated_at = NOW()
      WHERE id = ANY(v_cash_orders)
      AND company_id = v_company_id
      AND agent_id = p_agent_id;

      -- Create financial transaction for the cash deposit
      INSERT INTO financial_transactions (
        company_id,
        transaction_date,
        transaction_type,
        category,
        amount,
        reference_type,
        reference_id,
        agent_id,
        description,
        status,
        created_by
      ) VALUES (
        v_company_id,
        CURRENT_DATE,
        'revenue',
        'cash_deposit',
        v_cash_total,
        'cash_deposit',
        v_deposit_id,
        p_agent_id,
        format('Cash Deposit from Remittance: %s - %s orders', v_reference_number, array_length(v_cash_orders, 1)),
        'pending', -- Pending until leader verifies
        p_performed_by
      );
    END IF;

    -- Get bank transfer order statistics (for reporting; only this agent's orders)
    SELECT 
      COUNT(*),
      COALESCE(SUM(total_amount), 0)
    INTO 
      v_bank_orders_count,
      v_bank_total
    FROM client_orders
    WHERE id = ANY(p_order_ids)
    AND company_id = v_company_id
    AND agent_id = p_agent_id
    AND payment_method IN ('BANK_TRANSFER', 'GCASH');

    -- Process bank order notes (only this agent's orders)
    IF p_bank_order_notes IS NOT NULL AND jsonb_array_length(p_bank_order_notes) > 0 THEN
      FOR v_note_item IN SELECT * FROM jsonb_array_elements(p_bank_order_notes)
      LOOP
        v_note_order_id := (v_note_item->>'order_id')::UUID;
        v_note_text := v_note_item->>'notes';
        
        UPDATE client_orders
        SET 
          agent_remittance_notes = v_note_text,
          updated_at = NOW()
        WHERE id = v_note_order_id
        AND company_id = v_company_id
        AND agent_id = p_agent_id
        AND id = ANY(p_order_ids);
      END LOOP;
    END IF;

    -- Mark all orders as remitted (both cash and bank transfer; only this agent's orders)
    UPDATE client_orders
    SET remitted = TRUE, updated_at = NOW()
    WHERE id = ANY(p_order_ids)
    AND company_id = v_company_id
    AND agent_id = p_agent_id;
    
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
    'message', 'Remittance processed successfully. Your unsold inventory carries over to tomorrow.',
    'remittance_id', v_remittance_id,
    'cash_orders_count', COALESCE(array_length(v_cash_orders, 1), 0),
    'cash_amount', v_cash_total,
    'bank_orders_count', v_bank_orders_count,
    'bank_amount', v_bank_total,
    'total_orders_count', v_orders_count,
    'total_revenue', v_total_revenue
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION remit_inventory_to_leader(UUID, UUID, UUID, UUID[], TEXT, TEXT, JSONB) TO authenticated;

