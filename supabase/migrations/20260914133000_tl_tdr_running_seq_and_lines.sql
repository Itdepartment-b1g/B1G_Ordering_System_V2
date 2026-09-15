-- TDR numbers keep the date but the sequence does not reset each day:
-- TDR-20260914-0002, then TDR-20260915-0003.
-- Each TDR stores dispatched / received qty per item (PO DR style).

CREATE TABLE IF NOT EXISTS public.tl_stock_request_tdr_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  tdr_id uuid NOT NULL REFERENCES public.tl_stock_request_tdrs(id) ON DELETE CASCADE,
  request_item_id uuid NOT NULL REFERENCES public.tl_stock_request_items(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.variants(id) ON DELETE RESTRICT,
  dispatched_quantity integer NOT NULL CHECK (dispatched_quantity > 0),
  received_quantity integer NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT tl_stock_request_tdr_items_tdr_item_key UNIQUE (tdr_id, request_item_id)
);

CREATE INDEX IF NOT EXISTS idx_tl_stock_request_tdr_items_item
  ON public.tl_stock_request_tdr_items(request_item_id);

ALTER TABLE public.tl_stock_request_tdr_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "TL transfer parties can view TDR items" ON public.tl_stock_request_tdr_items;
CREATE POLICY "TL transfer parties can view TDR items"
  ON public.tl_stock_request_tdr_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tl_stock_request_tdrs t
      JOIN public.tl_stock_requests r ON r.id = t.request_id
      WHERE t.id = tl_stock_request_tdr_items.tdr_id
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

GRANT SELECT ON public.tl_stock_request_tdr_items TO authenticated;

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
  v_seq integer;
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

  SELECT COALESCE(MAX(split_part(tdr_number, '-', 3)::integer), 0)
  INTO v_seq
  FROM public.tl_stock_request_tdrs
  WHERE company_id = v_company_id
    AND tdr_number ~ '^TDR-[0-9]{8}-[0-9]+$';

  v_date_str := to_char(NOW(), 'YYYYMMDD');
  v_tdr := 'TDR-' || v_date_str || '-' || lpad((v_seq + 1)::text, 4, '0');

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

