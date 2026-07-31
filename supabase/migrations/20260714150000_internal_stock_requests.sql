-- Internal stock requests (sub-warehouse → main warehouse)
-- Request number format: RN-{LOCATION_CODE}-{####}
-- Example: Santa Rosa → RN-STR-0001
--
-- Scope of this migration:
--   * Schema + location codes
--   * Number generator
--   * Create / approve / reject / allocate remaining / confirm receive RPCs
--   * RLS for main vs sub warehouse users
-- Inventory stock movement is intentionally deferred (state machine only).

-- ---------------------------------------------------------------------------
-- 1) warehouse_locations.code (fixed short code per location)
-- ---------------------------------------------------------------------------
ALTER TABLE public.warehouse_locations
  ADD COLUMN IF NOT EXISTS code text;

COMMENT ON COLUMN public.warehouse_locations.code IS
  'Short uppercase code for request numbers, e.g. Santa Rosa → STR → RN-STR-0001';

CREATE OR REPLACE FUNCTION public.derive_warehouse_location_code(p_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_clean text;
  v_words text[];
  v_word text;
  v_code text := '';
  v_first text;
  v_chars text;
  v_ch text;
  i integer;
BEGIN
  v_clean := trim(COALESCE(p_name, ''));
  IF v_clean = '' THEN
    RETURN 'LOC';
  END IF;

  v_words := regexp_split_to_array(upper(v_clean), '\s+');

  FOREACH v_word IN ARRAY v_words LOOP
    v_word := regexp_replace(v_word, '[^A-Z]', '', 'g');
    IF length(v_word) > 0 AND length(v_code) < 3 THEN
      v_code := v_code || left(v_word, 1);
    END IF;
  END LOOP;

  -- Two-word (or more) names with only 2 initials: insert last consonant of first word.
  -- "Santa Rosa" → S + T + R → STR
  IF length(v_code) = 2 AND array_length(v_words, 1) >= 2 THEN
    v_first := regexp_replace(v_words[1], '[^A-Z]', '', 'g');
    v_chars := '';
    FOR i IN 2..length(v_first) LOOP
      v_ch := substr(v_first, i, 1);
      IF v_ch ~ '[BCDFGHJKLMNPQRSTVWXYZ]' THEN
        v_chars := v_chars || v_ch;
      END IF;
    END LOOP;
    IF length(v_chars) > 0 THEN
      v_code := left(v_code, 1) || right(v_chars, 1) || substr(v_code, 2, 1);
    END IF;
  END IF;

  -- Still short: fill from remaining letters of the whole name.
  IF length(v_code) < 3 THEN
    v_clean := regexp_replace(upper(COALESCE(p_name, '')), '[^A-Z]', '', 'g');
    FOR i IN 1..length(v_clean) LOOP
      EXIT WHEN length(v_code) >= 3;
      v_ch := substr(v_clean, i, 1);
      IF position(v_ch IN v_code) = 0 THEN
        v_code := v_code || v_ch;
      END IF;
    END LOOP;
  END IF;

  WHILE length(v_code) < 3 LOOP
    v_code := v_code || 'X';
  END LOOP;

  RETURN left(v_code, 3);
END;
$$;

-- Backfill codes (best-effort); operators can override.
UPDATE public.warehouse_locations wl
SET code = public.derive_warehouse_location_code(wl.name)
WHERE wl.code IS NULL OR btrim(wl.code) = '';

-- Resolve collisions within a company by appending A/B/C…
DO $$
DECLARE
  dup record;
  loc record;
  v_company uuid;
  v_base text;
  v_try text;
  v_suffix integer;
BEGIN
  FOR dup IN
    SELECT company_id, code
    FROM public.warehouse_locations
    WHERE code IS NOT NULL
    GROUP BY company_id, code
    HAVING count(*) > 1
  LOOP
    v_company := dup.company_id;
    v_base := dup.code;
    v_suffix := 0;
    FOR loc IN
      SELECT id
      FROM public.warehouse_locations
      WHERE company_id = v_company AND code = v_base
      ORDER BY is_main DESC, created_at ASC
      OFFSET 1
    LOOP
      LOOP
        v_suffix := v_suffix + 1;
        v_try := left(v_base, 2) || chr(64 + least(v_suffix, 26));
        EXIT WHEN NOT EXISTS (
          SELECT 1
          FROM public.warehouse_locations
          WHERE company_id = v_company AND code = v_try
        );
      END LOOP;
      UPDATE public.warehouse_locations SET code = v_try WHERE id = loc.id;
    END LOOP;
  END LOOP;
END $$;

ALTER TABLE public.warehouse_locations
  ALTER COLUMN code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS warehouse_locations_company_code_key
  ON public.warehouse_locations(company_id, code);

-- ---------------------------------------------------------------------------
-- 2) Number counters (per company + location code)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.internal_stock_request_number_counters (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  location_code text NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, location_code)
);

