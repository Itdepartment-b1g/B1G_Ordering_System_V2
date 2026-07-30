-- Soft reservations for warehouse-transfer POs that are not yet warehouse-approved.
-- Standard Accounts: while status = pending
-- Key Accounts: while workflow_status in (kam_pending, director_pending, admin_pending, warehouse_reserved)
--   (warehouse_reserved included so stock stays blocked until hard reservation is created on approve)

CREATE TABLE IF NOT EXISTS public.warehouse_transfer_soft_reservations (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  warehouse_company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  warehouse_location_id uuid NOT NULL REFERENCES public.warehouse_locations(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.variants(id) ON DELETE CASCADE,
  quantity_committed integer NOT NULL CHECK (quantity_committed >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (
    status = ANY (ARRAY['active'::text, 'released'::text, 'converted'::text])
  ),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT warehouse_transfer_soft_reservations_unique
    UNIQUE (purchase_order_id, warehouse_location_id, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_wtsr_po
  ON public.warehouse_transfer_soft_reservations(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_wtsr_company_variant
  ON public.warehouse_transfer_soft_reservations(warehouse_company_id, variant_id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_wtsr_location_variant
  ON public.warehouse_transfer_soft_reservations(warehouse_location_id, variant_id)
  WHERE status = 'active';

DROP TRIGGER IF EXISTS update_wtsr_updated_at ON public.warehouse_transfer_soft_reservations;
CREATE TRIGGER update_wtsr_updated_at
  BEFORE UPDATE ON public.warehouse_transfer_soft_reservations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.warehouse_transfer_soft_reservations ENABLE ROW LEVEL SECURITY;

-- Warehouse hub users can read soft reservations for their company/location
DROP POLICY IF EXISTS "Warehouse can read transfer soft reservations"
  ON public.warehouse_transfer_soft_reservations;
CREATE POLICY "Warehouse can read transfer soft reservations"
  ON public.warehouse_transfer_soft_reservations FOR SELECT
  TO authenticated
  USING (
    public.is_warehouse()
    AND warehouse_company_id = public.get_auth_company_id()
    AND (
      public.is_main_warehouse_user(auth.uid())
      OR warehouse_location_id = public.get_warehouse_location_id(auth.uid())
    )
  );

-- Linked buyer companies can read hub soft reservations (ATP display when creating POs)
DROP POLICY IF EXISTS "Linked clients can read hub transfer soft reservations"
  ON public.warehouse_transfer_soft_reservations;
CREATE POLICY "Linked clients can read hub transfer soft reservations"
  ON public.warehouse_transfer_soft_reservations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.warehouse_company_assignments wca
      JOIN public.profiles wp ON wp.id = wca.warehouse_user_id
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE wca.client_company_id = p.company_id
        AND wp.company_id = warehouse_transfer_soft_reservations.warehouse_company_id
    )
  );

GRANT SELECT ON public.warehouse_transfer_soft_reservations TO authenticated;

-- ---------------------------------------------------------------------------
-- Eligibility helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.po_should_soft_reserve(p_po public.purchase_orders)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT
    p_po.fulfillment_type = 'warehouse_transfer'
    AND p_po.warehouse_company_id IS NOT NULL
    AND p_po.status IS DISTINCT FROM 'rejected'
    AND p_po.status IS DISTINCT FROM 'cancelled'
    AND p_po.status IS DISTINCT FROM 'approved_for_fulfillment'
    AND p_po.status IS DISTINCT FROM 'partially_fulfilled'
    AND p_po.status IS DISTINCT FROM 'fulfilled'
    AND p_po.status IS DISTINCT FROM 'approved'
    AND (
      (
        COALESCE(p_po.company_account_type, 'Standard Accounts') = 'Key Accounts'
        AND p_po.workflow_status = ANY (
          ARRAY[
            'kam_pending'::text,
            'director_pending'::text,
            'admin_pending'::text,
            'warehouse_reserved'::text
          ]
        )
      )
      OR (
        COALESCE(p_po.company_account_type, 'Standard Accounts') IS DISTINCT FROM 'Key Accounts'
        AND p_po.status = 'pending'
      )
    );
$$;

COMMENT ON FUNCTION public.po_should_soft_reserve(public.purchase_orders) IS
  'True when a warehouse-transfer PO should hold soft (pre-approval) stock commitments.';

-- ---------------------------------------------------------------------------
-- Sync soft reservations for one PO from its line items
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_warehouse_transfer_soft_reservations(p_po_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  po_record public.purchase_orders%ROWTYPE;
  rec RECORD;
  v_seen_keys text[] := ARRAY[]::text[];
  v_key text;
BEGIN
  SELECT * INTO po_record FROM public.purchase_orders WHERE id = p_po_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF NOT public.po_should_soft_reserve(po_record) THEN
    UPDATE public.warehouse_transfer_soft_reservations
    SET status = CASE
          WHEN status = 'converted' THEN status
          ELSE 'released'
        END,
        updated_at = NOW()
    WHERE purchase_order_id = p_po_id
      AND status = 'active';
    RETURN;
  END IF;

  FOR rec IN
    SELECT
      COALESCE(poi.warehouse_location_id, po_record.warehouse_location_id) AS warehouse_location_id,
      poi.variant_id,
      SUM(poi.quantity)::int AS quantity
    FROM public.purchase_order_items poi
    WHERE poi.purchase_order_id = p_po_id
      AND poi.variant_id IS NOT NULL
    GROUP BY COALESCE(poi.warehouse_location_id, po_record.warehouse_location_id), poi.variant_id
  LOOP
    IF rec.warehouse_location_id IS NULL OR rec.quantity IS NULL OR rec.quantity <= 0 THEN
      CONTINUE;
    END IF;

    -- Location must belong to the hub company
    IF NOT EXISTS (
      SELECT 1
      FROM public.warehouse_locations wl
      WHERE wl.id = rec.warehouse_location_id
        AND wl.company_id = po_record.warehouse_company_id
    ) THEN
      CONTINUE;
    END IF;

    v_key := rec.warehouse_location_id::text || ':' || rec.variant_id::text;
    v_seen_keys := array_append(v_seen_keys, v_key);

    INSERT INTO public.warehouse_transfer_soft_reservations (
      purchase_order_id,
      warehouse_company_id,
      warehouse_location_id,
      variant_id,
      quantity_committed,
      status
    ) VALUES (
      p_po_id,
      po_record.warehouse_company_id,
      rec.warehouse_location_id,
      rec.variant_id,
      rec.quantity,
      'active'
    )
    ON CONFLICT (purchase_order_id, warehouse_location_id, variant_id) DO UPDATE
    SET quantity_committed = EXCLUDED.quantity_committed,
        warehouse_company_id = EXCLUDED.warehouse_company_id,
        status = 'active',
        updated_at = NOW();
  END LOOP;

  -- Release active rows no longer represented by line items
  UPDATE public.warehouse_transfer_soft_reservations s
  SET status = 'released',
      updated_at = NOW()
  WHERE s.purchase_order_id = p_po_id
    AND s.status = 'active'
    AND NOT (
      (s.warehouse_location_id::text || ':' || s.variant_id::text) = ANY (v_seen_keys)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_warehouse_transfer_soft_reservations(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Open soft commitment helper (ATP)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.warehouse_open_transfer_soft_reserved(
  p_warehouse_company_id uuid,
  p_variant_id uuid,
  p_location_id uuid DEFAULT NULL,
  p_exclude_po_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(SUM(s.quantity_committed), 0)::int
  FROM public.warehouse_transfer_soft_reservations s
  WHERE s.warehouse_company_id = p_warehouse_company_id
    AND s.variant_id = p_variant_id
    AND s.status = 'active'
    AND s.quantity_committed > 0
    AND (p_location_id IS NULL OR s.warehouse_location_id = p_location_id)
    AND (p_exclude_po_id IS NULL OR s.purchase_order_id IS DISTINCT FROM p_exclude_po_id);
$$;

GRANT EXECUTE ON FUNCTION public.warehouse_open_transfer_soft_reserved(uuid, uuid, uuid, uuid)
  TO authenticated;

-- Hard + soft open holds (fulfill / allocate ATP). Soft is excluded for the same PO via p_exclude_po_id.
CREATE OR REPLACE FUNCTION public.warehouse_open_transfer_reserved(
  p_warehouse_company_id uuid,
  p_variant_id uuid,
  p_location_id uuid DEFAULT NULL,
  p_exclude_po_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT (
    COALESCE((
      SELECT SUM(r.quantity_reserved - r.quantity_fulfilled)::int
      FROM public.warehouse_transfer_reservations r
      WHERE r.warehouse_company_id = p_warehouse_company_id
        AND r.variant_id = p_variant_id
        AND r.status IN ('reserved', 'partial')
        AND (r.quantity_reserved - r.quantity_fulfilled) > 0
        AND (p_location_id IS NULL OR r.warehouse_location_id = p_location_id)
        AND (p_exclude_po_id IS NULL OR r.purchase_order_id IS DISTINCT FROM p_exclude_po_id)
    ), 0)
    + public.warehouse_open_transfer_soft_reserved(
      p_warehouse_company_id,
      p_variant_id,
      p_location_id,
      p_exclude_po_id
    )
  )::int;
$$;

GRANT EXECUTE ON FUNCTION public.warehouse_open_transfer_reserved(uuid, uuid, uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Mark soft rows converted when hard reservation is created
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.convert_warehouse_transfer_soft_reservations(p_po_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.warehouse_transfer_soft_reservations
  SET status = 'converted',
      updated_at = NOW()
  WHERE purchase_order_id = p_po_id
    AND status = 'active';
END;
$$;

GRANT EXECUTE ON FUNCTION public.convert_warehouse_transfer_soft_reservations(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Triggers: keep soft reservations in sync
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_sync_soft_reservations_from_po()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.fulfillment_type IS DISTINCT FROM 'warehouse_transfer'
       AND OLD.fulfillment_type IS DISTINCT FROM 'warehouse_transfer' THEN
      RETURN NEW;
    END IF;
    IF NEW.status IS NOT DISTINCT FROM OLD.status
       AND NEW.workflow_status IS NOT DISTINCT FROM OLD.workflow_status
       AND NEW.warehouse_company_id IS NOT DISTINCT FROM OLD.warehouse_company_id
       AND NEW.warehouse_location_id IS NOT DISTINCT FROM OLD.warehouse_location_id
       AND NEW.company_account_type IS NOT DISTINCT FROM OLD.company_account_type
       AND NEW.fulfillment_type IS NOT DISTINCT FROM OLD.fulfillment_type THEN
      RETURN NEW;
    END IF;
  END IF;

  PERFORM public.sync_warehouse_transfer_soft_reservations(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_po_sync_soft_reservations ON public.purchase_orders;
CREATE TRIGGER trg_po_sync_soft_reservations
  AFTER INSERT OR UPDATE OF status, workflow_status, warehouse_company_id,
    warehouse_location_id, company_account_type, fulfillment_type
  ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_soft_reservations_from_po();

CREATE OR REPLACE FUNCTION public.trg_sync_soft_reservations_from_poi()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_po_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_po_id := OLD.purchase_order_id;
  ELSE
    v_po_id := NEW.purchase_order_id;
  END IF;

  PERFORM public.sync_warehouse_transfer_soft_reservations(v_po_id);
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_poi_sync_soft_reservations ON public.purchase_order_items;
CREATE TRIGGER trg_poi_sync_soft_reservations
  AFTER INSERT OR UPDATE OF quantity, variant_id, warehouse_location_id OR DELETE
  ON public.purchase_order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_soft_reservations_from_poi();

-- ---------------------------------------------------------------------------
-- approve_multi_location_po: subtract soft (excl. this PO) + convert soft on success
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
  v_open_other integer;
BEGIN
  SELECT * INTO po_record FROM public.purchase_orders WHERE id = p_po_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Purchase order not found');
  END IF;

  IF po_record.fulfillment_type IS DISTINCT FROM 'warehouse_transfer' THEN
    RETURN json_build_object('success', false, 'error', 'Not a warehouse transfer purchase order');
  END IF;

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

  IF NOT EXISTS (
    SELECT 1
    FROM public.warehouse_company_assignments wca
    JOIN public.profiles wp ON wp.id = wca.warehouse_user_id
    WHERE wca.client_company_id = po_record.company_id
      AND wp.company_id = po_record.warehouse_company_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Warehouse is not assigned to fulfill orders for this company');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.purchase_order_items poi
    WHERE poi.purchase_order_id = p_po_id
      AND poi.warehouse_location_id IS NULL
  ) THEN
    RETURN json_build_object('success', false, 'error', 'All items must have a warehouse location for multi-location approval');
  END IF;

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
    SELECT COALESCE(wl.is_main, false) INTO v_is_main_location
    FROM public.warehouse_locations wl
    WHERE wl.id = rec.warehouse_location_id
      AND wl.company_id = po_record.warehouse_company_id;

    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'Invalid warehouse location for this PO');
    END IF;

    -- Exclude this PO so its own soft commitment is not double-counted against itself
    v_open_other := public.warehouse_open_transfer_reserved(
      po_record.warehouse_company_id,
      rec.variant_id,
      rec.warehouse_location_id,
      p_po_id
    );

    IF v_is_main_location THEN
      SELECT (mi.stock - COALESCE(mi.allocated_stock, 0))::int INTO main_available
      FROM public.main_inventory mi
      WHERE mi.company_id = po_record.warehouse_company_id
        AND mi.variant_id = rec.variant_id;

      IF main_available IS NULL
         OR (main_available - COALESCE(v_open_other, 0)) < rec.quantity THEN
        RETURN json_build_object('success', false, 'error', 'Insufficient stock for one or more requested locations');
      END IF;
    ELSE
      SELECT COALESCE(wli.stock, 0) INTO loc_stock
      FROM public.warehouse_location_inventory wli
      WHERE wli.company_id = po_record.warehouse_company_id
        AND wli.location_id = rec.warehouse_location_id
        AND wli.variant_id = rec.variant_id;

      IF NOT FOUND
         OR (loc_stock - COALESCE(v_open_other, 0)) < rec.quantity THEN
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

  -- Soft -> hard: release soft commitments so ATP does not double-count
  PERFORM public.convert_warehouse_transfer_soft_reservations(p_po_id);

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
-- get_available_stock: also subtract active soft reservations at main location
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_available_stock(p_variant_id uuid, p_company_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_stock integer;
  v_allocated integer;
  v_main_location_id uuid;
  v_open_hold integer;
BEGIN
  SELECT stock, COALESCE(allocated_stock, 0)
  INTO v_stock, v_allocated
  FROM public.main_inventory
  WHERE variant_id = p_variant_id AND company_id = p_company_id;

  SELECT wl.id INTO v_main_location_id
  FROM public.warehouse_locations wl
  WHERE wl.company_id = p_company_id
    AND COALESCE(wl.is_main, false) = true
  LIMIT 1;

  v_open_hold := CASE
    WHEN v_main_location_id IS NULL THEN 0
    ELSE public.warehouse_open_transfer_reserved(
      p_company_id,
      p_variant_id,
      v_main_location_id,
      NULL
    )
  END;

  RETURN GREATEST(
    0,
    COALESCE(v_stock, 0) - COALESCE(v_allocated, 0) - COALESCE(v_open_hold, 0)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Backfill soft reservations for open transfer POs
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT po.id
    FROM public.purchase_orders po
    WHERE po.fulfillment_type = 'warehouse_transfer'
      AND public.po_should_soft_reserve(po)
  LOOP
    PERFORM public.sync_warehouse_transfer_soft_reservations(r.id);
  END LOOP;
END;
$$;
