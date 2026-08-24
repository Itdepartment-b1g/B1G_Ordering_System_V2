-- ============================================================================
-- One cash_deposits row per cash/cheque order
-- ============================================================================
-- Remittance stays one event (one remittances_log / one signature).
-- Cash deposit records become selectable one-by-one on Cash Deposits.
--
-- Also splits existing unrecorded remittance groups so pending orders that
-- already share a deposit_id can be deposited independently.
-- Already-recorded / verified deposits are left unchanged.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.client_order_deposit_portions(
  p_payment_mode TEXT,
  p_payment_method TEXT,
  p_payment_splits JSONB,
  p_total_amount NUMERIC
)
RETURNS TABLE (
  cash_portion NUMERIC,
  cheque_portion NUMERIC,
  remitted_amount NUMERIC,
  deposit_type TEXT
)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH splits AS (
    SELECT COALESCE(p_payment_splits, '[]'::jsonb) AS raw
  ),
  split_sums AS (
    SELECT
      COALESCE(SUM((s->>'amount')::NUMERIC) FILTER (WHERE s->>'method' = 'CASH'), 0) AS cash_portion,
      COALESCE(SUM((s->>'amount')::NUMERIC) FILTER (WHERE s->>'method' = 'CHEQUE'), 0) AS cheque_portion
    FROM splits
    LEFT JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(splits.raw) = 'array' THEN splits.raw
        ELSE '[]'::jsonb
      END
    ) AS s ON TRUE
  ),
  portions AS (
    SELECT
      CASE
        WHEN COALESCE(p_payment_mode, 'FULL') = 'SPLIT' THEN split_sums.cash_portion
        WHEN p_payment_method = 'CASH' THEN COALESCE(p_total_amount, 0)
        ELSE 0
      END AS cash_portion,
      CASE
        WHEN COALESCE(p_payment_mode, 'FULL') = 'SPLIT' THEN split_sums.cheque_portion
        WHEN p_payment_method = 'CHEQUE' THEN COALESCE(p_total_amount, 0)
        ELSE 0
      END AS cheque_portion
    FROM split_sums
  )
  SELECT
    p.cash_portion,
    p.cheque_portion,
    p.cash_portion + p.cheque_portion AS remitted_amount,
    CASE
      WHEN p.cheque_portion > 0 AND p.cash_portion = 0 THEN 'CHEQUE'
      ELSE 'CASH'
    END AS deposit_type
  FROM portions p;
$$;

REVOKE ALL ON FUNCTION public.client_order_deposit_portions(TEXT, TEXT, JSONB, NUMERIC) FROM PUBLIC;

COMMENT ON FUNCTION public.client_order_deposit_portions(TEXT, TEXT, JSONB, NUMERIC) IS
  'Cash/cheque portions of an order, matching Cash Deposits remittedAmount logic.';

