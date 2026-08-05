-- Attach approved settlement discounts to the related cash payment row when present.
-- Discount-only approvals still create a ledger row, but recorded_by stays the requester.
-- Reject / leave-pending: cash stays; discount never reduces the PO balance.

-- ---------------------------------------------------------------------------
-- 1) Link request → cash payment that accompanied the discount
-- ---------------------------------------------------------------------------
ALTER TABLE public.key_account_settlement_discount_requests
  ADD COLUMN IF NOT EXISTS source_payment_id uuid
    REFERENCES public.purchase_order_key_account_payments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ka_settlement_discount_req_source_payment
  ON public.key_account_settlement_discount_requests(source_payment_id)
  WHERE source_payment_id IS NOT NULL;

COMMENT ON COLUMN public.key_account_settlement_discount_requests.source_payment_id IS
  'Optional cash payment row submitted with this discount; on approve, discount is applied to this row.';

-- Refresh PO payment status when an existing payment row is updated (attach discount).
DROP TRIGGER IF EXISTS trg_po_ka_payments_after_update ON public.purchase_order_key_account_payments;
CREATE TRIGGER trg_po_ka_payments_after_update
  AFTER UPDATE OF amount, settlement_discount ON public.purchase_order_key_account_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.purchase_order_key_account_payments_after_mutate();

-- ---------------------------------------------------------------------------
-- 2) Request RPC — optional source_payment_id
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.request_key_account_settlement_discount(uuid, numeric, text);
DROP FUNCTION IF EXISTS public.request_key_account_settlement_discount(uuid, numeric, text, uuid);

