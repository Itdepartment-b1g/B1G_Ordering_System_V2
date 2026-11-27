-- Allow company price change batches (create / confirm / cancel / apply)
-- for Standard Account companies that are NOT warehouse-linked.

CREATE OR REPLACE FUNCTION public._cpc_require_warehouse_link()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Previously raised when get_linked_warehouse_company_id() was null.
  -- Price agreements now work for all sales companies; return link if present.
  RETURN public.get_linked_warehouse_company_id();
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

COMMENT ON FUNCTION public._cpc_require_warehouse_link() IS
  'No longer blocks CPC; returns linked warehouse id if any (nullable).';
