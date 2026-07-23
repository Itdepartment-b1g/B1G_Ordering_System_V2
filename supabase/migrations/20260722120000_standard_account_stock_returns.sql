-- Standard Account → linked warehouse stock returns (RT-YYYYMM-####).
-- Buyer submits from main_inventory; warehouse inspects good/damaged into main batch lots.

-- ---------------------------------------------------------------------------
-- 1) Transaction / movement / disposal types
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
    'warehouse_return_disposed'::text,
    'internal_stock_request_reserve'::text,
    'internal_stock_request_receive'::text,
    'internal_stock_request_short_release'::text,
    'client_return_out'::text,
    'client_return_cancel_in'::text,
    'client_return_in'::text,
    'client_return_disposed'::text
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
    'warehouse_return_disposed'::text,
    'internal_request_out'::text,
    'internal_request_in'::text,
    'client_return_in'::text
  ]));

ALTER TABLE public.warehouse_inventory_disposals
  DROP CONSTRAINT IF EXISTS warehouse_inventory_disposals_source_type_check;
ALTER TABLE public.warehouse_inventory_disposals
  ADD CONSTRAINT warehouse_inventory_disposals_source_type_check
  CHECK (source_type = ANY (ARRAY[
    'rebate_return'::text,
    'adjustment'::text,
    'other'::text,
    'sub_warehouse_return'::text,
    'standard_account_return'::text
  ]));

ALTER TABLE public.warehouse_inventory_disposals
  ADD COLUMN IF NOT EXISTS standard_account_stock_return_request_id uuid;

-- ---------------------------------------------------------------------------
-- 2) Counters + tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.standard_account_stock_return_number_counters (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  year_month text NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, year_month)
);

CREATE TABLE IF NOT EXISTS public.standard_account_stock_return_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  request_number text NOT NULL,
  client_company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  warehouse_company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending_receive' CHECK (
    status IN ('pending_receive', 'partially_received', 'fully_received', 'cancelled')
  ),
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  cancellation_reason text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT sa_stock_return_requests_client_request_number_key
    UNIQUE (client_company_id, request_number)
);

CREATE INDEX IF NOT EXISTS idx_sa_stock_return_requests_client_status
  ON public.standard_account_stock_return_requests(client_company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sa_stock_return_requests_warehouse_status
  ON public.standard_account_stock_return_requests(warehouse_company_id, status, created_at DESC);

DROP TRIGGER IF EXISTS update_sa_stock_return_requests_updated_at
  ON public.standard_account_stock_return_requests;
CREATE TRIGGER update_sa_stock_return_requests_updated_at
  BEFORE UPDATE ON public.standard_account_stock_return_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.standard_account_stock_return_request_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES public.standard_account_stock_return_requests(id) ON DELETE CASCADE,
  client_variant_id uuid NOT NULL REFERENCES public.variants(id) ON DELETE RESTRICT,
  warehouse_variant_id uuid NOT NULL REFERENCES public.variants(id) ON DELETE RESTRICT,
  return_quantity integer NOT NULL CHECK (return_quantity > 0),
  inspected_quantity integer NOT NULL DEFAULT 0 CHECK (inspected_quantity >= 0),
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT sa_stock_return_items_request_client_variant_key
    UNIQUE (request_id, client_variant_id),
  CONSTRAINT sa_stock_return_items_inspected_lte_return
    CHECK (inspected_quantity <= return_quantity)
);

CREATE INDEX IF NOT EXISTS idx_sa_stock_return_items_request
  ON public.standard_account_stock_return_request_items(request_id);

