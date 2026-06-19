-- Sub-warehouse stock return requests: submit from sub, inspect (good/damaged) at main.
-- Good qty: LIFO batch transfer sub -> main + reduce allocated_stock.
-- Damaged qty: transfer to main then FIFO consume + disposal log.

-- ---------------------------------------------------------------------------
-- 1) Transaction types
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
    'warehouse_stock_receive'::text,
    'warehouse_return_in'::text,
    'warehouse_return_disposed'::text
  ]));

ALTER TABLE public.inventory_batch_movements
  DROP CONSTRAINT IF EXISTS inventory_batch_movements_movement_type_check;
ALTER TABLE public.inventory_batch_movements
  ADD CONSTRAINT inventory_batch_movements_movement_type_check
  CHECK (movement_type = ANY (ARRAY[
    'receive'::text,
    'allocate_out'::text,
    'allocate_in'::text,
    'return_out'::text,
    'return_in'::text,
    'fulfill_out'::text,
    'adjustment_in'::text,
    'adjustment_out'::text,
    'opening_balance'::text,
    'rebate_return_in'::text,
    'warehouse_return_disposed'::text
  ]));

-- ---------------------------------------------------------------------------
-- 2) Disposals: sub-warehouse return source
-- ---------------------------------------------------------------------------
ALTER TABLE public.warehouse_inventory_disposals
  DROP CONSTRAINT IF EXISTS warehouse_inventory_disposals_source_type_check;
ALTER TABLE public.warehouse_inventory_disposals
  ADD CONSTRAINT warehouse_inventory_disposals_source_type_check
  CHECK (source_type = ANY (ARRAY[
    'rebate_return'::text,
    'adjustment'::text,
    'other'::text,
    'sub_warehouse_return'::text
  ]));

ALTER TABLE public.warehouse_inventory_disposals
  ADD COLUMN IF NOT EXISTS stock_return_request_id uuid;

-- ---------------------------------------------------------------------------
-- 3) Request number counter
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.warehouse_stock_return_number_counters (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  year_month text NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, year_month)
);

-- ---------------------------------------------------------------------------
-- 4) warehouse_stock_return_requests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.warehouse_stock_return_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  request_number text NOT NULL,
  from_location_id uuid NOT NULL REFERENCES public.warehouse_locations(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending_receive' CHECK (
    status IN ('pending_receive', 'partially_received', 'fully_received', 'cancelled')
  ),
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  cancelled_at timestamp with time zone,
  cancelled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  cancellation_reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT warehouse_stock_return_requests_company_request_number_key
    UNIQUE (company_id, request_number)
);

CREATE INDEX IF NOT EXISTS idx_warehouse_stock_return_requests_company_status
  ON public.warehouse_stock_return_requests(company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_warehouse_stock_return_requests_from_location
  ON public.warehouse_stock_return_requests(from_location_id, status);

DROP TRIGGER IF EXISTS update_warehouse_stock_return_requests_updated_at ON public.warehouse_stock_return_requests;
CREATE TRIGGER update_warehouse_stock_return_requests_updated_at
  BEFORE UPDATE ON public.warehouse_stock_return_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 5) warehouse_stock_return_request_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.warehouse_stock_return_request_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES public.warehouse_stock_return_requests(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.variants(id) ON DELETE RESTRICT,
  return_quantity integer NOT NULL CHECK (return_quantity > 0),
  inspected_quantity integer NOT NULL DEFAULT 0 CHECK (inspected_quantity >= 0),
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT warehouse_stock_return_request_items_request_variant_key
    UNIQUE (request_id, variant_id),
  CONSTRAINT warehouse_stock_return_request_items_inspected_lte_return
    CHECK (inspected_quantity <= return_quantity)
);

CREATE INDEX IF NOT EXISTS idx_warehouse_stock_return_request_items_request
  ON public.warehouse_stock_return_request_items(request_id);

