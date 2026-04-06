-- Warehouse accounts, company assignments, internal PO stock transfers
-- Safe to run once; uses IF NOT EXISTS / DROP IF EXISTS where appropriate

-- ---------------------------------------------------------------------------
-- 1. Allow warehouse role on profiles
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (
  role = ANY (ARRAY[
    'system_administrator'::text,
    'super_admin'::text,
    'admin'::text,
    'finance'::text,
    'manager'::text,
    'team_leader'::text,
    'mobile_sales'::text,
    'executive'::text,
    'warehouse'::text
  ])
);

-- ---------------------------------------------------------------------------
-- 2. warehouse_company_assignments (one client company -> one warehouse user)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.warehouse_company_assignments (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  warehouse_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  warehouse_company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT warehouse_company_assignments_user_client_key UNIQUE (warehouse_user_id, client_company_id),
  CONSTRAINT warehouse_company_assignments_client_unique UNIQUE (client_company_id)
);

COMMENT ON TABLE public.warehouse_company_assignments IS 'Links warehouse users (hub) to client companies they fulfill internal POs for';

CREATE INDEX IF NOT EXISTS idx_warehouse_assignments_warehouse_user
  ON public.warehouse_company_assignments(warehouse_user_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_assignments_client
  ON public.warehouse_company_assignments(client_company_id);

DROP TRIGGER IF EXISTS update_warehouse_company_assignments_updated_at ON public.warehouse_company_assignments;
CREATE TRIGGER update_warehouse_company_assignments_updated_at
  BEFORE UPDATE ON public.warehouse_company_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.warehouse_company_assignments ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. purchase_orders: fulfillment type, warehouse hub, nullable supplier
-- ---------------------------------------------------------------------------
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS fulfillment_type text NOT NULL DEFAULT 'supplier';
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS warehouse_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

UPDATE public.purchase_orders
SET fulfillment_type = 'supplier', warehouse_company_id = NULL
WHERE fulfillment_type IS NULL OR fulfillment_type = '';

ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_fulfillment_type_check;
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_fulfillment_type_check
  CHECK (fulfillment_type = ANY (ARRAY['supplier'::text, 'warehouse_transfer'::text]));

-- Allow NULL supplier for warehouse transfers
ALTER TABLE public.purchase_orders ALTER COLUMN supplier_id DROP NOT NULL;

ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_fulfillment_fields_check;
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_fulfillment_fields_check
  CHECK (
    (fulfillment_type = 'supplier' AND supplier_id IS NOT NULL AND warehouse_company_id IS NULL)
    OR
    (fulfillment_type = 'warehouse_transfer' AND supplier_id IS NULL AND warehouse_company_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_purchase_orders_warehouse_company
  ON public.purchase_orders(warehouse_company_id)
  WHERE fulfillment_type = 'warehouse_transfer';

-- ---------------------------------------------------------------------------
-- 4. inventory_transactions: new types for warehouse transfer audit
-- ---------------------------------------------------------------------------
ALTER TABLE public.inventory_transactions DROP CONSTRAINT IF EXISTS inventory_transactions_transaction_type_check;
ALTER TABLE public.inventory_transactions ADD CONSTRAINT inventory_transactions_transaction_type_check
  CHECK (transaction_type = ANY (ARRAY[
    'purchase_order_received'::text,
    'allocated_to_agent'::text,
    'order_fulfilled'::text,
    'adjustment'::text,
    'return'::text,
    'return_to_main'::text,
    'warehouse_transfer_out'::text,
    'warehouse_transfer_in'::text
  ]));

-- ---------------------------------------------------------------------------
-- 5. Guard: supplier PO approval must not run on warehouse_transfer
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_purchase_order(po_id uuid, approver_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    po_record RECORD;
    item_record RECORD;
    existing_inventory RECORD;
BEGIN
    SELECT * INTO po_record FROM purchase_orders WHERE id = po_id;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Purchase order not found');
    END IF;

    IF COALESCE(po_record.fulfillment_type, 'supplier') = 'warehouse_transfer' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Use approve_warehouse_transfer_po for warehouse transfer purchase orders'
        );
    END IF;

    IF po_record.status = 'approved' THEN
        RETURN json_build_object('success', false, 'error', 'Purchase order is already approved');
    END IF;
    IF po_record.status = 'rejected' THEN
        RETURN json_build_object('success', false, 'error', 'Cannot approve a rejected purchase order');
    END IF;

    UPDATE purchase_orders
    SET status = 'approved', approved_by = approver_id, approved_at = NOW()
    WHERE id = po_id;

    FOR item_record IN
        SELECT poi.company_id, poi.variant_id, poi.quantity,
               v.name AS variant_name, v.variant_type, b.name AS brand_name
        FROM purchase_order_items poi
        JOIN variants v ON poi.variant_id = v.id
        JOIN brands b ON v.brand_id = b.id
        WHERE poi.purchase_order_id = po_id
    LOOP
        SELECT * INTO existing_inventory FROM main_inventory
        WHERE variant_id = item_record.variant_id AND company_id = item_record.company_id;

        IF FOUND THEN
            UPDATE main_inventory SET stock = stock + item_record.quantity, updated_at = NOW()
            WHERE variant_id = item_record.variant_id AND company_id = item_record.company_id;
        ELSE
            INSERT INTO main_inventory (
                company_id, variant_id, stock, unit_price, reorder_level, created_at, updated_at
            ) VALUES (
                item_record.company_id, item_record.variant_id, item_record.quantity,
                0, 10, NOW(), NOW()
            );
        END IF;

        INSERT INTO inventory_transactions (
            company_id, variant_id, transaction_type, quantity,
            reference_type, reference_id, performed_by, notes, created_at
        ) VALUES (
            item_record.company_id, item_record.variant_id, 'purchase_order_received', item_record.quantity,
            'purchase_order', po_id, approver_id,
            'Purchase order approved: ' || po_record.po_number || ' - ' ||
                item_record.brand_name || ' ' || item_record.variant_name,
            NOW()
        );
    END LOOP;

    RETURN json_build_object('success', true, 'po_number', po_record.po_number);
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. approve_warehouse_transfer_po
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

    IF v_approver.company_id IS DISTINCT FROM po_record.warehouse_company_id THEN
        RETURN json_build_object('success', false, 'error', 'Approver hub company does not match purchase order warehouse');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM warehouse_company_assignments wca
        WHERE wca.warehouse_user_id = approver_id
          AND wca.client_company_id = po_record.company_id
          AND wca.warehouse_company_id = po_record.warehouse_company_id
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
        WHERE mi.company_id = po_record.warehouse_company_id
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
        WHERE company_id = po_record.warehouse_company_id AND variant_id = item_record.variant_id;

        INSERT INTO inventory_transactions (
            company_id, variant_id, transaction_type, quantity,
            reference_type, reference_id, performed_by, notes, created_at
        ) VALUES (
            po_record.warehouse_company_id, item_record.variant_id, 'warehouse_transfer_out', item_record.quantity,
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

COMMENT ON FUNCTION public.approve_warehouse_transfer_po(uuid, uuid) IS
  'Approves internal PO: decrements hub main_inventory, increments client main_inventory. Warehouse role only.';

-- ---------------------------------------------------------------------------
-- 7. delete_company_cascade: clean warehouse assignments
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_company_cascade(p_company_id uuid) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    profile_ids UUID[];
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'system_administrator'
    ) THEN
        RAISE EXCEPTION 'Only system administrators can delete companies';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM companies WHERE id = p_company_id) THEN
        RAISE EXCEPTION 'Company not found';
    END IF;

    SELECT ARRAY_AGG(id) INTO profile_ids FROM profiles WHERE company_id = p_company_id;

    IF profile_ids IS NOT NULL AND array_length(profile_ids, 1) > 0 THEN
        UPDATE executive_company_assignments SET assigned_by = NULL WHERE assigned_by = ANY(profile_ids);
    END IF;

    DELETE FROM executive_company_assignments WHERE company_id = p_company_id;

    IF profile_ids IS NOT NULL AND array_length(profile_ids, 1) > 0 THEN
        DELETE FROM executive_company_assignments WHERE executive_id = ANY(profile_ids);
    END IF;

    DELETE FROM warehouse_company_assignments WHERE client_company_id = p_company_id;

    IF profile_ids IS NOT NULL AND array_length(profile_ids, 1) > 0 THEN
        DELETE FROM warehouse_company_assignments WHERE warehouse_user_id = ANY(profile_ids);
    END IF;

    IF profile_ids IS NOT NULL AND array_length(profile_ids, 1) > 0 THEN
        UPDATE stock_requests SET leader_approved_by = NULL
        WHERE leader_approved_by = ANY(profile_ids) AND company_id = p_company_id;
        UPDATE stock_requests SET admin_approved_by = NULL
        WHERE admin_approved_by = ANY(profile_ids) AND company_id = p_company_id;
        UPDATE stock_requests SET fulfilled_by = NULL
        WHERE fulfilled_by = ANY(profile_ids) AND company_id = p_company_id;
        UPDATE stock_requests SET rejected_by = NULL
        WHERE rejected_by = ANY(profile_ids) AND company_id = p_company_id;
        UPDATE client_orders SET approved_by = NULL
        WHERE approved_by = ANY(profile_ids) AND company_id = p_company_id;
        UPDATE purchase_orders SET approved_by = NULL
        WHERE approved_by = ANY(profile_ids) AND company_id = p_company_id;
        UPDATE financial_transactions SET agent_id = NULL
        WHERE agent_id = ANY(profile_ids) AND company_id = p_company_id;
        UPDATE clients SET approved_by = NULL
        WHERE approved_by = ANY(profile_ids) AND company_id = p_company_id;
    END IF;

    DELETE FROM companies WHERE id = p_company_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Helper for RLS
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_warehouse() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'warehouse' AND status = 'active'
  );
$$;

-- ---------------------------------------------------------------------------
-- 9. RLS: warehouse_company_assignments
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Warehouse users can view their assignments" ON public.warehouse_company_assignments;
CREATE POLICY "Warehouse users can view their assignments"
  ON public.warehouse_company_assignments FOR SELECT
  USING (warehouse_user_id = auth.uid());

DROP POLICY IF EXISTS "System administrators manage warehouse assignments" ON public.warehouse_company_assignments;
CREATE POLICY "System administrators manage warehouse assignments"
  ON public.warehouse_company_assignments FOR ALL
  USING (public.is_system_administrator())
  WITH CHECK (public.is_system_administrator());

-- Client companies: super_admin can see if assignment concerns their company (optional visibility)
DROP POLICY IF EXISTS "Super admin can view warehouse assignments for their company" ON public.warehouse_company_assignments;
CREATE POLICY "Super admin can view warehouse assignments for their company"
  ON public.warehouse_company_assignments FOR SELECT
  USING (
    client_company_id = public.get_auth_super_admin_company_id()
  );

DROP POLICY IF EXISTS "Tenant users can view warehouse link for their company" ON public.warehouse_company_assignments;
CREATE POLICY "Tenant users can view warehouse link for their company"
  ON public.warehouse_company_assignments FOR SELECT
  USING (
    client_company_id = public.get_auth_company_id()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role = ANY (ARRAY['super_admin'::text, 'admin'::text])
    )
  );

