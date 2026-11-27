-- Store brand_id / variant_type_id on CR lines instead of name snapshots.
-- Names come from joins to brands / variants / variant_types.
-- Change vs returned qty still matches per brand, now by brand_id.

ALTER TABLE public.client_order_return_items
  ADD COLUMN IF NOT EXISTS brand_id uuid,
  ADD COLUMN IF NOT EXISTS variant_type_id uuid;

ALTER TABLE public.client_order_return_change_items
  ADD COLUMN IF NOT EXISTS brand_id uuid,
  ADD COLUMN IF NOT EXISTS variant_type_id uuid;

UPDATE public.client_order_return_items i
SET brand_id = v.brand_id
FROM public.variants v
WHERE v.id = i.variant_id
  AND i.brand_id IS DISTINCT FROM v.brand_id;

UPDATE public.client_order_return_change_items i
SET brand_id = v.brand_id
FROM public.variants v
WHERE v.id = i.variant_id
  AND i.brand_id IS DISTINCT FROM v.brand_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'variants'
      AND column_name = 'variant_type_id'
  ) THEN
    UPDATE public.client_order_return_items i
    SET variant_type_id = v.variant_type_id
    FROM public.variants v
    WHERE v.id = i.variant_id
      AND i.variant_type_id IS DISTINCT FROM v.variant_type_id;

    UPDATE public.client_order_return_change_items i
    SET variant_type_id = v.variant_type_id
    FROM public.variants v
    WHERE v.id = i.variant_id
      AND i.variant_type_id IS DISTINCT FROM v.variant_type_id;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_order_return_items_brand_id_fkey'
  ) THEN
    ALTER TABLE public.client_order_return_items
      ADD CONSTRAINT client_order_return_items_brand_id_fkey
      FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_order_return_change_items_brand_id_fkey'
  ) THEN
    ALTER TABLE public.client_order_return_change_items
      ADD CONSTRAINT client_order_return_change_items_brand_id_fkey
      FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE RESTRICT;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'variant_types'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'client_order_return_items_variant_type_id_fkey'
    ) THEN
      ALTER TABLE public.client_order_return_items
        ADD CONSTRAINT client_order_return_items_variant_type_id_fkey
        FOREIGN KEY (variant_type_id) REFERENCES public.variant_types(id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'client_order_return_change_items_variant_type_id_fkey'
    ) THEN
      ALTER TABLE public.client_order_return_change_items
        ADD CONSTRAINT client_order_return_change_items_variant_type_id_fkey
        FOREIGN KEY (variant_type_id) REFERENCES public.variant_types(id) ON DELETE RESTRICT;
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.client_order_return_items WHERE brand_id IS NULL) THEN
    ALTER TABLE public.client_order_return_items
      ALTER COLUMN brand_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.client_order_return_change_items WHERE brand_id IS NULL) THEN
    ALTER TABLE public.client_order_return_change_items
      ALTER COLUMN brand_id SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_client_order_return_items_brand
  ON public.client_order_return_items (company_id, brand_id);
CREATE INDEX IF NOT EXISTS idx_client_order_return_change_items_brand
  ON public.client_order_return_change_items (company_id, brand_id);

COMMENT ON COLUMN public.client_order_return_items.brand_id IS
  'FK to brands. Copied from variants.brand_id. Change qty matches this, not brand name.';
COMMENT ON COLUMN public.client_order_return_items.variant_type_id IS
  'FK to variant_types. Copied from variants.variant_type_id. Display name is joined.';
COMMENT ON COLUMN public.client_order_return_change_items.brand_id IS
  'FK to brands. Copied from variants.brand_id. Must match a returned line brand_id.';
COMMENT ON COLUMN public.client_order_return_change_items.variant_type_id IS
  'FK to variant_types. Copied from variants.variant_type_id. Display name is joined.';

