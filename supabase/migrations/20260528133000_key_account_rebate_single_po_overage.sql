-- Key Account rebates: single-PO overage model (replaces separate top-up PO)
-- - If replacement_total > disputed_total, the rebate fulfillment PO becomes payable for the difference.
-- - Hold payable rebate fulfillment POs until fully paid, then auto-release to warehouse_reserved.

-- ---------------------------------------------------------------------------
-- 1) Auto-release helper: paid rebate_fulfillment and rebate_topup (legacy)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.maybe_release_key_account_rebate_po_after_payment(p_po_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  po record;
BEGIN
  SELECT
    id,
    company_account_type,
    po_order_kind,
    workflow_status,
    status,
    key_account_payment_status,
    total_amount
  INTO po
  FROM public.purchase_orders
  WHERE id = p_po_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF po.company_account_type IS DISTINCT FROM 'Key Accounts' THEN
    RETURN;
  END IF;

  -- Only rebate-related POs (topup is legacy; keep support).
  IF po.po_order_kind IS DISTINCT FROM 'rebate_fulfillment'
     AND po.po_order_kind IS DISTINCT FROM 'rebate_topup' THEN
    RETURN;
  END IF;

  -- For payable rebate_fulfillment/topup, release only when paid.
  IF COALESCE(po.total_amount, 0) > 0 AND po.key_account_payment_status IS DISTINCT FROM 'paid' THEN
    RETURN;
  END IF;

  -- If already released or beyond, do nothing.
  IF po.workflow_status = ANY (ARRAY['warehouse_reserved'::text, 'fulfilled'::text, 'delivered'::text]) THEN
    RETURN;
  END IF;

  UPDATE public.purchase_orders
  SET workflow_status = 'warehouse_reserved',
      status = 'pending',
      updated_at = now()
  WHERE id = p_po_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.maybe_release_key_account_rebate_po_after_payment(uuid) TO authenticated;

-- Patch refresh function to call the new release hook after recalculating status.
CREATE OR REPLACE FUNCTION public.refresh_purchase_order_key_account_payment_status(p_po_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total numeric(14,2);
  v_paid numeric(14,2);
  v_status text;
BEGIN
  SELECT po.total_amount INTO v_total
  FROM public.purchase_orders po
  WHERE po.id = p_po_id
    AND po.company_account_type = 'Key Accounts';

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(p.amount), 0) INTO v_paid
  FROM public.purchase_order_key_account_payments p
  WHERE p.purchase_order_id = p_po_id;

  IF v_paid <= 0 THEN
    v_status := 'unpaid';
  ELSIF v_paid + 0.0001 >= v_total THEN
    v_status := 'paid';
  ELSE
    v_status := 'partial';
  END IF;

  UPDATE public.purchase_orders
  SET key_account_payment_status = v_status,
      updated_at = now()
  WHERE id = p_po_id
    AND company_account_type = 'Key Accounts';

  -- Auto-release paid rebate-related POs (single-PO overage model).
  PERFORM public.maybe_release_key_account_rebate_po_after_payment(p_po_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- 2) Rebate approval: stop creating a separate top-up PO
--    If overage > 0, create ONE rebate_fulfillment PO with total_amount = overage and unpaid.
-- ---------------------------------------------------------------------------
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

    -- If there is an overage, this same PO becomes payable for the difference and is held until paid.
    IF v_overage > 0 THEN
      v_fulfill_workflow := 'approved';
      v_fulfill_payment_status := 'unpaid';
    END IF;

    v_po_number := public.generate_po_number();

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

    -- Reserve immediately (keeps stock dedicated). Warehouse still can't see it until released.
    v_reserve := public._reserve_rebate_fulfillment_po(v_fulfill_po_id);
    IF NOT COALESCE((v_reserve->>'success')::boolean, false) THEN
      RAISE EXCEPTION 'Failed to reserve replacement stock: %', COALESCE(v_reserve->>'error', 'unknown');
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

