-- ============================================================================
-- BLOCK FINANCE FROM REJECTING ORDERS AWAITING REMITTANCE OR DEPOSIT SLIP
-- ============================================================================
-- For CASH/CHEQUE orders, finance cannot reject when:
-- 1. Awaiting remittance: order has no deposit_id (agent hasn't remitted to leader yet)
-- 2. Awaiting deposit slip: deposit exists but has placeholder bank (Cash/Cheque Remittance)
--    or no deposit_slip_url (leader hasn't recorded the actual deposit yet)
-- ============================================================================

DROP FUNCTION IF EXISTS reject_client_order(UUID, UUID, TEXT) CASCADE;

CREATE OR REPLACE FUNCTION reject_client_order(
  p_order_id UUID,
  p_approver_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_deposit RECORD;
  v_has_cash_or_cheque BOOLEAN := FALSE;
BEGIN
  -- 1. Get order details
  SELECT id, payment_method, payment_mode, payment_splits, deposit_id
  INTO v_order
  FROM client_orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Order not found');
  END IF;

  -- 2. Check if order has CASH or CHEQUE component
  IF v_order.payment_mode = 'SPLIT' AND v_order.payment_splits IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_order.payment_splits) AS s
      WHERE (s->>'method') IN ('CASH', 'CHEQUE')
    ) INTO v_has_cash_or_cheque;
  ELSIF v_order.payment_method IN ('CASH', 'CHEQUE') THEN
    v_has_cash_or_cheque := TRUE;
  END IF;

  -- 3. For CASH/CHEQUE orders: block rejection if awaiting remittance or deposit slip
  IF v_has_cash_or_cheque THEN
    -- Awaiting remittance: no deposit_id yet
    IF v_order.deposit_id IS NULL THEN
      RETURN json_build_object(
        'success', false,
        'message', 'Cannot reject: Order is awaiting remittance from agent to team leader.'
      );
    END IF;

    -- Awaiting deposit slip: deposit has placeholder bank or no slip
    SELECT bank_account, deposit_slip_url INTO v_deposit
    FROM cash_deposits
    WHERE id = v_order.deposit_id;

    IF FOUND THEN
      IF v_deposit.bank_account IS NULL OR
         v_deposit.bank_account LIKE 'Cash Remittance%' OR
         v_deposit.bank_account LIKE 'Cheque Remittance%' OR
         TRIM(COALESCE(v_deposit.bank_account, '')) = '' OR
         v_deposit.deposit_slip_url IS NULL THEN
        RETURN json_build_object(
          'success', false,
          'message', 'Cannot reject: Order is awaiting deposit slip from team leader.'
        );
      END IF;
    END IF;
  END IF;

  -- 4. Proceed with rejection
  UPDATE client_orders
  SET 
    status = 'rejected',
    stage = 'admin_rejected',
    notes = COALESCE(notes, '') || E'\nRejection Reason: ' || COALESCE(p_reason, 'No reason provided'),
    approved_by = p_approver_id,
    approved_at = NOW(),
    updated_at = NOW()
  WHERE id = p_order_id;

  RETURN json_build_object(
    'success', true, 
    'message', 'Order rejected successfully'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION reject_client_order(UUID, UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION reject_client_order(UUID, UUID, TEXT) IS
  'Rejects a client order. For CASH/CHEQUE orders, blocks rejection when awaiting remittance or awaiting deposit slip.';
