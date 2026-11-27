-- Client Order Returns (CR-{INITIALS}-{YYYYMM}-000001)
-- Warehouse-linked Standard Account only.
-- Stock (returned_stock) moves only when status becomes posted.
-- Review this file, then run it in the SQL editor. UI stays mock until wired.

-- ---------------------------------------------------------------------------
-- 1) returned_stock on inventory (not sellable)
-- ---------------------------------------------------------------------------
ALTER TABLE public.main_inventory
  ADD COLUMN IF NOT EXISTS returned_stock integer NOT NULL DEFAULT 0;

ALTER TABLE public.agent_inventory
  ADD COLUMN IF NOT EXISTS returned_stock integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'main_inventory_returned_stock_nonneg'
  ) THEN
    ALTER TABLE public.main_inventory
      ADD CONSTRAINT main_inventory_returned_stock_nonneg CHECK (returned_stock >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_inventory_returned_stock_nonneg'
  ) THEN
    ALTER TABLE public.agent_inventory
      ADD CONSTRAINT agent_inventory_returned_stock_nonneg CHECK (returned_stock >= 0);
  END IF;
END $$;

COMMENT ON COLUMN public.main_inventory.returned_stock IS
  'Client-order returned units for this SKU. Not sellable. Sum of agent_inventory.returned_stock.';
COMMENT ON COLUMN public.agent_inventory.returned_stock IS
  'Client-order returned units held by this agent. Not sellable.';

-- Recreate the transaction_type check without dropping PO history.
-- Allowed types = types already in rows + types already on the check + client_order_return.
DO $$
DECLARE
  v_def text;
  v_from_rows text[];
  v_from_check text[];
  v_types text[];
BEGIN
  SELECT pg_get_constraintdef(c.oid)
  INTO v_def
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'inventory_transactions'
    AND c.conname = 'inventory_transactions_transaction_type_check';

  SELECT COALESCE(array_agg(DISTINCT transaction_type ORDER BY transaction_type), ARRAY[]::text[])
  INTO v_from_rows
  FROM public.inventory_transactions
  WHERE transaction_type IS NOT NULL;

  SELECT COALESCE(array_agg(m[1] ORDER BY m[1]), ARRAY[]::text[])
  INTO v_from_check
  FROM regexp_matches(COALESCE(v_def, ''), $re$'([^']+)'::text$re$, 'g') AS m
  WHERE m[1] IS DISTINCT FROM 'text';

  SELECT ARRAY(
    SELECT DISTINCT x
    FROM unnest(
      v_from_rows
      || v_from_check
      || ARRAY['client_order_return']::text[]
      || CASE
           WHEN v_def IS NULL THEN ARRAY[
             'purchase_order_received',
             'allocated_to_agent',
             'order_fulfilled',
             'adjustment',
             'return',
             'return_to_main',
             'warehouse_transfer_out',
             'warehouse_transfer_in',
             'warehouse_allocate_to_sub',
             'warehouse_return_from_sub',
             'rebate_return_in',
             'rebate_return_disposed',
             'warehouse_stock_receive',
             'warehouse_return_in',
             'warehouse_return_disposed',
             'internal_stock_request_reserve',
             'internal_stock_request_receive',
             'internal_stock_request_short_release',
             'client_return_out',
             'client_return_cancel_in',
             'client_return_in',
             'client_return_disposed'
           ]::text[]
           ELSE ARRAY[]::text[]
         END
    ) AS x
    WHERE x IS NOT NULL AND btrim(x) <> ''
    ORDER BY 1
  )
  INTO v_types;

  IF v_def IS NOT NULL AND v_def LIKE '%client_order_return%' THEN
    RETURN;
  END IF;

  ALTER TABLE public.inventory_transactions
    DROP CONSTRAINT IF EXISTS inventory_transactions_transaction_type_check;

  EXECUTE format(
    'ALTER TABLE public.inventory_transactions
       ADD CONSTRAINT inventory_transactions_transaction_type_check
       CHECK (transaction_type = ANY (%L::text[])) NOT VALID',
    v_types
  );

  ALTER TABLE public.inventory_transactions
    VALIDATE CONSTRAINT inventory_transactions_transaction_type_check;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Number counter + tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_order_return_number_counters (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  year_month text NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, year_month)
);

