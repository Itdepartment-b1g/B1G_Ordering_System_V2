-- Allow team_leader to replace deposit slips before finance verification.
-- super_admin can still replace slips after verification.

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
  v_role text;
  v_deposit public.cash_deposits%ROWTYPE;
  v_reason text;
  v_revision_id uuid;
  v_revision_count int;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  SELECT me.company_id, me.role
  INTO v_company_id, v_role
  FROM public.profiles me
  WHERE me.id = v_uid;

  IF v_company_id IS NULL OR v_role NOT IN ('super_admin', 'team_leader') THEN
    RETURN json_build_object('success', false, 'message', 'Not authorized to replace deposit slips');
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

  -- Team leader: block after finance approval
  IF v_role = 'team_leader' AND v_deposit.status = 'verified' THEN
    RETURN json_build_object(
      'success', false,
      'message', 'This deposit was already verified by finance. Only a super admin can replace the slip.'
    );
  END IF;

  -- Team leader: only their team's deposits
  IF v_role = 'team_leader'
     AND v_deposit.agent_id IS DISTINCT FROM v_uid
     AND v_deposit.performed_by IS DISTINCT FROM v_uid
     AND NOT EXISTS (
       SELECT 1
       FROM public.leader_teams lt
       WHERE lt.leader_id = v_uid
         AND lt.agent_id = v_deposit.agent_id
         AND lt.company_id = v_company_id
     )
  THEN
    RETURN json_build_object('success', false, 'message', 'You can only edit deposits for your team');
  END IF;

  IF coalesce(nullif(trim(v_deposit.deposit_slip_url), ''), '') = '' THEN
    RETURN json_build_object('success', false, 'message', 'Deposit has no slip to replace');
  END IF;

  IF trim(v_deposit.deposit_slip_url) = trim(p_new_slip_url) THEN
    RETURN json_build_object('success', false, 'message', 'New slip URL must differ from the current slip');
  END IF;

  SELECT count(*)::int
  INTO v_revision_count
  FROM public.cash_deposit_slip_revisions
  WHERE cash_deposit_id = p_deposit_id;

  IF v_revision_count >= 2 THEN
    RETURN json_build_object(
      'success', false,
      'message', 'This deposit slip has already been edited the maximum number of times (2)'
    );
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
  'Replace a cash deposit slip (max 2 edits). team_leader: only before finance verification. super_admin: anytime.';
