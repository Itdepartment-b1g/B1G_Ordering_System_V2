-- Warehouse -> Client variant mapping so warehouse transfers update the correct client SKUs.

-- ----------------------------------------------------------------------------
-- 1) Mapping table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.warehouse_variant_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  warehouse_company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  warehouse_variant_id uuid NOT NULL REFERENCES public.variants(id) ON DELETE CASCADE,
  client_variant_id uuid NOT NULL REFERENCES public.variants(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT warehouse_variant_mappings_unique UNIQUE (client_company_id, warehouse_variant_id)
);

CREATE INDEX IF NOT EXISTS idx_wvm_client_company ON public.warehouse_variant_mappings(client_company_id);
CREATE INDEX IF NOT EXISTS idx_wvm_warehouse_variant ON public.warehouse_variant_mappings(warehouse_variant_id);

ALTER TABLE public.warehouse_variant_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Warehouse users can read variant mappings" ON public.warehouse_variant_mappings;
CREATE POLICY "Warehouse users can read variant mappings"
  ON public.warehouse_variant_mappings FOR SELECT
  USING (
    public.is_warehouse()
    AND EXISTS (
      SELECT 1
      FROM public.warehouse_company_assignments wca
      JOIN public.profiles wp ON wp.id = wca.warehouse_user_id
      WHERE wca.client_company_id = warehouse_variant_mappings.client_company_id
        AND wp.company_id = warehouse_variant_mappings.warehouse_company_id
    )
  );

-- ----------------------------------------------------------------------------
-- 2) Updated approval RPC: resolve warehouse_variant_id -> client_variant_id
-- ----------------------------------------------------------------------------
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

  v_client_variant_id uuid;
  v_client_brand_id uuid;
  v_client_variant_type_id uuid;
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
        'error', 'Variant not stocked at sub-warehouse: ' || item_record.variant_name
      );
    END IF;

    IF loc_stock < item_record.quantity THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Insufficient sub-warehouse stock for variant ' || item_record.variant_name
      );
    END IF;
  END LOOP;

  -- Approve
  UPDATE purchase_orders
  SET status = 'approved', approved_by = approver_id, approved_at = NOW()
  WHERE id = po_id;

  -- Execute transfer
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

    -- Decrement reserved/allocated stock at main inventory level (warehouse hub)
    UPDATE main_inventory
    SET allocated_stock = GREATEST(0, COALESCE(allocated_stock, 0) - item_record.quantity),
        updated_at = NOW()
    WHERE company_id = po_record.warehouse_company_id
      AND variant_id = item_record.variant_id;

    -- Out transaction (warehouse side)
    INSERT INTO inventory_transactions (
      company_id, variant_id, transaction_type, quantity,
      reference_type, reference_id, performed_by, notes, created_at
    ) VALUES (
      po_record.warehouse_company_id, item_record.variant_id, 'warehouse_transfer_out', item_record.quantity,
      'purchase_order', po_id, approver_id,
      'Warehouse transfer out PO ' || po_record.po_number || ' from sub-warehouse',
      NOW()
    );

    -- Resolve warehouse_variant_id => client_variant_id via mapping (or create mapping if needed)
    v_client_variant_id := NULL;
    SELECT m.client_variant_id INTO v_client_variant_id
    FROM public.warehouse_variant_mappings m
    WHERE m.client_company_id = item_record.client_company_id
      AND m.warehouse_company_id = po_record.warehouse_company_id
      AND m.warehouse_variant_id = item_record.variant_id;

    IF v_client_variant_id IS NULL THEN
      -- Ensure client brand exists
      v_client_brand_id := NULL;
      SELECT br.id INTO v_client_brand_id
      FROM public.brands br
      WHERE br.company_id = item_record.client_company_id
        AND lower(br.name) = lower(item_record.brand_name)
      LIMIT 1;

      IF v_client_brand_id IS NULL THEN
        INSERT INTO public.brands (company_id, name, description, created_by, created_at, updated_at)
        VALUES (
          item_record.client_company_id,
          item_record.brand_name,
          NULL,
          approver_id,
          NOW(),
          NOW()
        )
        RETURNING id INTO v_client_brand_id;
      END IF;

      -- Find client variant_type_id (case-insensitive match to warehouse variant_type)
      v_client_variant_type_id := NULL;
      SELECT vt.id INTO v_client_variant_type_id
      FROM public.variant_types vt
      WHERE vt.company_id = item_record.client_company_id
        AND lower(vt.name) = lower(item_record.variant_type)
      LIMIT 1;

      IF v_client_variant_type_id IS NULL THEN
        RETURN json_build_object(
          'success', false,
          'error', 'Client missing variant type for ' || item_record.variant_type
        );
      END IF;

      -- Ensure client variant exists
      v_client_variant_id := NULL;
      SELECT v2.id INTO v_client_variant_id
      FROM public.variants v2
      WHERE v2.company_id = item_record.client_company_id
        AND v2.brand_id = v_client_brand_id
        AND lower(v2.name) = lower(item_record.variant_name)
        AND lower(v2.variant_type) = lower(item_record.variant_type)
      LIMIT 1;

      IF v_client_variant_id IS NULL THEN
        INSERT INTO public.variants (
          company_id,
          brand_id,
          variant_type_id,
          name,
          variant_type,
          description,
          sku,
          created_at,
          updated_at
        ) VALUES (
          item_record.client_company_id,
          v_client_brand_id,
          v_client_variant_type_id,
          item_record.variant_name,
          item_record.variant_type,
          NULL,
          NULL,
          NOW(),
          NOW()
        )
        RETURNING id INTO v_client_variant_id;
      END IF;

      -- Save mapping for subsequent approvals
      INSERT INTO public.warehouse_variant_mappings (
        client_company_id,
        warehouse_company_id,
        warehouse_variant_id,
        client_variant_id
      ) VALUES (
        item_record.client_company_id,
        po_record.warehouse_company_id,
        item_record.variant_id,
        v_client_variant_id
      )
      ON CONFLICT (client_company_id, warehouse_variant_id) DO UPDATE
      SET client_variant_id = EXCLUDED.client_variant_id,
          updated_at = NOW();
    END IF;

    -- Client-side inventory update (in)
    SELECT * INTO existing_client_inv
    FROM main_inventory
    WHERE variant_id = v_client_variant_id
      AND company_id = item_record.client_company_id;

    IF FOUND THEN
      UPDATE main_inventory
      SET stock = stock + item_record.quantity, updated_at = NOW()
      WHERE variant_id = v_client_variant_id
        AND company_id = item_record.client_company_id;
    ELSE
      INSERT INTO main_inventory (
        company_id, variant_id, stock, unit_price, reorder_level, created_at, updated_at
      ) VALUES (
        item_record.client_company_id, v_client_variant_id, item_record.quantity,
        0, 10, NOW(), NOW()
      );
    END IF;

    -- In transaction (client side) - use client_variant_id
    INSERT INTO inventory_transactions (
      company_id, variant_id, transaction_type, quantity,
      reference_type, reference_id, performed_by, notes, created_at
    ) VALUES (
      item_record.client_company_id, v_client_variant_id, 'warehouse_transfer_in', item_record.quantity,
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
  'Approves internal PO: decrements sub-warehouse location inventory + hub allocated_stock, increments client inventory using warehouse_variant_id -> client_variant_id mapping.';