CREATE OR REPLACE FUNCTION public.remit_inventory_to_leader(
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
  v_order RECORD;
  v_portions RECORD;
  v_deposit_id UUID;
  v_reference_number TEXT;
  v_bank_account TEXT;
  v_cash_orders_count INTEGER := 0;
  v_cash_total DECIMAL(10,2) := 0;
  v_cheque_orders_count INTEGER := 0;
  v_cheque_total DECIMAL(10,2) := 0;
  v_bank_orders_count INTEGER := 0;
  v_bank_total DECIMAL(10,2) := 0;
  v_note_item JSONB;
  v_note_order_id UUID;
  v_note_text TEXT;
BEGIN
  SELECT company_id INTO v_company_id
  FROM profiles
  WHERE id = p_agent_id;

  IF v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Agent not found');
  END IF;

  SELECT company_id INTO v_leader_company_id
  FROM profiles
  WHERE id = p_leader_id;

  IF v_leader_company_id IS NULL OR v_leader_company_id != v_company_id THEN
    RETURN json_build_object('success', false, 'message', 'Invalid leader or company mismatch');
  END IF;

  v_items_remitted := 0;
  v_total_units_remitted := 0;

  IF p_order_ids IS NOT NULL AND array_length(p_order_ids, 1) > 0 THEN
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

    -- One cash_deposits row per cash/cheque order so leaders can deposit independently.
    FOR v_order IN
      SELECT
        id,
        payment_method,
        payment_mode,
        payment_splits,
        total_amount
      FROM client_orders
      WHERE id = ANY(p_order_ids)
        AND company_id = v_company_id
        AND agent_id = p_agent_id
        AND deposit_id IS NULL
      ORDER BY created_at, order_number
    LOOP
      SELECT *
      INTO v_portions
      FROM public.client_order_deposit_portions(
        v_order.payment_mode,
        v_order.payment_method,
        v_order.payment_splits,
        v_order.total_amount
      );

      IF COALESCE(v_portions.remitted_amount, 0) <= 0 THEN
        IF v_order.payment_method IN ('BANK_TRANSFER', 'GCASH')
           OR COALESCE(v_order.payment_mode, 'FULL') = 'SPLIT' THEN
          v_bank_orders_count := v_bank_orders_count + 1;
          v_bank_total := v_bank_total + COALESCE(v_order.total_amount, 0);
        END IF;
        CONTINUE;
      END IF;

      IF v_portions.deposit_type = 'CHEQUE' THEN
        v_bank_account := 'Cheque Remittance';
        v_reference_number := 'REMIT-CHQ-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || SUBSTRING(REPLACE(v_order.id::text, '-', ''), 1, 12);
        v_cheque_orders_count := v_cheque_orders_count + 1;
        v_cheque_total := v_cheque_total + v_portions.remitted_amount;
      ELSE
        v_bank_account := 'Cash Remittance';
        v_reference_number := 'REMIT-CASH-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || SUBSTRING(REPLACE(v_order.id::text, '-', ''), 1, 12);
        v_cash_orders_count := v_cash_orders_count + 1;
        v_cash_total := v_cash_total + v_portions.remitted_amount;
      END IF;

      INSERT INTO cash_deposits (
        company_id,
        agent_id,
        performed_by,
        amount,
        bank_account,
        reference_number,
        deposit_date,
        status,
        deposit_type
      ) VALUES (
        v_company_id,
        p_agent_id,
        p_performed_by,
        v_portions.remitted_amount,
        v_bank_account,
        v_reference_number,
        CURRENT_DATE,
        'pending_verification',
        v_portions.deposit_type
      ) RETURNING id INTO v_deposit_id;

      UPDATE client_orders
      SET
        deposit_id = v_deposit_id,
        updated_at = NOW()
      WHERE id = v_order.id
        AND company_id = v_company_id
        AND agent_id = p_agent_id;

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
        v_portions.remitted_amount,
        'cash_deposit',
        v_deposit_id,
        p_agent_id,
        format('Remittance deposit: %s', v_reference_number),
        'pending',
        p_performed_by
      );
    END LOOP;

    IF p_bank_order_notes IS NOT NULL
       AND jsonb_typeof(p_bank_order_notes) = 'array'
       AND jsonb_array_length(p_bank_order_notes) > 0 THEN
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

    UPDATE client_orders
    SET remitted = TRUE, updated_at = NOW()
    WHERE id = ANY(p_order_ids)
      AND company_id = v_company_id
      AND agent_id = p_agent_id;
  END IF;

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
    'cash_orders_count', v_cash_orders_count,
    'cash_amount', v_cash_total,
    'cheque_orders_count', v_cheque_orders_count,
    'cheque_amount', v_cheque_total,
    'bank_orders_count', v_bank_orders_count,
    'bank_amount', v_bank_total,
    'total_orders_count', v_orders_count,
    'total_revenue', v_total_revenue,
    'cash_deposits_created', (v_cash_orders_count > 0),
    'cheque_deposits_created', (v_cheque_orders_count > 0)
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.remit_inventory_to_leader(UUID, UUID, UUID, UUID[], TEXT, TEXT, JSONB) TO authenticated;

COMMENT ON FUNCTION public.remit_inventory_to_leader(UUID, UUID, UUID, UUID[], TEXT, TEXT, JSONB) IS
  'End-of-day remittance. Creates one cash_deposits row per cash/cheque order; remittances_log remains one event.';

