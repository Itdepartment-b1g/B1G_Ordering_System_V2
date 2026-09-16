-- Persist Super Admin refund approval (name + time) for the order timeline.
-- Safe to run after 20260916180000_client_order_return_refund.sql.

ALTER TABLE public.client_order_returns
  ADD COLUMN IF NOT EXISTS sa_approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sa_approved_by_name text,
  ADD COLUMN IF NOT EXISTS sa_approved_at timestamptz;

COMMENT ON COLUMN public.client_order_returns.sa_approved_by IS
  'Super Admin who sent a refund to finance. Finance post still uses approved_*.';
COMMENT ON COLUMN public.client_order_returns.sa_approved_by_name IS
  'Display name of the Super Admin who sent a refund to finance.';
COMMENT ON COLUMN public.client_order_returns.sa_approved_at IS
  'When Super Admin sent a refund to finance.';

CREATE OR REPLACE FUNCTION public.approve_client_order_return(p_return_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid;
  v_company_id uuid;
  v_role text;
  v_name text;
  v_header public.client_order_returns%ROWTYPE;
  v_return_type text;
  v_next_status text;
BEGIN
  v_user := auth.uid();
  v_company_id := public.get_auth_company_id();

  IF v_user IS NULL OR v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT role, full_name INTO v_role, v_name
  FROM public.profiles
  WHERE id = v_user AND company_id = v_company_id;

  IF v_role IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Profile not found');
  END IF;

  SELECT * INTO v_header
  FROM public.client_order_returns
  WHERE id = p_return_id
    AND company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Return not found');
  END IF;

  v_return_type := COALESCE(v_header.return_type, 'change_item');

  IF v_return_type = 'change_item' THEN
    IF v_role IS DISTINCT FROM 'team_leader' THEN
      RETURN json_build_object('success', false, 'error', 'Only a team leader can approve a change-item return');
    END IF;

    IF v_header.status IS DISTINCT FROM 'pending_leader' THEN
      RETURN json_build_object('success', false, 'error', 'Only pending returns can be approved');
    END IF;

    IF NOT (
      public.is_client_order_return_team_leader_of(v_header.returned_by)
      OR public.is_client_order_return_team_leader_of(COALESCE(v_header.original_agent_id, v_header.returned_by))
    ) THEN
      RETURN json_build_object('success', false, 'error', 'You can only approve returns from your team');
    END IF;

    v_next_status := 'posted';
  ELSIF v_return_type = 'refund' THEN
    IF v_header.status = 'pending_super_admin' THEN
      IF v_role IS DISTINCT FROM 'super_admin' THEN
        RETURN json_build_object('success', false, 'error', 'Only a super admin can send a refund to finance');
      END IF;
      v_next_status := 'pending_finance';
    ELSIF v_header.status = 'pending_finance' THEN
      IF v_role IS DISTINCT FROM 'finance' THEN
        RETURN json_build_object('success', false, 'error', 'Only finance can post a refund');
      END IF;
      v_next_status := 'posted';
    ELSE
      RETURN json_build_object('success', false, 'error', 'This refund cannot be approved');
    END IF;
  ELSE
    RETURN json_build_object('success', false, 'error', 'Unknown return type');
  END IF;

  UPDATE public.client_order_returns
  SET status = v_next_status,
      sa_approved_at = CASE
        WHEN v_return_type = 'refund' AND v_header.status = 'pending_super_admin' THEN now()
        ELSE sa_approved_at
      END,
      sa_approved_by = CASE
        WHEN v_return_type = 'refund' AND v_header.status = 'pending_super_admin' THEN v_user
        ELSE sa_approved_by
      END,
      sa_approved_by_name = CASE
        WHEN v_return_type = 'refund' AND v_header.status = 'pending_super_admin' THEN v_name
        ELSE sa_approved_by_name
      END,
      approved_at = CASE WHEN v_next_status = 'posted' THEN now() ELSE approved_at END,
      approved_by = CASE WHEN v_next_status = 'posted' THEN v_user ELSE approved_by END,
      approved_by_name = CASE WHEN v_next_status = 'posted' THEN v_name ELSE approved_by_name END,
      rejected_at = NULL,
      rejected_by = NULL,
      rejected_by_name = NULL,
      rejection_note = NULL
  WHERE id = p_return_id;

  IF v_next_status = 'posted' THEN
    PERFORM public.apply_client_order_return_posted_stock(p_return_id, v_user);
  END IF;

  RETURN json_build_object('success', true, 'id', p_return_id, 'status', v_next_status);
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_client_order_return(uuid) TO authenticated;

COMMENT ON FUNCTION public.approve_client_order_return(uuid) IS
  'Change item: TL posts. Refund: SA sends to finance (sa_approved_*), then finance posts (approved_*) and applies returned stock.';
