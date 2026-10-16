-- Super-admin stock-request approval writes allocation_history.
-- Direct leader requests use allocate_batch_to_leader (one session, stock credited).
-- Agent requests forwarded by a leader stay reserved on main_inventory and get
-- one main_to_leader history session so the approval shows in allocation history.

CREATE OR REPLACE FUNCTION public.admin_approve_stock_requests_batch(
  p_request_ids uuid[],
  p_admin_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_leader record;
  v_req record;
  v_items jsonb;
  v_brand_id uuid;
  v_distinct_brands integer;
  v_alloc_result json;
  v_allocation_id uuid;
  v_allocation_ids uuid[] := ARRAY[]::uuid[];
  v_total_quantity integer;
  v_main_id uuid;
  v_stock integer;
  v_allocated_stock integer;
  v_available_stock integer;
  v_id_count integer;
  v_found_count integer;
BEGIN
  IF p_request_ids IS NULL OR cardinality(p_request_ids) = 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'At least one request id is required');
  END IF;

  SELECT COUNT(DISTINCT x) INTO v_id_count
  FROM unnest(p_request_ids) AS x;

  SELECT COUNT(*) INTO v_found_count
  FROM public.stock_requests sr
  WHERE sr.id = ANY (p_request_ids);

  IF v_found_count <> v_id_count THEN
    RETURN jsonb_build_object('success', false, 'message', 'One or more requests were not found');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.stock_requests sr
    WHERE sr.id = ANY (p_request_ids)
      AND sr.status <> 'approved_by_leader'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Request not found or not awaiting admin approval'
    );
  END IF;

  PERFORM 1
  FROM public.stock_requests sr
  WHERE sr.id = ANY (p_request_ids)
  FOR UPDATE;

  -- Direct leader requests: same stock movement as Allocate Stock, plus one history session.
  FOR v_leader IN
    SELECT DISTINCT sr.leader_id
    FROM public.stock_requests sr
    WHERE sr.id = ANY (p_request_ids)
      AND sr.agent_id = sr.leader_id
  LOOP
    SELECT COUNT(*)::integer
    INTO v_distinct_brands
    FROM (
      SELECT DISTINCT v.brand_id
      FROM public.stock_requests sr
      JOIN public.variants v ON v.id = sr.variant_id
      WHERE sr.id = ANY (p_request_ids)
        AND sr.leader_id = v_leader.leader_id
        AND sr.agent_id = sr.leader_id
        AND v.brand_id IS NOT NULL
    ) batch_brands;

    IF v_distinct_brands = 1 THEN
      SELECT DISTINCT v.brand_id
      INTO v_brand_id
      FROM public.stock_requests sr
      JOIN public.variants v ON v.id = sr.variant_id
      WHERE sr.id = ANY (p_request_ids)
        AND sr.leader_id = v_leader.leader_id
        AND sr.agent_id = sr.leader_id
        AND v.brand_id IS NOT NULL;
    ELSE
      v_brand_id := NULL;
    END IF;

    v_items := '[]'::jsonb;

    FOR v_req IN
      SELECT
        sr.variant_id,
        sr.requested_quantity + COALESCE(sr.leader_additional_quantity, 0) AS qty
      FROM public.stock_requests sr
      WHERE sr.id = ANY (p_request_ids)
        AND sr.leader_id = v_leader.leader_id
        AND sr.agent_id = sr.leader_id
      ORDER BY sr.requested_at, sr.id
    LOOP
      IF v_req.qty IS NULL OR v_req.qty <= 0 THEN
        RAISE EXCEPTION 'Each request must have quantity greater than zero';
      END IF;

      v_items := v_items || jsonb_build_array(
        jsonb_build_object(
          'variant_id', v_req.variant_id,
          'quantity', v_req.qty
        )
      );
    END LOOP;

    v_alloc_result := public.allocate_batch_to_leader(
      v_leader.leader_id,
      v_items,
      p_admin_id,
      v_brand_id
    );

    IF COALESCE((v_alloc_result->>'success')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION '%', COALESCE(v_alloc_result->>'error', 'Failed to allocate stock to leader');
    END IF;

    v_allocation_id := (v_alloc_result->>'allocation_id')::uuid;
    v_allocation_ids := array_append(v_allocation_ids, v_allocation_id);

    UPDATE public.stock_requests
    SET
      status = 'fulfilled',
      admin_approved_at = NOW(),
      admin_approved_by = p_admin_id,
      admin_notes = COALESCE(p_notes, admin_notes),
      fulfilled_at = NOW(),
      fulfilled_by = p_admin_id,
      fulfilled_quantity = requested_quantity + COALESCE(leader_additional_quantity, 0),
      updated_at = NOW()
    WHERE id = ANY (p_request_ids)
      AND leader_id = v_leader.leader_id
      AND agent_id = leader_id;
  END LOOP;

  -- Forwarded agent requests: reserve main stock and record one history session per leader.
  FOR v_leader IN
    SELECT DISTINCT sr.leader_id, sr.company_id
    FROM public.stock_requests sr
    WHERE sr.id = ANY (p_request_ids)
      AND sr.agent_id IS DISTINCT FROM sr.leader_id
  LOOP
    SELECT COUNT(*)::integer
    INTO v_distinct_brands
    FROM (
      SELECT DISTINCT v.brand_id
      FROM public.stock_requests sr
      JOIN public.variants v ON v.id = sr.variant_id
      WHERE sr.id = ANY (p_request_ids)
        AND sr.leader_id = v_leader.leader_id
        AND sr.company_id = v_leader.company_id
        AND sr.agent_id IS DISTINCT FROM sr.leader_id
        AND v.brand_id IS NOT NULL
    ) batch_brands;

    IF v_distinct_brands = 1 THEN
      SELECT DISTINCT v.brand_id
      INTO v_brand_id
      FROM public.stock_requests sr
      JOIN public.variants v ON v.id = sr.variant_id
      WHERE sr.id = ANY (p_request_ids)
        AND sr.leader_id = v_leader.leader_id
        AND sr.company_id = v_leader.company_id
        AND sr.agent_id IS DISTINCT FROM sr.leader_id
        AND v.brand_id IS NOT NULL;
    ELSE
      v_brand_id := NULL;
    END IF;

    INSERT INTO public.allocation_history (
      company_id,
      allocated_to,
      allocated_by,
      brand_id,
      allocation_type
    ) VALUES (
      v_leader.company_id,
      v_leader.leader_id,
      p_admin_id,
      v_brand_id,
      'main_to_leader'
    )
    RETURNING id INTO v_allocation_id;

    v_allocation_ids := array_append(v_allocation_ids, v_allocation_id);

    FOR v_req IN
      SELECT
        sr.id,
        sr.variant_id,
        sr.requested_quantity + COALESCE(sr.leader_additional_quantity, 0) AS qty
      FROM public.stock_requests sr
      WHERE sr.id = ANY (p_request_ids)
        AND sr.leader_id = v_leader.leader_id
        AND sr.company_id = v_leader.company_id
        AND sr.agent_id IS DISTINCT FROM sr.leader_id
      ORDER BY sr.requested_at, sr.id
    LOOP
      v_total_quantity := v_req.qty;

      IF v_total_quantity IS NULL OR v_total_quantity <= 0 THEN
        RAISE EXCEPTION 'Each request must have quantity greater than zero';
      END IF;

      SELECT mi.id, mi.stock, COALESCE(mi.allocated_stock, 0)
      INTO v_main_id, v_stock, v_allocated_stock
      FROM public.main_inventory mi
      WHERE mi.variant_id = v_req.variant_id
        AND mi.company_id = v_leader.company_id
      FOR UPDATE;

      IF v_main_id IS NULL THEN
        RAISE EXCEPTION 'Variant not found in main inventory';
      END IF;

      v_available_stock := v_stock - v_allocated_stock;
      IF v_available_stock < v_total_quantity THEN
        RAISE EXCEPTION 'Insufficient stock. Available: %, Requested: %', v_available_stock, v_total_quantity;
      END IF;

      UPDATE public.main_inventory
      SET
        allocated_stock = COALESCE(allocated_stock, 0) + v_total_quantity,
        updated_at = NOW()
      WHERE id = v_main_id;

      INSERT INTO public.inventory_transactions (
        company_id,
        variant_id,
        transaction_type,
        quantity,
        from_location,
        to_location,
        performed_by,
        notes,
        reference_type,
        reference_id
      ) VALUES (
        v_leader.company_id,
        v_req.variant_id,
        'allocated_to_agent',
        v_total_quantity,
        'main_inventory',
        CONCAT('agent_inventory:', v_leader.leader_id),
        p_admin_id,
        'Stock request approved by admin (reserved pending leader distribution)',
        'allocation_history',
        v_allocation_id
      );
    END LOOP;

    UPDATE public.stock_requests
    SET
      status = 'approved_by_admin',
      admin_approved_at = NOW(),
      admin_approved_by = p_admin_id,
      admin_notes = COALESCE(p_notes, admin_notes),
      updated_at = NOW()
    WHERE id = ANY (p_request_ids)
      AND leader_id = v_leader.leader_id
      AND company_id = v_leader.company_id
      AND agent_id IS DISTINCT FROM leader_id;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Request approved and recorded in allocation history',
    'approved_count', v_id_count,
    'allocation_ids', to_jsonb(v_allocation_ids)
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_approve_stock_requests_batch(uuid[], uuid, text) TO authenticated;

COMMENT ON FUNCTION public.admin_approve_stock_requests_batch(uuid[], uuid, text) IS
  'Approves leader-forwarded stock requests as one allocation_history session per leader. Direct leader requests use allocate_batch_to_leader. Mobile-agent requests reserve allocated_stock and log a main_to_leader session.';

CREATE OR REPLACE FUNCTION public.admin_approve_stock_request(
  p_request_id uuid,
  p_admin_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.admin_approve_stock_requests_batch(
    ARRAY[p_request_id],
    p_admin_id,
    p_notes
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_approve_stock_request(uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.admin_approve_stock_request(uuid, uuid, text) IS
  'Approves one leader-forwarded stock request and records it in allocation history. Prefer admin_approve_stock_requests_batch for a multi-line request.';
