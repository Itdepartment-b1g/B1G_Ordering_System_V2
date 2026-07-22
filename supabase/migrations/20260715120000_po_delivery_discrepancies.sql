-- Buyer receive shortfalls → delivery discrepancy queue (investigate → redeliver or write-off).
-- Standard Accounts only (Key Accounts still complete on dispatch; no buyer receive).

-- ---------------------------------------------------------------------------
-- 1) Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchase_order_delivery_discrepancies (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  delivery_id uuid NOT NULL REFERENCES public.purchase_order_deliveries(id) ON DELETE CASCADE,
  delivery_item_id uuid REFERENCES public.purchase_order_delivery_items(id) ON DELETE SET NULL,
  warehouse_location_id uuid NOT NULL REFERENCES public.warehouse_locations(id) ON DELETE RESTRICT,
  variant_id uuid NOT NULL REFERENCES public.variants(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  reason text NOT NULL CHECK (
    reason = ANY (ARRAY[
      'missing_in_transit'::text,
      'damaged'::text,
      'wrong_item'::text,
      'other'::text
    ])
  ),
  buyer_notes text,
  status text NOT NULL DEFAULT 'open' CHECK (
    status = ANY (ARRAY[
      'open'::text,
      'resolved_redeliver'::text,
      'resolved_write_off'::text,
      'cancelled'::text
    ])
  ),
  reported_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_po_delivery_discrepancies_company_status
  ON public.purchase_order_delivery_discrepancies(company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_po_delivery_discrepancies_delivery
  ON public.purchase_order_delivery_discrepancies(delivery_id);

CREATE INDEX IF NOT EXISTS idx_po_delivery_discrepancies_po
  ON public.purchase_order_delivery_discrepancies(purchase_order_id);

COMMENT ON TABLE public.purchase_order_delivery_discrepancies IS
  'Buyer-reported PO delivery shortfalls awaiting warehouse investigation (redeliver or write-off).';

ALTER TABLE public.purchase_order_delivery_discrepancies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Warehouse can view PO delivery discrepancies" ON public.purchase_order_delivery_discrepancies;
CREATE POLICY "Warehouse can view PO delivery discrepancies"
  ON public.purchase_order_delivery_discrepancies
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_auth_company_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'warehouse'
        AND p.company_id = purchase_order_delivery_discrepancies.company_id
    )
  );

DROP POLICY IF EXISTS "Buyer company can view PO delivery discrepancies" ON public.purchase_order_delivery_discrepancies;
CREATE POLICY "Buyer company can view PO delivery discrepancies"
  ON public.purchase_order_delivery_discrepancies
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.purchase_orders po
      WHERE po.id = purchase_order_delivery_discrepancies.purchase_order_id
        AND po.company_id = public.get_auth_company_id()
    )
  );

-- Inserts/updates go through SECURITY DEFINER RPCs only.
GRANT SELECT ON public.purchase_order_delivery_discrepancies TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) receive_po_delivery — shortfall creates open discrepancy (no auto-restore)
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
  v_shortfall_reason text;
  v_client_variant_id uuid;
  v_all_received boolean;
  v_any_open_ship boolean;
  v_any_open_recv boolean;
  v_discrepancy_count integer := 0;
  existing_client_inv RECORD;
