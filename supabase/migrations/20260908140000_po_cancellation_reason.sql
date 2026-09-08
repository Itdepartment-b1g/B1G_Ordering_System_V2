-- Store Super Admin cancel reason separately from PO notes, and stop mixing it into notes.

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

COMMENT ON COLUMN public.purchase_orders.cancellation_reason IS
  'Reason Super Admin cancelled a Team Leader draft warehouse-transfer PO before warehouse approval.';

CREATE OR REPLACE FUNCTION public.reject_team_leader_transfer_po(p_po_id uuid, p_reason text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  po_record public.purchase_orders%ROWTYPE;
  v_company uuid;
  v_reason text;
BEGIN
  IF NOT public.is_super_admin() THEN
    RETURN json_build_object('success', false, 'error', 'Only Super Admin can cancel team leader purchase orders');
  END IF;

  v_company := public.get_auth_company_id();
  IF v_company IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Company not found');
  END IF;

  v_reason := NULLIF(btrim(COALESCE(p_reason, '')), '');
  IF v_reason IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'A cancellation reason is required');
  END IF;

  SELECT * INTO po_record FROM public.purchase_orders WHERE id = p_po_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Purchase order not found');
  END IF;

  IF po_record.company_id IS DISTINCT FROM v_company THEN
    RETURN json_build_object('success', false, 'error', 'Purchase order is not in your company');
  END IF;

  IF po_record.fulfillment_type IS DISTINCT FROM 'warehouse_transfer' THEN
    RETURN json_build_object('success', false, 'error', 'Only warehouse transfer POs can be cancelled this way');
  END IF;

  IF po_record.status IS DISTINCT FROM 'draft' THEN
    RETURN json_build_object('success', false, 'error', 'Only draft purchase orders can be cancelled by Super Admin');
  END IF;

  UPDATE public.purchase_orders
  SET
    status = 'rejected',
    approved_by = NULL,
    approved_at = NULL,
    cancellation_reason = v_reason
  WHERE id = p_po_id
    AND status = 'draft';

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Purchase order could not be cancelled');
  END IF;

  RETURN json_build_object('success', true, 'po_number', po_record.po_number);
END;
$$;

COMMENT ON FUNCTION public.reject_team_leader_transfer_po(uuid, text) IS
  'Super Admin cancels a Team Leader draft warehouse-transfer PO (draft → rejected) with a required reason. Warehouse never sees the PO.';
