-- Append SA price edits into the open pending_agreement batch (one confirm until you ack).
-- If you already confirmed and SA adds more, your agreement resets to pending (re-confirm).
-- Items get updated_at; agreements get last_confirmed_at for New vs Already confirmed UI.

ALTER TABLE public.company_price_change_items
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.company_price_change_agreements
  ADD COLUMN IF NOT EXISTS last_confirmed_at timestamptz;

-- One row per SKU per batch (merge re-edits)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'company_price_change_items_batch_variant_key'
  ) THEN
    -- Deduplicate if any (keep newest created_at)
    DELETE FROM public.company_price_change_items a
    USING public.company_price_change_items b
    WHERE a.batch_id = b.batch_id
      AND a.variant_id = b.variant_id
      AND a.id < b.id;

    ALTER TABLE public.company_price_change_items
      ADD CONSTRAINT company_price_change_items_batch_variant_key UNIQUE (batch_id, variant_id);
  END IF;
END;
$$;

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
  v_bag_rows integer := 0;
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
  SET
    status = 'confirmed',
    confirmed_at = now(),
    last_confirmed_at = now()
  WHERE id = v_agreement_id;

  v_bag_rows := public._cpc_apply_to_agent(p_batch_id, v_uid);
  v_result := public._cpc_try_apply_if_all_confirmed(p_batch_id);

  RETURN json_build_object(
    'success', true,
    'batch_id', p_batch_id,
    'bag_rows_updated', v_bag_rows,
    'bag_applied', true,
    'apply_result', v_result
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

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

  -- Reuse open pending batch if any
  SELECT id, batch_number INTO v_batch_id, v_batch_number
  FROM public.company_price_change_batches
  WHERE company_id = v_company_id
    AND status = 'pending_agreement'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

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
        -- Keep original old_*; bump new_* and updated_at (marks as New for re-confirm)
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

  -- Always write main now
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
    -- Re-open confirm for anyone who already confirmed this batch
    UPDATE public.company_price_change_agreements
    SET status = 'pending', confirmed_at = NULL
    WHERE batch_id = v_batch_id
      AND status = 'confirmed';

    GET DIAGNOSTICS v_reset_count = ROW_COUNT;

    FOR r IN
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
        r.id,
        'system_message',
        'Price change updated — confirm again',
        'Batch ' || v_batch_number || ': Super Admin added more price changes. Review the list and confirm again.',
        'company_price_change_batch',
        v_batch_id
      );
    END LOOP;

    -- Ensure every active TL/MS has an agreement row
    FOR r IN
      SELECT p.id, coalesce(nullif(btrim(p.full_name), ''), p.email) AS profile_name, p.role
      FROM public.profiles p
      WHERE p.company_id = v_company_id
        AND p.status = 'active'
        AND p.role IN ('team_leader', 'mobile_sales')
        AND NOT EXISTS (
          SELECT 1 FROM public.company_price_change_agreements a
          WHERE a.batch_id = v_batch_id AND a.profile_id = p.id
        )
    LOOP
      INSERT INTO public.company_price_change_agreements (
        batch_id, company_id, profile_id, profile_name, profile_role, status
      ) VALUES (
        v_batch_id, v_company_id, r.id, r.profile_name, r.role, 'pending'
      );

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
        'note', nullif(btrim(p_note), '')
      ),
      'Appended price changes to batch ' || v_batch_number
    );
  ELSE
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
        'appended', false,
        'auto_applied', true,
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
    'auto_applied', false
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.create_company_price_change_batch(jsonb, text) IS
  'Creates or appends to open pending PCB batch; resets already-confirmed agreements when appending.';
