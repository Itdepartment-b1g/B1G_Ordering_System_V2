-- Buyer refuse/cancel a dispatched DR: restore all qty to warehouse, reopen reservation
-- for another dispatch, store cancel proof/signature/notes, mark delivery cancelled.

ALTER TABLE public.purchase_order_deliveries
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS cancel_proof_url text,
  ADD COLUMN IF NOT EXISTS cancel_signature_url text,
  ADD COLUMN IF NOT EXISTS cancel_signature_path text,
  ADD COLUMN IF NOT EXISTS cancel_notes text;

COMMENT ON COLUMN public.purchase_order_deliveries.status IS
  'dispatched | partially_received | received | delivered | cancelled';

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

  -- Standard Accounts buyer refuse only (Key Accounts have no receive/cancel step)
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

    -- Restore full dispatched qty to warehouse (same path as receive shortfall)
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
  'Buyer refuses a dispatched DR: restores all qty to warehouse, reopens reservation for re-dispatch, stores cancel proof/signature/notes.';

GRANT EXECUTE ON FUNCTION public.cancel_po_delivery(uuid, text, text, text, text, uuid) TO authenticated;
