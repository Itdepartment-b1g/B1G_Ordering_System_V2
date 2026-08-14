-- Dedicated Key Account PO numbers: PO-{COMPANY_INITIALS}-KA-YYYYMM-####
-- e.g. "B1G Key Account" → PO-BKA-KA-202608-0001
--      "B1G Key Account V2" → PO-BKAV-KA-202608-0001
-- Per-company sequence does not reset each month (e.g. ...-0023 -> next month ...-0024).
-- Leaves generate_po_number() / po_number_seq unchanged.

DROP FUNCTION IF EXISTS public.generate_key_account_po_number();
DROP SEQUENCE IF EXISTS public.key_account_po_number_seq;

CREATE TABLE IF NOT EXISTS public.key_account_po_number_counters (
  company_id uuid PRIMARY KEY,
  last_value integer NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.key_account_po_number_counters IS
  'Per-company sequence for Key Account PO numbers. Does not reset by month.';

CREATE OR REPLACE FUNCTION public.generate_key_account_po_number(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company_name text;
  v_initials text;
  date_part text := to_char(CURRENT_DATE, 'YYYYMM');
  seq_val integer;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company id is required';
  END IF;

  SELECT c.company_name INTO v_company_name
  FROM public.companies c
  WHERE c.id = p_company_id;

  IF v_company_name IS NULL OR btrim(v_company_name) = '' THEN
    RAISE EXCEPTION 'Company name is missing';
  END IF;

  -- Same helper as order numbers: "B1G Key Account" → BKA, "B1G Key Account V2" → BKAV
  v_initials := upper(btrim(public.extract_company_initials(v_company_name)));
  IF v_initials IS NULL OR v_initials = '' THEN
    RAISE EXCEPTION 'Failed to derive company initials';
  END IF;

  INSERT INTO public.key_account_po_number_counters (company_id, last_value)
  VALUES (p_company_id, 1)
  ON CONFLICT (company_id)
  DO UPDATE SET last_value = public.key_account_po_number_counters.last_value + 1
  RETURNING last_value INTO seq_val;

  RETURN 'PO-' || v_initials || '-KA-' || date_part || '-' || lpad(seq_val::text, 4, '0');
END;
$$;

COMMENT ON FUNCTION public.generate_key_account_po_number(uuid) IS
  'Key Account PO numbers in PO-{COMPANY_INITIALS}-KA-YYYYMM-#### format. Sequence continues across months per company.';

GRANT EXECUTE ON FUNCTION public.generate_key_account_po_number(uuid) TO authenticated;

-- Rebate replacement POs are Key Account POs; use the same numbering.
CREATE OR REPLACE FUNCTION public.approve_and_execute_key_account_rebate(p_rebate_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rebate RECORD;
  v_po RECORD;
  v_po_number text;
  v_fulfill_po_id uuid;
  v_rep RECORD;
  v_reserve json;

  v_paid_so_far numeric(14,2) := 0;
  v_remaining numeric(14,2) := 0;
  v_apply_credit numeric(14,2) := 0;
  v_leftover_credit numeric(14,2) := 0;

  v_overage numeric(14,2) := 0;
  v_fulfill_workflow text := 'warehouse_reserved';
  v_fulfill_payment_status text := 'paid';
BEGIN
  IF NOT public.key_account_user_may_approve_rebate(p_rebate_id) THEN
    RETURN json_build_object('success', false, 'error', 'Not allowed to approve this rebate');
  END IF;

  SELECT * INTO v_rebate FROM public.key_account_po_rebates WHERE id = p_rebate_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Rebate not found');
  END IF;
  IF v_rebate.status IS DISTINCT FROM 'submitted' THEN
    RETURN json_build_object('success', false, 'error', 'Rebate is not awaiting approval');
  END IF;

  SELECT * INTO v_po FROM public.purchase_orders WHERE id = v_rebate.purchase_order_id;

  UPDATE public.key_account_po_rebates
  SET status = 'approved', approved_by = auth.uid(), approved_at = NOW()
  WHERE id = p_rebate_id;

  -- Apply credit to the source PO remaining balance first.
  IF COALESCE(v_rebate.credit_amount, 0) > 0 THEN
    SELECT COALESCE(SUM(p.amount), 0) INTO v_paid_so_far
    FROM public.purchase_order_key_account_payments p
    WHERE p.purchase_order_id = v_po.id;

    v_remaining := GREATEST(0, COALESCE(v_po.total_amount, 0) - COALESCE(v_paid_so_far, 0));
    v_apply_credit := LEAST(ROUND(v_rebate.credit_amount, 2), ROUND(v_remaining, 2));
    v_leftover_credit := GREATEST(0, ROUND(v_rebate.credit_amount, 2) - v_apply_credit);

    IF v_apply_credit > 0 THEN
      INSERT INTO public.purchase_order_key_account_payments (
        purchase_order_id,
        company_id,
        amount,
        payment_method,
        bank_type,
        proof_storage_path,
        recorded_by
      ) VALUES (
        v_po.id,
        v_po.company_id,
        v_apply_credit,
        'CREDIT_MEMO',
        NULL,
        NULL,
        auth.uid()
      );
    END IF;

    IF v_leftover_credit > 0 AND v_rebate.key_account_client_id IS NOT NULL THEN
      INSERT INTO public.key_account_client_credits (
        company_id, key_account_client_id, rebate_id, amount, notes
      ) VALUES (
        v_rebate.company_id, v_rebate.key_account_client_id, p_rebate_id, v_leftover_credit,
        'Rebate ' || v_rebate.rebate_number || ' (leftover after applying to PO ' || v_po.po_number || ')'
      );
    END IF;
  END IF;

  -- Replacement shipment PO (single PO model).
  IF v_rebate.resolution_type IN ('replacement', 'mixed') THEN
    v_overage := GREATEST(
      0,
      ROUND(COALESCE(v_rebate.replacement_total, 0) - COALESCE(v_rebate.disputed_total, 0), 2)
    );

    -- If there is an overage, this PO is payable; keep it internal until paid.
    IF v_overage > 0 THEN
      v_fulfill_workflow := 'approved';
      v_fulfill_payment_status := 'unpaid';
    END IF;

    v_po_number := public.generate_key_account_po_number(v_po.company_id);

    INSERT INTO public.purchase_orders (
      company_id, po_number, supplier_id, fulfillment_type,
      warehouse_company_id, warehouse_location_id,
      key_account_client_id, key_account_shop_id, key_account_address_id,
      kam_id, company_account_type, workflow_status,
      order_date, expected_delivery_date, notes,
      subtotal, tax_rate, tax_amount, discount, total_amount,
      status, created_by, po_order_kind, source_rebate_id,
      key_account_payment_mode, key_account_payment_status
    ) VALUES (
      v_po.company_id, v_po_number, NULL, 'warehouse_transfer',
      v_po.warehouse_company_id, v_po.warehouse_location_id,
      v_po.key_account_client_id, v_po.key_account_shop_id, v_po.key_account_address_id,
      v_po.kam_id, 'Key Accounts', v_fulfill_workflow,
      CURRENT_DATE, CURRENT_DATE,
      'Rebate replacement for ' || v_rebate.rebate_number || ' (source PO ' || v_po.po_number || ')',
      v_rebate.replacement_total, 0, 0, 0, v_overage,
      'pending', auth.uid(), 'rebate_fulfillment', p_rebate_id,
      'full', v_fulfill_payment_status
    )
    RETURNING id INTO v_fulfill_po_id;

    FOR v_rep IN
      SELECT * FROM public.key_account_po_rebate_replacements WHERE rebate_id = p_rebate_id
    LOOP
      INSERT INTO public.purchase_order_items (
        company_id, purchase_order_id, variant_id, warehouse_location_id,
        quantity, unit_price, total_price
      ) VALUES (
        v_rebate.company_id, v_fulfill_po_id, v_rep.variant_id, v_rep.warehouse_location_id,
        v_rep.quantity, v_rep.unit_price, v_rep.total_price
      );
    END LOOP;

    -- Only reserve immediately when there is NO overage (free replacement).
    -- When overage > 0, the PO will be released to warehouse after payment, and warehouse will reserve as normal.
    IF v_overage <= 0 THEN
      v_reserve := public._reserve_rebate_fulfillment_po(v_fulfill_po_id);
      IF NOT COALESCE((v_reserve->>'success')::boolean, false) THEN
        RAISE EXCEPTION 'Failed to reserve replacement stock: %', COALESCE(v_reserve->>'error', 'unknown');
      END IF;
    END IF;

    UPDATE public.key_account_po_rebates
    SET fulfillment_purchase_order_id = v_fulfill_po_id,
        top_up_purchase_order_id = NULL
    WHERE id = p_rebate_id;
  END IF;

  UPDATE public.key_account_po_rebates
  SET status = 'executed', executed_at = NOW()
  WHERE id = p_rebate_id;

  RETURN json_build_object(
    'success', true,
    'rebate_number', v_rebate.rebate_number,
    'applied_to_po', v_apply_credit,
    'leftover_credit', v_leftover_credit,
    'fulfillment_po_id', v_fulfill_po_id,
    'fulfillment_po_number', v_po_number,
    'overage_amount', v_overage
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_and_execute_key_account_rebate(uuid) TO authenticated;
