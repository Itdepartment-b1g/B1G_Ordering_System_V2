-- Purchase order lifecycle events (timeline history), mirrored after internal_stock_request_events.

CREATE TABLE IF NOT EXISTS public.purchase_order_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  delivery_id uuid REFERENCES public.purchase_order_deliveries(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (
    event_type IN (
      'created',
      'approved',
      'rejected',
      'dispatched',
      'receive_confirmed',
      'cancelled'
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

CREATE INDEX IF NOT EXISTS idx_purchase_order_events_po
  ON public.purchase_order_events(purchase_order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_purchase_order_events_delivery
  ON public.purchase_order_events(delivery_id)
  WHERE delivery_id IS NOT NULL;

ALTER TABLE public.purchase_order_events ENABLE ROW LEVEL SECURITY;

-- SELECT: same visibility as parent purchase_orders (nested RLS applies).
DROP POLICY IF EXISTS "PO events: select via parent" ON public.purchase_order_events;
CREATE POLICY "PO events: select via parent"
  ON public.purchase_order_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.purchase_orders po
      WHERE po.id = purchase_order_events.purchase_order_id
    )
  );

-- No direct INSERT/UPDATE/DELETE for authenticated; use log_purchase_order_event.

GRANT SELECT ON public.purchase_order_events TO authenticated;

-- ---------------------------------------------------------------------------
-- Helper: insert a PO history event (callable from app + other RPCs)
-- ---------------------------------------------------------------------------
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
  p_created_at timestamptz DEFAULT now()
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
BEGIN
  v_type := lower(btrim(COALESCE(p_event_type, '')));
  IF v_type NOT IN (
    'created', 'approved', 'rejected', 'dispatched', 'receive_confirmed', 'cancelled'
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

  -- When called by a client session, require tenant/hub membership on the PO.
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

  INSERT INTO public.purchase_order_events (
    purchase_order_id,
    delivery_id,
    event_type,
    note,
    lines,
    short_quantity,
    proof_image_url,
    proof_image_path,
    signature_url,
    signature_path,
    created_by,
    created_at
  ) VALUES (
    p_purchase_order_id,
    p_delivery_id,
    v_type,
    NULLIF(btrim(COALESCE(p_note, '')), ''),
    CASE WHEN p_lines IS NULL OR p_lines = 'null'::jsonb THEN NULL ELSE p_lines END,
    p_short_quantity,
    NULLIF(btrim(COALESCE(p_proof_image_url, '')), ''),
    NULLIF(btrim(COALESCE(p_proof_image_path, '')), ''),
    NULLIF(btrim(COALESCE(p_signature_url, '')), ''),
    NULLIF(btrim(COALESCE(p_signature_path, '')), ''),
    v_actor,
    COALESCE(p_created_at, now())
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

COMMENT ON FUNCTION public.log_purchase_order_event(
  uuid, text, text, jsonb, integer, text, text, text, text, uuid, uuid, timestamptz
) IS
  'Append a purchase_order_events row for PO timeline history.';

GRANT EXECUTE ON FUNCTION public.log_purchase_order_event(
  uuid, text, text, jsonb, integer, text, text, text, text, uuid, uuid, timestamptz
) TO authenticated;

-- ---------------------------------------------------------------------------
-- Log approved event inside approve_multi_location_po (warehouse transfer)
-- Body matches 20260413160000_fix_approve_multi_location_po_stock_source.sql
-- plus purchase_order_events insert.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_multi_location_po(p_po_id uuid, p_approver_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  po_record RECORD;
  v_approver RECORD;
  rec RECORD;
  loc_stock integer;
  main_available integer;
  v_is_main_location boolean;
  v_lines jsonb;
BEGIN
  SELECT * INTO po_record FROM public.purchase_orders WHERE id = p_po_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Purchase order not found');
  END IF;

  IF po_record.fulfillment_type IS DISTINCT FROM 'warehouse_transfer' THEN
    RETURN json_build_object('success', false, 'error', 'Not a warehouse transfer purchase order');
  END IF;

  -- Approver must be main warehouse user of the PO warehouse company.
  SELECT p.id, p.role, p.company_id INTO v_approver
  FROM public.profiles p
  WHERE p.id = p_approver_id;

  IF NOT FOUND OR v_approver.role IS DISTINCT FROM 'warehouse' THEN
    RETURN json_build_object('success', false, 'error', 'Only warehouse users can approve this purchase order');
  END IF;
  IF v_approver.company_id IS DISTINCT FROM po_record.warehouse_company_id THEN
    RETURN json_build_object('success', false, 'error', 'Approver warehouse company does not match purchase order warehouse');
  END IF;
  IF NOT public.is_main_warehouse_user(p_approver_id) THEN
    RETURN json_build_object('success', false, 'error', 'Only main warehouse users can approve multi-location POs');
  END IF;

  -- Assignment guard (same as existing transfer approval)
  IF NOT EXISTS (
    SELECT 1
    FROM public.warehouse_company_assignments wca
    JOIN public.profiles wp ON wp.id = wca.warehouse_user_id
    WHERE wca.client_company_id = po_record.company_id
      AND wp.company_id = po_record.warehouse_company_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Warehouse is not assigned to fulfill orders for this company');
  END IF;

  -- Validate items (must have per-item location)
  IF EXISTS (
    SELECT 1
    FROM public.purchase_order_items poi
    WHERE poi.purchase_order_id = p_po_id
      AND poi.warehouse_location_id IS NULL
  ) THEN
    RETURN json_build_object('success', false, 'error', 'All items must have a warehouse location for multi-location approval');
  END IF;

  -- Validate stock per location+variant aggregated, and create reservation rows.
  FOR rec IN
    SELECT
      poi.company_id AS client_company_id,
      poi.warehouse_location_id,
      poi.variant_id,
      SUM(poi.quantity)::int AS quantity
    FROM public.purchase_order_items poi
    WHERE poi.purchase_order_id = p_po_id
    GROUP BY poi.company_id, poi.warehouse_location_id, poi.variant_id
  LOOP
    -- Ensure location belongs to this warehouse company and determine if it's main.
    SELECT COALESCE(wl.is_main, false) INTO v_is_main_location
    FROM public.warehouse_locations wl
    WHERE wl.id = rec.warehouse_location_id
      AND wl.company_id = po_record.warehouse_company_id;

    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'Invalid warehouse location for this PO');
    END IF;

    IF v_is_main_location THEN
      SELECT (mi.stock - COALESCE(mi.allocated_stock, 0))::int INTO main_available
      FROM public.main_inventory mi
      WHERE mi.company_id = po_record.warehouse_company_id
        AND mi.variant_id = rec.variant_id;

      IF main_available IS NULL OR main_available < rec.quantity THEN
        RETURN json_build_object('success', false, 'error', 'Insufficient stock for one or more requested locations');
      END IF;
    ELSE
      SELECT COALESCE(wli.stock, 0) INTO loc_stock
      FROM public.warehouse_location_inventory wli
      WHERE wli.company_id = po_record.warehouse_company_id
        AND wli.location_id = rec.warehouse_location_id
        AND wli.variant_id = rec.variant_id;

      IF NOT FOUND OR loc_stock < rec.quantity THEN
        RETURN json_build_object('success', false, 'error', 'Insufficient stock for one or more requested locations');
      END IF;
    END IF;

    INSERT INTO public.warehouse_transfer_reservations (
      purchase_order_id,
      warehouse_company_id,
      warehouse_location_id,
      variant_id,
      quantity_reserved,
      quantity_fulfilled,
      status,
      created_by
    ) VALUES (
      p_po_id,
      po_record.warehouse_company_id,
      rec.warehouse_location_id,
      rec.variant_id,
      rec.quantity,
      0,
      'reserved',
      p_approver_id
    )
    ON CONFLICT (purchase_order_id, warehouse_location_id, variant_id) DO UPDATE
    SET quantity_reserved = EXCLUDED.quantity_reserved,
        quantity_fulfilled = 0,
        status = 'reserved',
        updated_at = NOW();

    INSERT INTO public.warehouse_transfer_location_status (
      purchase_order_id,
      warehouse_company_id,
      warehouse_location_id,
      status
    ) VALUES (
      p_po_id,
      po_record.warehouse_company_id,
      rec.warehouse_location_id,
      'ready'
    )
    ON CONFLICT (purchase_order_id, warehouse_location_id) DO UPDATE
    SET status = 'ready',
        updated_at = NOW();
  END LOOP;

  UPDATE public.purchase_orders
  SET status = 'approved_for_fulfillment',
      approved_by = p_approver_id,
      approved_at = NOW()
  WHERE id = p_po_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'variant_id', x.variant_id,
        'quantity', x.quantity,
        'variant_name', x.variant_name,
        'brand_name', x.brand_name
      )
      ORDER BY x.variant_name
    ),
    '[]'::jsonb
  )
  INTO v_lines
  FROM (
    SELECT
      poi.variant_id,
      SUM(poi.quantity)::int AS quantity,
      MAX(v.name) AS variant_name,
      MAX(b.name) AS brand_name
    FROM public.purchase_order_items poi
    LEFT JOIN public.variants v ON v.id = poi.variant_id
    LEFT JOIN public.brands b ON b.id = v.brand_id
    WHERE poi.purchase_order_id = p_po_id
    GROUP BY poi.variant_id
  ) x;

  PERFORM public.log_purchase_order_event(
    p_po_id,
    'approved',
    NULL,
    v_lines,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    p_approver_id,
    NOW()
  );

  RETURN json_build_object('success', true, 'po_number', po_record.po_number);
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_multi_location_po(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Backfill timeline from existing POs + deliveries (idempotent-ish: only if no events)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  po RECORD;
  d RECORD;
  v_lines jsonb;
  v_recv_lines jsonb;
  v_short integer;
BEGIN
  FOR po IN
    SELECT p.*
    FROM public.purchase_orders p
    WHERE NOT EXISTS (
      SELECT 1 FROM public.purchase_order_events e WHERE e.purchase_order_id = p.id
    )
  LOOP
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'variant_id', x.variant_id,
          'quantity', x.quantity,
          'variant_name', x.variant_name,
          'brand_name', x.brand_name
        )
      ),
      '[]'::jsonb
    )
    INTO v_lines
    FROM (
      SELECT
        poi.variant_id,
        SUM(poi.quantity)::int AS quantity,
        MAX(v.name) AS variant_name,
        MAX(b.name) AS brand_name
      FROM public.purchase_order_items poi
      LEFT JOIN public.variants v ON v.id = poi.variant_id
      LEFT JOIN public.brands b ON b.id = v.brand_id
      WHERE poi.purchase_order_id = po.id
      GROUP BY poi.variant_id
    ) x;

    INSERT INTO public.purchase_order_events (
      purchase_order_id, event_type, note, lines, created_by, created_at
    ) VALUES (
      po.id,
      'created',
      po.notes,
      v_lines,
      po.created_by,
      po.created_at
    );

    IF po.approved_at IS NOT NULL AND po.status IS DISTINCT FROM 'rejected' THEN
      INSERT INTO public.purchase_order_events (
        purchase_order_id, event_type, lines, created_by, created_at
      ) VALUES (
        po.id,
        'approved',
        v_lines,
        po.approved_by,
        po.approved_at
      );
    END IF;

    IF po.status = 'rejected' THEN
      INSERT INTO public.purchase_order_events (
        purchase_order_id, event_type, created_by, created_at
      ) VALUES (
        po.id,
        'rejected',
        COALESCE(po.approved_by, po.created_by),
        COALESCE(po.approved_at, po.created_at)
      );
    END IF;

    FOR d IN
      SELECT *
      FROM public.purchase_order_deliveries del
      WHERE del.purchase_order_id = po.id
      ORDER BY COALESCE(del.dispatched_at, del.created_at)
    LOOP
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'variant_id', di.variant_id,
            'quantity', di.quantity_dispatched,
            'variant_name', v.name,
            'brand_name', b.name
          )
        ),
        '[]'::jsonb
      )
      INTO v_lines
      FROM public.purchase_order_delivery_items di
      LEFT JOIN public.variants v ON v.id = di.variant_id
      LEFT JOIN public.brands b ON b.id = v.brand_id
      WHERE di.delivery_id = d.id;

      INSERT INTO public.purchase_order_events (
        purchase_order_id, delivery_id, event_type, note, lines,
        proof_image_url, signature_url, created_by, created_at
      ) VALUES (
        po.id,
        d.id,
        'dispatched',
        d.notes,
        v_lines,
        d.rider_photo_url,
        d.warehouse_signature_url,
        d.created_by,
        COALESCE(d.dispatched_at, d.created_at)
      );

      IF COALESCE(d.status, '') IN ('received', 'delivered', 'partially_received')
         OR d.delivered_at IS NOT NULL
         OR d.received_by IS NOT NULL THEN
        SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'variant_id', di.variant_id,
              'quantity', di.quantity_received,
              'variant_name', v.name,
              'brand_name', b.name
            )
          ),
          '[]'::jsonb
        ),
        COALESCE(SUM(GREATEST(0, di.quantity_dispatched - di.quantity_received)), 0)::int
        INTO v_recv_lines, v_short
        FROM public.purchase_order_delivery_items di
        LEFT JOIN public.variants v ON v.id = di.variant_id
        LEFT JOIN public.brands b ON b.id = v.brand_id
        WHERE di.delivery_id = d.id
          AND di.quantity_received > 0;

        IF v_recv_lines IS NOT NULL AND v_recv_lines <> '[]'::jsonb THEN
          INSERT INTO public.purchase_order_events (
            purchase_order_id, delivery_id, event_type, note, lines, short_quantity,
            proof_image_url, signature_url, created_by, created_at
          ) VALUES (
            po.id,
            d.id,
            'receive_confirmed',
            d.buyer_notes,
            v_recv_lines,
            v_short,
            d.buyer_proof_url,
            d.buyer_signature_url,
            d.received_by,
            COALESCE(d.delivered_at, d.dispatched_at, d.created_at)
          );
        END IF;
      END IF;

      IF COALESCE(d.status, '') = 'cancelled' OR d.cancelled_at IS NOT NULL THEN
        SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'variant_id', di.variant_id,
              'quantity', di.quantity_dispatched,
              'variant_name', v.name,
              'brand_name', b.name
            )
          ),
          '[]'::jsonb
        )
        INTO v_lines
        FROM public.purchase_order_delivery_items di
        LEFT JOIN public.variants v ON v.id = di.variant_id
        LEFT JOIN public.brands b ON b.id = v.brand_id
        WHERE di.delivery_id = d.id;

        INSERT INTO public.purchase_order_events (
          purchase_order_id, delivery_id, event_type, note, lines,
          proof_image_url, signature_url, created_by, created_at
        ) VALUES (
          po.id,
          d.id,
          'cancelled',
          d.cancel_notes,
          v_lines,
          d.cancel_proof_url,
          d.cancel_signature_url,
          d.cancelled_by,
          COALESCE(d.cancelled_at, d.dispatched_at, d.created_at)
        );
      END IF;
    END LOOP;
  END LOOP;
END;
$$;
