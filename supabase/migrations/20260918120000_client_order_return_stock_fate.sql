-- Per returned line: restock (sellable bag) or disposal (returned_stock / RL holds).
-- Does not change CR type (change_item | refund).

ALTER TABLE public.client_order_return_items
  ADD COLUMN IF NOT EXISTS stock_fate text NOT NULL DEFAULT 'disposal';

ALTER TABLE public.client_order_return_items
  DROP CONSTRAINT IF EXISTS client_order_return_items_stock_fate_check;

ALTER TABLE public.client_order_return_items
  ADD CONSTRAINT client_order_return_items_stock_fate_check
  CHECK (stock_fate IN ('restock', 'disposal'));

COMMENT ON COLUMN public.client_order_return_items.stock_fate IS
  'restock = returned qty goes back to the agent sellable bag. disposal = returned_stock / warehouse disposal path.';

CREATE INDEX IF NOT EXISTS idx_client_order_return_items_stock_fate
  ON public.client_order_return_items (return_id, stock_fate);

-- Holds ledger only counts disposal lines (restock never enters returned_stock).
CREATE OR REPLACE FUNCTION public.backfill_client_return_stock_holds(p_company_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.client_return_stock_holds (company_id, holder_id, variant_id, brand_id, qty_on_hand)
  SELECT
    cr.company_id,
    COALESCE(cr.original_agent_id, cr.returned_by) AS holder_id,
    i.variant_id,
    i.brand_id,
    SUM(i.quantity)::integer AS qty
  FROM public.client_order_returns cr
  JOIN public.client_order_return_items i ON i.return_id = cr.id
  WHERE cr.status = 'posted'
    AND COALESCE(i.stock_fate, 'disposal') = 'disposal'
    AND COALESCE(cr.original_agent_id, cr.returned_by) IS NOT NULL
    AND (p_company_id IS NULL OR cr.company_id = p_company_id)
  GROUP BY cr.company_id, COALESCE(cr.original_agent_id, cr.returned_by), i.variant_id, i.brand_id
  ON CONFLICT (company_id, holder_id, variant_id)
  DO UPDATE SET
    qty_on_hand = EXCLUDED.qty_on_hand,
    brand_id = COALESCE(EXCLUDED.brand_id, public.client_return_stock_holds.brand_id),
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_client_order_return_posted_stock(
  p_return_id uuid,
  p_performed_by uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_header public.client_order_returns%ROWTYPE;
  v_line RECORD;
  v_holder uuid;
  v_change_holder uuid;
  v_variant_name text;
  v_updated integer;
  v_fate text;
BEGIN
  SELECT * INTO v_header
  FROM public.client_order_returns
  WHERE id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return not found';
  END IF;

  v_holder := COALESCE(v_header.original_agent_id, v_header.returned_by);
  v_change_holder := COALESCE(v_header.returned_by, v_header.original_agent_id);

  FOR v_line IN
    SELECT
      variant_id,
      brand_id,
      COALESCE(stock_fate, 'disposal') AS stock_fate,
      SUM(quantity) AS qty
    FROM public.client_order_return_items
    WHERE return_id = p_return_id
    GROUP BY variant_id, brand_id, COALESCE(stock_fate, 'disposal')
  LOOP
    v_fate := v_line.stock_fate;

    IF v_fate = 'restock' THEN
      IF v_holder IS NULL THEN
        RAISE EXCEPTION 'Cannot restock: missing agent';
      END IF;

      UPDATE public.agent_inventory
      SET
        stock = COALESCE(stock, 0) + v_line.qty,
        status = CASE
          WHEN COALESCE(stock, 0) + v_line.qty <= 0 THEN 'none'
          WHEN COALESCE(stock, 0) + v_line.qty <= 10 THEN 'low'
          ELSE 'available'
        END,
        updated_at = now()
      WHERE company_id = v_header.company_id
        AND agent_id = v_holder
        AND variant_id = v_line.variant_id;

      GET DIAGNOSTICS v_updated = ROW_COUNT;
      IF v_updated = 0 THEN
        INSERT INTO public.agent_inventory (
          company_id, agent_id, variant_id, stock, returned_stock, allocated_price, status, allocated_at, updated_at
        ) VALUES (
          v_header.company_id,
          v_holder,
          v_line.variant_id,
          v_line.qty,
          0,
          0,
          CASE WHEN v_line.qty <= 10 THEN 'low' ELSE 'available' END,
          now(),
          now()
        );
      END IF;

      INSERT INTO public.inventory_transactions (
        company_id, variant_id, transaction_type, quantity,
        from_location, to_location,
        reference_type, reference_id, performed_by, notes, created_at
      ) VALUES (
        v_header.company_id,
        v_line.variant_id,
        'client_order_return',
        v_line.qty,
        'client_return',
        'agent_inventory:' || v_holder::text,
        'client_order_return',
        p_return_id,
        p_performed_by,
        'Client order return restock ' || v_header.return_number,
        now()
      );
    ELSE
      UPDATE public.main_inventory
      SET returned_stock = COALESCE(returned_stock, 0) + v_line.qty,
          updated_at = now()
      WHERE company_id = v_header.company_id
        AND variant_id = v_line.variant_id;

      IF NOT FOUND THEN
        INSERT INTO public.main_inventory (
          company_id, variant_id, stock, allocated_stock, returned_stock, status, updated_at
        ) VALUES (
          v_header.company_id, v_line.variant_id, 0, 0, v_line.qty, 'in-stock', now()
        );
      END IF;

      IF v_holder IS NOT NULL THEN
        PERFORM public.add_client_return_stock_hold(
          v_header.company_id,
          v_holder,
          v_line.variant_id,
          v_line.brand_id,
          v_line.qty
        );

        UPDATE public.agent_inventory
        SET returned_stock = COALESCE(returned_stock, 0) + v_line.qty,
            updated_at = now()
        WHERE company_id = v_header.company_id
          AND agent_id = v_holder
          AND variant_id = v_line.variant_id;

        IF NOT FOUND THEN
          INSERT INTO public.agent_inventory (
            company_id, agent_id, variant_id, stock, returned_stock, allocated_price, status, allocated_at, updated_at
          ) VALUES (
            v_header.company_id, v_holder, v_line.variant_id, 0, v_line.qty, 0, 'available', now(), now()
          );
        END IF;
      END IF;

      INSERT INTO public.inventory_transactions (
        company_id, variant_id, transaction_type, quantity,
        reference_type, reference_id, performed_by, notes, created_at
      ) VALUES (
        v_header.company_id,
        v_line.variant_id,
        'client_order_return',
        v_line.qty,
        'client_order_return',
        p_return_id,
        p_performed_by,
        'Client order return disposal ' || v_header.return_number,
        now()
      );
    END IF;
  END LOOP;

  FOR v_line IN
    SELECT variant_id, SUM(quantity) AS qty
    FROM public.client_order_return_change_items
    WHERE return_id = p_return_id
    GROUP BY variant_id
  LOOP
    IF v_change_holder IS NULL THEN
      RAISE EXCEPTION 'Cannot issue change items: missing agent';
    END IF;

    SELECT v.name INTO v_variant_name
    FROM public.variants v
    WHERE v.id = v_line.variant_id;

    UPDATE public.agent_inventory
    SET
      stock = stock - v_line.qty,
      status = CASE
        WHEN stock - v_line.qty <= 0 THEN 'none'
        WHEN stock - v_line.qty <= 10 THEN 'low'
        ELSE 'available'
      END,
      updated_at = now()
    WHERE company_id = v_header.company_id
      AND agent_id = v_change_holder
      AND variant_id = v_line.variant_id
      AND COALESCE(stock, 0) >= v_line.qty;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      RAISE EXCEPTION 'Not enough stock to change %', COALESCE(v_variant_name, 'item');
    END IF;

    INSERT INTO public.inventory_transactions (
      company_id, variant_id, transaction_type, quantity,
      from_location, to_location,
      reference_type, reference_id, performed_by, notes, created_at
    ) VALUES (
      v_header.company_id,
      v_line.variant_id,
      'client_order_return',
      v_line.qty,
      'agent_inventory:' || v_change_holder::text,
      'client_exchange',
      'client_order_return',
      p_return_id,
      p_performed_by,
      'Client order return change item ' || v_header.return_number,
      now()
    );
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.apply_client_order_return_posted_stock(uuid, uuid) IS
  'On posted CR: restock lines add sellable agent stock; disposal lines go to returned_stock/holds; change qty still deducts from the filer bag.';

CREATE OR REPLACE FUNCTION public.create_client_order_return(
  p_client_order_id uuid,
  p_return_date date,
  p_reason text,
  p_notes text,
  p_agent_signature_url text,
  p_items jsonb,
  p_change_items jsonb,
  p_attachments jsonb,
  p_return_type text DEFAULT 'change_item'
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
  v_return_type text;
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
  v_stock_fate text;
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

  v_return_type := COALESCE(NULLIF(btrim(lower(p_return_type)), ''), 'change_item');
  IF v_return_type = 'change' THEN
    v_return_type := 'change_item';
  END IF;
  IF v_return_type NOT IN ('change_item', 'refund') THEN
    RETURN json_build_object('success', false, 'error', 'Return type must be change item or refund');
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

  IF v_return_type = 'refund' THEN
    IF p_change_items IS NOT NULL
       AND jsonb_typeof(p_change_items) = 'array'
       AND jsonb_array_length(p_change_items) > 0 THEN
      RETURN json_build_object('success', false, 'error', 'Refunds cannot include change items');
    END IF;
  ELSE
    IF p_change_items IS NULL OR jsonb_typeof(p_change_items) <> 'array' OR jsonb_array_length(p_change_items) = 0 THEN
      RETURN json_build_object('success', false, 'error', 'Change items are required');
    END IF;
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
    line_total numeric(10,2) NOT NULL,
    stock_fate text NOT NULL
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
    v_stock_fate := lower(btrim(COALESCE(v_elem->>'stock_fate', '')));
    IF v_item_id IS NULL OR v_qty <= 0 THEN
      RETURN json_build_object('success', false, 'error', 'Each return line needs a sold item and qty > 0');
    END IF;
    IF v_stock_fate NOT IN ('restock', 'disposal') THEN
      RETURN json_build_object(
        'success', false,
        'error',
        'Choose Restock or Disposal for each returned item'
      );
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
      client_order_item_id, variant_id, brand_id, variant_type_id, variant_name, quantity, unit_price, line_total, stock_fate
    ) VALUES (
      v_item_id, v_variant_id, v_brand_id, v_variant_type_id, v_variant_name, v_qty, COALESCE(v_unit_price, 0),
      round(COALESCE(v_unit_price, 0) * v_qty, 2), v_stock_fate
    );
  END LOOP;

  IF v_return_type = 'change_item' THEN
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
  END IF;

  FOR v_elem IN SELECT t.elem FROM jsonb_array_elements(p_attachments) AS t(elem)
  LOOP
    IF NULLIF(btrim(COALESCE(v_elem->>'file_url', '')), '') IS NULL
       OR NULLIF(btrim(COALESCE(v_elem->>'file_path', '')), '') IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Each proof photo needs file_url and file_path');
    END IF;
  END LOOP;

  IF v_return_type = 'refund' THEN
    v_status := 'pending_super_admin';
  ELSE
    v_status := CASE WHEN v_role = 'team_leader' THEN 'posted' ELSE 'pending_leader' END;
  END IF;
  v_return_number := public.generate_client_order_return_number(v_company_id);

  INSERT INTO public.client_order_returns (
    return_number, company_id, client_order_id, order_number,
    client_id, client_name, returned_by, returned_by_name, original_agent_id,
    return_date, reason, notes, status, return_type, agent_signature_url,
    approved_at, approved_by, approved_by_name
  ) VALUES (
    v_return_number, v_company_id, v_order.id, v_order.order_number,
    v_order.client_id, COALESCE(v_client_name, 'Client'), v_user, v_returner_name, v_order.agent_id,
    p_return_date, btrim(p_reason), NULLIF(btrim(COALESCE(p_notes, '')), ''), v_status,
    v_return_type, btrim(p_agent_signature_url),
    CASE WHEN v_status = 'posted' THEN now() ELSE NULL END,
    CASE WHEN v_status = 'posted' THEN v_user ELSE NULL END,
    CASE WHEN v_status = 'posted' THEN v_returner_name ELSE NULL END
  )
  RETURNING id INTO v_return_id;

  INSERT INTO public.client_order_return_items (
    return_id, company_id, client_order_item_id, variant_id,
    brand_id, variant_type_id, quantity, unit_price, line_total, stock_fate
  )
  SELECT v_return_id, v_company_id, client_order_item_id, variant_id,
         brand_id, variant_type_id, quantity, unit_price, line_total, stock_fate
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
