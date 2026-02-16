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
    
    -- Calculate orders count
    SELECT COUNT(*)
    INTO v_orders_count
    FROM client_orders
    WHERE id = ANY(p_order_ids)
    AND company_id = v_company_id;

    -- Calculate total_revenue: ONLY cash + cheque portions (for both FULL and SPLIT payments)
    -- For FULL payments: count total_amount only if payment_method is CASH or CHEQUE
    -- For SPLIT payments: sum only cash + cheque amounts from payment_splits
    SELECT COALESCE(SUM(
      CASE 
        -- FULL payment: only count if CASH or CHEQUE
        WHEN payment_mode IS NULL OR payment_mode = 'FULL' THEN
          CASE 
            WHEN payment_method IN ('CASH', 'CHEQUE') THEN total_amount
            ELSE 0
          END
        -- SPLIT payment: sum cash + cheque portions from payment_splits
        WHEN payment_mode = 'SPLIT' THEN
          COALESCE((
            SELECT SUM((split->>'amount')::DECIMAL(10,2))
            FROM jsonb_array_elements(payment_splits) AS split
            WHERE (split->>'method') IN ('CASH', 'CHEQUE')
          ), 0)
        ELSE 0
      END
    ), 0)
    INTO v_total_revenue
    FROM client_orders
    WHERE id = ANY(p_order_ids)
    AND company_id = v_company_id;

    -- ========================================================================
    -- PROCESS CASH ORDERS (including cash portions from split payments)
    -- ========================================================================
    -- Get orders with cash payment (FULL CASH or SPLIT with cash portion)
    WITH cash_order_amounts AS (
      SELECT 
        id,
        CASE 
          -- FULL payment: use total_amount if CASH
          WHEN (payment_mode IS NULL OR payment_mode = 'FULL') AND payment_method = 'CASH' THEN total_amount
          -- SPLIT payment: sum cash portions
          WHEN payment_mode = 'SPLIT' THEN
            COALESCE((
              SELECT SUM((split->>'amount')::DECIMAL(10,2))
              FROM jsonb_array_elements(payment_splits) AS split
              WHERE (split->>'method') = 'CASH'
            ), 0)
          ELSE 0
        END AS cash_amount
      FROM client_orders
      WHERE id = ANY(p_order_ids)
      AND company_id = v_company_id
      AND deposit_id IS NULL
    )
    SELECT 
      ARRAY_AGG(id),
      COALESCE(SUM(cash_amount), 0)
    INTO 
      v_cash_orders,
      v_cash_total
    FROM cash_order_amounts
    WHERE cash_amount > 0;

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
    -- PROCESS CHEQUE ORDERS (including cheque portions from split payments)
    -- ========================================================================
    -- Get orders with cheque payment (FULL CHEQUE or SPLIT with cheque portion)
    WITH cheque_order_amounts AS (
      SELECT 
        id,
        CASE 
          -- FULL payment: use total_amount if CHEQUE
          WHEN (payment_mode IS NULL OR payment_mode = 'FULL') AND payment_method = 'CHEQUE' THEN total_amount
          -- SPLIT payment: sum cheque portions
          WHEN payment_mode = 'SPLIT' THEN
            COALESCE((
              SELECT SUM((split->>'amount')::DECIMAL(10,2))
              FROM jsonb_array_elements(payment_splits) AS split
              WHERE (split->>'method') = 'CHEQUE'
            ), 0)
          ELSE 0
        END AS cheque_amount
      FROM client_orders
      WHERE id = ANY(p_order_ids)
      AND company_id = v_company_id
      AND deposit_id IS NULL
    )
    SELECT 
      ARRAY_AGG(id),
      COALESCE(SUM(cheque_amount), 0)
    INTO 
      v_cheque_orders,
      v_cheque_total
    FROM cheque_order_amounts
    WHERE cheque_amount > 0;

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
