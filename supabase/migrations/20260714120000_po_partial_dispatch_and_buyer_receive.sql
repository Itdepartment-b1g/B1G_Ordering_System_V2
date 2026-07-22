-- Partial qty dispatch (multi-DR per location) + buyer receive with shortfall restore.
-- Inventory model:
--   - Warehouse stock deducted on dispatch/fulfill (not on buyer receive)
--   - Standard Accounts buyer stock credited only on receive (no longer on fulfill)
--   - If buyer receives less than dispatched, shortfall returns to warehouse and reopens reservation
--   - Available stock subtracts open warehouse_transfer reservations

-- ---------------------------------------------------------------------------
-- Delivery line items + buyer receive fields
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchase_order_delivery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL REFERENCES public.purchase_order_deliveries(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.variants(id),
  quantity_dispatched integer NOT NULL CHECK (quantity_dispatched > 0),
  quantity_received integer NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_order_delivery_items_received_lte_dispatched
    CHECK (quantity_received <= quantity_dispatched),
  UNIQUE (delivery_id, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_po_delivery_items_delivery
  ON public.purchase_order_delivery_items (delivery_id);
CREATE INDEX IF NOT EXISTS idx_po_delivery_items_variant
  ON public.purchase_order_delivery_items (variant_id);

ALTER TABLE public.purchase_order_deliveries
  ADD COLUMN IF NOT EXISTS buyer_notes text,
  ADD COLUMN IF NOT EXISTS buyer_proof_url text,
  ADD COLUMN IF NOT EXISTS buyer_signature_url text,
  ADD COLUMN IF NOT EXISTS buyer_signature_path text,
  ADD COLUMN IF NOT EXISTS received_by uuid REFERENCES public.profiles(id);

-- Allow receive statuses on deliveries (keep dispatched/delivered for compatibility)
DO $$
BEGIN
  -- No hard CHECK on status historically; document allowed values in comment.
  NULL;
END $$;

COMMENT ON COLUMN public.purchase_order_deliveries.status IS
  'dispatched | partially_received | received | delivered';

ALTER TABLE public.purchase_order_delivery_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "PO delivery items select via delivery access" ON public.purchase_order_delivery_items;
CREATE POLICY "PO delivery items select via delivery access"
  ON public.purchase_order_delivery_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.purchase_order_deliveries d
      WHERE d.id = purchase_order_delivery_items.delivery_id
    )
  );

DROP POLICY IF EXISTS "Warehouse insert PO delivery items" ON public.purchase_order_delivery_items;
CREATE POLICY "Warehouse insert PO delivery items"
  ON public.purchase_order_delivery_items FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_warehouse()
    AND EXISTS (
      SELECT 1
      FROM public.purchase_order_deliveries d
      JOIN public.purchase_orders po ON po.id = d.purchase_order_id
      WHERE d.id = purchase_order_delivery_items.delivery_id
        AND d.created_by = auth.uid()
        AND public.warehouse_can_access_transfer_po(po.id, auth.uid())
    )
  );

GRANT SELECT, INSERT ON public.purchase_order_delivery_items TO authenticated;

-- ---------------------------------------------------------------------------
-- Open reservation helper (available = on-hand - allocated - this)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.warehouse_open_transfer_reserved(
  p_warehouse_company_id uuid,
  p_variant_id uuid,
  p_location_id uuid DEFAULT NULL,
  p_exclude_po_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(SUM(r.quantity_reserved - r.quantity_fulfilled), 0)::int
  FROM public.warehouse_transfer_reservations r
  WHERE r.warehouse_company_id = p_warehouse_company_id
    AND r.variant_id = p_variant_id
    AND r.status IN ('reserved', 'partial')
    AND (r.quantity_reserved - r.quantity_fulfilled) > 0
    AND (p_location_id IS NULL OR r.warehouse_location_id = p_location_id)
    AND (p_exclude_po_id IS NULL OR r.purchase_order_id IS DISTINCT FROM p_exclude_po_id);
$$;

GRANT EXECUTE ON FUNCTION public.warehouse_open_transfer_reserved(uuid, uuid, uuid, uuid) TO authenticated;

-- Linked buyer companies can see hub open reservations (for available-to-order stock display)
DROP POLICY IF EXISTS "Linked clients can read hub transfer reservations" ON public.warehouse_transfer_reservations;
CREATE POLICY "Linked clients can read hub transfer reservations"
  ON public.warehouse_transfer_reservations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.warehouse_company_assignments wca
      JOIN public.profiles wp ON wp.id = wca.warehouse_user_id
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE wca.client_company_id = p.company_id
        AND wp.company_id = warehouse_transfer_reservations.warehouse_company_id
    )
  );

