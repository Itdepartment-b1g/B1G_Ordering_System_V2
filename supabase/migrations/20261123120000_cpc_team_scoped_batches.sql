-- Team-scoped company price change batches:
-- SA can target one or more Team Leaders + their Mobile Sales (leader_teams).
-- Main inventory still updates now; only that roster confirms / gets bag updates.

-- ---------------------------------------------------------------------------
-- 1) Schema
-- ---------------------------------------------------------------------------

ALTER TABLE public.company_price_change_batches
  ADD COLUMN IF NOT EXISTS scope_type text NOT NULL DEFAULT 'company',
  ADD COLUMN IF NOT EXISTS target_leader_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS target_leader_names text;

-- Legacy single-leader column (kept nullable for older clients / history)
ALTER TABLE public.company_price_change_batches
  ADD COLUMN IF NOT EXISTS target_leader_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_leader_name text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'company_price_change_batches_scope_check'
  ) THEN
    ALTER TABLE public.company_price_change_batches
      DROP CONSTRAINT company_price_change_batches_scope_check;
  END IF;

  ALTER TABLE public.company_price_change_batches
    ADD CONSTRAINT company_price_change_batches_scope_check
    CHECK (
      scope_type IN ('company', 'team')
      AND (
        (scope_type = 'company' AND cardinality(coalesce(target_leader_ids, '{}')) = 0)
        OR (scope_type = 'team' AND cardinality(coalesce(target_leader_ids, '{}')) >= 1)
      )
    );
END;
$$;

-- Backfill array from legacy single id if present
UPDATE public.company_price_change_batches
SET
  target_leader_ids = ARRAY[target_leader_id],
  target_leader_names = coalesce(target_leader_names, target_leader_name),
  scope_type = 'team'
WHERE target_leader_id IS NOT NULL
  AND cardinality(coalesce(target_leader_ids, '{}')) = 0;

CREATE INDEX IF NOT EXISTS idx_cpcb_company_scope_pending
  ON public.company_price_change_batches(company_id, scope_type, status)
  WHERE status = 'pending_agreement';

