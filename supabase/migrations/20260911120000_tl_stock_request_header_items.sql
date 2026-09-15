-- Split TL transfers into header + item lines.
-- tl_stock_requests = one transfer. tl_stock_request_items = SKUs on it.
-- Discrepancies stay one row per short SKU, now pointing at header + item.

-- ---------------------------------------------------------------------------
-- 1) Items table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tl_stock_request_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES public.tl_stock_requests(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.variants(id) ON DELETE RESTRICT,
  requested_quantity integer NOT NULL CHECK (requested_quantity > 0),
  status text NOT NULL DEFAULT 'pending_admin' CHECK (status = ANY (ARRAY[
    'pending_admin'::text,
    'admin_approved'::text,
    'admin_rejected'::text,
    'pending_source_tl'::text,
    'source_tl_approved'::text,
    'source_tl_rejected'::text,
    'pending_receipt'::text,
    'completed'::text,
    'incomplete'::text,
    'cancelled'::text
  ])),
  admin_approved_quantity integer,
  dispatched_quantity integer,
  dispatch_shortfall_reason text,
  written_off_quantity integer NOT NULL DEFAULT 0 CHECK (written_off_quantity >= 0),
  received_quantity integer,
  receive_shortfall_reason text,
  receive_shortfall_notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT tl_stock_request_items_request_variant_key UNIQUE (request_id, variant_id),
  CONSTRAINT tl_stock_request_items_dispatched_quantity_check
    CHECK (dispatched_quantity IS NULL OR dispatched_quantity > 0),
  CONSTRAINT tl_stock_request_items_dispatch_shortfall_reason_check CHECK (
    dispatch_shortfall_reason IS NULL
    OR dispatch_shortfall_reason = ANY (ARRAY[
      'insufficient_stock'::text,
      'reserved_for_team'::text,
      'damaged_on_hand'::text,
      'other'::text
    ])
  ),
  CONSTRAINT tl_stock_request_items_receive_shortfall_reason_check CHECK (
    receive_shortfall_reason IS NULL
    OR receive_shortfall_reason = ANY (ARRAY[
      'missing_in_transit'::text,
      'damaged'::text,
      'wrong_item'::text,
      'other'::text
    ])
  )
);

CREATE INDEX IF NOT EXISTS idx_tl_stock_request_items_request
  ON public.tl_stock_request_items(request_id);

CREATE INDEX IF NOT EXISTS idx_tl_stock_request_items_status
  ON public.tl_stock_request_items(status);

ALTER TABLE public.tl_stock_request_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "TL transfer parties can view items" ON public.tl_stock_request_items;
CREATE POLICY "TL transfer parties can view items"
  ON public.tl_stock_request_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tl_stock_requests r
      WHERE r.id = tl_stock_request_items.request_id
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

GRANT SELECT ON public.tl_stock_request_items TO authenticated;

DROP TRIGGER IF EXISTS update_tl_stock_request_items_updated_at ON public.tl_stock_request_items;
CREATE TRIGGER update_tl_stock_request_items_updated_at
  BEFORE UPDATE ON public.tl_stock_request_items
  FOR EACH ROW EXECUTE FUNCTION public.update_tl_stock_requests_updated_at();

ALTER TABLE public.tl_stock_request_items
  ADD COLUMN IF NOT EXISTS legacy_row_id uuid;

