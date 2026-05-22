-- Key Account PO: payment terms, full/split mode, payment ledger, proof storage.
-- Payment status on purchase_orders is maintained by trigger (SECURITY DEFINER).

-- ---------------------------------------------------------------------------
-- 1) Header columns on purchase_orders (Key Account orders only; nullable for others)
-- ---------------------------------------------------------------------------
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS key_account_payment_terms text,
  ADD COLUMN IF NOT EXISTS key_account_payment_mode text,
  ADD COLUMN IF NOT EXISTS key_account_payment_status text DEFAULT 'unpaid';

ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_key_account_payment_mode_check;
ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_key_account_payment_mode_check
  CHECK (key_account_payment_mode IS NULL OR key_account_payment_mode = ANY (ARRAY['full'::text, 'split'::text]));

ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_key_account_payment_status_check;
ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_key_account_payment_status_check
  CHECK (
    key_account_payment_status IS NULL
    OR key_account_payment_status = ANY (ARRAY['unpaid'::text, 'partial'::text, 'paid'::text])
  );

COMMENT ON COLUMN public.purchase_orders.key_account_payment_terms IS
  'Payment terms agreed for this Key Account PO (may differ from key_account_clients.payment_terms).';
COMMENT ON COLUMN public.purchase_orders.key_account_payment_mode IS
  'Key Account: full (expect one payment for full total) or split (multiple installments).';
COMMENT ON COLUMN public.purchase_orders.key_account_payment_status IS
  'Key Account: unpaid | partial | paid; updated when payment rows change.';

-- ---------------------------------------------------------------------------
-- 2) Payment ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchase_order_key_account_payments (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL,
  payment_method text NOT NULL,
  bank_type text,
  proof_storage_path text,
  recorded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT purchase_order_key_account_payments_amount_positive CHECK (amount > 0::numeric),
  CONSTRAINT purchase_order_key_account_payments_method_check CHECK (
    payment_method = ANY (ARRAY['GCASH'::text, 'BANK_TRANSFER'::text, 'CASH'::text, 'CHEQUE'::text])
  ),
  CONSTRAINT purchase_order_key_account_payments_bank_type_check CHECK (
    bank_type IS NULL
    OR bank_type = ANY (ARRAY['Unionbank'::text, 'BPI'::text, 'PBCOM'::text])
  )
);

CREATE INDEX IF NOT EXISTS idx_po_ka_payments_po
  ON public.purchase_order_key_account_payments(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_po_ka_payments_company
  ON public.purchase_order_key_account_payments(company_id);

COMMENT ON TABLE public.purchase_order_key_account_payments IS
  'Installment / payment records for Key Account purchase orders (proof optional; path in private bucket).';

-- ---------------------------------------------------------------------------
-- 3) Helpers: who may record payments; refresh PO payment status
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.key_account_user_may_record_po_payment(p_po_id uuid, p_uid uuid DEFAULT auth.uid())
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

COMMENT ON FUNCTION public.key_account_user_may_record_po_payment(uuid, uuid) IS
  'True if the user may insert a Key Account PO payment row: PO creator or sales director assigned to po.kam_id.';

GRANT EXECUTE ON FUNCTION public.key_account_user_may_record_po_payment(uuid, uuid) TO authenticated;

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
END;
$$;

COMMENT ON FUNCTION public.refresh_purchase_order_key_account_payment_status(uuid) IS
  'Recomputes key_account_payment_status from sum(payments) vs total_amount (Key Account POs only).';

-- ---------------------------------------------------------------------------
-- 4) BEFORE INSERT: business rules (actor + workflow phase + cap)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purchase_order_key_account_payments_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  po RECORD;
  paid_so_far numeric(14,2);
  pending_ok boolean;
  post_wh_ok boolean;
BEGIN
  SELECT
    id,
    company_id,
    company_account_type,
    workflow_status,
    total_amount,
    key_account_payment_status,
    created_by,
    kam_id
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

  SELECT COALESCE(SUM(amount), 0) INTO paid_so_far
  FROM public.purchase_order_key_account_payments
  WHERE purchase_order_id = NEW.purchase_order_id;

  IF paid_so_far + NEW.amount > po.total_amount + 0.0001 THEN
    RAISE EXCEPTION 'Payment amount exceeds remaining balance';
  END IF;

  IF paid_so_far <= 0 THEN
    IF NOT (
      po.workflow_status = ANY (
        ARRAY[
          'kam_pending'::text,
          'director_pending'::text,
          'admin_pending'::text,
          'approved'::text
        ]
      )
    ) THEN
      RAISE EXCEPTION 'Initial payment can only be recorded while the PO is pending internal approval';
    END IF;
  ELSE
    IF NOT (
      po.workflow_status = ANY (
        ARRAY[
          'warehouse_reserved'::text,
          'fulfilled'::text,
          'delivered'::text
        ]
      )
    ) THEN
      RAISE EXCEPTION 'Additional payments are only allowed after warehouse reserved, fulfilled, or delivered';
    END IF;
  END IF;

  NEW.recorded_by := auth.uid();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_po_ka_payments_before_insert ON public.purchase_order_key_account_payments;
