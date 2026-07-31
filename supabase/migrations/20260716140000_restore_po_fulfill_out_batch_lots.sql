-- Restore batch lots when stock returns from PO fulfill_out
-- (Found → redeliver discrepancy, and buyer refuse DR).

-- ---------------------------------------------------------------------------
-- 1) Batch helper: LIFO undo of fulfill_out into original lots (+ opening fallback)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_po_fulfill_out_inventory_lots(
  p_company_id uuid,
  p_warehouse_location_id uuid,
  p_variant_id uuid,
  p_quantity integer,
  p_original_po_id uuid,
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
  v_remaining integer;
  v_mov RECORD;
  v_take integer;
  v_lot_id uuid;
  v_opening_batch_id uuid;
  v_opening_received_at timestamptz;
  v_restored jsonb := '[]'::jsonb;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Quantity must be positive');
  END IF;

  v_remaining := p_quantity;

  FOR v_mov IN
    SELECT
      ibm.batch_id,
      ibm.quantity,
      ibl.received_at AS lot_received_at,
      ibl.manufactured_date,
      ibl.expiration_date,
      ibl.unit_cost
    FROM public.inventory_batch_movements ibm
    JOIN public.inventory_batch_lots ibl ON ibl.id = ibm.lot_id
    WHERE ibm.company_id = p_company_id
      AND ibm.variant_id = p_variant_id
      AND ibm.warehouse_location_id = p_warehouse_location_id
      AND ibm.movement_type = 'fulfill_out'
      AND ibm.reference_type = 'purchase_order'
      AND ibm.reference_id = p_original_po_id
    ORDER BY ibm.created_at DESC, ibm.id DESC
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_take := LEAST(v_mov.quantity, v_remaining);

    v_lot_id := public.merge_inventory_batch_lot_at_location(
      p_company_id,
      v_mov.batch_id,
      p_variant_id,
      p_warehouse_location_id,
      v_take,
      v_mov.lot_received_at,
      v_mov.manufactured_date,
      v_mov.expiration_date,
      v_mov.unit_cost
    );

    INSERT INTO public.inventory_batch_movements (
      company_id, lot_id, batch_id, variant_id, warehouse_location_id,
      movement_type, quantity, reference_type, reference_id,
      to_location_id, performed_by, notes
    ) VALUES (
      p_company_id, v_lot_id, v_mov.batch_id, p_variant_id, p_warehouse_location_id,
      'return_in', v_take, p_reference_type, p_reference_id,
      p_warehouse_location_id, p_performed_by, p_notes
    );

    v_restored := v_restored || jsonb_build_object(
      'batch_id', v_mov.batch_id,
      'quantity', v_take,
      'source', 'fulfill_out_replay'
    );

    v_remaining := v_remaining - v_take;
  END LOOP;

  IF v_remaining > 0 THEN
    SELECT ib.id, ib.received_at
    INTO v_opening_batch_id, v_opening_received_at
    FROM public.inventory_batches ib
    WHERE ib.company_id = p_company_id
      AND ib.source_type = 'opening_balance'
    ORDER BY ib.received_at ASC, ib.created_at ASC
    LIMIT 1;

    IF v_opening_batch_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'No opening balance batch found for fulfill restore fallback'
      );
    END IF;

    v_lot_id := public.merge_inventory_batch_lot_at_location(
      p_company_id,
      v_opening_batch_id,
      p_variant_id,
      p_warehouse_location_id,
      v_remaining,
      COALESCE(v_opening_received_at, now())
    );

    INSERT INTO public.inventory_batch_movements (
      company_id, lot_id, batch_id, variant_id, warehouse_location_id,
      movement_type, quantity, reference_type, reference_id,
      to_location_id, performed_by, notes
    ) VALUES (
      p_company_id, v_lot_id, v_opening_batch_id, p_variant_id, p_warehouse_location_id,
      'return_in', v_remaining, p_reference_type, p_reference_id,
      p_warehouse_location_id, p_performed_by,
      COALESCE(p_notes, '') || ' (opening balance fallback)'
    );

    v_restored := v_restored || jsonb_build_object(
      'batch_id', v_opening_batch_id,
      'quantity', v_remaining,
      'source', 'opening_balance_fallback'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'restored', v_restored,
    'quantity', p_quantity
  );
