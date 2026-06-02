-- Key Account PO rebates: post-delivery credit or replacement linked to source PO.

CREATE SEQUENCE IF NOT EXISTS public.key_account_rebate_number_seq;

-- ---------------------------------------------------------------------------
-- 1) purchase_orders flags for rebate fulfillment child POs
-- ---------------------------------------------------------------------------
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS source_rebate_id uuid,
  ADD COLUMN IF NOT EXISTS po_order_kind text DEFAULT 'standard';

ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_po_order_kind_check;
ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_po_order_kind_check
  CHECK (po_order_kind IS NULL OR po_order_kind = ANY (ARRAY['standard'::text, 'rebate_fulfillment'::text]));

CREATE INDEX IF NOT EXISTS idx_purchase_orders_source_rebate
  ON public.purchase_orders(source_rebate_id)
  WHERE source_rebate_id IS NOT NULL;

COMMENT ON COLUMN public.purchase_orders.source_rebate_id IS
  'When po_order_kind = rebate_fulfillment, links to key_account_po_rebates.id.';
COMMENT ON COLUMN public.purchase_orders.po_order_kind IS
  'standard | rebate_fulfillment (replacement shipment after rebate approval).';

-- ---------------------------------------------------------------------------
-- 2) Rebate tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.key_account_po_rebates (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  rebate_number text NOT NULL,
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  key_account_client_id uuid REFERENCES public.key_account_clients(id) ON DELETE SET NULL,
  kam_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolution_type text NOT NULL,
  status text DEFAULT 'draft' NOT NULL,
  reason_code text NOT NULL,
  notes text,
  disputed_total numeric(14,2) DEFAULT 0 NOT NULL,
  credit_amount numeric(14,2) DEFAULT 0 NOT NULL,
  replacement_total numeric(14,2) DEFAULT 0 NOT NULL,
  fulfillment_purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  submitted_at timestamp with time zone,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at timestamp with time zone,
  rejected_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  rejected_at timestamp with time zone,
  rejection_reason text,
  executed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT key_account_po_rebates_company_number_unique UNIQUE (company_id, rebate_number),
  CONSTRAINT key_account_po_rebates_resolution_type_check CHECK (
    resolution_type = ANY (ARRAY['credit'::text, 'replacement'::text, 'mixed'::text])
  ),
  CONSTRAINT key_account_po_rebates_status_check CHECK (
    status = ANY (ARRAY['draft'::text, 'submitted'::text, 'approved'::text, 'rejected'::text, 'executed'::text])
  ),
  CONSTRAINT key_account_po_rebates_reason_code_check CHECK (
    reason_code = ANY (ARRAY['slow_moving'::text, 'quality_taste'::text, 'damaged'::text, 'wrong_item'::text, 'other'::text])
  ),
  CONSTRAINT key_account_po_rebates_disputed_total_nonneg CHECK (disputed_total >= 0),
  CONSTRAINT key_account_po_rebates_credit_amount_nonneg CHECK (credit_amount >= 0),
  CONSTRAINT key_account_po_rebates_replacement_total_nonneg CHECK (replacement_total >= 0)
);

