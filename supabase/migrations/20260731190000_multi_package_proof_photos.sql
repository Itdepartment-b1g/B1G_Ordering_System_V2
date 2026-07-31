-- Multi package proof photos (max 3): columns, storage, PO receive/event RPCs,
-- internal-stock attach helper + list projection.

-- ---------------------------------------------------------------------------
-- 1) Columns + backfill
-- ---------------------------------------------------------------------------

ALTER TABLE public.purchase_order_deliveries
  ADD COLUMN IF NOT EXISTS proof_image_urls text[],
  ADD COLUMN IF NOT EXISTS proof_image_paths text[],
  ADD COLUMN IF NOT EXISTS buyer_proof_urls text[],
  ADD COLUMN IF NOT EXISTS buyer_proof_paths text[];

COMMENT ON COLUMN public.purchase_order_deliveries.proof_image_urls IS
  'Package photos at warehouse dispatch (max 3 signed URLs).';
COMMENT ON COLUMN public.purchase_order_deliveries.buyer_proof_urls IS
  'Package photos at buyer/TL receive (max 3 signed URLs).';

ALTER TABLE public.purchase_order_events
  ADD COLUMN IF NOT EXISTS proof_image_urls text[],
  ADD COLUMN IF NOT EXISTS proof_image_paths text[];

ALTER TABLE public.internal_stock_requests
  ADD COLUMN IF NOT EXISTS proof_image_urls text[],
  ADD COLUMN IF NOT EXISTS proof_image_paths text[];

ALTER TABLE public.internal_stock_request_events
  ADD COLUMN IF NOT EXISTS proof_image_urls text[],
  ADD COLUMN IF NOT EXISTS proof_image_paths text[];

ALTER TABLE public.internal_stock_request_receives
  ADD COLUMN IF NOT EXISTS proof_image_urls text[],
  ADD COLUMN IF NOT EXISTS proof_image_paths text[];

UPDATE public.purchase_order_deliveries
SET proof_image_urls = ARRAY[proof_of_delivery_url]
WHERE proof_of_delivery_url IS NOT NULL
  AND btrim(proof_of_delivery_url) <> ''
  AND (proof_image_urls IS NULL OR cardinality(proof_image_urls) = 0)
  AND buyer_proof_url IS NULL;

UPDATE public.purchase_order_deliveries
SET buyer_proof_urls = ARRAY[buyer_proof_url],
    proof_image_urls = COALESCE(proof_image_urls, ARRAY[buyer_proof_url])
WHERE buyer_proof_url IS NOT NULL
  AND btrim(buyer_proof_url) <> ''
  AND (buyer_proof_urls IS NULL OR cardinality(buyer_proof_urls) = 0);

UPDATE public.purchase_order_events
SET proof_image_urls = ARRAY[proof_image_url],
    proof_image_paths = CASE
      WHEN proof_image_path IS NOT NULL AND btrim(proof_image_path) <> ''
        THEN ARRAY[proof_image_path]
      ELSE NULL
    END
WHERE proof_image_url IS NOT NULL
  AND btrim(proof_image_url) <> ''
  AND (proof_image_urls IS NULL OR cardinality(proof_image_urls) = 0);

UPDATE public.internal_stock_request_events
SET proof_image_urls = ARRAY[proof_image_url],
    proof_image_paths = CASE
      WHEN proof_image_path IS NOT NULL AND btrim(proof_image_path) <> ''
        THEN ARRAY[proof_image_path]
      ELSE NULL
    END
WHERE proof_image_url IS NOT NULL
  AND btrim(proof_image_url) <> ''
  AND (proof_image_urls IS NULL OR cardinality(proof_image_urls) = 0);

UPDATE public.internal_stock_request_receives
SET proof_image_urls = ARRAY[proof_image_url],
    proof_image_paths = CASE
      WHEN proof_image_path IS NOT NULL AND btrim(proof_image_path) <> ''
        THEN ARRAY[proof_image_path]
      ELSE NULL
    END
