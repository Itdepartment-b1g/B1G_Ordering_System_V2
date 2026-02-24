-- REPAIR SCRIPT: Fix orphan Cheque orders that were remitted but have no deposit
-- This is safe to run multiple times, it only processes unlinked orders.

DO $$
DECLARE
  v_rec RECORD;
  v_deposit_id UUID;
  v_ref_number TEXT;
  v_count INTEGER := 0;
BEGIN
  -- Log start
  RAISE NOTICE 'Starting Cheque Deposit Repair...';

  -- Loop through each agent/company/date group of ORPHANED cheque orders
  -- Orphaned means: remitted = TRUE, payment_method = 'CHEQUE', deposit_id IS NULL
  FOR v_rec IN 
    SELECT 
      company_id, 
      agent_id, 
      DATE(updated_at) as remit_date, 
      SUM(total_amount) as total_amount,
      ARRAY_AGG(id) as order_ids,
      COUNT(*) as order_count
    FROM client_orders
    WHERE 
      payment_method = 'CHEQUE' 
      AND remitted = TRUE 
      AND deposit_id IS NULL
    GROUP BY company_id, agent_id, DATE(updated_at)
  LOOP
    
    -- Generate new reference number
    v_ref_number := 'REMIT-CHQ-REPAIR-' || TO_CHAR(v_rec.remit_date, 'YYYYMMDD') || '-' || SUBSTRING(v_rec.agent_id::text, 1, 8);
    
    -- Create the missing deposit record
    INSERT INTO cash_deposits (
        company_id,
        agent_id,
        performed_by, -- System fix, use agent ID as fallback
        amount,
        bank_account,
        reference_number,
        deposit_date,
        status,
        deposit_type
    ) VALUES (
        v_rec.company_id,
        v_rec.agent_id,
        v_rec.agent_id,
        v_rec.total_amount,
        'Cheque Remittance (Repaired)',
        v_ref_number,
        v_rec.remit_date,
        'pending_verification', -- Needs to be pending so leader can see it
        'CHEQUE'
    ) RETURNING id INTO v_deposit_id;

    -- Update the orders to link to this new deposit
    UPDATE client_orders
    SET deposit_id = v_deposit_id
    WHERE id = ANY(v_rec.order_ids);

    v_count := v_count + v_rec.order_count;
    
    RAISE NOTICE 'Repaired group: Agent %, Amount %, Orders %', v_rec.agent_id, v_rec.total_amount, v_rec.order_count;

  END LOOP;

  RAISE NOTICE 'Repair complete. Processed % orders.', v_count;
END $$;
