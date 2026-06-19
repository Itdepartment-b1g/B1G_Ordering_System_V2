-- Phase 3: Audited warehouse stock adjustments (replaces manual add/edit stock on main inventory).

-- ---------------------------------------------------------------------------
-- 1) Adjustment batch number counter (ADJ-YYYY-MM-00001)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_adjustment_number_counters (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  year_month text NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, year_month)
);

-- ---------------------------------------------------------------------------
-- 2) warehouse_stock_adjustments (audit log)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.warehouse_stock_adjustments (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  warehouse_location_id uuid NOT NULL REFERENCES public.warehouse_locations(id) ON DELETE RESTRICT,
  variant_id uuid NOT NULL REFERENCES public.variants(id) ON DELETE RESTRICT,
  direction text NOT NULL CHECK (direction IN ('in', 'out')),
  quantity integer NOT NULL CHECK (quantity > 0),
  reason text NOT NULL,
  notes text,
  batch_id uuid REFERENCES public.inventory_batches(id) ON DELETE SET NULL,
  performed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_warehouse_stock_adjustments_company_created
  ON public.warehouse_stock_adjustments(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_warehouse_stock_adjustments_location
  ON public.warehouse_stock_adjustments(warehouse_location_id);

-- ---------------------------------------------------------------------------
-- 3) Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_inventory_adjustment_batch_number(p_company_id uuid)
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

  INSERT INTO public.inventory_adjustment_number_counters (company_id, year_month, last_number)
  VALUES (p_company_id, v_year_month, 1)
  ON CONFLICT (company_id, year_month)
  DO UPDATE SET last_number = public.inventory_adjustment_number_counters.last_number + 1
  RETURNING last_number INTO v_next;

  RETURN 'ADJ-' || v_year_month || '-' || lpad(v_next::text, 5, '0');
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) receive_inventory_lots_to_main — add optional transaction type
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.receive_inventory_lots_to_main(
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
  timestamptz,
  text,
  uuid,
  uuid,
  text
);

