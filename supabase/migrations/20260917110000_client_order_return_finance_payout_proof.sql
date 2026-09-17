-- Finance must attach proof that cash was sent when posting a refund.

ALTER TABLE public.client_order_return_attachments
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'return';

ALTER TABLE public.client_order_return_attachments
  DROP CONSTRAINT IF EXISTS client_order_return_attachments_purpose_check;

ALTER TABLE public.client_order_return_attachments
  ADD CONSTRAINT client_order_return_attachments_purpose_check
  CHECK (purpose IN ('return', 'finance_payout'));

COMMENT ON COLUMN public.client_order_return_attachments.purpose IS
  'return = agent filing photos. finance_payout = proof cash was sent.';

DROP FUNCTION IF EXISTS public.approve_client_order_return(uuid);

CREATE OR REPLACE FUNCTION public.approve_client_order_return(
  p_return_id uuid,
  p_payout_attachments jsonb DEFAULT NULL
)
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
  v_elem jsonb;
  v_file_url text;
  v_file_path text;
  v_source text;
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
      IF p_payout_attachments IS NULL
        OR jsonb_typeof(p_payout_attachments) <> 'array'
        OR jsonb_array_length(p_payout_attachments) = 0 THEN
        RETURN json_build_object('success', false, 'error', 'Attach a photo as proof that cash was sent');
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

  IF v_return_type = 'refund' AND v_header.status = 'pending_finance' THEN
    FOR v_elem IN SELECT t.elem FROM jsonb_array_elements(p_payout_attachments) AS t(elem)
    LOOP
      v_file_url := NULLIF(btrim(COALESCE(v_elem->>'file_url', '')), '');
      v_file_path := NULLIF(btrim(COALESCE(v_elem->>'file_path', '')), '');
      v_source := COALESCE(NULLIF(v_elem->>'source', ''), 'upload');
      IF v_file_url IS NULL OR v_file_path IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Each cash-sent photo needs file_url and file_path');
      END IF;
      IF v_source NOT IN ('capture', 'upload') THEN
        v_source := 'upload';
      END IF;

      INSERT INTO public.client_order_return_attachments (
        return_id, company_id, file_url, file_path, file_name, content_type, source, sort_order, uploaded_by, purpose
      ) VALUES (
        p_return_id,
        v_company_id,
        v_file_url,
        v_file_path,
        NULLIF(v_elem->>'file_name', ''),
        NULLIF(v_elem->>'content_type', ''),
        v_source,
        COALESCE((v_elem->>'sort_order')::integer, 0),
        v_user,
        'finance_payout'
      );
    END LOOP;
  END IF;

  IF v_next_status = 'posted' THEN
    PERFORM public.apply_client_order_return_posted_stock(p_return_id, v_user);
  END IF;

  RETURN json_build_object('success', true, 'id', p_return_id, 'status', v_next_status);
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_client_order_return(uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.approve_client_order_return(uuid, jsonb) IS
  'Change item: TL posts. Refund: SA sends to finance, then finance posts with cash-sent proof photos.';
