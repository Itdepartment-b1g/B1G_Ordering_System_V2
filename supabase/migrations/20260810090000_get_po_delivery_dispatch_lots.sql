-- Resolve which inventory batch lots were shipped on a specific PO delivery (DR).
-- Supports multi-batch splits (e.g. 50 from batch 1 + 50 from batch 2).
-- Attributes fulfill_out movements chronologically across partial DRs for the same PO+location.

CREATE OR REPLACE FUNCTION public.get_po_delivery_dispatch_lots(p_delivery_id uuid)
RETURNS TABLE (
  variant_id uuid,
  batch_id uuid,
  batch_number text,
  lot_id uuid,
  expiration_date date,
  quantity integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  d_rec public.purchase_order_deliveries%ROWTYPE;
  v_can_view boolean := false;
  r_del RECORD;
  r_item RECORD;
  v_need integer;
  v_take integer;
  v_movements jsonb := '[]'::jsonb;
  v_mov jsonb;
  v_idx integer;
  v_remain integer;
BEGIN
  IF p_delivery_id IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO d_rec
  FROM public.purchase_order_deliveries
  WHERE id = p_delivery_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_can_view :=
    public.is_system_administrator()
    OR (
      public.is_warehouse()
      AND EXISTS (
        SELECT 1
        FROM public.purchase_orders po
        WHERE po.id = d_rec.purchase_order_id
          AND po.warehouse_company_id = public.get_auth_company_id()
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.purchase_orders po
      WHERE po.id = d_rec.purchase_order_id
        AND po.company_id = public.get_auth_company_id()
        AND po.company_id = d_rec.company_id
    );

  IF NOT v_can_view THEN
    RAISE EXCEPTION 'Not authorized to view delivery lot details';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(m)::jsonb ORDER BY m.created_at ASC, m.movement_id ASC), '[]'::jsonb)
  INTO v_movements
  FROM (
    SELECT
      ibm.id AS movement_id,
      ibm.variant_id,
      ibm.batch_id,
      ib.batch_number,
      ibm.lot_id,
      ibl.expiration_date,
      ibm.quantity::int AS qty_remaining,
      ibm.created_at
    FROM public.inventory_batch_movements ibm
    JOIN public.inventory_batches ib ON ib.id = ibm.batch_id
    JOIN public.inventory_batch_lots ibl ON ibl.id = ibm.lot_id
    WHERE ibm.movement_type = 'fulfill_out'
      AND ibm.reference_type = 'purchase_order'
      AND ibm.reference_id = d_rec.purchase_order_id
      AND ibm.warehouse_location_id IS NOT DISTINCT FROM d_rec.warehouse_location_id
  ) m;

  -- Include cancelled deliveries in the walk so their original fulfill_out qty
  -- is consumed from the movement stream (stock may have been restored later).
  FOR r_del IN
    SELECT d.id
    FROM public.purchase_order_deliveries d
    WHERE d.purchase_order_id = d_rec.purchase_order_id
      AND d.warehouse_location_id IS NOT DISTINCT FROM d_rec.warehouse_location_id
    ORDER BY COALESCE(d.dispatched_at, d.created_at) ASC, d.created_at ASC, d.id ASC
  LOOP
    FOR r_item IN
      SELECT di.variant_id, di.quantity_dispatched::int AS qty_needed
      FROM public.purchase_order_delivery_items di
      WHERE di.delivery_id = r_del.id
        AND di.quantity_dispatched > 0
      ORDER BY di.variant_id
    LOOP
      v_need := r_item.qty_needed;

      FOR v_idx IN 0 .. GREATEST(jsonb_array_length(v_movements) - 1, -1)
      LOOP
        EXIT WHEN v_need <= 0;
        v_mov := v_movements -> v_idx;
        IF (v_mov->>'variant_id')::uuid IS DISTINCT FROM r_item.variant_id THEN
          CONTINUE;
        END IF;

        v_remain := COALESCE((v_mov->>'qty_remaining')::int, 0);
        IF v_remain <= 0 THEN
          CONTINUE;
        END IF;

        v_take := LEAST(v_remain, v_need);
        v_movements := jsonb_set(
          v_movements,
          ARRAY[v_idx::text, 'qty_remaining'],
          to_jsonb(v_remain - v_take),
          true
        );

        IF r_del.id = p_delivery_id THEN
          variant_id := r_item.variant_id;
          batch_id := (v_mov->>'batch_id')::uuid;
          batch_number := v_mov->>'batch_number';
          lot_id := (v_mov->>'lot_id')::uuid;
          expiration_date := NULLIF(v_mov->>'expiration_date', '')::date;
          quantity := v_take;
          RETURN NEXT;
        END IF;

        v_need := v_need - v_take;
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN;
END;
$$;

COMMENT ON FUNCTION public.get_po_delivery_dispatch_lots(uuid) IS
  'Batch number + expiration + qty per lot shipped on a PO delivery (DR). Splits across multiple batches when fulfill consumed more than one lot.';

GRANT EXECUTE ON FUNCTION public.get_po_delivery_dispatch_lots(uuid) TO authenticated;
