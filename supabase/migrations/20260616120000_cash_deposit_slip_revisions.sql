-- Super admin deposit slip corrections with audit trail (original slip preserved).

CREATE TABLE IF NOT EXISTS public.cash_deposit_slip_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  cash_deposit_id uuid NOT NULL REFERENCES public.cash_deposits (id) ON DELETE CASCADE,
  previous_slip_url text NOT NULL,
  new_slip_url text NOT NULL,
  reason text NOT NULL,
  changed_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cash_deposit_slip_revisions_reason_not_empty CHECK (trim(reason) <> '')
);

COMMENT ON TABLE public.cash_deposit_slip_revisions IS
  'Audit trail when a super admin replaces a cash deposit slip attachment.';
COMMENT ON COLUMN public.cash_deposit_slip_revisions.reason IS
  'Mandatory note explaining why the slip was replaced.';

CREATE INDEX IF NOT EXISTS idx_cash_deposit_slip_revisions_deposit_created
  ON public.cash_deposit_slip_revisions (cash_deposit_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cash_deposit_slip_revisions_company_created
  ON public.cash_deposit_slip_revisions (company_id, created_at DESC);

ALTER TABLE public.cash_deposit_slip_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cash deposit slip revisions: company read" ON public.cash_deposit_slip_revisions;
CREATE POLICY "Cash deposit slip revisions: company read"
  ON public.cash_deposit_slip_revisions
  FOR SELECT
  TO authenticated
  USING (
    company_id = public.get_auth_company_id()
    OR public.is_system_administrator()
  );

GRANT SELECT ON public.cash_deposit_slip_revisions TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC: replace_cash_deposit_slip (super_admin only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.replace_cash_deposit_slip(
  p_deposit_id uuid,
  p_new_slip_url text,
  p_reason text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_company_id uuid;
  v_deposit public.cash_deposits%ROWTYPE;
  v_reason text;
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
    AND me.role = 'super_admin'::text;

  IF v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Only super admins can replace deposit slips');
  END IF;

  IF p_deposit_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Deposit id is required');
  END IF;

  v_reason := trim(coalesce(p_reason, ''));
  IF v_reason = '' THEN
    RETURN json_build_object('success', false, 'message', 'A reason for the change is required');
  END IF;

  IF coalesce(nullif(trim(p_new_slip_url), ''), '') = '' THEN
    RETURN json_build_object('success', false, 'message', 'New deposit slip URL is required');
  END IF;

  SELECT *
  INTO v_deposit
  FROM public.cash_deposits
  WHERE id = p_deposit_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Deposit not found');
  END IF;

  IF v_deposit.company_id IS DISTINCT FROM v_company_id THEN
    RETURN json_build_object('success', false, 'message', 'Deposit not found in your company');
  END IF;

  IF coalesce(nullif(trim(v_deposit.deposit_slip_url), ''), '') = '' THEN
    RETURN json_build_object('success', false, 'message', 'Deposit has no slip to replace');
  END IF;

  IF trim(v_deposit.deposit_slip_url) = trim(p_new_slip_url) THEN
    RETURN json_build_object('success', false, 'message', 'New slip URL must differ from the current slip');
  END IF;

  INSERT INTO public.cash_deposit_slip_revisions (
    company_id,
    cash_deposit_id,
    previous_slip_url,
    new_slip_url,
    reason,
    changed_by
  ) VALUES (
    v_company_id,
    p_deposit_id,
    v_deposit.deposit_slip_url,
    trim(p_new_slip_url),
    v_reason,
    v_uid
  )
  RETURNING id INTO v_revision_id;

  UPDATE public.cash_deposits
  SET
    deposit_slip_url = trim(p_new_slip_url),
    updated_at = now()
  WHERE id = p_deposit_id;

  UPDATE public.client_orders
  SET
    payment_proof_url = trim(p_new_slip_url),
    updated_at = now()
  WHERE deposit_id = p_deposit_id
    AND company_id = v_company_id;

  RETURN json_build_object('success', true, 'revision_id', v_revision_id);
END;
$$;

COMMENT ON FUNCTION public.replace_cash_deposit_slip(uuid, text, text) IS
  'Super admin: replace a cash deposit slip, preserving the previous URL in revision history.';

REVOKE ALL ON FUNCTION public.replace_cash_deposit_slip(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_cash_deposit_slip(uuid, text, text) TO authenticated;
