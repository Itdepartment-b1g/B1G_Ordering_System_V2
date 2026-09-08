-- Team Leader warehouse-transfer POs start as draft and wait for Super Admin
-- before the hub can see them or soft-reserve stock.

-- ---------------------------------------------------------------------------
-- 1) Hide draft/submitted transfers from warehouse (Standard + Key Account)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.key_account_transfer_po_visible_to_warehouse(p_po_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (
      SELECT
        CASE
          WHEN po.status = ANY (ARRAY['draft'::text, 'submitted'::text]) THEN false
          WHEN po.company_account_type IS DISTINCT FROM 'Key Accounts'::text THEN true
          WHEN po.workflow_status = ANY (
            ARRAY[
              'warehouse_reserved'::text,
              'approved'::text,
              'fulfilled'::text,
              'delivered'::text
            ]
          ) THEN true
          ELSE false
        END
      FROM public.purchase_orders po
      WHERE po.id = p_po_id
    ),
    false
  );
$$;

COMMENT ON FUNCTION public.key_account_transfer_po_visible_to_warehouse(uuid) IS
  'Warehouse may see a transfer PO after it leaves draft/submitted. Key Account transfers also require workflow_status warehouse_reserved (or a post-release state).';

-- ---------------------------------------------------------------------------
-- 2) Hub catalog: Team Leaders need brands/variants to create transfer POs
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Brands: tenant select linked hub" ON public.brands;
CREATE POLICY "Brands: tenant select linked hub"
  ON public.brands FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = ANY (ARRAY[
          'super_admin'::text, 'admin'::text, 'team_leader'::text,
          'sales_admin'::text, 'sales_head'::text,
          'sales_director'::text, 'key_account_manager'::text,
          'key_account_accounting'::text
        ])
    )
    AND public.get_linked_warehouse_company_id() IS NOT NULL
    AND brands.company_id = public.get_linked_warehouse_company_id()
  );

DROP POLICY IF EXISTS "Variants: tenant select linked hub" ON public.variants;
CREATE POLICY "Variants: tenant select linked hub"
  ON public.variants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = ANY (ARRAY[
          'super_admin'::text, 'admin'::text, 'team_leader'::text,
          'sales_admin'::text, 'sales_head'::text,
          'sales_director'::text, 'key_account_manager'::text,
          'key_account_accounting'::text
        ])
    )
    AND public.get_linked_warehouse_company_id() IS NOT NULL
    AND variants.company_id = public.get_linked_warehouse_company_id()
  );

DROP POLICY IF EXISTS "Variant types: tenant select linked hub" ON public.variant_types;
CREATE POLICY "Variant types: tenant select linked hub"
  ON public.variant_types FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = ANY (ARRAY[
          'super_admin'::text, 'admin'::text, 'team_leader'::text,
          'sales_admin'::text, 'sales_head'::text,
          'sales_director'::text, 'key_account_manager'::text,
          'key_account_accounting'::text
        ])
    )
    AND public.get_linked_warehouse_company_id() IS NOT NULL
    AND variant_types.company_id = public.get_linked_warehouse_company_id()
  );

-- ---------------------------------------------------------------------------
-- 3) Team Leader insert/update: drafts only, assigned to self, hub required
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert purchase_orders in their company" ON public.purchase_orders;
CREATE POLICY "Users can insert purchase_orders in their company"
  ON public.purchase_orders FOR INSERT
  WITH CHECK (
    company_id = public.get_auth_company_id()
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'team_leader'
    )
  );

DROP POLICY IF EXISTS "Team leaders can insert draft warehouse transfer POs" ON public.purchase_orders;
CREATE POLICY "Team leaders can insert draft warehouse transfer POs"
  ON public.purchase_orders FOR INSERT
  WITH CHECK (
    company_id = public.get_auth_company_id()
    AND created_by = auth.uid()
    AND assigned_team_leader_id = auth.uid()
    AND fulfillment_type = 'warehouse_transfer'
    AND status = 'draft'
    AND supplier_id IS NULL
    AND public.get_linked_warehouse_company_id() IS NOT NULL
    AND warehouse_company_id IS NOT DISTINCT FROM public.get_linked_warehouse_company_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'team_leader'
        AND p.company_id = purchase_orders.company_id
    )
  );

DROP POLICY IF EXISTS "Users can update purchase_orders in their company" ON public.purchase_orders;
CREATE POLICY "Users can update purchase_orders in their company"
  ON public.purchase_orders FOR UPDATE
  USING (
    company_id = public.get_auth_company_id()
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'team_leader'
    )
  )
  WITH CHECK (
    company_id = public.get_auth_company_id()
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'team_leader'
    )
  );

DROP POLICY IF EXISTS "Team leaders can update own draft transfer POs" ON public.purchase_orders;
CREATE POLICY "Team leaders can update own draft transfer POs"
  ON public.purchase_orders FOR UPDATE
  USING (
    created_by = auth.uid()
    AND assigned_team_leader_id = auth.uid()
    AND fulfillment_type = 'warehouse_transfer'
    AND status = 'draft'
  )
  WITH CHECK (
    created_by = auth.uid()
    AND assigned_team_leader_id = auth.uid()
    AND fulfillment_type = 'warehouse_transfer'
    AND status = ANY (ARRAY['draft'::text, 'cancelled'::text])
    AND public.get_linked_warehouse_company_id() IS NOT NULL
    AND warehouse_company_id IS NOT DISTINCT FROM public.get_linked_warehouse_company_id()
  );