CREATE OR REPLACE FUNCTION public.receive_inventory_lots_to_main(
  p_company_id uuid,
  p_batch_id uuid,
  p_main_location_id uuid,
  p_variant_id uuid,
  p_quantity integer,
  p_received_at timestamptz,
  p_reference_type text,
  p_reference_id uuid,
  p_performed_by uuid,
  p_notes text DEFAULT NULL,
  p_transaction_type text DEFAULT 'warehouse_stock_receive'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lot_id uuid;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Quantity must be positive');
  END IF;

  INSERT INTO public.inventory_batch_lots (
    company_id, batch_id, variant_id, warehouse_location_id,
    quantity_received, quantity_remaining, received_at
  ) VALUES (
    p_company_id, p_batch_id, p_variant_id, p_main_location_id,
    p_quantity, p_quantity, p_received_at
  )
  ON CONFLICT (batch_id, variant_id, warehouse_location_id)
  DO UPDATE SET
    quantity_received = public.inventory_batch_lots.quantity_received + EXCLUDED.quantity_received,
    quantity_remaining = public.inventory_batch_lots.quantity_remaining + EXCLUDED.quantity_remaining,
    updated_at = now()
  RETURNING id INTO v_lot_id;

  INSERT INTO public.inventory_batch_movements (
    company_id, lot_id, batch_id, variant_id, warehouse_location_id,
    movement_type, quantity, reference_type, reference_id,
    to_location_id, performed_by, notes
  ) VALUES (
    p_company_id, v_lot_id, p_batch_id, p_variant_id, p_main_location_id,
    'receive', p_quantity, p_reference_type, p_reference_id,
    p_main_location_id, p_performed_by, p_notes
  );

  IF EXISTS (
    SELECT 1 FROM public.main_inventory mi
    WHERE mi.company_id = p_company_id AND mi.variant_id = p_variant_id
  ) THEN
    UPDATE public.main_inventory
    SET stock = stock + p_quantity,
        last_restocked_at = p_received_at,
        updated_at = now()
    WHERE company_id = p_company_id AND variant_id = p_variant_id;
  ELSE
    INSERT INTO public.main_inventory (
      company_id, variant_id, stock, unit_price, reorder_level, last_restocked_at, created_at, updated_at
    ) VALUES (
      p_company_id, p_variant_id, p_quantity, 0, 10, p_received_at, now(), now()
    );
  END IF;

  INSERT INTO public.inventory_transactions (
    company_id, variant_id, transaction_type, quantity,
    reference_type, reference_id, performed_by, notes, created_at
  ) VALUES (
    p_company_id, p_variant_id, p_transaction_type, p_quantity,
    p_reference_type, p_reference_id, p_performed_by, p_notes, now()
  );

  RETURN jsonb_build_object('success', true, 'lot_id', v_lot_id, 'quantity', p_quantity);
END;
$$;

-- ---------------------------------------------------------------------------
-- 5) apply_warehouse_stock_adjustment
--    Positive (in): new ADJ batch + lots at location + credit aggregate stock.
--    Negative (out): FIFO consume lots at location + debit aggregate stock.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_warehouse_stock_adjustment(
  p_warehouse_location_id uuid,
  p_variant_id uuid,
  p_quantity_delta integer,
  p_reason text,
  p_notes text DEFAULT NULL,
  p_performed_by uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid;
  v_company_id uuid;
  v_is_main boolean;
  v_qty integer;
  v_batch_id uuid;
  v_batch_number text;
  v_adjustment_id uuid;
  v_received_at timestamptz;
  v_main_available integer;
  v_loc_stock integer;
  v_allocated integer;
  v_receive_result jsonb;
  v_consume_result jsonb;
  v_direction text;
  v_lot_id uuid;
BEGIN
  v_actor := COALESCE(p_performed_by, auth.uid());
  v_received_at := now();

  IF p_quantity_delta IS NULL OR p_quantity_delta = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Adjustment quantity cannot be zero');
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RETURN json_build_object('success', false, 'error', 'A reason of at least 3 characters is required');
  END IF;

  SELECT wl.company_id, wl.is_main INTO v_company_id, v_is_main
  FROM public.warehouse_locations wl
  WHERE wl.id = p_warehouse_location_id;

  IF v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Warehouse location not found');
  END IF;

  IF NOT (
    public.is_system_administrator()
    OR (
      public.is_warehouse()
      AND public.is_main_warehouse_user(v_actor)
      AND v_company_id = public.get_auth_company_id()
    )
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Only main warehouse users can apply stock adjustments');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.variants v
    WHERE v.id = p_variant_id AND v.company_id = v_company_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Variant not found');
  END IF;

  v_qty := abs(p_quantity_delta);
  v_direction := CASE WHEN p_quantity_delta > 0 THEN 'in' ELSE 'out' END;

  IF v_direction = 'out' THEN
    IF v_is_main THEN
      SELECT
        GREATEST(0, mi.stock - COALESCE(mi.allocated_stock, 0))::int
      INTO v_main_available
      FROM public.main_inventory mi
      WHERE mi.company_id = v_company_id AND mi.variant_id = p_variant_id;

      IF v_main_available IS NULL OR v_main_available < v_qty THEN
        RETURN json_build_object('success', false, 'error', 'Insufficient available stock at main warehouse');
      END IF;
    ELSE
      SELECT wli.stock, COALESCE(mi.allocated_stock, 0)
      INTO v_loc_stock, v_allocated
      FROM public.warehouse_location_inventory wli
      LEFT JOIN public.main_inventory mi
        ON mi.company_id = wli.company_id AND mi.variant_id = wli.variant_id
      WHERE wli.company_id = v_company_id
        AND wli.location_id = p_warehouse_location_id
        AND wli.variant_id = p_variant_id;

      IF v_loc_stock IS NULL OR v_loc_stock < v_qty THEN
        RETURN json_build_object('success', false, 'error', 'Insufficient stock at sub-warehouse location');
      END IF;
    END IF;

    v_consume_result := public.consume_inventory_lots_fifo(
      v_company_id,
      p_warehouse_location_id,
      p_variant_id,
      v_qty,
      'adjustment_out',
      'warehouse_stock_adjustment',
      NULL,
      v_actor,
      trim(p_reason) || COALESCE(' — ' || p_notes, '')
    );

    IF NOT COALESCE((v_consume_result->>'success')::boolean, false) THEN
      RETURN json_build_object(
        'success', false,
        'error', COALESCE(v_consume_result->>'error', 'Failed to consume batch lots')
      );
    END IF;

    IF v_is_main THEN
      UPDATE public.main_inventory
      SET stock = GREATEST(0, stock - v_qty),
          updated_at = now()
      WHERE company_id = v_company_id AND variant_id = p_variant_id;
    ELSE
      UPDATE public.warehouse_location_inventory
      SET stock = stock - v_qty,
          updated_at = now()
      WHERE company_id = v_company_id
        AND location_id = p_warehouse_location_id
        AND variant_id = p_variant_id;

      UPDATE public.main_inventory
      SET allocated_stock = GREATEST(0, COALESCE(allocated_stock, 0) - v_qty),
          updated_at = now()
      WHERE company_id = v_company_id AND variant_id = p_variant_id;
    END IF;

    INSERT INTO public.inventory_transactions (
      company_id, variant_id, transaction_type, quantity,
      reference_type, performed_by, notes, created_at
    ) VALUES (
      v_company_id, p_variant_id, 'adjustment', v_qty,
      'warehouse_stock_adjustment', v_actor,
      'Adjustment out: ' || trim(p_reason) || COALESCE(' — ' || p_notes, ''),
      now()
    );

    INSERT INTO public.warehouse_stock_adjustments (
      company_id, warehouse_location_id, variant_id,
      direction, quantity, reason, notes, performed_by
    ) VALUES (
      v_company_id, p_warehouse_location_id, p_variant_id,
      'out', v_qty, trim(p_reason), p_notes, v_actor
    )
    RETURNING id INTO v_adjustment_id;

    RETURN json_build_object(
      'success', true,
      'adjustment_id', v_adjustment_id,
      'direction', 'out',
      'quantity', v_qty
    );
  END IF;

  -- Direction IN
  v_batch_number := public.generate_inventory_adjustment_batch_number(v_company_id);

  INSERT INTO public.inventory_batches (
    company_id, batch_number, source_type, status, received_at, notes, created_by
  ) VALUES (
    v_company_id, v_batch_number, 'adjustment_in', 'complete',
    v_received_at, 'Stock adjustment in: ' || trim(p_reason), v_actor
  )
  RETURNING id INTO v_batch_id;

  IF v_is_main THEN
    v_receive_result := public.receive_inventory_lots_to_main(
      v_company_id,
      v_batch_id,
      p_warehouse_location_id,
      p_variant_id,
      v_qty,
      v_received_at,
      'warehouse_stock_adjustment',
      NULL,
      v_actor,
      'Adjustment in: ' || trim(p_reason) || COALESCE(' — ' || p_notes, ''),
      'adjustment'
    );
  ELSE
    INSERT INTO public.inventory_batch_lots (
      company_id, batch_id, variant_id, warehouse_location_id,
      quantity_received, quantity_remaining, received_at
    ) VALUES (
      v_company_id, v_batch_id, p_variant_id, p_warehouse_location_id,
      v_qty, v_qty, v_received_at
    )
    ON CONFLICT (batch_id, variant_id, warehouse_location_id)
    DO UPDATE SET
      quantity_received = public.inventory_batch_lots.quantity_received + EXCLUDED.quantity_received,
      quantity_remaining = public.inventory_batch_lots.quantity_remaining + EXCLUDED.quantity_remaining,
      updated_at = now()
    RETURNING id INTO v_lot_id;

    INSERT INTO public.inventory_batch_movements (
      company_id, lot_id, batch_id, variant_id, warehouse_location_id,
      movement_type, quantity, reference_type,
      to_location_id, performed_by, notes
    ) VALUES (
      v_company_id, v_lot_id, v_batch_id, p_variant_id, p_warehouse_location_id,
      'adjustment_in', v_qty, 'warehouse_stock_adjustment',
      p_warehouse_location_id, v_actor,
      'Adjustment in: ' || trim(p_reason) || COALESCE(' — ' || p_notes, '')
    );

    INSERT INTO public.warehouse_location_inventory (company_id, location_id, variant_id, stock)
    VALUES (v_company_id, p_warehouse_location_id, p_variant_id, v_qty)
    ON CONFLICT (location_id, variant_id)
    DO UPDATE SET stock = public.warehouse_location_inventory.stock + EXCLUDED.stock,
                  updated_at = now();

    IF EXISTS (
      SELECT 1 FROM public.main_inventory mi
      WHERE mi.company_id = v_company_id AND mi.variant_id = p_variant_id
    ) THEN
      UPDATE public.main_inventory
      SET stock = stock + v_qty,
          allocated_stock = COALESCE(allocated_stock, 0) + v_qty,
          last_restocked_at = v_received_at,
          updated_at = now()
      WHERE company_id = v_company_id AND variant_id = p_variant_id;
    ELSE
      INSERT INTO public.main_inventory (
        company_id, variant_id, stock, allocated_stock,
        unit_price, reorder_level, last_restocked_at, created_at, updated_at
      ) VALUES (
        v_company_id, p_variant_id, v_qty, v_qty,
        0, 10, v_received_at, now(), now()
      );
    END IF;

    INSERT INTO public.inventory_transactions (
      company_id, variant_id, transaction_type, quantity,
      reference_type, performed_by, notes, created_at
    ) VALUES (
      v_company_id, p_variant_id, 'adjustment', v_qty,
      'warehouse_stock_adjustment', v_actor,
      'Adjustment in (sub): ' || trim(p_reason) || COALESCE(' — ' || p_notes, ''),
      now()
    );

    v_receive_result := jsonb_build_object('success', true);
  END IF;

  IF NOT COALESCE((v_receive_result->>'success')::boolean, false) THEN
    RETURN json_build_object(
      'success', false,
      'error', COALESCE(v_receive_result->>'error', 'Failed to receive adjustment lots')
    );
  END IF;

  INSERT INTO public.warehouse_stock_adjustments (
    company_id, warehouse_location_id, variant_id,
    direction, quantity, reason, notes, batch_id, performed_by
  ) VALUES (
    v_company_id, p_warehouse_location_id, p_variant_id,
    'in', v_qty, trim(p_reason), p_notes, v_batch_id, v_actor
  )
  RETURNING id INTO v_adjustment_id;

  RETURN json_build_object(
    'success', true,
    'adjustment_id', v_adjustment_id,
    'batch_id', v_batch_id,
    'batch_number', v_batch_number,
    'direction', 'in',
    'quantity', v_qty
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.receive_inventory_lots_to_main(uuid, uuid, uuid, uuid, integer, timestamptz, text, uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_inventory_adjustment_batch_number(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_warehouse_stock_adjustment(uuid, uuid, integer, text, text, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.warehouse_stock_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_adjustment_number_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Warehouse stock adjustments: sysadmin all" ON public.warehouse_stock_adjustments;
CREATE POLICY "Warehouse stock adjustments: sysadmin all"
  ON public.warehouse_stock_adjustments FOR ALL
  USING (public.is_system_administrator())
  WITH CHECK (public.is_system_administrator());

DROP POLICY IF EXISTS "Warehouse stock adjustments: warehouse select" ON public.warehouse_stock_adjustments;
CREATE POLICY "Warehouse stock adjustments: warehouse select"
  ON public.warehouse_stock_adjustments FOR SELECT
  USING (
    public.is_warehouse()
    AND company_id = public.get_auth_company_id()
    AND (
      public.is_main_warehouse_user(auth.uid())
      OR warehouse_location_id = public.get_warehouse_location_id(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Inventory adjustment counters: sysadmin all" ON public.inventory_adjustment_number_counters;
CREATE POLICY "Inventory adjustment counters: sysadmin all"
  ON public.inventory_adjustment_number_counters FOR ALL
  USING (public.is_system_administrator())
  WITH CHECK (public.is_system_administrator());

GRANT SELECT ON public.warehouse_stock_adjustments TO authenticated;

COMMENT ON TABLE public.warehouse_stock_adjustments IS
  'Audited stock corrections at warehouse locations. Positive adjustments create ADJ- batches; negative use FIFO lot consumption.';
COMMENT ON FUNCTION public.apply_warehouse_stock_adjustment IS
  'Apply +/- stock adjustment at a warehouse location with batch tracking and audit trail.';