CREATE OR REPLACE FUNCTION public.create_client_order_return(
  p_client_order_id uuid,
  p_return_date date,
  p_reason text,
  p_notes text,
  p_agent_signature_url text,
  p_items jsonb,
  p_change_items jsonb,
  p_attachments jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid;
  v_role text;
  v_company_id uuid;
  v_account_type text;
  v_hub uuid;
  v_order public.client_orders%ROWTYPE;
  v_client_name text;
  v_returner_name text;
  v_return_id uuid;
  v_return_number text;
  v_status text;
  v_elem jsonb;
  v_item_id uuid;
  v_qty integer;
  v_sold integer;
  v_posted integer;
  v_variant_id uuid;
  v_brand_id uuid;
  v_variant_type_id uuid;
  v_variant_name text;
  v_unit_price numeric(10,2);
  v_available integer;
  v_source text;
  v_file_url text;
  v_file_path text;
BEGIN
  v_user := auth.uid();
  v_company_id := public.get_auth_company_id();

  IF v_user IS NULL OR v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT role, full_name INTO v_role, v_returner_name
  FROM public.profiles
  WHERE id = v_user AND company_id = v_company_id;

  IF v_role IS NULL OR v_role NOT IN ('mobile_sales', 'sales_agent', 'team_leader') THEN
    RETURN json_build_object('success', false, 'error', 'Only mobile sales or team leaders can file a client return');
  END IF;

  SELECT c.company_account_type INTO v_account_type
  FROM public.companies c
  WHERE c.id = v_company_id;

  IF v_account_type IS DISTINCT FROM 'Standard Accounts' THEN
    RETURN json_build_object('success', false, 'error', 'Only Standard Accounts can file client order returns');
  END IF;

  v_hub := public.get_linked_warehouse_company_id();
  IF v_hub IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'This company is not linked to a warehouse');
  END IF;

  SELECT * INTO v_order
  FROM public.client_orders
  WHERE id = p_client_order_id
    AND company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF NOT (v_order.status = 'approved' OR v_order.stage = 'admin_approved') THEN
    RETURN json_build_object('success', false, 'error', 'Only approved orders can be returned');
  END IF;

  IF v_role IN ('mobile_sales', 'sales_agent') AND v_order.agent_id IS DISTINCT FROM v_user THEN
    RETURN json_build_object('success', false, 'error', 'You can only return your own orders');
  END IF;

  IF v_role = 'team_leader'
     AND v_order.agent_id IS DISTINCT FROM v_user
     AND NOT public.is_client_order_return_team_leader_of(v_order.agent_id)
  THEN
    RETURN json_build_object('success', false, 'error', 'You can only return orders from your team');
  END IF;

  IF p_return_date IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Returned date is required');
  END IF;

  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Reason is required');
  END IF;

  IF p_agent_signature_url IS NULL OR length(btrim(COALESCE(p_agent_signature_url, ''))) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Signature is required');
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'At least one return line is required');
  END IF;

  IF p_change_items IS NULL OR jsonb_typeof(p_change_items) <> 'array' OR jsonb_array_length(p_change_items) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Change items are required');
  END IF;

  IF p_attachments IS NULL OR jsonb_typeof(p_attachments) <> 'array' OR jsonb_array_length(p_attachments) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'At least one proof photo is required');
  END IF;

  SELECT COALESCE(c.name, 'Client')
  INTO v_client_name
  FROM public.clients c
  WHERE c.id = v_order.client_id;

  DROP TABLE IF EXISTS _cr_ret;
  DROP TABLE IF EXISTS _cr_chg;
  CREATE TEMP TABLE _cr_ret (
    client_order_item_id uuid PRIMARY KEY,
    variant_id uuid NOT NULL,
    brand_id uuid NOT NULL,
    variant_type_id uuid,
    variant_name text NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(10,2) NOT NULL,
    line_total numeric(10,2) NOT NULL
  ) ON COMMIT DROP;
  CREATE TEMP TABLE _cr_chg (
    variant_id uuid PRIMARY KEY,
    brand_id uuid NOT NULL,
    variant_type_id uuid,
    variant_name text NOT NULL,
    quantity integer NOT NULL
  ) ON COMMIT DROP;

  FOR v_elem IN SELECT t.elem FROM jsonb_array_elements(p_items) AS t(elem)
  LOOP
    v_item_id := NULLIF(v_elem->>'client_order_item_id', '')::uuid;
    v_qty := COALESCE((v_elem->>'quantity')::integer, 0);
    IF v_item_id IS NULL OR v_qty <= 0 THEN
      RETURN json_build_object('success', false, 'error', 'Each return line needs a sold item and qty > 0');
    END IF;

    SELECT coi.quantity, coi.variant_id, coi.unit_price, v.brand_id, v.variant_type_id, v.name
    INTO v_sold, v_variant_id, v_unit_price, v_brand_id, v_variant_type_id, v_variant_name
    FROM public.client_order_items coi
    JOIN public.variants v ON v.id = coi.variant_id
    WHERE coi.id = v_item_id
      AND coi.client_order_id = p_client_order_id
      AND coi.company_id = v_company_id;

    IF v_sold IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Return line is not on this order');
    END IF;

    IF v_brand_id IS NULL THEN
      RETURN json_build_object('success', false, 'error', format('Variant %s is missing a brand', COALESCE(v_variant_name, 'item')));
    END IF;

    SELECT COALESCE(SUM(i.quantity), 0) INTO v_posted
    FROM public.client_order_return_items i
    JOIN public.client_order_returns r ON r.id = i.return_id
    WHERE i.client_order_item_id = v_item_id
      AND r.status = 'posted';

    IF v_qty > (v_sold - v_posted) THEN
      RETURN json_build_object(
        'success', false,
        'error',
        format('Return qty for %s exceeds remaining (%s sold, %s already posted)', v_variant_name, v_sold, v_posted)
      );
    END IF;

    INSERT INTO _cr_ret (
      client_order_item_id, variant_id, brand_id, variant_type_id, variant_name, quantity, unit_price, line_total
    ) VALUES (
      v_item_id, v_variant_id, v_brand_id, v_variant_type_id, v_variant_name, v_qty, COALESCE(v_unit_price, 0),
      round(COALESCE(v_unit_price, 0) * v_qty, 2)
    );
  END LOOP;

  FOR v_elem IN SELECT t.elem FROM jsonb_array_elements(p_change_items) AS t(elem)
  LOOP
    v_variant_id := NULLIF(v_elem->>'variant_id', '')::uuid;
    v_qty := COALESCE((v_elem->>'quantity')::integer, 0);
    IF v_variant_id IS NULL OR v_qty <= 0 THEN
      RETURN json_build_object('success', false, 'error', 'Each change line needs a variant and qty > 0');
    END IF;

    SELECT v.brand_id, v.variant_type_id, v.name
    INTO v_brand_id, v_variant_type_id, v_variant_name
    FROM public.variants v
    WHERE v.id = v_variant_id;

    IF v_variant_name IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Change item variant not found');
    END IF;

    IF v_brand_id IS NULL THEN
      RETURN json_build_object('success', false, 'error', format('Change item %s is missing a brand', v_variant_name));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM _cr_ret r WHERE r.brand_id = v_brand_id) THEN
      RETURN json_build_object('success', false, 'error', format('Change item %s is not the same brand as a returned item', v_variant_name));
    END IF;

    SELECT COALESCE(stock, 0) INTO v_available
    FROM public.agent_inventory
    WHERE company_id = v_company_id
      AND agent_id = v_user
      AND variant_id = v_variant_id;

    IF COALESCE(v_available, 0) < v_qty THEN
      RETURN json_build_object('success', false, 'error', format('Not enough stock to change %s', v_variant_name));
    END IF;

    INSERT INTO _cr_chg (variant_id, brand_id, variant_type_id, variant_name, quantity)
    VALUES (v_variant_id, v_brand_id, v_variant_type_id, v_variant_name, v_qty);
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT brand_id, SUM(quantity) AS qty FROM _cr_ret GROUP BY brand_id
    ) r
    FULL OUTER JOIN (
      SELECT brand_id, SUM(quantity) AS qty FROM _cr_chg GROUP BY brand_id
    ) c ON c.brand_id = r.brand_id
    WHERE COALESCE(r.qty, 0) IS DISTINCT FROM COALESCE(c.qty, 0)
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Change qty must match returned qty per brand');
  END IF;

  FOR v_elem IN SELECT t.elem FROM jsonb_array_elements(p_attachments) AS t(elem)
  LOOP
    IF NULLIF(btrim(COALESCE(v_elem->>'file_url', '')), '') IS NULL
       OR NULLIF(btrim(COALESCE(v_elem->>'file_path', '')), '') IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Each proof photo needs file_url and file_path');
    END IF;
  END LOOP;

  v_status := CASE WHEN v_role = 'team_leader' THEN 'posted' ELSE 'pending_leader' END;
  v_return_number := public.generate_client_order_return_number(v_company_id);

  INSERT INTO public.client_order_returns (
    return_number, company_id, client_order_id, order_number,
    client_id, client_name, returned_by, returned_by_name, original_agent_id,
    return_date, reason, notes, status, agent_signature_url,
    approved_at, approved_by, approved_by_name
  ) VALUES (
    v_return_number, v_company_id, v_order.id, v_order.order_number,
    v_order.client_id, COALESCE(v_client_name, 'Client'), v_user, v_returner_name, v_order.agent_id,
    p_return_date, btrim(p_reason), NULLIF(btrim(COALESCE(p_notes, '')), ''), v_status,
    btrim(p_agent_signature_url),
    CASE WHEN v_status = 'posted' THEN now() ELSE NULL END,
    CASE WHEN v_status = 'posted' THEN v_user ELSE NULL END,
    CASE WHEN v_status = 'posted' THEN v_returner_name ELSE NULL END
  )
  RETURNING id INTO v_return_id;

  INSERT INTO public.client_order_return_items (
    return_id, company_id, client_order_item_id, variant_id,
    brand_id, variant_type_id, quantity, unit_price, line_total
  )
  SELECT v_return_id, v_company_id, client_order_item_id, variant_id,
         brand_id, variant_type_id, quantity, unit_price, line_total
  FROM _cr_ret;

  INSERT INTO public.client_order_return_change_items (
    return_id, company_id, variant_id, brand_id, variant_type_id, quantity
  )
  SELECT v_return_id, v_company_id, variant_id, brand_id, variant_type_id, quantity
  FROM _cr_chg;

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

    INSERT INTO public.client_order_return_attachments (
      return_id, company_id, file_url, file_path, file_name, content_type, source, sort_order, uploaded_by
    ) VALUES (
      v_return_id,
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

  IF v_status = 'posted' THEN
    PERFORM public.apply_client_order_return_posted_stock(v_return_id, v_user);
  END IF;

  RETURN json_build_object(
    'success', true,
    'id', v_return_id,
    'return_number', v_return_number,
    'status', v_status
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('success', false, 'error', 'Duplicate return line');
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

ALTER TABLE public.client_order_return_items
  DROP COLUMN IF EXISTS brand_name,
  DROP COLUMN IF EXISTS variant_name,
  DROP COLUMN IF EXISTS variant_type;

ALTER TABLE public.client_order_return_change_items
  DROP COLUMN IF EXISTS brand_name,
  DROP COLUMN IF EXISTS variant_name,
  DROP COLUMN IF EXISTS variant_type;
