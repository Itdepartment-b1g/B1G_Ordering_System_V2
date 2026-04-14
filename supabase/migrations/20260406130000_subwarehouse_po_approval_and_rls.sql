-- Sub-warehouse PO routing: scope warehouse inbox by location and approve from location inventory

-- ---------------------------------------------------------------------------
-- 1) RLS: purchase_orders for warehouse inbox / update by location
--    - sub-warehouse user sees only their assigned location
--    - main warehouse user can see all locations for the company
--    - assignment check is by (client_company_id, warehouse_company_id) (not by warehouse_user_id)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Warehouse users can view transfer POs for their hub" ON public.purchase_orders;
CREATE POLICY "Warehouse users can view transfer POs for their hub"
  ON public.purchase_orders FOR SELECT
  USING (
    public.is_warehouse()
    AND fulfillment_type = 'warehouse_transfer'
    AND warehouse_company_id = public.get_auth_company_id()
    AND warehouse_location_id IS NOT NULL
    AND (
      public.is_main_warehouse_user(auth.uid())
      OR warehouse_location_id = public.get_warehouse_location_id(auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.warehouse_company_assignments wca
      JOIN public.profiles wp ON wp.id = wca.warehouse_user_id
      WHERE wca.client_company_id = purchase_orders.company_id
        AND wp.company_id = purchase_orders.warehouse_company_id
    )
  );

DROP POLICY IF EXISTS "Warehouse users can update transfer POs for their hub" ON public.purchase_orders;
CREATE POLICY "Warehouse users can update transfer POs for their hub"
  ON public.purchase_orders FOR UPDATE
  USING (
    public.is_warehouse()
    AND fulfillment_type = 'warehouse_transfer'
    AND warehouse_company_id = public.get_auth_company_id()
    AND warehouse_location_id IS NOT NULL
    AND (
      public.is_main_warehouse_user(auth.uid())
      OR warehouse_location_id = public.get_warehouse_location_id(auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.warehouse_company_assignments wca
      JOIN public.profiles wp ON wp.id = wca.warehouse_user_id
      WHERE wca.client_company_id = purchase_orders.company_id
        AND wp.company_id = purchase_orders.warehouse_company_id
    )
  )
  WITH CHECK (
    public.is_warehouse()
    AND fulfillment_type = 'warehouse_transfer'
    AND warehouse_company_id = public.get_auth_company_id()
  );

-- ---------------------------------------------------------------------------
-- 2) RLS: purchase_order_items for warehouse (read + reject path reads items)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Warehouse users can view items for transfer POs" ON public.purchase_order_items;
CREATE POLICY "Warehouse users can view items for transfer POs"
  ON public.purchase_order_items FOR SELECT
  USING (
    public.is_warehouse()
    AND EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = purchase_order_items.purchase_order_id
        AND po.fulfillment_type = 'warehouse_transfer'
        AND po.warehouse_company_id = public.get_auth_company_id()
        AND po.warehouse_location_id IS NOT NULL
        AND (
          public.is_main_warehouse_user(auth.uid())
          OR po.warehouse_location_id = public.get_warehouse_location_id(auth.uid())
        )
        AND EXISTS (
          SELECT 1 FROM public.warehouse_company_assignments wca
          JOIN public.profiles wp ON wp.id = wca.warehouse_user_id
          WHERE wca.client_company_id = po.company_id
            AND wp.company_id = po.warehouse_company_id
        )
    )
  );

