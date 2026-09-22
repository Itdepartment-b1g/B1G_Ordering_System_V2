-- Fix: create_company_price_change_batch used DELETE FROM temp table without WHERE,
-- which fails under Supabase safeupdate (pg_safeupdate). Use jsonb accumulator instead.
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