ALTER TABLE public.internal_stock_request_number_counters ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3) Requests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.internal_stock_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  request_number text NOT NULL,
  from_location_id uuid NOT NULL REFERENCES public.warehouse_locations(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending_approval' CHECK (
    status IN (
      'pending_approval',
      'pending_receive',
      'partially_received',
      'fully_received',
      'rejected'
    )
  ),
  notes text,
  receive_notes text,
  rejection_reason text,
  requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approval_signature_url text,
  approval_signature_path text,
  rejected_at timestamptz,
  rejected_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  rejection_signature_url text,
  rejection_signature_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT internal_stock_requests_company_request_number_key
    UNIQUE (company_id, request_number)
);

CREATE INDEX IF NOT EXISTS idx_internal_stock_requests_company_status
  ON public.internal_stock_requests(company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_internal_stock_requests_from_location
  ON public.internal_stock_requests(from_location_id, created_at DESC);

DROP TRIGGER IF EXISTS update_internal_stock_requests_updated_at ON public.internal_stock_requests;
CREATE TRIGGER update_internal_stock_requests_updated_at
  BEFORE UPDATE ON public.internal_stock_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.internal_stock_requests ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 4) Items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.internal_stock_request_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES public.internal_stock_requests(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.variants(id) ON DELETE RESTRICT,
  requested_quantity integer NOT NULL CHECK (requested_quantity > 0),
  delivered_quantity integer NOT NULL DEFAULT 0 CHECK (delivered_quantity >= 0),
  received_quantity integer NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
  open_receive_quantity integer NOT NULL DEFAULT 0 CHECK (open_receive_quantity >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT internal_stock_request_items_request_variant_key UNIQUE (request_id, variant_id),
  CONSTRAINT internal_stock_request_items_received_lte_delivered
    CHECK (received_quantity <= delivered_quantity)
);

CREATE INDEX IF NOT EXISTS idx_internal_stock_request_items_request
  ON public.internal_stock_request_items(request_id);

DROP TRIGGER IF EXISTS update_internal_stock_request_items_updated_at ON public.internal_stock_request_items;
CREATE TRIGGER update_internal_stock_request_items_updated_at
  BEFORE UPDATE ON public.internal_stock_request_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.internal_stock_request_items ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 5) History / events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.internal_stock_request_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES public.internal_stock_requests(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (
    event_type IN (
      'created',
      'approved_released',
      'remaining_released',
      'receive_confirmed',
      'rejected'
    )
  ),
  note text,
  lines jsonb,
  short_quantity integer,
  proof_image_url text,
  proof_image_path text,
  signature_url text,
  signature_path text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_internal_stock_request_events_request
  ON public.internal_stock_request_events(request_id, created_at DESC);

ALTER TABLE public.internal_stock_request_events ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 6) Receive proof snapshots (optional parallel to events)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.internal_stock_request_receives (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES public.internal_stock_requests(id) ON DELETE CASCADE,
  notes text,
  lines jsonb,
  proof_image_url text,
  proof_image_path text,
  proof_image_name text,
  signature_url text,
  signature_path text,
  short_quantity integer NOT NULL DEFAULT 0,
  received_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_internal_stock_request_receives_request
  ON public.internal_stock_request_receives(request_id, received_at DESC);

ALTER TABLE public.internal_stock_request_receives ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 7) RLS policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Internal stock requests: select by warehouse role" ON public.internal_stock_requests;
CREATE POLICY "Internal stock requests: select by warehouse role"
  ON public.internal_stock_requests FOR SELECT
  USING (
    company_id = public.get_auth_company_id()
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'warehouse')
    AND (
      public.is_main_warehouse_user(auth.uid())
      OR from_location_id = public.get_warehouse_location_id(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Internal stock request items: select via parent" ON public.internal_stock_request_items;
CREATE POLICY "Internal stock request items: select via parent"
  ON public.internal_stock_request_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.internal_stock_requests r
      WHERE r.id = internal_stock_request_items.request_id
        AND r.company_id = public.get_auth_company_id()
        AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'warehouse')
        AND (
          public.is_main_warehouse_user(auth.uid())
          OR r.from_location_id = public.get_warehouse_location_id(auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "Internal stock request events: select via parent" ON public.internal_stock_request_events;
CREATE POLICY "Internal stock request events: select via parent"
  ON public.internal_stock_request_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.internal_stock_requests r
      WHERE r.id = internal_stock_request_events.request_id
        AND r.company_id = public.get_auth_company_id()
        AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'warehouse')
        AND (
          public.is_main_warehouse_user(auth.uid())
          OR r.from_location_id = public.get_warehouse_location_id(auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "Internal stock request receives: select via parent" ON public.internal_stock_request_receives;
CREATE POLICY "Internal stock request receives: select via parent"
  ON public.internal_stock_request_receives FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.internal_stock_requests r
      WHERE r.id = internal_stock_request_receives.request_id
        AND r.company_id = public.get_auth_company_id()
        AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'warehouse')
        AND (
          public.is_main_warehouse_user(auth.uid())
          OR r.from_location_id = public.get_warehouse_location_id(auth.uid())
        )
    )
  );

-- Mutations go through SECURITY DEFINER RPCs only.
DROP POLICY IF EXISTS "Internal stock request counters: no direct access" ON public.internal_stock_request_number_counters;
CREATE POLICY "Internal stock request counters: no direct access"
  ON public.internal_stock_request_number_counters FOR ALL
  USING (false)
  WITH CHECK (false);

-- ---------------------------------------------------------------------------
-- 8) Number generator: RN-{CODE}-{####}
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_internal_stock_request_number(
  p_company_id uuid,
  p_from_location_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_code text;
  v_next integer;
BEGIN
  SELECT upper(btrim(wl.code)) INTO v_code
  FROM public.warehouse_locations wl
  WHERE wl.id = p_from_location_id
    AND wl.company_id = p_company_id;

  IF v_code IS NULL OR v_code = '' THEN
    RAISE EXCEPTION 'Warehouse location code is missing';
  END IF;

  INSERT INTO public.internal_stock_request_number_counters (company_id, location_code, last_number)
  VALUES (p_company_id, v_code, 1)
  ON CONFLICT (company_id, location_code)
  DO UPDATE SET last_number = public.internal_stock_request_number_counters.last_number + 1
  RETURNING last_number INTO v_next;

  RETURN 'RN-' || v_code || '-' || lpad(v_next::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_internal_stock_request_number(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 9) create_internal_stock_request
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_internal_stock_request(
  p_items jsonb,
  p_notes text DEFAULT NULL,
  p_from_location_id uuid DEFAULT NULL,
  p_requested_by uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := COALESCE(p_requested_by, auth.uid());
  v_company_id uuid;
  v_location_id uuid;
  v_is_main boolean;
  v_request_id uuid;
  v_request_number text;
  v_item jsonb;
  v_variant_id uuid;
  v_qty integer;
  v_count integer := 0;
BEGIN
  IF v_actor IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT p.company_id INTO v_company_id
  FROM public.profiles p
  WHERE p.id = v_actor AND p.role = 'warehouse';

  IF v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Warehouse access required');
  END IF;

  v_location_id := COALESCE(p_from_location_id, public.get_warehouse_location_id(v_actor));
  IF v_location_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Sub-warehouse location required');
  END IF;

  SELECT wl.is_main INTO v_is_main
  FROM public.warehouse_locations wl
  WHERE wl.id = v_location_id AND wl.company_id = v_company_id;

  IF v_is_main IS DISTINCT FROM false THEN
    RETURN json_build_object('success', false, 'error', 'Only sub-warehouses can create internal stock requests');
  END IF;

  -- Sub users may only create for their own location; main may create on behalf later if needed.
  IF NOT public.is_main_warehouse_user(v_actor)
     AND v_location_id IS DISTINCT FROM public.get_warehouse_location_id(v_actor) THEN
    RETURN json_build_object('success', false, 'error', 'Cannot create request for another location');
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'At least one item is required');
  END IF;

  v_request_number := public.generate_internal_stock_request_number(v_company_id, v_location_id);

  INSERT INTO public.internal_stock_requests (
    company_id, request_number, from_location_id, status, notes, requested_by
  ) VALUES (
    v_company_id, v_request_number, v_location_id, 'pending_approval', nullif(btrim(COALESCE(p_notes, '')), ''), v_actor
  )
  RETURNING id INTO v_request_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_variant_id := NULLIF(v_item->>'variant_id', '')::uuid;
    v_qty := COALESCE((v_item->>'quantity')::integer, (v_item->>'requested_quantity')::integer, 0);
    IF v_variant_id IS NULL OR v_qty <= 0 THEN
      RETURN json_build_object('success', false, 'error', 'Each item needs variant_id and positive quantity');
    END IF;

    INSERT INTO public.internal_stock_request_items (
      request_id, variant_id, requested_quantity, delivered_quantity, received_quantity, open_receive_quantity
    ) VALUES (
      v_request_id, v_variant_id, v_qty, 0, 0, 0
    )
    ON CONFLICT (request_id, variant_id)
    DO UPDATE SET requested_quantity = public.internal_stock_request_items.requested_quantity + EXCLUDED.requested_quantity;

    v_count := v_count + 1;
  END LOOP;

  INSERT INTO public.internal_stock_request_events (request_id, event_type, note, created_by)
  VALUES (v_request_id, 'created', nullif(btrim(COALESCE(p_notes, '')), ''), v_actor);

  RETURN json_build_object(
    'success', true,
    'request_id', v_request_id,
    'request_number', v_request_number,
    'item_count', v_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_internal_stock_request(jsonb, text, uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 10) approve_internal_stock_request (release full requested qty)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_internal_stock_request(
  p_request_id uuid,
  p_signature_url text DEFAULT NULL,
  p_signature_path text DEFAULT NULL,
  p_approved_by uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := COALESCE(p_approved_by, auth.uid());
  v_company_id uuid;
  v_status text;
  v_lines jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  IF p_signature_url IS NULL OR btrim(p_signature_url) = '' THEN
    RETURN json_build_object('success', false, 'error', 'Signature is required');
  END IF;
  IF NOT public.is_main_warehouse_user(v_actor) THEN
    RETURN json_build_object('success', false, 'error', 'Main warehouse access required');
  END IF;

  SELECT r.company_id, r.status INTO v_company_id, v_status
  FROM public.internal_stock_requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF v_company_id IS NULL OR v_company_id IS DISTINCT FROM public.get_auth_company_id() THEN
    RETURN json_build_object('success', false, 'error', 'Request not found');
  END IF;
  IF v_status <> 'pending_approval' THEN
    RETURN json_build_object('success', false, 'error', 'Request is not pending approval');
  END IF;

  UPDATE public.internal_stock_request_items
  SET delivered_quantity = requested_quantity,
      received_quantity = 0,
      open_receive_quantity = requested_quantity,
      updated_at = now()
  WHERE request_id = p_request_id;

  UPDATE public.internal_stock_requests
  SET status = 'pending_receive',
      approved_at = now(),
      approved_by = v_actor,
      approval_signature_url = p_signature_url,
      approval_signature_path = p_signature_path,
      updated_at = now()
  WHERE id = p_request_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'variant_id', i.variant_id,
      'quantity', i.requested_quantity
    )
  ), '[]'::jsonb)
  INTO v_lines
  FROM public.internal_stock_request_items i
  WHERE i.request_id = p_request_id;

  INSERT INTO public.internal_stock_request_events (
    request_id, event_type, lines, signature_url, signature_path, created_by
  ) VALUES (
    p_request_id, 'approved_released', v_lines, p_signature_url, p_signature_path, v_actor
  );

  RETURN json_build_object('success', true, 'request_id', p_request_id, 'status', 'pending_receive');
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_internal_stock_request(uuid, text, text, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 11) reject_internal_stock_request
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_internal_stock_request(
  p_request_id uuid,
  p_reason text,
  p_signature_url text DEFAULT NULL,
  p_signature_path text DEFAULT NULL,
  p_rejected_by uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := COALESCE(p_rejected_by, auth.uid());
  v_company_id uuid;
  v_status text;
  v_note text;
  v_lines jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RETURN json_build_object('success', false, 'error', 'Rejection reason is required');
  END IF;
  IF p_signature_url IS NULL OR btrim(p_signature_url) = '' THEN
    RETURN json_build_object('success', false, 'error', 'Signature is required');
  END IF;
  IF NOT public.is_main_warehouse_user(v_actor) THEN
    RETURN json_build_object('success', false, 'error', 'Main warehouse access required');
  END IF;

  SELECT r.company_id, r.status INTO v_company_id, v_status
  FROM public.internal_stock_requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF v_company_id IS NULL OR v_company_id IS DISTINCT FROM public.get_auth_company_id() THEN
    RETURN json_build_object('success', false, 'error', 'Request not found');
  END IF;
  IF v_status <> 'pending_approval' THEN
    RETURN json_build_object('success', false, 'error', 'Request is not pending approval');
  END IF;

  v_note := btrim(p_reason);

  UPDATE public.internal_stock_requests
  SET status = 'rejected',
      rejection_reason = v_note,
      rejected_at = now(),
      rejected_by = v_actor,
      rejection_signature_url = p_signature_url,
      rejection_signature_path = p_signature_path,
      updated_at = now()
  WHERE id = p_request_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'variant_id', i.variant_id,
      'quantity', i.requested_quantity
    )
  ), '[]'::jsonb)
  INTO v_lines
  FROM public.internal_stock_request_items i
  WHERE i.request_id = p_request_id;

  INSERT INTO public.internal_stock_request_events (
    request_id, event_type, note, lines, signature_url, signature_path, created_by
  ) VALUES (
    p_request_id, 'rejected', v_note, v_lines, p_signature_url, p_signature_path, v_actor
  );

  RETURN json_build_object('success', true, 'request_id', p_request_id, 'status', 'rejected');
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_internal_stock_request(uuid, text, text, text, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 12) allocate_internal_stock_request_remaining
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.allocate_internal_stock_request_remaining(
  p_request_id uuid,
  p_lines jsonb,
  p_note text DEFAULT NULL,
  p_allocated_by uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := COALESCE(p_allocated_by, auth.uid());
  v_company_id uuid;
  v_status text;
  v_line jsonb;
  v_variant_id uuid;
  v_qty integer;
  v_allocatable integer;
  v_open integer;
  v_history jsonb := '[]'::jsonb;
  v_total integer := 0;
BEGIN
  IF v_actor IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  IF NOT public.is_main_warehouse_user(v_actor) THEN
    RETURN json_build_object('success', false, 'error', 'Main warehouse access required');
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Allocate lines are required');
  END IF;

  SELECT r.company_id, r.status INTO v_company_id, v_status
  FROM public.internal_stock_requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF v_company_id IS NULL OR v_company_id IS DISTINCT FROM public.get_auth_company_id() THEN
    RETURN json_build_object('success', false, 'error', 'Request not found');
  END IF;
  IF v_status <> 'partially_received' THEN
    RETURN json_build_object('success', false, 'error', 'Only partially received requests can allocate remaining');
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_variant_id := NULLIF(v_line->>'variant_id', '')::uuid;
    v_qty := COALESCE((v_line->>'quantity')::integer, 0);
    IF v_variant_id IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT GREATEST(0, (i.delivered_quantity - i.received_quantity) - i.open_receive_quantity),
           i.open_receive_quantity
      INTO v_allocatable, v_open
    FROM public.internal_stock_request_items i
    WHERE i.request_id = p_request_id AND i.variant_id = v_variant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'Variant not on request');
    END IF;

    IF v_qty > v_allocatable THEN
      RETURN json_build_object(
        'success', false,
        'error', format('Cannot allocate more than %s for a line', v_allocatable)
      );
    END IF;

    UPDATE public.internal_stock_request_items
    SET open_receive_quantity = open_receive_quantity + v_qty,
        updated_at = now()
    WHERE request_id = p_request_id AND variant_id = v_variant_id;

    v_history := v_history || jsonb_build_array(
      jsonb_build_object('variant_id', v_variant_id, 'quantity', v_qty)
    );
    v_total := v_total + v_qty;
  END LOOP;

  IF v_total <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Nothing to allocate');
  END IF;

  INSERT INTO public.internal_stock_request_events (
    request_id, event_type, note, lines, created_by
  ) VALUES (
    p_request_id,
    'remaining_released',
    COALESCE(nullif(btrim(COALESCE(p_note, '')), ''), format('Allocated %s unit(s) of remaining short', v_total)),
    v_history,
    v_actor
  );

  RETURN json_build_object(
    'success', true,
    'request_id', p_request_id,
    'allocated', v_total,
    'status', 'partially_received'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.allocate_internal_stock_request_remaining(uuid, jsonb, text, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 13) confirm_internal_stock_request_receive
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_internal_stock_request_receive(
  p_request_id uuid,
  p_lines jsonb,
  p_proof_image_url text,
  p_signature_url text,
  p_notes text DEFAULT NULL,
  p_proof_image_path text DEFAULT NULL,
  p_proof_image_name text DEFAULT NULL,
  p_signature_path text DEFAULT NULL,
  p_received_by uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := COALESCE(p_received_by, auth.uid());
  v_company_id uuid;
  v_from_location uuid;
  v_status text;
  v_line jsonb;
  v_variant_id uuid;
  v_qty integer;
  v_open integer;
  v_received integer;
  v_delivered integer;
  v_history jsonb := '[]'::jsonb;
  v_short integer := 0;
  v_any_open boolean;
  v_any_short boolean;
  v_next_status text;
BEGIN
  IF v_actor IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  IF p_proof_image_url IS NULL OR btrim(p_proof_image_url) = '' THEN
    RETURN json_build_object('success', false, 'error', 'Proof image is required');
  END IF;
  IF p_signature_url IS NULL OR btrim(p_signature_url) = '' THEN
    RETURN json_build_object('success', false, 'error', 'Signature is required');
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Receive lines are required');
  END IF;

  SELECT r.company_id, r.from_location_id, r.status
    INTO v_company_id, v_from_location, v_status
  FROM public.internal_stock_requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF v_company_id IS NULL OR v_company_id IS DISTINCT FROM public.get_auth_company_id() THEN
    RETURN json_build_object('success', false, 'error', 'Request not found');
  END IF;

  IF v_status NOT IN ('pending_receive', 'partially_received') THEN
    RETURN json_build_object('success', false, 'error', 'Request is not awaiting receive');
  END IF;

  IF NOT public.is_main_warehouse_user(v_actor)
     AND v_from_location IS DISTINCT FROM public.get_warehouse_location_id(v_actor) THEN
    RETURN json_build_object('success', false, 'error', 'Only the requesting sub-warehouse can confirm receive');
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_variant_id := NULLIF(v_line->>'variant_id', '')::uuid;
    v_qty := COALESCE(
      (v_line->>'quantity')::integer,
      (v_line->>'quantity_this_receive')::integer,
      0
    );
    IF v_variant_id IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT i.open_receive_quantity, i.received_quantity, i.delivered_quantity
      INTO v_open, v_received, v_delivered
    FROM public.internal_stock_request_items i
    WHERE i.request_id = p_request_id AND i.variant_id = v_variant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'Variant not on request');
    END IF;
    IF v_qty > v_open THEN
      RETURN json_build_object('success', false, 'error', 'Receive quantity exceeds unlocked quantity');
    END IF;

    UPDATE public.internal_stock_request_items
    SET received_quantity = received_quantity + v_qty,
        open_receive_quantity = open_receive_quantity - v_qty,
        updated_at = now()
    WHERE request_id = p_request_id AND variant_id = v_variant_id;

    v_history := v_history || jsonb_build_array(
      jsonb_build_object('variant_id', v_variant_id, 'quantity', v_qty)
    );
  END LOOP;

  IF jsonb_array_length(v_history) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Nothing received');
  END IF;

  SELECT
    COALESCE(SUM(GREATEST(0, delivered_quantity - received_quantity)), 0),
    bool_or(open_receive_quantity > 0),
    bool_or(delivered_quantity > received_quantity)
  INTO v_short, v_any_open, v_any_short
  FROM public.internal_stock_request_items
  WHERE request_id = p_request_id;

  IF NOT v_any_short THEN
    v_next_status := 'fully_received';
  ELSE
    v_next_status := 'partially_received';
  END IF;

  IF v_short > 0 AND (p_notes IS NULL OR btrim(p_notes) = '') THEN
    RETURN json_build_object('success', false, 'error', 'Notes are required when confirming a shortage');
  END IF;

  UPDATE public.internal_stock_requests
  SET status = v_next_status,
      receive_notes = COALESCE(nullif(btrim(COALESCE(p_notes, '')), ''), receive_notes),
      updated_at = now()
  WHERE id = p_request_id;

  INSERT INTO public.internal_stock_request_receives (
    request_id, notes, lines, proof_image_url, proof_image_path, proof_image_name,
    signature_url, signature_path, short_quantity, received_by
  ) VALUES (
    p_request_id,
    nullif(btrim(COALESCE(p_notes, '')), ''),
    v_history,
    p_proof_image_url,
    p_proof_image_path,
    p_proof_image_name,
    p_signature_url,
    p_signature_path,
    v_short,
    v_actor
  );

  INSERT INTO public.internal_stock_request_events (
    request_id, event_type, note, lines, short_quantity,
    proof_image_url, proof_image_path, signature_url, signature_path, created_by
  ) VALUES (
    p_request_id, 'receive_confirmed', nullif(btrim(COALESCE(p_notes, '')), ''), v_history, v_short,
    p_proof_image_url, p_proof_image_path, p_signature_url, p_signature_path, v_actor
  );

  RETURN json_build_object(
    'success', true,
    'request_id', p_request_id,
    'status', v_next_status,
    'short_quantity', v_short,
    'has_open_receive', COALESCE(v_any_open, false)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_internal_stock_request_receive(
  uuid, jsonb, text, text, text, text, text, text, uuid
) TO authenticated;

COMMENT ON TABLE public.internal_stock_requests IS
  'Sub → main internal stock requests. Numbers: RN-{location_code}-{####}.';
COMMENT ON FUNCTION public.generate_internal_stock_request_number(uuid, uuid) IS
  'Generates RN-{CODE}-{####} sequenced per company + sub-warehouse location code.';
