-- Return to Leader (RL-{INITIALS}-{YYYYMM}-000001)
-- Hand returned CR stock from mobile sales / TL to TL custody.
-- Uses client_return_stock_holds ledger (not agent_inventory.returned_stock for RL).

-- ---------------------------------------------------------------------------
-- 1) Stock holds ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_return_stock_holds (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  holder_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.variants(id) ON DELETE RESTRICT,
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  qty_on_hand integer NOT NULL DEFAULT 0 CHECK (qty_on_hand >= 0),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT client_return_stock_holds_holder_variant_key
    UNIQUE (company_id, holder_id, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_client_return_stock_holds_holder
  ON public.client_return_stock_holds (company_id, holder_id);

DROP TRIGGER IF EXISTS update_client_return_stock_holds_updated_at
  ON public.client_return_stock_holds;
CREATE TRIGGER update_client_return_stock_holds_updated_at
  BEFORE UPDATE ON public.client_return_stock_holds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.client_return_stock_holds IS
  'Non-sellable client-return stock held by mobile sales or team leader.';

-- ---------------------------------------------------------------------------
-- 2) RL tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.return_leader_number_counters (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  year_month text NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, year_month)
);

CREATE TABLE IF NOT EXISTS public.return_leader_handovers (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  return_number text NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  submitted_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  submitted_by_name text,
  initiator_role text NOT NULL CHECK (initiator_role IN ('mobile_sales', 'sales_agent', 'team_leader')),
  from_holder_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  to_holder_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending_leader'
    CHECK (status IN ('pending_leader', 'pending_super_admin', 'received', 'rejected', 'cancelled')),
  notes text,
  approved_at timestamptz,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by_name text,
  rejected_at timestamptz,
  rejected_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  rejected_by_name text,
  rejection_note text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT return_leader_handovers_company_number_key UNIQUE (company_id, return_number)
);

