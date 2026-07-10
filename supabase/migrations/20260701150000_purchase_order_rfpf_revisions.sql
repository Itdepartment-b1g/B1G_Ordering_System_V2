-- Key Account RFPF corrections with audit trail (sales admin, max 2 edits per PO).

CREATE TABLE IF NOT EXISTS public.purchase_order_rfpf_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders (id) ON DELETE CASCADE,
  previous_rfpf_number text NOT NULL,
  new_rfpf_number text NOT NULL,
  reason text NOT NULL,
  changed_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_order_rfpf_revisions_reason_not_empty CHECK (trim(reason) <> ''),
  CONSTRAINT purchase_order_rfpf_revisions_numbers_differ CHECK (
    trim(previous_rfpf_number) <> trim(new_rfpf_number)
  )
);

COMMENT ON TABLE public.purchase_order_rfpf_revisions IS
  'Audit trail when a sales admin corrects a Key Account PO RFPF number.';
COMMENT ON COLUMN public.purchase_order_rfpf_revisions.reason IS
  'Mandatory note explaining why the RFPF was changed.';

CREATE INDEX IF NOT EXISTS idx_purchase_order_rfpf_revisions_po_created
  ON public.purchase_order_rfpf_revisions (purchase_order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_purchase_order_rfpf_revisions_company_created
  ON public.purchase_order_rfpf_revisions (company_id, created_at DESC);

ALTER TABLE public.purchase_order_rfpf_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "RFPF revisions: company read" ON public.purchase_order_rfpf_revisions;
CREATE POLICY "RFPF revisions: company read"
  ON public.purchase_order_rfpf_revisions
  FOR SELECT
  TO authenticated
  USING (
    company_id = public.get_auth_company_id()
    OR public.is_system_administrator()
  );

GRANT SELECT ON public.purchase_order_rfpf_revisions TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC: set_key_account_rfpf (sales_admin only)
-- Initial save when RFPF is empty; edits require reason and are capped at 2.
-- ---------------------------------------------------------------------------
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

  IF v_po.workflow_status IS DISTINCT FROM 'warehouse_reserved' THEN
    RETURN json_build_object(
      'success', false,
      'message', 'RFPF can only be saved while the PO is in Warehouse reserved status'
    );
  END IF;

  -- Initial save: no existing RFPF
  IF coalesce(nullif(trim(v_po.rfpf_number), ''), '') = '' THEN
    IF coalesce(nullif(trim(p_reason), ''), '') <> '' THEN
      -- Reason is only for edits; ignore on first save
      NULL;
    END IF;

    UPDATE public.purchase_orders
    SET
      rfpf_number = v_rfpf,
      updated_at = now()
    WHERE id = p_po_id;

    RETURN json_build_object('success', true, 'is_initial_save', true);
  END IF;

  -- Edit existing RFPF
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
  'Sales admin: save or correct Key Account PO RFPF (max 2 edits with mandatory reason).';

REVOKE ALL ON FUNCTION public.set_key_account_rfpf(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_key_account_rfpf(uuid, text, text) TO authenticated;
