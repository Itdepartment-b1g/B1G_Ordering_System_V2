-- Finance can replace cash-sent proof photos, with a required reason and audit history.

CREATE TABLE IF NOT EXISTS public.client_order_return_attachment_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  return_id uuid NOT NULL REFERENCES public.client_order_returns (id) ON DELETE CASCADE,
  attachment_id uuid NOT NULL REFERENCES public.client_order_return_attachments (id) ON DELETE CASCADE,
  previous_file_url text NOT NULL,
  previous_file_path text NOT NULL,
  previous_file_name text,
  new_file_url text NOT NULL,
  new_file_path text NOT NULL,
  new_file_name text,
  reason text NOT NULL,
  changed_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  changed_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_order_return_attachment_revisions_reason_not_empty CHECK (trim(reason) <> '')
);

COMMENT ON TABLE public.client_order_return_attachment_revisions IS
  'Audit trail when finance replaces a cash-sent proof photo.';

CREATE INDEX IF NOT EXISTS idx_cr_attachment_revisions_return_created
  ON public.client_order_return_attachment_revisions (return_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cr_attachment_revisions_attachment_created
  ON public.client_order_return_attachment_revisions (attachment_id, created_at DESC);

ALTER TABLE public.client_order_return_attachment_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CR attachment revisions: company read" ON public.client_order_return_attachment_revisions;
CREATE POLICY "CR attachment revisions: company read"
  ON public.client_order_return_attachment_revisions
  FOR SELECT
  TO authenticated
  USING (
    company_id = public.get_auth_company_id()
    OR public.is_system_administrator()
  );

GRANT SELECT ON public.client_order_return_attachment_revisions TO authenticated;

CREATE OR REPLACE FUNCTION public.replace_client_order_return_payout_attachment(
  p_attachment_id uuid,
  p_file_url text,
  p_file_path text,
  p_file_name text,
  p_content_type text,
  p_reason text
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
  v_reason text;
  v_attachment public.client_order_return_attachments%ROWTYPE;
  v_header public.client_order_returns%ROWTYPE;
  v_revision_id uuid;
  v_revision_count int;
BEGIN
  v_user := auth.uid();
  v_company_id := public.get_auth_company_id();

  IF v_user IS NULL OR v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT role, full_name INTO v_role, v_name
  FROM public.profiles
  WHERE id = v_user AND company_id = v_company_id;

  IF v_role IS DISTINCT FROM 'finance' THEN
    RETURN json_build_object('success', false, 'error', 'Only finance can edit cash-sent proof');
  END IF;

  v_reason := trim(COALESCE(p_reason, ''));
  IF v_reason = '' THEN
    RETURN json_build_object('success', false, 'error', 'A reason for the change is required');
  END IF;

  IF NULLIF(btrim(COALESCE(p_file_url, '')), '') IS NULL
    OR NULLIF(btrim(COALESCE(p_file_path, '')), '') IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'New proof photo is required');
  END IF;

  SELECT * INTO v_attachment
  FROM public.client_order_return_attachments
  WHERE id = p_attachment_id
    AND company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Attachment not found');
  END IF;

  IF COALESCE(v_attachment.purpose, 'return') IS DISTINCT FROM 'finance_payout' THEN
    RETURN json_build_object('success', false, 'error', 'Only cash-sent proof can be replaced');
  END IF;

  SELECT * INTO v_header
  FROM public.client_order_returns
  WHERE id = v_attachment.return_id
    AND company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Return not found');
  END IF;

  IF COALESCE(v_header.return_type, 'change_item') IS DISTINCT FROM 'refund'
    OR v_header.status IS DISTINCT FROM 'posted' THEN
    RETURN json_build_object('success', false, 'error', 'Only posted refund proofs can be edited');
  END IF;

  SELECT COUNT(*)::int INTO v_revision_count
  FROM public.client_order_return_attachment_revisions
  WHERE attachment_id = p_attachment_id;

  IF v_revision_count >= 2 THEN
    RETURN json_build_object('success', false, 'error', 'This cash-sent proof can only be edited 2 times');
  END IF;

  INSERT INTO public.client_order_return_attachment_revisions (
    company_id,
    return_id,
    attachment_id,
    previous_file_url,
    previous_file_path,
    previous_file_name,
    new_file_url,
    new_file_path,
    new_file_name,
    reason,
    changed_by,
    changed_by_name
  ) VALUES (
    v_company_id,
    v_attachment.return_id,
    v_attachment.id,
    v_attachment.file_url,
    v_attachment.file_path,
    v_attachment.file_name,
    btrim(p_file_url),
    btrim(p_file_path),
    NULLIF(btrim(COALESCE(p_file_name, '')), ''),
    v_reason,
    v_user,
    v_name
  )
  RETURNING id INTO v_revision_id;

  UPDATE public.client_order_return_attachments
  SET
    file_url = btrim(p_file_url),
    file_path = btrim(p_file_path),
    file_name = NULLIF(btrim(COALESCE(p_file_name, '')), ''),
    content_type = NULLIF(btrim(COALESCE(p_content_type, '')), ''),
    uploaded_by = v_user
  WHERE id = p_attachment_id;

  RETURN json_build_object('success', true, 'revision_id', v_revision_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_client_order_return_payout_attachment(
  uuid, text, text, text, text, text
) TO authenticated;

COMMENT ON FUNCTION public.replace_client_order_return_payout_attachment(uuid, text, text, text, text, text) IS
  'Finance: replace a cash-sent proof photo (max 2 edits) and keep the previous file in revision history.';