-- ---------------------------------------------------------------------------
-- 2) Discrepancies: point at header + item
-- ---------------------------------------------------------------------------
ALTER TABLE public.tl_stock_request_discrepancies
  ADD COLUMN IF NOT EXISTS request_item_id uuid REFERENCES public.tl_stock_request_items(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_tl_stock_request_discrepancies_item
  ON public.tl_stock_request_discrepancies(request_item_id);

-- ---------------------------------------------------------------------------
-- 3) Collapse existing one-row-per-SKU transfers into header + items
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tl_stock_requests'
      AND column_name = 'variant_id'
  ) THEN
    INSERT INTO public.tl_stock_request_items (
      request_id,
      variant_id,
      requested_quantity,
      status,
      admin_approved_quantity,
      dispatched_quantity,
      dispatch_shortfall_reason,
      written_off_quantity,
      received_quantity,
      receive_shortfall_reason,
      receive_shortfall_notes,
      created_at,
      updated_at,
      legacy_row_id
    )
    SELECT
      r.id,
      r.variant_id,
      r.requested_quantity,
      r.status,
      r.admin_approved_quantity,
      r.dispatched_quantity,
      r.dispatch_shortfall_reason,
      COALESCE(r.written_off_quantity, 0),
      r.received_quantity,
      r.receive_shortfall_reason,
      r.receive_shortfall_notes,
      r.created_at,
      r.updated_at,
      r.id
    FROM public.tl_stock_requests r
    WHERE r.variant_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.tl_stock_request_items i
        WHERE i.legacy_row_id = r.id
      );

    CREATE TEMP TABLE tl_transfer_keepers ON COMMIT DROP AS
    SELECT DISTINCT ON (company_id, request_number)
      id AS keeper_id,
      company_id,
      request_number
    FROM public.tl_stock_requests
    ORDER BY company_id, request_number, created_at ASC, id ASC;

    UPDATE public.tl_stock_request_items i
    SET request_id = k.keeper_id
    FROM public.tl_stock_requests r
    JOIN tl_transfer_keepers k
      ON k.company_id = r.company_id
     AND k.request_number = r.request_number
    WHERE i.legacy_row_id = r.id
      AND i.request_id IS DISTINCT FROM k.keeper_id;

    UPDATE public.tl_stock_request_discrepancies d
    SET
      request_id = i.request_id,
      request_item_id = i.id
    FROM public.tl_stock_request_items i
    WHERE d.request_id = i.legacy_row_id;

    UPDATE public.inventory_transactions t
    SET reference_id = i.request_id
    FROM public.tl_stock_request_items i
    WHERE t.reference_type = 'tl_stock_request'
      AND t.reference_id = i.legacy_row_id
      AND t.reference_id IS DISTINCT FROM i.request_id;

    UPDATE public.notifications n
    SET reference_id = i.request_id
    FROM public.tl_stock_request_items i
    WHERE n.reference_type = 'tl_stock_request'
      AND n.reference_id = i.legacy_row_id
      AND n.reference_id IS DISTINCT FROM i.request_id;

    DELETE FROM public.tl_stock_requests r
    WHERE r.id NOT IN (SELECT keeper_id FROM tl_transfer_keepers);

  END IF;
END $$;

UPDATE public.tl_stock_request_items
SET status = 'pending_receipt'
WHERE status = 'source_tl_approved';

UPDATE public.tl_stock_request_discrepancies d
SET request_item_id = i.id
FROM public.tl_stock_request_items i
WHERE d.request_item_id IS NULL
  AND i.request_id = d.request_id
  AND i.variant_id = d.variant_id;

-- ---------------------------------------------------------------------------
-- 4) Header is document-only: drop SKU columns
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tl_stock_requests'
      AND column_name = 'variant_id'
  ) THEN
    ALTER TABLE public.tl_stock_requests
      DROP CONSTRAINT IF EXISTS tl_stock_requests_dispatched_quantity_check,
      DROP CONSTRAINT IF EXISTS tl_stock_requests_written_off_quantity_check,
      DROP CONSTRAINT IF EXISTS tl_stock_requests_dispatch_shortfall_reason_check,
      DROP CONSTRAINT IF EXISTS tl_stock_requests_receive_shortfall_reason_check,
      DROP CONSTRAINT IF EXISTS tl_stock_requests_requested_quantity_check,
      DROP CONSTRAINT IF EXISTS tl_stock_requests_variant_id_fkey;

    ALTER TABLE public.tl_stock_requests
      DROP COLUMN IF EXISTS variant_id,
      DROP COLUMN IF EXISTS requested_quantity,
      DROP COLUMN IF EXISTS admin_approved_quantity,
      DROP COLUMN IF EXISTS dispatched_quantity,
      DROP COLUMN IF EXISTS dispatch_shortfall_reason,
      DROP COLUMN IF EXISTS written_off_quantity,
      DROP COLUMN IF EXISTS received_quantity,
      DROP COLUMN IF EXISTS receive_shortfall_reason,
      DROP COLUMN IF EXISTS receive_shortfall_notes;
  END IF;
