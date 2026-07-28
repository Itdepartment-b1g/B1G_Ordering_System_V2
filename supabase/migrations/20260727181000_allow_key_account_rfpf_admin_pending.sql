-- Allow Sales Admin to save or edit Key Account RFPF during admin review
-- as well as after the PO is queued for warehouse.

CREATE OR REPLACE FUNCTION public.set_key_account_rfpf(
  p_po_id uuid,
  p_rfpf_number text,
  p_reason text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_company_id uuid;
  v_po public.purchase_orders%ROWTYPE;
  v_rfpf text;
  v_reason text;
  v_revision_count int;
  v_revision_id uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  SELECT me.company_id
  INTO v_company_id
  FROM public.profiles me
  WHERE me.id = v_uid
    AND me.role = 'sales_admin'::text;

  IF v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Only sales admins can set RFPF');
  END IF;

  IF p_po_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Purchase order id is required');
  END IF;

  v_rfpf := trim(coalesce(p_rfpf_number, ''));
  IF v_rfpf = '' THEN
    RETURN json_build_object('success', false, 'message', 'RFPF number is required');
  END IF;

  SELECT *
  INTO v_po
  FROM public.purchase_orders
  WHERE id = p_po_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Purchase order not found');
  END IF;

  IF v_po.company_id IS DISTINCT FROM v_company_id THEN
    RETURN json_build_object('success', false, 'message', 'Purchase order not found in your company');
  END IF;

  IF v_po.company_account_type IS DISTINCT FROM 'Key Accounts' THEN
    RETURN json_build_object('success', false, 'message', 'RFPF can only be set on Key Account purchase orders');
  END IF;

  IF v_po.workflow_status NOT IN ('admin_pending', 'warehouse_reserved') THEN
    RETURN json_build_object(
      'success', false,
      'message', 'RFPF can only be saved while the PO is in Admin pending or Warehouse reserved status'
    );
  END IF;

  IF coalesce(nullif(trim(v_po.rfpf_number), ''), '') = '' THEN
    IF coalesce(nullif(trim(p_reason), ''), '') <> '' THEN
      NULL;
    END IF;

    UPDATE public.purchase_orders
    SET
      rfpf_number = v_rfpf,
      updated_at = now()
    WHERE id = p_po_id;

    RETURN json_build_object('success', true, 'is_initial_save', true);
  END IF;

  v_reason := trim(coalesce(p_reason, ''));
  IF v_reason = '' THEN
    RETURN json_build_object('success', false, 'message', 'A reason for the change is required');
  END IF;

  IF trim(v_po.rfpf_number) = v_rfpf THEN
    RETURN json_build_object('success', false, 'message', 'New RFPF must differ from the current value');
  END IF;

  SELECT count(*)::int
  INTO v_revision_count
  FROM public.purchase_order_rfpf_revisions
  WHERE purchase_order_id = p_po_id;

  IF v_revision_count >= 2 THEN
    RETURN json_build_object(
      'success', false,
      'message', 'This RFPF has already been edited the maximum number of times (2)'
    );
  END IF;

  INSERT INTO public.purchase_order_rfpf_revisions (
    company_id,
    purchase_order_id,
    previous_rfpf_number,
    new_rfpf_number,
    reason,
    changed_by
  ) VALUES (
    v_company_id,
    p_po_id,
    trim(v_po.rfpf_number),
    v_rfpf,
    v_reason,
    v_uid
  )
  RETURNING id INTO v_revision_id;

  UPDATE public.purchase_orders
  SET
    rfpf_number = v_rfpf,
    updated_at = now()
  WHERE id = p_po_id;

  RETURN json_build_object(
    'success', true,
    'is_initial_save', false,
    'revision_id', v_revision_id,
    'edit_count', v_revision_count + 1
  );
END;
$$;

COMMENT ON FUNCTION public.set_key_account_rfpf(uuid, text, text) IS
  'Sales admin: save or correct Key Account PO RFPF in admin_pending or warehouse_reserved (max 2 edits with mandatory reason).';

REVOKE ALL ON FUNCTION public.set_key_account_rfpf(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_key_account_rfpf(uuid, text, text) TO authenticated;
