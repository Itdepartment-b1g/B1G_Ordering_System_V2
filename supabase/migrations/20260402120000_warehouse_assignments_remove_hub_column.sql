-- Warehouse assignments: only link warehouse user ↔ client company.
-- Stock source is always profiles.company_id (set at account creation from Edge Function).

-- Backfill profile.company_id from existing assignment hub column where missing
UPDATE public.profiles p
SET company_id = sub.warehouse_company_id
FROM (
  SELECT DISTINCT ON (warehouse_user_id)
    warehouse_user_id,
    warehouse_company_id
  FROM public.warehouse_company_assignments
  ORDER BY warehouse_user_id, created_at
) sub
WHERE p.id = sub.warehouse_user_id
  AND p.role = 'warehouse'
  AND (p.company_id IS NULL OR p.company_id IS DISTINCT FROM sub.warehouse_company_id);

ALTER TABLE public.warehouse_company_assignments
  DROP COLUMN IF EXISTS warehouse_company_id;

COMMENT ON TABLE public.warehouse_company_assignments IS
  'Links warehouse users to client companies they fulfill internal POs for. Hub inventory company is profiles.company_id for the warehouse user.';

-- ---------------------------------------------------------------------------
-- approve_warehouse_transfer_po: assignment check no longer uses hub column
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
    hub_stock INTEGER;
    existing_client_inv RECORD;
    hub_id uuid;
BEGIN
    SELECT * INTO po_record FROM purchase_orders WHERE id = po_id;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Purchase order not found');
    END IF;

    IF po_record.fulfillment_type IS DISTINCT FROM 'warehouse_transfer' THEN
        RETURN json_build_object('success', false, 'error', 'Not a warehouse transfer purchase order');
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

    hub_id := v_approver.company_id;
    IF hub_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Warehouse user has no inventory company configured');
    END IF;

    IF po_record.warehouse_company_id IS DISTINCT FROM hub_id THEN
        RETURN json_build_object('success', false, 'error', 'Purchase order warehouse does not match approver inventory company');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM warehouse_company_assignments wca
        WHERE wca.warehouse_user_id = approver_id
          AND wca.client_company_id = po_record.company_id
    ) THEN
        RETURN json_build_object('success', false, 'error', 'You are not assigned to fulfill orders for this company');
    END IF;

    FOR item_record IN
        SELECT poi.company_id AS client_company_id, poi.variant_id, poi.quantity,
               v.name AS variant_name, v.variant_type, b.name AS brand_name
        FROM purchase_order_items poi
        JOIN variants v ON poi.variant_id = v.id
        JOIN brands b ON v.brand_id = b.id
        WHERE poi.purchase_order_id = po_id
    LOOP
        SELECT COALESCE(mi.stock, 0) INTO hub_stock
        FROM main_inventory mi
        WHERE mi.company_id = hub_id
          AND mi.variant_id = item_record.variant_id;

        IF NOT FOUND THEN
            RETURN json_build_object(
                'success', false,
                'error',
                'Variant not stocked at warehouse: ' || item_record.variant_name
            );
        END IF;

        IF hub_stock < item_record.quantity THEN
            RETURN json_build_object(
                'success', false,
                'error',
                'Insufficient warehouse stock for variant ' || item_record.variant_name
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
        UPDATE main_inventory SET stock = stock - item_record.quantity, updated_at = NOW()
        WHERE company_id = hub_id AND variant_id = item_record.variant_id;

        INSERT INTO inventory_transactions (
            company_id, variant_id, transaction_type, quantity,
            reference_type, reference_id, performed_by, notes, created_at
        ) VALUES (
            hub_id, item_record.variant_id, 'warehouse_transfer_out', item_record.quantity,
            'purchase_order', po_id, approver_id,
            'Warehouse transfer out PO ' || po_record.po_number || ' to client company',
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
