-- Client order return refunds.
-- One type per CR: change_item | refund. Existing rows stay change_item.
-- Refund: skip change items, skip TL money approval. SA then Finance.
-- Stock still moves only when status becomes posted.
-- Review this file, then run it in the SQL editor.

-- ---------------------------------------------------------------------------
-- 1) Columns + status check
-- ---------------------------------------------------------------------------
ALTER TABLE public.client_order_returns
  ADD COLUMN IF NOT EXISTS return_type text NOT NULL DEFAULT 'change_item';

UPDATE public.client_order_returns
SET return_type = 'change_item'
WHERE return_type IS DISTINCT FROM 'change_item'
  AND return_type IS DISTINCT FROM 'refund';

DO $$
DECLARE
  v_conname text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_order_returns_return_type_check'
  ) THEN
    ALTER TABLE public.client_order_returns
      ADD CONSTRAINT client_order_returns_return_type_check
      CHECK (return_type IN ('change_item', 'refund'));
  END IF;

  FOR v_conname IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'client_order_returns'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%status%pending_leader%'
      AND con.conname IS DISTINCT FROM 'client_order_returns_type_status_check'
  LOOP
    EXECUTE format('ALTER TABLE public.client_order_returns DROP CONSTRAINT %I', v_conname);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_order_returns_status_check'
  ) THEN
    ALTER TABLE public.client_order_returns
      ADD CONSTRAINT client_order_returns_status_check
      CHECK (status IN (
        'pending_leader',
        'pending_super_admin',
        'pending_finance',
        'posted',
        'rejected',
        'cancelled'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_order_returns_type_status_check'
  ) THEN
    ALTER TABLE public.client_order_returns
      ADD CONSTRAINT client_order_returns_type_status_check
      CHECK (
        (
          return_type = 'change_item'
          AND status IN ('pending_leader', 'posted', 'rejected', 'cancelled')
        )
        OR (
          return_type = 'refund'
          AND status IN ('pending_super_admin', 'pending_finance', 'posted', 'rejected', 'cancelled')
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_client_order_returns_company_type_status
  ON public.client_order_returns (company_id, return_type, status, created_at DESC);

COMMENT ON COLUMN public.client_order_returns.return_type IS
  'change_item (TL-owned) or refund (SA then Finance). One type per CR. Amount is qty x original unit price.';

ALTER TABLE public.client_order_returns
  ADD COLUMN IF NOT EXISTS sa_approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sa_approved_by_name text,
  ADD COLUMN IF NOT EXISTS sa_approved_at timestamptz;

COMMENT ON COLUMN public.client_order_returns.sa_approved_by IS
  'Super Admin who sent a refund to finance. Finance post still uses approved_*.';
COMMENT ON COLUMN public.client_order_returns.sa_approved_by_name IS
  'Display name of the Super Admin who sent a refund to finance.';
COMMENT ON COLUMN public.client_order_returns.sa_approved_at IS
  'When Super Admin sent a refund to finance.';

-- ---------------------------------------------------------------------------
-- 2) Finance / accounting can SELECT company CRs
-- ---------------------------------------------------------------------------
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
            p.role IN ('admin', 'super_admin', 'manager', 'executive', 'finance', 'accounting')
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

-- ---------------------------------------------------------------------------
-- 3) Create — 9th arg p_return_type (default change_item). Drop 8-arg overload.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_client_order_return(uuid, date, text, text, text, jsonb, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.create_client_order_return(
  p_client_order_id uuid,
  p_return_date date,
  p_reason text,
  p_notes text,
  p_agent_signature_url text,
  p_items jsonb,
  p_change_items jsonb,
  p_attachments jsonb,
  p_return_type text DEFAULT 'change_item'
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
  v_return_type text;
  v_elem jsonb;
  v_item_id uuid;
  v_qty integer;
  v_sold integer;
  v_posted integer;
  v_variant_id uuid;
  v_brand_id uuid;
  v_variant_type_id uuid;
  v_variant_name text;
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

  v_return_type := COALESCE(NULLIF(btrim(lower(p_return_type)), ''), 'change_item');
  IF v_return_type = 'change' THEN
    v_return_type := 'change_item';
  END IF;
  IF v_return_type NOT IN ('change_item', 'refund') THEN
    RETURN json_build_object('success', false, 'error', 'Return type must be change item or refund');
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

  IF p_agent_signature_url IS NULL OR length(btrim(COALESCE(p_agent_signature_url, ''))) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Signature is required');
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'At least one return line is required');
  END IF;

  IF v_return_type = 'refund' THEN
    IF p_change_items IS NOT NULL
       AND jsonb_typeof(p_change_items) = 'array'
       AND jsonb_array_length(p_change_items) > 0 THEN
      RETURN json_build_object('success', false, 'error', 'Refunds cannot include change items');
    END IF;
  ELSE
    IF p_change_items IS NULL OR jsonb_typeof(p_change_items) <> 'array' OR jsonb_array_length(p_change_items) = 0 THEN
      RETURN json_build_object('success', false, 'error', 'Change items are required');
    END IF;
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
    brand_id uuid NOT NULL,
    variant_type_id uuid,
    variant_name text NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(10,2) NOT NULL,
    line_total numeric(10,2) NOT NULL
  ) ON COMMIT DROP;
  CREATE TEMP TABLE _cr_chg (
    variant_id uuid PRIMARY KEY,
    brand_id uuid NOT NULL,
    variant_type_id uuid,
    variant_name text NOT NULL,
    quantity integer NOT NULL
  ) ON COMMIT DROP;

  FOR v_elem IN SELECT t.elem FROM jsonb_array_elements(p_items) AS t(elem)
  LOOP
    v_item_id := NULLIF(v_elem->>'client_order_item_id', '')::uuid;
    v_qty := COALESCE((v_elem->>'quantity')::integer, 0);
    IF v_item_id IS NULL OR v_qty <= 0 THEN
      RETURN json_build_object('success', false, 'error', 'Each return line needs a sold item and qty > 0');
    END IF;

    SELECT coi.quantity, coi.variant_id, coi.unit_price, v.brand_id, v.variant_type_id, v.name
    INTO v_sold, v_variant_id, v_unit_price, v_brand_id, v_variant_type_id, v_variant_name
    FROM public.client_order_items coi
    JOIN public.variants v ON v.id = coi.variant_id
    WHERE coi.id = v_item_id
      AND coi.client_order_id = p_client_order_id
      AND coi.company_id = v_company_id;

    IF v_sold IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Return line is not on this order');
    END IF;

    IF v_brand_id IS NULL THEN
      RETURN json_build_object('success', false, 'error', format('Variant %s is missing a brand', COALESCE(v_variant_name, 'item')));
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
      client_order_item_id, variant_id, brand_id, variant_type_id, variant_name, quantity, unit_price, line_total
    ) VALUES (
      v_item_id, v_variant_id, v_brand_id, v_variant_type_id, v_variant_name, v_qty, COALESCE(v_unit_price, 0),
      round(COALESCE(v_unit_price, 0) * v_qty, 2)
    );
  END LOOP;

  IF v_return_type = 'change_item' THEN
    FOR v_elem IN SELECT t.elem FROM jsonb_array_elements(p_change_items) AS t(elem)
    LOOP
      v_variant_id := NULLIF(v_elem->>'variant_id', '')::uuid;
      v_qty := COALESCE((v_elem->>'quantity')::integer, 0);
      IF v_variant_id IS NULL OR v_qty <= 0 THEN
        RETURN json_build_object('success', false, 'error', 'Each change line needs a variant and qty > 0');
      END IF;

      SELECT v.brand_id, v.variant_type_id, v.name
      INTO v_brand_id, v_variant_type_id, v_variant_name
      FROM public.variants v
      WHERE v.id = v_variant_id;

      IF v_variant_name IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Change item variant not found');
      END IF;

      IF v_brand_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', format('Change item %s is missing a brand', v_variant_name));
      END IF;

      IF NOT EXISTS (SELECT 1 FROM _cr_ret r WHERE r.brand_id = v_brand_id) THEN
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

      INSERT INTO _cr_chg (variant_id, brand_id, variant_type_id, variant_name, quantity)
      VALUES (v_variant_id, v_brand_id, v_variant_type_id, v_variant_name, v_qty);
    END LOOP;

    IF EXISTS (
      SELECT 1
      FROM (
        SELECT brand_id, SUM(quantity) AS qty FROM _cr_ret GROUP BY brand_id
      ) r
      FULL OUTER JOIN (
        SELECT brand_id, SUM(quantity) AS qty FROM _cr_chg GROUP BY brand_id
      ) c ON c.brand_id = r.brand_id
      WHERE COALESCE(r.qty, 0) IS DISTINCT FROM COALESCE(c.qty, 0)
    ) THEN
      RETURN json_build_object('success', false, 'error', 'Change qty must match returned qty per brand');
    END IF;
  END IF;

  FOR v_elem IN SELECT t.elem FROM jsonb_array_elements(p_attachments) AS t(elem)
  LOOP
    IF NULLIF(btrim(COALESCE(v_elem->>'file_url', '')), '') IS NULL
       OR NULLIF(btrim(COALESCE(v_elem->>'file_path', '')), '') IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Each proof photo needs file_url and file_path');
    END IF;
  END LOOP;

  IF v_return_type = 'refund' THEN
    v_status := 'pending_super_admin';
  ELSE
    v_status := CASE WHEN v_role = 'team_leader' THEN 'posted' ELSE 'pending_leader' END;
  END IF;
  v_return_number := public.generate_client_order_return_number(v_company_id);

  INSERT INTO public.client_order_returns (
    return_number, company_id, client_order_id, order_number,
    client_id, client_name, returned_by, returned_by_name, original_agent_id,
    return_date, reason, notes, status, return_type, agent_signature_url,
    approved_at, approved_by, approved_by_name
  ) VALUES (
    v_return_number, v_company_id, v_order.id, v_order.order_number,
    v_order.client_id, COALESCE(v_client_name, 'Client'), v_user, v_returner_name, v_order.agent_id,
    p_return_date, btrim(p_reason), NULLIF(btrim(COALESCE(p_notes, '')), ''), v_status,
    v_return_type, btrim(p_agent_signature_url),
    CASE WHEN v_status = 'posted' THEN now() ELSE NULL END,
    CASE WHEN v_status = 'posted' THEN v_user ELSE NULL END,
    CASE WHEN v_status = 'posted' THEN v_returner_name ELSE NULL END
  )
  RETURNING id INTO v_return_id;

  INSERT INTO public.client_order_return_items (
    return_id, company_id, client_order_item_id, variant_id,
    brand_id, variant_type_id, quantity, unit_price, line_total
  )
  SELECT v_return_id, v_company_id, client_order_item_id, variant_id,
         brand_id, variant_type_id, quantity, unit_price, line_total
  FROM _cr_ret;

  INSERT INTO public.client_order_return_change_items (
    return_id, company_id, variant_id, brand_id, variant_type_id, quantity
  )
  SELECT v_return_id, v_company_id, variant_id, brand_id, variant_type_id, quantity
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