CREATE OR REPLACE FUNCTION public._tl_record_tdr_dispatch(
  p_tdr_number text,
  p_request_id uuid,
  p_request_item_id uuid,
  p_variant_id uuid,
  p_quantity integer
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_tdr_id uuid;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 OR NULLIF(btrim(COALESCE(p_tdr_number, '')), '') IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO v_tdr_id
  FROM public.tl_stock_request_tdrs
  WHERE request_id = p_request_id
    AND tdr_number = btrim(p_tdr_number)
  LIMIT 1;

  IF v_tdr_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.tl_stock_request_tdr_items (
    tdr_id, request_item_id, variant_id, dispatched_quantity, received_quantity
  ) VALUES (
    v_tdr_id, p_request_item_id, p_variant_id, p_quantity, 0
  )
  ON CONFLICT (tdr_id, request_item_id)
  DO UPDATE SET
    dispatched_quantity = public.tl_stock_request_tdr_items.dispatched_quantity + EXCLUDED.dispatched_quantity,
    updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public._tl_apply_tdr_receive(
  p_request_item_id uuid,
  p_quantity integer
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_left integer;
  v_apply integer;
  r record;
BEGIN
  v_left := COALESCE(p_quantity, 0);
  IF v_left <= 0 THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT ti.id, ti.dispatched_quantity, ti.received_quantity
    FROM public.tl_stock_request_tdr_items ti
    JOIN public.tl_stock_request_tdrs t ON t.id = ti.tdr_id
    WHERE ti.request_item_id = p_request_item_id
      AND ti.received_quantity < ti.dispatched_quantity
    ORDER BY t.created_at ASC, ti.created_at ASC
  LOOP
    EXIT WHEN v_left <= 0;
    v_apply := LEAST(v_left, r.dispatched_quantity - r.received_quantity);
    UPDATE public.tl_stock_request_tdr_items
    SET received_quantity = received_quantity + v_apply,
        updated_at = NOW()
    WHERE id = r.id;
    v_left := v_left - v_apply;
  END LOOP;
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
  v_is_redispatch boolean;
  v_disc_id uuid;
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
    CASE WHEN v_item.received_quantity IS NOT NULL
      THEN 'TL transfer redispatch ' || v_header.request_number
      ELSE 'TL transfer dispatch ' || v_header.request_number
    END
  );

  v_new_dispatched := v_already + p_dispatched_quantity;
  v_is_redispatch := v_item.received_quantity IS NOT NULL;

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
        AND kind = 'redeliver'
      LIMIT 1;
    END IF;

    IF v_tdr IS NULL THEN
      SELECT id INTO v_disc_id
      FROM public.tl_stock_request_discrepancies
      WHERE request_item_id = v_item.id
        AND status = 'resolved_redeliver'
      ORDER BY resolved_at DESC NULLS LAST, created_at DESC
      LIMIT 1;

      v_tdr := public._tl_issue_tdr(v_header.id, 'redeliver', v_disc_id, v_source_id);
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
    'tdr_number', v_tdr
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.requester_tl_receive_stock(
  p_request_id uuid,
  p_signature_url text,
  p_signature_path text,
  p_received_quantity integer DEFAULT NULL,
  p_shortfall_reason text DEFAULT NULL,
  p_shortfall_notes text DEFAULT NULL,
  p_proof_urls jsonb DEFAULT '[]'::jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_requester_id uuid;
  v_requester_role text;
  v_item record;
  v_header record;
  v_dispatched integer;
  v_already_received integer;
  v_written_off integer;
  v_remaining integer;
  v_recv integer;
  v_shortfall integer;
  v_reason text;
  v_notes text;
  v_legacy boolean;
  v_source_name text;
  v_requester_name text;
  v_new_status text;
  v_header_status text;
BEGIN
  SELECT id, role INTO v_requester_id, v_requester_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_requester_role IS DISTINCT FROM 'team_leader' THEN
    RETURN json_build_object('success', false, 'error', 'Only team leaders can receive stock');
  END IF;

  IF p_signature_url IS NULL OR btrim(p_signature_url) = ''
     OR p_signature_path IS NULL OR btrim(p_signature_path) = '' THEN
    RETURN json_build_object('success', false, 'error', 'Receiver signature is required');
  END IF;

  IF p_proof_urls IS NULL
     OR jsonb_typeof(p_proof_urls) <> 'array'
     OR jsonb_array_length(p_proof_urls) < 1 THEN
    RETURN json_build_object('success', false, 'error', 'At least one receive package photo is required');
  END IF;

  SELECT * INTO v_item FROM public.tl_stock_request_items WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Request item not found');
  END IF;

  SELECT * INTO v_header FROM public.tl_stock_requests WHERE id = v_item.request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Request not found');
  END IF;

  IF v_item.status IS DISTINCT FROM 'pending_receipt' THEN
    RETURN json_build_object('success', false, 'error', 'Request is not pending receipt');
  END IF;

  IF v_header.requester_leader_id IS DISTINCT FROM v_requester_id THEN
    RETURN json_build_object('success', false, 'error', 'You are not the requester for this request');
  END IF;

  v_legacy := v_item.dispatched_quantity IS NULL;
  v_dispatched := COALESCE(v_item.dispatched_quantity, v_item.admin_approved_quantity, 0);
  v_already_received := COALESCE(v_item.received_quantity, 0);
  v_written_off := COALESCE(v_item.written_off_quantity, 0);
  v_remaining := v_dispatched - v_already_received - v_written_off;

  IF v_remaining <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Nothing left to receive on this transfer');
  END IF;

  v_recv := COALESCE(p_received_quantity, v_remaining);
  IF v_recv < 0 THEN
    RETURN json_build_object('success', false, 'error', 'Received quantity cannot be negative');
  END IF;
  IF v_recv > v_remaining THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Received quantity cannot exceed remaining dispatched quantity',
      'remaining', v_remaining
    );
  END IF;

  v_shortfall := v_remaining - v_recv;
  v_reason := NULLIF(btrim(COALESCE(p_shortfall_reason, '')), '');
  v_notes := NULLIF(btrim(COALESCE(p_shortfall_notes, '')), '');

  IF v_shortfall > 0 THEN
    IF v_reason IS NULL OR v_reason NOT IN (
      'missing_in_transit', 'damaged', 'wrong_item', 'other'
    ) THEN
      RETURN json_build_object(
        'success', false,
        'error', 'A shortfall reason is required when receiving less than dispatched'
      );
    END IF;
    IF v_notes IS NULL THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Notes are required when receiving less than dispatched'
      );
    END IF;
  ELSE
    v_reason := NULL;
  END IF;

  IF v_legacy AND v_recv > 0 THEN
    PERFORM public._tl_debit_agent_inventory(
      v_header.source_leader_id,
      v_item.variant_id,
      v_recv
    );
  END IF;

  IF v_recv > 0 THEN
    PERFORM public._tl_credit_agent_inventory(
      v_requester_id,
      v_item.variant_id,
      v_header.company_id,
      v_recv,
      v_header.source_leader_id
    );

    INSERT INTO public.inventory_transactions (
      company_id, variant_id, transaction_type, quantity,
      from_location, to_location, reference_type, reference_id, performed_by, notes
    ) VALUES (
      v_header.company_id,
      v_item.variant_id,
      'tl_stock_transfer_in',
      v_recv,
      CASE WHEN v_legacy
        THEN 'agent_inventory:' || v_header.source_leader_id::text
        ELSE 'in_transit:' || v_header.id::text
      END,
      'agent_inventory:' || v_requester_id::text,
      'tl_stock_request',
      v_header.id,
      v_requester_id,
      'TL transfer receive ' || v_header.request_number
    );

    PERFORM public._tl_apply_tdr_receive(v_item.id, v_recv);
  END IF;

  IF v_shortfall > 0 THEN
    INSERT INTO public.tl_stock_request_discrepancies (
      company_id, request_id, request_item_id, variant_id, quantity, reason,
      reporter_notes, status, reported_by
    ) VALUES (
      v_header.company_id,
      v_header.id,
      v_item.id,
      v_item.variant_id,
      v_shortfall,
      v_reason,
      v_notes,
      'open',
      v_requester_id
    );
    v_new_status := 'incomplete';
  ELSE
    v_new_status := 'completed';
  END IF;

  UPDATE public.tl_stock_request_items
  SET
    status = v_new_status,
    received_quantity = v_already_received + v_recv,
    receive_shortfall_reason = CASE WHEN v_shortfall > 0 THEN v_reason ELSE receive_shortfall_reason END,
    receive_shortfall_notes = CASE WHEN v_shortfall > 0 THEN v_notes ELSE receive_shortfall_notes END,
    dispatched_quantity = COALESCE(dispatched_quantity, v_dispatched),
    updated_at = NOW()
  WHERE id = v_item.id;

  UPDATE public.tl_stock_requests
  SET
    received_at = NOW(),
    received_by = v_requester_id,
    received_signature_url = p_signature_url,
    received_signature_path = p_signature_path,
    receive_proof_urls = p_proof_urls
  WHERE id = v_header.id;

  v_header_status := public._tl_refresh_request_status(v_header.id);

  SELECT full_name INTO v_source_name FROM public.profiles WHERE id = v_header.source_leader_id;
  SELECT full_name INTO v_requester_name FROM public.profiles WHERE id = v_requester_id;

  IF v_shortfall > 0 THEN
    PERFORM public._tl_notify(
      v_header.company_id,
      v_header.source_leader_id,
      'system',
      'Transfer shortage to investigate',
      v_requester_name || ' received ' || v_recv || ' of ' || v_remaining ||
        ' units on ' || v_header.request_number || '. Investigate the missing stock.',
      v_header.id
    );
  ELSE
    PERFORM public._tl_notify(
      v_header.company_id,
      v_header.source_leader_id,
      'system',
      'Stock transfer completed',
      v_requester_name || ' received ' || v_recv || ' units from ' || v_header.request_number,
      v_header.id
    );
  END IF;

  INSERT INTO public.notifications (
    company_id, user_id, notification_type, title, message, reference_type, reference_id
  )
  SELECT
    v_header.company_id,
    profiles.id,
    'system_message',
    CASE WHEN v_shortfall > 0 THEN 'TL stock transfer incomplete' ELSE 'TL stock transfer completed' END,
    'Stock request ' || v_header.request_number || ': ' || v_recv || ' units received by ' ||
      v_requester_name || ' from ' || v_source_name,
    'tl_stock_request',
    v_header.id
  FROM public.profiles
  WHERE company_id = v_header.company_id
    AND role IN ('admin', 'super_admin')
    AND status = 'active';

  RETURN json_build_object(
    'success', true,
    'request_id', v_header.id,
    'item_id', v_item.id,
    'transferred_quantity', v_recv,
    'shortfall_quantity', v_shortfall,
    'status', v_new_status
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public._tl_tdr_on_replace_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_item_id uuid;
  v_variant_id uuid;
  v_qty integer;
BEGIN
  IF NEW.kind IS DISTINCT FROM 'replace' OR NEW.discrepancy_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT request_item_id, variant_id, quantity
  INTO v_item_id, v_variant_id, v_qty
  FROM public.tl_stock_request_discrepancies
  WHERE id = NEW.discrepancy_id;

  IF v_item_id IS NULL THEN
    SELECT id, variant_id
    INTO v_item_id, v_variant_id
    FROM public.tl_stock_request_items
    WHERE request_id = NEW.request_id
      AND variant_id = v_variant_id
    LIMIT 1;
  END IF;

  IF v_item_id IS NULL OR COALESCE(v_qty, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.tl_stock_request_tdr_items (
    tdr_id, request_item_id, variant_id, dispatched_quantity, received_quantity
  ) VALUES (
    NEW.id, v_item_id, v_variant_id, v_qty, 0
  )
  ON CONFLICT (tdr_id, request_item_id)
  DO UPDATE SET
    dispatched_quantity = public.tl_stock_request_tdr_items.dispatched_quantity + EXCLUDED.dispatched_quantity,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tl_tdr_replace_line ON public.tl_stock_request_tdrs;
CREATE TRIGGER trg_tl_tdr_replace_line
AFTER INSERT ON public.tl_stock_request_tdrs
FOR EACH ROW
WHEN (NEW.kind = 'replace')
EXECUTE PROCEDURE public._tl_tdr_on_replace_insert();

INSERT INTO public.tl_stock_request_tdr_items (
  tdr_id, request_item_id, variant_id, dispatched_quantity, received_quantity
)
SELECT
  mapped.tdr_id,
  mapped.request_item_id,
  mapped.variant_id,
  SUM(mapped.quantity)::integer,
  0
FROM (
  SELECT
    tdr.id AS tdr_id,
    i.id AS request_item_id,
    tx.variant_id,
    tx.quantity
  FROM public.inventory_transactions tx
  JOIN public.tl_stock_request_items i
    ON i.request_id = tx.reference_id
   AND i.variant_id = tx.variant_id
  JOIN LATERAL (
    SELECT t.id
    FROM public.tl_stock_request_tdrs t
    WHERE t.request_id = tx.reference_id
    ORDER BY abs(extract(epoch from (t.created_at - tx.created_at)))
    LIMIT 1
  ) tdr ON true
  WHERE tx.reference_type = 'tl_stock_request'
    AND tx.transaction_type = 'tl_stock_transfer_out'
    AND COALESCE(tx.notes, '') NOT ILIKE '%found — returned%'
) mapped
GROUP BY mapped.tdr_id, mapped.request_item_id, mapped.variant_id
ON CONFLICT (tdr_id, request_item_id)
DO UPDATE SET
  dispatched_quantity = GREATEST(
    public.tl_stock_request_tdr_items.dispatched_quantity,
    EXCLUDED.dispatched_quantity
  );

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT i.id AS item_id, tx.quantity
    FROM public.inventory_transactions tx
    JOIN public.tl_stock_request_items i
      ON i.request_id = tx.reference_id
     AND i.variant_id = tx.variant_id
    WHERE tx.reference_type = 'tl_stock_request'
      AND tx.transaction_type = 'tl_stock_transfer_in'
      AND COALESCE(tx.notes, '') ILIKE 'TL transfer receive%'
    ORDER BY tx.created_at ASC, tx.id ASC
  LOOP
    PERFORM public._tl_apply_tdr_receive(r.item_id, r.quantity);
  END LOOP;
END $$;

INSERT INTO public.tl_stock_request_tdr_items (
  tdr_id, request_item_id, variant_id, dispatched_quantity, received_quantity
)
SELECT
  first_tdr.id,
  i.id,
  i.variant_id,
  GREATEST(COALESCE(i.dispatched_quantity, 0), 1),
  LEAST(COALESCE(i.received_quantity, 0), GREATEST(COALESCE(i.dispatched_quantity, 0), 1))
FROM public.tl_stock_request_items i
JOIN LATERAL (
  SELECT t.id
  FROM public.tl_stock_request_tdrs t
  WHERE t.request_id = i.request_id
  ORDER BY t.created_at ASC
  LIMIT 1
) first_tdr ON true
WHERE COALESCE(i.dispatched_quantity, 0) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.tl_stock_request_tdr_items ti
    WHERE ti.request_item_id = i.id
  )
ON CONFLICT (tdr_id, request_item_id) DO NOTHING;

GRANT EXECUTE ON FUNCTION public.source_tl_dispatch_stock(uuid, integer, text, text, text, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.requester_tl_receive_stock(uuid, text, text, integer, text, text, jsonb) TO authenticated;