END $$;

ALTER TABLE public.tl_stock_request_items
  DROP COLUMN IF EXISTS legacy_row_id;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.tl_stock_requests'::regclass
      AND con.contype = 'u'
      AND pg_get_constraintdef(con.oid) ILIKE '%request_number%'
  LOOP
    EXECUTE format('ALTER TABLE public.tl_stock_requests DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.tl_stock_requests
  DROP CONSTRAINT IF EXISTS tl_stock_requests_company_request_number_key;

ALTER TABLE public.tl_stock_requests
  ADD CONSTRAINT tl_stock_requests_company_request_number_key
  UNIQUE (company_id, request_number);

COMMENT ON TABLE public.tl_stock_request_items IS
  'SKU lines on a TL-to-TL stock transfer. Header lives on tl_stock_requests.';

COMMENT ON COLUMN public.tl_stock_request_discrepancies.request_item_id IS
  'The transfer line that arrived short. request_id is the transfer header.';

-- ---------------------------------------------------------------------------
-- 5) Status rollup
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._tl_refresh_request_status(p_request_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT CASE
    WHEN bool_or(status IN ('admin_rejected')) THEN 'admin_rejected'
    WHEN bool_or(status IN ('source_tl_rejected')) THEN 'source_tl_rejected'
    WHEN bool_or(status IN ('cancelled')) THEN 'cancelled'
    WHEN bool_or(status = 'pending_admin') THEN 'pending_admin'
    WHEN bool_or(status IN ('pending_source_tl', 'admin_approved')) THEN 'pending_source_tl'
    WHEN bool_or(status IN ('pending_receipt', 'source_tl_approved')) THEN 'pending_receipt'
    WHEN bool_or(status = 'incomplete') THEN 'incomplete'
    WHEN bool_and(status = 'completed') THEN 'completed'
    ELSE 'incomplete'
  END
  INTO v_status
  FROM public.tl_stock_request_items
  WHERE request_id = p_request_id;

  IF v_status IS NULL THEN
    v_status := 'cancelled';
  END IF;

  UPDATE public.tl_stock_requests
  SET status = v_status, updated_at = NOW()
  WHERE id = p_request_id
    AND status IS DISTINCT FROM v_status;

  RETURN v_status;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6) Submit one transfer with many items
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.submit_tl_stock_request(uuid, uuid, uuid, integer);
DROP FUNCTION IF EXISTS public.submit_tl_stock_request(uuid, uuid, uuid, integer, text);
DROP FUNCTION IF EXISTS public.submit_tl_stock_request(uuid, uuid, uuid, integer, text, text);

