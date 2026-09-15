-- Transfer Delivery Receipts (TDR). Issued on first dispatch, and again on
-- Found (redeliver) and Replace so each physical send has its own receipt #.

ALTER TABLE public.tl_stock_requests
  ADD COLUMN IF NOT EXISTS tdr_number text;

CREATE TABLE IF NOT EXISTS public.tl_stock_request_tdrs (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES public.tl_stock_requests(id) ON DELETE CASCADE,
  discrepancy_id uuid REFERENCES public.tl_stock_request_discrepancies(id) ON DELETE SET NULL,
  tdr_number text NOT NULL,
  kind text NOT NULL CHECK (kind = ANY (ARRAY[
    'dispatch'::text,
    'redeliver'::text,
    'replace'::text
  ])),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT tl_stock_request_tdrs_company_number_key UNIQUE (company_id, tdr_number)
);

CREATE INDEX IF NOT EXISTS idx_tl_stock_request_tdrs_request
  ON public.tl_stock_request_tdrs(request_id, created_at DESC);

ALTER TABLE public.tl_stock_request_tdrs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "TL transfer parties can view TDRs" ON public.tl_stock_request_tdrs;
CREATE POLICY "TL transfer parties can view TDRs"
  ON public.tl_stock_request_tdrs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tl_stock_requests r
      WHERE r.id = tl_stock_request_tdrs.request_id
        AND (
          auth.uid() IN (r.requester_leader_id, r.source_leader_id)
          OR EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.company_id = r.company_id
              AND p.role IN ('admin', 'super_admin')
          )
        )
    )
  );

GRANT SELECT ON public.tl_stock_request_tdrs TO authenticated;

CREATE OR REPLACE FUNCTION public._tl_issue_tdr(
  p_request_id uuid,
  p_kind text,
  p_discrepancy_id uuid DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_company_id uuid;
  v_tdr text;
  v_date_str text;
  v_count integer;
BEGIN
  IF p_kind NOT IN ('dispatch', 'redeliver', 'replace') THEN
    RAISE EXCEPTION 'Invalid TDR kind';
  END IF;

  SELECT company_id INTO v_company_id
  FROM public.tl_stock_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Transfer not found';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tl_tdr:' || v_company_id::text));

  v_date_str := to_char(NOW(), 'YYYYMMDD');
  SELECT COUNT(*) INTO v_count
  FROM public.tl_stock_request_tdrs
  WHERE company_id = v_company_id
    AND tdr_number LIKE 'TDR-' || v_date_str || '-%';

  v_tdr := 'TDR-' || v_date_str || '-' || lpad((v_count + 1)::text, 4, '0');

  INSERT INTO public.tl_stock_request_tdrs (
    company_id, request_id, discrepancy_id, tdr_number, kind, created_by
  ) VALUES (
    v_company_id, p_request_id, p_discrepancy_id, v_tdr, p_kind, p_actor_id
  );

  UPDATE public.tl_stock_requests
  SET tdr_number = v_tdr, updated_at = NOW()
  WHERE id = p_request_id;

  RETURN v_tdr;
END;
$$;