WHERE proof_image_url IS NOT NULL
  AND btrim(proof_image_url) <> ''
  AND (proof_image_urls IS NULL OR cardinality(proof_image_urls) = 0);

-- ---------------------------------------------------------------------------
-- 2) Helper
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.normalize_proof_image_urls(
  p_urls text[],
  p_paths text[] DEFAULT NULL,
  p_fallback_url text DEFAULT NULL,
  p_fallback_path text DEFAULT NULL
)
RETURNS TABLE (
  urls text[],
  paths text[],
  first_url text,
  first_path text
)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_urls text[] := ARRAY[]::text[];
  v_paths text[] := ARRAY[]::text[];
  v_url text;
  v_path text;
  i integer;
BEGIN
  IF p_urls IS NOT NULL THEN
    FOREACH v_url IN ARRAY p_urls
    LOOP
      v_url := nullif(btrim(COALESCE(v_url, '')), '');
      IF v_url IS NOT NULL THEN
        v_urls := v_urls || v_url;
      END IF;
    END LOOP;
  END IF;

  IF cardinality(v_urls) = 0 THEN
    v_url := nullif(btrim(COALESCE(p_fallback_url, '')), '');
    IF v_url IS NOT NULL THEN
      v_urls := ARRAY[v_url];
    END IF;
  END IF;

  IF cardinality(v_urls) > 3 THEN
    RAISE EXCEPTION 'Maximum of 3 package photos allowed';
  END IF;

  IF p_paths IS NOT NULL AND cardinality(p_paths) > 0 THEN
    FOR i IN 1..LEAST(cardinality(p_paths), cardinality(v_urls))
    LOOP
      v_path := nullif(btrim(COALESCE(p_paths[i], '')), '');
      IF v_path IS NOT NULL THEN
        v_paths := v_paths || v_path;
      END IF;
    END LOOP;
  ELSIF cardinality(v_urls) > 0 THEN
    v_path := nullif(btrim(COALESCE(p_fallback_path, '')), '');
    IF v_path IS NOT NULL THEN
      v_paths := ARRAY[v_path];
    END IF;
  END IF;

  urls := CASE WHEN cardinality(v_urls) > 0 THEN v_urls ELSE NULL END;
  paths := CASE WHEN cardinality(v_paths) > 0 THEN v_paths ELSE NULL END;
  first_url := CASE WHEN cardinality(v_urls) > 0 THEN v_urls[1] ELSE nullif(btrim(COALESCE(p_fallback_url, '')), '') END;
  first_path := CASE WHEN cardinality(v_paths) > 0 THEN v_paths[1] ELSE nullif(btrim(COALESCE(p_fallback_path, '')), '') END;
  RETURN NEXT;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) Internal stock delivery proofs bucket
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'internal-stock-delivery-proofs',
  'internal-stock-delivery-proofs',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Internal stock proofs: warehouse insert" ON storage.objects;
CREATE POLICY "Internal stock proofs: warehouse insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'internal-stock-delivery-proofs'
    AND public.is_warehouse()
    AND (storage.foldername(name))[1] = public.get_auth_company_id()::text
  );

DROP POLICY IF EXISTS "Internal stock proofs: warehouse select" ON storage.objects;
CREATE POLICY "Internal stock proofs: warehouse select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'internal-stock-delivery-proofs'
    AND public.is_warehouse()
    AND (storage.foldername(name))[1] = public.get_auth_company_id()::text
  );

-- ---------------------------------------------------------------------------
-- 4) log_purchase_order_event — accept proof URL arrays
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.log_purchase_order_event(
  uuid, text, text, jsonb, integer, text, text, text, text, uuid, uuid, timestamptz, uuid
);

