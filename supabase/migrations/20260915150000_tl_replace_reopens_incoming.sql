-- Replace (write_off_replace) must reopen Incoming on the SAME transfer,
-- like Found → dispatch again. Dispatcher can send less if they need the stock.
-- Do not auto-debit / auto-issue a TDR, and do not mint a new TLREQ number.

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
  v_new_dispatched integer;
BEGIN
  v_resolution := lower(btrim(COALESCE(p_resolution, '')));
  IF v_resolution NOT IN ('redeliver', 'found_keep', 'write_off', 'write_off_replace') THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Resolution must be redeliver, found_keep, write_off, or write_off_replace'
    );
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

  IF v_resolution IN ('redeliver', 'found_keep') THEN
    PERFORM public._tl_credit_agent_inventory(
      v_header.source_leader_id,
      v_item.variant_id,
      v_header.company_id,
      disc.quantity,
      v_header.source_leader_id
    );

    INSERT INTO public.inventory_transactions (
      company_id, variant_id, transaction_type, quantity,
      from_location, to_location, reference_type, reference_id, performed_by, notes
    ) VALUES (
      v_header.company_id,
      v_item.variant_id,
      'tl_stock_transfer_in',
      disc.quantity,
      'in_transit:' || v_header.id::text,
      'agent_inventory:' || v_header.source_leader_id::text,
      'tl_stock_request',
      v_header.id,
      v_actor_id,
      'TL transfer found — returned to dispatcher ' || v_header.request_number
    );
  END IF;

  IF v_resolution = 'redeliver' THEN
    v_new_disc_status := 'resolved_redeliver';
    v_new_dispatched := GREATEST(
      COALESCE(v_item.received_quantity, 0),
      COALESCE(v_item.dispatched_quantity, 0) - disc.quantity
    );
    UPDATE public.tl_stock_request_items
    SET
      dispatched_quantity = v_new_dispatched,
      updated_at = NOW()
    WHERE id = v_item.id;
    v_new_item_status := 'pending_source_tl';
  ELSIF v_resolution = 'found_keep' THEN
    v_new_disc_status := 'resolved_found_keep';
    UPDATE public.tl_stock_request_items
    SET
      written_off_quantity = COALESCE(written_off_quantity, 0) + disc.quantity,
      updated_at = NOW()
    WHERE id = v_item.id;
  ELSIF v_resolution = 'write_off' THEN
    v_new_disc_status := 'resolved_write_off';
    UPDATE public.tl_stock_request_items
    SET written_off_quantity = COALESCE(written_off_quantity, 0) + disc.quantity,
        updated_at = NOW()
    WHERE id = v_item.id;
  ELSIF v_resolution = 'write_off_replace' THEN
    -- Lost units stay out of inventory. Reopen remaining on this same transfer
    -- so Incoming can dispatch a replacement (possibly less than the short qty).
    v_new_disc_status := 'resolved_write_off_replace';
    v_new_dispatched := GREATEST(
      COALESCE(v_item.received_quantity, 0),
      COALESCE(v_item.dispatched_quantity, 0) - disc.quantity
    );
    UPDATE public.tl_stock_request_items
    SET
      dispatched_quantity = v_new_dispatched,
      updated_at = NOW()
    WHERE id = v_item.id;
    v_new_item_status := 'pending_source_tl';
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

  IF v_resolution IN ('write_off', 'found_keep') THEN
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

  IF v_resolution = 'redeliver' THEN
    PERFORM public._tl_notify(
      v_header.company_id,
      v_header.requester_leader_id,
      'approved',
      'Shortage found — waiting to be sent again',
      'The dispatcher found the missing stock on ' || v_header.request_number ||
        '. It is back in their inventory and will be dispatched again.',
      v_header.id
    );
  ELSIF v_resolution = 'write_off_replace' THEN
    PERFORM public._tl_notify(
      v_header.company_id,
      v_header.requester_leader_id,
      'approved',
      'Shortage written off — replacement waiting to be sent',
      'The dispatcher will send a replacement on ' || v_header.request_number ||
        ' (same transfer). A new TDR is issued when they dispatch.',
      v_header.id
    );
  ELSIF v_resolution = 'found_keep' THEN
    PERFORM public._tl_notify(
      v_header.company_id,
      v_header.requester_leader_id,
      'rejected',
      'Shortage found — remaining will not be sent',
      'The dispatcher found the missing stock on ' || v_header.request_number ||
        ' but is keeping it. The transfer stays incomplete.',
      v_header.id
    );
  ELSIF v_new_item_status = 'pending_receipt' THEN
    PERFORM public._tl_notify(
      v_header.company_id,
      v_header.requester_leader_id,
      'approved',
      'Transfer updated — ready to receive',
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
    'request_number', v_header.request_number,
    'request_status', public._tl_refresh_request_status(v_header.id)
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.source_tl_dispatch_stock(
  p_request_id uuid,
  p_dispatched_quantity integer,
  p_signature_url text,
  p_signature_path text,
  p_shortfall_reason text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_proof_urls jsonb DEFAULT '[]'::jsonb,
  p_reuse_tdr text DEFAULT NULL
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
  v_already integer;
  v_remaining integer;
  v_new_dispatched integer;
  v_reason text;
  v_tdr text;
  v_tdr_kind text;
  v_is_redispatch boolean;
  v_disc_id uuid;
  v_disc_status text;
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

  v_already := COALESCE(v_item.dispatched_quantity, 0);
  v_remaining := v_approved - v_already;
  IF v_remaining <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Nothing left to dispatch for this item');
  END IF;

  IF p_dispatched_quantity IS NULL OR p_dispatched_quantity <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Dispatch quantity must be greater than 0');
  END IF;

  IF p_dispatched_quantity > v_remaining THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Cannot dispatch more than the remaining approved quantity',
      'approved_quantity', v_approved,
      'already_dispatched', v_already,
      'remaining_quantity', v_remaining
    );
  END IF;

  v_reason := NULLIF(btrim(COALESCE(p_shortfall_reason, '')), '');
  IF p_dispatched_quantity < v_remaining THEN
    IF v_reason IS NULL OR v_reason NOT IN (
      'insufficient_stock', 'reserved_for_team', 'damaged_on_hand', 'other'
    ) THEN
      RETURN json_build_object(
        'success', false,
        'error', 'A reason is required when dispatching less than the remaining approved quantity'
      );
    END IF;
  ELSE
    v_reason := NULL;
  END IF;

  v_is_redispatch := v_item.received_quantity IS NOT NULL;
  v_tdr_kind := 'dispatch';
  IF v_is_redispatch THEN
    SELECT status, id
    INTO v_disc_status, v_disc_id
    FROM public.tl_stock_request_discrepancies
    WHERE request_item_id = v_item.id
      AND status IN ('resolved_redeliver', 'resolved_write_off_replace')
    ORDER BY resolved_at DESC NULLS LAST, created_at DESC
    LIMIT 1;

    v_tdr_kind := CASE
      WHEN v_disc_status = 'resolved_write_off_replace' THEN 'replace'
      ELSE 'redeliver'
    END;
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
    CASE
      WHEN v_tdr_kind = 'replace' THEN 'TL transfer replacement dispatch ' || v_header.request_number
      WHEN v_is_redispatch THEN 'TL transfer redispatch ' || v_header.request_number
      ELSE 'TL transfer dispatch ' || v_header.request_number
    END
  );

  v_new_dispatched := v_already + p_dispatched_quantity;

  UPDATE public.tl_stock_request_items
  SET
    status = 'pending_receipt',
    dispatched_quantity = v_new_dispatched,
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

  IF v_is_redispatch THEN
    IF NULLIF(btrim(COALESCE(p_reuse_tdr, '')), '') IS NOT NULL THEN
      SELECT tdr_number INTO v_tdr
      FROM public.tl_stock_request_tdrs
      WHERE request_id = v_header.id
        AND tdr_number = btrim(p_reuse_tdr)
        AND kind = v_tdr_kind
      LIMIT 1;
    END IF;

    IF v_tdr IS NULL THEN
      v_tdr := public._tl_issue_tdr(v_header.id, v_tdr_kind, v_disc_id, v_source_id);
    ELSE
      UPDATE public.tl_stock_requests
      SET tdr_number = v_tdr, updated_at = NOW()
      WHERE id = v_header.id;
    END IF;
  ELSE
    v_tdr := public._tl_ensure_dispatch_tdr(v_header.id, v_source_id);
  END IF;

  PERFORM public._tl_record_tdr_dispatch(
    v_tdr, v_header.id, v_item.id, v_item.variant_id, p_dispatched_quantity
  );

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
    'dispatched_quantity', v_new_dispatched,
    'tdr_number', v_tdr,
    'tdr_kind', v_tdr_kind
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Dispatch now records the actual qty. Do not pre-fill the full shortage qty.
CREATE OR REPLACE FUNCTION public._tl_tdr_on_replace_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.source_tl_dispatch_stock(uuid, integer, text, text, text, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_tl_stock_request_discrepancy(uuid, text, text) TO authenticated;
