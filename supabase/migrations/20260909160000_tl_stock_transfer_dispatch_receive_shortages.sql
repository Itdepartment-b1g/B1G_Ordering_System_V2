-- TL → TL transfer: deduct on dispatch, PO-style receive shortfall, incomplete +
-- dispatcher-owned investigation (not warehouse delivery shortages).

-- ---------------------------------------------------------------------------
-- 1) Request columns + incomplete status
-- ---------------------------------------------------------------------------
ALTER TABLE public.tl_stock_requests
  ADD COLUMN IF NOT EXISTS requester_notes text,
  ADD COLUMN IF NOT EXISTS dispatched_quantity integer,
  ADD COLUMN IF NOT EXISTS dispatched_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatch_shortfall_reason text,
  ADD COLUMN IF NOT EXISTS written_off_quantity integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS receive_shortfall_reason text,
  ADD COLUMN IF NOT EXISTS receive_shortfall_notes text,
  ADD COLUMN IF NOT EXISTS dispatch_proof_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS receive_proof_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.tl_stock_requests
  DROP CONSTRAINT IF EXISTS tl_stock_requests_status_check;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.tl_stock_requests'::regclass
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%status%'
      AND pg_get_constraintdef(con.oid) ILIKE '%pending_admin%'
  LOOP
    EXECUTE format('ALTER TABLE public.tl_stock_requests DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.tl_stock_requests
  ADD CONSTRAINT tl_stock_requests_status_check CHECK (status = ANY (ARRAY[
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
  ]));

ALTER TABLE public.tl_stock_requests
  DROP CONSTRAINT IF EXISTS tl_stock_requests_dispatched_quantity_check;

ALTER TABLE public.tl_stock_requests
  ADD CONSTRAINT tl_stock_requests_dispatched_quantity_check
  CHECK (dispatched_quantity IS NULL OR dispatched_quantity > 0);

ALTER TABLE public.tl_stock_requests
  DROP CONSTRAINT IF EXISTS tl_stock_requests_written_off_quantity_check;

ALTER TABLE public.tl_stock_requests
  ADD CONSTRAINT tl_stock_requests_written_off_quantity_check
  CHECK (written_off_quantity >= 0);

ALTER TABLE public.tl_stock_requests
  DROP CONSTRAINT IF EXISTS tl_stock_requests_dispatch_shortfall_reason_check;

ALTER TABLE public.tl_stock_requests
  ADD CONSTRAINT tl_stock_requests_dispatch_shortfall_reason_check
  CHECK (
    dispatch_shortfall_reason IS NULL
    OR dispatch_shortfall_reason = ANY (ARRAY[
      'insufficient_stock'::text,
      'reserved_for_team'::text,
      'damaged_on_hand'::text,
      'other'::text
    ])
  );

ALTER TABLE public.tl_stock_requests
  DROP CONSTRAINT IF EXISTS tl_stock_requests_receive_shortfall_reason_check;

ALTER TABLE public.tl_stock_requests
  ADD CONSTRAINT tl_stock_requests_receive_shortfall_reason_check
  CHECK (
    receive_shortfall_reason IS NULL
    OR receive_shortfall_reason = ANY (ARRAY[
      'missing_in_transit'::text,
      'damaged'::text,
      'wrong_item'::text,
      'other'::text
    ])
  );

COMMENT ON COLUMN public.tl_stock_requests.dispatched_quantity IS
  'Qty the source TL released. Deducted from source agent_inventory at dispatch.';
COMMENT ON COLUMN public.tl_stock_requests.written_off_quantity IS
  'Receive-shortfall qty confirmed lost by the dispatcher. Never credited to requester.';
COMMENT ON COLUMN public.tl_stock_requests.dispatch_proof_urls IS
  'Package photos taken by the dispatching team leader. Signature is stored on source_tl_signature_url.';
COMMENT ON COLUMN public.tl_stock_requests.receive_proof_urls IS
  'Package photos taken by the receiving team leader. Signature is stored on received_signature_url.';

-- Allow one transfer number to cover multiple item rows.
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
      AND array_length(con.conkey, 1) = 1
  LOOP
    EXECUTE format('ALTER TABLE public.tl_stock_requests DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_tl_stock_requests_request_number
  ON public.tl_stock_requests(request_number);

-- ---------------------------------------------------------------------------
-- 2) Discrepancy table (dispatcher investigation)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tl_stock_request_discrepancies (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES public.tl_stock_requests(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.variants(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  reason text NOT NULL CHECK (
    reason = ANY (ARRAY[
      'missing_in_transit'::text,
      'damaged'::text,
      'wrong_item'::text,
      'other'::text
    ])
  ),
  reporter_notes text,
  status text NOT NULL DEFAULT 'open' CHECK (
    status = ANY (ARRAY[
      'open'::text,
      'resolved_redeliver'::text,
      'resolved_write_off'::text,
      'resolved_write_off_replace'::text,
      'cancelled'::text
    ])
  ),
  reported_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tl_stock_request_discrepancies_company_status
  ON public.tl_stock_request_discrepancies(company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tl_stock_request_discrepancies_request
  ON public.tl_stock_request_discrepancies(request_id);

COMMENT ON TABLE public.tl_stock_request_discrepancies IS
  'Requester-reported TL transfer shortfalls. Investigated by the dispatching team leader.';

ALTER TABLE public.tl_stock_request_discrepancies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "TL transfer parties can view discrepancies"
  ON public.tl_stock_request_discrepancies;
CREATE POLICY "TL transfer parties can view discrepancies"
  ON public.tl_stock_request_discrepancies
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tl_stock_requests r
      WHERE r.id = tl_stock_request_discrepancies.request_id
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

GRANT SELECT ON public.tl_stock_request_discrepancies TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Inventory transaction types
-- ---------------------------------------------------------------------------
ALTER TABLE public.inventory_transactions
  DROP CONSTRAINT IF EXISTS inventory_transactions_transaction_type_check;

ALTER TABLE public.inventory_transactions
  ADD CONSTRAINT inventory_transactions_transaction_type_check
  CHECK (transaction_type = ANY (ARRAY[
    'purchase_order_received'::text,
    'allocated_to_agent'::text,
    'order_fulfilled'::text,
    'adjustment'::text,
    'return'::text,
    'return_to_main'::text,
    'warehouse_transfer_out'::text,
    'warehouse_transfer_in'::text,
    'warehouse_allocate_to_sub'::text,
    'warehouse_return_from_sub'::text,
    'rebate_return_in'::text,
    'rebate_return_disposed'::text,
    'warehouse_stock_receive'::text,
    'warehouse_return_in'::text,
    'warehouse_return_disposed'::text,
    'internal_stock_request_reserve'::text,
    'internal_stock_request_receive'::text,
    'internal_stock_request_short_release'::text,
    'client_return_out'::text,
    'client_return_cancel_in'::text,
    'client_return_in'::text,
    'client_return_disposed'::text,
    'tl_stock_transfer_out'::text,
    'tl_stock_transfer_in'::text
  ]));

-- ---------------------------------------------------------------------------
-- 4) Agent inventory helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._tl_debit_agent_inventory(
  p_agent_id uuid,
  p_variant_id uuid,
  p_quantity integer
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_stock integer;
BEGIN
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Debit quantity must be positive';
  END IF;

  SELECT stock INTO v_stock
  FROM public.agent_inventory
  WHERE agent_id = p_agent_id
    AND variant_id = p_variant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source team leader has no inventory for this variant';
  END IF;

  IF v_stock < p_quantity THEN
    RAISE EXCEPTION 'Insufficient stock (available %, required %)', v_stock, p_quantity;
  END IF;

  UPDATE public.agent_inventory
  SET stock = stock - p_quantity
  WHERE agent_id = p_agent_id
    AND variant_id = p_variant_id;

  RETURN v_stock - p_quantity;
END;
$$;

CREATE OR REPLACE FUNCTION public._tl_credit_agent_inventory(
  p_agent_id uuid,
  p_variant_id uuid,
  p_company_id uuid,
  p_quantity integer,
  p_price_from_agent_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_allocated numeric;
  v_dsp numeric;
  v_rsp numeric;
BEGIN
  IF p_quantity <= 0 THEN
    RETURN;
  END IF;

  SELECT allocated_price, dsp_price, rsp_price
  INTO v_allocated, v_dsp, v_rsp
  FROM public.agent_inventory
  WHERE agent_id = p_price_from_agent_id
    AND variant_id = p_variant_id;

  INSERT INTO public.agent_inventory (
    agent_id, variant_id, stock, company_id, allocated_price, dsp_price, rsp_price
  ) VALUES (
    p_agent_id,
    p_variant_id,
    p_quantity,
    p_company_id,
    COALESCE(v_allocated, 0),
    COALESCE(v_dsp, 0),
    COALESCE(v_rsp, 0)
  )
  ON CONFLICT (agent_id, variant_id)
  DO UPDATE SET
    stock = public.agent_inventory.stock + EXCLUDED.stock,
    allocated_price = EXCLUDED.allocated_price,
    dsp_price = EXCLUDED.dsp_price,
    rsp_price = EXCLUDED.rsp_price;
END;
$$;

-- notifications uses notification_type + reference_type/id (no type/link columns).
CREATE OR REPLACE FUNCTION public._tl_notify(
  p_company_id uuid,
  p_user_id uuid,
  p_kind text,
  p_title text,
  p_message text,
  p_reference_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_type text;
BEGIN
  v_type := CASE p_kind
    WHEN 'created' THEN 'stock_request_created'
    WHEN 'approved' THEN 'stock_request_approved'
    WHEN 'rejected' THEN 'stock_request_rejected'
    ELSE 'system_message'
  END;

  INSERT INTO public.notifications (
    company_id, user_id, notification_type, title, message, reference_type, reference_id
  ) VALUES (
    p_company_id, p_user_id, v_type, p_title, p_message, 'tl_stock_request', p_reference_id
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 5) Dispatch (source TL) — deduct stock immediately
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.source_tl_dispatch_stock(uuid, integer, text, text, text, text);
DROP FUNCTION IF EXISTS public.source_tl_dispatch_stock(uuid, integer, text, text, text, text, jsonb);

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
  v_request record;
  v_approved integer;
  v_reason text;
  v_requester_name text;
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

  SELECT * INTO v_request
  FROM public.tl_stock_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Request not found');
  END IF;

  IF v_request.status IS DISTINCT FROM 'pending_source_tl' THEN
    RETURN json_build_object('success', false, 'error', 'Request is not pending dispatch');
  END IF;

  IF v_request.source_leader_id IS DISTINCT FROM v_source_id THEN
    RETURN json_build_object('success', false, 'error', 'You are not the source team leader for this request');
  END IF;

  v_approved := COALESCE(v_request.admin_approved_quantity, 0);
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
    v_request.source_leader_id,
    v_request.variant_id,
    p_dispatched_quantity
  );

  INSERT INTO public.inventory_transactions (
    company_id, variant_id, transaction_type, quantity,
    from_location, to_location, reference_type, reference_id, performed_by, notes
  ) VALUES (
    v_request.company_id,
    v_request.variant_id,
    'tl_stock_transfer_out',
    p_dispatched_quantity,
    'agent_inventory:' || v_request.source_leader_id::text,
    'in_transit:' || p_request_id::text,
    'tl_stock_request',
    p_request_id,
    v_source_id,
    'TL transfer dispatch ' || v_request.request_number
  );

  UPDATE public.tl_stock_requests
  SET
    status = 'pending_receipt',
    dispatched_quantity = p_dispatched_quantity,
    dispatched_at = NOW(),
    dispatch_shortfall_reason = v_reason,
    source_tl_approved_at = NOW(),
    source_tl_approved_by = v_source_id,
    source_tl_signature_url = p_signature_url,
    source_tl_signature_path = p_signature_path,
    dispatch_proof_urls = p_proof_urls,
    source_tl_notes = NULLIF(btrim(COALESCE(p_notes, '')), '')
  WHERE id = p_request_id;

  SELECT full_name INTO v_requester_name
  FROM public.profiles
  WHERE id = v_request.requester_leader_id;

  PERFORM public._tl_notify(
    v_request.company_id,
    v_request.requester_leader_id,
    'approved',
    'Stock dispatched — ready to receive',
    'Your stock request ' || v_request.request_number || ' was dispatched (' ||
      p_dispatched_quantity || ' units). Sign to receive.',
    p_request_id
  );

  RETURN json_build_object(
    'success', true,
    'request_id', p_request_id,
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
  v_request record;
BEGIN
  SELECT * INTO v_request
  FROM public.tl_stock_requests
  WHERE id = p_request_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Request not found');
  END IF;

  RETURN public.source_tl_dispatch_stock(
    p_request_id,
    COALESCE(v_request.admin_approved_quantity, 0),
    p_signature_url,
    p_signature_path,
    NULL,
    p_notes
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.source_tl_dispatch_stock(uuid, integer, text, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.source_tl_approve_request(uuid, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6) Receive — credit requester; shortfall opens dispatcher investigation
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.requester_tl_receive_stock(uuid, text, text);
DROP FUNCTION IF EXISTS public.requester_tl_receive_stock(uuid, text, text, integer, text, text, jsonb);

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
  v_request record;
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

  SELECT * INTO v_request
  FROM public.tl_stock_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Request not found');
  END IF;

  IF v_request.status IS DISTINCT FROM 'pending_receipt' THEN
    RETURN json_build_object('success', false, 'error', 'Request is not pending receipt');
  END IF;

  IF v_request.requester_leader_id IS DISTINCT FROM v_requester_id THEN
    RETURN json_build_object('success', false, 'error', 'You are not the requester for this request');
  END IF;

  v_legacy := v_request.dispatched_quantity IS NULL;
  v_dispatched := COALESCE(v_request.dispatched_quantity, v_request.admin_approved_quantity, 0);
  v_already_received := COALESCE(v_request.received_quantity, 0);
  v_written_off := COALESCE(v_request.written_off_quantity, 0);
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

  -- Legacy in-flight rows were never deducted at source approve.
  IF v_legacy AND v_recv > 0 THEN
    PERFORM public._tl_debit_agent_inventory(
      v_request.source_leader_id,
      v_request.variant_id,
      v_recv
    );
  END IF;

  IF v_recv > 0 THEN
    PERFORM public._tl_credit_agent_inventory(
      v_requester_id,
      v_request.variant_id,
      v_request.company_id,
      v_recv,
      v_request.source_leader_id
    );

    INSERT INTO public.inventory_transactions (
      company_id, variant_id, transaction_type, quantity,
      from_location, to_location, reference_type, reference_id, performed_by, notes
    ) VALUES (
      v_request.company_id,
      v_request.variant_id,
      'tl_stock_transfer_in',
      v_recv,
      CASE WHEN v_legacy
        THEN 'agent_inventory:' || v_request.source_leader_id::text
        ELSE 'in_transit:' || p_request_id::text
      END,
      'agent_inventory:' || v_requester_id::text,
      'tl_stock_request',
      p_request_id,
      v_requester_id,
      'TL transfer receive ' || v_request.request_number
    );
  END IF;

  IF v_shortfall > 0 THEN
    INSERT INTO public.tl_stock_request_discrepancies (
      company_id, request_id, variant_id, quantity, reason,
      reporter_notes, status, reported_by
    ) VALUES (
      v_request.company_id,
      p_request_id,
      v_request.variant_id,
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

  UPDATE public.tl_stock_requests
  SET
    status = v_new_status,
    received_at = NOW(),
    received_by = v_requester_id,
    received_quantity = v_already_received + v_recv,
    received_signature_url = p_signature_url,
    received_signature_path = p_signature_path,
    receive_shortfall_reason = CASE WHEN v_shortfall > 0 THEN v_reason ELSE receive_shortfall_reason END,
    receive_shortfall_notes = CASE WHEN v_shortfall > 0 THEN v_notes ELSE receive_shortfall_notes END,
    receive_proof_urls = p_proof_urls,
    dispatched_quantity = COALESCE(dispatched_quantity, v_dispatched)
  WHERE id = p_request_id;

  SELECT full_name INTO v_source_name FROM public.profiles WHERE id = v_request.source_leader_id;
  SELECT full_name INTO v_requester_name FROM public.profiles WHERE id = v_requester_id;

  IF v_shortfall > 0 THEN
    PERFORM public._tl_notify(
      v_request.company_id,
      v_request.source_leader_id,
      'system',
      'Transfer shortage to investigate',
      v_requester_name || ' received ' || v_recv || ' of ' || v_remaining ||
        ' units on ' || v_request.request_number || '. Investigate the missing stock.',
      p_request_id
    );
  ELSE
    PERFORM public._tl_notify(
      v_request.company_id,
      v_request.source_leader_id,
      'system',
      'Stock transfer completed',
      v_requester_name || ' received ' || v_recv || ' units from ' || v_request.request_number,
      p_request_id
    );
  END IF;

  INSERT INTO public.notifications (
    company_id, user_id, notification_type, title, message, reference_type, reference_id
  )
  SELECT
    v_request.company_id,
    profiles.id,
    'system_message',
    CASE WHEN v_shortfall > 0 THEN 'TL stock transfer incomplete' ELSE 'TL stock transfer completed' END,
    'Stock request ' || v_request.request_number || ': ' || v_recv || ' units received by ' ||
      v_requester_name || ' from ' || v_source_name,
    'tl_stock_request',
    p_request_id
  FROM public.profiles
  WHERE company_id = v_request.company_id
    AND role IN ('admin', 'super_admin')
    AND status = 'active';

  RETURN json_build_object(
    'success', true,
    'request_id', p_request_id,
    'transferred_quantity', v_recv,
    'shortfall_quantity', v_shortfall,
    'status', v_new_status
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.requester_tl_receive_stock(uuid, text, text, integer, text, text, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7) Dispatcher resolves shortage
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
  v_request record;
  v_resolution text;
  v_new_disc_status text;
  v_new_req_status text;
  v_remaining integer;
  v_requester_name text;
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

  SELECT * INTO v_request
  FROM public.tl_stock_requests
  WHERE id = disc.request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Transfer not found');
  END IF;

  IF NOT (
    v_actor_id = v_request.source_leader_id
    OR (
      v_actor_role IN ('admin', 'super_admin')
      AND v_actor_company = v_request.company_id
    )
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Only the dispatching team leader (or company admin) can resolve this shortage');
  END IF;

  IF v_resolution = 'redeliver' THEN
    -- Original units were already deducted at dispatch. Reopen receive for the missing qty.
    v_new_disc_status := 'resolved_redeliver';
    v_new_req_status := 'pending_receipt';
  ELSIF v_resolution = 'write_off' THEN
    v_new_disc_status := 'resolved_write_off';
    UPDATE public.tl_stock_requests
    SET written_off_quantity = COALESCE(written_off_quantity, 0) + disc.quantity
    WHERE id = v_request.id;
  ELSIF v_resolution = 'write_off_replace' THEN
    v_new_disc_status := 'resolved_write_off_replace';
    PERFORM public._tl_debit_agent_inventory(
      v_request.source_leader_id,
      v_request.variant_id,
      disc.quantity
    );
    INSERT INTO public.inventory_transactions (
      company_id, variant_id, transaction_type, quantity,
      from_location, to_location, reference_type, reference_id, performed_by, notes
    ) VALUES (
      v_request.company_id,
      v_request.variant_id,
      'tl_stock_transfer_out',
      disc.quantity,
      'agent_inventory:' || v_request.source_leader_id::text,
      'in_transit:' || v_request.id::text,
      'tl_stock_request',
      v_request.id,
      v_actor_id,
      'TL transfer replacement dispatch ' || v_request.request_number
    );
    UPDATE public.tl_stock_requests
    SET
      written_off_quantity = COALESCE(written_off_quantity, 0) + disc.quantity,
      dispatched_quantity = COALESCE(dispatched_quantity, 0) + disc.quantity
    WHERE id = v_request.id;
    v_new_req_status := 'pending_receipt';
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
  FROM public.tl_stock_requests
  WHERE id = v_request.id;

  IF v_resolution = 'write_off' THEN
    IF COALESCE(v_remaining, 0) <= 0 THEN
      v_new_req_status := 'incomplete';
    ELSE
      v_new_req_status := 'pending_receipt';
    END IF;
  END IF;

  UPDATE public.tl_stock_requests
  SET status = v_new_req_status
  WHERE id = v_request.id;

  SELECT full_name INTO v_requester_name
  FROM public.profiles
  WHERE id = v_request.requester_leader_id;

  IF v_new_req_status = 'pending_receipt' THEN
    PERFORM public._tl_notify(
      v_request.company_id,
      v_request.requester_leader_id,
      'approved',
      'Transfer ready to receive again',
      'Shortage on ' || v_request.request_number || ' was resolved. Please receive the remaining stock.',
      v_request.id
    );
  END IF;

  RETURN json_build_object(
    'success', true,
    'discrepancy_id', p_discrepancy_id,
    'resolution', v_resolution,
    'request_status', v_new_req_status
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_tl_stock_request_discrepancy(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8) Fix existing TL RPCs: notifications.notification_type (not type/link)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.submit_tl_stock_request(uuid, uuid, uuid, integer);
DROP FUNCTION IF EXISTS public.submit_tl_stock_request(uuid, uuid, uuid, integer, text);

CREATE OR REPLACE FUNCTION public.submit_tl_stock_request(
  p_company_id uuid,
  p_source_leader_id uuid,
  p_variant_id uuid,
  p_requested_quantity integer,
  p_notes text DEFAULT NULL,
  p_request_number text DEFAULT NULL
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
  v_notify boolean := true;
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

  PERFORM pg_advisory_xact_lock(hashtext('tl_stock_request_number:' || p_company_id::text));

  IF NULLIF(btrim(COALESCE(p_request_number, '')), '') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.tl_stock_requests
      WHERE company_id = p_company_id
        AND request_number = p_request_number
        AND requester_leader_id = v_requester_id
        AND source_leader_id = p_source_leader_id
        AND status = 'pending_admin'
    ) THEN
      RETURN json_build_object('success', false, 'error', 'Invalid transfer number for additional items');
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.tl_stock_requests
      WHERE company_id = p_company_id
        AND request_number = p_request_number
        AND variant_id = p_variant_id
    ) THEN
      RETURN json_build_object('success', false, 'error', 'That item is already on this transfer');
    END IF;

    v_request_number := p_request_number;
    v_notify := false;
  ELSE
    v_date_str := to_char(NOW(), 'YYYYMMDD');
    SELECT COUNT(DISTINCT request_number) INTO v_count
    FROM public.tl_stock_requests
    WHERE company_id = p_company_id
      AND created_at::date = CURRENT_DATE;

    v_request_number := 'TLREQ-' || v_date_str || '-' || lpad((v_count + 1)::text, 4, '0');
  END IF;

  INSERT INTO public.tl_stock_requests (
    company_id, request_number, requester_leader_id, source_leader_id,
    variant_id, requested_quantity, status, requester_notes
  ) VALUES (
    p_company_id, v_request_number, v_requester_id, p_source_leader_id,
    p_variant_id, p_requested_quantity, 'pending_admin',
    NULLIF(btrim(COALESCE(p_notes, '')), '')
  ) RETURNING id INTO v_request_id;

  IF v_notify THEN
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
  END IF;

  RETURN json_build_object(
    'success', true,
    'request_id', v_request_id,
    'request_number', v_request_number
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

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
  v_request record;
  v_available_quantity integer;
  v_requester_name text;
BEGIN
  SELECT id, role INTO v_admin_id, v_admin_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_admin_role NOT IN ('admin', 'super_admin') THEN
    RETURN json_build_object('success', false, 'error', 'Only admins can approve requests');
  END IF;

  SELECT * INTO v_request FROM public.tl_stock_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Request not found');
  END IF;

  IF v_request.status IS DISTINCT FROM 'pending_admin' THEN
    RETURN json_build_object('success', false, 'error', 'Request is not pending admin approval');
  END IF;

  IF p_approved_quantity <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Approved quantity must be greater than 0');
  END IF;

  IF p_approved_quantity > v_request.requested_quantity THEN
    RETURN json_build_object('success', false, 'error', 'Approved quantity cannot exceed requested quantity');
  END IF;

  SELECT COALESCE(stock, 0) INTO v_available_quantity
  FROM public.agent_inventory
  WHERE agent_id = v_request.source_leader_id
    AND variant_id = v_request.variant_id;

  IF COALESCE(v_available_quantity, 0) < p_approved_quantity THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Insufficient stock',
      'available_quantity', COALESCE(v_available_quantity, 0),
      'approved_quantity', p_approved_quantity
    );
  END IF;

  UPDATE public.tl_stock_requests
  SET
    status = 'pending_source_tl',
    admin_approved_at = NOW(),
    admin_approved_by = v_admin_id,
    admin_approved_quantity = p_approved_quantity,
    admin_notes = p_notes
  WHERE id = p_request_id;

  SELECT full_name INTO v_requester_name
  FROM public.profiles WHERE id = v_request.requester_leader_id;

  PERFORM public._tl_notify(
    v_request.company_id,
    v_request.source_leader_id,
    'approved',
    'Stock request approved — ready to dispatch',
    'Admin approved a stock request from ' || v_requester_name || ' for ' ||
      p_approved_quantity || ' units. Please dispatch.',
    p_request_id
  );

  RETURN json_build_object(
    'success', true,
    'request_id', p_request_id,
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
  v_request record;
BEGIN
  SELECT id, role INTO v_admin_id, v_admin_role
  FROM public.profiles WHERE id = auth.uid();

  IF v_admin_role NOT IN ('admin', 'super_admin') THEN
    RETURN json_build_object('success', false, 'error', 'Only admins can reject requests');
  END IF;

  SELECT * INTO v_request FROM public.tl_stock_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Request not found');
  END IF;

  IF v_request.status IS DISTINCT FROM 'pending_admin' THEN
    RETURN json_build_object('success', false, 'error', 'Request is not pending admin approval');
  END IF;

  UPDATE public.tl_stock_requests
  SET
    status = 'admin_rejected',
    rejected_at = NOW(),
    rejected_by = v_admin_id,
    rejection_reason = p_reason
  WHERE id = p_request_id;

  PERFORM public._tl_notify(
    v_request.company_id,
    v_request.requester_leader_id,
    'rejected',
    'Stock transfer rejected',
    'Your stock request ' || v_request.request_number || ' was rejected. Reason: ' || p_reason,
    p_request_id
  );

  RETURN json_build_object('success', true, 'request_id', p_request_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
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
  v_request record;
  v_requester_name text;
  v_source_name text;
BEGIN
  SELECT id, role INTO v_source_id, v_source_role
  FROM public.profiles WHERE id = auth.uid();

  IF v_source_role IS DISTINCT FROM 'team_leader' THEN
    RETURN json_build_object('success', false, 'error', 'Only team leaders can reject requests');
  END IF;

  SELECT * INTO v_request FROM public.tl_stock_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Request not found');
  END IF;

  IF v_request.status IS DISTINCT FROM 'pending_source_tl' THEN
    RETURN json_build_object('success', false, 'error', 'Request is not pending your dispatch');
  END IF;

  IF v_request.source_leader_id IS DISTINCT FROM v_source_id THEN
    RETURN json_build_object('success', false, 'error', 'You are not the source team leader for this request');
  END IF;

  UPDATE public.tl_stock_requests
  SET
    status = 'source_tl_rejected',
    rejected_at = NOW(),
    rejected_by = v_source_id,
    rejection_reason = p_reason
  WHERE id = p_request_id;

  SELECT full_name INTO v_requester_name FROM public.profiles WHERE id = v_request.requester_leader_id;
  SELECT full_name INTO v_source_name FROM public.profiles WHERE id = v_source_id;

  PERFORM public._tl_notify(
    v_request.company_id,
    v_request.requester_leader_id,
    'rejected',
    'Stock transfer rejected',
    v_source_name || ' rejected your stock request ' || v_request.request_number || '. Reason: ' || p_reason,
    p_request_id
  );

  INSERT INTO public.notifications (
    company_id, user_id, notification_type, title, message, reference_type, reference_id
  )
  SELECT
    v_request.company_id,
    profiles.id,
    'stock_request_rejected',
    'TL stock transfer rejected',
    v_source_name || ' rejected stock request ' || v_request.request_number || ' from ' || v_requester_name,
    'tl_stock_request',
    p_request_id
  FROM public.profiles
  WHERE company_id = v_request.company_id
    AND role IN ('admin', 'super_admin')
    AND status = 'active';

  RETURN json_build_object('success', true, 'request_id', p_request_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_tl_stock_request(uuid, uuid, uuid, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_tl_request(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reject_tl_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.source_tl_reject_request(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Storage: signatures + package photos (dispatch/receive)
-- The transfer SQL never created these policies; upload then fails with
-- "new row violates row-level security policy".
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('tl-stock-request-signatures', 'tl-stock-request-signatures', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Team leaders can upload signatures" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their company signatures" ON storage.objects;
DROP POLICY IF EXISTS "Admins can view all company signatures" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete signatures" ON storage.objects;
DROP POLICY IF EXISTS "TL transfer signatures insert" ON storage.objects;
DROP POLICY IF EXISTS "TL transfer signatures select" ON storage.objects;
DROP POLICY IF EXISTS "TL transfer signatures delete" ON storage.objects;

CREATE POLICY "TL transfer signatures insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'tl-stock-request-signatures'
  AND (storage.foldername(name))[1] = (
    SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('team_leader', 'admin', 'super_admin')
  )
);

CREATE POLICY "TL transfer signatures select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'tl-stock-request-signatures'
  AND (storage.foldername(name))[1] = (
    SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "TL transfer signatures delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'tl-stock-request-signatures'
  AND (storage.foldername(name))[1] = (
    SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('team_leader', 'admin', 'super_admin')
  )
);