CREATE OR REPLACE FUNCTION public.log_purchase_order_event(
  p_purchase_order_id uuid,
  p_event_type text,
  p_note text DEFAULT NULL,
  p_lines jsonb DEFAULT NULL,
  p_short_quantity integer DEFAULT NULL,
  p_proof_image_url text DEFAULT NULL,
  p_proof_image_path text DEFAULT NULL,
  p_signature_url text DEFAULT NULL,
  p_signature_path text DEFAULT NULL,
  p_delivery_id uuid DEFAULT NULL,
  p_created_by uuid DEFAULT auth.uid(),
  p_created_at timestamptz DEFAULT now(),
  p_discrepancy_id uuid DEFAULT NULL,
  p_proof_image_urls text[] DEFAULT NULL,
  p_proof_image_paths text[] DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid;
  v_event_id uuid;
  v_type text;
  v_po RECORD;
  v_company_id uuid;
  v_norm RECORD;
BEGIN
  v_type := lower(btrim(COALESCE(p_event_type, '')));
  IF v_type NOT IN (
    'created',
    'director_approved',
    'admin_submitted',
    'approved',
    'rejected',
    'dispatched',
    'receive_confirmed',
    'cancelled',
    'shortage_opened',
    'shortage_resolved_redeliver',
    'shortage_resolved_write_off_replace',
    'shortage_resolved_write_off'
  ) THEN
    RAISE EXCEPTION 'Invalid purchase_order_events.event_type: %', p_event_type;
  END IF;

  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_purchase_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase order not found';
  END IF;

  v_actor := COALESCE(p_created_by, auth.uid());
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'created_by required when not authenticated';
  END IF;

  IF auth.uid() IS NOT NULL THEN
    v_company_id := public.get_auth_company_id();
    IF v_company_id IS NULL
       OR (
         v_po.company_id IS DISTINCT FROM v_company_id
         AND v_po.warehouse_company_id IS DISTINCT FROM v_company_id
       ) THEN
      RAISE EXCEPTION 'Not allowed to log events for this purchase order';
    END IF;
  END IF;

  SELECT * INTO v_norm
  FROM public.normalize_proof_image_urls(
    p_proof_image_urls,
    p_proof_image_paths,
    p_proof_image_url,
    p_proof_image_path
  );

  INSERT INTO public.purchase_order_events (
    purchase_order_id,
    delivery_id,
    discrepancy_id,
    event_type,
    note,
    lines,
    short_quantity,
    proof_image_url,
    proof_image_path,
    proof_image_urls,
    proof_image_paths,
    signature_url,
    signature_path,
    created_by,
    created_at
  ) VALUES (
    p_purchase_order_id,
    p_delivery_id,
    p_discrepancy_id,
    v_type,
    NULLIF(btrim(COALESCE(p_note, '')), ''),
    CASE WHEN p_lines IS NULL OR p_lines = 'null'::jsonb THEN NULL ELSE p_lines END,
    p_short_quantity,
    v_norm.first_url,
    v_norm.first_path,
    v_norm.urls,
    v_norm.paths,
    NULLIF(btrim(COALESCE(p_signature_url, '')), ''),
    NULLIF(btrim(COALESCE(p_signature_path, '')), ''),
    v_actor,
    COALESCE(p_created_at, now())
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_purchase_order_event(
  uuid, text, text, jsonb, integer, text, text, text, text, uuid, uuid, timestamptz, uuid, text[], text[]
) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) receive_po_delivery — accept package photo arrays
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.receive_po_delivery(uuid, jsonb, text, text, text, text, uuid);

CREATE OR REPLACE FUNCTION public.receive_po_delivery(
  p_delivery_id uuid,
  p_items jsonb,
  p_proof_url text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_signature_url text DEFAULT NULL,
  p_signature_path text DEFAULT NULL,
  p_received_by uuid DEFAULT auth.uid(),
  p_proof_urls text[] DEFAULT NULL,
  p_proof_paths text[] DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  d_rec RECORD;
  po_record RECORD;
  v_receiver RECORD;
  item_rec RECORD;
  v_recv_qty integer;
  v_shortfall integer;
  v_shortfall_reason text;
  v_shortfall_notes text;
  v_buyer_notes text;
  v_client_variant_id uuid;
  v_all_received boolean;
  v_any_open_ship boolean;
  v_any_open_recv boolean;
  v_discrepancy_count integer := 0;
  existing_client_inv RECORD;
  v_alloc_items jsonb := '[]'::jsonb;
  v_alloc_item jsonb;
  v_allocation_id uuid;
  v_alloc_result json;
  v_alloc_variant_id uuid;
  v_alloc_qty integer;
  v_norm RECORD;
BEGIN
  SELECT * INTO d_rec FROM public.purchase_order_deliveries WHERE id = p_delivery_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Delivery not found');
  END IF;

  IF d_rec.status IN ('received', 'delivered', 'cancelled') THEN
    RETURN json_build_object('success', false, 'error', 'Delivery already fully received or cancelled');
  END IF;

  SELECT * INTO po_record FROM public.purchase_orders WHERE id = d_rec.purchase_order_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Purchase order not found');
  END IF;

  SELECT p.id, p.role, p.company_id INTO v_receiver
  FROM public.profiles p
  WHERE p.id = p_received_by;

  IF NOT FOUND OR v_receiver.company_id IS DISTINCT FROM po_record.company_id THEN
    RETURN json_build_object('success', false, 'error', 'Only the buying company can receive this delivery');
  END IF;

  IF v_receiver.role IS DISTINCT FROM 'team_leader'
     OR po_record.assigned_team_leader_id IS DISTINCT FROM p_received_by THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Only the assigned team leader can receive this delivery'
    );
  END IF;

  IF p_signature_url IS NULL OR btrim(p_signature_url) = '' THEN
    RETURN json_build_object('success', false, 'error', 'Buyer signature is required');
  END IF;

  SELECT * INTO v_norm
  FROM public.normalize_proof_image_urls(p_proof_urls, p_proof_paths, p_proof_url, NULL);

  IF v_norm.first_url IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Package photo is required');
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Receive items are required');
  END IF;

  FOR item_rec IN
    SELECT di.*
    FROM public.purchase_order_delivery_items di
    WHERE di.delivery_id = p_delivery_id
  LOOP
    SELECT COALESCE((
      SELECT (elem->>'quantity_received')::int
      FROM jsonb_array_elements(p_items) elem
      WHERE (elem->>'variant_id')::uuid = item_rec.variant_id
      LIMIT 1
    ), -1) INTO v_recv_qty;

    IF v_recv_qty < 0 THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Missing quantity_received for variant',
        'variant_id', item_rec.variant_id
      );
    END IF;

    IF v_recv_qty > item_rec.quantity_dispatched THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Received quantity cannot exceed dispatched quantity',
        'variant_id', item_rec.variant_id,
        'dispatched', item_rec.quantity_dispatched,
        'received', v_recv_qty
      );
    END IF;

    IF item_rec.quantity_received > 0 THEN
      RETURN json_build_object('success', false, 'error', 'Delivery item already received');
    END IF;

    v_shortfall := item_rec.quantity_dispatched - v_recv_qty;

    SELECT NULLIF(btrim(COALESCE((
      SELECT elem->>'shortfall_reason'
      FROM jsonb_array_elements(p_items) elem
      WHERE (elem->>'variant_id')::uuid = item_rec.variant_id
      LIMIT 1
    ), '')), '') INTO v_shortfall_reason;

    SELECT NULLIF(btrim(COALESCE((
      SELECT elem->>'shortfall_notes'
      FROM jsonb_array_elements(p_items) elem
      WHERE (elem->>'variant_id')::uuid = item_rec.variant_id
      LIMIT 1
    ), '')), '') INTO v_shortfall_notes;

    IF v_shortfall > 0 THEN
      IF v_shortfall_reason IS NULL OR v_shortfall_reason NOT IN (
        'missing_in_transit', 'damaged', 'wrong_item', 'other'
      ) THEN
        RETURN json_build_object(
          'success', false,
          'error', 'Shortfall reason is required when receiving less than dispatched',
          'variant_id', item_rec.variant_id,
          'shortfall', v_shortfall
        );
      END IF;

      IF v_shortfall_reason = 'other' AND v_shortfall_notes IS NULL THEN
        RETURN json_build_object(
          'success', false,
          'error', 'Please describe the shortfall when reason is Other',
          'variant_id', item_rec.variant_id,
          'shortfall', v_shortfall
        );
      END IF;
    END IF;

    UPDATE public.purchase_order_delivery_items
    SET quantity_received = v_recv_qty,
        updated_at = NOW()
    WHERE id = item_rec.id;

    IF po_record.company_account_type IS DISTINCT FROM 'Key Accounts' AND v_recv_qty > 0 THEN
      v_client_variant_id := public.ensure_warehouse_client_variant_mapping(
        po_record.company_id,
        po_record.warehouse_company_id,
        item_rec.variant_id,
        p_received_by
      );

      SELECT * INTO existing_client_inv
      FROM public.main_inventory
      WHERE variant_id = v_client_variant_id
        AND company_id = po_record.company_id;

      IF FOUND THEN
        UPDATE public.main_inventory
        SET stock = stock + v_recv_qty,
            updated_at = NOW()
        WHERE variant_id = v_client_variant_id
          AND company_id = po_record.company_id;
      ELSE
        INSERT INTO public.main_inventory (
          company_id, variant_id, stock, unit_price, reorder_level, allocated_stock, created_at, updated_at
        ) VALUES (
          po_record.company_id, v_client_variant_id, v_recv_qty,
          0, 10, 0, NOW(), NOW()
        );
      END IF;

      INSERT INTO public.inventory_transactions (
        company_id, variant_id, transaction_type, quantity,
        reference_type, reference_id, performed_by, notes, created_at
      ) VALUES (
        po_record.company_id, v_client_variant_id, 'warehouse_transfer_in', v_recv_qty,
        'purchase_order', po_record.id, p_received_by,
        'Buyer receive PO ' || po_record.po_number || ' DR ' || COALESCE(d_rec.dr_number, d_rec.id::text),
        NOW()
      );

      v_alloc_items := v_alloc_items || jsonb_build_array(
        jsonb_build_object(
          'variant_id', v_client_variant_id,
          'quantity', v_recv_qty
        )
      );
    END IF;

    IF v_shortfall > 0 AND po_record.warehouse_company_id IS NOT NULL THEN
      v_buyer_notes := NULLIF(
        btrim(
          CONCAT_WS(
            E'\n',
            v_shortfall_notes,
            NULLIF(btrim(COALESCE(p_notes, '')), '')
          )
        ),
        ''
      );

      INSERT INTO public.purchase_order_delivery_discrepancies (
        company_id,
        purchase_order_id,
        delivery_id,
        delivery_item_id,
        warehouse_location_id,
        variant_id,
        quantity,
        reason,
        buyer_notes,
        status,
        reported_by,
        created_at,
        updated_at
      ) VALUES (
        po_record.warehouse_company_id,
        po_record.id,
        p_delivery_id,
        item_rec.id,
        d_rec.warehouse_location_id,
        item_rec.variant_id,
        v_shortfall,
        v_shortfall_reason,
        v_buyer_notes,
        'open',
        p_received_by,
        NOW(),
        NOW()
      );
      v_discrepancy_count := v_discrepancy_count + 1;
    END IF;
  END LOOP;

  IF jsonb_array_length(v_alloc_items) > 0 THEN
    INSERT INTO public.allocation_history (
      company_id,
      allocated_to,
      allocated_by,
      brand_id,
      allocation_type
    ) VALUES (
      po_record.company_id,
      po_record.assigned_team_leader_id,
      p_received_by,
      NULL,
      'main_to_leader'
    )
    RETURNING id INTO v_allocation_id;

    FOR v_alloc_item IN SELECT value FROM jsonb_array_elements(v_alloc_items)
    LOOP
      v_alloc_variant_id := (v_alloc_item->>'variant_id')::uuid;
      v_alloc_qty := (v_alloc_item->>'quantity')::integer;

      v_alloc_result := public.allocate_to_leader(
        po_record.assigned_team_leader_id,
        v_alloc_variant_id,
        v_alloc_qty,
        p_received_by,
        'allocation_history',
        v_allocation_id
      );

      IF COALESCE((v_alloc_result->>'success')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION '%', COALESCE(v_alloc_result->>'error', 'Failed to allocate received stock to team leader');
      END IF;
    END LOOP;
  END IF;

  v_all_received := true;

  UPDATE public.purchase_order_deliveries
  SET status = 'received',
      proof_of_delivery_url = COALESCE(v_norm.first_url, proof_of_delivery_url),
      buyer_proof_url = COALESCE(v_norm.first_url, buyer_proof_url),
      buyer_proof_urls = COALESCE(v_norm.urls, buyer_proof_urls),
      buyer_proof_paths = COALESCE(v_norm.paths, buyer_proof_paths),
      buyer_notes = COALESCE(p_notes, buyer_notes),
      buyer_signature_url = COALESCE(p_signature_url, buyer_signature_url),
      buyer_signature_path = COALESCE(p_signature_path, buyer_signature_path),
      received_by = p_received_by,
      delivered_at = NOW()
  WHERE id = p_delivery_id;

  UPDATE public.warehouse_transfer_location_status s
  SET status = CASE
      WHEN NOT EXISTS (
        SELECT 1
        FROM public.warehouse_transfer_reservations r
        WHERE r.purchase_order_id = s.purchase_order_id
          AND r.warehouse_location_id = s.warehouse_location_id
          AND r.status <> 'cancelled'
          AND (r.quantity_reserved - r.quantity_fulfilled) > 0
      ) THEN 'fulfilled'
      WHEN EXISTS (
        SELECT 1
        FROM public.warehouse_transfer_reservations r
        WHERE r.purchase_order_id = s.purchase_order_id
          AND r.warehouse_location_id = s.warehouse_location_id
          AND r.quantity_fulfilled > 0
          AND r.status <> 'cancelled'
      ) THEN 'partial'
      ELSE 'ready'
    END,
    updated_at = NOW()
  WHERE s.purchase_order_id = po_record.id
    AND s.warehouse_location_id = d_rec.warehouse_location_id;

  SELECT EXISTS (
    SELECT 1
    FROM public.warehouse_transfer_reservations r
    WHERE r.purchase_order_id = po_record.id
      AND r.status <> 'cancelled'
      AND (r.quantity_reserved - r.quantity_fulfilled) > 0
  ) INTO v_any_open_ship;

  SELECT EXISTS (
    SELECT 1
    FROM public.purchase_order_deliveries d
    WHERE d.purchase_order_id = po_record.id
      AND d.status = 'dispatched'
      AND d.id IS DISTINCT FROM p_delivery_id
  ) INTO v_any_open_recv;

  UPDATE public.purchase_orders
  SET
    status = CASE WHEN v_any_open_ship THEN 'partially_fulfilled' ELSE 'fulfilled' END,
    workflow_status = CASE
      WHEN (NOT v_any_open_ship) AND (NOT v_any_open_recv) THEN 'delivered'
      ELSE 'partial_delivered'
    END,
    updated_at = NOW()
  WHERE id = po_record.id;

  IF (NOT v_any_open_ship) AND (NOT v_any_open_recv) THEN
    UPDATE public.purchase_orders po
    SET dr_number = (
      SELECT string_agg(DISTINCT d.dr_number, ', ' ORDER BY d.dr_number)
      FROM public.purchase_order_deliveries d
      WHERE d.purchase_order_id = po.id
        AND d.dr_number IS NOT NULL
        AND COALESCE(d.status, '') <> 'cancelled'
    )
    WHERE po.id = po_record.id;
  END IF;

  RETURN json_build_object(
    'success', true,
    'delivery_id', p_delivery_id,
    'fully_received', v_all_received,
    'po_complete', (NOT v_any_open_ship) AND (NOT v_any_open_recv),
    'discrepancies_opened', v_discrepancy_count,
    'allocation_id', v_allocation_id
  );
END;
$$;

COMMENT ON FUNCTION public.receive_po_delivery(uuid, jsonb, text, text, text, text, uuid, text[], text[]) IS
  'Assigned team leader receives a warehouse-transfer dispatch with up to 3 package photos.';

GRANT EXECUTE ON FUNCTION public.receive_po_delivery(uuid, jsonb, text, text, text, text, uuid, text[], text[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6) Attach multi package URLs after internal-stock deliver/allocate/receive
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.attach_internal_stock_proof_image_urls(
  p_request_id uuid,
  p_event_type text,
  p_proof_image_urls text[],
  p_proof_image_paths text[] DEFAULT NULL,
  p_receive_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_company_id uuid;
  v_norm RECORD;
  v_event_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT r.company_id INTO v_company_id
  FROM public.internal_stock_requests r
  WHERE r.id = p_request_id;

  IF v_company_id IS NULL OR v_company_id IS DISTINCT FROM public.get_auth_company_id() THEN
    RETURN json_build_object('success', false, 'error', 'Request not found');
  END IF;

  SELECT * INTO v_norm
  FROM public.normalize_proof_image_urls(p_proof_image_urls, p_proof_image_paths, NULL, NULL);

  IF v_norm.first_url IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'At least one package photo URL is required');
  END IF;

  SELECT e.id INTO v_event_id
  FROM public.internal_stock_request_events e
  WHERE e.request_id = p_request_id
    AND e.event_type = lower(btrim(COALESCE(p_event_type, '')))
  ORDER BY e.created_at DESC
  LIMIT 1;

  IF v_event_id IS NOT NULL THEN
    UPDATE public.internal_stock_request_events
    SET proof_image_url = v_norm.first_url,
        proof_image_path = v_norm.first_path,
        proof_image_urls = v_norm.urls,
        proof_image_paths = v_norm.paths
    WHERE id = v_event_id;
  END IF;

  IF lower(btrim(COALESCE(p_event_type, ''))) IN ('delivered', 'remaining_released') THEN
    UPDATE public.internal_stock_requests
    SET proof_image_urls = v_norm.urls,
        proof_image_paths = v_norm.paths,
        updated_at = now()
    WHERE id = p_request_id;
  END IF;

  IF p_receive_id IS NOT NULL THEN
    UPDATE public.internal_stock_request_receives
    SET proof_image_url = v_norm.first_url,
        proof_image_path = v_norm.first_path,
        proof_image_urls = v_norm.urls,
        proof_image_paths = v_norm.paths
    WHERE id = p_receive_id
      AND request_id = p_request_id;
  ELSIF lower(btrim(COALESCE(p_event_type, ''))) = 'receive_confirmed' THEN
    UPDATE public.internal_stock_request_receives
    SET proof_image_url = v_norm.first_url,
        proof_image_path = v_norm.first_path,
        proof_image_urls = v_norm.urls,
        proof_image_paths = v_norm.paths
    WHERE id = (
      SELECT r.id
      FROM public.internal_stock_request_receives r
      WHERE r.request_id = p_request_id
      ORDER BY r.received_at DESC NULLS LAST, r.id DESC
      LIMIT 1
    );
  END IF;

  RETURN json_build_object(
    'success', true,
    'request_id', p_request_id,
    'event_id', v_event_id,
    'proof_count', COALESCE(cardinality(v_norm.urls), 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.attach_internal_stock_proof_image_urls(uuid, text, text[], text[], uuid)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 7) list_internal_stock_requests_for_caller — project proof_image_urls
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_internal_stock_requests_for_caller(
  p_from_location_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_role text;
  v_loc uuid;
  v_is_main boolean;
  v_ids uuid[];
  v_result jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT p.company_id, p.role INTO v_company, v_role
  FROM public.profiles p
  WHERE p.id = v_uid;

  IF v_company IS NULL OR v_role IS DISTINCT FROM 'warehouse' THEN
    RETURN '[]'::jsonb;
  END IF;

  v_loc := public.get_warehouse_location_id(v_uid);
  v_is_main := public.is_main_warehouse_user(v_uid);

  IF NOT v_is_main AND v_loc IS NOT NULL THEN
    SELECT COALESCE(wl.is_main, false) INTO v_is_main
    FROM public.warehouse_locations wl
    WHERE wl.id = v_loc AND wl.company_id = v_company;
  END IF;

  SELECT ARRAY_AGG(r.id ORDER BY r.created_at DESC)
  INTO v_ids
  FROM public.internal_stock_requests r
  WHERE r.company_id = v_company
    AND (
      v_is_main
      OR (v_loc IS NOT NULL AND r.from_location_id = v_loc)
    )
    AND (p_from_location_id IS NULL OR r.from_location_id = p_from_location_id)
    AND (p_status IS NULL OR btrim(p_status) = '' OR p_status = 'all' OR r.status = p_status);

  IF v_ids IS NULL OR cardinality(v_ids) = 0 THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.created_at DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      r.id,
      r.company_id,
      r.request_number,
      r.from_location_id,
      r.status,
      r.initiation_type,
      r.notes,
      r.receive_notes,
      r.rejection_reason,
      r.requested_by,
      r.approved_at,
      r.approved_by,
      r.approval_signature_url,
      r.delivered_at,
      r.delivered_by,
      r.dr_number,
      r.rider_name,
      r.rider_plate_number,
      r.rider_photo_url,
      r.rider_photo_path,
      r.proof_image_urls,
      r.proof_image_paths,
      r.rejected_at,
      r.rejected_by,
      r.rejection_signature_url,
      r.created_at,
      r.updated_at,
      jsonb_build_object(
        'id', wl.id,
        'name', wl.name,
        'code', wl.code
      ) AS from_location,
      CASE
        WHEN req_p.id IS NULL THEN NULL
        ELSE jsonb_build_object('id', req_p.id, 'full_name', req_p.full_name)
      END AS requested_by_user,
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', i.id,
            'request_id', i.request_id,
            'variant_id', i.variant_id,
            'requested_quantity', i.requested_quantity,
            'delivered_quantity', i.delivered_quantity,
            'received_quantity', i.received_quantity,
            'open_receive_quantity', i.open_receive_quantity,
            'variant', jsonb_build_object(
              'id', v.id,
              'name', v.name,
              'brand', CASE
                WHEN b.id IS NULL THEN NULL
                ELSE jsonb_build_object('id', b.id, 'name', b.name)
              END
            )
          )
          ORDER BY v.name NULLS LAST
        )
        FROM public.internal_stock_request_items i
        LEFT JOIN public.variants v ON v.id = i.variant_id
        LEFT JOIN public.brands b ON b.id = v.brand_id
        WHERE i.request_id = r.id
      ), '[]'::jsonb) AS items,
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', e.id,
            'request_id', e.request_id,
            'event_type', e.event_type,
            'note', e.note,
            'lines', e.lines,
            'short_quantity', e.short_quantity,
            'proof_image_url', e.proof_image_url,
            'proof_image_urls', e.proof_image_urls,
            'signature_url', e.signature_url,
            'rider_name', e.rider_name,
            'rider_plate_number', e.rider_plate_number,
            'rider_photo_url', e.rider_photo_url,
            'dr_number', e.dr_number,
            'created_by', e.created_by,
            'created_at', e.created_at,
            'created_by_user', CASE
              WHEN ep.id IS NULL THEN NULL
              ELSE jsonb_build_object('full_name', ep.full_name)
            END
          )
          ORDER BY e.created_at ASC
        )
        FROM public.internal_stock_request_events e
        LEFT JOIN public.profiles ep ON ep.id = e.created_by
        WHERE e.request_id = r.id
      ), '[]'::jsonb) AS events
    FROM public.internal_stock_requests r
    LEFT JOIN public.warehouse_locations wl ON wl.id = r.from_location_id
    LEFT JOIN public.profiles req_p ON req_p.id = r.requested_by
    WHERE r.id = ANY (v_ids)
  ) x;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_internal_stock_requests_for_caller(uuid, text) TO authenticated;