CREATE INDEX IF NOT EXISTS idx_return_leader_handovers_company_status
  ON public.return_leader_handovers (company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_return_leader_handovers_from_holder
  ON public.return_leader_handovers (from_holder_id, status);
CREATE INDEX IF NOT EXISTS idx_return_leader_handovers_to_holder
  ON public.return_leader_handovers (to_holder_id, status);

DROP TRIGGER IF EXISTS update_return_leader_handovers_updated_at
  ON public.return_leader_handovers;
CREATE TRIGGER update_return_leader_handovers_updated_at
  BEFORE UPDATE ON public.return_leader_handovers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.return_leader_handover_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  handover_id uuid NOT NULL REFERENCES public.return_leader_handovers(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.variants(id) ON DELETE RESTRICT,
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  variant_type_id uuid REFERENCES public.variant_types(id) ON DELETE SET NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT return_leader_handover_items_handover_variant_key
    UNIQUE (handover_id, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_return_leader_handover_items_handover
  ON public.return_leader_handover_items (handover_id);

CREATE TABLE IF NOT EXISTS public.return_leader_handover_attachments (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  handover_id uuid NOT NULL REFERENCES public.return_leader_handovers(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_return_leader_handover_attachments_handover
  ON public.return_leader_handover_attachments (handover_id);

-- ---------------------------------------------------------------------------
-- 3) Hold helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_client_return_stock_hold(
  p_company_id uuid,
  p_holder_id uuid,
  p_variant_id uuid,
  p_brand_id uuid,
  p_qty integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.client_return_stock_holds (
    company_id, holder_id, variant_id, brand_id, qty_on_hand
  ) VALUES (
    p_company_id, p_holder_id, p_variant_id, p_brand_id, p_qty
  )
  ON CONFLICT (company_id, holder_id, variant_id)
  DO UPDATE SET
    qty_on_hand = public.client_return_stock_holds.qty_on_hand + EXCLUDED.qty_on_hand,
    brand_id = COALESCE(EXCLUDED.brand_id, public.client_return_stock_holds.brand_id),
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_client_return_stock_hold(
  p_company_id uuid,
  p_from_holder uuid,
  p_to_holder uuid,
  p_variant_id uuid,
  p_brand_id uuid,
  p_qty integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_from_qty integer;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Transfer quantity must be positive';
  END IF;

  SELECT qty_on_hand INTO v_from_qty
  FROM public.client_return_stock_holds
  WHERE company_id = p_company_id
    AND holder_id = p_from_holder
    AND variant_id = p_variant_id
  FOR UPDATE;

  IF COALESCE(v_from_qty, 0) < p_qty THEN
    RAISE EXCEPTION 'Insufficient returned stock on hand';
  END IF;

  UPDATE public.client_return_stock_holds
  SET qty_on_hand = qty_on_hand - p_qty,
      updated_at = now()
  WHERE company_id = p_company_id
    AND holder_id = p_from_holder
    AND variant_id = p_variant_id;

  PERFORM public.add_client_return_stock_hold(
    p_company_id, p_to_holder, p_variant_id, p_brand_id, p_qty
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_client_return_available_qty(
  p_company_id uuid,
  p_holder_id uuid,
  p_variant_id uuid
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT GREATEST(
    COALESCE((
      SELECT h.qty_on_hand
      FROM public.client_return_stock_holds h
      WHERE h.company_id = p_company_id
        AND h.holder_id = p_holder_id
        AND h.variant_id = p_variant_id
    ), 0)
    - COALESCE((
      SELECT SUM(i.quantity)
      FROM public.return_leader_handover_items i
      JOIN public.return_leader_handovers hr ON hr.id = i.handover_id
      WHERE hr.company_id = p_company_id
        AND hr.from_holder_id = p_holder_id
        AND i.variant_id = p_variant_id
        AND hr.status IN ('pending_leader', 'pending_super_admin')
    ), 0),
    0
  );
$$;

CREATE OR REPLACE FUNCTION public.backfill_client_return_stock_holds(p_company_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.client_return_stock_holds (company_id, holder_id, variant_id, brand_id, qty_on_hand)
  SELECT
    cr.company_id,
    COALESCE(cr.original_agent_id, cr.returned_by) AS holder_id,
    i.variant_id,
    i.brand_id,
    SUM(i.quantity)::integer AS qty
  FROM public.client_order_returns cr
  JOIN public.client_order_return_items i ON i.return_id = cr.id
  WHERE cr.status = 'posted'
    AND COALESCE(cr.original_agent_id, cr.returned_by) IS NOT NULL
    AND (p_company_id IS NULL OR cr.company_id = p_company_id)
  GROUP BY cr.company_id, COALESCE(cr.original_agent_id, cr.returned_by), i.variant_id, i.brand_id
  ON CONFLICT (company_id, holder_id, variant_id)
  DO UPDATE SET
    qty_on_hand = EXCLUDED.qty_on_hand,
    brand_id = COALESCE(EXCLUDED.brand_id, public.client_return_stock_holds.brand_id),
    updated_at = now();
END;
$$;

-- Patch CR post to also update holds ledger
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
    SELECT variant_id, brand_id, SUM(quantity) AS qty
    FROM public.client_order_return_items
    WHERE return_id = p_return_id
    GROUP BY variant_id, brand_id
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
      PERFORM public.add_client_return_stock_hold(
        v_header.company_id,
        v_holder,
        v_line.variant_id,
        v_line.brand_id,
        v_line.qty
      );

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

SELECT public.backfill_client_return_stock_holds(NULL);

-- ---------------------------------------------------------------------------
-- 4) Number generator
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_return_leader_number(p_company_id uuid)
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
  SELECT company_name INTO v_company_name
  FROM public.companies
  WHERE id = p_company_id;

  IF v_company_name IS NULL THEN
    RAISE EXCEPTION 'Company not found';
  END IF;

  v_initials := upper(btrim(public.get_unique_company_initials(p_company_id, v_company_name)));
  v_year_month := to_char((now() AT TIME ZONE 'Asia/Manila'), 'YYYYMM');

  INSERT INTO public.return_leader_number_counters (company_id, year_month, last_number)
  VALUES (p_company_id, v_year_month, 1)
  ON CONFLICT (company_id, year_month)
  DO UPDATE SET last_number = public.return_leader_number_counters.last_number + 1
  RETURNING last_number INTO v_next;

  RETURN 'RL-' || v_initials || '-' || v_year_month || '-' || lpad(v_next::text, 6, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.get_team_leader_for_agent(
  p_company_id uuid,
  p_agent_id uuid
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT lt.leader_id
  FROM public.leader_teams lt
  WHERE lt.company_id = p_company_id
    AND lt.agent_id = p_agent_id
  ORDER BY lt.created_at NULLS LAST
  LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- 5) Access helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_select_return_leader_handover(
  p_company_id uuid,
  p_submitted_by uuid,
  p_from_holder_id uuid,
  p_to_holder_id uuid
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
            OR p.id IN (p_submitted_by, p_from_holder_id, p_to_holder_id)
            OR (
              p.role = 'team_leader'
              AND EXISTS (
                SELECT 1
                FROM public.leader_teams lt
                WHERE lt.leader_id = p.id
                  AND lt.company_id = p_company_id
                  AND lt.agent_id IN (p_submitted_by, p_from_holder_id)
              )
            )
          )
      )
    );
$$;

-- ---------------------------------------------------------------------------
-- 6) RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_return_leader_handover(
  p_items jsonb,
  p_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid;
  v_role text;
  v_name text;
  v_company_id uuid;
  v_handover_id uuid;
  v_return_number text;
  v_status text;
  v_from_holder uuid;
  v_to_holder uuid;
  v_elem jsonb;
  v_variant_id uuid;
  v_brand_id uuid;
  v_variant_type_id uuid;
  v_qty integer;
  v_available integer;
  v_leader uuid;
BEGIN
  v_user := auth.uid();
  v_company_id := public.get_auth_company_id();

  IF v_user IS NULL OR v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF public.get_linked_warehouse_company_id() IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Company is not linked to a warehouse');
  END IF;

  SELECT role, full_name INTO v_role, v_name
  FROM public.profiles
  WHERE id = v_user AND company_id = v_company_id;

  IF v_role NOT IN ('mobile_sales', 'sales_agent', 'team_leader') THEN
    RETURN json_build_object('success', false, 'error', 'Only mobile sales or team leader can submit a return to leader');
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Select at least one item');
  END IF;

  v_from_holder := v_user;

  IF v_role = 'team_leader' THEN
    v_to_holder := v_user;
    v_status := 'pending_super_admin';
  ELSE
    v_leader := public.get_team_leader_for_agent(v_company_id, v_user);
    IF v_leader IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'No team leader assigned');
    END IF;
    v_to_holder := v_leader;
    v_status := 'pending_leader';
  END IF;

  v_return_number := public.generate_return_leader_number(v_company_id);

  INSERT INTO public.return_leader_handovers (
    return_number, company_id, submitted_by, submitted_by_name, initiator_role,
    from_holder_id, to_holder_id, status, notes
  ) VALUES (
    v_return_number, v_company_id, v_user, v_name, v_role,
    v_from_holder, v_to_holder, v_status, NULLIF(btrim(COALESCE(p_notes, '')), '')
  )
  RETURNING id INTO v_handover_id;

  FOR v_elem IN SELECT t.elem FROM jsonb_array_elements(p_items) AS t(elem)
  LOOP
    v_variant_id := NULLIF(v_elem->>'variant_id', '')::uuid;
    v_brand_id := NULLIF(v_elem->>'brand_id', '')::uuid;
    v_variant_type_id := NULLIF(v_elem->>'variant_type_id', '')::uuid;
    v_qty := COALESCE((v_elem->>'quantity')::integer, 0);

    IF v_variant_id IS NULL OR v_qty <= 0 THEN
      RETURN json_build_object('success', false, 'error', 'Each item needs variant_id and positive quantity');
    END IF;

    v_available := public.get_client_return_available_qty(v_company_id, v_from_holder, v_variant_id);
    IF v_qty > v_available THEN
      RETURN json_build_object(
        'success', false,
        'error',
        'Quantity exceeds available returned stock for one or more items'
      );
    END IF;

    INSERT INTO public.return_leader_handover_items (
      handover_id, company_id, variant_id, brand_id, variant_type_id, quantity
    ) VALUES (
      v_handover_id, v_company_id, v_variant_id, v_brand_id, v_variant_type_id, v_qty
    );
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'id', v_handover_id,
    'return_number', v_return_number,
    'status', v_status
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('success', false, 'error', 'Duplicate variant in return');
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_return_leader_handover(
  p_handover_id uuid,
  p_attachments jsonb
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
  v_role text;
  v_header public.return_leader_handovers%ROWTYPE;
  v_line RECORD;
  v_elem jsonb;
  v_file_url text;
  v_file_path text;
  v_source text;
BEGIN
  v_user := auth.uid();
  v_company_id := public.get_auth_company_id();

  IF v_user IS NULL OR v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT role, full_name INTO v_role, v_name
  FROM public.profiles
  WHERE id = v_user AND company_id = v_company_id;

  SELECT * INTO v_header
  FROM public.return_leader_handovers
  WHERE id = p_handover_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Return to leader not found');
  END IF;

  v_company_id := v_header.company_id;

  IF p_attachments IS NULL OR jsonb_array_length(p_attachments) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Upload at least one proof photo');
  END IF;

  IF v_header.status = 'pending_leader' THEN
    IF v_role <> 'team_leader' THEN
      RETURN json_build_object('success', false, 'error', 'Only a team leader can approve this return');
    END IF;
    IF v_user <> v_header.to_holder_id THEN
      RETURN json_build_object('success', false, 'error', 'You are not the receiving team leader');
    END IF;
    IF NOT public.is_client_order_return_team_leader_of(v_header.from_holder_id) THEN
      RETURN json_build_object('success', false, 'error', 'You can only approve returns from your team');
    END IF;
  ELSIF v_header.status = 'pending_super_admin' THEN
    IF NOT public.is_super_admin() THEN
      RETURN json_build_object('success', false, 'error', 'Only super admin can confirm this return');
    END IF;
  ELSE
    RETURN json_build_object('success', false, 'error', 'Only pending returns can be approved');
  END IF;

  FOR v_line IN
    SELECT variant_id, brand_id, quantity
    FROM public.return_leader_handover_items
    WHERE handover_id = p_handover_id
  LOOP
    IF v_header.from_holder_id IS DISTINCT FROM v_header.to_holder_id THEN
      PERFORM public.transfer_client_return_stock_hold(
        v_company_id,
        v_header.from_holder_id,
        v_header.to_holder_id,
        v_line.variant_id,
        v_line.brand_id,
        v_line.quantity
      );
    END IF;
  END LOOP;

  UPDATE public.return_leader_handovers
  SET status = 'received',
      approved_at = now(),
      approved_by = v_user,
      approved_by_name = v_name,
      rejected_at = NULL,
      rejected_by = NULL,
      rejected_by_name = NULL,
      rejection_note = NULL
  WHERE id = p_handover_id;

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

    INSERT INTO public.return_leader_handover_attachments (
      handover_id, company_id, file_url, file_path, file_name, content_type, source, sort_order, uploaded_by
    ) VALUES (
      p_handover_id,
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

  RETURN json_build_object('success', true, 'id', p_handover_id, 'status', 'received');
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_return_leader_handover(
  p_handover_id uuid,
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
  v_role text;
  v_header public.return_leader_handovers%ROWTYPE;
BEGIN
  v_user := auth.uid();
  v_company_id := public.get_auth_company_id();

  IF v_user IS NULL OR v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT role, full_name INTO v_role, v_name
  FROM public.profiles
  WHERE id = v_user AND company_id = v_company_id;

  SELECT * INTO v_header
  FROM public.return_leader_handovers
  WHERE id = p_handover_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Return to leader not found');
  END IF;

  v_company_id := v_header.company_id;

  IF v_header.status = 'pending_leader' THEN
    IF v_role <> 'team_leader' OR v_user <> v_header.to_holder_id THEN
      RETURN json_build_object('success', false, 'error', 'Only the receiving team leader can reject');
    END IF;
  ELSIF v_header.status = 'pending_super_admin' THEN
    IF NOT public.is_super_admin() THEN
      RETURN json_build_object('success', false, 'error', 'Only super admin can reject');
    END IF;
  ELSE
    RETURN json_build_object('success', false, 'error', 'Only pending returns can be rejected');
  END IF;

  UPDATE public.return_leader_handovers
  SET status = 'rejected',
      rejected_at = now(),
      rejected_by = v_user,
      rejected_by_name = v_name,
      rejection_note = NULLIF(btrim(COALESCE(p_note, '')), '')
  WHERE id = p_handover_id;

  RETURN json_build_object('success', true, 'id', p_handover_id, 'status', 'rejected');
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_return_leader_handover(jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_return_leader_handover(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_return_leader_handover(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_return_available_qty(uuid, uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7) RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.client_return_stock_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_leader_handovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_leader_handover_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_leader_handover_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_return_stock_holds_select ON public.client_return_stock_holds;
CREATE POLICY client_return_stock_holds_select ON public.client_return_stock_holds
  FOR SELECT TO authenticated
  USING (
    public.is_system_administrator()
    OR (
      company_id = public.get_auth_company_id()
      AND NOT public.is_warehouse()
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.company_id = company_id
          AND (
            p.role IN ('admin', 'super_admin', 'manager', 'executive')
            OR p.id = holder_id
            OR (
              p.role = 'team_leader'
              AND EXISTS (
                SELECT 1 FROM public.leader_teams lt
                WHERE lt.leader_id = p.id
                  AND lt.company_id = company_id
                  AND lt.agent_id = holder_id
              )
            )
          )
      )
    )
  );

DROP POLICY IF EXISTS return_leader_handovers_select ON public.return_leader_handovers;
CREATE POLICY return_leader_handovers_select ON public.return_leader_handovers
  FOR SELECT TO authenticated
  USING (
    public.can_select_return_leader_handover(
      company_id, submitted_by, from_holder_id, to_holder_id
    )
  );

DROP POLICY IF EXISTS return_leader_handover_items_select ON public.return_leader_handover_items;
CREATE POLICY return_leader_handover_items_select ON public.return_leader_handover_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.return_leader_handovers hr
      WHERE hr.id = handover_id
        AND public.can_select_return_leader_handover(
          hr.company_id, hr.submitted_by, hr.from_holder_id, hr.to_holder_id
        )
    )
  );

DROP POLICY IF EXISTS return_leader_handover_attachments_select ON public.return_leader_handover_attachments;
CREATE POLICY return_leader_handover_attachments_select ON public.return_leader_handover_attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.return_leader_handovers hr
      WHERE hr.id = handover_id
        AND public.can_select_return_leader_handover(
          hr.company_id, hr.submitted_by, hr.from_holder_id, hr.to_holder_id
        )
    )
  );