-- First physical send only: later items on the same dispatch reuse this TDR.
CREATE OR REPLACE FUNCTION public._tl_ensure_dispatch_tdr(
  p_request_id uuid,
  p_actor_id uuid
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing text;
BEGIN
  SELECT tdr_number INTO v_existing
  FROM public.tl_stock_requests
  WHERE id = p_request_id;

  IF NULLIF(btrim(COALESCE(v_existing, '')), '') IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  RETURN public._tl_issue_tdr(p_request_id, 'dispatch', NULL, p_actor_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.source_tl_dispatch_stock(
  p_request_id uuid,
  p_dispatched_quantity integer,
  p_signature_url text,
  p_signature_path text,
  p_shortfall_reason text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_proof_urls jsonb DEFAULT '[]'::jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_source_id uuid;
  v_source_role text;
  v_item record;
  v_header record;
  v_approved integer;
  v_reason text;
  v_tdr text;
BEGIN
  SELECT id, role INTO v_source_id, v_source_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_source_role IS DISTINCT FROM 'team_leader' THEN
    RETURN json_build_object('success', false, 'error', 'Only team leaders can dispatch stock');
  END IF;

  IF p_signature_url IS NULL OR btrim(p_signature_url) = ''
     OR p_signature_path IS NULL OR btrim(p_signature_path) = '' THEN
    RETURN json_build_object('success', false, 'error', 'Dispatcher signature is required');
  END IF;

  IF p_proof_urls IS NULL
     OR jsonb_typeof(p_proof_urls) <> 'array'
     OR jsonb_array_length(p_proof_urls) < 1 THEN
    RETURN json_build_object('success', false, 'error', 'At least one dispatch package photo is required');
  END IF;

  SELECT * INTO v_item FROM public.tl_stock_request_items WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Request item not found');
  END IF;

  SELECT * INTO v_header FROM public.tl_stock_requests WHERE id = v_item.request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Request not found');
  END IF;

  IF v_item.status NOT IN ('pending_source_tl', 'admin_approved') THEN
    RETURN json_build_object('success', false, 'error', 'Request is not pending dispatch');
  END IF;

  IF v_header.source_leader_id IS DISTINCT FROM v_source_id THEN
    RETURN json_build_object('success', false, 'error', 'You are not the source team leader for this request');
  END IF;

  v_approved := COALESCE(v_item.admin_approved_quantity, 0);
  IF v_approved <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Request has no admin-approved quantity');
  END IF;

  IF p_dispatched_quantity IS NULL OR p_dispatched_quantity <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Dispatch quantity must be greater than 0');
  END IF;

  IF p_dispatched_quantity > v_approved THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Cannot dispatch more than the admin-approved quantity',
      'approved_quantity', v_approved
    );
  END IF;

  v_reason := NULLIF(btrim(COALESCE(p_shortfall_reason, '')), '');
  IF p_dispatched_quantity < v_approved THEN
    IF v_reason IS NULL OR v_reason NOT IN (
      'insufficient_stock', 'reserved_for_team', 'damaged_on_hand', 'other'
    ) THEN
      RETURN json_build_object(
        'success', false,
        'error', 'A reason is required when dispatching less than the approved quantity'
      );
    END IF;
  ELSE
    v_reason := NULL;
  END IF;

  PERFORM public._tl_debit_agent_inventory(
    v_header.source_leader_id,
    v_item.variant_id,
    p_dispatched_quantity
  );

  INSERT INTO public.inventory_transactions (
    company_id, variant_id, transaction_type, quantity,
    from_location, to_location, reference_type, reference_id, performed_by, notes
  ) VALUES (
    v_header.company_id,
    v_item.variant_id,
    'tl_stock_transfer_out',
    p_dispatched_quantity,
    'agent_inventory:' || v_header.source_leader_id::text,
    'in_transit:' || v_header.id::text,
    'tl_stock_request',
    v_header.id,
    v_source_id,
    'TL transfer dispatch ' || v_header.request_number
  );

  UPDATE public.tl_stock_request_items
  SET
    status = 'pending_receipt',
    dispatched_quantity = p_dispatched_quantity,
    dispatch_shortfall_reason = v_reason,
    updated_at = NOW()
  WHERE id = v_item.id;

  UPDATE public.tl_stock_requests
  SET
    dispatched_at = COALESCE(dispatched_at, NOW()),
    source_tl_approved_at = COALESCE(source_tl_approved_at, NOW()),
    source_tl_approved_by = COALESCE(source_tl_approved_by, v_source_id),
    source_tl_signature_url = p_signature_url,
    source_tl_signature_path = p_signature_path,
    dispatch_proof_urls = p_proof_urls,
    source_tl_notes = COALESCE(NULLIF(btrim(COALESCE(p_notes, '')), ''), source_tl_notes)
  WHERE id = v_header.id;

  v_tdr := public._tl_ensure_dispatch_tdr(v_header.id, v_source_id);

  PERFORM public._tl_refresh_request_status(v_header.id);

  PERFORM public._tl_notify(
    v_header.company_id,
    v_header.requester_leader_id,
    'approved',
    'Stock dispatched — ready to receive',
    'Your stock request ' || v_header.request_number || ' (' || v_tdr || ') was dispatched (' ||
      p_dispatched_quantity || ' units). Sign to receive.',
    v_header.id
  );

  RETURN json_build_object(
    'success', true,
    'request_id', v_header.id,
    'item_id', v_item.id,
    'dispatched_quantity', p_dispatched_quantity,
    'tdr_number', v_tdr
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_tl_stock_request_discrepancy(
  p_discrepancy_id uuid,
  p_resolution text,
  p_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_id uuid;
  v_actor_role text;
  v_actor_company uuid;
  disc record;
  v_header record;
  v_item record;
  v_resolution text;
  v_new_disc_status text;
  v_new_item_status text;
  v_remaining integer;
  v_tdr text;
BEGIN
  v_resolution := lower(btrim(COALESCE(p_resolution, '')));
  IF v_resolution NOT IN ('redeliver', 'write_off', 'write_off_replace') THEN
    RETURN json_build_object('success', false, 'error', 'Resolution must be redeliver, write_off, or write_off_replace');
  END IF;

  SELECT id, role, company_id INTO v_actor_id, v_actor_role, v_actor_company
  FROM public.profiles
  WHERE id = auth.uid();

  SELECT * INTO disc
  FROM public.tl_stock_request_discrepancies
  WHERE id = p_discrepancy_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Discrepancy not found');
  END IF;

  IF disc.status IS DISTINCT FROM 'open' THEN
    RETURN json_build_object('success', false, 'error', 'Discrepancy is already resolved');
  END IF;

  SELECT * INTO v_header
  FROM public.tl_stock_requests
  WHERE id = disc.request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Transfer not found');
  END IF;

  IF disc.request_item_id IS NOT NULL THEN
    SELECT * INTO v_item FROM public.tl_stock_request_items WHERE id = disc.request_item_id FOR UPDATE;
  ELSE
    SELECT * INTO v_item
    FROM public.tl_stock_request_items
    WHERE request_id = disc.request_id
      AND variant_id = disc.variant_id
    FOR UPDATE
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Transfer item not found');
  END IF;

  IF NOT (
    v_actor_id = v_header.source_leader_id
    OR (
      v_actor_role IN ('admin', 'super_admin')
      AND v_actor_company = v_header.company_id
    )
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Only the dispatching team leader (or company admin) can resolve this shortage');
  END IF;

  IF v_resolution = 'redeliver' THEN
    v_new_disc_status := 'resolved_redeliver';
    v_new_item_status := 'pending_receipt';
    v_tdr := public._tl_issue_tdr(v_header.id, 'redeliver', disc.id, v_actor_id);
  ELSIF v_resolution = 'write_off' THEN
    v_new_disc_status := 'resolved_write_off';
    UPDATE public.tl_stock_request_items
    SET written_off_quantity = COALESCE(written_off_quantity, 0) + disc.quantity,
        updated_at = NOW()
    WHERE id = v_item.id;
  ELSIF v_resolution = 'write_off_replace' THEN
    v_new_disc_status := 'resolved_write_off_replace';
    PERFORM public._tl_debit_agent_inventory(
      v_header.source_leader_id,
      v_item.variant_id,
      disc.quantity
    );
    INSERT INTO public.inventory_transactions (
      company_id, variant_id, transaction_type, quantity,
      from_location, to_location, reference_type, reference_id, performed_by, notes
    ) VALUES (
      v_header.company_id,
      v_item.variant_id,
      'tl_stock_transfer_out',
      disc.quantity,
      'agent_inventory:' || v_header.source_leader_id::text,
      'in_transit:' || v_header.id::text,
      'tl_stock_request',
      v_header.id,
      v_actor_id,
      'TL transfer replacement dispatch ' || v_header.request_number
    );
    UPDATE public.tl_stock_request_items
    SET
      written_off_quantity = COALESCE(written_off_quantity, 0) + disc.quantity,
      dispatched_quantity = COALESCE(dispatched_quantity, 0) + disc.quantity,
      updated_at = NOW()
    WHERE id = v_item.id;
    v_new_item_status := 'pending_receipt';
    v_tdr := public._tl_issue_tdr(v_header.id, 'replace', disc.id, v_actor_id);
  END IF;

  UPDATE public.tl_stock_request_discrepancies
  SET
    status = v_new_disc_status,
    resolved_by = v_actor_id,
    resolved_at = NOW(),
    resolution_notes = NULLIF(btrim(COALESCE(p_notes, '')), ''),
    updated_at = NOW()
  WHERE id = p_discrepancy_id;

  SELECT
    COALESCE(dispatched_quantity, 0) - COALESCE(received_quantity, 0) - COALESCE(written_off_quantity, 0)
  INTO v_remaining
  FROM public.tl_stock_request_items
  WHERE id = v_item.id;

  IF v_resolution = 'write_off' THEN
    IF COALESCE(v_remaining, 0) <= 0 THEN
      v_new_item_status := 'incomplete';
    ELSE
      v_new_item_status := 'pending_receipt';
    END IF;
  END IF;

  UPDATE public.tl_stock_request_items
  SET status = v_new_item_status, updated_at = NOW()
  WHERE id = v_item.id;

  PERFORM public._tl_refresh_request_status(v_header.id);

  IF v_new_item_status = 'pending_receipt' THEN
    PERFORM public._tl_notify(
      v_header.company_id,
      v_header.requester_leader_id,
      'approved',
      CASE WHEN v_resolution = 'write_off_replace'
        THEN 'Replacement dispatched — ready to receive'
        ELSE 'Transfer redelivered — ready to receive'
      END,
      'Shortage on ' || v_header.request_number ||
        COALESCE(' (' || v_tdr || ')', '') ||
        ' was resolved. Please receive the remaining stock.',
      v_header.id
    );
  END IF;

  RETURN json_build_object(
    'success', true,
    'discrepancy_id', p_discrepancy_id,
    'resolution', v_resolution,
    'tdr_number', v_tdr,
    'request_status', public._tl_refresh_request_status(v_header.id)
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.source_tl_dispatch_stock(uuid, integer, text, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_tl_stock_request_discrepancy(uuid, text, text) TO authenticated;

-- Existing in-flight / completed dispatches get a TDR so history is not blank.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id, source_tl_approved_by
    FROM public.tl_stock_requests
    WHERE dispatched_at IS NOT NULL
      AND NULLIF(btrim(COALESCE(tdr_number, '')), '') IS NULL
    ORDER BY dispatched_at, id
  LOOP
    PERFORM public._tl_issue_tdr(r.id, 'dispatch', NULL, r.source_tl_approved_by);
  END LOOP;
END $$;
