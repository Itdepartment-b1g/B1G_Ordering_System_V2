-- Key Account rebates: apply approved credit to source PO balance
-- - Adds CREDIT_MEMO as a valid Key Account payment method
-- - Expands who may record payments (sales_admin / sales_head)
-- - Updates rebate approval RPC to apply credit to PO remaining balance and only
--   store leftover as client credit wallet.

-- ---------------------------------------------------------------------------
-- 1) Allow CREDIT_MEMO payment method
-- ---------------------------------------------------------------------------
ALTER TABLE public.purchase_order_key_account_payments
  DROP CONSTRAINT IF EXISTS purchase_order_key_account_payments_method_check;

ALTER TABLE public.purchase_order_key_account_payments
  ADD CONSTRAINT purchase_order_key_account_payments_method_check CHECK (
    payment_method = ANY (
      ARRAY[
        'GCASH'::text,
        'BANK_TRANSFER'::text,
        'CASH'::text,
        'CHEQUE'::text,
        'CREDIT_MEMO'::text
      ]
    )
  );

-- ---------------------------------------------------------------------------
-- 2) Expand permissions: sales_admin and sales_head can record PO payments
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.key_account_user_may_record_po_payment(
  p_po_id uuid,
  p_uid uuid DEFAULT auth.uid()
)
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
          WHEN po.company_account_type IS DISTINCT FROM 'Key Accounts'::text THEN false
          WHEN po.created_by IS NOT DISTINCT FROM p_uid THEN true
          WHEN EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = p_uid
              AND p.company_id = po.company_id
              AND p.role = ANY (ARRAY['sales_admin'::text, 'sales_head'::text])
          ) THEN true
          WHEN EXISTS (
            SELECT 1
            FROM public.profiles p
            INNER JOIN public.kam_director_assignments a ON a.director_id = p.id
            WHERE p.id = p_uid
              AND p.role = 'sales_director'
              AND a.kam_id = po.kam_id
          ) THEN true
          ELSE false
        END
      FROM public.purchase_orders po
      WHERE po.id = p_po_id
    ),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.key_account_user_may_record_po_payment(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Apply rebate credit to source PO remaining balance
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
      -- after-insert trigger will refresh key_account_payment_status
    END IF;

    -- Any excess credit is stored as client credit wallet (usable for future policy/UI).
    IF v_leftover_credit > 0 AND v_rebate.key_account_client_id IS NOT NULL THEN
      INSERT INTO public.key_account_client_credits (
        company_id, key_account_client_id, rebate_id, amount, notes
      ) VALUES (
        v_rebate.company_id, v_rebate.key_account_client_id, p_rebate_id, v_leftover_credit,
        'Rebate ' || v_rebate.rebate_number || ' (leftover after applying to PO ' || v_po.po_number || ')'
      );
    END IF;
  END IF;

  IF v_rebate.resolution_type IN ('replacement', 'mixed') THEN
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
      v_po.kam_id, 'Key Accounts', 'warehouse_reserved',
      CURRENT_DATE, CURRENT_DATE,
      'Rebate replacement for ' || v_rebate.rebate_number || ' (source PO ' || v_po.po_number || ')',
      v_rebate.replacement_total, 0, 0, 0, 0,
      'pending', auth.uid(), 'rebate_fulfillment', p_rebate_id,
      'full', 'paid'
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

    v_reserve := public._reserve_rebate_fulfillment_po(v_fulfill_po_id);
    IF NOT COALESCE((v_reserve->>'success')::boolean, false) THEN
      RAISE EXCEPTION 'Failed to reserve replacement stock: %', COALESCE(v_reserve->>'error', 'unknown');
    END IF;

    UPDATE public.key_account_po_rebates
    SET fulfillment_purchase_order_id = v_fulfill_po_id
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
    'fulfillment_po_number', v_po_number
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_and_execute_key_account_rebate(uuid) TO authenticated;

