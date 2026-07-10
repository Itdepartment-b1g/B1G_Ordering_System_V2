-- Edit warehouse stock requests while pending receive and nothing has been received yet.

CREATE OR REPLACE FUNCTION public.update_warehouse_stock_request(
  p_request_id uuid,
  p_items jsonb,
  p_notes text DEFAULT NULL,
  p_expected_delivery_date date DEFAULT NULL,
  p_updated_by uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_request RECORD;
  v_actor uuid;
  v_item jsonb;
  v_variant_id uuid;
  v_quantity integer;
  v_line_count integer := 0;
  v_header_brand_id uuid;
BEGIN
  v_actor := COALESCE(p_updated_by, auth.uid());

  SELECT * INTO v_request
  FROM public.warehouse_stock_requests
  WHERE id = p_request_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Stock request not found');
  END IF;

  IF NOT (
    public.is_system_administrator()
    OR (public.is_warehouse() AND public.is_main_warehouse_user(v_actor)
        AND v_request.company_id = public.get_auth_company_id())
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF v_request.status <> 'pending_receive' THEN
    RETURN json_build_object('success', false, 'error', 'Only pending receive requests can be edited');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.warehouse_stock_request_items i
    WHERE i.request_id = p_request_id AND i.received_quantity > 0
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Cannot edit a request that has received stock');
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'At least one item is required');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_variant_id := (v_item->>'variant_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

    IF v_variant_id IS NULL OR v_quantity IS NULL OR v_quantity <= 0 THEN
      RETURN json_build_object('success', false, 'error', 'Invalid item payload');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.variants v
      WHERE v.id = v_variant_id
        AND v.company_id = v_request.company_id
        AND v.is_active = true
    ) THEN
      RETURN json_build_object('success', false, 'error', 'Variant not found or inactive');
    END IF;

    v_line_count := v_line_count + 1;
  END LOOP;

  SELECT
    CASE
      WHEN COUNT(DISTINCT v.brand_id) = 1 THEN (array_agg(DISTINCT v.brand_id))[1]
      ELSE NULL
    END
  INTO v_header_brand_id
  FROM public.variants v
  WHERE v.id IN (
    SELECT (elem->>'variant_id')::uuid
    FROM jsonb_array_elements(p_items) AS elem
  );

  UPDATE public.warehouse_stock_requests
  SET brand_id = v_header_brand_id,
      expected_delivery_date = p_expected_delivery_date,
      notes = p_notes,
      updated_at = now()
  WHERE id = p_request_id;

  DELETE FROM public.warehouse_stock_request_items
  WHERE request_id = p_request_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_variant_id := (v_item->>'variant_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

    INSERT INTO public.warehouse_stock_request_items (
      request_id, variant_id, ordered_quantity
    ) VALUES (
      p_request_id, v_variant_id, v_quantity
    );
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'request_id', p_request_id,
    'request_number', v_request.request_number,
    'line_count', v_line_count,
    'multi_brand', v_header_brand_id IS NULL
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_warehouse_stock_request(uuid, jsonb, text, date, uuid) TO authenticated;

COMMENT ON FUNCTION public.update_warehouse_stock_request IS
  'Replace line items on a pending stock request before any stock has been received.';
