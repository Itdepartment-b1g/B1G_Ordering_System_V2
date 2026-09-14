-- Require proof attachments when creating a return-to-leader handover (MS/TL submit).

DROP FUNCTION IF EXISTS public.create_return_leader_handover(jsonb, text);

CREATE OR REPLACE FUNCTION public.create_return_leader_handover(
  p_items jsonb,
  p_notes text DEFAULT NULL,
  p_attachments jsonb DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid;
  v_role text;
  v_name text;
  v_company_id uuid;
  v_handover_id uuid;
  v_return_number text;
  v_status text;
  v_from_holder uuid;
  v_to_holder uuid;
  v_elem jsonb;
  v_variant_id uuid;
  v_brand_id uuid;
  v_variant_type_id uuid;
  v_qty integer;
  v_available integer;
  v_leader uuid;
  v_file_url text;
  v_file_path text;
  v_source text;
BEGIN
  v_user := auth.uid();
  v_company_id := public.get_auth_company_id();

  IF v_user IS NULL OR v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF public.get_linked_warehouse_company_id() IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Company is not linked to a warehouse');
  END IF;

  SELECT role, full_name INTO v_role, v_name
  FROM public.profiles
  WHERE id = v_user AND company_id = v_company_id;

  IF v_role NOT IN ('mobile_sales', 'sales_agent', 'team_leader') THEN
    RETURN json_build_object('success', false, 'error', 'Only mobile sales or team leader can submit a return to leader');
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Select at least one item');
  END IF;

  IF p_attachments IS NULL OR jsonb_array_length(p_attachments) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Add at least one proof photo');
  END IF;

  v_from_holder := v_user;

  IF v_role = 'team_leader' THEN
    v_to_holder := v_user;
    v_status := 'pending_super_admin';
  ELSE
    v_leader := public.get_team_leader_for_agent(v_company_id, v_user);
    IF v_leader IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'No team leader assigned');
    END IF;
    v_to_holder := v_leader;
    v_status := 'pending_leader';
  END IF;

  v_return_number := public.generate_return_leader_number(v_company_id);

  INSERT INTO public.return_leader_handovers (
    return_number, company_id, submitted_by, submitted_by_name, initiator_role,
    from_holder_id, to_holder_id, status, notes
  ) VALUES (
    v_return_number, v_company_id, v_user, v_name, v_role,
    v_from_holder, v_to_holder, v_status, NULLIF(btrim(COALESCE(p_notes, '')), '')
  )
  RETURNING id INTO v_handover_id;

  FOR v_elem IN SELECT t.elem FROM jsonb_array_elements(p_items) AS t(elem)
  LOOP
    v_variant_id := NULLIF(v_elem->>'variant_id', '')::uuid;
    v_brand_id := NULLIF(v_elem->>'brand_id', '')::uuid;
    v_variant_type_id := NULLIF(v_elem->>'variant_type_id', '')::uuid;
    v_qty := COALESCE((v_elem->>'quantity')::integer, 0);

    IF v_variant_id IS NULL OR v_qty <= 0 THEN
      RETURN json_build_object('success', false, 'error', 'Each item needs variant_id and positive quantity');
    END IF;

    v_available := public.get_client_return_available_qty(v_company_id, v_from_holder, v_variant_id);
    IF v_qty > v_available THEN
      RETURN json_build_object(
        'success', false,
        'error',
        'Quantity exceeds available returned stock for one or more items'
      );
    END IF;

    INSERT INTO public.return_leader_handover_items (
      handover_id, company_id, variant_id, brand_id, variant_type_id, quantity
    ) VALUES (
      v_handover_id, v_company_id, v_variant_id, v_brand_id, v_variant_type_id, v_qty
    );
  END LOOP;

  FOR v_elem IN SELECT t.elem FROM jsonb_array_elements(p_attachments) AS t(elem)
  LOOP
    v_file_url := NULLIF(btrim(COALESCE(v_elem->>'file_url', '')), '');
    v_file_path := NULLIF(btrim(COALESCE(v_elem->>'file_path', '')), '');
    v_source := COALESCE(NULLIF(v_elem->>'source', ''), 'upload');
    IF v_file_url IS NULL OR v_file_path IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Each proof photo needs file_url and file_path');
    END IF;
    IF v_source NOT IN ('capture', 'upload') THEN
      v_source := 'upload';
    END IF;

    INSERT INTO public.return_leader_handover_attachments (
      handover_id, company_id, file_url, file_path, file_name, content_type, source, sort_order, uploaded_by
    ) VALUES (
      v_handover_id,
      v_company_id,
      v_file_url,
      v_file_path,
      NULLIF(v_elem->>'file_name', ''),
      NULLIF(v_elem->>'content_type', ''),
      v_source,
      COALESCE((v_elem->>'sort_order')::integer, 0),
      v_user
    );
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'id', v_handover_id,
    'return_number', v_return_number,
    'status', v_status
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('success', false, 'error', 'Duplicate variant in return');
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_return_leader_handover(jsonb, text, jsonb) TO authenticated;