DROP POLICY IF EXISTS "Users can insert purchase_order_items in their company" ON public.purchase_order_items;
CREATE POLICY "Users can insert purchase_order_items in their company"
  ON public.purchase_order_items FOR INSERT
  WITH CHECK (
    company_id = public.get_auth_company_id()
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'team_leader'
    )
  );

DROP POLICY IF EXISTS "Team leaders can insert items on own draft transfer POs"
  ON public.purchase_order_items;
CREATE POLICY "Team leaders can insert items on own draft transfer POs"
  ON public.purchase_order_items FOR INSERT
  WITH CHECK (
    company_id = public.get_auth_company_id()
    AND EXISTS (
      SELECT 1
      FROM public.purchase_orders po
      WHERE po.id = purchase_order_items.purchase_order_id
        AND po.created_by = auth.uid()
        AND po.assigned_team_leader_id = auth.uid()
        AND po.fulfillment_type = 'warehouse_transfer'
        AND po.status = 'draft'
    )
  );

-- ---------------------------------------------------------------------------
-- 4) Super Admin: submit draft to warehouse (pending) or reject
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_team_leader_transfer_po(p_po_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  po_record public.purchase_orders%ROWTYPE;
  v_company uuid;
  v_hub uuid;
BEGIN
  IF NOT public.is_super_admin() THEN
    RETURN json_build_object('success', false, 'error', 'Only Super Admin can approve team leader purchase orders');
  END IF;

  v_company := public.get_auth_company_id();
  IF v_company IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Company not found');
  END IF;

  v_hub := public.get_linked_warehouse_company_id();
  IF v_hub IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Company is not connected to a warehouse hub');
  END IF;

  SELECT * INTO po_record FROM public.purchase_orders WHERE id = p_po_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Purchase order not found');
  END IF;

  IF po_record.company_id IS DISTINCT FROM v_company THEN
    RETURN json_build_object('success', false, 'error', 'Purchase order is not in your company');
  END IF;

  IF po_record.fulfillment_type IS DISTINCT FROM 'warehouse_transfer' THEN
    RETURN json_build_object('success', false, 'error', 'Only warehouse transfer POs can be submitted this way');
  END IF;

  IF po_record.status IS DISTINCT FROM 'draft' THEN
    RETURN json_build_object('success', false, 'error', 'Only draft purchase orders can be approved for warehouse');
  END IF;

  IF po_record.warehouse_company_id IS DISTINCT FROM v_hub THEN
    RETURN json_build_object('success', false, 'error', 'Purchase order warehouse hub does not match the linked warehouse');
  END IF;

  UPDATE public.purchase_orders
  SET
    status = 'pending',
    approved_by = auth.uid(),
    approved_at = NOW()
  WHERE id = p_po_id
    AND status = 'draft';

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Purchase order could not be submitted');
  END IF;

  RETURN json_build_object('success', true, 'po_number', po_record.po_number);
END;
$$;

COMMENT ON FUNCTION public.submit_team_leader_transfer_po(uuid) IS
  'Super Admin endorses a Team Leader draft warehouse-transfer PO (draft → pending) so the hub can fulfill it.';

CREATE OR REPLACE FUNCTION public.reject_team_leader_transfer_po(p_po_id uuid, p_reason text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  po_record public.purchase_orders%ROWTYPE;
  v_company uuid;
  v_notes text;
BEGIN
  IF NOT public.is_super_admin() THEN
    RETURN json_build_object('success', false, 'error', 'Only Super Admin can reject team leader purchase orders');
  END IF;

  v_company := public.get_auth_company_id();
  IF v_company IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Company not found');
  END IF;

  SELECT * INTO po_record FROM public.purchase_orders WHERE id = p_po_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Purchase order not found');
  END IF;

  IF po_record.company_id IS DISTINCT FROM v_company THEN
    RETURN json_build_object('success', false, 'error', 'Purchase order is not in your company');
  END IF;

  IF po_record.fulfillment_type IS DISTINCT FROM 'warehouse_transfer' THEN
    RETURN json_build_object('success', false, 'error', 'Only warehouse transfer POs can be rejected this way');
  END IF;

  IF po_record.status IS DISTINCT FROM 'draft' THEN
    RETURN json_build_object('success', false, 'error', 'Only draft purchase orders can be rejected by Super Admin');
  END IF;

  v_notes := po_record.notes;
  IF p_reason IS NOT NULL AND btrim(p_reason) <> '' THEN
    v_notes := CASE
      WHEN v_notes IS NULL OR btrim(v_notes) = '' THEN btrim(p_reason)
      ELSE v_notes || E'\n\nRejected: ' || btrim(p_reason)
    END;
  END IF;

  UPDATE public.purchase_orders
  SET
    status = 'rejected',
    approved_by = NULL,
    approved_at = NULL,
    notes = v_notes
  WHERE id = p_po_id
    AND status = 'draft';

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Purchase order could not be rejected');
  END IF;

  RETURN json_build_object('success', true, 'po_number', po_record.po_number);
END;
$$;

COMMENT ON FUNCTION public.reject_team_leader_transfer_po(uuid, text) IS
  'Super Admin rejects a Team Leader draft warehouse-transfer PO before it reaches the warehouse hub.';

GRANT EXECUTE ON FUNCTION public.submit_team_leader_transfer_po(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_team_leader_transfer_po(uuid, text) TO authenticated;