-- ---------------------------------------------------------------------------
-- 2) Roster helpers + scoped agreement sync
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._cpc_team_roster(p_company_id uuid, p_leader_id uuid)
RETURNS TABLE (
  profile_id uuid,
  profile_name text,
  profile_role text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    p.id,
    coalesce(nullif(btrim(p.full_name), ''), p.email) AS profile_name,
    p.role::text AS profile_role
  FROM public.profiles p
  WHERE p.id = p_leader_id
    AND p.company_id = p_company_id
    AND p.status = 'active'
    AND p.role = 'team_leader'

  UNION

  SELECT
    p.id,
    coalesce(nullif(btrim(p.full_name), ''), p.email) AS profile_name,
    p.role::text AS profile_role
  FROM public.leader_teams lt
  JOIN public.profiles p ON p.id = lt.agent_id
  WHERE lt.company_id = p_company_id
    AND lt.leader_id = p_leader_id
    AND p.company_id = p_company_id
    AND p.status = 'active'
    AND p.role = 'mobile_sales';
$$;

REVOKE EXECUTE ON FUNCTION public._cpc_team_roster(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._cpc_team_roster_many(p_company_id uuid, p_leader_ids uuid[])
RETURNS TABLE (
  profile_id uuid,
  profile_name text,
  profile_role text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT ON (roster.profile_id)
    roster.profile_id,
    roster.profile_name,
    roster.profile_role
  FROM unnest(coalesce(p_leader_ids, '{}'::uuid[])) AS lid(leader_id)
  CROSS JOIN LATERAL public._cpc_team_roster(p_company_id, lid.leader_id) roster
  ORDER BY roster.profile_id;
$$;

REVOKE EXECUTE ON FUNCTION public._cpc_team_roster_many(uuid, uuid[]) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._cpc_sorted_uuid_array(p_ids uuid[])
RETURNS uuid[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(array_agg(x ORDER BY x), '{}'::uuid[])
  FROM unnest(coalesce(p_ids, '{}'::uuid[])) AS x;
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
  v_scope text;
  v_leader_ids uuid[];
  rec record;
BEGIN
  SELECT company_id, status, scope_type, target_leader_ids
  INTO v_company_id, v_status, v_scope, v_leader_ids
  FROM public.company_price_change_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF v_company_id IS NULL OR v_status IS DISTINCT FROM 'pending_agreement' THEN
    RETURN;
  END IF;

  v_scope := coalesce(v_scope, 'company');
  v_leader_ids := coalesce(v_leader_ids, '{}'::uuid[]);

  IF v_scope = 'team' AND cardinality(v_leader_ids) >= 1 THEN
    UPDATE public.company_price_change_agreements a
    SET status = 'revoked'
    WHERE a.batch_id = p_batch_id
      AND a.status = 'pending'
      AND NOT EXISTS (
        SELECT 1
        FROM public._cpc_team_roster_many(v_company_id, v_leader_ids) roster
        WHERE roster.profile_id = a.profile_id
      );

    FOR rec IN
      SELECT profile_id AS id, profile_name, profile_role AS role
      FROM public._cpc_team_roster_many(v_company_id, v_leader_ids) tr
      WHERE NOT EXISTS (
        SELECT 1 FROM public.company_price_change_agreements a
        WHERE a.batch_id = p_batch_id AND a.profile_id = tr.profile_id
      )
    LOOP
      INSERT INTO public.company_price_change_agreements (
        batch_id, company_id, profile_id, profile_name, profile_role, status
      ) VALUES (
        p_batch_id, v_company_id, rec.id, rec.profile_name, rec.role, 'pending'
      );

      INSERT INTO public.notifications (
        company_id, user_id, notification_type, title, message, reference_type, reference_id
      ) VALUES (
        v_company_id,
        rec.id,
        'system_message',
        'Price change needs your confirmation',
        'Review and confirm the new Selling / DSP / RSP before bags update.',
        'company_price_change_batch',
        p_batch_id
      );
    END LOOP;
  ELSE
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

    FOR rec IN
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
        p_batch_id, v_company_id, rec.id, rec.profile_name, rec.role, 'pending'
      );

      INSERT INTO public.notifications (
        company_id, user_id, notification_type, title, message, reference_type, reference_id
      ) VALUES (
        v_company_id,
        rec.id,
        'system_message',
        'Price change needs your confirmation',
        'Review and confirm the new Selling / DSP / RSP before bags update.',
        'company_price_change_batch',
        p_batch_id
      );
    END LOOP;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) Apply agents: only batch roster (confirmed), else all company (auto-apply)
-- ---------------------------------------------------------------------------

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
  v_has_agreements boolean := false;
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

  SELECT EXISTS (
    SELECT 1
    FROM public.company_price_change_agreements
    WHERE batch_id = p_batch_id
      AND status IN ('pending', 'confirmed')
  ) INTO v_has_agreements;

  FOR v_item IN
    SELECT * FROM public.company_price_change_items WHERE batch_id = p_batch_id
  LOOP
    IF v_has_agreements THEN
      UPDATE public.agent_inventory ai
      SET
        allocated_price = v_item.new_selling_price,
        dsp_price = v_item.new_dsp_price,
        rsp_price = v_item.new_rsp_price,
        updated_at = now()
      WHERE ai.company_id = v_item.company_id
        AND ai.variant_id = v_item.variant_id
        AND ai.agent_id IN (
          SELECT a.profile_id
          FROM public.company_price_change_agreements a
          WHERE a.batch_id = p_batch_id
            AND a.status = 'confirmed'
        );
    ELSE
      UPDATE public.agent_inventory ai
      SET
        allocated_price = v_item.new_selling_price,
        dsp_price = v_item.new_dsp_price,
        rsp_price = v_item.new_rsp_price,
        updated_at = now()
      WHERE ai.company_id = v_item.company_id
        AND ai.variant_id = v_item.variant_id;
    END IF;

    GET DIAGNOSTICS v_updated = ROW_COUNT;

    UPDATE public.company_price_change_items
    SET agent_rows_updated = coalesce(agent_rows_updated, 0) + v_updated
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

-- ---------------------------------------------------------------------------
-- 4) create_company_price_change_batch(+ optional team leader ids)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.create_company_price_change_batch(jsonb, text);
DROP FUNCTION IF EXISTS public.create_company_price_change_batch(jsonb, text, uuid);

CREATE OR REPLACE FUNCTION public.create_company_price_change_batch(
  p_items jsonb,
  p_note text DEFAULT NULL,
  p_target_leader_ids uuid[] DEFAULT NULL
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
  v_is_append boolean := false;
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
  v_reset_count integer := 0;
  v_pending jsonb := '[]'::jsonb;
  v_existing_item record;
  rec record;
  v_apply json;
  v_scope text := 'company';
  v_leader_ids uuid[] := '{}'::uuid[];
  v_leader_names text := NULL;
  v_sorted_ids uuid[];
  v_lid uuid;
  v_leader_role text;
  v_leader_status text;
  v_leader_company uuid;
  v_leader_name text;
  v_name_list text[] := '{}'::text[];
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

  -- Scope: company (default) or team (one or more leaders)
  v_leader_ids := public._cpc_sorted_uuid_array(p_target_leader_ids);
  IF cardinality(v_leader_ids) >= 1 THEN
    FOREACH v_lid IN ARRAY v_leader_ids
    LOOP
      SELECT role, status, company_id, coalesce(nullif(btrim(full_name), ''), email)
      INTO v_leader_role, v_leader_status, v_leader_company, v_leader_name
      FROM public.profiles
      WHERE id = v_lid;

      IF v_leader_role IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Team Leader not found');
      END IF;
      IF v_leader_company IS DISTINCT FROM v_company_id THEN
        RETURN json_build_object('success', false, 'error', 'Team Leader belongs to another company');
      END IF;
      IF v_leader_role IS DISTINCT FROM 'team_leader' THEN
        RETURN json_build_object('success', false, 'error', 'Selected user is not a Team Leader');
      END IF;
      IF v_leader_status IS DISTINCT FROM 'active' THEN
        RETURN json_build_object('success', false, 'error', 'Team Leader is not active: ' || coalesce(v_leader_name, v_lid::text));
      END IF;

      v_name_list := array_append(v_name_list, v_leader_name);
    END LOOP;

    v_scope := 'team';
    v_leader_names := array_to_string(v_name_list, ', ');
  END IF;

  -- Collect changed rows (current main → new)
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

  -- Reuse open pending batch for the SAME scope + same leader set only
  IF v_scope = 'team' THEN
    v_sorted_ids := v_leader_ids;
    SELECT id, batch_number INTO v_batch_id, v_batch_number
    FROM public.company_price_change_batches
    WHERE company_id = v_company_id
      AND status = 'pending_agreement'
      AND scope_type = 'team'
      AND public._cpc_sorted_uuid_array(target_leader_ids) = v_sorted_ids
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;
  ELSE
    SELECT id, batch_number INTO v_batch_id, v_batch_number
    FROM public.company_price_change_batches
    WHERE company_id = v_company_id
      AND status = 'pending_agreement'
      AND coalesce(scope_type, 'company') = 'company'
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF v_batch_id IS NOT NULL THEN
    v_is_append := true;

    IF nullif(btrim(p_note), '') IS NOT NULL THEN
      UPDATE public.company_price_change_batches
      SET note = nullif(btrim(p_note), ''), main_applied_at = now()
      WHERE id = v_batch_id;
    ELSE
      UPDATE public.company_price_change_batches
      SET main_applied_at = now()
      WHERE id = v_batch_id;
    END IF;

    FOR v_elem IN SELECT * FROM jsonb_array_elements(v_pending)
    LOOP
      v_variant_id := (v_elem->>'variant_id')::uuid;

      SELECT * INTO v_existing_item
      FROM public.company_price_change_items
      WHERE batch_id = v_batch_id AND variant_id = v_variant_id;

      IF FOUND THEN
        UPDATE public.company_price_change_items
        SET
          brand_id = NULLIF(v_elem->>'brand_id', '')::uuid,
          brand_name = v_elem->>'brand_name',
          variant_name = v_elem->>'variant_name',
          variant_type = v_elem->>'variant_type',
          new_selling_price = (v_elem->>'new_selling')::numeric,
          new_dsp_price = (v_elem->>'new_dsp')::numeric,
          new_rsp_price = (v_elem->>'new_rsp')::numeric,
          updated_at = now()
        WHERE id = v_existing_item.id;
      ELSE
        INSERT INTO public.company_price_change_items (
          batch_id, company_id, brand_id, brand_name, variant_id, variant_name, variant_type,
          old_selling_price, new_selling_price,
          old_dsp_price, new_dsp_price,
          old_rsp_price, new_rsp_price,
          created_at, updated_at
        ) VALUES (
          v_batch_id, v_company_id,
          NULLIF(v_elem->>'brand_id', '')::uuid,
          v_elem->>'brand_name',
          v_variant_id,
          v_elem->>'variant_name',
          v_elem->>'variant_type',
          (v_elem->>'old_selling')::numeric,
          (v_elem->>'new_selling')::numeric,
          (v_elem->>'old_dsp')::numeric,
          (v_elem->>'new_dsp')::numeric,
          (v_elem->>'old_rsp')::numeric,
          (v_elem->>'new_rsp')::numeric,
          now(), now()
        );
      END IF;
    END LOOP;
  ELSE
    v_batch_number := public.generate_company_price_change_number(v_company_id);

    INSERT INTO public.company_price_change_batches (
      company_id, batch_number, status, note, created_by, created_by_name, main_applied_at,
      scope_type, target_leader_ids, target_leader_names,
      target_leader_id, target_leader_name
    ) VALUES (
      v_company_id, v_batch_number, 'pending_agreement', nullif(btrim(p_note), ''),
      v_uid, v_creator_name, now(),
      v_scope, v_leader_ids, v_leader_names,
      CASE WHEN cardinality(v_leader_ids) >= 1 THEN v_leader_ids[1] ELSE NULL END,
      v_leader_names
    )
    RETURNING id INTO v_batch_id;

    INSERT INTO public.company_price_change_items (
      batch_id, company_id, brand_id, brand_name, variant_id, variant_name, variant_type,
      old_selling_price, new_selling_price,
      old_dsp_price, new_dsp_price,
      old_rsp_price, new_rsp_price,
      created_at, updated_at
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
      (elem->>'new_rsp')::numeric,
      now(),
      now()
    FROM jsonb_array_elements(v_pending) elem;
  END IF;

  UPDATE public.main_inventory mi
  SET
    selling_price = (elem->>'new_selling')::numeric,
    dsp_price = (elem->>'new_dsp')::numeric,
    rsp_price = (elem->>'new_rsp')::numeric,
    updated_at = now()
  FROM jsonb_array_elements(v_pending) elem
  WHERE mi.company_id = v_company_id
    AND mi.variant_id = (elem->>'variant_id')::uuid;

  IF v_is_append THEN
    UPDATE public.company_price_change_agreements
    SET status = 'pending', confirmed_at = NULL
    WHERE batch_id = v_batch_id
      AND status = 'confirmed';

    GET DIAGNOSTICS v_reset_count = ROW_COUNT;

    FOR rec IN
      SELECT a.profile_id AS id
      FROM public.company_price_change_agreements a
      WHERE a.batch_id = v_batch_id
        AND a.status = 'pending'
        AND a.last_confirmed_at IS NOT NULL
    LOOP
      INSERT INTO public.notifications (
        company_id, user_id, notification_type, title, message, reference_type, reference_id
      ) VALUES (
        v_company_id,
        rec.id,
        'system_message',
        'Price change updated — confirm again',
        'Batch ' || v_batch_number || ': Super Admin added more price changes. Review the list and confirm again.',
        'company_price_change_batch',
        v_batch_id
      );
    END LOOP;

    PERFORM public._cpc_sync_agreements(v_batch_id);

    INSERT INTO public.system_audit_log (
      company_id, table_name, operation, record_id,
      user_id, user_name, user_role,
      new_data, description
    ) VALUES (
      v_company_id,
      'company_price_change_batches',
      'UPDATE',
      v_batch_id::text,
      v_uid,
      v_creator_name,
      v_role,
      jsonb_build_object(
        'batch_number', v_batch_number,
        'appended_item_count', v_item_count,
        'reset_confirmed_count', v_reset_count,
        'scope_type', v_scope,
        'target_leader_ids', to_jsonb(v_leader_ids),
        'note', nullif(btrim(p_note), '')
      ),
      'Appended price changes to batch ' || v_batch_number
    );
  ELSE
    PERFORM public._cpc_sync_agreements(v_batch_id);

    SELECT count(*) INTO v_agreement_count
    FROM public.company_price_change_agreements
    WHERE batch_id = v_batch_id AND status IN ('pending', 'confirmed');

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
        'scope_type', v_scope,
        'target_leader_ids', to_jsonb(v_leader_ids),
        'target_leader_names', v_leader_names,
        'note', nullif(btrim(p_note), '')
      ),
      CASE
        WHEN v_scope = 'team' THEN
          'Created team-scoped price change batch ' || v_batch_number || ' for ' || coalesce(v_leader_names, 'TL')
        ELSE
          'Created company price change batch ' || v_batch_number
      END
    );

    IF v_agreement_count = 0 THEN
      v_apply := public.apply_company_price_change_to_agents(v_batch_id);
      RETURN json_build_object(
        'success', true,
        'batch_id', v_batch_id,
        'batch_number', v_batch_number,
        'item_count', v_item_count,
        'agreement_count', 0,
        'appended', false,
        'auto_applied', true,
        'scope_type', v_scope,
        'target_leader_ids', to_jsonb(v_leader_ids),
        'apply_result', v_apply
      );
    END IF;
  END IF;

  SELECT count(*) INTO v_agreement_count
  FROM public.company_price_change_agreements
  WHERE batch_id = v_batch_id AND status IN ('pending', 'confirmed');

  RETURN json_build_object(
    'success', true,
    'batch_id', v_batch_id,
    'batch_number', v_batch_number,
    'item_count', v_item_count,
    'agreement_count', v_agreement_count,
    'appended', v_is_append,
    'reset_confirmed_count', v_reset_count,
    'auto_applied', false,
    'scope_type', v_scope,
    'target_leader_ids', to_jsonb(v_leader_ids)
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_company_price_change_batch(jsonb, text, uuid[]) TO authenticated;

COMMENT ON FUNCTION public.create_company_price_change_batch(jsonb, text, uuid[]) IS
  'Creates or appends to open pending PCB batch (company-wide or multi-TL team-scoped). Main updates immediately.';

-- ---------------------------------------------------------------------------
-- 5) Cancel: team-scoped does NOT revert main
-- ---------------------------------------------------------------------------

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

  PERFORM public._cpc_revert_confirmed_agent_bags(p_batch_id);

  IF coalesce(v_batch.scope_type, 'company') IS DISTINCT FROM 'team' THEN
    PERFORM public._cpc_revert_main(p_batch_id);
  END IF;

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
    CASE
      WHEN coalesce(v_batch.scope_type, 'company') = 'team' THEN
        'Cancelled team-scoped price change batch ' || v_batch.batch_number || ' (main prices kept)'
      ELSE
        'Cancelled company price change batch ' || v_batch.batch_number
    END
  );

  RETURN json_build_object(
    'success', true,
    'batch_id', p_batch_id,
    'status', 'cancelled',
    'main_reverted', coalesce(v_batch.scope_type, 'company') IS DISTINCT FROM 'team'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;
