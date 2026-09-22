-- Company price change batches: SA sets main prices now; TL + Mobile Sales confirm; then cascade to agent bags.
-- Gate: warehouse-linked Standard Account companies only (get_linked_warehouse_company_id()).

-- ---------------------------------------------------------------------------
-- 1) Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.company_price_change_number_counters (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  year_month text NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, year_month)
);

CREATE TABLE IF NOT EXISTS public.company_price_change_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  batch_number text NOT NULL,
  status text NOT NULL DEFAULT 'pending_agreement'
    CHECK (status IN ('pending_agreement', 'applied', 'rejected', 'cancelled')),
  note text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  main_applied_at timestamptz,
  agents_applied_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by_name text,
  rejected_at timestamptz,
  rejection_note text,
  rejected_by_name text,
  UNIQUE (company_id, batch_number)
);

CREATE INDEX IF NOT EXISTS idx_cpcb_company_status
  ON public.company_price_change_batches(company_id, status);
CREATE INDEX IF NOT EXISTS idx_cpcb_company_created
  ON public.company_price_change_batches(company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.company_price_change_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.company_price_change_batches(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  brand_id uuid,
  brand_name text NOT NULL,
  variant_id uuid NOT NULL,
  variant_name text NOT NULL,
  variant_type text NOT NULL,
  old_selling_price numeric(12,2) NOT NULL DEFAULT 0,
  new_selling_price numeric(12,2) NOT NULL DEFAULT 0,
  old_dsp_price numeric(12,2) NOT NULL DEFAULT 0,
  new_dsp_price numeric(12,2) NOT NULL DEFAULT 0,
  old_rsp_price numeric(12,2) NOT NULL DEFAULT 0,
  new_rsp_price numeric(12,2) NOT NULL DEFAULT 0,
  agent_rows_updated integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cpci_batch ON public.company_price_change_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_cpci_company_variant
  ON public.company_price_change_items(company_id, variant_id);

CREATE TABLE IF NOT EXISTS public.company_price_change_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.company_price_change_batches(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  profile_name text NOT NULL,
  profile_role text NOT NULL CHECK (profile_role IN ('team_leader', 'mobile_sales')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'revoked')),
  confirmed_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_cpca_batch_status
  ON public.company_price_change_agreements(batch_id, status);
CREATE INDEX IF NOT EXISTS idx_cpca_profile_pending
  ON public.company_price_change_agreements(profile_id, status)
  WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- 2) RLS — company members SELECT; writes via SECURITY DEFINER RPCs only
-- ---------------------------------------------------------------------------

ALTER TABLE public.company_price_change_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_price_change_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_price_change_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_price_change_number_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cpcb_select_company ON public.company_price_change_batches;
CREATE POLICY cpcb_select_company ON public.company_price_change_batches
  FOR SELECT TO authenticated
  USING (
    public.is_system_administrator()
    OR company_id = public.get_auth_company_id()
  );

DROP POLICY IF EXISTS cpci_select_company ON public.company_price_change_items;
CREATE POLICY cpci_select_company ON public.company_price_change_items
  FOR SELECT TO authenticated
  USING (
    public.is_system_administrator()
    OR company_id = public.get_auth_company_id()
  );

DROP POLICY IF EXISTS cpca_select_company ON public.company_price_change_agreements;
CREATE POLICY cpca_select_company ON public.company_price_change_agreements
  FOR SELECT TO authenticated
  USING (
    public.is_system_administrator()
    OR company_id = public.get_auth_company_id()
  );

-- Counters: no direct client access
DROP POLICY IF EXISTS cpcnc_deny_all ON public.company_price_change_number_counters;
CREATE POLICY cpcnc_deny_all ON public.company_price_change_number_counters
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

GRANT SELECT ON public.company_price_change_batches TO authenticated;
GRANT SELECT ON public.company_price_change_items TO authenticated;
GRANT SELECT ON public.company_price_change_agreements TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Numbering: PCB-{INITIALS}-{YYYYMM}-######
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.generate_company_price_change_number(p_company_id uuid)
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

  INSERT INTO public.company_price_change_number_counters (company_id, year_month, last_number)
  VALUES (p_company_id, v_year_month, 1)
  ON CONFLICT (company_id, year_month)
  DO UPDATE SET last_number = public.company_price_change_number_counters.last_number + 1
  RETURNING last_number INTO v_next;

  RETURN 'PCB-' || v_initials || '-' || v_year_month || '-' || lpad(v_next::text, 6, '0');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_company_price_change_number(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._cpc_require_warehouse_link()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_wh uuid;
BEGIN
  v_wh := public.get_linked_warehouse_company_id();
  IF v_wh IS NULL THEN
    RAISE EXCEPTION 'Only warehouse-linked companies can push company prices';
  END IF;
  RETURN v_wh;
END;
$$;

CREATE OR REPLACE FUNCTION public._cpc_sync_agreements(p_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company_id uuid;
  v_status text;
  r record;
BEGIN
  SELECT company_id, status INTO v_company_id, v_status
  FROM public.company_price_change_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF v_company_id IS NULL OR v_status IS DISTINCT FROM 'pending_agreement' THEN
    RETURN;
  END IF;

  -- Revoke agreements for inactive / wrong-role profiles
  UPDATE public.company_price_change_agreements a
  SET status = 'revoked'
  FROM public.profiles p
  WHERE a.batch_id = p_batch_id
    AND a.profile_id = p.id
    AND a.status = 'pending'
    AND (
      p.status IS DISTINCT FROM 'active'
      OR p.role NOT IN ('team_leader', 'mobile_sales')
      OR p.company_id IS DISTINCT FROM v_company_id
    );

  -- Add new active TL / MS
  FOR r IN
    SELECT p.id, coalesce(nullif(btrim(p.full_name), ''), p.email) AS profile_name, p.role
    FROM public.profiles p
    WHERE p.company_id = v_company_id
      AND p.status = 'active'
      AND p.role IN ('team_leader', 'mobile_sales')
      AND NOT EXISTS (
        SELECT 1 FROM public.company_price_change_agreements a
        WHERE a.batch_id = p_batch_id AND a.profile_id = p.id
      )
  LOOP
    INSERT INTO public.company_price_change_agreements (
      batch_id, company_id, profile_id, profile_name, profile_role, status
    ) VALUES (
      p_batch_id, v_company_id, r.id, r.profile_name, r.role, 'pending'
    );

    INSERT INTO public.notifications (
      company_id, user_id, notification_type, title, message, reference_type, reference_id
    ) VALUES (
      v_company_id,
      r.id,
      'system_message',
      'Price change needs your confirmation',
      'Review and confirm the new Selling / DSP / RSP before bags update.',
      'company_price_change_batch',
      p_batch_id
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_company_price_change_to_agents(p_batch_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_batch record;
  v_item record;
  v_updated integer;
  v_total integer := 0;
BEGIN
  SELECT * INTO v_batch
  FROM public.company_price_change_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Batch not found');
  END IF;

  IF v_batch.status = 'applied' AND v_batch.agents_applied_at IS NOT NULL THEN
    RETURN json_build_object('success', true, 'already_applied', true, 'batch_id', p_batch_id);
  END IF;

  IF v_batch.status IS DISTINCT FROM 'pending_agreement' THEN
    RETURN json_build_object('success', false, 'error', 'Batch is not pending agreement');
  END IF;

  IF public.get_linked_warehouse_company_id() IS NULL
     AND v_batch.company_id IS DISTINCT FROM public.get_auth_company_id() THEN
    -- allow internal call from create when auth context is SA of that company
    NULL;
  END IF;

  IF public.get_linked_warehouse_company_id() IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Only warehouse-linked companies can push company prices');
  END IF;

  FOR v_item IN
    SELECT * FROM public.company_price_change_items WHERE batch_id = p_batch_id
  LOOP
    UPDATE public.agent_inventory ai
    SET
      allocated_price = v_item.new_selling_price,
      dsp_price = v_item.new_dsp_price,
      rsp_price = v_item.new_rsp_price,
      updated_at = now()
    WHERE ai.company_id = v_item.company_id
      AND ai.variant_id = v_item.variant_id;

    GET DIAGNOSTICS v_updated = ROW_COUNT;

    UPDATE public.company_price_change_items
    SET agent_rows_updated = v_updated
    WHERE id = v_item.id;

    v_total := v_total + v_updated;
  END LOOP;

  UPDATE public.company_price_change_batches
  SET
    status = 'applied',
    agents_applied_at = now()
  WHERE id = p_batch_id;

  RETURN json_build_object(
    'success', true,
    'batch_id', p_batch_id,
    'agent_rows_updated', v_total
  );
END;
$$;

CREATE OR REPLACE FUNCTION public._cpc_try_apply_if_all_confirmed(p_batch_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pending integer;
  v_confirmed integer;
BEGIN
  PERFORM public._cpc_sync_agreements(p_batch_id);

  SELECT
    count(*) FILTER (WHERE status = 'pending'),
    count(*) FILTER (WHERE status = 'confirmed')
  INTO v_pending, v_confirmed
  FROM public.company_price_change_agreements
  WHERE batch_id = p_batch_id
    AND status IN ('pending', 'confirmed');

  IF v_pending > 0 THEN
    RETURN json_build_object(
      'success', true,
      'applied', false,
      'pending', v_pending,
      'confirmed', v_confirmed
    );
  END IF;

  -- Zero remaining agreements (none ever, or all revoked) OR all confirmed → apply
  RETURN public.apply_company_price_change_to_agents(p_batch_id);
END;
$$;

CREATE OR REPLACE FUNCTION public._cpc_revert_main(p_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_item record;
BEGIN
  FOR v_item IN
    SELECT * FROM public.company_price_change_items WHERE batch_id = p_batch_id
  LOOP
    UPDATE public.main_inventory mi
    SET
      selling_price = v_item.old_selling_price,
      dsp_price = v_item.old_dsp_price,
      rsp_price = v_item.old_rsp_price,
      updated_at = now()
    WHERE mi.company_id = v_item.company_id
      AND mi.variant_id = v_item.variant_id;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5) create_company_price_change_batch
-- p_items: [{ variant_id, new_selling_price, new_dsp_price, new_rsp_price }, ...]
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_company_price_change_batch(
  p_items jsonb,
  p_note text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_company_id uuid;
  v_creator_name text;
  v_batch_id uuid;
  v_batch_number text;
  v_elem jsonb;
  v_variant_id uuid;
  v_new_selling numeric;
  v_new_dsp numeric;
  v_new_rsp numeric;
  v_old_selling numeric;
  v_old_dsp numeric;
  v_old_rsp numeric;
  v_brand_id uuid;
  v_brand_name text;
  v_variant_name text;
  v_variant_type text;
  v_item_count integer := 0;
  v_agreement_count integer := 0;
  v_pending jsonb := '[]'::jsonb;
  r record;
  v_apply json;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT role, company_id, coalesce(nullif(btrim(full_name), ''), email)
  INTO v_role, v_company_id, v_creator_name
  FROM public.profiles
  WHERE id = v_uid;

  IF v_role NOT IN ('super_admin', 'admin') THEN
    RETURN json_build_object('success', false, 'error', 'Only Super Admin or Admin can create price change batches');
  END IF;

  IF v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Missing company');
  END IF;

  BEGIN
    PERFORM public._cpc_require_warehouse_link();
  EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
  END;

  IF p_items IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'At least one price item is required');
  END IF;

  -- Validate + collect changed rows into jsonb (avoid temp-table DELETE; blocked by safeupdate)
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    BEGIN
      v_variant_id := (v_elem->>'variant_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RETURN json_build_object('success', false, 'error', 'Invalid variant_id in items');
    END;

    IF v_variant_id IS NULL THEN
      CONTINUE;
    END IF;

    v_new_selling := coalesce((v_elem->>'new_selling_price')::numeric, 0);
    v_new_dsp := coalesce((v_elem->>'new_dsp_price')::numeric, 0);
    v_new_rsp := coalesce((v_elem->>'new_rsp_price')::numeric, 0);

    IF v_new_selling < 0 OR v_new_dsp < 0 OR v_new_rsp < 0 THEN
      RETURN json_build_object('success', false, 'error', 'Prices cannot be negative');
    END IF;

    SELECT
      mi.selling_price, mi.dsp_price, mi.rsp_price,
      v.name, v.variant_type, v.brand_id, b.name
    INTO
      v_old_selling, v_old_dsp, v_old_rsp,
      v_variant_name, v_variant_type, v_brand_id, v_brand_name
    FROM public.main_inventory mi
    JOIN public.variants v ON v.id = mi.variant_id
    LEFT JOIN public.brands b ON b.id = v.brand_id
    WHERE mi.company_id = v_company_id
      AND mi.variant_id = v_variant_id;

    IF NOT FOUND THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Variant not found in main inventory: ' || v_variant_id::text
      );
    END IF;

    v_old_selling := coalesce(v_old_selling, 0);
    v_old_dsp := coalesce(v_old_dsp, 0);
    v_old_rsp := coalesce(v_old_rsp, 0);

    IF v_old_selling = v_new_selling
       AND v_old_dsp = v_new_dsp
       AND v_old_rsp = v_new_rsp THEN
      CONTINUE;
    END IF;

    -- Replace existing pending entry for same variant_id if duplicate in p_items
    v_pending := coalesce((
      SELECT jsonb_agg(elem)
      FROM jsonb_array_elements(v_pending) elem
      WHERE (elem->>'variant_id')::uuid IS DISTINCT FROM v_variant_id
    ), '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'variant_id', v_variant_id,
      'brand_id', v_brand_id,
      'brand_name', coalesce(v_brand_name, 'Unknown'),
      'variant_name', coalesce(v_variant_name, 'Unknown'),
      'variant_type', coalesce(v_variant_type, 'flavor'),
      'old_selling', v_old_selling,
      'new_selling', v_new_selling,
      'old_dsp', v_old_dsp,
      'new_dsp', v_new_dsp,
      'old_rsp', v_old_rsp,
      'new_rsp', v_new_rsp
    ));
  END LOOP;

  v_item_count := jsonb_array_length(v_pending);
  IF v_item_count = 0 THEN
    RETURN json_build_object('success', false, 'error', 'No price changes detected (all values match current)');
  END IF;

  v_batch_number := public.generate_company_price_change_number(v_company_id);

  INSERT INTO public.company_price_change_batches (
    company_id, batch_number, status, note, created_by, created_by_name, main_applied_at
  ) VALUES (
    v_company_id, v_batch_number, 'pending_agreement', nullif(btrim(p_note), ''),
    v_uid, v_creator_name, now()
  )
  RETURNING id INTO v_batch_id;

  INSERT INTO public.company_price_change_items (
    batch_id, company_id, brand_id, brand_name, variant_id, variant_name, variant_type,
    old_selling_price, new_selling_price,
    old_dsp_price, new_dsp_price,
    old_rsp_price, new_rsp_price
  )
  SELECT
    v_batch_id,
    v_company_id,
    NULLIF(elem->>'brand_id', '')::uuid,
    elem->>'brand_name',
    (elem->>'variant_id')::uuid,
    elem->>'variant_name',
    elem->>'variant_type',
    (elem->>'old_selling')::numeric,
    (elem->>'new_selling')::numeric,
    (elem->>'old_dsp')::numeric,
    (elem->>'new_dsp')::numeric,
    (elem->>'old_rsp')::numeric,
    (elem->>'new_rsp')::numeric
  FROM jsonb_array_elements(v_pending) elem;

  UPDATE public.main_inventory mi
  SET
    selling_price = (elem->>'new_selling')::numeric,
    dsp_price = (elem->>'new_dsp')::numeric,
    rsp_price = (elem->>'new_rsp')::numeric,
    updated_at = now()
  FROM jsonb_array_elements(v_pending) elem
  WHERE mi.company_id = v_company_id
    AND mi.variant_id = (elem->>'variant_id')::uuid;

  -- Agreements for every active TL and Mobile Sales
  FOR r IN
    SELECT p.id, coalesce(nullif(btrim(p.full_name), ''), p.email) AS profile_name, p.role
    FROM public.profiles p
    WHERE p.company_id = v_company_id
      AND p.status = 'active'
      AND p.role IN ('team_leader', 'mobile_sales')
  LOOP
    INSERT INTO public.company_price_change_agreements (
      batch_id, company_id, profile_id, profile_name, profile_role, status
    ) VALUES (
      v_batch_id, v_company_id, r.id, r.profile_name, r.role, 'pending'
    );
    v_agreement_count := v_agreement_count + 1;

    INSERT INTO public.notifications (
      company_id, user_id, notification_type, title, message, reference_type, reference_id
    ) VALUES (
      v_company_id,
      r.id,
      'system_message',
      'Price change needs your confirmation',
      'Batch ' || v_batch_number || ': review and confirm new Selling / DSP / RSP before bags update.',
      'company_price_change_batch',
      v_batch_id
    );
  END LOOP;

  -- Audit trail (single row; humans use flattened history page)
  INSERT INTO public.system_audit_log (
    company_id, table_name, operation, record_id,
    user_id, user_name, user_role,
    new_data, description
  ) VALUES (
    v_company_id,
    'company_price_change_batches',
    'INSERT',
    v_batch_id::text,
    v_uid,
    v_creator_name,
    v_role,
    jsonb_build_object(
      'batch_number', v_batch_number,
      'item_count', v_item_count,
      'agreement_count', v_agreement_count,
      'note', nullif(btrim(p_note), '')
    ),
    'Created company price change batch ' || v_batch_number
  );

  IF v_agreement_count = 0 THEN
    v_apply := public.apply_company_price_change_to_agents(v_batch_id);
    RETURN json_build_object(
      'success', true,
      'batch_id', v_batch_id,
      'batch_number', v_batch_number,
      'item_count', v_item_count,
      'agreement_count', 0,
      'auto_applied', true,
      'apply_result', v_apply
    );
  END IF;

  RETURN json_build_object(
    'success', true,
    'batch_id', v_batch_id,
    'batch_number', v_batch_number,
    'item_count', v_item_count,
    'agreement_count', v_agreement_count,
    'auto_applied', false
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 6) confirm / reject / cancel
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.confirm_company_price_change(p_batch_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_company_id uuid;
  v_batch record;
  v_agreement_id uuid;
  v_result json;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT role, company_id INTO v_role, v_company_id
  FROM public.profiles WHERE id = v_uid;

  IF v_role NOT IN ('team_leader', 'mobile_sales') THEN
    RETURN json_build_object('success', false, 'error', 'Only Team Leaders and Mobile Sales can confirm');
  END IF;

  BEGIN
    PERFORM public._cpc_require_warehouse_link();
  EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
  END;

  SELECT * INTO v_batch
  FROM public.company_price_change_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Batch not found');
  END IF;

  IF v_batch.company_id IS DISTINCT FROM v_company_id THEN
    RETURN json_build_object('success', false, 'error', 'Batch belongs to another company');
  END IF;

  IF v_batch.status IS DISTINCT FROM 'pending_agreement' THEN
    RETURN json_build_object('success', false, 'error', 'Batch is not awaiting agreement');
  END IF;

  SELECT id INTO v_agreement_id
  FROM public.company_price_change_agreements
  WHERE batch_id = p_batch_id
    AND profile_id = v_uid
    AND status = 'pending'
  FOR UPDATE;

  IF v_agreement_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No pending agreement for you on this batch');
  END IF;

  UPDATE public.company_price_change_agreements
  SET status = 'confirmed', confirmed_at = now()
  WHERE id = v_agreement_id;

  v_result := public._cpc_try_apply_if_all_confirmed(p_batch_id);

  RETURN json_build_object(
    'success', true,
    'batch_id', p_batch_id,
    'apply_result', v_result
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_company_price_change(
  p_batch_id uuid,
  p_note text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_company_id uuid;
  v_name text;
  v_batch record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT role, company_id, coalesce(nullif(btrim(full_name), ''), email)
  INTO v_role, v_company_id, v_name
  FROM public.profiles WHERE id = v_uid;

  IF v_role NOT IN ('team_leader', 'mobile_sales') THEN
    RETURN json_build_object('success', false, 'error', 'Only Team Leaders and Mobile Sales can reject');
  END IF;

  BEGIN
    PERFORM public._cpc_require_warehouse_link();
  EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
  END;

  SELECT * INTO v_batch
  FROM public.company_price_change_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND OR v_batch.company_id IS DISTINCT FROM v_company_id THEN
    RETURN json_build_object('success', false, 'error', 'Batch not found');
  END IF;

  IF v_batch.status IS DISTINCT FROM 'pending_agreement' THEN
    RETURN json_build_object('success', false, 'error', 'Batch is not awaiting agreement');
  END IF;

  IF v_batch.agents_applied_at IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'Agents already updated; create a new batch to change prices');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.company_price_change_agreements
    WHERE batch_id = p_batch_id AND profile_id = v_uid AND status = 'pending'
  ) THEN
    RETURN json_build_object('success', false, 'error', 'No pending agreement for you on this batch');
  END IF;

  PERFORM public._cpc_revert_main(p_batch_id);

  UPDATE public.company_price_change_batches
  SET
    status = 'rejected',
    rejected_at = now(),
    rejection_note = nullif(btrim(p_note), ''),
    rejected_by_name = v_name
  WHERE id = p_batch_id;

  INSERT INTO public.system_audit_log (
    company_id, table_name, operation, record_id,
    user_id, user_name, user_role, description
  ) VALUES (
    v_company_id, 'company_price_change_batches', 'UPDATE', p_batch_id::text,
    v_uid, v_name, v_role,
    'Rejected company price change batch ' || v_batch.batch_number
  );

  RETURN json_build_object('success', true, 'batch_id', p_batch_id, 'status', 'rejected');
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_company_price_change(p_batch_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_company_id uuid;
  v_name text;
  v_batch record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT role, company_id, coalesce(nullif(btrim(full_name), ''), email)
  INTO v_role, v_company_id, v_name
  FROM public.profiles WHERE id = v_uid;

  IF v_role NOT IN ('super_admin', 'admin') THEN
    RETURN json_build_object('success', false, 'error', 'Only Super Admin or Admin can cancel');
  END IF;

  BEGIN
    PERFORM public._cpc_require_warehouse_link();
  EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
  END;

  SELECT * INTO v_batch
  FROM public.company_price_change_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND OR v_batch.company_id IS DISTINCT FROM v_company_id THEN
    RETURN json_build_object('success', false, 'error', 'Batch not found');
  END IF;

  IF v_batch.status IS DISTINCT FROM 'pending_agreement' THEN
    RETURN json_build_object('success', false, 'error', 'Only pending batches can be cancelled');
  END IF;

  IF v_batch.agents_applied_at IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'Agents already updated; create a new batch instead');
  END IF;

  PERFORM public._cpc_revert_main(p_batch_id);

  UPDATE public.company_price_change_batches
  SET
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_by_name = v_name
  WHERE id = p_batch_id;

  INSERT INTO public.system_audit_log (
    company_id, table_name, operation, record_id,
    user_id, user_name, user_role, description
  ) VALUES (
    v_company_id, 'company_price_change_batches', 'UPDATE', p_batch_id::text,
    v_uid, v_name, v_role,
    'Cancelled company price change batch ' || v_batch.batch_number
  );

  RETURN json_build_object('success', true, 'batch_id', p_batch_id, 'status', 'cancelled');
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_company_price_change_batch(jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_company_price_change(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_company_price_change(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_company_price_change(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_company_price_change_to_agents(uuid) TO authenticated;

COMMENT ON TABLE public.company_price_change_batches IS
  'SA/Admin company price updates: main applied immediately; agent bags after TL+MS confirm.';
COMMENT ON FUNCTION public.create_company_price_change_batch(jsonb, text) IS
  'Creates PCB-… batch, writes main_inventory now, notifies TL+MS; auto-applies agents if none.';
