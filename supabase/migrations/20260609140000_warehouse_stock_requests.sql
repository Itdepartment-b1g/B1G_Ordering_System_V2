-- Phase 2: Warehouse inbound stock requests + receive (creates inventory batches).

-- ---------------------------------------------------------------------------
-- 1) Extend inventory_transactions for warehouse stock receive
-- ---------------------------------------------------------------------------
ALTER TABLE public.inventory_transactions DROP CONSTRAINT IF EXISTS inventory_transactions_transaction_type_check;
ALTER TABLE public.inventory_transactions ADD CONSTRAINT inventory_transactions_transaction_type_check
  CHECK (transaction_type = ANY (ARRAY[
    'purchase_order_received'::text,
    'allocated_to_agent'::text,
    'order_fulfilled'::text,
    'adjustment'::text,
    'return'::text,
    'return_to_main'::text,
    'warehouse_transfer_out'::text,
    'warehouse_transfer_in'::text,
    'warehouse_allocate_to_sub'::text,
    'warehouse_return_from_sub'::text,
    'rebate_return_in'::text,
    'rebate_return_disposed'::text,
    'warehouse_stock_receive'::text
  ]));

-- ---------------------------------------------------------------------------
-- 2) Request number counter
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.warehouse_stock_request_number_counters (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  year_month text NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, year_month)
);

-- ---------------------------------------------------------------------------
-- 3) warehouse_stock_requests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.warehouse_stock_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  request_number text NOT NULL,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending_receive' CHECK (
    status IN ('pending_receive', 'partially_received', 'fully_received', 'cancelled')
  ),
  expected_delivery_date date,
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  cancelled_at timestamp with time zone,
  cancelled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  cancellation_reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT warehouse_stock_requests_company_request_number_key
    UNIQUE (company_id, request_number)
);

CREATE INDEX IF NOT EXISTS idx_warehouse_stock_requests_company_status
  ON public.warehouse_stock_requests(company_id, status, created_at DESC);

DROP TRIGGER IF EXISTS update_warehouse_stock_requests_updated_at ON public.warehouse_stock_requests;
CREATE TRIGGER update_warehouse_stock_requests_updated_at
  BEFORE UPDATE ON public.warehouse_stock_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 4) warehouse_stock_request_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.warehouse_stock_request_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES public.warehouse_stock_requests(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.variants(id) ON DELETE RESTRICT,
  ordered_quantity integer NOT NULL CHECK (ordered_quantity > 0),
  received_quantity integer NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT warehouse_stock_request_items_request_variant_key
    UNIQUE (request_id, variant_id),
  CONSTRAINT warehouse_stock_request_items_received_lte_ordered
    CHECK (received_quantity <= ordered_quantity)
);

CREATE INDEX IF NOT EXISTS idx_warehouse_stock_request_items_request
  ON public.warehouse_stock_request_items(request_id);