CREATE TABLE IF NOT EXISTS public.standard_account_stock_return_receipts (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES public.standard_account_stock_return_requests(id) ON DELETE CASCADE,
  received_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  received_at timestamptz DEFAULT now() NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sa_stock_return_receipts_request
  ON public.standard_account_stock_return_receipts(request_id);

CREATE TABLE IF NOT EXISTS public.standard_account_stock_return_receipt_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  receipt_id uuid NOT NULL REFERENCES public.standard_account_stock_return_receipts(id) ON DELETE CASCADE,
  request_item_id uuid NOT NULL REFERENCES public.standard_account_stock_return_request_items(id) ON DELETE CASCADE,
  warehouse_variant_id uuid NOT NULL REFERENCES public.variants(id) ON DELETE RESTRICT,
  destination_lot_id uuid NOT NULL REFERENCES public.inventory_batch_lots(id) ON DELETE RESTRICT,
  qty_good integer NOT NULL DEFAULT 0 CHECK (qty_good >= 0),
  qty_damaged integer NOT NULL DEFAULT 0 CHECK (qty_damaged >= 0),
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT sa_stock_return_receipt_lines_qty_positive
    CHECK (qty_good + qty_damaged > 0)
);

CREATE INDEX IF NOT EXISTS idx_sa_stock_return_receipt_lines_receipt
  ON public.standard_account_stock_return_receipt_lines(receipt_id);

ALTER TABLE public.warehouse_inventory_disposals
  DROP CONSTRAINT IF EXISTS warehouse_inventory_disposals_sa_stock_return_request_id_fkey;
