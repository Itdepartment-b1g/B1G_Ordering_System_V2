-- Fix: payable rebate replacement POs should not be visible to warehouse until paid.
-- - Remove 'approved' from Key Account warehouse visibility gate.
-- - For single-PO overage model: skip reservation/approve_for_fulfillment until after paid.

-- ---------------------------------------------------------------------------
-- 1) Warehouse visibility gate: Key Accounts only visible at warehouse_reserved or later
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.key_account_transfer_po_visible_to_warehouse(p_po_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (
      SELECT
        CASE
          WHEN po.company_account_type IS DISTINCT FROM 'Key Accounts'::text THEN true
          WHEN po.workflow_status = ANY (
            ARRAY[
              'warehouse_reserved'::text,
              'fulfilled'::text,
              'delivered'::text
            ]
          ) THEN true
          ELSE false
        END
      FROM public.purchase_orders po
      WHERE po.id = p_po_id
    ),
    false
  );
$$;

COMMENT ON FUNCTION public.key_account_transfer_po_visible_to_warehouse(uuid) IS
  'Key Account transfer POs are hidden from warehouse until workflow_status is warehouse_reserved or later (fulfilled/delivered).';

GRANT EXECUTE ON FUNCTION public.key_account_transfer_po_visible_to_warehouse(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) Rebate approval: if overage > 0, do NOT reserve immediately.
--    Let the PO stay internal (workflow_status=approved) until paid,
--    then it is released to warehouse_reserved via payment-status refresh hook.
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

    -- If there is an overage, this PO is payable; keep it internal until paid.
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