-- ---------------------------------------------------------------------------
-- 6) Receipt header + inspection lines
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.warehouse_stock_return_receipts (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES public.warehouse_stock_return_requests(id) ON DELETE CASCADE,
  received_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  received_at timestamp with time zone DEFAULT now() NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_warehouse_stock_return_receipts_request
  ON public.warehouse_stock_return_receipts(request_id);

CREATE TABLE IF NOT EXISTS public.warehouse_stock_return_receipt_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  receipt_id uuid NOT NULL REFERENCES public.warehouse_stock_return_receipts(id) ON DELETE CASCADE,
  request_item_id uuid NOT NULL REFERENCES public.warehouse_stock_return_request_items(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.variants(id) ON DELETE RESTRICT,
  qty_good integer NOT NULL DEFAULT 0 CHECK (qty_good >= 0),
  qty_damaged integer NOT NULL DEFAULT 0 CHECK (qty_damaged >= 0),
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT warehouse_stock_return_receipt_lines_qty_positive
    CHECK (qty_good + qty_damaged > 0)
);

CREATE INDEX IF NOT EXISTS idx_warehouse_stock_return_receipt_lines_receipt
  ON public.warehouse_stock_return_receipt_lines(receipt_id);

ALTER TABLE public.warehouse_inventory_disposals
  DROP CONSTRAINT IF EXISTS warehouse_inventory_disposals_stock_return_request_id_fkey;
ALTER TABLE public.warehouse_inventory_disposals
  ADD CONSTRAINT warehouse_inventory_disposals_stock_return_request_id_fkey
  FOREIGN KEY (stock_return_request_id)
  REFERENCES public.warehouse_stock_return_requests(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 7) Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_warehouse_stock_return_number(p_company_id uuid)
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

  INSERT INTO public.warehouse_stock_return_number_counters (company_id, year_month, last_number)
  VALUES (p_company_id, v_year_month, 1)
  ON CONFLICT (company_id, year_month)
  DO UPDATE SET last_number = public.warehouse_stock_return_number_counters.last_number + 1
  RETURNING last_number INTO v_next;

  RETURN 'WRT-' || v_year_month || '-' || lpad(v_next::text, 5, '0');
END;
$$;

-- ---------------------------------------------------------------------------
-- 8) create_warehouse_stock_return_request
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_warehouse_stock_return_request(
  p_from_location_id uuid,
  p_items jsonb,
  p_notes text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_creator uuid;
  v_company_id uuid;
  v_request_id uuid;
  v_request_number text;
  v_item jsonb;
  v_variant_id uuid;
  v_quantity integer;
  v_loc_stock integer;
  v_line_count integer := 0;
BEGIN
  v_creator := COALESCE(p_created_by, auth.uid());

  SELECT wl.company_id INTO v_company_id
  FROM public.warehouse_locations wl
  WHERE wl.id = p_from_location_id
    AND COALESCE(wl.is_main, false) = false;

  IF v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Sub-warehouse location not found');
  END IF;

  IF NOT (
    public.is_system_administrator()
    OR (
      public.is_warehouse()
      AND public.is_main_warehouse_user(v_creator)
      AND v_company_id = public.get_auth_company_id()
    )
    OR (
      public.is_warehouse()
      AND EXISTS (
        SELECT 1 FROM public.warehouse_location_users wlu
        WHERE wlu.user_id = v_creator
          AND wlu.location_id = p_from_location_id
      )
    )
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
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
      WHERE v.id = v_variant_id AND v.company_id = v_company_id
    ) THEN
      RETURN json_build_object('success', false, 'error', 'Variant not found for this warehouse company');
    END IF;

    SELECT wli.stock INTO v_loc_stock
    FROM public.warehouse_location_inventory wli
    WHERE wli.location_id = p_from_location_id
      AND wli.variant_id = v_variant_id
      AND wli.company_id = v_company_id;

    IF v_loc_stock IS NULL OR v_loc_stock < v_quantity THEN
      RETURN json_build_object('success', false, 'error', 'Insufficient sub-warehouse stock for a return line');
    END IF;

    v_line_count := v_line_count + 1;
  END LOOP;

  v_request_number := public.generate_warehouse_stock_return_number(v_company_id);

  INSERT INTO public.warehouse_stock_return_requests (
    company_id, request_number, from_location_id, status, notes, created_by
  ) VALUES (
    v_company_id, v_request_number, p_from_location_id, 'pending_receive',
    NULLIF(trim(p_notes), ''), v_creator
  )
  RETURNING id INTO v_request_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_variant_id := (v_item->>'variant_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

    INSERT INTO public.warehouse_stock_return_request_items (
      request_id, variant_id, return_quantity
    ) VALUES (
      v_request_id, v_variant_id, v_quantity
    );

    UPDATE public.warehouse_location_inventory
    SET stock = stock - v_quantity,
        updated_at = now()
    WHERE location_id = p_from_location_id
      AND variant_id = v_variant_id
      AND company_id = v_company_id;
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
-- 9) cancel_warehouse_stock_return_request
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_warehouse_stock_return_request(
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
  v_item RECORD;
BEGIN
  v_actor := COALESCE(p_cancelled_by, auth.uid());

  SELECT * INTO v_request
  FROM public.warehouse_stock_return_requests
  WHERE id = p_request_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Return request not found');
  END IF;

  IF NOT (
    public.is_system_administrator()
    OR (
      public.is_warehouse()
      AND public.is_main_warehouse_user(v_actor)
      AND v_request.company_id = public.get_auth_company_id()
    )
    OR (
      public.is_warehouse()
      AND v_request.created_by = v_actor
      AND EXISTS (
        SELECT 1 FROM public.warehouse_location_users wlu
        WHERE wlu.user_id = v_actor
          AND wlu.location_id = v_request.from_location_id
      )
    )
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF v_request.status NOT IN ('pending_receive', 'partially_received') THEN
    RETURN json_build_object('success', false, 'error', 'Only open return requests can be cancelled');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.warehouse_stock_return_request_items i
    WHERE i.request_id = p_request_id AND i.inspected_quantity > 0
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Cannot cancel a return that has been partially inspected');
  END IF;

  FOR v_item IN
    SELECT * FROM public.warehouse_stock_return_request_items
    WHERE request_id = p_request_id
  LOOP
    UPDATE public.warehouse_location_inventory
    SET stock = stock + (v_item.return_quantity - v_item.inspected_quantity),
        updated_at = now()
    WHERE location_id = v_request.from_location_id
      AND variant_id = v_item.variant_id
      AND company_id = v_request.company_id;
  END LOOP;

  UPDATE public.warehouse_stock_return_requests
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
-- 10) receive_warehouse_stock_return_request (inspect good / damaged)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.receive_warehouse_stock_return_request(
  p_request_id uuid,
  p_lines jsonb,
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
  v_receipt_id uuid;
  v_received_at timestamptz;
  v_line jsonb;
  v_variant_id uuid;
  v_qty_good integer;
  v_qty_damaged integer;
  v_item RECORD;
  v_remaining integer;
  v_total_qty integer;
  v_transfer_result jsonb;
  v_consume_result jsonb;
  v_all_complete boolean;
  v_total_inspected integer := 0;
BEGIN
  v_receiver := COALESCE(p_received_by, auth.uid());
  v_received_at := now();

  SELECT * INTO v_request
  FROM public.warehouse_stock_return_requests
  WHERE id = p_request_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Return request not found');
  END IF;

  IF NOT (
    public.is_system_administrator()
    OR (
      public.is_warehouse()
      AND public.is_main_warehouse_user(v_receiver)
      AND v_request.company_id = public.get_auth_company_id()
    )
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Only main warehouse users can receive returns');
  END IF;

  IF v_request.status NOT IN ('pending_receive', 'partially_received') THEN
    RETURN json_build_object('success', false, 'error', 'Return request is not open for receiving');
  END IF;

  v_main_loc_id := public.get_main_warehouse_location_id(v_request.company_id);
  IF v_main_loc_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Main warehouse location not found');
  END IF;

  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Inspection lines are required');
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_variant_id := (v_line->>'variant_id')::uuid;
    v_qty_good := COALESCE((v_line->>'qty_good')::int, 0);
    v_qty_damaged := COALESCE((v_line->>'qty_damaged')::int, 0);

    IF v_variant_id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Invalid inspection line');
    END IF;
    IF v_qty_good < 0 OR v_qty_damaged < 0 THEN
      RETURN json_build_object('success', false, 'error', 'Quantities cannot be negative');
    END IF;
    IF v_qty_good + v_qty_damaged <= 0 THEN
      RETURN json_build_object('success', false, 'error', 'Each line must have at least one inspected unit');
    END IF;

    SELECT * INTO v_item
    FROM public.warehouse_stock_return_request_items
    WHERE request_id = p_request_id AND variant_id = v_variant_id;

    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'Variant is not on this return request');
    END IF;

    v_remaining := v_item.return_quantity - v_item.inspected_quantity;
    IF v_qty_good + v_qty_damaged > v_remaining THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Inspected quantity exceeds remaining for a line',
        'variant_id', v_variant_id,
        'remaining', v_remaining
      );
    END IF;
  END LOOP;

  INSERT INTO public.warehouse_stock_return_receipts (
    request_id, received_by, received_at, notes
  ) VALUES (
    p_request_id, v_receiver, v_received_at, NULLIF(trim(p_notes), '')
  )
  RETURNING id INTO v_receipt_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_variant_id := (v_line->>'variant_id')::uuid;
    v_qty_good := COALESCE((v_line->>'qty_good')::int, 0);
    v_qty_damaged := COALESCE((v_line->>'qty_damaged')::int, 0);
    v_total_qty := v_qty_good + v_qty_damaged;

    IF v_total_qty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_item
    FROM public.warehouse_stock_return_request_items
    WHERE request_id = p_request_id AND variant_id = v_variant_id;

    INSERT INTO public.warehouse_stock_return_receipt_lines (
      receipt_id, request_item_id, variant_id, qty_good, qty_damaged
    ) VALUES (
      v_receipt_id, v_item.id, v_variant_id, v_qty_good, v_qty_damaged
    );

    v_transfer_result := public.transfer_inventory_lots(
      v_request.company_id,
      v_request.from_location_id,
      v_main_loc_id,
      v_variant_id,
      v_total_qty,
      'lifo',
      'return_out',
      'return_in',
      'warehouse_stock_return',
      p_request_id,
      v_receiver,
      'Return ' || v_request.request_number || ' inspect'
    );

    IF NOT COALESCE((v_transfer_result->>'success')::boolean, false) THEN
      RETURN json_build_object(
        'success', false,
        'error', COALESCE(v_transfer_result->>'error', 'Batch lot transfer failed'),
        'variant_id', v_variant_id
      );
    END IF;

    IF v_qty_damaged > 0 THEN
      v_consume_result := public.consume_inventory_lots_fifo(
        v_request.company_id,
        v_main_loc_id,
        v_variant_id,
        v_qty_damaged,
        'warehouse_return_disposed',
        'warehouse_stock_return',
        p_request_id,
        v_receiver,
        'Damaged on return ' || v_request.request_number
      );

      IF NOT COALESCE((v_consume_result->>'success')::boolean, false) THEN
        RETURN json_build_object(
          'success', false,
          'error', COALESCE(v_consume_result->>'error', 'Failed to consume damaged return lots'),
          'variant_id', v_variant_id
        );
      END IF;

      INSERT INTO public.warehouse_inventory_disposals (
        company_id, warehouse_location_id, variant_id, quantity,
        source_type, stock_return_request_id, notes, disposed_by
      ) VALUES (
        v_request.company_id, v_main_loc_id, v_variant_id, v_qty_damaged,
        'sub_warehouse_return', p_request_id,
        NULLIF(trim(p_notes), ''), v_receiver
      );

      INSERT INTO public.inventory_transactions (
        company_id, variant_id, transaction_type, quantity,
        reference_type, reference_id, performed_by, notes, created_at
      ) VALUES (
        v_request.company_id, v_variant_id, 'warehouse_return_disposed', v_qty_damaged,
        'warehouse_stock_return', p_request_id, v_receiver,
        'Sub-warehouse return (damaged) ' || v_request.request_number,
        v_received_at
      );
    END IF;

    IF v_qty_good > 0 THEN
      INSERT INTO public.inventory_transactions (
        company_id, variant_id, transaction_type, quantity,
        from_location, to_location, reference_type, reference_id,
        performed_by, notes, created_at
      ) VALUES (
        v_request.company_id, v_variant_id, 'warehouse_return_in', v_qty_good,
        CONCAT('warehouse_location:', v_request.from_location_id), 'main_inventory',
        'warehouse_stock_return', p_request_id, v_receiver,
        'Sub-warehouse return (good) ' || v_request.request_number,
        v_received_at
      );
    END IF;

    UPDATE public.main_inventory
    SET allocated_stock = GREATEST(0, COALESCE(allocated_stock, 0) - v_total_qty),
        updated_at = now()
    WHERE company_id = v_request.company_id
      AND variant_id = v_variant_id;

    UPDATE public.warehouse_stock_return_request_items
    SET inspected_quantity = inspected_quantity + v_total_qty
    WHERE id = v_item.id;

    v_total_inspected := v_total_inspected + v_total_qty;
  END LOOP;

  IF v_total_inspected <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'No quantity inspected');
  END IF;

  SELECT NOT EXISTS (
    SELECT 1
    FROM public.warehouse_stock_return_request_items i
    WHERE i.request_id = p_request_id
      AND i.inspected_quantity < i.return_quantity
  ) INTO v_all_complete;

  UPDATE public.warehouse_stock_return_requests
  SET status = CASE WHEN v_all_complete THEN 'fully_received' ELSE 'partially_received' END,
      updated_at = now()
  WHERE id = p_request_id;

  RETURN json_build_object(
    'success', true,
    'request_number', v_request.request_number,
    'receipt_id', v_receipt_id,
    'total_inspected', v_total_inspected,
    'fully_received', v_all_complete
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_warehouse_stock_return_number(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_warehouse_stock_return_request(uuid, jsonb, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_warehouse_stock_return_request(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_warehouse_stock_return_request(uuid, jsonb, text, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 11) RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.warehouse_stock_return_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_stock_return_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_stock_return_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_stock_return_receipt_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_stock_return_number_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Warehouse stock return requests: sysadmin all" ON public.warehouse_stock_return_requests;
CREATE POLICY "Warehouse stock return requests: sysadmin all"
  ON public.warehouse_stock_return_requests FOR ALL
  USING (public.is_system_administrator())
  WITH CHECK (public.is_system_administrator());

DROP POLICY IF EXISTS "Warehouse stock return requests: warehouse select own company" ON public.warehouse_stock_return_requests;
CREATE POLICY "Warehouse stock return requests: warehouse select own company"
  ON public.warehouse_stock_return_requests FOR SELECT
  USING (
    public.is_warehouse()
    AND company_id = public.get_auth_company_id()
  );

DROP POLICY IF EXISTS "Warehouse stock return request items: sysadmin all" ON public.warehouse_stock_return_request_items;
CREATE POLICY "Warehouse stock return request items: sysadmin all"
  ON public.warehouse_stock_return_request_items FOR ALL
  USING (public.is_system_administrator())
  WITH CHECK (public.is_system_administrator());

DROP POLICY IF EXISTS "Warehouse stock return request items: warehouse select" ON public.warehouse_stock_return_request_items;
CREATE POLICY "Warehouse stock return request items: warehouse select"
  ON public.warehouse_stock_return_request_items FOR SELECT
  USING (
    public.is_warehouse()
    AND EXISTS (
      SELECT 1 FROM public.warehouse_stock_return_requests r
      WHERE r.id = warehouse_stock_return_request_items.request_id
        AND r.company_id = public.get_auth_company_id()
    )
  );

DROP POLICY IF EXISTS "Warehouse stock return receipts: sysadmin all" ON public.warehouse_stock_return_receipts;
CREATE POLICY "Warehouse stock return receipts: sysadmin all"
  ON public.warehouse_stock_return_receipts FOR ALL
  USING (public.is_system_administrator())
  WITH CHECK (public.is_system_administrator());

DROP POLICY IF EXISTS "Warehouse stock return receipts: warehouse select" ON public.warehouse_stock_return_receipts;
CREATE POLICY "Warehouse stock return receipts: warehouse select"
  ON public.warehouse_stock_return_receipts FOR SELECT
  USING (
    public.is_warehouse()
    AND EXISTS (
      SELECT 1 FROM public.warehouse_stock_return_requests r
      WHERE r.id = warehouse_stock_return_receipts.request_id
        AND r.company_id = public.get_auth_company_id()
    )
  );

DROP POLICY IF EXISTS "Warehouse stock return receipt lines: sysadmin all" ON public.warehouse_stock_return_receipt_lines;
CREATE POLICY "Warehouse stock return receipt lines: sysadmin all"
  ON public.warehouse_stock_return_receipt_lines FOR ALL
  USING (public.is_system_administrator())
  WITH CHECK (public.is_system_administrator());

DROP POLICY IF EXISTS "Warehouse stock return receipt lines: warehouse select" ON public.warehouse_stock_return_receipt_lines;
CREATE POLICY "Warehouse stock return receipt lines: warehouse select"
  ON public.warehouse_stock_return_receipt_lines FOR SELECT
  USING (
    public.is_warehouse()
    AND EXISTS (
      SELECT 1
      FROM public.warehouse_stock_return_receipts rr
      JOIN public.warehouse_stock_return_requests r ON r.id = rr.request_id
      WHERE rr.id = warehouse_stock_return_receipt_lines.receipt_id
        AND r.company_id = public.get_auth_company_id()
    )
  );

DROP POLICY IF EXISTS "Warehouse stock return counters: sysadmin all" ON public.warehouse_stock_return_number_counters;
CREATE POLICY "Warehouse stock return counters: sysadmin all"
  ON public.warehouse_stock_return_number_counters FOR ALL
  USING (public.is_system_administrator())
  WITH CHECK (public.is_system_administrator());

GRANT SELECT ON public.warehouse_stock_return_requests TO authenticated;
GRANT SELECT ON public.warehouse_stock_return_request_items TO authenticated;
GRANT SELECT ON public.warehouse_stock_return_receipts TO authenticated;
GRANT SELECT ON public.warehouse_stock_return_receipt_lines TO authenticated;

COMMENT ON TABLE public.warehouse_stock_return_requests IS
  'Sub-warehouse return requests pending main-warehouse inspection (good vs damaged).';