ALTER TABLE public.warehouse_inventory_disposals
  ADD CONSTRAINT warehouse_inventory_disposals_sa_stock_return_request_id_fkey
  FOREIGN KEY (standard_account_stock_return_request_id)
  REFERENCES public.standard_account_stock_return_requests(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 3) Number generator: RT-YYYYMM-####
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_standard_account_stock_return_number(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_year_month text;
  v_next integer;
BEGIN
  v_year_month := to_char(now() AT TIME ZONE 'UTC', 'YYYYMM');

  INSERT INTO public.standard_account_stock_return_number_counters (company_id, year_month, last_number)
  VALUES (p_company_id, v_year_month, 1)
  ON CONFLICT (company_id, year_month)
  DO UPDATE SET last_number = public.standard_account_stock_return_number_counters.last_number + 1
  RETURNING last_number INTO v_next;

  RETURN 'RT-' || v_year_month || '-' || lpad(v_next::text, 4, '0');
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) Create return request (Standard Account admin)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_standard_account_stock_return_request(
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
  v_client_company_id uuid;
  v_warehouse_company_id uuid;
  v_account_type text;
  v_request_id uuid;
  v_request_number text;
  v_item jsonb;
  v_client_variant_id uuid;
  v_warehouse_variant_id uuid;
  v_qty integer;
  v_available integer;
  v_inv RECORD;
BEGIN
  v_creator := COALESCE(p_created_by, auth.uid());
  v_client_company_id := public.get_auth_company_id();

  IF v_client_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF NOT (
    public.is_system_administrator()
    OR (
      public.is_admin_or_super_admin()
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = v_creator AND p.company_id = v_client_company_id
      )
    )
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Only company admins can create warehouse returns');
  END IF;

  SELECT c.company_account_type INTO v_account_type
  FROM public.companies c
  WHERE c.id = v_client_company_id;

  IF v_account_type IS DISTINCT FROM 'Standard Accounts' THEN
    RETURN json_build_object('success', false, 'error', 'Only Standard Accounts can return stock to the warehouse');
  END IF;

  v_warehouse_company_id := public.get_linked_warehouse_company_id();
  IF v_warehouse_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'This company is not linked to a warehouse');
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'At least one return line is required');
  END IF;

  -- Validate lines first
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_client_variant_id := (v_item->>'client_variant_id')::uuid;
    v_qty := COALESCE((v_item->>'quantity')::int, 0);

    IF v_client_variant_id IS NULL OR v_qty <= 0 THEN
      RETURN json_build_object('success', false, 'error', 'Each line needs a valid product and quantity');
    END IF;

    SELECT m.warehouse_variant_id INTO v_warehouse_variant_id
    FROM public.warehouse_variant_mappings m
    WHERE m.client_company_id = v_client_company_id
      AND m.warehouse_company_id = v_warehouse_company_id
      AND m.client_variant_id = v_client_variant_id
    LIMIT 1;

    IF v_warehouse_variant_id IS NULL THEN
      RETURN json_build_object(
        'success', false,
        'error', 'No warehouse product mapping found for a selected variant',
        'client_variant_id', v_client_variant_id
      );
    END IF;

    SELECT * INTO v_inv
    FROM public.main_inventory
    WHERE company_id = v_client_company_id
      AND variant_id = v_client_variant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Product not found in company inventory',
        'client_variant_id', v_client_variant_id
      );
    END IF;

    v_available := GREATEST(0, COALESCE(v_inv.stock, 0) - COALESCE(v_inv.allocated_stock, 0));
    IF v_qty > v_available THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Insufficient available stock for return',
        'client_variant_id', v_client_variant_id,
        'available', v_available,
        'requested', v_qty
      );
    END IF;
  END LOOP;

  v_request_number := public.generate_standard_account_stock_return_number(v_client_company_id);

  INSERT INTO public.standard_account_stock_return_requests (
    request_number, client_company_id, warehouse_company_id, status, notes, created_by
  ) VALUES (
    v_request_number, v_client_company_id, v_warehouse_company_id, 'pending_receive',
    NULLIF(trim(p_notes), ''), v_creator
  )
  RETURNING id INTO v_request_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_client_variant_id := (v_item->>'client_variant_id')::uuid;
    v_qty := (v_item->>'quantity')::int;

    SELECT m.warehouse_variant_id INTO v_warehouse_variant_id
    FROM public.warehouse_variant_mappings m
    WHERE m.client_company_id = v_client_company_id
      AND m.warehouse_company_id = v_warehouse_company_id
      AND m.client_variant_id = v_client_variant_id
    LIMIT 1;

    UPDATE public.main_inventory
    SET stock = COALESCE(stock, 0) - v_qty,
        updated_at = now()
    WHERE company_id = v_client_company_id
      AND variant_id = v_client_variant_id;

    INSERT INTO public.standard_account_stock_return_request_items (
      request_id, client_variant_id, warehouse_variant_id, return_quantity
    ) VALUES (
      v_request_id, v_client_variant_id, v_warehouse_variant_id, v_qty
    );

    INSERT INTO public.inventory_transactions (
      company_id, variant_id, transaction_type, quantity,
      reference_type, reference_id, performed_by, notes, created_at
    ) VALUES (
      v_client_company_id, v_client_variant_id, 'client_return_out', v_qty,
      'standard_account_stock_return', v_request_id, v_creator,
      'Return to warehouse ' || v_request_number,
      now()
    );
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'request_id', v_request_id,
    'request_number', v_request_number
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('success', false, 'error', 'Duplicate product on return request');
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 5) Cancel (buyer or warehouse main, only if nothing inspected)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_standard_account_stock_return_request(
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
  v_actor uuid;
  v_request RECORD;
  v_item RECORD;
  v_remaining integer;
  v_rows integer;
BEGIN
  v_actor := COALESCE(p_cancelled_by, auth.uid());

  SELECT * INTO v_request
  FROM public.standard_account_stock_return_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Return request not found');
  END IF;

  IF v_request.status = 'cancelled' THEN
    RETURN json_build_object('success', false, 'error', 'Return request already cancelled');
  END IF;

  IF v_request.status NOT IN ('pending_receive') THEN
    RETURN json_build_object('success', false, 'error', 'Only pending returns can be cancelled');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.standard_account_stock_return_request_items i
    WHERE i.request_id = p_request_id AND i.inspected_quantity > 0
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Cannot cancel a return that has already been inspected');
  END IF;

  IF NOT (
    public.is_system_administrator()
    OR (
      public.is_admin_or_super_admin()
      AND v_request.client_company_id = public.get_auth_company_id()
    )
    OR (
      public.is_warehouse()
      AND public.is_main_warehouse_user(v_actor)
      AND v_request.warehouse_company_id = public.get_auth_company_id()
    )
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized to cancel this return');
  END IF;

  FOR v_item IN
    SELECT * FROM public.standard_account_stock_return_request_items
    WHERE request_id = p_request_id
  LOOP
    v_remaining := v_item.return_quantity - v_item.inspected_quantity;
    IF v_remaining <= 0 THEN
      CONTINUE;
    END IF;

    UPDATE public.main_inventory
    SET stock = COALESCE(stock, 0) + v_remaining,
        updated_at = now()
    WHERE company_id = v_request.client_company_id
      AND variant_id = v_item.client_variant_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      INSERT INTO public.main_inventory (
        company_id, variant_id, stock, unit_price, reorder_level, created_at, updated_at
      ) VALUES (
        v_request.client_company_id, v_item.client_variant_id, v_remaining, 0, 100, now(), now()
      );
    END IF;

    INSERT INTO public.inventory_transactions (
      company_id, variant_id, transaction_type, quantity,
      reference_type, reference_id, performed_by, notes, created_at
    ) VALUES (
      v_request.client_company_id, v_item.client_variant_id, 'client_return_cancel_in', v_remaining,
      'standard_account_stock_return', p_request_id, v_actor,
      'Cancelled return ' || v_request.request_number,
      now()
    );
  END LOOP;

  UPDATE public.standard_account_stock_return_requests
  SET status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = v_actor,
      cancellation_reason = NULLIF(trim(p_reason), ''),
      updated_at = now()
  WHERE id = p_request_id;

  RETURN json_build_object('success', true, 'request_number', v_request.request_number);
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 6) Receive / inspect at warehouse (main users)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.receive_standard_account_stock_return_request(
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
  v_receiver uuid;
  v_request RECORD;
  v_main_loc_id uuid;
  v_receipt_id uuid;
  v_received_at timestamptz;
  v_line jsonb;
  v_request_item_id uuid;
  v_qty_good integer;
  v_qty_damaged integer;
  v_total_qty integer;
  v_item RECORD;
  v_remaining integer;
  v_destination_lot_id uuid;
  v_destination_lot RECORD;
  v_line_amount numeric(14, 2);
  v_all_complete boolean;
  v_total_inspected integer := 0;
  v_agg RECORD;
  v_agg_total integer;
  v_rows integer;
BEGIN
  v_receiver := COALESCE(p_received_by, auth.uid());
  v_received_at := now();

  SELECT * INTO v_request
  FROM public.standard_account_stock_return_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Return request not found');
  END IF;

  IF NOT (
    public.is_system_administrator()
    OR (
      public.is_warehouse()
      AND public.is_main_warehouse_user(v_receiver)
      AND v_request.warehouse_company_id = public.get_auth_company_id()
    )
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Only main warehouse users can inspect client returns');
  END IF;

  IF v_request.status NOT IN ('pending_receive', 'partially_received') THEN
    RETURN json_build_object('success', false, 'error', 'Return request is not open for receiving');
  END IF;

  v_main_loc_id := public.get_main_warehouse_location_id(v_request.warehouse_company_id);
  IF v_main_loc_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Main warehouse location not found');
  END IF;

  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Inspection lines are required');
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_request_item_id := (v_line->>'request_item_id')::uuid;
    v_qty_good := COALESCE((v_line->>'qty_good')::int, 0);
    v_qty_damaged := COALESCE((v_line->>'qty_damaged')::int, 0);
    v_destination_lot_id := (v_line->>'destination_lot_id')::uuid;

    IF v_request_item_id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Invalid inspection line');
    END IF;
    IF v_destination_lot_id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Main warehouse batch lot selection is required');
    END IF;
    IF v_qty_good < 0 OR v_qty_damaged < 0 THEN
      RETURN json_build_object('success', false, 'error', 'Quantities cannot be negative');
    END IF;
    IF v_qty_good + v_qty_damaged <= 0 THEN
      RETURN json_build_object('success', false, 'error', 'Each distribution row must have at least one inspected unit');
    END IF;

    SELECT * INTO v_item
    FROM public.standard_account_stock_return_request_items
    WHERE id = v_request_item_id AND request_id = p_request_id;

    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'Return line not found on this request');
    END IF;

    SELECT * INTO v_destination_lot
    FROM public.inventory_batch_lots ibl
    WHERE ibl.id = v_destination_lot_id
      AND ibl.company_id = v_request.warehouse_company_id
      AND ibl.warehouse_location_id = v_main_loc_id
      AND ibl.variant_id = v_item.warehouse_variant_id;

    IF NOT FOUND THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Selected main warehouse batch lot not found for this product',
        'request_item_id', v_request_item_id
      );
    END IF;
  END LOOP;

  FOR v_agg IN
    SELECT
      (elem->>'request_item_id')::uuid AS request_item_id,
      SUM(
        COALESCE((elem->>'qty_good')::int, 0) + COALESCE((elem->>'qty_damaged')::int, 0)
      )::integer AS total_qty
    FROM jsonb_array_elements(p_lines) AS elem
    GROUP BY (elem->>'request_item_id')::uuid
  LOOP
    SELECT * INTO v_item
    FROM public.standard_account_stock_return_request_items
    WHERE id = v_agg.request_item_id AND request_id = p_request_id;

    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'Return line not found on this request');
    END IF;

    v_agg_total := v_agg.total_qty;
    v_remaining := v_item.return_quantity - v_item.inspected_quantity;

    IF v_agg_total > v_remaining THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Total distributed quantity exceeds remaining for a return line',
        'request_item_id', v_agg.request_item_id,
        'remaining', v_remaining,
        'requested', v_agg_total
      );
    END IF;
  END LOOP;

  INSERT INTO public.standard_account_stock_return_receipts (
    request_id, received_by, received_at, notes
  ) VALUES (
    p_request_id, v_receiver, v_received_at, NULLIF(trim(p_notes), '')
  )
  RETURNING id INTO v_receipt_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_request_item_id := (v_line->>'request_item_id')::uuid;
    v_qty_good := COALESCE((v_line->>'qty_good')::int, 0);
    v_qty_damaged := COALESCE((v_line->>'qty_damaged')::int, 0);
    v_total_qty := v_qty_good + v_qty_damaged;
    v_destination_lot_id := (v_line->>'destination_lot_id')::uuid;

    IF v_total_qty <= 0 OR v_request_item_id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_item
    FROM public.standard_account_stock_return_request_items
    WHERE id = v_request_item_id AND request_id = p_request_id
    FOR UPDATE;

    SELECT * INTO v_destination_lot
    FROM public.inventory_batch_lots
    WHERE id = v_destination_lot_id
    FOR UPDATE;

    INSERT INTO public.standard_account_stock_return_receipt_lines (
      receipt_id, request_item_id, warehouse_variant_id, destination_lot_id,
      qty_good, qty_damaged
    ) VALUES (
      v_receipt_id, v_request_item_id, v_item.warehouse_variant_id, v_destination_lot_id,
      v_qty_good, v_qty_damaged
    );

    IF v_qty_good > 0 THEN
      UPDATE public.main_inventory
      SET stock = COALESCE(stock, 0) + v_qty_good,
          updated_at = now()
      WHERE company_id = v_request.warehouse_company_id
        AND variant_id = v_item.warehouse_variant_id;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows = 0 THEN
        INSERT INTO public.main_inventory (
          company_id, variant_id, stock, unit_price, reorder_level, created_at, updated_at
        ) VALUES (
          v_request.warehouse_company_id, v_item.warehouse_variant_id, v_qty_good,
          0, 100, now(), now()
        );
      END IF;

      v_line_amount := CASE
        WHEN v_destination_lot.unit_cost IS NOT NULL
          THEN round((v_qty_good::numeric * v_destination_lot.unit_cost), 2)
        ELSE NULL
      END;

      UPDATE public.inventory_batch_lots
      SET quantity_received = quantity_received + v_qty_good,
          quantity_remaining = quantity_remaining + v_qty_good,
          line_amount = COALESCE(line_amount, 0) + COALESCE(v_line_amount, 0),
          updated_at = now()
      WHERE id = v_destination_lot_id;

      INSERT INTO public.inventory_batch_movements (
        company_id, lot_id, batch_id, variant_id, warehouse_location_id,
        movement_type, quantity, reference_type, reference_id,
        to_location_id, performed_by, notes
      ) VALUES (
        v_request.warehouse_company_id, v_destination_lot_id, v_destination_lot.batch_id,
        v_item.warehouse_variant_id, v_main_loc_id,
        'client_return_in', v_qty_good, 'standard_account_stock_return', p_request_id,
        v_main_loc_id, v_receiver,
        'Client return (good) ' || v_request.request_number
      );

      INSERT INTO public.inventory_transactions (
        company_id, variant_id, transaction_type, quantity,
        reference_type, reference_id, performed_by, notes, created_at
      ) VALUES (
        v_request.warehouse_company_id, v_item.warehouse_variant_id, 'client_return_in', v_qty_good,
        'standard_account_stock_return', p_request_id, v_receiver,
        'Client return (good) ' || v_request.request_number,
        now()
      );
    END IF;

    IF v_qty_damaged > 0 THEN
      INSERT INTO public.warehouse_inventory_disposals (
        company_id, warehouse_location_id, variant_id, quantity,
        source_type, standard_account_stock_return_request_id,
        notes, disposed_by
      ) VALUES (
        v_request.warehouse_company_id, v_main_loc_id, v_item.warehouse_variant_id, v_qty_damaged,
        'standard_account_return', p_request_id,
        NULLIF(trim(p_notes), ''), v_receiver
      );

      INSERT INTO public.inventory_transactions (
        company_id, variant_id, transaction_type, quantity,
        reference_type, reference_id, performed_by, notes, created_at
      ) VALUES (
        v_request.warehouse_company_id, v_item.warehouse_variant_id, 'client_return_disposed', v_qty_damaged,
        'standard_account_stock_return', p_request_id, v_receiver,
        'Client return (damaged) ' || v_request.request_number,
        now()
      );
    END IF;

    UPDATE public.standard_account_stock_return_request_items
    SET inspected_quantity = inspected_quantity + v_total_qty
    WHERE id = v_request_item_id;

    v_total_inspected := v_total_inspected + v_total_qty;
  END LOOP;

  SELECT NOT EXISTS (
    SELECT 1
    FROM public.standard_account_stock_return_request_items i
    WHERE i.request_id = p_request_id
      AND i.inspected_quantity < i.return_quantity
  ) INTO v_all_complete;

  UPDATE public.standard_account_stock_return_requests
  SET status = CASE WHEN v_all_complete THEN 'fully_received' ELSE 'partially_received' END,
      updated_at = now()
  WHERE id = p_request_id;

  RETURN json_build_object(
    'success', true,
    'receipt_id', v_receipt_id,
    'request_number', v_request.request_number,
    'total_inspected', v_total_inspected,
    'fully_received', v_all_complete
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_standard_account_stock_return_number(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_standard_account_stock_return_request(jsonb, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_standard_account_stock_return_request(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_standard_account_stock_return_request(uuid, jsonb, text, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7) RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.standard_account_stock_return_number_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standard_account_stock_return_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standard_account_stock_return_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standard_account_stock_return_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standard_account_stock_return_receipt_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "SA stock return counters: sysadmin all"
  ON public.standard_account_stock_return_number_counters;
CREATE POLICY "SA stock return counters: sysadmin all"
  ON public.standard_account_stock_return_number_counters FOR ALL
  USING (public.is_system_administrator())
  WITH CHECK (public.is_system_administrator());

DROP POLICY IF EXISTS "SA stock return requests: sysadmin all"
  ON public.standard_account_stock_return_requests;
CREATE POLICY "SA stock return requests: sysadmin all"
  ON public.standard_account_stock_return_requests FOR ALL
  USING (public.is_system_administrator())
  WITH CHECK (public.is_system_administrator());

DROP POLICY IF EXISTS "SA stock return requests: client select"
  ON public.standard_account_stock_return_requests;
CREATE POLICY "SA stock return requests: client select"
  ON public.standard_account_stock_return_requests FOR SELECT
  USING (client_company_id = public.get_auth_company_id());

DROP POLICY IF EXISTS "SA stock return requests: warehouse select"
  ON public.standard_account_stock_return_requests;
CREATE POLICY "SA stock return requests: warehouse select"
  ON public.standard_account_stock_return_requests FOR SELECT
  USING (
    public.is_warehouse()
    AND warehouse_company_id = public.get_auth_company_id()
  );

DROP POLICY IF EXISTS "SA stock return items: sysadmin all"
  ON public.standard_account_stock_return_request_items;
CREATE POLICY "SA stock return items: sysadmin all"
  ON public.standard_account_stock_return_request_items FOR ALL
  USING (public.is_system_administrator())
  WITH CHECK (public.is_system_administrator());

DROP POLICY IF EXISTS "SA stock return items: client or warehouse select"
  ON public.standard_account_stock_return_request_items;
CREATE POLICY "SA stock return items: client or warehouse select"
  ON public.standard_account_stock_return_request_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.standard_account_stock_return_requests r
      WHERE r.id = standard_account_stock_return_request_items.request_id
        AND (
          r.client_company_id = public.get_auth_company_id()
          OR (
            public.is_warehouse()
            AND r.warehouse_company_id = public.get_auth_company_id()
          )
        )
    )
  );

DROP POLICY IF EXISTS "SA stock return receipts: sysadmin all"
  ON public.standard_account_stock_return_receipts;
CREATE POLICY "SA stock return receipts: sysadmin all"
  ON public.standard_account_stock_return_receipts FOR ALL
  USING (public.is_system_administrator())
  WITH CHECK (public.is_system_administrator());

DROP POLICY IF EXISTS "SA stock return receipts: client or warehouse select"
  ON public.standard_account_stock_return_receipts;
CREATE POLICY "SA stock return receipts: client or warehouse select"
  ON public.standard_account_stock_return_receipts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.standard_account_stock_return_requests r
      WHERE r.id = standard_account_stock_return_receipts.request_id
        AND (
          r.client_company_id = public.get_auth_company_id()
          OR (
            public.is_warehouse()
            AND r.warehouse_company_id = public.get_auth_company_id()
          )
        )
    )
  );

