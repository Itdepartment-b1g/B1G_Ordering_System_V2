-- Key Account settlement discount approval:
-- KAM / Sales Director / Sales Admin request → Sales Head approves.
-- Sales Head applying their own discount is auto-approved (direct payment insert).

-- ---------------------------------------------------------------------------
-- 1) Pending request table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.key_account_settlement_discount_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  settlement_discount numeric(14,2) NOT NULL,
  settlement_discount_reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  requested_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at timestamp with time zone,
  rejected_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  rejected_at timestamp with time zone,
  rejection_reason text,
  payment_id uuid REFERENCES public.purchase_order_key_account_payments(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT key_account_settlement_discount_requests_status_check CHECK (
    status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])
  ),
  CONSTRAINT key_account_settlement_discount_requests_amount_positive CHECK (
    settlement_discount > 0::numeric
  ),
  CONSTRAINT key_account_settlement_discount_requests_reason_check CHECK (
    length(btrim(settlement_discount_reason)) > 0
  )
);

CREATE INDEX IF NOT EXISTS idx_ka_settlement_discount_req_po
  ON public.key_account_settlement_discount_requests(purchase_order_id);

CREATE INDEX IF NOT EXISTS idx_ka_settlement_discount_req_company_status
  ON public.key_account_settlement_discount_requests(company_id, status);

DROP TRIGGER IF EXISTS update_key_account_settlement_discount_requests_updated_at
  ON public.key_account_settlement_discount_requests;
CREATE TRIGGER update_key_account_settlement_discount_requests_updated_at
  BEFORE UPDATE ON public.key_account_settlement_discount_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.key_account_settlement_discount_requests IS
  'Pending settlement discounts on Key Account POs awaiting Sales Head approval.';

