-- Allow stock requests with variants from multiple brands (one request, one batch per receive).

ALTER TABLE public.warehouse_stock_requests
  ALTER COLUMN brand_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.create_warehouse_stock_request(
  p_brand_id uuid,
  p_items jsonb,
  p_notes text DEFAULT NULL,
  p_expected_delivery_date date DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company_id uuid;
  v_creator uuid;
  v_request_id uuid;
  v_request_number text;
  v_item jsonb;
  v_variant_id uuid;
  v_quantity integer;
  v_line_count integer := 0;
  v_header_brand_id uuid;
BEGIN
  v_creator := COALESCE(p_created_by, auth.uid());
  v_header_brand_id := NULL;

  SELECT p.company_id INTO v_company_id
  FROM public.profiles p
  WHERE p.id = v_creator;

  IF v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User company not found');
  END IF;

  IF NOT (
    public.is_system_administrator()
    OR (public.is_warehouse() AND public.is_main_warehouse_user(v_creator))
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Only main warehouse users can create stock requests');
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'At least one item is required');
  END IF;

  IF p_brand_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.brands b
      WHERE b.id = p_brand_id AND b.company_id = v_company_id
    ) THEN
      RETURN json_build_object('success', false, 'error', 'Brand not found');
    END IF;
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
        AND v.company_id = v_company_id
        AND v.is_active = true
        AND (p_brand_id IS NULL OR v.brand_id = p_brand_id)
    ) THEN
      RETURN json_build_object(
        'success', false,
        'error', CASE
          WHEN p_brand_id IS NULL THEN 'Variant not found or inactive'
          ELSE 'Variant does not belong to the selected brand'
        END
      );
    END IF;

    v_line_count := v_line_count + 1;
  END LOOP;

  IF p_brand_id IS NOT NULL THEN
    v_header_brand_id := p_brand_id;
  ELSE
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
  END IF;

  v_request_number := public.generate_warehouse_stock_request_number(v_company_id);

  INSERT INTO public.warehouse_stock_requests (
    company_id, request_number, brand_id, status,
    expected_delivery_date, notes, created_by
  ) VALUES (
    v_company_id, v_request_number, v_header_brand_id, 'pending_receive',
    p_expected_delivery_date, p_notes, v_creator
  )
  RETURNING id INTO v_request_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_variant_id := (v_item->>'variant_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

    INSERT INTO public.warehouse_stock_request_items (
      request_id, variant_id, ordered_quantity
    ) VALUES (
      v_request_id, v_variant_id, v_quantity
    );
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'request_id', v_request_id,
    'request_number', v_request_number,
    'line_count', v_line_count,
    'multi_brand', v_header_brand_id IS NULL
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMENT ON TABLE public.warehouse_stock_requests IS
  'Inbound stock requests for warehouse hub. Items may span multiple brands. Each receive event creates one inventory batch.';
