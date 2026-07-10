-- Physical count sessions for warehouse (main + sub-warehouse) with signature audit trail.

-- ---------------------------------------------------------------------------
-- 1) Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.physical_count_sessions (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  warehouse_location_id uuid NOT NULL REFERENCES public.warehouse_locations(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL REFERENCES public.inventory_batches(id) ON DELETE RESTRICT,
  performed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  counted_at timestamptz NOT NULL DEFAULT now(),
  signature_url text NOT NULL,
  signature_path text NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_physical_count_sessions_company_created
  ON public.physical_count_sessions(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_physical_count_sessions_location
  ON public.physical_count_sessions(warehouse_location_id);

CREATE TABLE IF NOT EXISTS public.physical_count_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.physical_count_sessions(id) ON DELETE CASCADE,
  lot_id uuid REFERENCES public.inventory_batch_lots(id) ON DELETE SET NULL,
  variant_id uuid NOT NULL REFERENCES public.variants(id) ON DELETE RESTRICT,
  brand_name text NOT NULL,
  variant_name text NOT NULL,
  system_qty_snapshot integer NOT NULL CHECK (system_qty_snapshot >= 0),
  physical_qty integer NOT NULL CHECK (physical_qty >= 0),
  variance integer NOT NULL,
  adjustment_id uuid REFERENCES public.warehouse_stock_adjustments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_physical_count_lines_session
  ON public.physical_count_lines(session_id);

-- ---------------------------------------------------------------------------
-- 2) Storage bucket for signatures
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('warehouse-physical-count-signatures', 'warehouse-physical-count-signatures', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Warehouse physical count: upload signatures" ON storage.objects;
CREATE POLICY "Warehouse physical count: upload signatures"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'warehouse-physical-count-signatures'
    AND (storage.foldername(name))[1] IN (
      SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'warehouse'
    )
  );

DROP POLICY IF EXISTS "Warehouse physical count: view company signatures" ON storage.objects;
CREATE POLICY "Warehouse physical count: view company signatures"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'warehouse-physical-count-signatures'
    AND (storage.foldername(name))[1] IN (
      SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 3) RLS on physical count tables
-- ---------------------------------------------------------------------------
ALTER TABLE public.physical_count_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.physical_count_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Physical count sessions: sysadmin all" ON public.physical_count_sessions;
CREATE POLICY "Physical count sessions: sysadmin all"
  ON public.physical_count_sessions FOR ALL
  USING (public.is_system_administrator())
  WITH CHECK (public.is_system_administrator());

DROP POLICY IF EXISTS "Physical count sessions: warehouse select" ON public.physical_count_sessions;
CREATE POLICY "Physical count sessions: warehouse select"
  ON public.physical_count_sessions FOR SELECT
  USING (
    public.is_warehouse()
    AND company_id = public.get_auth_company_id()
    AND (
      public.is_main_warehouse_user(auth.uid())
      OR warehouse_location_id = public.get_warehouse_location_id(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Physical count lines: sysadmin all" ON public.physical_count_lines;
CREATE POLICY "Physical count lines: sysadmin all"
  ON public.physical_count_lines FOR ALL
  USING (public.is_system_administrator())
  WITH CHECK (public.is_system_administrator());

DROP POLICY IF EXISTS "Physical count lines: warehouse select" ON public.physical_count_lines;
CREATE POLICY "Physical count lines: warehouse select"
  ON public.physical_count_lines FOR SELECT
  USING (
    public.is_warehouse()
    AND EXISTS (
      SELECT 1 FROM public.physical_count_sessions pcs
      WHERE pcs.id = physical_count_lines.session_id
        AND pcs.company_id = public.get_auth_company_id()
        AND (
          public.is_main_warehouse_user(auth.uid())
          OR pcs.warehouse_location_id = public.get_warehouse_location_id(auth.uid())
        )
    )
  );

GRANT SELECT ON public.physical_count_sessions TO authenticated;
GRANT SELECT ON public.physical_count_lines TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) Extend apply_warehouse_stock_adjustment auth for sub-warehouse at own location
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_warehouse_stock_adjustment(
  p_warehouse_location_id uuid,
  p_variant_id uuid,
  p_quantity_delta integer,
  p_reason text,
  p_notes text DEFAULT NULL,
  p_performed_by uuid DEFAULT NULL,
  p_lot_id uuid DEFAULT NULL
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
  v_lot RECORD;
  v_receive_result jsonb;
  v_lot_result jsonb;
  v_direction text;
  v_new_lot_id uuid;
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
      AND v_company_id = public.get_auth_company_id()
      AND (
        public.is_main_warehouse_user(v_actor)
        OR p_warehouse_location_id = public.get_warehouse_location_id(v_actor)
      )
    )
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized to apply stock adjustments at this location');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.variants v
    WHERE v.id = p_variant_id AND v.company_id = v_company_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Variant not found');
  END IF;

  v_qty := abs(p_quantity_delta);
  v_direction := CASE WHEN p_quantity_delta > 0 THEN 'in' ELSE 'out' END;

  IF p_lot_id IS NOT NULL THEN
    SELECT ibl.*, ib.batch_number
    INTO v_lot
    FROM public.inventory_batch_lots ibl
    JOIN public.inventory_batches ib ON ib.id = ibl.batch_id
    WHERE ibl.id = p_lot_id;

    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'Selected batch lot not found');
    END IF;

    IF v_lot.company_id IS DISTINCT FROM v_company_id THEN
      RETURN json_build_object('success', false, 'error', 'Batch lot does not belong to this company');
    END IF;

    IF v_lot.warehouse_location_id IS DISTINCT FROM p_warehouse_location_id THEN
      RETURN json_build_object('success', false, 'error', 'Batch lot location does not match selected location');
    END IF;

    IF v_lot.variant_id IS DISTINCT FROM p_variant_id THEN
      RETURN json_build_object('success', false, 'error', 'Batch lot variant does not match selected variant');
    END IF;
  END IF;

  IF v_direction = 'out' THEN
    IF p_lot_id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Select a batch to remove stock from');
    END IF;

    v_lot_result := public.consume_inventory_lot(
      p_lot_id,
      v_qty,
      'adjustment_out',
      'warehouse_stock_adjustment',
      NULL,
      v_actor,
      trim(p_reason) || COALESCE(' — ' || p_notes, '')
    );

    IF NOT COALESCE((v_lot_result->>'success')::boolean, false) THEN
      RETURN json_build_object(
        'success', false,
        'error', COALESCE(v_lot_result->>'error', 'Failed to consume from batch lot')
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
      'Adjustment out (' || v_lot.batch_number || '): ' || trim(p_reason) || COALESCE(' — ' || p_notes, ''),
      now()
    );

    INSERT INTO public.warehouse_stock_adjustments (
      company_id, warehouse_location_id, variant_id,
      direction, quantity, reason, notes, batch_id, lot_id, performed_by
    ) VALUES (
      v_company_id, p_warehouse_location_id, p_variant_id,
      'out', v_qty, trim(p_reason), p_notes, v_lot.batch_id, p_lot_id, v_actor
    )
    RETURNING id INTO v_adjustment_id;

    RETURN json_build_object(
      'success', true,
      'adjustment_id', v_adjustment_id,
      'batch_id', v_lot.batch_id,
      'batch_number', v_lot.batch_number,
      'lot_id', p_lot_id,
      'direction', 'out',
      'quantity', v_qty,
      'remaining_after', v_lot_result->>'remaining_after'
    );
  END IF;

  -- Direction IN
  IF p_lot_id IS NOT NULL THEN
    v_lot_result := public.add_inventory_lot_quantity(
      p_lot_id,
      v_qty,
      'adjustment_in',
      'warehouse_stock_adjustment',
      NULL,
      v_actor,
      'Adjustment in (' || v_lot.batch_number || '): ' || trim(p_reason) || COALESCE(' — ' || p_notes, '')
    );

    IF NOT COALESCE((v_lot_result->>'success')::boolean, false) THEN
      RETURN json_build_object(
        'success', false,
        'error', COALESCE(v_lot_result->>'error', 'Failed to add to batch lot')
      );
    END IF;

    IF v_is_main THEN
      IF EXISTS (
        SELECT 1 FROM public.main_inventory mi
        WHERE mi.company_id = v_company_id AND mi.variant_id = p_variant_id
      ) THEN
        UPDATE public.main_inventory
        SET stock = stock + v_qty,
            last_restocked_at = v_received_at,
            updated_at = now()
        WHERE company_id = v_company_id AND variant_id = p_variant_id;
      ELSE
        INSERT INTO public.main_inventory (
          company_id, variant_id, stock, unit_price, reorder_level, last_restocked_at, created_at, updated_at
        ) VALUES (
          v_company_id, p_variant_id, v_qty, 0, 10, v_received_at, now(), now()
        );
      END IF;

      INSERT INTO public.inventory_transactions (
        company_id, variant_id, transaction_type, quantity,
        reference_type, performed_by, notes, created_at
      ) VALUES (
        v_company_id, p_variant_id, 'adjustment', v_qty,
        'warehouse_stock_adjustment', v_actor,
        'Adjustment in (' || v_lot.batch_number || '): ' || trim(p_reason) || COALESCE(' — ' || p_notes, ''),
        now()
      );
    ELSE
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
        'Adjustment in (sub, ' || v_lot.batch_number || '): ' || trim(p_reason) || COALESCE(' — ' || p_notes, ''),
        now()
      );
    END IF;

    INSERT INTO public.warehouse_stock_adjustments (
      company_id, warehouse_location_id, variant_id,
      direction, quantity, reason, notes, batch_id, lot_id, performed_by
    ) VALUES (
      v_company_id, p_warehouse_location_id, p_variant_id,
      'in', v_qty, trim(p_reason), p_notes, v_lot.batch_id, p_lot_id, v_actor
    )
    RETURNING id INTO v_adjustment_id;

    RETURN json_build_object(
      'success', true,
      'adjustment_id', v_adjustment_id,
      'batch_id', v_lot.batch_id,
      'batch_number', v_lot.batch_number,
      'lot_id', p_lot_id,
      'direction', 'in',
      'quantity', v_qty,
      'remaining_after', v_lot_result->>'remaining_after'
    );
  END IF;

  -- IN without lot: create new ADJ batch
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

    IF NOT COALESCE((v_receive_result->>'success')::boolean, false) THEN
      RETURN json_build_object(
        'success', false,
        'error', COALESCE(v_receive_result->>'error', 'Failed to receive adjustment lots')
      );
    END IF;

    v_new_lot_id := (v_receive_result->>'lot_id')::uuid;
  ELSE
    INSERT INTO public.inventory_batch_lots (
      company_id, batch_id, variant_id, warehouse_location_id,
      quantity_received, quantity_remaining, received_at
    ) VALUES (
      v_company_id, v_batch_id, p_variant_id, p_warehouse_location_id,
      v_qty, v_qty, v_received_at
    )
    RETURNING id INTO v_new_lot_id;

    INSERT INTO public.inventory_batch_movements (
      company_id, lot_id, batch_id, variant_id, warehouse_location_id,
      movement_type, quantity, reference_type,
      to_location_id, performed_by, notes
    ) VALUES (
      v_company_id, v_new_lot_id, v_batch_id, p_variant_id, p_warehouse_location_id,
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
  END IF;

  INSERT INTO public.warehouse_stock_adjustments (
    company_id, warehouse_location_id, variant_id,
    direction, quantity, reason, notes, batch_id, lot_id, performed_by
  ) VALUES (
    v_company_id, p_warehouse_location_id, p_variant_id,
    'in', v_qty, trim(p_reason), p_notes, v_batch_id, v_new_lot_id, v_actor
  )
  RETURNING id INTO v_adjustment_id;

  RETURN json_build_object(
    'success', true,
    'adjustment_id', v_adjustment_id,
    'batch_id', v_batch_id,
    'batch_number', v_batch_number,
    'lot_id', v_new_lot_id,
    'direction', 'in',
    'quantity', v_qty
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 5) submit_physical_count RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_physical_count(
  p_warehouse_location_id uuid,
  p_batch_id uuid,
  p_lines jsonb,
  p_signature_url text,
  p_signature_path text,
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
  v_session_id uuid;
  v_line jsonb;
  v_variant_id uuid;
  v_lot_id uuid;
  v_physical_qty integer;
  v_system_qty integer;
  v_variance integer;
  v_brand_name text;
  v_variant_name text;
  v_adjust_result json;
  v_adjustment_id uuid;
  v_adjustments_applied integer := 0;
  v_batch_received_at timestamptz;
  v_new_lot_id uuid;
BEGIN
  v_actor := COALESCE(p_performed_by, auth.uid());

  IF p_signature_url IS NULL OR length(trim(p_signature_url)) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Signature is required');
  END IF;

  IF p_signature_path IS NULL OR length(trim(p_signature_path)) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Signature path is required');
  END IF;

  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'At least one count line is required');
  END IF;

  SELECT wl.company_id INTO v_company_id
  FROM public.warehouse_locations wl
  WHERE wl.id = p_warehouse_location_id;

  IF v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Warehouse location not found');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.inventory_batches ib
    WHERE ib.id = p_batch_id AND ib.company_id = v_company_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Batch not found');
  END IF;

  IF NOT (
    public.is_system_administrator()
    OR (
      public.is_warehouse()
      AND v_company_id = public.get_auth_company_id()
      AND (
        public.is_main_warehouse_user(v_actor)
        OR p_warehouse_location_id = public.get_warehouse_location_id(v_actor)
      )
    )
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized to submit physical count at this location');
  END IF;

  SELECT ib.received_at INTO v_batch_received_at
  FROM public.inventory_batches ib
  WHERE ib.id = p_batch_id;

  INSERT INTO public.physical_count_sessions (
    company_id, warehouse_location_id, batch_id,
    performed_by, signature_url, signature_path, notes, status
  ) VALUES (
    v_company_id, p_warehouse_location_id, p_batch_id,
    v_actor, trim(p_signature_url), trim(p_signature_path), p_notes, 'submitted'
  )
  RETURNING id INTO v_session_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_variant_id := (v_line->>'variant_id')::uuid;
    v_lot_id := NULLIF(v_line->>'lot_id', '')::uuid;
    v_physical_qty := (v_line->>'physical_qty')::integer;
    v_system_qty := COALESCE((v_line->>'system_qty_snapshot')::integer, 0);
    v_brand_name := COALESCE(v_line->>'brand_name', '');
    v_variant_name := COALESCE(v_line->>'variant_name', '');

    IF v_variant_id IS NULL THEN
      RAISE EXCEPTION 'Each line must include variant_id';
    END IF;

    IF v_physical_qty IS NULL OR v_physical_qty < 0 THEN
      RAISE EXCEPTION 'Physical quantity must be a non-negative integer';
    END IF;

    IF v_system_qty < 0 THEN
      RAISE EXCEPTION 'System quantity snapshot must be non-negative';
    END IF;

    IF v_brand_name = '' OR v_variant_name = '' THEN
      SELECT b.name, v.name
      INTO v_brand_name, v_variant_name
      FROM public.variants v
      JOIN public.brands b ON b.id = v.brand_id
      WHERE v.id = v_variant_id AND v.company_id = v_company_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Variant not found: %', v_variant_id;
      END IF;
    END IF;

    IF v_lot_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.inventory_batch_lots ibl
        WHERE ibl.id = v_lot_id
          AND ibl.batch_id = p_batch_id
          AND ibl.warehouse_location_id = p_warehouse_location_id
          AND ibl.variant_id = v_variant_id
          AND ibl.company_id = v_company_id
      ) THEN
        RAISE EXCEPTION 'Invalid lot for batch, location, and variant';
      END IF;
    END IF;

    v_variance := v_physical_qty - v_system_qty;
    v_adjustment_id := NULL;

    IF v_variance != 0 THEN
      IF v_variance < 0 AND v_lot_id IS NULL THEN
        RAISE EXCEPTION 'Cannot remove stock without a batch lot for variant %', v_variant_name;
      END IF;

      IF v_variance > 0 AND v_lot_id IS NULL THEN
        INSERT INTO public.inventory_batch_lots (
          company_id, batch_id, variant_id, warehouse_location_id,
          quantity_received, quantity_remaining, received_at
        ) VALUES (
          v_company_id, p_batch_id, v_variant_id, p_warehouse_location_id,
          0, 0, COALESCE(v_batch_received_at, now())
        )
        ON CONFLICT (batch_id, variant_id, warehouse_location_id)
        DO UPDATE SET updated_at = now()
        RETURNING id INTO v_new_lot_id;

        IF v_new_lot_id IS NULL THEN
          SELECT ibl.id INTO v_new_lot_id
          FROM public.inventory_batch_lots ibl
          WHERE ibl.batch_id = p_batch_id
            AND ibl.variant_id = v_variant_id
            AND ibl.warehouse_location_id = p_warehouse_location_id;
        END IF;

        v_lot_id := v_new_lot_id;
      END IF;

      v_adjust_result := public.apply_warehouse_stock_adjustment(
        p_warehouse_location_id,
        v_variant_id,
        v_variance,
        'Cycle count correction',
        'Physical count session ' || v_session_id::text,
        v_actor,
        v_lot_id
      );

      IF NOT COALESCE((v_adjust_result->>'success')::boolean, false) THEN
        RAISE EXCEPTION 'Adjustment failed for %: %',
          v_variant_name,
          COALESCE(v_adjust_result->>'error', 'Unknown error');
      END IF;

      v_adjustment_id := (v_adjust_result->>'adjustment_id')::uuid;
      v_adjustments_applied := v_adjustments_applied + 1;
    END IF;

    INSERT INTO public.physical_count_lines (
      session_id, lot_id, variant_id, brand_name, variant_name,
      system_qty_snapshot, physical_qty, variance, adjustment_id
    ) VALUES (
      v_session_id, v_lot_id, v_variant_id, v_brand_name, v_variant_name,
      v_system_qty, v_physical_qty, v_variance, v_adjustment_id
    );
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'session_id', v_session_id,
    'adjustments_applied', v_adjustments_applied
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_physical_count(uuid, uuid, jsonb, text, text, text, uuid) TO authenticated;

COMMENT ON TABLE public.physical_count_sessions IS
  'Warehouse physical count sessions with counter signature and batch scope.';
COMMENT ON FUNCTION public.submit_physical_count(uuid, uuid, jsonb, text, text, text, uuid) IS
  'Submit a signed physical count session and apply cycle count adjustments for variances.';