CREATE INDEX IF NOT EXISTS idx_ka_rebates_po ON public.key_account_po_rebates(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_ka_rebates_company_status ON public.key_account_po_rebates(company_id, status);
CREATE INDEX IF NOT EXISTS idx_ka_rebates_client ON public.key_account_po_rebates(key_account_client_id);

ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_source_rebate_id_fkey;
ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_source_rebate_id_fkey
  FOREIGN KEY (source_rebate_id) REFERENCES public.key_account_po_rebates(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.key_account_po_rebate_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  rebate_id uuid NOT NULL REFERENCES public.key_account_po_rebates(id) ON DELETE CASCADE,
  purchase_order_item_id uuid NOT NULL REFERENCES public.purchase_order_items(id) ON DELETE RESTRICT,
  variant_id uuid NOT NULL REFERENCES public.variants(id) ON DELETE RESTRICT,
  disputed_quantity integer NOT NULL,
  unit_price numeric(14,2) NOT NULL,
  line_total numeric(14,2) NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT key_account_po_rebate_lines_qty_positive CHECK (disputed_quantity > 0),
  CONSTRAINT key_account_po_rebate_lines_line_total_nonneg CHECK (line_total >= 0)
);

CREATE INDEX IF NOT EXISTS idx_ka_rebate_lines_rebate ON public.key_account_po_rebate_lines(rebate_id);
CREATE INDEX IF NOT EXISTS idx_ka_rebate_lines_po_item ON public.key_account_po_rebate_lines(purchase_order_item_id);

CREATE TABLE IF NOT EXISTS public.key_account_po_rebate_replacements (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  rebate_id uuid NOT NULL REFERENCES public.key_account_po_rebates(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.variants(id) ON DELETE RESTRICT,
  warehouse_location_id uuid NOT NULL REFERENCES public.warehouse_locations(id) ON DELETE RESTRICT,
  quantity integer NOT NULL,
  unit_price numeric(14,2) NOT NULL,
  total_price numeric(14,2) NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT key_account_po_rebate_replacements_qty_positive CHECK (quantity > 0),
  CONSTRAINT key_account_po_rebate_replacements_total_nonneg CHECK (total_price >= 0)
);

CREATE INDEX IF NOT EXISTS idx_ka_rebate_replacements_rebate ON public.key_account_po_rebate_replacements(rebate_id);

CREATE TABLE IF NOT EXISTS public.key_account_client_credits (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  key_account_client_id uuid NOT NULL REFERENCES public.key_account_clients(id) ON DELETE CASCADE,
  rebate_id uuid NOT NULL REFERENCES public.key_account_po_rebates(id) ON DELETE RESTRICT,
  amount numeric(14,2) NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT key_account_client_credits_amount_positive CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_ka_client_credits_client ON public.key_account_client_credits(key_account_client_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ka_client_credits_rebate ON public.key_account_client_credits(rebate_id);

DROP TRIGGER IF EXISTS update_key_account_po_rebates_updated_at ON public.key_account_po_rebates;
CREATE TRIGGER update_key_account_po_rebates_updated_at
  BEFORE UPDATE ON public.key_account_po_rebates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 3) Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_key_account_rebate_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  seq_val integer;
BEGIN
  SELECT nextval('key_account_rebate_number_seq') INTO seq_val;
  RETURN 'REB-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(seq_val::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_key_account_rebate_number() TO authenticated;

CREATE OR REPLACE FUNCTION public.key_account_po_is_delivered(p_po_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.purchase_orders po
    WHERE po.id = p_po_id
      AND po.company_account_type = 'Key Accounts'
      AND po.status = 'fulfilled'
      AND po.workflow_status = 'delivered'
  );
$$;

GRANT EXECUTE ON FUNCTION public.key_account_po_is_delivered(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.key_account_rebate_committed_total(p_po_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(SUM(r.disputed_total), 0)::numeric
  FROM public.key_account_po_rebates r
  WHERE r.purchase_order_id = p_po_id
    AND r.status = ANY (ARRAY['submitted'::text, 'approved'::text, 'executed'::text]);
$$;

GRANT EXECUTE ON FUNCTION public.key_account_rebate_committed_total(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.key_account_rebated_qty_for_po_item(p_po_item_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(SUM(l.disputed_quantity), 0)::integer
  FROM public.key_account_po_rebate_lines l
  INNER JOIN public.key_account_po_rebates r ON r.id = l.rebate_id
  WHERE l.purchase_order_item_id = p_po_item_id
    AND r.status = ANY (ARRAY['submitted'::text, 'approved'::text, 'executed'::text]);
$$;

GRANT EXECUTE ON FUNCTION public.key_account_rebated_qty_for_po_item(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.key_account_user_may_manage_rebate(p_po_id uuid, p_uid uuid DEFAULT auth.uid())
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
          WHEN po.kam_id IS NOT DISTINCT FROM p_uid THEN true
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

GRANT EXECUTE ON FUNCTION public.key_account_user_may_manage_rebate(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.key_account_user_may_approve_rebate(p_rebate_id uuid, p_uid uuid DEFAULT auth.uid())
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
          WHEN EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = p_uid
              AND p.company_id = r.company_id
              AND p.role = ANY (ARRAY['sales_admin'::text, 'sales_head'::text])
          ) THEN true
          WHEN EXISTS (
            SELECT 1
            FROM public.profiles p
            INNER JOIN public.kam_director_assignments a ON a.director_id = p.id
            WHERE p.id = p_uid
              AND p.role = 'sales_director'
              AND a.kam_id = r.kam_id
          ) THEN true
          ELSE false
        END
      FROM public.key_account_po_rebates r
      WHERE r.id = p_rebate_id
    ),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.key_account_user_may_approve_rebate(uuid, uuid) TO authenticated;

-- Reserve stock for rebate fulfillment PO (skips warehouse user role check).
CREATE OR REPLACE FUNCTION public._reserve_rebate_fulfillment_po(p_po_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  po_record RECORD;
  rec RECORD;
  loc_stock integer;
  main_available integer;
  v_is_main_location boolean;
BEGIN
  SELECT * INTO po_record FROM public.purchase_orders WHERE id = p_po_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Purchase order not found');
  END IF;
  IF po_record.po_order_kind IS DISTINCT FROM 'rebate_fulfillment' THEN
    RETURN json_build_object('success', false, 'error', 'Not a rebate fulfillment purchase order');
  END IF;
  IF po_record.fulfillment_type IS DISTINCT FROM 'warehouse_transfer' THEN
    RETURN json_build_object('success', false, 'error', 'Rebate fulfillment must be warehouse transfer');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.purchase_order_items poi
    WHERE poi.purchase_order_id = p_po_id AND poi.warehouse_location_id IS NULL
  ) THEN
    RETURN json_build_object('success', false, 'error', 'All rebate fulfillment items must have a warehouse location');
  END IF;

  FOR rec IN
    SELECT poi.warehouse_location_id, poi.variant_id, SUM(poi.quantity)::int AS quantity
    FROM public.purchase_order_items poi
    WHERE poi.purchase_order_id = p_po_id
    GROUP BY poi.warehouse_location_id, poi.variant_id
  LOOP
    SELECT COALESCE(wl.is_main, false) INTO v_is_main_location
    FROM public.warehouse_locations wl
    WHERE wl.id = rec.warehouse_location_id
      AND wl.company_id = po_record.warehouse_company_id;
    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'Invalid warehouse location');
    END IF;

    IF v_is_main_location THEN
      SELECT (mi.stock - COALESCE(mi.allocated_stock, 0))::int INTO main_available
      FROM public.main_inventory mi
      WHERE mi.company_id = po_record.warehouse_company_id AND mi.variant_id = rec.variant_id;
      IF main_available IS NULL OR main_available < rec.quantity THEN
        RETURN json_build_object('success', false, 'error', 'Insufficient stock for replacement items');
      END IF;
    ELSE
      SELECT COALESCE(wli.stock, 0) INTO loc_stock
      FROM public.warehouse_location_inventory wli
      WHERE wli.company_id = po_record.warehouse_company_id
        AND wli.location_id = rec.warehouse_location_id
        AND wli.variant_id = rec.variant_id;
      IF NOT FOUND OR loc_stock < rec.quantity THEN
        RETURN json_build_object('success', false, 'error', 'Insufficient stock for replacement items');
      END IF;
    END IF;

    INSERT INTO public.warehouse_transfer_reservations (
      purchase_order_id, warehouse_company_id, warehouse_location_id, variant_id,
      quantity_reserved, quantity_fulfilled, status, created_by
    ) VALUES (
      p_po_id, po_record.warehouse_company_id, rec.warehouse_location_id, rec.variant_id,
      rec.quantity, 0, 'reserved', auth.uid()
    )
    ON CONFLICT (purchase_order_id, warehouse_location_id, variant_id) DO UPDATE
    SET quantity_reserved = EXCLUDED.quantity_reserved, quantity_fulfilled = 0, status = 'reserved', updated_at = NOW();

    INSERT INTO public.warehouse_transfer_location_status (
      purchase_order_id, warehouse_company_id, warehouse_location_id, status
    ) VALUES (
      p_po_id, po_record.warehouse_company_id, rec.warehouse_location_id, 'ready'
    )
    ON CONFLICT (purchase_order_id, warehouse_location_id) DO UPDATE
    SET status = 'ready', updated_at = NOW();
  END LOOP;

  UPDATE public.purchase_orders
  SET status = 'approved_for_fulfillment', approved_at = NOW()
  WHERE id = p_po_id;

  RETURN json_build_object('success', true, 'po_number', po_record.po_number);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) create_key_account_rebate RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_key_account_rebate(
  p_po_id uuid,
  p_reason_code text,
  p_notes text DEFAULT NULL,
  p_resolution_type text DEFAULT 'credit',
  p_lines jsonb DEFAULT '[]'::jsonb,
  p_replacements jsonb DEFAULT '[]'::jsonb,
  p_credit_amount numeric DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_po RECORD;
  v_rebate_id uuid;
  v_rebate_number text;
  v_line jsonb;
  v_rep jsonb;
  v_item RECORD;
  v_already integer;
  v_disputed_total numeric(14,2) := 0;
  v_line_total numeric(14,2);
  v_replacement_total numeric(14,2) := 0;
  v_committed numeric(14,2);
  v_settlement numeric(14,2);
  v_wh_loc uuid;
BEGIN
  IF NOT public.key_account_user_may_manage_rebate(p_po_id) THEN
    RETURN json_build_object('success', false, 'error', 'Not allowed to create rebate for this PO');
  END IF;
  IF NOT public.key_account_po_is_delivered(p_po_id) THEN
    RETURN json_build_object('success', false, 'error', 'Rebates are only allowed for delivered Key Account POs');
  END IF;

  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id;
  IF p_resolution_type NOT IN ('credit', 'replacement', 'mixed') THEN
    RETURN json_build_object('success', false, 'error', 'Invalid resolution type');
  END IF;
  IF p_reason_code NOT IN ('slow_moving', 'quality_taste', 'damaged', 'wrong_item', 'other') THEN
    RETURN json_build_object('success', false, 'error', 'Invalid reason code');
  END IF;
  IF jsonb_array_length(p_lines) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Select at least one line item');
  END IF;

  v_wh_loc := v_po.warehouse_location_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    SELECT poi.* INTO v_item
    FROM public.purchase_order_items poi
    WHERE poi.id = (v_line->>'purchase_order_item_id')::uuid
      AND poi.purchase_order_id = p_po_id;
    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'Invalid purchase order line');
    END IF;
    IF (v_line->>'disputed_quantity')::int <= 0 THEN
      RETURN json_build_object('success', false, 'error', 'Disputed quantity must be positive');
    END IF;
    v_already := public.key_account_rebated_qty_for_po_item(v_item.id);
    IF v_already + (v_line->>'disputed_quantity')::int > v_item.quantity THEN
      RETURN json_build_object('success', false, 'error', 'Disputed quantity exceeds remaining quantity for a line item');
    END IF;
    v_line_total := ROUND((v_line->>'disputed_quantity')::numeric * v_item.unit_price, 2);
    v_disputed_total := v_disputed_total + v_line_total;
  END LOOP;

  v_committed := public.key_account_rebate_committed_total(p_po_id);
  IF v_committed + v_disputed_total > COALESCE(v_po.total_amount, 0) + 0.0001 THEN
    RETURN json_build_object('success', false, 'error', 'Total rebates would exceed PO total amount');
  END IF;

  IF p_resolution_type IN ('replacement', 'mixed') THEN
    IF jsonb_array_length(p_replacements) = 0 THEN
      RETURN json_build_object('success', false, 'error', 'Add replacement items');
    END IF;
    FOR v_rep IN SELECT * FROM jsonb_array_elements(p_replacements)
    LOOP
      v_replacement_total := v_replacement_total + ROUND((v_rep->>'total_price')::numeric, 2);
    END LOOP;
  END IF;

  v_settlement := ROUND(COALESCE(p_credit_amount, 0), 2) + v_replacement_total;
  IF p_resolution_type = 'credit' THEN
    v_settlement := ROUND(COALESCE(p_credit_amount, 0), 2);
    IF v_settlement + 0.0001 < v_disputed_total THEN
      RETURN json_build_object('success', false, 'error', 'Credit amount must be at least the disputed line total');
    END IF;
  ELSIF p_resolution_type = 'replacement' THEN
    IF v_replacement_total + 0.0001 < v_disputed_total THEN
      RETURN json_build_object('success', false, 'error', 'Replacement value must be at least the disputed line total');
    END IF;
  ELSE
    IF v_settlement + 0.0001 < v_disputed_total THEN
      RETURN json_build_object('success', false, 'error', 'Credit plus replacement must be at least the disputed line total');
    END IF;
  END IF;

  v_rebate_number := public.generate_key_account_rebate_number();

  INSERT INTO public.key_account_po_rebates (
    company_id, rebate_number, purchase_order_id, key_account_client_id, kam_id,
    resolution_type, status, reason_code, notes,
    disputed_total, credit_amount, replacement_total, created_by
  ) VALUES (
    v_po.company_id, v_rebate_number, p_po_id, v_po.key_account_client_id, v_po.kam_id,
    p_resolution_type, 'submitted', p_reason_code, NULLIF(trim(p_notes), ''),
    v_disputed_total,
    CASE WHEN p_resolution_type = 'replacement' THEN 0 ELSE ROUND(COALESCE(p_credit_amount, 0), 2) END,
    v_replacement_total,
    auth.uid()
  )
  RETURNING id INTO v_rebate_id;

  UPDATE public.key_account_po_rebates SET submitted_at = NOW() WHERE id = v_rebate_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    SELECT poi.* INTO v_item
    FROM public.purchase_order_items poi
    WHERE poi.id = (v_line->>'purchase_order_item_id')::uuid;
    v_line_total := ROUND((v_line->>'disputed_quantity')::numeric * v_item.unit_price, 2);
    INSERT INTO public.key_account_po_rebate_lines (
      rebate_id, purchase_order_item_id, variant_id, disputed_quantity, unit_price, line_total
    ) VALUES (
      v_rebate_id, v_item.id, v_item.variant_id,
      (v_line->>'disputed_quantity')::int, v_item.unit_price, v_line_total
    );
  END LOOP;

  IF p_resolution_type IN ('replacement', 'mixed') THEN
    FOR v_rep IN SELECT * FROM jsonb_array_elements(p_replacements)
    LOOP
      INSERT INTO public.key_account_po_rebate_replacements (
        rebate_id, variant_id, warehouse_location_id, quantity, unit_price, total_price
      ) VALUES (
        v_rebate_id,
        (v_rep->>'variant_id')::uuid,
        COALESCE((v_rep->>'warehouse_location_id')::uuid, v_wh_loc),
        (v_rep->>'quantity')::int,
        (v_rep->>'unit_price')::numeric,
        (v_rep->>'total_price')::numeric
      );
    END LOOP;
  END IF;

  RETURN json_build_object('success', true, 'rebate_id', v_rebate_id, 'rebate_number', v_rebate_number);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_key_account_rebate(uuid, text, text, text, jsonb, jsonb, numeric) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) approve_and_execute_key_account_rebate RPC
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

  IF v_rebate.credit_amount > 0 AND v_rebate.key_account_client_id IS NOT NULL THEN
    INSERT INTO public.key_account_client_credits (
      company_id, key_account_client_id, rebate_id, amount, notes
    ) VALUES (
      v_rebate.company_id, v_rebate.key_account_client_id, p_rebate_id, v_rebate.credit_amount,
      'Rebate ' || v_rebate.rebate_number || ' for PO ' || v_po.po_number
    );
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
    'fulfillment_po_id', v_fulfill_po_id,
    'fulfillment_po_number', v_po_number
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_and_execute_key_account_rebate(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_key_account_rebate(p_rebate_id uuid, p_reason text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rebate RECORD;
BEGIN
  IF NOT public.key_account_user_may_approve_rebate(p_rebate_id) THEN
    RETURN json_build_object('success', false, 'error', 'Not allowed to reject this rebate');
  END IF;

  SELECT * INTO v_rebate FROM public.key_account_po_rebates WHERE id = p_rebate_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Rebate not found');
  END IF;
  IF v_rebate.status IS DISTINCT FROM 'submitted' THEN
    RETURN json_build_object('success', false, 'error', 'Rebate is not awaiting approval');
  END IF;

  UPDATE public.key_account_po_rebates
  SET status = 'rejected',
      rejected_by = auth.uid(),
      rejected_at = NOW(),
      rejection_reason = NULLIF(trim(p_reason), '')
  WHERE id = p_rebate_id;

  RETURN json_build_object('success', true, 'rebate_number', v_rebate.rebate_number);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_key_account_rebate(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6) Table grants (authenticated role)
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON public.key_account_po_rebates TO authenticated;
GRANT SELECT, INSERT ON public.key_account_po_rebate_lines TO authenticated;
GRANT SELECT, INSERT ON public.key_account_po_rebate_replacements TO authenticated;
GRANT SELECT, INSERT ON public.key_account_client_credits TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.key_account_rebate_number_seq TO authenticated;

-- ---------------------------------------------------------------------------
-- 7) RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.key_account_po_rebates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.key_account_po_rebate_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.key_account_po_rebate_replacements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.key_account_client_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "KA rebates viewable by company key account roles" ON public.key_account_po_rebates;
CREATE POLICY "KA rebates viewable by company key account roles" ON public.key_account_po_rebates
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = key_account_po_rebates.company_id
        AND p.role = ANY (ARRAY[
          'sales_admin'::text, 'sales_head'::text, 'sales_director'::text,
          'key_account_manager'::text, 'key_account_accounting'::text
        ])
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'warehouse'
    )
  );

DROP POLICY IF EXISTS "KA rebates insert by authorized users" ON public.key_account_po_rebates;
CREATE POLICY "KA rebates insert by authorized users" ON public.key_account_po_rebates
  FOR INSERT WITH CHECK (
    public.key_account_user_may_manage_rebate(purchase_order_id, auth.uid())
  );

DROP POLICY IF EXISTS "KA rebates update by authorized users" ON public.key_account_po_rebates;
CREATE POLICY "KA rebates update by authorized users" ON public.key_account_po_rebates
  FOR UPDATE USING (
    public.key_account_user_may_manage_rebate(purchase_order_id, auth.uid())
    OR public.key_account_user_may_approve_rebate(id, auth.uid())
  );

DROP POLICY IF EXISTS "KA rebate lines viewable" ON public.key_account_po_rebate_lines;
CREATE POLICY "KA rebate lines viewable" ON public.key_account_po_rebate_lines
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.key_account_po_rebates r
      WHERE r.id = key_account_po_rebate_lines.rebate_id
    )
  );

DROP POLICY IF EXISTS "KA rebate lines insert" ON public.key_account_po_rebate_lines;
CREATE POLICY "KA rebate lines insert" ON public.key_account_po_rebate_lines
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.key_account_po_rebates r
      WHERE r.id = key_account_po_rebate_lines.rebate_id
        AND public.key_account_user_may_manage_rebate(r.purchase_order_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "KA rebate replacements viewable" ON public.key_account_po_rebate_replacements;
CREATE POLICY "KA rebate replacements viewable" ON public.key_account_po_rebate_replacements
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.key_account_po_rebates r WHERE r.id = key_account_po_rebate_replacements.rebate_id)
  );

DROP POLICY IF EXISTS "KA rebate replacements insert" ON public.key_account_po_rebate_replacements;
CREATE POLICY "KA rebate replacements insert" ON public.key_account_po_rebate_replacements
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.key_account_po_rebates r
      WHERE r.id = key_account_po_rebate_replacements.rebate_id
        AND public.key_account_user_may_manage_rebate(r.purchase_order_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "KA client credits viewable" ON public.key_account_client_credits;
CREATE POLICY "KA client credits viewable" ON public.key_account_client_credits
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = key_account_client_credits.company_id
        AND p.role = ANY (ARRAY[
          'sales_admin'::text, 'sales_head'::text, 'sales_director'::text,
          'key_account_manager'::text, 'key_account_accounting'::text
        ])
    )
  );

DROP POLICY IF EXISTS "KA client credits insert" ON public.key_account_client_credits;
CREATE POLICY "KA client credits insert" ON public.key_account_client_credits
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = key_account_client_credits.company_id
        AND p.role = ANY (ARRAY['sales_admin'::text, 'sales_head'::text, 'sales_director'::text])
    )
  );