-- ---------------------------------------------------------------------------
-- 10. RLS: purchase_orders for warehouse inbox / reject
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Warehouse users can view transfer POs for their hub" ON public.purchase_orders;
CREATE POLICY "Warehouse users can view transfer POs for their hub"
  ON public.purchase_orders FOR SELECT
  USING (
    public.is_warehouse()
    AND fulfillment_type = 'warehouse_transfer'
    AND warehouse_company_id = public.get_auth_company_id()
    AND EXISTS (
      SELECT 1 FROM warehouse_company_assignments wca
      WHERE wca.warehouse_user_id = auth.uid()
        AND wca.client_company_id = purchase_orders.company_id
    )
  );

DROP POLICY IF EXISTS "Warehouse users can update transfer POs for their hub" ON public.purchase_orders;
CREATE POLICY "Warehouse users can update transfer POs for their hub"
  ON public.purchase_orders FOR UPDATE
  USING (
    public.is_warehouse()
    AND fulfillment_type = 'warehouse_transfer'
    AND warehouse_company_id = public.get_auth_company_id()
    AND EXISTS (
      SELECT 1 FROM warehouse_company_assignments wca
      WHERE wca.warehouse_user_id = auth.uid()
        AND wca.client_company_id = purchase_orders.company_id
    )
  )
  WITH CHECK (
    public.is_warehouse()
    AND fulfillment_type = 'warehouse_transfer'
    AND warehouse_company_id = public.get_auth_company_id()
  );

-- ---------------------------------------------------------------------------
-- 11. RLS: purchase_order_items for warehouse (read + reject path reads items)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Warehouse users can view items for transfer POs" ON public.purchase_order_items;
CREATE POLICY "Warehouse users can view items for transfer POs"
  ON public.purchase_order_items FOR SELECT
  USING (
    public.is_warehouse()
    AND EXISTS (
      SELECT 1 FROM purchase_orders po
      WHERE po.id = purchase_order_items.purchase_order_id
        AND po.fulfillment_type = 'warehouse_transfer'
        AND po.warehouse_company_id = public.get_auth_company_id()
        AND EXISTS (
          SELECT 1 FROM warehouse_company_assignments wca
          WHERE wca.warehouse_user_id = auth.uid()
            AND wca.client_company_id = po.company_id
        )
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouse_company_assignments TO authenticated;
GRANT ALL ON public.warehouse_company_assignments TO service_role;

GRANT EXECUTE ON FUNCTION public.approve_warehouse_transfer_po(uuid, uuid) TO authenticated;