CREATE TRIGGER trg_po_ka_payments_before_insert
  BEFORE INSERT ON public.purchase_order_key_account_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.purchase_order_key_account_payments_before_insert();

CREATE OR REPLACE FUNCTION public.purchase_order_key_account_payments_after_mutate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_po uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_po := OLD.purchase_order_id;
  ELSE
    v_po := NEW.purchase_order_id;
  END IF;
  PERFORM public.refresh_purchase_order_key_account_payment_status(v_po);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_po_ka_payments_after_insert ON public.purchase_order_key_account_payments;
CREATE TRIGGER trg_po_ka_payments_after_insert
  AFTER INSERT ON public.purchase_order_key_account_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.purchase_order_key_account_payments_after_mutate();

DROP TRIGGER IF EXISTS trg_po_ka_payments_after_delete ON public.purchase_order_key_account_payments;
CREATE TRIGGER trg_po_ka_payments_after_delete
  AFTER DELETE ON public.purchase_order_key_account_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.purchase_order_key_account_payments_after_mutate();

-- ---------------------------------------------------------------------------
-- 5) RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.purchase_order_key_account_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "KA PO payments: tenant select" ON public.purchase_order_key_account_payments;
CREATE POLICY "KA PO payments: tenant select"
  ON public.purchase_order_key_account_payments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.purchase_orders po
      WHERE po.id = purchase_order_key_account_payments.purchase_order_id
        AND po.company_account_type = 'Key Accounts'
        AND po.company_id = purchase_order_key_account_payments.company_id
        AND (
          (po.created_by = auth.uid() AND po.kam_id = auth.uid())
          OR EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role = 'sales_admin'
              AND p.company_id = po.company_id
          )
          OR EXISTS (
            SELECT 1
            FROM public.profiles p
            INNER JOIN public.kam_director_assignments a ON a.director_id = p.id
            WHERE p.id = auth.uid()
              AND p.role = 'sales_director'
              AND a.kam_id = po.kam_id
          )
        )
    )
  );

DROP POLICY IF EXISTS "KA PO payments: tenant insert" ON public.purchase_order_key_account_payments;
CREATE POLICY "KA PO payments: tenant insert"
  ON public.purchase_order_key_account_payments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.purchase_orders po
      WHERE po.id = purchase_order_key_account_payments.purchase_order_id
        AND po.company_account_type = 'Key Accounts'
        AND po.company_id = purchase_order_key_account_payments.company_id
        AND public.key_account_user_may_record_po_payment(po.id, auth.uid())
    )
  );

-- No UPDATE/DELETE for authenticated (immutable ledger)

GRANT SELECT, INSERT ON public.purchase_order_key_account_payments TO authenticated;

-- ---------------------------------------------------------------------------
-- 6) Private storage for payment proofs: {company_id}/{po_id}/...
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ka-po-payment-proofs',
  'ka-po-payment-proofs',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']::text[]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "KA PO payment proofs: tenant insert" ON storage.objects;
CREATE POLICY "KA PO payment proofs: tenant insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ka-po-payment-proofs'
    AND (storage.foldername(name))[1] = public.get_auth_company_id()::text
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = public.get_auth_company_id()
        AND p.role = ANY (
          ARRAY['key_account_manager'::text, 'sales_director'::text, 'sales_admin'::text]
        )
    )
  );

DROP POLICY IF EXISTS "KA PO payment proofs: tenant read" ON storage.objects;
CREATE POLICY "KA PO payment proofs: tenant read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'ka-po-payment-proofs'
    AND (storage.foldername(name))[1] = public.get_auth_company_id()::text
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = public.get_auth_company_id()
        AND p.role = ANY (
          ARRAY['key_account_manager'::text, 'sales_director'::text, 'sales_admin'::text]
        )
    )
  );