END;
$$;

COMMENT ON FUNCTION public.restore_po_fulfill_out_inventory_lots IS
  'Restore qty into original fulfill_out batch lots (LIFO) for a PO location; opening_balance fallback if needed.';

GRANT EXECUTE ON FUNCTION public.restore_po_fulfill_out_inventory_lots(
  uuid, uuid, uuid, integer, uuid, text, uuid, uuid, text
) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) resolve_po_delivery_discrepancy — restore batches on Found → redeliver
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
  v_restore_stock boolean;
  v_reopen boolean;
  v_status text;
  v_batch_result jsonb;
BEGIN
  v_resolution := lower(btrim(COALESCE(p_resolution, '')));
  IF v_resolution IN ('found_redeliver', 'restore_redeliver') THEN
    v_resolution := 'redeliver';
  END IF;
  IF v_resolution IN ('lost_replace', 'write_off_and_replace') THEN
    v_resolution := 'write_off_replace';
  END IF;

  IF v_resolution NOT IN ('redeliver', 'write_off_replace', 'write_off') THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Resolution must be redeliver, write_off_replace, or write_off'
    );
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

  v_restore_stock := (v_resolution = 'redeliver');
  v_reopen := (v_resolution IN ('redeliver', 'write_off_replace'));
  v_status := CASE v_resolution
    WHEN 'redeliver' THEN 'resolved_redeliver'
    WHEN 'write_off_replace' THEN 'resolved_write_off_replace'
    ELSE 'resolved_write_off'
  END;

  IF v_restore_stock THEN
    -- Batch lots first so total stock and Batch View stay in sync
    v_batch_result := public.restore_po_fulfill_out_inventory_lots(
      disc.company_id,
      disc.warehouse_location_id,
      disc.variant_id,
      disc.quantity,
      disc.purchase_order_id,
      'purchase_order',
      disc.purchase_order_id,
      p_resolved_by,
      'Discrepancy found — batch restore PO ' || po_record.po_number
        || ' DR ' || COALESCE(d_rec.dr_number, '')
        || COALESCE(' — ' || NULLIF(btrim(COALESCE(p_notes, '')), ''), '')
    );

    IF NOT COALESCE((v_batch_result->>'success')::boolean, false) THEN
      RETURN json_build_object(
        'success', false,
        'error', COALESCE(v_batch_result->>'error', 'Failed to restore batch lots'),
        'discrepancy_id', p_discrepancy_id
      );
    END IF;

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
      'Discrepancy found — restore PO ' || po_record.po_number
        || ' DR ' || COALESCE(d_rec.dr_number, '')
        || COALESCE(' — ' || NULLIF(btrim(COALESCE(p_notes, '')), ''), ''),
      NOW()
    );
  END IF;

  IF v_reopen THEN
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
  END IF;

  UPDATE public.purchase_order_delivery_discrepancies
  SET status = v_status,
      resolved_by = p_resolved_by,
      resolved_at = NOW(),
      resolution_notes = NULLIF(btrim(COALESCE(p_notes, '')), ''),
      updated_at = NOW()
  WHERE id = p_discrepancy_id;

  RETURN json_build_object(
    'success', true,
    'discrepancy_id', p_discrepancy_id,
    'resolution', v_resolution,
    'quantity', disc.quantity,
    'restored_stock', v_restore_stock,
    'reopened', v_reopen,
    'batch_restored', CASE WHEN v_restore_stock THEN v_batch_result->'restored' ELSE '[]'::jsonb END
  );
END;
$$;

COMMENT ON FUNCTION public.resolve_po_delivery_discrepancy(uuid, text, text, uuid) IS
  'Resolve buyer delivery shortfall: redeliver restores batch lots + aggregate stock and reopens; write_off_replace reopens without stock; write_off confirms loss only.';

