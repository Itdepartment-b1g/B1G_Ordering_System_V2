-- Fix single-brand detection when approving multiple stock requests (ignore null variant.brand_id).

CREATE OR REPLACE FUNCTION public.approve_stock_requests_batch_by_leader(
  p_request_ids uuid[],
  p_leader_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent_id uuid;
  v_company_id uuid;
  v_brand_id uuid;
  v_items jsonb := '[]'::jsonb;
  v_req record;
  v_allocated_price numeric;
  v_dsp_price numeric;
  v_rsp_price numeric;
  v_batch_result json;
  v_allocation_id uuid;
  v_distinct_brands integer;
BEGIN
  IF p_request_ids IS NULL OR array_length(p_request_ids, 1) IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'At least one request id is required');
  END IF;

  SELECT sr.agent_id, sr.company_id
  INTO v_agent_id, v_company_id
  FROM public.stock_requests sr
  WHERE sr.id = p_request_ids[1]
    AND sr.leader_id = p_leader_id
    AND sr.status = 'pending';

  IF v_agent_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Request not found or not pending');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.stock_requests sr
    WHERE sr.id = ANY (p_request_ids)
      AND (
        sr.leader_id IS DISTINCT FROM p_leader_id
        OR sr.status <> 'pending'
        OR sr.agent_id IS DISTINCT FROM v_agent_id
      )
  ) THEN
    RETURN json_build_object(
      'success',
      false,
      'error',
      'All requests must be pending, belong to the same agent, and be assigned to this leader'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.leader_teams lt
    WHERE lt.leader_id = p_leader_id
      AND lt.agent_id = v_agent_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Agent is not on your team');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT sr.variant_id, SUM(sr.requested_quantity) AS qty_needed
      FROM public.stock_requests sr
      WHERE sr.id = ANY (p_request_ids)
      GROUP BY sr.variant_id
    ) needed
    LEFT JOIN public.agent_inventory ai
      ON ai.agent_id = p_leader_id
      AND ai.variant_id = needed.variant_id
      AND ai.company_id = v_company_id
    WHERE COALESCE(ai.stock, 0) < needed.qty_needed
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient leader stock for one or more products');
  END IF;

  SELECT COUNT(*)::integer
  INTO v_distinct_brands
  FROM (
    SELECT DISTINCT v.brand_id
    FROM public.stock_requests sr
    JOIN public.variants v ON v.id = sr.variant_id
    WHERE sr.id = ANY (p_request_ids)
      AND v.brand_id IS NOT NULL
  ) batch_brands;

  IF v_distinct_brands = 1 THEN
    SELECT DISTINCT v.brand_id
    INTO v_brand_id
    FROM public.stock_requests sr
    JOIN public.variants v ON v.id = sr.variant_id
    WHERE sr.id = ANY (p_request_ids)
      AND v.brand_id IS NOT NULL;
  ELSE
    v_brand_id := NULL;
  END IF;

  FOR v_req IN
    SELECT sr.id, sr.variant_id, sr.requested_quantity
    FROM public.stock_requests sr
    WHERE sr.id = ANY (p_request_ids)
    ORDER BY sr.requested_at, sr.id
  LOOP
    IF v_req.requested_quantity IS NULL OR v_req.requested_quantity <= 0 THEN
      RETURN json_build_object('success', false, 'error', 'Each request must have quantity greater than zero');
    END IF;

    SELECT
      COALESCE(mi.selling_price, mi.unit_price, 0),
      COALESCE(mi.dsp_price, 0),
      COALESCE(mi.rsp_price, 0)
    INTO v_allocated_price, v_dsp_price, v_rsp_price
    FROM public.main_inventory mi
    WHERE mi.variant_id = v_req.variant_id
      AND mi.company_id = v_company_id;

    v_items := v_items || jsonb_build_array(
      jsonb_build_object(
        'variant_id', v_req.variant_id,
        'quantity', v_req.requested_quantity,
        'allocated_price', COALESCE(v_allocated_price, 0),
        'dsp_price', COALESCE(v_dsp_price, 0),
        'rsp_price', COALESCE(v_rsp_price, 0)
      )
    );
  END LOOP;

  v_batch_result := public.allocate_batch_to_agent(
    v_agent_id,
    v_items,
    p_leader_id,
    v_brand_id
  );

  IF coalesce((v_batch_result->>'success')::boolean, false) IS NOT TRUE THEN
    RETURN json_build_object(
      'success',
      false,
      'error',
      coalesce(v_batch_result->>'error', 'Allocation failed')
    );
  END IF;

  v_allocation_id := (v_batch_result->>'allocation_id')::uuid;

  UPDATE public.stock_requests
  SET
    status = 'fulfilled',
    leader_approved_at = now(),
    leader_approved_by = p_leader_id,
    leader_notes = COALESCE(p_notes, leader_notes),
    fulfilled_at = now(),
    fulfilled_by = p_leader_id,
    fulfilled_quantity = requested_quantity,
    updated_at = now()
  WHERE id = ANY (p_request_ids);

  RETURN json_build_object(
    'success', true,
    'allocation_id', v_allocation_id,
    'approved_count', array_length(p_request_ids, 1),
    'message', 'Requests approved and recorded in allocation history'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;