DROP POLICY IF EXISTS "SA stock return receipt lines: sysadmin all"
  ON public.standard_account_stock_return_receipt_lines;
CREATE POLICY "SA stock return receipt lines: sysadmin all"
  ON public.standard_account_stock_return_receipt_lines FOR ALL
  USING (public.is_system_administrator())
  WITH CHECK (public.is_system_administrator());

DROP POLICY IF EXISTS "SA stock return receipt lines: client or warehouse select"
  ON public.standard_account_stock_return_receipt_lines;
CREATE POLICY "SA stock return receipt lines: client or warehouse select"
  ON public.standard_account_stock_return_receipt_lines FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.standard_account_stock_return_receipts rc
      JOIN public.standard_account_stock_return_requests r ON r.id = rc.request_id
      WHERE rc.id = standard_account_stock_return_receipt_lines.receipt_id
        AND (
          r.client_company_id = public.get_auth_company_id()
          OR (
            public.is_warehouse()
            AND r.warehouse_company_id = public.get_auth_company_id()
          )
        )
    )
  );

-- Allow warehouse users to read assigned client company names for return lists.
DROP POLICY IF EXISTS "Warehouse can view assigned client companies" ON public.companies;
CREATE POLICY "Warehouse can view assigned client companies"
  ON public.companies FOR SELECT
  USING (
    public.is_warehouse()
    AND EXISTS (
      SELECT 1
      FROM public.warehouse_company_assignments wca
      JOIN public.profiles wp ON wp.id = wca.warehouse_user_id
      WHERE wca.client_company_id = companies.id
        AND wp.company_id = public.get_auth_company_id()
    )
  );