BEGIN
  SELECT * INTO d_rec FROM public.purchase_order_deliveries WHERE id = p_delivery_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Delivery not found');
  END IF;

  IF d_rec.status IN ('received', 'delivered', 'cancelled') THEN
    RETURN json_build_object('success', false, 'error', 'Delivery already fully received or cancelled');
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

    SELECT NULLIF(btrim(COALESCE((
      SELECT elem->>'shortfall_reason'
      FROM jsonb_array_elements(p_items) elem
      WHERE (elem->>'variant_id')::uuid = item_rec.variant_id
      LIMIT 1
    ), '')), '') INTO v_shortfall_reason;

    IF v_shortfall > 0 THEN
      IF v_shortfall_reason IS NULL OR v_shortfall_reason NOT IN (
        'missing_in_transit', 'damaged', 'wrong_item', 'other'
      ) THEN
        RETURN json_build_object(
          'success', false,
          'error', 'Shortfall reason is required when receiving less than dispatched',
          'variant_id', item_rec.variant_id,
          'shortfall', v_shortfall
        );
      END IF;
    END IF;

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

    -- Shortfall → open discrepancy for warehouse investigation (no stock restore yet)
    IF v_shortfall > 0 AND po_record.warehouse_company_id IS NOT NULL THEN
      INSERT INTO public.purchase_order_delivery_discrepancies (
        company_id,
        purchase_order_id,
        delivery_id,
        delivery_item_id,
        warehouse_location_id,
        variant_id,
        quantity,
        reason,
        buyer_notes,
        status,
        reported_by,
        created_at,
        updated_at
      ) VALUES (
        po_record.warehouse_company_id,
        po_record.id,
        p_delivery_id,
        item_rec.id,
        d_rec.warehouse_location_id,
        item_rec.variant_id,
        v_shortfall,
        v_shortfall_reason,
        NULLIF(btrim(COALESCE(p_notes, '')), ''),
        'open',
        p_received_by,
        NOW(),
        NOW()
      );
      v_discrepancy_count := v_discrepancy_count + 1;
    END IF;
  END LOOP;

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

  -- Refresh location status from reservations (unchanged: shortfall stays fulfilled until redeliver)
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
        AND COALESCE(d.status, '') <> 'cancelled'
    )
    WHERE po.id = po_record.id;
  END IF;

  RETURN json_build_object(
    'success', true,
    'delivery_id', p_delivery_id,
    'fully_received', v_all_received,
    'po_complete', (NOT v_any_open_ship) AND (NOT v_any_open_recv),
    'discrepancies_opened', v_discrepancy_count
  );
END;
$$;

COMMENT ON FUNCTION public.receive_po_delivery(uuid, jsonb, text, text, text, text, uuid) IS
  'Buyer receives a dispatch: credits Standard Account inventory for received qty; shortfalls open warehouse discrepancy tickets (no auto stock restore). Requires buyer signature and shortfall_reason per short line.';

