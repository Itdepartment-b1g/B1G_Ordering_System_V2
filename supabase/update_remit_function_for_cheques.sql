-- Update remit_inventory_to_leader to handle CHEQUE orders and set deposit_type
-- This ensures separate deposit records are created for Cash vs Cheque remittances

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
  
  -- Cash vars
  v_cash_orders UUID[];
  v_cash_total DECIMAL(10,2) := 0;
  v_cash_deposit_id UUID;
  
  -- Cheque vars
  v_cheque_orders UUID[];
  v_cheque_total DECIMAL(10,2) := 0;
  v_cheque_deposit_id UUID;

  v_reference_number TEXT;
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

  -- 3. UNSOLD INVENTORY - Skiped (Agent keeps stock)
  v_items_remitted := 0;
  v_total_units_remitted := 0;

  -- 4. PROCESS SOLD INVENTORY (Orders)
  IF p_order_ids IS NOT NULL AND array_length(p_order_ids, 1) > 0 THEN
    
    -- Calculate generic totals
    SELECT 
      COUNT(*), 
      COALESCE(SUM(total_amount), 0)
    INTO 
      v_orders_count,
      v_total_revenue
    FROM client_orders
    WHERE id = ANY(p_order_ids)
    AND company_id = v_company_id;

    -- ========================================================================
    -- PROCESS CASH ORDERS
    -- ========================================================================
    SELECT 
      ARRAY_AGG(id),
      COALESCE(SUM(total_amount), 0)
    INTO 
      v_cash_orders,
      v_cash_total
    FROM client_orders
    WHERE id = ANY(p_order_ids)
    AND company_id = v_company_id
    AND payment_method = 'CASH'
    AND deposit_id IS NULL;

    -- If there are cash orders, create a CASH deposit
    IF v_cash_orders IS NOT NULL AND array_length(v_cash_orders, 1) > 0 AND v_cash_total > 0 THEN
      -- Generate reference number: REMIT-CASH-{date}-{agent_id first 8 chars}
      v_reference_number := 'REMIT-CASH-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || SUBSTRING(p_agent_id::text, 1, 8);

      INSERT INTO cash_deposits (
        company_id,
        agent_id,
        performed_by,
        amount,
        bank_account,
        reference_number,
        deposit_date,
        status,
        deposit_type -- Set type explicitly
      ) VALUES (
        v_company_id,
        p_agent_id,
        p_performed_by,
        v_cash_total,
        'Cash Remittance',
        v_reference_number,
        CURRENT_DATE,
        'pending_verification',
        'CASH'
      ) RETURNING id INTO v_cash_deposit_id;

      -- Link cash orders to the deposit
      UPDATE client_orders
      SET 
        deposit_id = v_cash_deposit_id,
        updated_at = NOW()
      WHERE id = ANY(v_cash_orders)
      AND company_id = v_company_id;

      -- Financial Transaction for Cash
      INSERT INTO financial_transactions (
        company_id, transaction_date, transaction_type, category, amount, reference_type, reference_id, agent_id, description, status, created_by
      ) VALUES (
        v_company_id, CURRENT_DATE, 'revenue', 'cash_deposit', v_cash_total, 'cash_deposit', v_cash_deposit_id, p_agent_id,
        format('Cash Remittance: %s - %s orders', v_reference_number, array_length(v_cash_orders, 1)),
        'pending', p_performed_by
      );
    END IF;

    -- ========================================================================
    -- PROCESS CHEQUE ORDERS
    -- ========================================================================
    SELECT 
      ARRAY_AGG(id),
      COALESCE(SUM(total_amount), 0)
    INTO 
      v_cheque_orders,
      v_cheque_total
    FROM client_orders
    WHERE id = ANY(p_order_ids)
    AND company_id = v_company_id
    AND payment_method = 'CHEQUE' -- Handle Cheque orders
    AND deposit_id IS NULL;

    -- If there are cheque orders, create a CHEQUE deposit
    IF v_cheque_orders IS NOT NULL AND array_length(v_cheque_orders, 1) > 0 AND v_cheque_total > 0 THEN
      -- Generate reference number: REMIT-CHQ-{date}-{agent_id first 8 chars}
      v_reference_number := 'REMIT-CHQ-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || SUBSTRING(p_agent_id::text, 1, 8);

      INSERT INTO cash_deposits (
        company_id,
        agent_id,
        performed_by,
        amount,
        bank_account,
        reference_number,
        deposit_date,
        status,
        deposit_type -- Set type explicitly
      ) VALUES (
        v_company_id,
        p_agent_id,
        p_performed_by,
        v_cheque_total,
        'Cheque Remittance', -- Placeholder
        v_reference_number,
        CURRENT_DATE,
        'pending_verification',
        'CHEQUE'
      ) RETURNING id INTO v_cheque_deposit_id;

      -- Link cheque orders to the deposit
      UPDATE client_orders
      SET 
        deposit_id = v_cheque_deposit_id,
        updated_at = NOW()
      WHERE id = ANY(v_cheque_orders)
      AND company_id = v_company_id;

      -- Financial Transaction for Cheque
      INSERT INTO financial_transactions (
        company_id, transaction_date, transaction_type, category, amount, reference_type, reference_id, agent_id, description, status, created_by
      ) VALUES (
        v_company_id, CURRENT_DATE, 'revenue', 'cash_deposit', v_cheque_total, 'cash_deposit', v_cheque_deposit_id, p_agent_id,
        format('Cheque Remittance: %s - %s orders', v_reference_number, array_length(v_cheque_orders, 1)),
        'pending', p_performed_by
      );
    END IF;


    -- Mark all orders as remitted
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
    'message', 'Remittance processed successfully.',
    'remittance_id', v_remittance_id,
    'cash_orders_count', COALESCE(array_length(v_cash_orders, 1), 0),
    'cash_amount', v_cash_total,
    'cheque_orders_count', COALESCE(array_length(v_cheque_orders, 1), 0),
    'cheque_amount', v_cheque_total,
    'total_orders_count', v_orders_count,
    'total_revenue', v_total_revenue
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;
