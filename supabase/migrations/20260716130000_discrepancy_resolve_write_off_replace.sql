-- Split shortage resolve into:
--   redeliver            = found: restore stock + reopen for another DR
--   write_off_replace    = lost: no stock restore + reopen for replacement DR
--   write_off            = lost: no stock restore + do not reopen (accept short)

ALTER TABLE public.purchase_order_delivery_discrepancies
  DROP CONSTRAINT IF EXISTS purchase_order_delivery_discrepancies_status_check;

ALTER TABLE public.purchase_order_delivery_discrepancies
  ADD CONSTRAINT purchase_order_delivery_discrepancies_status_check CHECK (
    status = ANY (ARRAY[
      'open'::text,
      'resolved_redeliver'::text,
      'resolved_write_off'::text,
      'resolved_write_off_replace'::text,
      'cancelled'::text
    ])
  );

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
BEGIN
  v_resolution := lower(btrim(COALESCE(p_resolution, '')));
  -- Aliases for clarity / older clients
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

  -- Found only: put units back into warehouse on-hand
  IF v_restore_stock THEN
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

  -- Reopen reservation so warehouse can dispatch another DR on the same PO
  -- (replacement uses remaining real stock when write_off_replace)
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
    'reopened', v_reopen
  );
END;
$$;

COMMENT ON FUNCTION public.resolve_po_delivery_discrepancy(uuid, text, text, uuid) IS
  'Resolve buyer delivery shortfall: redeliver (restore+reopen), write_off_replace (no restore+reopen for replacement), write_off (loss only).';

-- Bulk wrapper already calls resolve_po_delivery_discrepancy; refresh comment only.
COMMENT ON FUNCTION public.resolve_po_delivery_discrepancies_bulk(uuid[], text, text, uuid) IS
  'Bulk resolve open shortage lines with redeliver | write_off_replace | write_off.';