CREATE OR REPLACE FUNCTION public.request_key_account_settlement_discount(
  p_purchase_order_id uuid,
  p_settlement_discount numeric,
  p_settlement_discount_reason text,
  p_source_payment_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  po RECORD;
  v_discount numeric(14,2);
  v_reason text;
  applied_so_far numeric(14,2);
  pending_discount numeric(14,2);
  v_request_id uuid;
  v_payment_id uuid;
  v_source RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  v_discount := ROUND(COALESCE(p_settlement_discount, 0), 2);
  v_reason := nullif(btrim(COALESCE(p_settlement_discount_reason, '')), '');

  IF v_discount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Settlement discount must be greater than zero');
  END IF;
  IF v_reason IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Settlement discount reason is required');
  END IF;

  SELECT
    id,
    company_id,
    company_account_type,
    total_amount,
    key_account_payment_status
  INTO po
  FROM public.purchase_orders
  WHERE id = p_purchase_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Purchase order not found');
  END IF;

  IF po.company_account_type IS DISTINCT FROM 'Key Accounts' THEN
    RETURN json_build_object('success', false, 'error', 'Key Account purchase orders only');
  END IF;

  IF NOT public.key_account_user_may_record_po_payment(po.id, auth.uid()) THEN
    RETURN json_build_object('success', false, 'error', 'Not allowed to request discount for this purchase order');
  END IF;

  IF po.key_account_payment_status = 'paid' THEN
    RETURN json_build_object('success', false, 'error', 'This purchase order is already fully paid');
  END IF;

  IF p_source_payment_id IS NOT NULL THEN
    SELECT
      id,
      purchase_order_id,
      company_id,
      amount,
      settlement_discount,
      recorded_by
    INTO v_source
    FROM public.purchase_order_key_account_payments
    WHERE id = p_source_payment_id;

    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'Source payment not found');
    END IF;
    IF v_source.purchase_order_id IS DISTINCT FROM po.id
       OR v_source.company_id IS DISTINCT FROM po.company_id THEN
      RETURN json_build_object('success', false, 'error', 'Source payment does not belong to this purchase order');
    END IF;
    IF COALESCE(v_source.amount, 0) <= 0 THEN
      RETURN json_build_object('success', false, 'error', 'Source payment must include cash');
    END IF;
    IF COALESCE(v_source.settlement_discount, 0) > 0 THEN
      RETURN json_build_object('success', false, 'error', 'Source payment already has a settlement discount');
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.key_account_settlement_discount_requests r
      WHERE r.source_payment_id = p_source_payment_id
        AND r.status = 'pending'
    ) THEN
      RETURN json_build_object('success', false, 'error', 'A discount is already pending for this payment');
    END IF;
  END IF;

  SELECT
    COALESCE(SUM(amount), 0) + COALESCE(SUM(settlement_discount), 0)
  INTO applied_so_far
  FROM public.purchase_order_key_account_payments
  WHERE purchase_order_id = po.id;

  pending_discount := public.key_account_po_pending_settlement_discount_sum(po.id);

  IF applied_so_far + pending_discount + v_discount > po.total_amount + 0.0001 THEN
    RETURN json_build_object('success', false, 'error', 'Settlement discount exceeds remaining balance');
  END IF;

  -- Sales Head: auto-approve.
  -- Prefer attaching to the cash payment when provided; otherwise discount-only row.
  IF public.key_account_user_is_sales_head(auth.uid(), po.company_id) THEN
    IF p_source_payment_id IS NOT NULL THEN
      UPDATE public.purchase_order_key_account_payments
      SET settlement_discount = v_discount,
          settlement_discount_reason = v_reason
      WHERE id = p_source_payment_id
      RETURNING id INTO v_payment_id;

      RETURN json_build_object(
        'success', true,
        'auto_approved', true,
        'payment_id', v_payment_id,
        'attached_to_payment', true
      );
    END IF;

    INSERT INTO public.purchase_order_key_account_payments (
      purchase_order_id,
      company_id,
      amount,
      settlement_discount,
      settlement_discount_reason,
      payment_method
    ) VALUES (
      po.id,
      po.company_id,
      0,
      v_discount,
      v_reason,
      'CASH'
    )
    RETURNING id INTO v_payment_id;

    RETURN json_build_object(
      'success', true,
      'auto_approved', true,
      'payment_id', v_payment_id,
      'attached_to_payment', false
    );
  END IF;

  INSERT INTO public.key_account_settlement_discount_requests (
    company_id,
    purchase_order_id,
    settlement_discount,
    settlement_discount_reason,
    status,
    requested_by,
    source_payment_id
  ) VALUES (
    po.company_id,
    po.id,
    v_discount,
    v_reason,
    'pending',
    auth.uid(),
    p_source_payment_id
  )
  RETURNING id INTO v_request_id;

  RETURN json_build_object(
    'success', true,
    'auto_approved', false,
    'request_id', v_request_id,
    'source_payment_id', p_source_payment_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_key_account_settlement_discount(uuid, numeric, text, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Approve — attach to source cash payment when possible
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_key_account_settlement_discount(p_request_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_req RECORD;
  po RECORD;
  v_source RECORD;
  applied_so_far numeric(14,2);
  pending_other numeric(14,2);
  v_payment_id uuid;
  v_attached boolean := false;
BEGIN
  IF NOT public.key_account_user_may_approve_settlement_discount(p_request_id) THEN
    RETURN json_build_object('success', false, 'error', 'Only Sales Head can approve settlement discounts');
  END IF;

  SELECT * INTO v_req
  FROM public.key_account_settlement_discount_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Discount request not found');
  END IF;

  IF v_req.status IS DISTINCT FROM 'pending' THEN
    RETURN json_build_object('success', false, 'error', 'Discount request is not awaiting approval');
  END IF;

  SELECT
    id,
    company_id,
    company_account_type,
    total_amount,
    key_account_payment_status
  INTO po
  FROM public.purchase_orders
  WHERE id = v_req.purchase_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Purchase order not found');
  END IF;

  IF po.key_account_payment_status = 'paid' THEN
    RETURN json_build_object('success', false, 'error', 'This purchase order is already fully paid');
  END IF;

  SELECT
    COALESCE(SUM(amount), 0) + COALESCE(SUM(settlement_discount), 0)
  INTO applied_so_far
  FROM public.purchase_order_key_account_payments
  WHERE purchase_order_id = po.id;

  pending_other := public.key_account_po_pending_settlement_discount_sum(po.id, v_req.id);

  IF applied_so_far + pending_other + v_req.settlement_discount > po.total_amount + 0.0001 THEN
    RETURN json_build_object('success', false, 'error', 'Settlement discount exceeds remaining balance');
  END IF;

  -- Mark approved first so pending reserve is released.
  UPDATE public.key_account_settlement_discount_requests
  SET status = 'approved',
      approved_by = auth.uid(),
      approved_at = now()
  WHERE id = p_request_id;

  IF v_req.source_payment_id IS NOT NULL THEN
    SELECT
      id,
      purchase_order_id,
      company_id,
      amount,
      settlement_discount
    INTO v_source
    FROM public.purchase_order_key_account_payments
    WHERE id = v_req.source_payment_id
    FOR UPDATE;

    IF FOUND
       AND v_source.purchase_order_id IS NOT DISTINCT FROM po.id
       AND v_source.company_id IS NOT DISTINCT FROM po.company_id
       AND COALESCE(v_source.amount, 0) > 0
       AND COALESCE(v_source.settlement_discount, 0) <= 0 THEN
      UPDATE public.purchase_order_key_account_payments
      SET settlement_discount = v_req.settlement_discount,
          settlement_discount_reason = v_req.settlement_discount_reason
      WHERE id = v_source.id
      RETURNING id INTO v_payment_id;

      v_attached := true;
    END IF;
  END IF;

  -- Discount-only (or source payment unavailable): new ledger row, attributed to requester.
  IF NOT v_attached THEN
    INSERT INTO public.purchase_order_key_account_payments (
      purchase_order_id,
      company_id,
      amount,
      settlement_discount,
      settlement_discount_reason,
      payment_method
    ) VALUES (
      po.id,
      po.company_id,
      0,
      v_req.settlement_discount,
      v_req.settlement_discount_reason,
      'CASH'
    )
    RETURNING id INTO v_payment_id;

    -- before_insert sets recorded_by to approver; overwrite with the original requester.
    UPDATE public.purchase_order_key_account_payments
    SET recorded_by = v_req.requested_by
    WHERE id = v_payment_id;
  END IF;

  UPDATE public.key_account_settlement_discount_requests
  SET payment_id = v_payment_id
  WHERE id = p_request_id;

  RETURN json_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'purchase_order_id', po.id,
    'attached_to_payment', v_attached
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_key_account_settlement_discount(uuid) TO authenticated;