-- ---------------------------------------------------------------------------
-- 3) cancel_po_delivery — same batch restore when buyer refuses DR
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_po_delivery(
  p_delivery_id uuid,
  p_proof_url text,
  p_signature_url text,
  p_signature_path text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_cancelled_by uuid DEFAULT auth.uid()
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  d_rec RECORD;
  po_record RECORD;
  v_actor RECORD;
  item_rec RECORD;
  v_qty integer;
  v_is_main_location boolean;
  v_any_open_ship boolean;
  v_any_open_recv boolean;
  v_batch_result jsonb;
BEGIN
  SELECT * INTO d_rec FROM public.purchase_order_deliveries WHERE id = p_delivery_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Delivery not found');
  END IF;

  IF d_rec.status IS DISTINCT FROM 'dispatched' THEN
    RETURN json_build_object('success', false, 'error', 'Only a dispatched delivery can be cancelled');
  END IF;

  SELECT * INTO po_record FROM public.purchase_orders WHERE id = d_rec.purchase_order_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Purchase order not found');
  END IF;

  IF po_record.company_account_type = 'Key Accounts'
     OR po_record.key_account_client_id IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'Key Account deliveries cannot be cancelled via buyer refuse');
  END IF;

  SELECT p.id, p.role, p.company_id INTO v_actor
  FROM public.profiles p
  WHERE p.id = p_cancelled_by;

  IF NOT FOUND OR v_actor.company_id IS DISTINCT FROM po_record.company_id THEN
    RETURN json_build_object('success', false, 'error', 'Only the buying company can cancel this delivery');
  END IF;

  IF p_proof_url IS NULL OR btrim(p_proof_url) = '' THEN
    RETURN json_build_object('success', false, 'error', 'Cancel proof photo is required');
  END IF;

  IF p_signature_url IS NULL OR btrim(p_signature_url) = '' THEN
    RETURN json_build_object('success', false, 'error', 'Cancel signature is required');
  END IF;

  IF p_notes IS NULL OR btrim(p_notes) = '' THEN
    RETURN json_build_object('success', false, 'error', 'Cancel notes / reason are required');
  END IF;

  SELECT COALESCE(wl.is_main, false) INTO v_is_main_location
  FROM public.warehouse_locations wl
  WHERE wl.id = d_rec.warehouse_location_id;

  FOR item_rec IN
    SELECT di.*
    FROM public.purchase_order_delivery_items di
    WHERE di.delivery_id = p_delivery_id
  LOOP
    IF COALESCE(item_rec.quantity_received, 0) > 0 THEN
      RETURN json_build_object('success', false, 'error', 'Delivery already has received quantities');
    END IF;

    v_qty := item_rec.quantity_dispatched;
    IF v_qty <= 0 THEN
      CONTINUE;
    END IF;

    v_batch_result := public.restore_po_fulfill_out_inventory_lots(
      po_record.warehouse_company_id,
      d_rec.warehouse_location_id,
      item_rec.variant_id,
      v_qty,
      po_record.id,
      'purchase_order',
      po_record.id,
      p_cancelled_by,
      'Buyer refused DR ' || COALESCE(d_rec.dr_number, '') || ' — batch restore PO ' || po_record.po_number
    );

    IF NOT COALESCE((v_batch_result->>'success')::boolean, false) THEN
      RETURN json_build_object(
        'success', false,
        'error', COALESCE(v_batch_result->>'error', 'Failed to restore batch lots'),
        'variant_id', item_rec.variant_id
      );
    END IF;

    IF COALESCE(v_is_main_location, true) THEN
      UPDATE public.main_inventory
      SET stock = stock + v_qty,
          updated_at = NOW()
      WHERE company_id = po_record.warehouse_company_id
        AND variant_id = item_rec.variant_id;

      IF NOT FOUND THEN
        INSERT INTO public.main_inventory (
          company_id, variant_id, stock, unit_price, reorder_level, created_at, updated_at
        ) VALUES (
          po_record.warehouse_company_id, item_rec.variant_id, v_qty,
          0, 10, NOW(), NOW()
        );
      END IF;
    ELSE
      UPDATE public.warehouse_location_inventory
      SET stock = stock + v_qty,
          updated_at = NOW()
      WHERE company_id = po_record.warehouse_company_id
        AND location_id = d_rec.warehouse_location_id
        AND variant_id = item_rec.variant_id;

      IF NOT FOUND THEN
        INSERT INTO public.warehouse_location_inventory (
          company_id, location_id, variant_id, stock, created_at, updated_at
        ) VALUES (
          po_record.warehouse_company_id, d_rec.warehouse_location_id, item_rec.variant_id, v_qty,
          NOW(), NOW()
        );
      END IF;

      UPDATE public.main_inventory
      SET allocated_stock = COALESCE(allocated_stock, 0) + v_qty,
          updated_at = NOW()
      WHERE company_id = po_record.warehouse_company_id
        AND variant_id = item_rec.variant_id;
    END IF;

    INSERT INTO public.inventory_transactions (
      company_id, variant_id, transaction_type, quantity,
      reference_type, reference_id, performed_by, notes, created_at
    ) VALUES (
      po_record.warehouse_company_id, item_rec.variant_id, 'warehouse_transfer_in', v_qty,
      'purchase_order', po_record.id, p_cancelled_by,
      'Buyer refused DR ' || COALESCE(d_rec.dr_number, '') || ' for PO ' || po_record.po_number,
      NOW()
    );

    UPDATE public.warehouse_transfer_reservations
    SET quantity_fulfilled = GREATEST(0, quantity_fulfilled - v_qty),
        status = CASE
          WHEN GREATEST(0, quantity_fulfilled - v_qty) <= 0 THEN 'reserved'
          WHEN GREATEST(0, quantity_fulfilled - v_qty) < quantity_reserved THEN 'partial'
          ELSE 'fulfilled'
        END,
        updated_at = NOW()
    WHERE purchase_order_id = po_record.id
      AND warehouse_location_id = d_rec.warehouse_location_id
      AND variant_id = item_rec.variant_id;

    UPDATE public.purchase_order_delivery_items
    SET quantity_received = 0,
        updated_at = NOW()
    WHERE id = item_rec.id;
  END LOOP;

  UPDATE public.purchase_order_deliveries
  SET status = 'cancelled',
      cancelled_at = NOW(),
      cancelled_by = p_cancelled_by,
      cancel_proof_url = p_proof_url,
      cancel_signature_url = p_signature_url,
      cancel_signature_path = p_signature_path,
      cancel_notes = btrim(p_notes)
  WHERE id = p_delivery_id;

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
    status = CASE WHEN v_any_open_ship THEN 'partially_fulfilled'
                  WHEN EXISTS (
                    SELECT 1 FROM public.purchase_order_deliveries d
                    WHERE d.purchase_order_id = po_record.id
                      AND d.status IN ('received', 'delivered', 'dispatched')
                  ) THEN 'fulfilled'
                  ELSE 'approved_for_fulfillment'
             END,
    workflow_status = CASE
      WHEN (NOT v_any_open_ship) AND (NOT v_any_open_recv) THEN 'delivered'
      WHEN v_any_open_recv OR EXISTS (
        SELECT 1 FROM public.purchase_order_deliveries d
        WHERE d.purchase_order_id = po_record.id
          AND d.status IN ('received', 'delivered', 'cancelled', 'dispatched')
      ) THEN 'partial_delivered'
      ELSE 'approved'
    END,
    updated_at = NOW()
  WHERE id = po_record.id;

  RETURN json_build_object(
    'success', true,
    'delivery_id', p_delivery_id,
    'stock_restored', true,
    'po_complete', (NOT v_any_open_ship) AND (NOT v_any_open_recv)
  );
END;
$$;

COMMENT ON FUNCTION public.cancel_po_delivery(uuid, text, text, text, text, uuid) IS
  'Buyer refuses a dispatched DR: restores batch lots + aggregate stock, reopens reservation, stores cancel proof/signature/notes.';