CREATE OR REPLACE FUNCTION public.get_available_stock(p_variant_id uuid, p_company_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_stock integer;
  v_allocated integer;
  v_open_reserved integer;
BEGIN
  SELECT stock, COALESCE(allocated_stock, 0)
  INTO v_stock, v_allocated
  FROM public.main_inventory
  WHERE variant_id = p_variant_id AND company_id = p_company_id;

  -- Available-to-dispatch from main: subtract open reservations at the main location only.
  -- Sub-location reservations come from allocated_stock / location inventory separately.
  SELECT COALESCE(SUM(r.quantity_reserved - r.quantity_fulfilled), 0)::int
  INTO v_open_reserved
  FROM public.warehouse_transfer_reservations r
  JOIN public.warehouse_locations wl ON wl.id = r.warehouse_location_id
  WHERE r.warehouse_company_id = p_company_id
    AND r.variant_id = p_variant_id
    AND r.status IN ('reserved', 'partial')
    AND (r.quantity_reserved - r.quantity_fulfilled) > 0
    AND COALESCE(wl.is_main, false) = true;

  RETURN GREATEST(0, COALESCE(v_stock, 0) - COALESCE(v_allocated, 0) - COALESCE(v_open_reserved, 0));
END;
$$;

-- ---------------------------------------------------------------------------
-- Shared: ensure client variant mapping (Standard Accounts receive path)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_warehouse_client_variant_mapping(
  p_client_company_id uuid,
  p_warehouse_company_id uuid,
  p_warehouse_variant_id uuid,
  p_actor_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_client_variant_id uuid;
  item_record RECORD;
  v_client_brand_id uuid;
  v_client_variant_type_id uuid;
BEGIN
  SELECT m.client_variant_id INTO v_client_variant_id
  FROM public.warehouse_variant_mappings m
  WHERE m.client_company_id = p_client_company_id
    AND m.warehouse_company_id = p_warehouse_company_id
    AND m.warehouse_variant_id = p_warehouse_variant_id;

  IF v_client_variant_id IS NOT NULL THEN
    RETURN v_client_variant_id;
  END IF;

  SELECT
    v.id AS warehouse_variant_id,
    v.name AS variant_name,
    v.variant_type AS variant_type,
    b.name AS brand_name
  INTO item_record
  FROM public.variants v
  JOIN public.brands b ON b.id = v.brand_id
  WHERE v.id = p_warehouse_variant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Warehouse variant not found';
  END IF;

  SELECT br.id INTO v_client_brand_id
  FROM public.brands br
  WHERE br.company_id = p_client_company_id
    AND lower(br.name) = lower(item_record.brand_name)
  LIMIT 1;

  IF v_client_brand_id IS NULL THEN
    INSERT INTO public.brands (company_id, name, description, created_by, created_at, updated_at)
    VALUES (p_client_company_id, item_record.brand_name, NULL, p_actor_id, NOW(), NOW())
    RETURNING id INTO v_client_brand_id;
  END IF;

  SELECT vt.id INTO v_client_variant_type_id
  FROM public.variant_types vt
  WHERE vt.company_id = p_client_company_id
    AND lower(vt.name) = lower(item_record.variant_type)
  LIMIT 1;

  IF v_client_variant_type_id IS NULL THEN
    RAISE EXCEPTION 'Client missing variant type for %', item_record.variant_type;
  END IF;

  SELECT vv.id INTO v_client_variant_id
  FROM public.variants vv
  WHERE vv.company_id = p_client_company_id
    AND vv.brand_id = v_client_brand_id
    AND lower(vv.name) = lower(item_record.variant_name)
  LIMIT 1;

  IF v_client_variant_id IS NULL THEN
    INSERT INTO public.variants (
      company_id, brand_id, variant_type_id, name, variant_type,
      description, sku, created_at, updated_at
    ) VALUES (
      p_client_company_id, v_client_brand_id, v_client_variant_type_id,
      item_record.variant_name, item_record.variant_type,
      NULL, NULL, NOW(), NOW()
    )
    RETURNING id INTO v_client_variant_id;
  END IF;

  INSERT INTO public.warehouse_variant_mappings (
    client_company_id, warehouse_company_id, warehouse_variant_id, client_variant_id
  ) VALUES (
    p_client_company_id, p_warehouse_company_id, p_warehouse_variant_id, v_client_variant_id
  )
  ON CONFLICT (client_company_id, warehouse_variant_id) DO UPDATE
  SET client_variant_id = EXCLUDED.client_variant_id,
      updated_at = NOW();

  RETURN v_client_variant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_warehouse_client_variant_mapping(uuid, uuid, uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Fulfill with optional partial quantities; NO Standard Account buyer credit
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fulfill_po_location(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.fulfill_po_location(
  p_po_id uuid,
  p_location_id uuid,
  p_fulfiller_id uuid DEFAULT auth.uid(),
  p_items jsonb DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  po_record RECORD;
  v_fulfiller RECORD;
  v_user_location_id uuid;
  res RECORD;
  loc_stock integer;
  main_available integer;
  v_is_main_location boolean;
  v_remaining integer;
  v_ship_qty integer;
  v_consume_result jsonb;
  v_open_reserved integer;
  v_requested integer;
  v_fulfilled_items jsonb := '[]'::jsonb;
  v_any_shipped boolean := false;
  v_loc_fully_done boolean;
BEGIN
  SELECT * INTO po_record FROM public.purchase_orders WHERE id = p_po_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Purchase order not found');
  END IF;
  IF po_record.fulfillment_type IS DISTINCT FROM 'warehouse_transfer' THEN
    RETURN json_build_object('success', false, 'error', 'Not a warehouse transfer purchase order');
  END IF;
  IF po_record.status IS DISTINCT FROM 'approved_for_fulfillment'
     AND po_record.status IS DISTINCT FROM 'partially_fulfilled' THEN
    RETURN json_build_object('success', false, 'error', 'Purchase order is not ready to fulfill');
  END IF;

  SELECT p.id, p.role, p.company_id INTO v_fulfiller
  FROM public.profiles p
  WHERE p.id = p_fulfiller_id;

  IF NOT FOUND OR v_fulfiller.role IS DISTINCT FROM 'warehouse' THEN
    RETURN json_build_object('success', false, 'error', 'Only warehouse users can fulfill this purchase order');
  END IF;
  IF v_fulfiller.company_id IS DISTINCT FROM po_record.warehouse_company_id THEN
    RETURN json_build_object('success', false, 'error', 'Fulfiller warehouse company does not match purchase order warehouse');
  END IF;

  v_user_location_id := public.get_warehouse_location_id(p_fulfiller_id);
  IF NOT (public.is_main_warehouse_user(p_fulfiller_id) OR v_user_location_id = p_location_id) THEN
    RETURN json_build_object('success', false, 'error', 'Fulfiller is not assigned to this sub-warehouse location');
  END IF;

  SELECT COALESCE(wl.is_main, false) INTO v_is_main_location
  FROM public.warehouse_locations wl
  WHERE wl.id = p_location_id
    AND wl.company_id = po_record.warehouse_company_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Invalid warehouse location');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.warehouse_transfer_reservations r
    WHERE r.purchase_order_id = p_po_id
      AND r.warehouse_location_id = p_location_id
      AND r.status <> 'cancelled'
  ) THEN
    RETURN json_build_object('success', false, 'error', 'No reservations found for this location');
  END IF;

  -- Validate requested variants/qtys when partial list provided
  IF p_items IS NOT NULL THEN
    IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
      RETURN json_build_object('success', false, 'error', 'p_items must be a non-empty array');
    END IF;
  END IF;

  FOR res IN
    SELECT *
    FROM public.warehouse_transfer_reservations r
    WHERE r.purchase_order_id = p_po_id
      AND r.warehouse_location_id = p_location_id
      AND r.status <> 'fulfilled'
      AND r.status <> 'cancelled'
  LOOP
    v_remaining := (res.quantity_reserved - res.quantity_fulfilled);
    IF v_remaining <= 0 THEN
      CONTINUE;
    END IF;

    IF p_items IS NULL THEN
      v_ship_qty := v_remaining;
    ELSE
      SELECT COALESCE((
        SELECT (elem->>'quantity')::int
        FROM jsonb_array_elements(p_items) elem
        WHERE (elem->>'variant_id')::uuid = res.variant_id
        LIMIT 1
      ), 0) INTO v_requested;

      IF v_requested <= 0 THEN
        CONTINUE;
      END IF;
      IF v_requested > v_remaining THEN
        RETURN json_build_object(
          'success', false,
          'error', 'Ship quantity exceeds remaining reserved quantity',
          'variant_id', res.variant_id,
          'remaining', v_remaining,
          'requested', v_requested
        );
      END IF;
      v_ship_qty := v_requested;
    END IF;

    IF v_is_main_location THEN
      SELECT (mi.stock - COALESCE(mi.allocated_stock, 0))::int INTO main_available
      FROM public.main_inventory mi
      WHERE mi.company_id = po_record.warehouse_company_id
        AND mi.variant_id = res.variant_id;

      -- Stock is already reduced for other fulfilled reservations; open reserved for THIS po
      -- is still in stock (not deducted yet). Do not subtract this PO's open reserved.
      v_open_reserved := public.warehouse_open_transfer_reserved(
        po_record.warehouse_company_id,
        res.variant_id,
        p_location_id,
        p_po_id
      );

      IF main_available IS NULL OR (main_available - v_open_reserved) < v_ship_qty THEN
        RETURN json_build_object(
          'success', false,
          'error', 'Insufficient stock at fulfillment time',
          'available', GREATEST(0, COALESCE(main_available, 0) - COALESCE(v_open_reserved, 0)),
          'requested', v_ship_qty
        );
      END IF;
    ELSE
      SELECT COALESCE(wli.stock, 0) INTO loc_stock
      FROM public.warehouse_location_inventory wli
      WHERE wli.company_id = po_record.warehouse_company_id
        AND wli.location_id = p_location_id
        AND wli.variant_id = res.variant_id;

      v_open_reserved := public.warehouse_open_transfer_reserved(
        po_record.warehouse_company_id,
        res.variant_id,
        p_location_id,
        p_po_id
      );

      IF NOT FOUND OR (loc_stock - v_open_reserved) < v_ship_qty THEN
        RETURN json_build_object(
          'success', false,
          'error', 'Insufficient stock at fulfillment time',
          'available', GREATEST(0, COALESCE(loc_stock, 0) - COALESCE(v_open_reserved, 0)),
          'requested', v_ship_qty
        );
      END IF;
    END IF;

    v_consume_result := public.consume_inventory_lots_fifo_fefo(
      po_record.warehouse_company_id,
      p_location_id,
      res.variant_id,
      v_ship_qty,
      'fulfill_out',
      'purchase_order',
      p_po_id,
      p_fulfiller_id,
      'Warehouse transfer out PO ' || po_record.po_number
    );

    IF NOT COALESCE((v_consume_result->>'success')::boolean, false) THEN
      RETURN json_build_object(
        'success', false,
        'error', COALESCE(v_consume_result->>'error', 'Batch lot consumption failed'),
        'variant_id', res.variant_id
      );
    END IF;

    IF v_is_main_location THEN
      UPDATE public.main_inventory
      SET stock = GREATEST(0, stock - v_ship_qty),
          updated_at = NOW()
      WHERE company_id = po_record.warehouse_company_id
        AND variant_id = res.variant_id;
    ELSE
      UPDATE public.warehouse_location_inventory
      SET stock = stock - v_ship_qty,
          updated_at = NOW()
      WHERE company_id = po_record.warehouse_company_id
        AND location_id = p_location_id
        AND variant_id = res.variant_id;

      UPDATE public.main_inventory
      SET allocated_stock = GREATEST(0, COALESCE(allocated_stock, 0) - v_ship_qty),
          updated_at = NOW()
      WHERE company_id = po_record.warehouse_company_id
        AND variant_id = res.variant_id;
    END IF;

    INSERT INTO public.inventory_transactions (
      company_id, variant_id, transaction_type, quantity,
      reference_type, reference_id, performed_by, notes, created_at
    ) VALUES (
      po_record.warehouse_company_id, res.variant_id, 'warehouse_transfer_out', v_ship_qty,
      'purchase_order', p_po_id, p_fulfiller_id,
      'Warehouse transfer out PO ' || po_record.po_number || ' from location ' || p_location_id::text,
      NOW()
    );

    -- Standard Accounts: buyer inventory credited on receive_po_delivery, not here.

    UPDATE public.warehouse_transfer_reservations
    SET quantity_fulfilled = quantity_fulfilled + v_ship_qty,
        status = CASE
          WHEN quantity_fulfilled + v_ship_qty >= quantity_reserved THEN 'fulfilled'
          ELSE 'partial'
        END,
        updated_at = NOW()
    WHERE id = res.id;

    v_any_shipped := true;
    v_fulfilled_items := v_fulfilled_items || jsonb_build_array(
      jsonb_build_object('variant_id', res.variant_id, 'quantity', v_ship_qty)
    );
  END LOOP;

  IF NOT v_any_shipped THEN
    RETURN json_build_object('success', false, 'error', 'No quantities to fulfill');
  END IF;

  SELECT NOT EXISTS (
    SELECT 1
    FROM public.warehouse_transfer_reservations r
    WHERE r.purchase_order_id = p_po_id
      AND r.warehouse_location_id = p_location_id
      AND r.status <> 'cancelled'
      AND (r.quantity_reserved - r.quantity_fulfilled) > 0
  ) INTO v_loc_fully_done;

  UPDATE public.warehouse_transfer_location_status
  SET status = CASE WHEN v_loc_fully_done THEN 'fulfilled' ELSE 'partial' END,
      updated_at = NOW()
  WHERE purchase_order_id = p_po_id
    AND warehouse_location_id = p_location_id;

  IF EXISTS (
    SELECT 1
    FROM public.warehouse_transfer_location_status s
    WHERE s.purchase_order_id = p_po_id
      AND s.status <> 'fulfilled'
  ) THEN
    UPDATE public.purchase_orders
    SET status = 'partially_fulfilled',
        updated_at = NOW()
    WHERE id = p_po_id;
  ELSE
    UPDATE public.purchase_orders
    SET status = 'fulfilled',
        updated_at = NOW()
    WHERE id = p_po_id;
  END IF;

  RETURN json_build_object(
    'success', true,
    'po_number', po_record.po_number,
    'items', v_fulfilled_items,
    'location_fully_fulfilled', v_loc_fully_done
  );
END;
$$;

COMMENT ON FUNCTION public.fulfill_po_location(uuid, uuid, uuid, jsonb) IS
  'Partial-aware warehouse transfer fulfill. Deducts hub stock on dispatch. Buyer inventory credited on receive_po_delivery for Standard Accounts.';

GRANT EXECUTE ON FUNCTION public.fulfill_po_location(uuid, uuid, uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- Buyer receive: credit buyer stock; restore warehouse shortfall; reopen remainder
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.receive_po_delivery(uuid, jsonb, text, text, uuid);
DROP FUNCTION IF EXISTS public.receive_po_delivery(uuid, jsonb, text, text, text, text, uuid);

CREATE OR REPLACE FUNCTION public.receive_po_delivery(
  p_delivery_id uuid,
  p_items jsonb,
  p_proof_url text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_signature_url text DEFAULT NULL,
  p_signature_path text DEFAULT NULL,
  p_received_by uuid DEFAULT auth.uid()
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  d_rec RECORD;
  po_record RECORD;
  v_receiver RECORD;
  item_rec RECORD;
  v_recv_qty integer;
  v_shortfall integer;
  v_client_variant_id uuid;
  v_is_main_location boolean;
  v_all_received boolean;
  v_any_open_ship boolean;
  v_any_open_recv boolean;
  existing_client_inv RECORD;
BEGIN
  SELECT * INTO d_rec FROM public.purchase_order_deliveries WHERE id = p_delivery_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Delivery not found');
  END IF;

  IF d_rec.status IN ('received', 'delivered') THEN
    RETURN json_build_object('success', false, 'error', 'Delivery already fully received');
  END IF;

  SELECT * INTO po_record FROM public.purchase_orders WHERE id = d_rec.purchase_order_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Purchase order not found');
  END IF;

  SELECT p.id, p.role, p.company_id INTO v_receiver
  FROM public.profiles p
  WHERE p.id = p_received_by;

  IF NOT FOUND OR v_receiver.company_id IS DISTINCT FROM po_record.company_id THEN
    RETURN json_build_object('success', false, 'error', 'Only the buying company can receive this delivery');
  END IF;

  IF p_signature_url IS NULL OR btrim(p_signature_url) = '' THEN
    RETURN json_build_object('success', false, 'error', 'Buyer signature is required');
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Receive items are required');
  END IF;

  SELECT COALESCE(wl.is_main, false) INTO v_is_main_location
  FROM public.warehouse_locations wl
  WHERE wl.id = d_rec.warehouse_location_id;

  FOR item_rec IN
    SELECT di.*
    FROM public.purchase_order_delivery_items di
    WHERE di.delivery_id = p_delivery_id
  LOOP
    SELECT COALESCE((
      SELECT (elem->>'quantity_received')::int
      FROM jsonb_array_elements(p_items) elem
      WHERE (elem->>'variant_id')::uuid = item_rec.variant_id
      LIMIT 1
    ), -1) INTO v_recv_qty;

    IF v_recv_qty < 0 THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Missing quantity_received for variant',
        'variant_id', item_rec.variant_id
      );
    END IF;

    IF v_recv_qty > item_rec.quantity_dispatched THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Received quantity cannot exceed dispatched quantity',
        'variant_id', item_rec.variant_id,
        'dispatched', item_rec.quantity_dispatched,
        'received', v_recv_qty
      );
    END IF;

    IF item_rec.quantity_received > 0 THEN
      RETURN json_build_object('success', false, 'error', 'Delivery item already received');
    END IF;

    v_shortfall := item_rec.quantity_dispatched - v_recv_qty;

    UPDATE public.purchase_order_delivery_items
    SET quantity_received = v_recv_qty,
        updated_at = NOW()
    WHERE id = item_rec.id;

    -- Credit buyer inventory (Standard Accounts). Key Accounts remain hub-only.
    IF po_record.company_account_type IS DISTINCT FROM 'Key Accounts' AND v_recv_qty > 0 THEN
      v_client_variant_id := public.ensure_warehouse_client_variant_mapping(
        po_record.company_id,
        po_record.warehouse_company_id,
        item_rec.variant_id,
        p_received_by
      );

      SELECT * INTO existing_client_inv
      FROM public.main_inventory
      WHERE variant_id = v_client_variant_id
        AND company_id = po_record.company_id;

      IF FOUND THEN
        UPDATE public.main_inventory
        SET stock = stock + v_recv_qty,
            updated_at = NOW()
        WHERE variant_id = v_client_variant_id
          AND company_id = po_record.company_id;
      ELSE
        INSERT INTO public.main_inventory (
          company_id, variant_id, stock, unit_price, reorder_level, created_at, updated_at
        ) VALUES (
          po_record.company_id, v_client_variant_id, v_recv_qty,
          0, 10, NOW(), NOW()
        );
      END IF;

      INSERT INTO public.inventory_transactions (
        company_id, variant_id, transaction_type, quantity,
        reference_type, reference_id, performed_by, notes, created_at
      ) VALUES (
        po_record.company_id, v_client_variant_id, 'warehouse_transfer_in', v_recv_qty,
        'purchase_order', po_record.id, p_received_by,
        'Buyer receive PO ' || po_record.po_number || ' DR ' || COALESCE(d_rec.dr_number, d_rec.id::text),
        NOW()
      );
    END IF;

    -- Restore shortfall to warehouse and reopen reservation for remaining delivery
    IF v_shortfall > 0 THEN
      IF COALESCE(v_is_main_location, true) THEN
        UPDATE public.main_inventory
        SET stock = stock + v_shortfall,
            updated_at = NOW()
        WHERE company_id = po_record.warehouse_company_id
          AND variant_id = item_rec.variant_id;

        IF NOT FOUND THEN
          INSERT INTO public.main_inventory (
            company_id, variant_id, stock, unit_price, reorder_level, created_at, updated_at
          ) VALUES (
            po_record.warehouse_company_id, item_rec.variant_id, v_shortfall,
            0, 10, NOW(), NOW()
          );
        END IF;
      ELSE
        UPDATE public.warehouse_location_inventory
        SET stock = stock + v_shortfall,
            updated_at = NOW()
        WHERE company_id = po_record.warehouse_company_id
          AND location_id = d_rec.warehouse_location_id
          AND variant_id = item_rec.variant_id;

        IF NOT FOUND THEN
          INSERT INTO public.warehouse_location_inventory (
            company_id, location_id, variant_id, stock, created_at, updated_at
          ) VALUES (
            po_record.warehouse_company_id, d_rec.warehouse_location_id, item_rec.variant_id, v_shortfall,
            NOW(), NOW()
          );
        END IF;

        UPDATE public.main_inventory
        SET allocated_stock = COALESCE(allocated_stock, 0) + v_shortfall,
            updated_at = NOW()
        WHERE company_id = po_record.warehouse_company_id
          AND variant_id = item_rec.variant_id;
      END IF;

      INSERT INTO public.inventory_transactions (
        company_id, variant_id, transaction_type, quantity,
        reference_type, reference_id, performed_by, notes, created_at
      ) VALUES (
        po_record.warehouse_company_id, item_rec.variant_id, 'warehouse_transfer_in', v_shortfall,
        'purchase_order', po_record.id, p_received_by,
        'Shortfall restore from buyer receive PO ' || po_record.po_number || ' DR ' || COALESCE(d_rec.dr_number, ''),
        NOW()
      );

      UPDATE public.warehouse_transfer_reservations
      SET quantity_fulfilled = GREATEST(0, quantity_fulfilled - v_shortfall),
          status = CASE
            WHEN GREATEST(0, quantity_fulfilled - v_shortfall) <= 0 THEN 'reserved'
            WHEN GREATEST(0, quantity_fulfilled - v_shortfall) < quantity_reserved THEN 'partial'
            ELSE 'fulfilled'
          END,
          updated_at = NOW()
      WHERE purchase_order_id = po_record.id
        AND warehouse_location_id = d_rec.warehouse_location_id
        AND variant_id = item_rec.variant_id;
    END IF;
  END LOOP;

  -- This DR is fully confirmed even if shortfall was restored for another dispatch.
  v_all_received := true;

  UPDATE public.purchase_order_deliveries
  SET status = 'received',
      proof_of_delivery_url = COALESCE(p_proof_url, proof_of_delivery_url),
      buyer_proof_url = COALESCE(p_proof_url, buyer_proof_url),
      buyer_notes = COALESCE(p_notes, buyer_notes),
      buyer_signature_url = COALESCE(p_signature_url, buyer_signature_url),
      buyer_signature_path = COALESCE(p_signature_path, buyer_signature_path),
      received_by = p_received_by,
      delivered_at = NOW()
  WHERE id = p_delivery_id;

  -- Refresh location status from reservations
  UPDATE public.warehouse_transfer_location_status s
  SET status = CASE
      WHEN NOT EXISTS (
        SELECT 1
        FROM public.warehouse_transfer_reservations r
        WHERE r.purchase_order_id = s.purchase_order_id
          AND r.warehouse_location_id = s.warehouse_location_id
          AND r.status <> 'cancelled'
          AND (r.quantity_reserved - r.quantity_fulfilled) > 0
      ) THEN 'fulfilled'
      WHEN EXISTS (
        SELECT 1
        FROM public.warehouse_transfer_reservations r
        WHERE r.purchase_order_id = s.purchase_order_id
          AND r.warehouse_location_id = s.warehouse_location_id
          AND r.quantity_fulfilled > 0
          AND r.status <> 'cancelled'
      ) THEN 'partial'
      ELSE 'ready'
    END,
    updated_at = NOW()
  WHERE s.purchase_order_id = po_record.id
    AND s.warehouse_location_id = d_rec.warehouse_location_id;

  SELECT EXISTS (
    SELECT 1
    FROM public.warehouse_transfer_reservations r
    WHERE r.purchase_order_id = po_record.id
      AND r.status <> 'cancelled'
      AND (r.quantity_reserved - r.quantity_fulfilled) > 0
  ) INTO v_any_open_ship;

  -- Pending buyer receive = any other dispatch still in 'dispatched' status
  SELECT EXISTS (
    SELECT 1
    FROM public.purchase_order_deliveries d
    WHERE d.purchase_order_id = po_record.id
      AND d.status = 'dispatched'
      AND d.id IS DISTINCT FROM p_delivery_id
  ) INTO v_any_open_recv;

  UPDATE public.purchase_orders
  SET
    status = CASE WHEN v_any_open_ship THEN 'partially_fulfilled' ELSE 'fulfilled' END,
    workflow_status = CASE
      WHEN (NOT v_any_open_ship) AND (NOT v_any_open_recv) THEN 'delivered'
      ELSE 'partial_delivered'
    END,
    updated_at = NOW()
  WHERE id = po_record.id;

  IF (NOT v_any_open_ship) AND (NOT v_any_open_recv) THEN
    UPDATE public.purchase_orders po
    SET dr_number = (
      SELECT string_agg(DISTINCT d.dr_number, ', ' ORDER BY d.dr_number)
      FROM public.purchase_order_deliveries d
      WHERE d.purchase_order_id = po.id
        AND d.dr_number IS NOT NULL
    )
    WHERE po.id = po_record.id;
  END IF;

  RETURN json_build_object(
    'success', true,
    'delivery_id', p_delivery_id,
    'fully_received', v_all_received,
    'po_complete', (NOT v_any_open_ship) AND (NOT v_any_open_recv)
  );
END;
$$;

COMMENT ON FUNCTION public.receive_po_delivery(uuid, jsonb, text, text, text, text, uuid) IS
  'Buyer receives a dispatch: credits Standard Account inventory for received qty; restores shortfall to warehouse and reopens reservation for another DR. Requires buyer signature.';

GRANT EXECUTE ON FUNCTION public.receive_po_delivery(uuid, jsonb, text, text, text, text, uuid) TO authenticated;

-- Buyer proof uploads (path: {buyer_company_id}/po/{po_id}/receive_...)
DROP POLICY IF EXISTS "Buyer PO receive proof insert" ON storage.objects;
CREATE POLICY "Buyer PO receive proof insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ka-delivery-rider-photos'
    AND (storage.foldername(name))[1] = public.get_auth_company_id()::text
  );

DROP POLICY IF EXISTS "Buyer PO receive proof select" ON storage.objects;
CREATE POLICY "Buyer PO receive proof select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'ka-delivery-rider-photos'
    AND (storage.foldername(name))[1] = public.get_auth_company_id()::text
  );

-- Buyer receive signatures (path: {buyer_company_id}/po/{po_id}/receive_signature_...)
DROP POLICY IF EXISTS "Buyer PO receive signature insert" ON storage.objects;
CREATE POLICY "Buyer PO receive signature insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ka-delivery-warehouse-signatures'
    AND (storage.foldername(name))[1] = public.get_auth_company_id()::text
  );

DROP POLICY IF EXISTS "Buyer PO receive signature select" ON storage.objects;
CREATE POLICY "Buyer PO receive signature select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'ka-delivery-warehouse-signatures'
    AND (storage.foldername(name))[1] = public.get_auth_company_id()::text
  );