CREATE TABLE IF NOT EXISTS public.client_order_returns (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  return_number text NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_order_id uuid NOT NULL REFERENCES public.client_orders(id) ON DELETE RESTRICT,
  order_number text NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  client_name text NOT NULL,
  returned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  returned_by_name text,
  original_agent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  return_date date NOT NULL,
  reason text NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'pending_leader'
    CHECK (status IN ('pending_leader', 'posted', 'rejected', 'cancelled')),
  agent_signature_url text,
  approved_at timestamptz,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by_name text,
  rejected_at timestamptz,
  rejected_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  rejected_by_name text,
  rejection_note text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT client_order_returns_company_number_key UNIQUE (company_id, return_number)
);

CREATE INDEX IF NOT EXISTS idx_client_order_returns_company_status
  ON public.client_order_returns (company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_order_returns_order
  ON public.client_order_returns (client_order_id);
CREATE INDEX IF NOT EXISTS idx_client_order_returns_returned_by
  ON public.client_order_returns (returned_by);

DROP TRIGGER IF EXISTS update_client_order_returns_updated_at ON public.client_order_returns;
CREATE TRIGGER update_client_order_returns_updated_at
  BEFORE UPDATE ON public.client_order_returns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.client_order_return_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  return_id uuid NOT NULL REFERENCES public.client_order_returns(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_order_item_id uuid NOT NULL REFERENCES public.client_order_items(id) ON DELETE RESTRICT,
  variant_id uuid NOT NULL REFERENCES public.variants(id) ON DELETE RESTRICT,
  brand_name text NOT NULL,
  variant_name text NOT NULL,
  variant_type text,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(10,2) NOT NULL DEFAULT 0,
  line_total numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT client_order_return_items_return_line_key UNIQUE (return_id, client_order_item_id)
);

CREATE INDEX IF NOT EXISTS idx_client_order_return_items_return
  ON public.client_order_return_items (return_id);
CREATE INDEX IF NOT EXISTS idx_client_order_return_items_variant
  ON public.client_order_return_items (company_id, variant_id);

CREATE TABLE IF NOT EXISTS public.client_order_return_change_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  return_id uuid NOT NULL REFERENCES public.client_order_returns(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.variants(id) ON DELETE RESTRICT,
  brand_name text NOT NULL,
  variant_name text NOT NULL,
  variant_type text,
  quantity integer NOT NULL CHECK (quantity > 0),
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT client_order_return_change_items_return_variant_key UNIQUE (return_id, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_client_order_return_change_items_return
  ON public.client_order_return_change_items (return_id);

CREATE TABLE IF NOT EXISTS public.client_order_return_attachments (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  return_id uuid NOT NULL REFERENCES public.client_order_returns(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_path text NOT NULL,
  file_name text,
  content_type text,
  source text NOT NULL DEFAULT 'upload' CHECK (source IN ('capture', 'upload')),
  sort_order integer NOT NULL DEFAULT 0,
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_client_order_return_attachments_return
  ON public.client_order_return_attachments (return_id);

COMMENT ON TABLE public.client_order_returns IS
  'Client returns against an ORD (CR-…). Not Return to Warehouse (RT-…).';
COMMENT ON TABLE public.client_order_return_change_items IS
  'Exchange SKUs. Same brand + qty as returned lines. Sellable stock is not deducted.';

-- ---------------------------------------------------------------------------
-- 3) Storage (proofs + signature images)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'client-order-return-proofs',
  'client-order-return-proofs',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "CR proofs: insert own company" ON storage.objects;
CREATE POLICY "CR proofs: insert own company"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'client-order-return-proofs'
    AND (storage.foldername(name))[1] = public.get_auth_company_id()::text
    AND NOT public.is_warehouse()
  );

DROP POLICY IF EXISTS "CR proofs: read own company" ON storage.objects;
CREATE POLICY "CR proofs: read own company"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'client-order-return-proofs'
    AND (storage.foldername(name))[1] = public.get_auth_company_id()::text
    AND NOT public.is_warehouse()
  );

DROP POLICY IF EXISTS "CR proofs: sysadmin all" ON storage.objects;
CREATE POLICY "CR proofs: sysadmin all"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'client-order-return-proofs'
    AND public.is_system_administrator()
  )
  WITH CHECK (
    bucket_id = 'client-order-return-proofs'
    AND public.is_system_administrator()
  );

-- ---------------------------------------------------------------------------
-- 4) Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_client_order_return_number(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company_name text;
  v_initials text;
  v_year_month text;
  v_next integer;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'Company ID cannot be NULL';
  END IF;

  SELECT company_name INTO v_company_name
  FROM public.companies
  WHERE id = p_company_id;

  IF v_company_name IS NULL THEN
    RAISE EXCEPTION 'Company not found';
  END IF;

  v_initials := upper(btrim(public.get_unique_company_initials(p_company_id, v_company_name)));
  IF v_initials IS NULL OR length(v_initials) = 0 THEN
    RAISE EXCEPTION 'Failed to generate company initials';
  END IF;

  v_year_month := to_char((now() AT TIME ZONE 'Asia/Manila'), 'YYYYMM');

  INSERT INTO public.client_order_return_number_counters (company_id, year_month, last_number)
  VALUES (p_company_id, v_year_month, 1)
  ON CONFLICT (company_id, year_month)
  DO UPDATE SET last_number = public.client_order_return_number_counters.last_number + 1
  RETURNING last_number INTO v_next;

  RETURN 'CR-' || v_initials || '-' || v_year_month || '-' || lpad(v_next::text, 6, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.can_select_client_order_return(
  p_company_id uuid,
  p_returned_by uuid,
  p_original_agent_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    public.is_system_administrator()
    OR (
      p_company_id IS NOT DISTINCT FROM public.get_auth_company_id()
      AND NOT public.is_warehouse()
      AND public.get_linked_warehouse_company_id() IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.company_id = p_company_id
          AND (
            p.role IN ('admin', 'super_admin', 'manager', 'executive')
            OR (
              p.role IN ('mobile_sales', 'sales_agent')
              AND (p_returned_by = p.id OR p_original_agent_id = p.id)
            )
            OR (
              p.role = 'team_leader'
              AND (
                p_returned_by = p.id
                OR p_original_agent_id = p.id
                OR EXISTS (
                  SELECT 1
                  FROM public.leader_teams lt
                  WHERE lt.leader_id = p.id
                    AND lt.company_id = p_company_id
                    AND lt.agent_id IN (p_returned_by, COALESCE(p_original_agent_id, p_returned_by))
                )
              )
            )
          )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.is_client_order_return_team_leader_of(p_agent_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'team_leader'
      AND p.company_id = public.get_auth_company_id()
      AND (
        p.id = p_agent_id
        OR EXISTS (
          SELECT 1
          FROM public.leader_teams lt
          WHERE lt.leader_id = p.id
            AND lt.company_id = p.company_id
            AND lt.agent_id = p_agent_id
        )
      )
  );
$$;

-- Bump returned_stock only. Does not change sellable stock. Not granted to clients.
CREATE OR REPLACE FUNCTION public.apply_client_order_return_posted_stock(
  p_return_id uuid,
  p_performed_by uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_header public.client_order_returns%ROWTYPE;
  v_line RECORD;
  v_holder uuid;
BEGIN
  SELECT * INTO v_header
  FROM public.client_order_returns
  WHERE id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return not found';
  END IF;

  v_holder := COALESCE(v_header.original_agent_id, v_header.returned_by);

  FOR v_line IN
    SELECT variant_id, SUM(quantity) AS qty
    FROM public.client_order_return_items
    WHERE return_id = p_return_id
    GROUP BY variant_id
  LOOP
    UPDATE public.main_inventory
    SET returned_stock = COALESCE(returned_stock, 0) + v_line.qty,
        updated_at = now()
    WHERE company_id = v_header.company_id
      AND variant_id = v_line.variant_id;

    IF NOT FOUND THEN
      INSERT INTO public.main_inventory (
        company_id, variant_id, stock, allocated_stock, returned_stock, status, updated_at
      ) VALUES (
        v_header.company_id, v_line.variant_id, 0, 0, v_line.qty, 'in-stock', now()
      );
    END IF;

    IF v_holder IS NOT NULL THEN
      UPDATE public.agent_inventory
      SET returned_stock = COALESCE(returned_stock, 0) + v_line.qty,
          updated_at = now()
      WHERE company_id = v_header.company_id
        AND agent_id = v_holder
        AND variant_id = v_line.variant_id;

      IF NOT FOUND THEN
        INSERT INTO public.agent_inventory (
          company_id, agent_id, variant_id, stock, returned_stock, allocated_price, status, allocated_at, updated_at
        ) VALUES (
          v_header.company_id, v_holder, v_line.variant_id, 0, v_line.qty, 0, 'available', now(), now()
        );
      END IF;
    END IF;

    INSERT INTO public.inventory_transactions (
      company_id, variant_id, transaction_type, quantity,
      reference_type, reference_id, performed_by, notes, created_at
    ) VALUES (
      v_header.company_id,
      v_line.variant_id,
      'client_order_return',
      v_line.qty,
      'client_order_return',
      p_return_id,
      p_performed_by,
      'Client order return ' || v_header.return_number,
      now()
    );
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5) Create / approve / reject RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_client_order_return(
  p_client_order_id uuid,
  p_return_date date,
  p_reason text,
  p_notes text,
  p_agent_signature_url text,
  p_items jsonb,
  p_change_items jsonb,
  p_attachments jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid;
  v_role text;
  v_company_id uuid;
  v_account_type text;
  v_hub uuid;
  v_order public.client_orders%ROWTYPE;
  v_client_name text;
  v_returner_name text;
  v_return_id uuid;
  v_return_number text;
  v_status text;
  v_elem jsonb;
  v_item_id uuid;
  v_qty integer;
  v_sold integer;
  v_posted integer;
  v_variant_id uuid;
  v_brand_name text;
  v_variant_name text;
  v_variant_type text;
  v_unit_price numeric(10,2);
  v_available integer;
  v_source text;
  v_file_url text;
  v_file_path text;
BEGIN
  v_user := auth.uid();
  v_company_id := public.get_auth_company_id();

  IF v_user IS NULL OR v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT role, full_name INTO v_role, v_returner_name
  FROM public.profiles
  WHERE id = v_user AND company_id = v_company_id;

  IF v_role IS NULL OR v_role NOT IN ('mobile_sales', 'sales_agent', 'team_leader') THEN
    RETURN json_build_object('success', false, 'error', 'Only mobile sales or team leaders can file a client return');
  END IF;

  SELECT c.company_account_type INTO v_account_type
  FROM public.companies c
  WHERE c.id = v_company_id;

  IF v_account_type IS DISTINCT FROM 'Standard Accounts' THEN
    RETURN json_build_object('success', false, 'error', 'Only Standard Accounts can file client order returns');
  END IF;

  v_hub := public.get_linked_warehouse_company_id();
  IF v_hub IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'This company is not linked to a warehouse');
  END IF;

  SELECT * INTO v_order
  FROM public.client_orders
  WHERE id = p_client_order_id
    AND company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF NOT (v_order.status = 'approved' OR v_order.stage = 'admin_approved') THEN
    RETURN json_build_object('success', false, 'error', 'Only approved orders can be returned');
  END IF;

  IF v_role IN ('mobile_sales', 'sales_agent') AND v_order.agent_id IS DISTINCT FROM v_user THEN
    RETURN json_build_object('success', false, 'error', 'You can only return your own orders');
  END IF;

  IF v_role = 'team_leader'
     AND v_order.agent_id IS DISTINCT FROM v_user
     AND NOT public.is_client_order_return_team_leader_of(v_order.agent_id)
  THEN
    RETURN json_build_object('success', false, 'error', 'You can only return orders from your team');
  END IF;

  IF p_return_date IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Returned date is required');
  END IF;

  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Reason is required');
  END IF;

  IF p_agent_signature_url IS NULL OR length(btrim(p_agent_signature_url)) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Signature is required');
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'At least one return line is required');
  END IF;

  IF p_change_items IS NULL OR jsonb_typeof(p_change_items) <> 'array' OR jsonb_array_length(p_change_items) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Change items are required');
  END IF;

  IF p_attachments IS NULL OR jsonb_typeof(p_attachments) <> 'array' OR jsonb_array_length(p_attachments) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'At least one proof photo is required');
  END IF;

  SELECT COALESCE(c.name, 'Client')
  INTO v_client_name
  FROM public.clients c
  WHERE c.id = v_order.client_id;

  DROP TABLE IF EXISTS _cr_ret;
  DROP TABLE IF EXISTS _cr_chg;
  CREATE TEMP TABLE _cr_ret (
    client_order_item_id uuid PRIMARY KEY,
    variant_id uuid NOT NULL,
    brand_name text NOT NULL,
    variant_name text NOT NULL,
    variant_type text,
    quantity integer NOT NULL,
    unit_price numeric(10,2) NOT NULL,
    line_total numeric(10,2) NOT NULL
  ) ON COMMIT DROP;
  CREATE TEMP TABLE _cr_chg (
    variant_id uuid PRIMARY KEY,
    brand_name text NOT NULL,
    variant_name text NOT NULL,
    variant_type text,
    quantity integer NOT NULL
  ) ON COMMIT DROP;

  FOR v_elem IN SELECT t.elem FROM jsonb_array_elements(p_items) AS t(elem)
  LOOP
    v_item_id := NULLIF(v_elem->>'client_order_item_id', '')::uuid;
    v_qty := COALESCE((v_elem->>'quantity')::integer, 0);
    IF v_item_id IS NULL OR v_qty <= 0 THEN
      RETURN json_build_object('success', false, 'error', 'Each return line needs a sold item and qty > 0');
    END IF;

    SELECT coi.quantity, coi.variant_id, coi.unit_price, v.name, v.variant_type, COALESCE(b.name, 'Unknown')
    INTO v_sold, v_variant_id, v_unit_price, v_variant_name, v_variant_type, v_brand_name
    FROM public.client_order_items coi
    JOIN public.variants v ON v.id = coi.variant_id
    LEFT JOIN public.brands b ON b.id = v.brand_id
    WHERE coi.id = v_item_id
      AND coi.client_order_id = p_client_order_id
      AND coi.company_id = v_company_id;

    IF v_sold IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Return line is not on this order');
    END IF;

    SELECT COALESCE(SUM(i.quantity), 0) INTO v_posted
    FROM public.client_order_return_items i
    JOIN public.client_order_returns r ON r.id = i.return_id
    WHERE i.client_order_item_id = v_item_id
      AND r.status = 'posted';

    IF v_qty > (v_sold - v_posted) THEN
      RETURN json_build_object(
        'success', false,
        'error',
        format('Return qty for %s exceeds remaining (%s sold, %s already posted)', v_variant_name, v_sold, v_posted)
      );
    END IF;

    INSERT INTO _cr_ret (
      client_order_item_id, variant_id, brand_name, variant_name, variant_type, quantity, unit_price, line_total
    ) VALUES (
      v_item_id, v_variant_id, v_brand_name, v_variant_name, v_variant_type, v_qty, COALESCE(v_unit_price, 0),
      round(COALESCE(v_unit_price, 0) * v_qty, 2)
    );
  END LOOP;

  FOR v_elem IN SELECT t.elem FROM jsonb_array_elements(p_change_items) AS t(elem)
  LOOP
    v_variant_id := NULLIF(v_elem->>'variant_id', '')::uuid;
    v_qty := COALESCE((v_elem->>'quantity')::integer, 0);
    IF v_variant_id IS NULL OR v_qty <= 0 THEN
      RETURN json_build_object('success', false, 'error', 'Each change line needs a variant and qty > 0');
    END IF;

    SELECT v.name, v.variant_type, COALESCE(b.name, 'Unknown')
    INTO v_variant_name, v_variant_type, v_brand_name
    FROM public.variants v
    LEFT JOIN public.brands b ON b.id = v.brand_id
    WHERE v.id = v_variant_id;

    IF v_variant_name IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Change item variant not found');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM _cr_ret r WHERE r.brand_name = v_brand_name) THEN
      RETURN json_build_object('success', false, 'error', format('Change item %s is not the same brand as a returned item', v_variant_name));
    END IF;

    SELECT COALESCE(stock, 0) INTO v_available
    FROM public.agent_inventory
    WHERE company_id = v_company_id
      AND agent_id = v_user
      AND variant_id = v_variant_id;

    IF COALESCE(v_available, 0) < v_qty THEN
      RETURN json_build_object('success', false, 'error', format('Not enough stock to change %s', v_variant_name));
    END IF;

    INSERT INTO _cr_chg (variant_id, brand_name, variant_name, variant_type, quantity)
    VALUES (v_variant_id, v_brand_name, v_variant_name, v_variant_type, v_qty);
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT brand_name, SUM(quantity) AS qty FROM _cr_ret GROUP BY brand_name
    ) r
    FULL OUTER JOIN (
      SELECT brand_name, SUM(quantity) AS qty FROM _cr_chg GROUP BY brand_name
    ) c ON c.brand_name = r.brand_name
    WHERE COALESCE(r.qty, 0) IS DISTINCT FROM COALESCE(c.qty, 0)
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Change qty must match returned qty per brand');
  END IF;

  FOR v_elem IN SELECT t.elem FROM jsonb_array_elements(p_attachments) AS t(elem)
  LOOP
    IF NULLIF(btrim(COALESCE(v_elem->>'file_url', '')), '') IS NULL
       OR NULLIF(btrim(COALESCE(v_elem->>'file_path', '')), '') IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Each proof photo needs file_url and file_path');
    END IF;
  END LOOP;

  v_status := CASE WHEN v_role = 'team_leader' THEN 'posted' ELSE 'pending_leader' END;
  v_return_number := public.generate_client_order_return_number(v_company_id);

  INSERT INTO public.client_order_returns (
    return_number, company_id, client_order_id, order_number,
    client_id, client_name, returned_by, returned_by_name, original_agent_id,
    return_date, reason, notes, status, agent_signature_url,
    approved_at, approved_by, approved_by_name
  ) VALUES (
    v_return_number, v_company_id, v_order.id, v_order.order_number,
    v_order.client_id, COALESCE(v_client_name, 'Client'), v_user, v_returner_name, v_order.agent_id,
    p_return_date, btrim(p_reason), NULLIF(btrim(COALESCE(p_notes, '')), ''), v_status,
    btrim(p_agent_signature_url),
    CASE WHEN v_status = 'posted' THEN now() ELSE NULL END,
    CASE WHEN v_status = 'posted' THEN v_user ELSE NULL END,
    CASE WHEN v_status = 'posted' THEN v_returner_name ELSE NULL END
  )
  RETURNING id INTO v_return_id;

  INSERT INTO public.client_order_return_items (
    return_id, company_id, client_order_item_id, variant_id,
    brand_name, variant_name, variant_type, quantity, unit_price, line_total
  )
  SELECT v_return_id, v_company_id, client_order_item_id, variant_id,
         brand_name, variant_name, variant_type, quantity, unit_price, line_total
  FROM _cr_ret;

  INSERT INTO public.client_order_return_change_items (
    return_id, company_id, variant_id, brand_name, variant_name, variant_type, quantity
  )
  SELECT v_return_id, v_company_id, variant_id, brand_name, variant_name, variant_type, quantity
  FROM _cr_chg;

  FOR v_elem IN SELECT t.elem FROM jsonb_array_elements(p_attachments) AS t(elem)
  LOOP
    v_file_url := NULLIF(btrim(COALESCE(v_elem->>'file_url', '')), '');
    v_file_path := NULLIF(btrim(COALESCE(v_elem->>'file_path', '')), '');
    v_source := COALESCE(NULLIF(v_elem->>'source', ''), 'upload');
    IF v_file_url IS NULL OR v_file_path IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Each proof photo needs file_url and file_path');
    END IF;
    IF v_source NOT IN ('capture', 'upload') THEN
      v_source := 'upload';
    END IF;

    INSERT INTO public.client_order_return_attachments (
      return_id, company_id, file_url, file_path, file_name, content_type, source, sort_order, uploaded_by
    ) VALUES (
      v_return_id,
      v_company_id,
      v_file_url,
      v_file_path,
      NULLIF(v_elem->>'file_name', ''),
      NULLIF(v_elem->>'content_type', ''),
      v_source,
      COALESCE((v_elem->>'sort_order')::integer, 0),
      v_user
    );
  END LOOP;

  IF v_status = 'posted' THEN
    PERFORM public.apply_client_order_return_posted_stock(v_return_id, v_user);
  END IF;

  RETURN json_build_object(
    'success', true,
    'id', v_return_id,
    'return_number', v_return_number,
    'status', v_status
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('success', false, 'error', 'Duplicate return line');
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_client_order_return(p_return_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid;
  v_company_id uuid;
  v_name text;
  v_header public.client_order_returns%ROWTYPE;
BEGIN
  v_user := auth.uid();
  v_company_id := public.get_auth_company_id();

  IF v_user IS NULL OR v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT full_name INTO v_name
  FROM public.profiles
  WHERE id = v_user AND role = 'team_leader' AND company_id = v_company_id;

  IF v_name IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Only a team leader can approve a client return');
  END IF;

  SELECT * INTO v_header
  FROM public.client_order_returns
  WHERE id = p_return_id
    AND company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Return not found');
  END IF;

  IF v_header.status IS DISTINCT FROM 'pending_leader' THEN
    RETURN json_build_object('success', false, 'error', 'Only pending returns can be approved');
  END IF;

  IF NOT (
    public.is_client_order_return_team_leader_of(v_header.returned_by)
    OR public.is_client_order_return_team_leader_of(COALESCE(v_header.original_agent_id, v_header.returned_by))
  ) THEN
    RETURN json_build_object('success', false, 'error', 'You can only approve returns from your team');
  END IF;

  UPDATE public.client_order_returns
  SET status = 'posted',
      approved_at = now(),
      approved_by = v_user,
      approved_by_name = v_name,
      rejected_at = NULL,
      rejected_by = NULL,
      rejected_by_name = NULL,
      rejection_note = NULL
  WHERE id = p_return_id;

  PERFORM public.apply_client_order_return_posted_stock(p_return_id, v_user);

  RETURN json_build_object('success', true, 'id', p_return_id, 'status', 'posted');
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_client_order_return(
  p_return_id uuid,
  p_note text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid;
  v_company_id uuid;
  v_name text;
  v_header public.client_order_returns%ROWTYPE;
BEGIN
  v_user := auth.uid();
  v_company_id := public.get_auth_company_id();

  IF v_user IS NULL OR v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT full_name INTO v_name
  FROM public.profiles
  WHERE id = v_user AND role = 'team_leader' AND company_id = v_company_id;

  IF v_name IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Only a team leader can reject a client return');
  END IF;

  SELECT * INTO v_header
  FROM public.client_order_returns
  WHERE id = p_return_id
    AND company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Return not found');
  END IF;

  IF v_header.status IS DISTINCT FROM 'pending_leader' THEN
    RETURN json_build_object('success', false, 'error', 'Only pending returns can be rejected');
  END IF;

  IF NOT (
    public.is_client_order_return_team_leader_of(v_header.returned_by)
    OR public.is_client_order_return_team_leader_of(COALESCE(v_header.original_agent_id, v_header.returned_by))
  ) THEN
    RETURN json_build_object('success', false, 'error', 'You can only reject returns from your team');
  END IF;

  UPDATE public.client_order_returns
  SET status = 'rejected',
      rejected_at = now(),
      rejected_by = v_user,
      rejected_by_name = v_name,
      rejection_note = NULLIF(btrim(COALESCE(p_note, '')), ''),
      approved_at = NULL,
      approved_by = NULL,
      approved_by_name = NULL
  WHERE id = p_return_id;

  RETURN json_build_object('success', true, 'id', p_return_id, 'status', 'rejected');
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 6) RLS — SELECT only; writes go through RPCs
-- ---------------------------------------------------------------------------
ALTER TABLE public.client_order_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_order_return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_order_return_change_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_order_return_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_order_return_number_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CR header select" ON public.client_order_returns;
CREATE POLICY "CR header select"
  ON public.client_order_returns FOR SELECT TO authenticated
  USING (
    public.can_select_client_order_return(company_id, returned_by, original_agent_id)
  );

DROP POLICY IF EXISTS "CR items select" ON public.client_order_return_items;
CREATE POLICY "CR items select"
  ON public.client_order_return_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.client_order_returns r
      WHERE r.id = client_order_return_items.return_id
        AND public.can_select_client_order_return(r.company_id, r.returned_by, r.original_agent_id)
    )
  );

DROP POLICY IF EXISTS "CR change items select" ON public.client_order_return_change_items;
CREATE POLICY "CR change items select"
  ON public.client_order_return_change_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.client_order_returns r
      WHERE r.id = client_order_return_change_items.return_id
        AND public.can_select_client_order_return(r.company_id, r.returned_by, r.original_agent_id)
    )
  );

DROP POLICY IF EXISTS "CR attachments select" ON public.client_order_return_attachments;
CREATE POLICY "CR attachments select"
  ON public.client_order_return_attachments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.client_order_returns r
      WHERE r.id = client_order_return_attachments.return_id
        AND public.can_select_client_order_return(r.company_id, r.returned_by, r.original_agent_id)
    )
  );

REVOKE ALL ON TABLE public.client_order_returns FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.client_order_return_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.client_order_return_change_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.client_order_return_attachments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.client_order_return_number_counters FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.client_order_returns TO authenticated;
GRANT SELECT ON TABLE public.client_order_return_items TO authenticated;
GRANT SELECT ON TABLE public.client_order_return_change_items TO authenticated;
GRANT SELECT ON TABLE public.client_order_return_attachments TO authenticated;

GRANT EXECUTE ON FUNCTION public.can_select_client_order_return(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_client_order_return_team_leader_of(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_client_order_return(uuid, date, text, text, text, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_client_order_return(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_client_order_return(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.generate_client_order_return_number(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_client_order_return_posted_stock(uuid, uuid) FROM PUBLIC, anon, authenticated;

ALTER TABLE public.client_order_returns REPLICA IDENTITY FULL;