-- ---------------------------------------------------------------------------
-- 4) Approve / reject by type + waiting actor
-- Change item: TL of the team, pending_leader → posted + stock.
-- Refund: SA pending_super_admin → pending_finance (no stock). sa_approved_* on SA step.
-- Refund: Finance pending_finance → posted + stock. approved_* on final post.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_client_order_return(p_return_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid;
  v_company_id uuid;
  v_role text;
  v_name text;
  v_header public.client_order_returns%ROWTYPE;
  v_return_type text;
  v_next_status text;
BEGIN
  v_user := auth.uid();
  v_company_id := public.get_auth_company_id();

  IF v_user IS NULL OR v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT role, full_name INTO v_role, v_name
  FROM public.profiles
  WHERE id = v_user AND company_id = v_company_id;

  IF v_role IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Profile not found');
  END IF;

  SELECT * INTO v_header
  FROM public.client_order_returns
  WHERE id = p_return_id
    AND company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Return not found');
  END IF;

  v_return_type := COALESCE(v_header.return_type, 'change_item');

  IF v_return_type = 'change_item' THEN
    IF v_role IS DISTINCT FROM 'team_leader' THEN
      RETURN json_build_object('success', false, 'error', 'Only a team leader can approve a change-item return');
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

    v_next_status := 'posted';
  ELSIF v_return_type = 'refund' THEN
    IF v_header.status = 'pending_super_admin' THEN
      IF v_role IS DISTINCT FROM 'super_admin' THEN
        RETURN json_build_object('success', false, 'error', 'Only a super admin can send a refund to finance');
      END IF;
      v_next_status := 'pending_finance';
    ELSIF v_header.status = 'pending_finance' THEN
      IF v_role IS DISTINCT FROM 'finance' THEN
        RETURN json_build_object('success', false, 'error', 'Only finance can post a refund');
      END IF;
      v_next_status := 'posted';
    ELSE
      RETURN json_build_object('success', false, 'error', 'This refund cannot be approved');
    END IF;
  ELSE
    RETURN json_build_object('success', false, 'error', 'Unknown return type');
  END IF;

  UPDATE public.client_order_returns
  SET status = v_next_status,
      sa_approved_at = CASE
        WHEN v_return_type = 'refund' AND v_header.status = 'pending_super_admin' THEN now()
        ELSE sa_approved_at
      END,
      sa_approved_by = CASE
        WHEN v_return_type = 'refund' AND v_header.status = 'pending_super_admin' THEN v_user
        ELSE sa_approved_by
      END,
      sa_approved_by_name = CASE
        WHEN v_return_type = 'refund' AND v_header.status = 'pending_super_admin' THEN v_name
        ELSE sa_approved_by_name
      END,
      approved_at = CASE WHEN v_next_status = 'posted' THEN now() ELSE approved_at END,
      approved_by = CASE WHEN v_next_status = 'posted' THEN v_user ELSE approved_by END,
      approved_by_name = CASE WHEN v_next_status = 'posted' THEN v_name ELSE approved_by_name END,
      rejected_at = NULL,
      rejected_by = NULL,
      rejected_by_name = NULL,
      rejection_note = NULL
  WHERE id = p_return_id;

  IF v_next_status = 'posted' THEN
    PERFORM public.apply_client_order_return_posted_stock(p_return_id, v_user);
  END IF;

  RETURN json_build_object('success', true, 'id', p_return_id, 'status', v_next_status);
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
  v_role text;
  v_name text;
  v_header public.client_order_returns%ROWTYPE;
  v_return_type text;
BEGIN
  v_user := auth.uid();
  v_company_id := public.get_auth_company_id();

  IF v_user IS NULL OR v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT role, full_name INTO v_role, v_name
  FROM public.profiles
  WHERE id = v_user AND company_id = v_company_id;

  IF v_role IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Profile not found');
  END IF;

  SELECT * INTO v_header
  FROM public.client_order_returns
  WHERE id = p_return_id
    AND company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Return not found');
  END IF;

  v_return_type := COALESCE(v_header.return_type, 'change_item');

  IF v_return_type = 'change_item' THEN
    IF v_role IS DISTINCT FROM 'team_leader' THEN
      RETURN json_build_object('success', false, 'error', 'Only a team leader can reject a change-item return');
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
  ELSIF v_return_type = 'refund' THEN
    IF v_header.status = 'pending_super_admin' THEN
      IF v_role IS DISTINCT FROM 'super_admin' THEN
        RETURN json_build_object('success', false, 'error', 'Only a super admin can reject this refund');
      END IF;
    ELSIF v_header.status = 'pending_finance' THEN
      IF v_role IS DISTINCT FROM 'finance' THEN
        RETURN json_build_object('success', false, 'error', 'Only finance can reject this refund');
      END IF;
    ELSE
      RETURN json_build_object('success', false, 'error', 'This refund cannot be rejected');
    END IF;
  ELSE
    RETURN json_build_object('success', false, 'error', 'Unknown return type');
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

GRANT EXECUTE ON FUNCTION public.create_client_order_return(uuid, date, text, text, text, jsonb, jsonb, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_client_order_return(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_client_order_return(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_select_client_order_return(uuid, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.create_client_order_return(uuid, date, text, text, text, jsonb, jsonb, jsonb, text) IS
  'File a client return. p_return_type change_item (default) or refund. Refunds skip change items and always wait for Super Admin.';
COMMENT ON FUNCTION public.approve_client_order_return(uuid) IS
  'Change item: TL posts. Refund: SA sends to finance (sa_approved_*), then finance posts (approved_*) and applies returned stock.';
COMMENT ON FUNCTION public.reject_client_order_return(uuid, text) IS
  'Change item: TL of the team. Refund: Super Admin while pending SA, finance while pending finance.';