GRANT EXECUTE ON FUNCTION public.receive_po_delivery(uuid, jsonb, text, text, text, text, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Resolve discrepancy: redeliver (restore + reopen) or write-off (audit only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_po_delivery_discrepancy(
  p_discrepancy_id uuid,
  p_resolution text,
  p_notes text DEFAULT NULL,
  p_resolved_by uuid DEFAULT auth.uid()
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  disc RECORD;
  po_record RECORD;
  d_rec RECORD;
  v_resolver RECORD;
  v_is_main_location boolean;
  v_resolution text;
BEGIN
  v_resolution := lower(btrim(COALESCE(p_resolution, '')));
  IF v_resolution NOT IN ('redeliver', 'write_off') THEN
    RETURN json_build_object('success', false, 'error', 'Resolution must be redeliver or write_off');
  END IF;

  SELECT * INTO disc
  FROM public.purchase_order_delivery_discrepancies
  WHERE id = p_discrepancy_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Discrepancy not found');
  END IF;

  IF disc.status <> 'open' THEN
    RETURN json_build_object('success', false, 'error', 'Discrepancy is already resolved');
  END IF;

  SELECT * INTO po_record FROM public.purchase_orders WHERE id = disc.purchase_order_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Purchase order not found');
  END IF;

  SELECT * INTO d_rec FROM public.purchase_order_deliveries WHERE id = disc.delivery_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Delivery not found');
  END IF;

  SELECT p.id, p.role, p.company_id INTO v_resolver
  FROM public.profiles p
  WHERE p.id = p_resolved_by;

  IF NOT FOUND
     OR v_resolver.role IS DISTINCT FROM 'warehouse'
     OR v_resolver.company_id IS DISTINCT FROM disc.company_id THEN
    RETURN json_build_object('success', false, 'error', 'Only warehouse staff for this hub can resolve discrepancies');
  END IF;

  SELECT COALESCE(wl.is_main, false) INTO v_is_main_location
  FROM public.warehouse_locations wl
  WHERE wl.id = disc.warehouse_location_id;

  IF v_resolution = 'redeliver' THEN
    -- Restore stock deducted at dispatch and reopen reservation for another DR
    IF COALESCE(v_is_main_location, true) THEN
      UPDATE public.main_inventory
      SET stock = stock + disc.quantity,
          updated_at = NOW()
      WHERE company_id = disc.company_id
        AND variant_id = disc.variant_id;

      IF NOT FOUND THEN
        INSERT INTO public.main_inventory (
          company_id, variant_id, stock, unit_price, reorder_level, created_at, updated_at
        ) VALUES (
          disc.company_id, disc.variant_id, disc.quantity,
          0, 10, NOW(), NOW()
        );
      END IF;
    ELSE
      UPDATE public.warehouse_location_inventory
      SET stock = stock + disc.quantity,
          updated_at = NOW()
      WHERE company_id = disc.company_id
        AND location_id = disc.warehouse_location_id
        AND variant_id = disc.variant_id;

      IF NOT FOUND THEN
        INSERT INTO public.warehouse_location_inventory (
          company_id, location_id, variant_id, stock, created_at, updated_at
        ) VALUES (
          disc.company_id, disc.warehouse_location_id, disc.variant_id, disc.quantity,
          NOW(), NOW()
        );
      END IF;

      UPDATE public.main_inventory
      SET allocated_stock = COALESCE(allocated_stock, 0) + disc.quantity,
          updated_at = NOW()
      WHERE company_id = disc.company_id
        AND variant_id = disc.variant_id;
    END IF;

    INSERT INTO public.inventory_transactions (
      company_id, variant_id, transaction_type, quantity,
      reference_type, reference_id, performed_by, notes, created_at
    ) VALUES (
      disc.company_id, disc.variant_id, 'warehouse_transfer_in', disc.quantity,
      'purchase_order', disc.purchase_order_id, p_resolved_by,
      'Discrepancy redeliver restore PO ' || po_record.po_number
        || ' DR ' || COALESCE(d_rec.dr_number, '')
        || COALESCE(' — ' || NULLIF(btrim(COALESCE(p_notes, '')), ''), ''),
      NOW()
    );

    UPDATE public.warehouse_transfer_reservations
    SET quantity_fulfilled = GREATEST(0, quantity_fulfilled - disc.quantity),
        status = CASE
          WHEN GREATEST(0, quantity_fulfilled - disc.quantity) <= 0 THEN 'reserved'
          WHEN GREATEST(0, quantity_fulfilled - disc.quantity) < quantity_reserved THEN 'partial'
          ELSE 'fulfilled'
        END,
        updated_at = NOW()
    WHERE purchase_order_id = disc.purchase_order_id
      AND warehouse_location_id = disc.warehouse_location_id
      AND variant_id = disc.variant_id;

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
    WHERE s.purchase_order_id = disc.purchase_order_id
      AND s.warehouse_location_id = disc.warehouse_location_id;

    UPDATE public.purchase_orders
    SET
      status = 'partially_fulfilled',
      workflow_status = 'partial_delivered',
      updated_at = NOW()
    WHERE id = disc.purchase_order_id;

    UPDATE public.purchase_order_delivery_discrepancies
    SET status = 'resolved_redeliver',
        resolved_by = p_resolved_by,
        resolved_at = NOW(),
        resolution_notes = NULLIF(btrim(COALESCE(p_notes, '')), ''),
        updated_at = NOW()
    WHERE id = p_discrepancy_id;

    RETURN json_build_object(
      'success', true,
      'discrepancy_id', p_discrepancy_id,
      'resolution', 'redeliver',
      'quantity', disc.quantity
    );
  END IF;

  -- write_off: stock already left warehouse at dispatch; confirm loss without changing on-hand
  -- (no inventory_transactions row — avoids double-counting vs dispatch deduct).
  UPDATE public.purchase_order_delivery_discrepancies
  SET status = 'resolved_write_off',
      resolved_by = p_resolved_by,
      resolved_at = NOW(),
      resolution_notes = NULLIF(btrim(COALESCE(p_notes, '')), ''),
      updated_at = NOW()
  WHERE id = p_discrepancy_id;

  RETURN json_build_object(
    'success', true,
    'discrepancy_id', p_discrepancy_id,
    'resolution', 'write_off',
    'quantity', disc.quantity
  );
END;
$$;

COMMENT ON FUNCTION public.resolve_po_delivery_discrepancy(uuid, text, text, uuid) IS
  'Warehouse resolves a buyer delivery shortfall: redeliver restores stock and reopens reservation; write_off confirms loss (audit txn only, no extra stock deduct).';

GRANT EXECUTE ON FUNCTION public.resolve_po_delivery_discrepancy(uuid, text, text, uuid) TO authenticated;
