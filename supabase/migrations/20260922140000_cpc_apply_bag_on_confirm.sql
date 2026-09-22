-- On confirm: update that user's agent_inventory immediately (do not wait for all).
-- On cancel: revert main + bags for users who already confirmed.

CREATE OR REPLACE FUNCTION public._cpc_apply_to_agent(
  p_batch_id uuid,
  p_agent_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_item record;
  v_updated integer;
  v_total integer := 0;
BEGIN
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
      AND ai.variant_id = v_item.variant_id
      AND ai.agent_id = p_agent_id;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    v_total := v_total + v_updated;

    IF v_updated > 0 THEN
      UPDATE public.company_price_change_items
      SET agent_rows_updated = coalesce(agent_rows_updated, 0) + v_updated
      WHERE id = v_item.id;
    END IF;
  END LOOP;

  RETURN v_total;
END;
$$;

CREATE OR REPLACE FUNCTION public._cpc_revert_confirmed_agent_bags(p_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_item record;
  v_profile_id uuid;
BEGIN
  FOR v_profile_id IN
    SELECT profile_id
    FROM public.company_price_change_agreements
    WHERE batch_id = p_batch_id
      AND status = 'confirmed'
  LOOP
    FOR v_item IN
      SELECT * FROM public.company_price_change_items WHERE batch_id = p_batch_id
    LOOP
      UPDATE public.agent_inventory ai
      SET
        allocated_price = v_item.old_selling_price,
        dsp_price = v_item.old_dsp_price,
        rsp_price = v_item.old_rsp_price,
        updated_at = now()
      WHERE ai.company_id = v_item.company_id
        AND ai.variant_id = v_item.variant_id
        AND ai.agent_id = v_profile_id;
    END LOOP;
  END LOOP;
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
  SET status = 'confirmed', confirmed_at = now()
  WHERE id = v_agreement_id;

  -- Immediate: this user's bag gets the new prices now
  v_bag_rows := public._cpc_apply_to_agent(p_batch_id, v_uid);

  -- When everyone has confirmed, mark batch applied (company-wide sweep is idempotent)
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

  -- Revert bags for anyone who already confirmed, then main
  PERFORM public._cpc_revert_confirmed_agent_bags(p_batch_id);
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

-- Keep reject in sync if still callable (reverts confirmed bags too)
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

  PERFORM public._cpc_revert_confirmed_agent_bags(p_batch_id);
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

COMMENT ON FUNCTION public.confirm_company_price_change(uuid) IS
  'Confirms agreement and immediately updates the confirmer agent_inventory; marks batch applied when all confirmed.';

-- Backfill: anyone who already confirmed on a still-pending batch gets their bag now
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT a.batch_id, a.profile_id
    FROM public.company_price_change_agreements a
    JOIN public.company_price_change_batches b ON b.id = a.batch_id
    WHERE b.status = 'pending_agreement'
      AND a.status = 'confirmed'
  LOOP
    PERFORM public._cpc_apply_to_agent(r.batch_id, r.profile_id);
  END LOOP;
END;
$$;