-- ---------------------------------------------------------------------------
-- 2) Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.key_account_user_is_sales_head(
  p_uid uuid DEFAULT auth.uid(),
  p_company_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_uid
      AND p.role = 'sales_head'
      AND (p_company_id IS NULL OR p.company_id = p_company_id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.key_account_user_is_sales_head(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.key_account_po_pending_settlement_discount_sum(
  p_po_id uuid,
  p_exclude_request_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(SUM(r.settlement_discount), 0)::numeric(14,2)
  FROM public.key_account_settlement_discount_requests r
  WHERE r.purchase_order_id = p_po_id
    AND r.status = 'pending'
    AND (p_exclude_request_id IS NULL OR r.id IS DISTINCT FROM p_exclude_request_id);
$$;

GRANT EXECUTE ON FUNCTION public.key_account_po_pending_settlement_discount_sum(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.key_account_user_may_approve_settlement_discount(
  p_request_id uuid,
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
      SELECT public.key_account_user_is_sales_head(p_uid, r.company_id)
      FROM public.key_account_settlement_discount_requests r
      WHERE r.id = p_request_id
    ),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.key_account_user_may_approve_settlement_discount(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) BEFORE INSERT: only Sales Head may apply discount directly; reserve pending
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purchase_order_key_account_payments_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  po RECORD;
  applied_so_far numeric(14,2);
  pending_discount numeric(14,2);
  pending_ok boolean;
  post_wh_ok boolean;
  is_consignment boolean;
  v_amount numeric(14,2);
  v_discount numeric(14,2);
BEGIN
  SELECT
    id,
    company_id,
    company_account_type,
    workflow_status,
    total_amount,
    key_account_payment_status,
    created_by,
    kam_id,
    po_order_kind
  INTO po
  FROM public.purchase_orders
  WHERE id = NEW.purchase_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase order not found';
  END IF;

  IF po.company_account_type IS DISTINCT FROM 'Key Accounts' THEN
    RAISE EXCEPTION 'Payments ledger applies to Key Account purchase orders only';
  END IF;

  IF NEW.company_id IS DISTINCT FROM po.company_id THEN
    RAISE EXCEPTION 'company_id must match purchase order company';
  END IF;

  IF NOT public.key_account_user_may_record_po_payment(po.id, auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed to record payment for this purchase order';
  END IF;

  IF po.key_account_payment_status = 'paid' THEN
    RAISE EXCEPTION 'This purchase order is already fully paid';
  END IF;

  v_amount := COALESCE(NEW.amount, 0);
  v_discount := COALESCE(NEW.settlement_discount, 0);
  NEW.amount := v_amount;
  NEW.settlement_discount := v_discount;

  IF v_discount > 0 THEN
    NEW.settlement_discount_reason := nullif(btrim(COALESCE(NEW.settlement_discount_reason, '')), '');
    IF NEW.settlement_discount_reason IS NULL THEN
      RAISE EXCEPTION 'Settlement discount reason is required';
    END IF;
    -- Only Sales Head may apply settlement discount immediately (auto-approve).
    IF NOT public.key_account_user_is_sales_head(auth.uid(), po.company_id) THEN
      RAISE EXCEPTION
        'Settlement discount requires Sales Head approval. Submit a discount request instead.';
    END IF;
  ELSE
    NEW.settlement_discount_reason := NULL;
  END IF;

  IF v_amount <= 0 AND v_discount <= 0 THEN
    RAISE EXCEPTION 'Enter a payment amount and/or settlement discount';
  END IF;

  SELECT
    COALESCE(SUM(amount), 0) + COALESCE(SUM(settlement_discount), 0)
  INTO applied_so_far
  FROM public.purchase_order_key_account_payments
  WHERE purchase_order_id = NEW.purchase_order_id;

  pending_discount := public.key_account_po_pending_settlement_discount_sum(NEW.purchase_order_id);

  IF applied_so_far + pending_discount + v_amount + v_discount > po.total_amount + 0.0001 THEN
    RAISE EXCEPTION 'Payment + settlement discount exceeds remaining balance';
  END IF;

  pending_ok := po.workflow_status = ANY (
    ARRAY[
      'kam_pending'::text,
      'director_pending'::text,
      'admin_pending'::text,
      'approved'::text
    ]
  );

  post_wh_ok := po.workflow_status = ANY (
    ARRAY[
      'warehouse_reserved'::text,
      'fulfilled'::text,
      'partial_delivered'::text,
      'delivered'::text
    ]
  );

  is_consignment := po.po_order_kind IS NOT DISTINCT FROM 'consignment';

  IF applied_so_far <= 0 THEN
    IF NOT (pending_ok OR (is_consignment AND post_wh_ok)) THEN
      RAISE EXCEPTION
        'Initial payment can only be recorded while the PO is pending internal approval%s',
        CASE WHEN is_consignment THEN ' (or after warehouse for consignment POs)' ELSE '' END;
    END IF;
  END IF;

  NEW.recorded_by := auth.uid();

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.purchase_order_key_account_payments_before_insert() IS
  'Validates KA PO payment inserts; settlement discount direct apply is Sales Head only; pending discount requests reserve balance.';

-- ---------------------------------------------------------------------------
-- 4) Request / approve / reject RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_key_account_settlement_discount(
  p_purchase_order_id uuid,
  p_settlement_discount numeric,
  p_settlement_discount_reason text
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

  SELECT
    COALESCE(SUM(amount), 0) + COALESCE(SUM(settlement_discount), 0)
  INTO applied_so_far
  FROM public.purchase_order_key_account_payments
  WHERE purchase_order_id = po.id;

  pending_discount := public.key_account_po_pending_settlement_discount_sum(po.id);

  IF applied_so_far + pending_discount + v_discount > po.total_amount + 0.0001 THEN
    RETURN json_build_object('success', false, 'error', 'Settlement discount exceeds remaining balance');
  END IF;

  -- Sales Head: auto-approve by inserting the payment row immediately.
  IF public.key_account_user_is_sales_head(auth.uid(), po.company_id) THEN
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
      'payment_id', v_payment_id
    );
  END IF;

  INSERT INTO public.key_account_settlement_discount_requests (
    company_id,
    purchase_order_id,
    settlement_discount,
    settlement_discount_reason,
    status,
    requested_by
  ) VALUES (
    po.company_id,
    po.id,
    v_discount,
    v_reason,
    'pending',
    auth.uid()
  )
  RETURNING id INTO v_request_id;

  RETURN json_build_object(
    'success', true,
    'auto_approved', false,
    'request_id', v_request_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_key_account_settlement_discount(uuid, numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_key_account_settlement_discount(p_request_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_req RECORD;
  po RECORD;
  applied_so_far numeric(14,2);
  pending_other numeric(14,2);
  v_payment_id uuid;
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

  -- Mark approved first so pending reserve is released before payment insert.
  UPDATE public.key_account_settlement_discount_requests
  SET status = 'approved',
      approved_by = auth.uid(),
      approved_at = now()
  WHERE id = p_request_id;

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

  UPDATE public.key_account_settlement_discount_requests
  SET payment_id = v_payment_id
  WHERE id = p_request_id;

  RETURN json_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'purchase_order_id', po.id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_key_account_settlement_discount(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_key_account_settlement_discount(
  p_request_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_req RECORD;
BEGIN
  IF NOT public.key_account_user_may_approve_settlement_discount(p_request_id) THEN
    RETURN json_build_object('success', false, 'error', 'Only Sales Head can reject settlement discounts');
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

  UPDATE public.key_account_settlement_discount_requests
  SET status = 'rejected',
      rejected_by = auth.uid(),
      rejected_at = now(),
      rejection_reason = nullif(btrim(COALESCE(p_reason, '')), '')
  WHERE id = p_request_id;

  RETURN json_build_object(
    'success', true,
    'purchase_order_id', v_req.purchase_order_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_key_account_settlement_discount(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) Grants + RLS
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON public.key_account_settlement_discount_requests TO authenticated;

ALTER TABLE public.key_account_settlement_discount_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "KA settlement discount requests viewable by company roles"
  ON public.key_account_settlement_discount_requests;
CREATE POLICY "KA settlement discount requests viewable by company roles"
  ON public.key_account_settlement_discount_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = key_account_settlement_discount_requests.company_id
        AND p.role = ANY (ARRAY[
          'sales_admin'::text,
          'sales_head'::text,
          'sales_director'::text,
          'key_account_manager'::text,
          'key_account_accounting'::text
        ])
    )
  );

-- Inserts go through SECURITY DEFINER RPC; keep a narrow direct-insert policy for safety.
DROP POLICY IF EXISTS "KA settlement discount requests insert by recorders"
  ON public.key_account_settlement_discount_requests;
CREATE POLICY "KA settlement discount requests insert by recorders"
  ON public.key_account_settlement_discount_requests
  FOR INSERT WITH CHECK (
    requested_by = auth.uid()
    AND public.key_account_user_may_record_po_payment(purchase_order_id, auth.uid())
    AND NOT public.key_account_user_is_sales_head(auth.uid(), company_id)
  );

-- Updates (approve/reject) go through SECURITY DEFINER RPCs; allow Sales Head for direct safety.
DROP POLICY IF EXISTS "KA settlement discount requests no direct update"
  ON public.key_account_settlement_discount_requests;
DROP POLICY IF EXISTS "KA settlement discount requests update by sales head"
  ON public.key_account_settlement_discount_requests;
CREATE POLICY "KA settlement discount requests update by sales head"
  ON public.key_account_settlement_discount_requests
  FOR UPDATE USING (
    public.key_account_user_is_sales_head(auth.uid(), company_id)
  )
  WITH CHECK (
    public.key_account_user_is_sales_head(auth.uid(), company_id)
  );