-- Split pending unrecorded remittance groups into one deposit per order.
DO $$
DECLARE
  v_deposit RECORD;
  v_order RECORD;
  v_portions RECORD;
  v_keep_order_id UUID;
  v_keep_amount NUMERIC;
  v_keep_type TEXT;
  v_new_deposit_id UUID;
  v_reference_number TEXT;
  v_bank_account TEXT;
BEGIN
  FOR v_deposit IN
    SELECT d.*
    FROM cash_deposits d
    WHERE d.status = 'pending_verification'
      AND (d.deposit_slip_url IS NULL OR btrim(d.deposit_slip_url) = '')
      AND (
        d.bank_account ILIKE '%Cash Remittance%'
        OR d.bank_account ILIKE '%Cheque Remittance%'
      )
      AND (
        SELECT COUNT(*) FROM client_orders o WHERE o.deposit_id = d.id
      ) > 1
  LOOP
    v_keep_order_id := NULL;
    v_keep_amount := NULL;
    v_keep_type := NULL;

    FOR v_order IN
      SELECT
        id,
        payment_method,
        payment_mode,
        payment_splits,
        total_amount
      FROM client_orders
      WHERE deposit_id = v_deposit.id
      ORDER BY created_at, order_number
    LOOP
      SELECT *
      INTO v_portions
      FROM public.client_order_deposit_portions(
        v_order.payment_mode,
        v_order.payment_method,
        v_order.payment_splits,
        v_order.total_amount
      );

      IF COALESCE(v_portions.remitted_amount, 0) <= 0 THEN
        UPDATE client_orders
        SET deposit_id = NULL, updated_at = NOW()
        WHERE id = v_order.id;
        CONTINUE;
      END IF;

      IF v_keep_order_id IS NULL THEN
        v_keep_order_id := v_order.id;
        v_keep_amount := v_portions.remitted_amount;
        v_keep_type := v_portions.deposit_type;
        CONTINUE;
      END IF;

      IF v_portions.deposit_type = 'CHEQUE' THEN
        v_bank_account := 'Cheque Remittance';
        v_reference_number := 'REMIT-CHQ-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || SUBSTRING(REPLACE(v_order.id::text, '-', ''), 1, 12);
      ELSE
        v_bank_account := 'Cash Remittance';
        v_reference_number := 'REMIT-CASH-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || SUBSTRING(REPLACE(v_order.id::text, '-', ''), 1, 12);
      END IF;

      INSERT INTO cash_deposits (
        company_id,
        agent_id,
        performed_by,
        amount,
        bank_account,
        reference_number,
        deposit_date,
        status,
        deposit_type
      ) VALUES (
        v_deposit.company_id,
        v_deposit.agent_id,
        v_deposit.performed_by,
        v_portions.remitted_amount,
        v_bank_account,
        v_reference_number,
        v_deposit.deposit_date,
        'pending_verification',
        v_portions.deposit_type
      ) RETURNING id INTO v_new_deposit_id;

      UPDATE client_orders
      SET deposit_id = v_new_deposit_id, updated_at = NOW()
      WHERE id = v_order.id;

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
        v_deposit.company_id,
        COALESCE(v_deposit.deposit_date, CURRENT_DATE),
        'revenue',
        'cash_deposit',
        v_portions.remitted_amount,
        'cash_deposit',
        v_new_deposit_id,
        v_deposit.agent_id,
        format('Split remittance deposit: %s', v_reference_number),
        'pending',
        v_deposit.performed_by
      );
    END LOOP;

    IF v_keep_order_id IS NOT NULL THEN
      UPDATE cash_deposits
      SET
        amount = v_keep_amount,
        deposit_type = v_keep_type,
        updated_at = NOW()
      WHERE id = v_deposit.id;

      UPDATE financial_transactions
      SET
        amount = v_keep_amount,
        updated_at = NOW()
      WHERE reference_type = 'cash_deposit'
        AND reference_id = v_deposit.id
        AND status = 'pending';
    END IF;
  END LOOP;
END $$;