-- ---------------------------------------------------------------------------
-- 5) warehouse_stock_request_receives (each receive event -> one batch)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.warehouse_stock_request_receives (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES public.warehouse_stock_requests(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.inventory_batches(id) ON DELETE RESTRICT,
  received_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  received_at timestamp with time zone DEFAULT now() NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_warehouse_stock_request_receives_request
  ON public.warehouse_stock_request_receives(request_id);

-- Link batches to stock requests
ALTER TABLE public.inventory_batches
  DROP CONSTRAINT IF EXISTS inventory_batches_stock_request_id_fkey;

ALTER TABLE public.inventory_batches
  ADD CONSTRAINT inventory_batches_stock_request_id_fkey
  FOREIGN KEY (stock_request_id) REFERENCES public.warehouse_stock_requests(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 6) Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_warehouse_stock_request_number(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_year_month text;
  v_next integer;
BEGIN
  v_year_month := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');

  INSERT INTO public.warehouse_stock_request_number_counters (company_id, year_month, last_number)
  VALUES (p_company_id, v_year_month, 1)
  ON CONFLICT (company_id, year_month)
  DO UPDATE SET last_number = public.warehouse_stock_request_number_counters.last_number + 1
  RETURNING last_number INTO v_next;

  RETURN 'WSR-' || v_year_month || '-' || lpad(v_next::text, 5, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.receive_inventory_lots_to_main(
  p_company_id uuid,
  p_batch_id uuid,
  p_main_location_id uuid,
  p_variant_id uuid,
  p_quantity integer,
  p_received_at timestamptz,
  p_reference_type text,
  p_reference_id uuid,
  p_performed_by uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lot_id uuid;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Quantity must be positive');
  END IF;

  INSERT INTO public.inventory_batch_lots (
    company_id, batch_id, variant_id, warehouse_location_id,
    quantity_received, quantity_remaining, received_at
  ) VALUES (
    p_company_id, p_batch_id, p_variant_id, p_main_location_id,
    p_quantity, p_quantity, p_received_at
  )
  ON CONFLICT (batch_id, variant_id, warehouse_location_id)
  DO UPDATE SET
    quantity_received = public.inventory_batch_lots.quantity_received + EXCLUDED.quantity_received,
    quantity_remaining = public.inventory_batch_lots.quantity_remaining + EXCLUDED.quantity_remaining,
    updated_at = now()
  RETURNING id INTO v_lot_id;

  INSERT INTO public.inventory_batch_movements (
    company_id, lot_id, batch_id, variant_id, warehouse_location_id,
    movement_type, quantity, reference_type, reference_id,
    to_location_id, performed_by, notes
  ) VALUES (
    p_company_id, v_lot_id, p_batch_id, p_variant_id, p_main_location_id,
    'receive', p_quantity, p_reference_type, p_reference_id,
    p_main_location_id, p_performed_by, p_notes
  );

  IF EXISTS (
    SELECT 1 FROM public.main_inventory mi
    WHERE mi.company_id = p_company_id AND mi.variant_id = p_variant_id
  ) THEN
    UPDATE public.main_inventory
    SET stock = stock + p_quantity,
        last_restocked_at = p_received_at,
        updated_at = now()
    WHERE company_id = p_company_id AND variant_id = p_variant_id;
  ELSE
    INSERT INTO public.main_inventory (
      company_id, variant_id, stock, unit_price, reorder_level, last_restocked_at, created_at, updated_at
    ) VALUES (
      p_company_id, p_variant_id, p_quantity, 0, 10, p_received_at, now(), now()
    );
  END IF;

  INSERT INTO public.inventory_transactions (
    company_id, variant_id, transaction_type, quantity,
    reference_type, reference_id, performed_by, notes, created_at
  ) VALUES (
    p_company_id, p_variant_id, 'warehouse_stock_receive', p_quantity,
    p_reference_type, p_reference_id, p_performed_by, p_notes, now()
  );

  RETURN jsonb_build_object('success', true, 'lot_id', v_lot_id, 'quantity', p_quantity);
END;
$$;

-- ---------------------------------------------------------------------------
-- 7) create_warehouse_stock_request
-- ---------------------------------------------------------------------------
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
BEGIN
  v_creator := COALESCE(p_created_by, auth.uid());

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

  IF NOT EXISTS (
    SELECT 1 FROM public.brands b
    WHERE b.id = p_brand_id AND b.company_id = v_company_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Brand not found');
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
        AND v.brand_id = p_brand_id
        AND v.company_id = v_company_id
    ) THEN
      RETURN json_build_object('success', false, 'error', 'Variant does not belong to the selected brand');
    END IF;

    v_line_count := v_line_count + 1;
  END LOOP;

  v_request_number := public.generate_warehouse_stock_request_number(v_company_id);

  INSERT INTO public.warehouse_stock_requests (
    company_id, request_number, brand_id, status,
    expected_delivery_date, notes, created_by
  ) VALUES (
    v_company_id, v_request_number, p_brand_id, 'pending_receive',
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
    'line_count', v_line_count
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 8) cancel_warehouse_stock_request
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_warehouse_stock_request(
  p_request_id uuid,
  p_reason text DEFAULT NULL,
  p_cancelled_by uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_request RECORD;
  v_actor uuid;
BEGIN
  v_actor := COALESCE(p_cancelled_by, auth.uid());

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

  IF v_request.status NOT IN ('pending_receive', 'partially_received') THEN
    RETURN json_build_object('success', false, 'error', 'Only open stock requests can be cancelled');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.warehouse_stock_request_items i
    WHERE i.request_id = p_request_id AND i.received_quantity > 0
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Cannot cancel a request that has received stock');
  END IF;

  UPDATE public.warehouse_stock_requests
  SET status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = v_actor,
      cancellation_reason = p_reason,
      updated_at = now()
  WHERE id = p_request_id;

  RETURN json_build_object('success', true, 'request_number', v_request.request_number);
END;
$$;

-- ---------------------------------------------------------------------------
-- 9) receive_warehouse_stock_request (each call creates a new batch)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.receive_warehouse_stock_request(
  p_request_id uuid,
  p_items jsonb,
  p_notes text DEFAULT NULL,
  p_received_by uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_request RECORD;
  v_receiver uuid;
  v_main_loc_id uuid;
  v_batch_id uuid;
  v_batch_number text;
  v_receive_id uuid;
  v_received_at timestamptz;
  v_item jsonb;
  v_variant_id uuid;
  v_quantity integer;
  v_line RECORD;
  v_remaining integer;
  v_total_received integer := 0;
  v_receive_result jsonb;
  v_all_complete boolean;
BEGIN
  v_receiver := COALESCE(p_received_by, auth.uid());
  v_received_at := now();

  SELECT * INTO v_request
  FROM public.warehouse_stock_requests
  WHERE id = p_request_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Stock request not found');
  END IF;

  IF NOT (
    public.is_system_administrator()
    OR (public.is_warehouse() AND public.is_main_warehouse_user(v_receiver)
        AND v_request.company_id = public.get_auth_company_id())
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Only main warehouse users can receive stock');
  END IF;

  IF v_request.status NOT IN ('pending_receive', 'partially_received') THEN
    RETURN json_build_object('success', false, 'error', 'Stock request is not open for receiving');
  END IF;

  v_main_loc_id := public.get_main_warehouse_location_id(v_request.company_id);
  IF v_main_loc_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Main warehouse location not found');
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'At least one receive line is required');
  END IF;

  -- Validate all lines before writing
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_variant_id := (v_item->>'variant_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

    IF v_variant_id IS NULL OR v_quantity IS NULL OR v_quantity <= 0 THEN
      RETURN json_build_object('success', false, 'error', 'Invalid receive item payload');
    END IF;

    SELECT i.* INTO v_line
    FROM public.warehouse_stock_request_items i
    WHERE i.request_id = p_request_id AND i.variant_id = v_variant_id;

    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'Variant is not on this stock request');
    END IF;

    v_remaining := v_line.ordered_quantity - v_line.received_quantity;
    IF v_quantity > v_remaining THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Receive quantity exceeds remaining for variant',
        'variant_id', v_variant_id,
        'remaining', v_remaining
      );
    END IF;
  END LOOP;

  v_batch_number := public.generate_inventory_batch_number(v_request.company_id);

  INSERT INTO public.inventory_batches (
    company_id, batch_number, source_type, stock_request_id,
    status, received_at, notes, created_by
  ) VALUES (
    v_request.company_id, v_batch_number, 'stock_request_receive', p_request_id,
    'complete', v_received_at, p_notes, v_receiver
  )
  RETURNING id INTO v_batch_id;

  INSERT INTO public.warehouse_stock_request_receives (
    request_id, batch_id, received_by, received_at, notes
  ) VALUES (
    p_request_id, v_batch_id, v_receiver, v_received_at, p_notes
  )
  RETURNING id INTO v_receive_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_variant_id := (v_item->>'variant_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

    IF v_quantity <= 0 THEN
      CONTINUE;
    END IF;

    v_receive_result := public.receive_inventory_lots_to_main(
      v_request.company_id,
      v_batch_id,
      v_main_loc_id,
      v_variant_id,
      v_quantity,
      v_received_at,
      'warehouse_stock_request',
      p_request_id,
      v_receiver,
      'Receive ' || v_request.request_number || ' batch ' || v_batch_number
    );

    IF NOT COALESCE((v_receive_result->>'success')::boolean, false) THEN
      RETURN json_build_object(
        'success', false,
        'error', COALESCE(v_receive_result->>'error', 'Failed to receive inventory lots'),
        'variant_id', v_variant_id
      );
    END IF;

    UPDATE public.warehouse_stock_request_items
    SET received_quantity = received_quantity + v_quantity
    WHERE request_id = p_request_id AND variant_id = v_variant_id;

    v_total_received := v_total_received + v_quantity;
  END LOOP;

  IF v_total_received <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'No quantity received');
  END IF;

  SELECT NOT EXISTS (
    SELECT 1
    FROM public.warehouse_stock_request_items i
    WHERE i.request_id = p_request_id
      AND i.received_quantity < i.ordered_quantity
  ) INTO v_all_complete;

  UPDATE public.warehouse_stock_requests
  SET status = CASE WHEN v_all_complete THEN 'fully_received' ELSE 'partially_received' END,
      updated_at = now()
  WHERE id = p_request_id;

  RETURN json_build_object(
    'success', true,
    'request_number', v_request.request_number,
    'batch_id', v_batch_id,
    'batch_number', v_batch_number,
    'receive_id', v_receive_id,
    'total_received', v_total_received,
    'fully_received', v_all_complete
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_warehouse_stock_request_number(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_inventory_lots_to_main(uuid, uuid, uuid, uuid, integer, timestamptz, text, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_warehouse_stock_request(uuid, jsonb, text, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_warehouse_stock_request(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_warehouse_stock_request(uuid, jsonb, text, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 10) RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.warehouse_stock_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_stock_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_stock_request_receives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_stock_request_number_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Warehouse stock requests: sysadmin all" ON public.warehouse_stock_requests;
CREATE POLICY "Warehouse stock requests: sysadmin all"
  ON public.warehouse_stock_requests FOR ALL
  USING (public.is_system_administrator())
  WITH CHECK (public.is_system_administrator());

DROP POLICY IF EXISTS "Warehouse stock requests: warehouse select own company" ON public.warehouse_stock_requests;
CREATE POLICY "Warehouse stock requests: warehouse select own company"
  ON public.warehouse_stock_requests FOR SELECT
  USING (
    public.is_warehouse()
    AND company_id = public.get_auth_company_id()
  );

DROP POLICY IF EXISTS "Warehouse stock request items: sysadmin all" ON public.warehouse_stock_request_items;
CREATE POLICY "Warehouse stock request items: sysadmin all"
  ON public.warehouse_stock_request_items FOR ALL
  USING (public.is_system_administrator())
  WITH CHECK (public.is_system_administrator());

DROP POLICY IF EXISTS "Warehouse stock request items: warehouse select" ON public.warehouse_stock_request_items;
CREATE POLICY "Warehouse stock request items: warehouse select"
  ON public.warehouse_stock_request_items FOR SELECT
  USING (
    public.is_warehouse()
    AND EXISTS (
      SELECT 1 FROM public.warehouse_stock_requests r
      WHERE r.id = warehouse_stock_request_items.request_id
        AND r.company_id = public.get_auth_company_id()
    )
  );

DROP POLICY IF EXISTS "Warehouse stock request receives: sysadmin all" ON public.warehouse_stock_request_receives;
CREATE POLICY "Warehouse stock request receives: sysadmin all"
  ON public.warehouse_stock_request_receives FOR ALL
  USING (public.is_system_administrator())
  WITH CHECK (public.is_system_administrator());

DROP POLICY IF EXISTS "Warehouse stock request receives: warehouse select" ON public.warehouse_stock_request_receives;
CREATE POLICY "Warehouse stock request receives: warehouse select"
  ON public.warehouse_stock_request_receives FOR SELECT
  USING (
    public.is_warehouse()
    AND EXISTS (
      SELECT 1 FROM public.warehouse_stock_requests r
      WHERE r.id = warehouse_stock_request_receives.request_id
        AND r.company_id = public.get_auth_company_id()
    )
  );

DROP POLICY IF EXISTS "Warehouse stock request counters: sysadmin all" ON public.warehouse_stock_request_number_counters;
CREATE POLICY "Warehouse stock request counters: sysadmin all"
  ON public.warehouse_stock_request_number_counters FOR ALL
  USING (public.is_system_administrator())
  WITH CHECK (public.is_system_administrator());

GRANT SELECT ON public.warehouse_stock_requests TO authenticated;
GRANT SELECT ON public.warehouse_stock_request_items TO authenticated;
GRANT SELECT ON public.warehouse_stock_request_receives TO authenticated;

COMMENT ON TABLE public.warehouse_stock_requests IS
  'Inbound stock requests by brand for warehouse hub. Each receive event creates a new inventory batch.';
COMMENT ON FUNCTION public.receive_warehouse_stock_request IS
  'Receives stock against a warehouse stock request. Each call creates BATCH-YYYY-MM-##### and credits main_inventory + batch lots.';
