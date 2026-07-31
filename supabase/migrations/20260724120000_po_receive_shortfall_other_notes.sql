-- Allow per-line free-text notes when shortfall reason is "other".
-- Stored on purchase_order_delivery_discrepancies.buyer_notes (alongside optional p_notes).

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
  v_shortfall_notes text;
  v_buyer_notes text;
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

    SELECT NULLIF(btrim(COALESCE((
      SELECT elem->>'shortfall_notes'
      FROM jsonb_array_elements(p_items) elem
      WHERE (elem->>'variant_id')::uuid = item_rec.variant_id
      LIMIT 1
    ), '')), '') INTO v_shortfall_notes;

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

      IF v_shortfall_reason = 'other' AND v_shortfall_notes IS NULL THEN
        RETURN json_build_object(
          'success', false,
          'error', 'Please describe the shortfall when reason is Other',
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
      v_buyer_notes := NULLIF(
        btrim(
          CONCAT_WS(
            E'\n',
            v_shortfall_notes,
            NULLIF(btrim(COALESCE(p_notes, '')), '')
          )
        ),
        ''
      );

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
        v_buyer_notes,
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
  'Buyer receives a dispatch: credits Standard Account inventory for received qty; shortfalls open warehouse discrepancy tickets (no auto stock restore). Requires buyer signature, shortfall_reason per short line, and shortfall_notes when reason is other.';