-- ---------------------------------------------------------------------------
-- 3) approve_warehouse_transfer_po: deduct from location inventory + decrement main allocated_stock
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_warehouse_transfer_po(po_id uuid, approver_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    po_record RECORD;
    item_record RECORD;
    v_approver RECORD;
    loc_stock INTEGER;
    existing_client_inv RECORD;
    v_location_id uuid;
BEGIN
    SELECT * INTO po_record FROM purchase_orders WHERE id = po_id;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Purchase order not found');
    END IF;

    IF po_record.fulfillment_type IS DISTINCT FROM 'warehouse_transfer' THEN
        RETURN json_build_object('success', false, 'error', 'Not a warehouse transfer purchase order');
    END IF;

    IF po_record.warehouse_location_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Warehouse location is required for this transfer');
    END IF;

    IF po_record.status = 'approved' THEN
        RETURN json_build_object('success', false, 'error', 'Purchase order is already approved');
    END IF;
    IF po_record.status = 'rejected' THEN
        RETURN json_build_object('success', false, 'error', 'Cannot approve a rejected purchase order');
    END IF;

    SELECT p.id, p.role, p.company_id
    INTO v_approver
    FROM profiles p WHERE p.id = approver_id;

    IF NOT FOUND OR v_approver.role IS DISTINCT FROM 'warehouse' THEN
        RETURN json_build_object('success', false, 'error', 'Only warehouse users can approve this purchase order');
    END IF;

    IF v_approver.company_id IS DISTINCT FROM po_record.warehouse_company_id THEN
        RETURN json_build_object('success', false, 'error', 'Approver warehouse company does not match purchase order warehouse');
    END IF;

    v_location_id := public.get_warehouse_location_id(approver_id);

    IF NOT (public.is_main_warehouse_user(approver_id) OR v_location_id = po_record.warehouse_location_id) THEN
        RETURN json_build_object('success', false, 'error', 'Approver is not assigned to this sub-warehouse location');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM warehouse_company_assignments wca
        JOIN profiles wp ON wp.id = wca.warehouse_user_id
        WHERE wca.client_company_id = po_record.company_id
          AND wp.company_id = po_record.warehouse_company_id
    ) THEN
        RETURN json_build_object('success', false, 'error', 'Warehouse is not assigned to fulfill orders for this company');
    END IF;

    -- Validate location stock first (avoid partial approvals)
    FOR item_record IN
        SELECT poi.company_id AS client_company_id, poi.variant_id, poi.quantity,
               v.name AS variant_name, v.variant_type, b.name AS brand_name
        FROM purchase_order_items poi
        JOIN variants v ON poi.variant_id = v.id
        JOIN brands b ON v.brand_id = b.id
        WHERE poi.purchase_order_id = po_id
    LOOP
        SELECT COALESCE(wli.stock, 0) INTO loc_stock
        FROM warehouse_location_inventory wli
        WHERE wli.company_id = po_record.warehouse_company_id
          AND wli.location_id = po_record.warehouse_location_id
          AND wli.variant_id = item_record.variant_id;

        IF NOT FOUND THEN
            RETURN json_build_object(
                'success', false,
                'error',
                'Variant not stocked at sub-warehouse: ' || item_record.variant_name
            );
        END IF;

        IF loc_stock < item_record.quantity THEN
            RETURN json_build_object(
                'success', false,
                'error',
                'Insufficient sub-warehouse stock for variant ' || item_record.variant_name
            );
        END IF;
    END LOOP;

    UPDATE purchase_orders
    SET status = 'approved', approved_by = approver_id, approved_at = NOW()
    WHERE id = po_id;

    FOR item_record IN
        SELECT poi.company_id AS client_company_id, poi.variant_id, poi.quantity,
               v.name AS variant_name, v.variant_type, b.name AS brand_name
        FROM purchase_order_items poi
        JOIN variants v ON poi.variant_id = v.id
        JOIN brands b ON v.brand_id = b.id
        WHERE poi.purchase_order_id = po_id
    LOOP
        -- Deduct from sub-warehouse location inventory
        UPDATE warehouse_location_inventory
        SET stock = stock - item_record.quantity, updated_at = NOW()
        WHERE company_id = po_record.warehouse_company_id
          AND location_id = po_record.warehouse_location_id
          AND variant_id = item_record.variant_id;

        -- Decrement reserved/allocated stock at main inventory level
        UPDATE main_inventory
        SET allocated_stock = GREATEST(0, COALESCE(allocated_stock, 0) - item_record.quantity),
            updated_at = NOW()
        WHERE company_id = po_record.warehouse_company_id
          AND variant_id = item_record.variant_id;

        INSERT INTO inventory_transactions (
            company_id, variant_id, transaction_type, quantity,
            reference_type, reference_id, performed_by, notes, created_at
        ) VALUES (
            po_record.warehouse_company_id, item_record.variant_id, 'warehouse_transfer_out', item_record.quantity,
            'purchase_order', po_id, approver_id,
            'Warehouse transfer out PO ' || po_record.po_number || ' from sub-warehouse',
            NOW()
        );

        SELECT * INTO existing_client_inv FROM main_inventory
        WHERE variant_id = item_record.variant_id AND company_id = item_record.client_company_id;

        IF FOUND THEN
            UPDATE main_inventory SET stock = stock + item_record.quantity, updated_at = NOW()
            WHERE variant_id = item_record.variant_id AND company_id = item_record.client_company_id;
        ELSE
            INSERT INTO main_inventory (
                company_id, variant_id, stock, unit_price, reorder_level, created_at, updated_at
            ) VALUES (
                item_record.client_company_id, item_record.variant_id, item_record.quantity,
                0, 10, NOW(), NOW()
            );
        END IF;

        INSERT INTO inventory_transactions (
            company_id, variant_id, transaction_type, quantity,
            reference_type, reference_id, performed_by, notes, created_at
        ) VALUES (
            item_record.client_company_id, item_record.variant_id, 'warehouse_transfer_in', item_record.quantity,
            'purchase_order', po_id, approver_id,
            'Warehouse transfer in PO ' || po_record.po_number || ' - ' ||
                item_record.brand_name || ' ' || item_record.variant_name,
            NOW()
        );
    END LOOP;

    RETURN json_build_object('success', true, 'po_number', po_record.po_number);
END;
$$;

COMMENT ON FUNCTION public.approve_warehouse_transfer_po(uuid, uuid) IS
  'Approves internal PO: decrements sub-warehouse location inventory, decrements hub main_inventory.allocated_stock, increments client main_inventory. Warehouse role only.';

