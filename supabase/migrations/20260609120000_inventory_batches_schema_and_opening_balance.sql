-- Inventory batch / lot tracking for warehouse hub companies.
-- Supports FIFO consumption, lot transfers (main <-> sub), and days-in-warehouse aging.

-- ---------------------------------------------------------------------------
-- 1) Batch number counter (per company, per YYYY-MM)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_batch_number_counters (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  year_month text NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, year_month)
);

-- ---------------------------------------------------------------------------
-- 2) inventory_batches (receipt / opening-balance header)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_batches (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  batch_number text NOT NULL,
  source_type text NOT NULL CHECK (
    source_type IN (
      'opening_balance',
      'stock_request_receive',
      'adjustment_in'
    )
  ),
  stock_request_id uuid,
  status text NOT NULL DEFAULT 'complete' CHECK (status IN ('partial', 'complete')),
  received_at timestamp with time zone NOT NULL DEFAULT now(),
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT inventory_batches_company_batch_number_key UNIQUE (company_id, batch_number)
);

CREATE INDEX IF NOT EXISTS idx_inventory_batches_company_received
  ON public.inventory_batches(company_id, received_at);

DROP TRIGGER IF EXISTS update_inventory_batches_updated_at ON public.inventory_batches;
CREATE TRIGGER update_inventory_batches_updated_at
  BEFORE UPDATE ON public.inventory_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 3) inventory_batch_lots (qty per variant per location per batch)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_batch_lots (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.inventory_batches(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.variants(id) ON DELETE CASCADE,
  warehouse_location_id uuid NOT NULL REFERENCES public.warehouse_locations(id) ON DELETE CASCADE,
  quantity_received integer NOT NULL CHECK (quantity_received >= 0),
  quantity_remaining integer NOT NULL CHECK (quantity_remaining >= 0),
  received_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT inventory_batch_lots_qty_remaining_lte_received
    CHECK (quantity_remaining <= quantity_received),
  CONSTRAINT inventory_batch_lots_batch_variant_location_key
    UNIQUE (batch_id, variant_id, warehouse_location_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_batch_lots_fifo
  ON public.inventory_batch_lots(company_id, warehouse_location_id, variant_id, received_at, created_at);

CREATE INDEX IF NOT EXISTS idx_inventory_batch_lots_batch
  ON public.inventory_batch_lots(batch_id);

DROP TRIGGER IF EXISTS update_inventory_batch_lots_updated_at ON public.inventory_batch_lots;
CREATE TRIGGER update_inventory_batch_lots_updated_at
  BEFORE UPDATE ON public.inventory_batch_lots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 4) inventory_batch_movements (audit ledger)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_batch_movements (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lot_id uuid NOT NULL REFERENCES public.inventory_batch_lots(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.inventory_batches(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.variants(id) ON DELETE CASCADE,
  warehouse_location_id uuid NOT NULL REFERENCES public.warehouse_locations(id) ON DELETE CASCADE,
  movement_type text NOT NULL CHECK (
    movement_type IN (
      'receive',
      'allocate_out',
      'allocate_in',
      'return_out',
      'return_in',
      'fulfill_out',
      'adjustment_in',
      'adjustment_out',
      'opening_balance'
    )
  ),
  quantity integer NOT NULL CHECK (quantity > 0),
  reference_type text,
  reference_id uuid,
  from_location_id uuid REFERENCES public.warehouse_locations(id) ON DELETE SET NULL,
  to_location_id uuid REFERENCES public.warehouse_locations(id) ON DELETE SET NULL,
  performed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_batch_movements_company_created
  ON public.inventory_batch_movements(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_batch_movements_lot
  ON public.inventory_batch_movements(lot_id);

-- ---------------------------------------------------------------------------
-- 5) Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_main_warehouse_location_id(p_company_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT wl.id
  FROM public.warehouse_locations wl
  WHERE wl.company_id = p_company_id
    AND wl.is_main = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.generate_inventory_batch_number(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_year_month text;
  v_next integer;
BEGIN
  v_year_month := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');

  INSERT INTO public.inventory_batch_number_counters (company_id, year_month, last_number)
  VALUES (p_company_id, v_year_month, 1)
  ON CONFLICT (company_id, year_month)
  DO UPDATE SET last_number = public.inventory_batch_number_counters.last_number + 1
  RETURNING last_number INTO v_next;

  RETURN 'BATCH-' || v_year_month || '-' || lpad(v_next::text, 5, '0');
END;
$$;

-- FIFO consume: stock leaves a location (fulfill PO, disposal, negative adjustment).
CREATE OR REPLACE FUNCTION public.consume_inventory_lots_fifo(
  p_company_id uuid,
  p_warehouse_location_id uuid,
  p_variant_id uuid,
  p_quantity integer,
  p_movement_type text,
  p_reference_type text DEFAULT NULL,
  p_reference_id uuid DEFAULT NULL,
  p_performed_by uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_remaining integer;
  v_lot RECORD;
  v_take integer;
  v_consumed jsonb := '[]'::jsonb;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Quantity must be positive');
  END IF;

  v_remaining := p_quantity;

  FOR v_lot IN
    SELECT ibl.*
    FROM public.inventory_batch_lots ibl
    WHERE ibl.company_id = p_company_id
      AND ibl.warehouse_location_id = p_warehouse_location_id
      AND ibl.variant_id = p_variant_id
      AND ibl.quantity_remaining > 0
    ORDER BY ibl.received_at ASC, ibl.created_at ASC
    FOR UPDATE OF ibl
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_take := LEAST(v_lot.quantity_remaining, v_remaining);

    UPDATE public.inventory_batch_lots
    SET quantity_remaining = quantity_remaining - v_take,
        updated_at = now()
    WHERE id = v_lot.id;

    INSERT INTO public.inventory_batch_movements (
      company_id, lot_id, batch_id, variant_id, warehouse_location_id,
      movement_type, quantity, reference_type, reference_id,
      from_location_id, performed_by, notes
    ) VALUES (
      p_company_id, v_lot.id, v_lot.batch_id, p_variant_id, p_warehouse_location_id,
      p_movement_type, v_take, p_reference_type, p_reference_id,
      p_warehouse_location_id, p_performed_by, p_notes
    );

    v_consumed := v_consumed || jsonb_build_object(
      'lot_id', v_lot.id,
      'batch_id', v_lot.batch_id,
      'quantity', v_take
    );

    v_remaining := v_remaining - v_take;
  END LOOP;

  IF v_remaining > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient batch lot stock',
      'shortfall', v_remaining
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'consumed', v_consumed, 'quantity', p_quantity);
END;
$$;

-- Transfer lots between locations (allocate main->sub FIFO, return sub->main LIFO).
CREATE OR REPLACE FUNCTION public.transfer_inventory_lots(
  p_company_id uuid,
  p_from_location_id uuid,
  p_to_location_id uuid,
  p_variant_id uuid,
  p_quantity integer,
  p_transfer_order text,
  p_out_movement_type text,
  p_in_movement_type text,
  p_reference_type text DEFAULT NULL,
  p_reference_id uuid DEFAULT NULL,
  p_performed_by uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_remaining integer;
  v_lot RECORD;
  v_take integer;
  v_dest_lot_id uuid;
  v_transferred jsonb := '[]'::jsonb;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Quantity must be positive');
  END IF;

  IF p_transfer_order NOT IN ('fifo', 'lifo') THEN
    RETURN jsonb_build_object('success', false, 'error', 'transfer_order must be fifo or lifo');
  END IF;

  v_remaining := p_quantity;

  FOR v_lot IN
    SELECT ibl.*
    FROM public.inventory_batch_lots ibl
    WHERE ibl.company_id = p_company_id
      AND ibl.warehouse_location_id = p_from_location_id
      AND ibl.variant_id = p_variant_id
      AND ibl.quantity_remaining > 0
    ORDER BY
      CASE WHEN p_transfer_order = 'lifo' THEN ibl.received_at END DESC NULLS LAST,
      CASE WHEN p_transfer_order = 'fifo' THEN ibl.received_at END ASC NULLS LAST,
      ibl.created_at ASC
    FOR UPDATE OF ibl
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_take := LEAST(v_lot.quantity_remaining, v_remaining);

    UPDATE public.inventory_batch_lots
    SET quantity_remaining = quantity_remaining - v_take,
        updated_at = now()
    WHERE id = v_lot.id;

    INSERT INTO public.inventory_batch_lots (
      company_id, batch_id, variant_id, warehouse_location_id,
      quantity_received, quantity_remaining, received_at
    ) VALUES (
      p_company_id, v_lot.batch_id, p_variant_id, p_to_location_id,
      v_take, v_take, v_lot.received_at
    )
    ON CONFLICT (batch_id, variant_id, warehouse_location_id)
    DO UPDATE SET
      quantity_received = public.inventory_batch_lots.quantity_received + EXCLUDED.quantity_received,
      quantity_remaining = public.inventory_batch_lots.quantity_remaining + EXCLUDED.quantity_remaining,
      updated_at = now()
    RETURNING id INTO v_dest_lot_id;

    INSERT INTO public.inventory_batch_movements (
      company_id, lot_id, batch_id, variant_id, warehouse_location_id,
      movement_type, quantity, reference_type, reference_id,
      from_location_id, to_location_id, performed_by, notes
    ) VALUES
    (
      p_company_id, v_lot.id, v_lot.batch_id, p_variant_id, p_from_location_id,
      p_out_movement_type, v_take, p_reference_type, p_reference_id,
      p_from_location_id, p_to_location_id, p_performed_by, p_notes
    ),
    (
      p_company_id, v_dest_lot_id, v_lot.batch_id, p_variant_id, p_to_location_id,
      p_in_movement_type, v_take, p_reference_type, p_reference_id,
      p_from_location_id, p_to_location_id, p_performed_by, p_notes
    );

    v_transferred := v_transferred || jsonb_build_object(
      'batch_id', v_lot.batch_id,
      'from_lot_id', v_lot.id,
      'to_lot_id', v_dest_lot_id,
      'quantity', v_take
    );

    v_remaining := v_remaining - v_take;
  END LOOP;

  IF v_remaining > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient batch lot stock to transfer',
      'shortfall', v_remaining
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'transferred', v_transferred, 'quantity', p_quantity);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_main_warehouse_location_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_inventory_batch_number(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_inventory_lots_fifo(uuid, uuid, uuid, integer, text, text, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_inventory_lots(uuid, uuid, uuid, uuid, integer, text, text, text, text, uuid, uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6) Opening balance: seed Batch 1 from current warehouse inventory
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_company RECORD;
  v_main_loc_id uuid;
  v_batch_id uuid;
  v_batch_number text;
  v_received_at timestamptz;
  v_lot_id uuid;
  v_variant_id uuid;
  v_main_qty integer;
  v_sub RECORD;
BEGIN
  v_received_at := now();

  FOR v_company IN
    SELECT DISTINCT wl.company_id
    FROM public.warehouse_locations wl
  LOOP
    v_main_loc_id := public.get_main_warehouse_location_id(v_company.company_id);
    IF v_main_loc_id IS NULL THEN
      CONTINUE;
    END IF;

    -- Skip if opening balance already exists for this company
    IF EXISTS (
      SELECT 1
      FROM public.inventory_batches ib
      WHERE ib.company_id = v_company.company_id
        AND ib.source_type = 'opening_balance'
    ) THEN
      CONTINUE;
    END IF;

    v_batch_number := public.generate_inventory_batch_number(v_company.company_id);

    INSERT INTO public.inventory_batches (
      company_id, batch_number, source_type, status, received_at, notes
    ) VALUES (
      v_company.company_id,
      v_batch_number,
      'opening_balance',
      'complete',
      v_received_at,
      'Opening balance migrated from existing inventory'
    )
    RETURNING id INTO v_batch_id;

    -- Main location lots: physical stock at main = stock - allocated_stock
    FOR v_main_qty, v_variant_id IN
      SELECT
        GREATEST(0, mi.stock - COALESCE(mi.allocated_stock, 0))::integer,
        mi.variant_id
      FROM public.main_inventory mi
      WHERE mi.company_id = v_company.company_id
        AND GREATEST(0, mi.stock - COALESCE(mi.allocated_stock, 0)) > 0
    LOOP
      INSERT INTO public.inventory_batch_lots (
        company_id, batch_id, variant_id, warehouse_location_id,
        quantity_received, quantity_remaining, received_at
      ) VALUES (
        v_company.company_id, v_batch_id, v_variant_id, v_main_loc_id,
        v_main_qty, v_main_qty, v_received_at
      )
      RETURNING id INTO v_lot_id;

      INSERT INTO public.inventory_batch_movements (
        company_id, lot_id, batch_id, variant_id, warehouse_location_id,
        movement_type, quantity, reference_type, notes
      ) VALUES (
        v_company.company_id, v_lot_id, v_batch_id, v_variant_id, v_main_loc_id,
        'opening_balance', v_main_qty, 'opening_balance',
        'Opening balance at main warehouse'
      );
    END LOOP;

    -- Sub-warehouse location lots
    FOR v_sub IN
      SELECT wli.location_id, wli.variant_id, wli.stock
      FROM public.warehouse_location_inventory wli
      JOIN public.warehouse_locations wl ON wl.id = wli.location_id
      WHERE wli.company_id = v_company.company_id
        AND wl.is_main = false
        AND wli.stock > 0
    LOOP
      INSERT INTO public.inventory_batch_lots (
        company_id, batch_id, variant_id, warehouse_location_id,
        quantity_received, quantity_remaining, received_at
      ) VALUES (
        v_company.company_id, v_batch_id, v_sub.variant_id, v_sub.location_id,
        v_sub.stock, v_sub.stock, v_received_at
      )
      ON CONFLICT (batch_id, variant_id, warehouse_location_id)
      DO UPDATE SET
        quantity_received = EXCLUDED.quantity_received,
        quantity_remaining = EXCLUDED.quantity_remaining,
        updated_at = now()
      RETURNING id INTO v_lot_id;

      INSERT INTO public.inventory_batch_movements (
        company_id, lot_id, batch_id, variant_id, warehouse_location_id,
        movement_type, quantity, reference_type, notes
      ) VALUES (
        v_company.company_id, v_lot_id, v_batch_id, v_sub.variant_id, v_sub.location_id,
        'opening_balance', v_sub.stock, 'opening_balance',
        'Opening balance at sub-warehouse'
      );
    END LOOP;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7) RLS (read-only for warehouse users; writes via SECURITY DEFINER RPCs)
-- ---------------------------------------------------------------------------
ALTER TABLE public.inventory_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_batch_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_batch_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_batch_number_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Inventory batches: sysadmin all" ON public.inventory_batches;
CREATE POLICY "Inventory batches: sysadmin all"
  ON public.inventory_batches FOR ALL
  USING (public.is_system_administrator())
  WITH CHECK (public.is_system_administrator());

DROP POLICY IF EXISTS "Inventory batches: warehouse select own company" ON public.inventory_batches;
CREATE POLICY "Inventory batches: warehouse select own company"
  ON public.inventory_batches FOR SELECT
  USING (
    public.is_warehouse()
    AND company_id = public.get_auth_company_id()
  );

DROP POLICY IF EXISTS "Inventory batch lots: sysadmin all" ON public.inventory_batch_lots;
CREATE POLICY "Inventory batch lots: sysadmin all"
  ON public.inventory_batch_lots FOR ALL
  USING (public.is_system_administrator())
  WITH CHECK (public.is_system_administrator());

DROP POLICY IF EXISTS "Inventory batch lots: warehouse select own company" ON public.inventory_batch_lots;
CREATE POLICY "Inventory batch lots: warehouse select own company"
  ON public.inventory_batch_lots FOR SELECT
  USING (
    public.is_warehouse()
    AND company_id = public.get_auth_company_id()
    AND (
      public.is_main_warehouse_user(auth.uid())
      OR warehouse_location_id = public.get_warehouse_location_id(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Inventory batch movements: sysadmin all" ON public.inventory_batch_movements;
CREATE POLICY "Inventory batch movements: sysadmin all"
  ON public.inventory_batch_movements FOR ALL
  USING (public.is_system_administrator())
  WITH CHECK (public.is_system_administrator());

DROP POLICY IF EXISTS "Inventory batch movements: warehouse select own company" ON public.inventory_batch_movements;
CREATE POLICY "Inventory batch movements: warehouse select own company"
  ON public.inventory_batch_movements FOR SELECT
  USING (
    public.is_warehouse()
    AND company_id = public.get_auth_company_id()
    AND (
      public.is_main_warehouse_user(auth.uid())
      OR warehouse_location_id = public.get_warehouse_location_id(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Inventory batch counters: sysadmin all" ON public.inventory_batch_number_counters;
CREATE POLICY "Inventory batch counters: sysadmin all"
  ON public.inventory_batch_number_counters FOR ALL
  USING (public.is_system_administrator())
  WITH CHECK (public.is_system_administrator());

GRANT SELECT ON public.inventory_batches TO authenticated;
GRANT SELECT ON public.inventory_batch_lots TO authenticated;
GRANT SELECT ON public.inventory_batch_movements TO authenticated;

COMMENT ON TABLE public.inventory_batches IS
  'Warehouse inventory receipt batches. Each receive event gets BATCH-YYYY-MM-#####. Opening balance seeded once per hub company.';
COMMENT ON TABLE public.inventory_batch_lots IS
  'Remaining qty per variant per warehouse location per batch. Same batch_id follows stock main<->sub transfers.';
COMMENT ON TABLE public.inventory_batch_movements IS
  'Audit ledger for batch lot receives, transfers, fulfillments, and adjustments.';
