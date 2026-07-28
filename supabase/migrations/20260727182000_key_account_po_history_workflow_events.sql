-- Key Account PO history: capture director approve + sales admin submit-to-warehouse.

ALTER TABLE public.purchase_order_events
  DROP CONSTRAINT IF EXISTS purchase_order_events_event_type_check;

ALTER TABLE public.purchase_order_events
  ADD CONSTRAINT purchase_order_events_event_type_check CHECK (
    event_type = ANY (ARRAY[
      'created'::text,
      'director_approved'::text,
      'admin_submitted'::text,
      'approved'::text,
      'rejected'::text,
      'dispatched'::text,
      'receive_confirmed'::text,
      'cancelled'::text,
      'shortage_opened'::text,
      'shortage_resolved_redeliver'::text,
      'shortage_resolved_write_off_replace'::text,
      'shortage_resolved_write_off'::text
    ])
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
  p_discrepancy_id uuid DEFAULT NULL
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
  uuid, text, text, jsonb, integer, text, text, text, text, uuid, uuid, timestamptz, uuid
) IS
  'Append a purchase_order_events row for PO timeline history (includes Key Account workflow + shortage events).';

GRANT EXECUTE ON FUNCTION public.log_purchase_order_event(
  uuid, text, text, jsonb, integer, text, text, text, text, uuid, uuid, timestamptz, uuid
) TO authenticated;