CREATE OR REPLACE FUNCTION public.submit_tl_stock_request(
  p_company_id uuid,
  p_source_leader_id uuid,
  p_items jsonb,
  p_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_requester_id uuid;
  v_requester_role text;
  v_source_role text;
  v_request_number text;
  v_request_id uuid;
  v_date_str text;
  v_count integer;
  v_line record;
  v_item_count integer := 0;
BEGIN
  SELECT id, role INTO v_requester_id, v_requester_role
  FROM public.profiles
  WHERE id = auth.uid() AND company_id = p_company_id;

  IF v_requester_role IS DISTINCT FROM 'team_leader' THEN
    RETURN json_build_object('success', false, 'error', 'Only team leaders can submit stock requests');
  END IF;

  SELECT role INTO v_source_role
  FROM public.profiles
  WHERE id = p_source_leader_id AND company_id = p_company_id;

  IF v_source_role IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Source team leader not found');
  END IF;

  IF v_source_role IS DISTINCT FROM 'team_leader' THEN
    RETURN json_build_object('success', false, 'error', 'Source must be a team leader');
  END IF;

  IF v_requester_id = p_source_leader_id THEN
    RETURN json_build_object('success', false, 'error', 'Cannot request from yourself');
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) < 1 THEN
    RETURN json_build_object('success', false, 'error', 'Add at least one item');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tl_stock_request_number:' || p_company_id::text));

  v_date_str := to_char(NOW(), 'YYYYMMDD');
  SELECT COUNT(*) INTO v_count
  FROM public.tl_stock_requests
  WHERE company_id = p_company_id
    AND created_at::date = CURRENT_DATE;

  v_request_number := 'TLREQ-' || v_date_str || '-' || lpad((v_count + 1)::text, 4, '0');

  INSERT INTO public.tl_stock_requests (
    company_id, request_number, requester_leader_id, source_leader_id,
    status, requester_notes
  ) VALUES (
    p_company_id, v_request_number, v_requester_id, p_source_leader_id,
    'pending_admin', NULLIF(btrim(COALESCE(p_notes, '')), '')
  ) RETURNING id INTO v_request_id;

  FOR v_line IN
    SELECT DISTINCT ON (x.variant_id)
      x.variant_id,
      x.quantity
    FROM jsonb_to_recordset(p_items) AS x(variant_id uuid, quantity integer)
    ORDER BY x.variant_id
  LOOP
    IF v_line.variant_id IS NULL OR COALESCE(v_line.quantity, 0) <= 0 THEN
      RAISE EXCEPTION 'Each item needs a variant and quantity greater than 0';
    END IF;

    INSERT INTO public.tl_stock_request_items (
      request_id, variant_id, requested_quantity, status
    ) VALUES (
      v_request_id, v_line.variant_id, v_line.quantity, 'pending_admin'
    );
    v_item_count := v_item_count + 1;
  END LOOP;

  IF v_item_count < 1 THEN
    RAISE EXCEPTION 'Add at least one item';
  END IF;

  INSERT INTO public.notifications (
    company_id, user_id, notification_type, title, message, reference_type, reference_id
  )
  SELECT
    p_company_id,
    profiles.id,
    'stock_request_created',
    'New TL stock transfer',
    'Team Leader ' || (SELECT full_name FROM public.profiles WHERE id = v_requester_id) ||
      ' requests stock from ' || (SELECT full_name FROM public.profiles WHERE id = p_source_leader_id),
    'tl_stock_request',
    v_request_id
  FROM public.profiles
  WHERE company_id = p_company_id
    AND role IN ('admin', 'super_admin')
    AND status = 'active';

  RETURN json_build_object(
    'success', true,
    'request_id', v_request_id,
    'request_number', v_request_number,
    'item_count', v_item_count
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 7) Admin approve / reject (p_request_id = item id)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_approve_tl_request(
  p_request_id uuid,
  p_approved_quantity integer,
  p_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin_id uuid;
  v_admin_role text;
  v_item record;
  v_header record;
  v_available_quantity integer;
  v_requester_name text;
  v_header_status text;
BEGIN
  SELECT id, role INTO v_admin_id, v_admin_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_admin_role NOT IN ('admin', 'super_admin') THEN
    RETURN json_build_object('success', false, 'error', 'Only admins can approve requests');
  END IF;

  SELECT * INTO v_item FROM public.tl_stock_request_items WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Request item not found');
  END IF;

  SELECT * INTO v_header FROM public.tl_stock_requests WHERE id = v_item.request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Request not found');
  END IF;

  IF v_item.status IS DISTINCT FROM 'pending_admin' THEN
    RETURN json_build_object('success', false, 'error', 'Request is not pending admin approval');
  END IF;

  IF p_approved_quantity <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Approved quantity must be greater than 0');
  END IF;

  IF p_approved_quantity > v_item.requested_quantity THEN
    RETURN json_build_object('success', false, 'error', 'Approved quantity cannot exceed requested quantity');
  END IF;

  SELECT COALESCE(stock, 0) INTO v_available_quantity
  FROM public.agent_inventory
  WHERE agent_id = v_header.source_leader_id
    AND variant_id = v_item.variant_id;

  IF COALESCE(v_available_quantity, 0) < p_approved_quantity THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Insufficient stock',
      'available_quantity', COALESCE(v_available_quantity, 0),
      'approved_quantity', p_approved_quantity
    );
  END IF;

  UPDATE public.tl_stock_request_items
  SET
    status = 'pending_source_tl',
    admin_approved_quantity = p_approved_quantity,
    updated_at = NOW()
  WHERE id = v_item.id;

  UPDATE public.tl_stock_requests
  SET
    admin_approved_at = COALESCE(admin_approved_at, NOW()),
    admin_approved_by = COALESCE(admin_approved_by, v_admin_id),
    admin_notes = COALESCE(NULLIF(btrim(COALESCE(p_notes, '')), ''), admin_notes)
  WHERE id = v_header.id;

  v_header_status := public._tl_refresh_request_status(v_header.id);

  IF v_header_status = 'pending_source_tl' THEN
    SELECT full_name INTO v_requester_name
    FROM public.profiles WHERE id = v_header.requester_leader_id;

    PERFORM public._tl_notify(
      v_header.company_id,
      v_header.source_leader_id,
      'approved',
      'Stock request approved — ready to dispatch',
      'Admin approved a stock request from ' || v_requester_name || '. Please dispatch.',
      v_header.id
    );
  END IF;

  RETURN json_build_object(
    'success', true,
    'request_id', v_header.id,
    'item_id', v_item.id,
    'approved_quantity', p_approved_quantity,
    'available_quantity', v_available_quantity
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reject_tl_request(
  p_request_id uuid,
  p_reason text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin_id uuid;
  v_admin_role text;
  v_header_id uuid;
  v_header record;
BEGIN
  SELECT id, role INTO v_admin_id, v_admin_role
  FROM public.profiles WHERE id = auth.uid();

  IF v_admin_role NOT IN ('admin', 'super_admin') THEN
    RETURN json_build_object('success', false, 'error', 'Only admins can reject requests');
  END IF;

  SELECT request_id INTO v_header_id FROM public.tl_stock_request_items WHERE id = p_request_id;
  IF v_header_id IS NULL THEN
    v_header_id := p_request_id;
  END IF;

  SELECT * INTO v_header FROM public.tl_stock_requests WHERE id = v_header_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Request not found');
  END IF;

  IF v_header.status = 'admin_rejected' THEN
    RETURN json_build_object('success', true, 'request_id', v_header.id);
  END IF;

  IF v_header.status IS DISTINCT FROM 'pending_admin' THEN
    RETURN json_build_object('success', false, 'error', 'Request is not pending admin approval');
  END IF;

  UPDATE public.tl_stock_request_items
  SET status = 'admin_rejected', updated_at = NOW()
  WHERE request_id = v_header.id
    AND status = 'pending_admin';

  UPDATE public.tl_stock_requests
  SET
    status = 'admin_rejected',
    rejected_at = NOW(),
    rejected_by = v_admin_id,
    rejection_reason = p_reason
  WHERE id = v_header.id;

  PERFORM public._tl_notify(
    v_header.company_id,
    v_header.requester_leader_id,
    'rejected',
    'Stock transfer rejected',
    'Your stock request ' || v_header.request_number || ' was rejected. Reason: ' || p_reason,
    v_header.id
  );

  RETURN json_build_object('success', true, 'request_id', v_header.id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 8) Dispatch (p_request_id = item id)
-- ---------------------------------------------------------------------------
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

  PERFORM public._tl_refresh_request_status(v_header.id);

  PERFORM public._tl_notify(
    v_header.company_id,
    v_header.requester_leader_id,
    'approved',
    'Stock dispatched — ready to receive',
    'Your stock request ' || v_header.request_number || ' was dispatched (' ||
      p_dispatched_quantity || ' units). Sign to receive.',
    v_header.id
  );

  RETURN json_build_object(
    'success', true,
    'request_id', v_header.id,
    'item_id', v_item.id,
    'dispatched_quantity', p_dispatched_quantity
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.source_tl_approve_request(
  p_request_id uuid,
  p_signature_url text,
  p_signature_path text,
  p_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_item record;
BEGIN
  SELECT * INTO v_item
  FROM public.tl_stock_request_items
  WHERE id = p_request_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Request item not found');
  END IF;

  RETURN public.source_tl_dispatch_stock(
    p_request_id,
    COALESCE(v_item.admin_approved_quantity, 0),
    p_signature_url,
    p_signature_path,
    NULL,
    p_notes
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.source_tl_reject_request(
  p_request_id uuid,
  p_reason text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_source_id uuid;
  v_source_role text;
  v_header_id uuid;
  v_header record;
  v_requester_name text;
  v_source_name text;
BEGIN
  SELECT id, role INTO v_source_id, v_source_role
  FROM public.profiles WHERE id = auth.uid();

  IF v_source_role IS DISTINCT FROM 'team_leader' THEN
    RETURN json_build_object('success', false, 'error', 'Only team leaders can reject requests');
  END IF;

  SELECT request_id INTO v_header_id FROM public.tl_stock_request_items WHERE id = p_request_id;
  IF v_header_id IS NULL THEN
    v_header_id := p_request_id;
  END IF;

  SELECT * INTO v_header FROM public.tl_stock_requests WHERE id = v_header_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Request not found');
  END IF;

  IF v_header.status = 'source_tl_rejected' THEN
    RETURN json_build_object('success', true, 'request_id', v_header.id);
  END IF;

  IF v_header.status NOT IN ('pending_source_tl', 'admin_approved') THEN
    RETURN json_build_object('success', false, 'error', 'Request is not pending your dispatch');
  END IF;

  IF v_header.source_leader_id IS DISTINCT FROM v_source_id THEN
    RETURN json_build_object('success', false, 'error', 'You are not the source team leader for this request');
  END IF;

  UPDATE public.tl_stock_request_items
  SET status = 'source_tl_rejected', updated_at = NOW()
  WHERE request_id = v_header.id
    AND status IN ('pending_source_tl', 'admin_approved');

  UPDATE public.tl_stock_requests
  SET
    status = 'source_tl_rejected',
    rejected_at = NOW(),
    rejected_by = v_source_id,
    rejection_reason = p_reason
  WHERE id = v_header.id;

  SELECT full_name INTO v_requester_name FROM public.profiles WHERE id = v_header.requester_leader_id;
  SELECT full_name INTO v_source_name FROM public.profiles WHERE id = v_source_id;

  PERFORM public._tl_notify(
    v_header.company_id,
    v_header.requester_leader_id,
    'rejected',
    'Stock transfer rejected',
    v_source_name || ' rejected your stock request ' || v_header.request_number || '. Reason: ' || p_reason,
    v_header.id
  );

  INSERT INTO public.notifications (
    company_id, user_id, notification_type, title, message, reference_type, reference_id
  )
  SELECT
    v_header.company_id,
    profiles.id,
    'stock_request_rejected',
    'TL stock transfer rejected',
    v_source_name || ' rejected stock request ' || v_header.request_number || ' from ' || v_requester_name,
    'tl_stock_request',
    v_header.id
  FROM public.profiles
  WHERE company_id = v_header.company_id
    AND role IN ('admin', 'super_admin')
    AND status = 'active';

  RETURN json_build_object('success', true, 'request_id', v_header.id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 9) Receive (p_request_id = item id)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 10) Resolve shortage against the item line
-- ---------------------------------------------------------------------------
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
      'Transfer ready to receive again',
      'Shortage on ' || v_header.request_number || ' was resolved. Please receive the remaining stock.',
      v_header.id
    );
  END IF;

  RETURN json_build_object(
    'success', true,
    'discrepancy_id', p_discrepancy_id,
    'resolution', v_resolution,
    'request_status', public._tl_refresh_request_status(v_header.id)
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_tl_stock_request(uuid, uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_tl_request(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reject_tl_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.source_tl_dispatch_stock(uuid, integer, text, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.source_tl_approve_request(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.source_tl_reject_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.requester_tl_receive_stock(uuid, text, text, integer, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_tl_stock_request_discrepancy(uuid, text, text) TO authenticated;

-- Roll up any migrated headers
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.tl_stock_requests LOOP
    PERFORM public._tl_refresh_request_status(r.id);
  END LOOP;
END $$;
