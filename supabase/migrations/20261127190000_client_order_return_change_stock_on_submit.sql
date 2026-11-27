-- Change-item CRs: apply bag stock on submit (pending_leader), reverse on TL reject.
-- Refunds unchanged (stock still only on Finance post).
-- Idempotent via stock_applied_at so TL approve does not double-apply.

ALTER TABLE public.client_order_returns
  ADD COLUMN IF NOT EXISTS stock_applied_at timestamptz;

COMMENT ON COLUMN public.client_order_returns.stock_applied_at IS
  'When bag/hold stock for this CR was applied. Set on change-item submit or on final post for refunds.';

UPDATE public.client_order_returns
SET stock_applied_at = COALESCE(approved_at, created_at)
WHERE status = 'posted'
  AND stock_applied_at IS NULL;

CREATE OR REPLACE FUNCTION public.apply_client_order_return_posted_stock(
  p_return_id uuid,
  p_performed_by uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_header public.client_order_returns%ROWTYPE;
  v_line RECORD;
  v_holder uuid;
  v_change_holder uuid;
  v_variant_name text;
  v_updated integer;
  v_fate text;
BEGIN
  SELECT * INTO v_header
  FROM public.client_order_returns
  WHERE id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return not found';
  END IF;

  IF v_header.stock_applied_at IS NOT NULL THEN
    RETURN;
  END IF;

  v_holder := COALESCE(v_header.original_agent_id, v_header.returned_by);
  v_change_holder := COALESCE(v_header.returned_by, v_header.original_agent_id);

  FOR v_line IN
    SELECT
      variant_id,
      brand_id,
      COALESCE(stock_fate, 'disposal') AS stock_fate,
      SUM(quantity) AS qty
    FROM public.client_order_return_items
    WHERE return_id = p_return_id
    GROUP BY variant_id, brand_id, COALESCE(stock_fate, 'disposal')
  LOOP
    v_fate := v_line.stock_fate;

    IF v_fate = 'restock' THEN
      IF v_holder IS NULL THEN
        RAISE EXCEPTION 'Cannot restock: missing agent';
      END IF;

      UPDATE public.agent_inventory
      SET
        stock = COALESCE(stock, 0) + v_line.qty,
        status = CASE
          WHEN COALESCE(stock, 0) + v_line.qty <= 0 THEN 'none'
          WHEN COALESCE(stock, 0) + v_line.qty <= 10 THEN 'low'
          ELSE 'available'
        END,
        updated_at = now()
      WHERE company_id = v_header.company_id
        AND agent_id = v_holder
        AND variant_id = v_line.variant_id;

      GET DIAGNOSTICS v_updated = ROW_COUNT;
      IF v_updated = 0 THEN
        INSERT INTO public.agent_inventory (
          company_id, agent_id, variant_id, stock, returned_stock, allocated_price, status, allocated_at, updated_at
        ) VALUES (
          v_header.company_id,
          v_holder,
          v_line.variant_id,
          v_line.qty,
          0,
          0,
          CASE WHEN v_line.qty <= 10 THEN 'low' ELSE 'available' END,
          now(),
          now()
        );
      END IF;

      INSERT INTO public.inventory_transactions (
        company_id, variant_id, transaction_type, quantity,
        from_location, to_location,
        reference_type, reference_id, performed_by, notes, created_at
      ) VALUES (
        v_header.company_id,
        v_line.variant_id,
        'client_order_return',
        v_line.qty,
        'client_return',
        'agent_inventory:' || v_holder::text,
        'client_order_return',
        p_return_id,
        p_performed_by,
        'Client order return restock ' || v_header.return_number,
        now()
      );
    ELSE
      UPDATE public.main_inventory
      SET returned_stock = COALESCE(returned_stock, 0) + v_line.qty,
          updated_at = now()
      WHERE company_id = v_header.company_id
        AND variant_id = v_line.variant_id;

      IF NOT FOUND THEN
        INSERT INTO public.main_inventory (
          company_id, variant_id, stock, allocated_stock, returned_stock, status, updated_at
        ) VALUES (
          v_header.company_id, v_line.variant_id, 0, 0, v_line.qty, 'in-stock', now()
        );
      END IF;

      IF v_holder IS NOT NULL THEN
        PERFORM public.add_client_return_stock_hold(
          v_header.company_id,
          v_holder,
          v_line.variant_id,
          v_line.brand_id,
          v_line.qty
        );

        UPDATE public.agent_inventory
        SET returned_stock = COALESCE(returned_stock, 0) + v_line.qty,
            updated_at = now()
        WHERE company_id = v_header.company_id
          AND agent_id = v_holder
          AND variant_id = v_line.variant_id;

        IF NOT FOUND THEN
          INSERT INTO public.agent_inventory (
            company_id, agent_id, variant_id, stock, returned_stock, allocated_price, status, allocated_at, updated_at
          ) VALUES (
            v_header.company_id, v_holder, v_line.variant_id, 0, v_line.qty, 0, 'available', now(), now()
          );
        END IF;
      END IF;

      INSERT INTO public.inventory_transactions (
        company_id, variant_id, transaction_type, quantity,
        reference_type, reference_id, performed_by, notes, created_at
      ) VALUES (
        v_header.company_id,
        v_line.variant_id,
        'client_order_return',
        v_line.qty,
        'client_order_return',
        p_return_id,
        p_performed_by,
        'Client order return disposal ' || v_header.return_number,
        now()
      );
    END IF;
  END LOOP;

  FOR v_line IN
    SELECT variant_id, SUM(quantity) AS qty
    FROM public.client_order_return_change_items
    WHERE return_id = p_return_id
    GROUP BY variant_id
  LOOP
    IF v_change_holder IS NULL THEN
      RAISE EXCEPTION 'Cannot issue change items: missing agent';
    END IF;

    SELECT v.name INTO v_variant_name
    FROM public.variants v
    WHERE v.id = v_line.variant_id;

    UPDATE public.agent_inventory
    SET
      stock = stock - v_line.qty,
      status = CASE
        WHEN stock - v_line.qty <= 0 THEN 'none'
        WHEN stock - v_line.qty <= 10 THEN 'low'
        ELSE 'available'
      END,
      updated_at = now()
    WHERE company_id = v_header.company_id
      AND agent_id = v_change_holder
      AND variant_id = v_line.variant_id
      AND COALESCE(stock, 0) >= v_line.qty;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      RAISE EXCEPTION 'Not enough stock to change %', COALESCE(v_variant_name, 'item');
    END IF;

    INSERT INTO public.inventory_transactions (
      company_id, variant_id, transaction_type, quantity,
      from_location, to_location,
      reference_type, reference_id, performed_by, notes, created_at
    ) VALUES (
      v_header.company_id,
      v_line.variant_id,
      'client_order_return',
      v_line.qty,
      'agent_inventory:' || v_change_holder::text,
      'client_exchange',
      'client_order_return',
      p_return_id,
      p_performed_by,
      'Client order return change item ' || v_header.return_number,
      now()
    );
  END LOOP;

  UPDATE public.client_order_returns
  SET stock_applied_at = now()
  WHERE id = p_return_id
    AND stock_applied_at IS NULL;
END;
$$;

COMMENT ON FUNCTION public.apply_client_order_return_posted_stock(uuid, uuid) IS
  'Applies CR stock once (stock_applied_at). Restock → sellable bag; disposal → returned_stock/holds; change qty deducts filer bag.';

CREATE OR REPLACE FUNCTION public.reverse_client_order_return_stock(
  p_return_id uuid,
  p_performed_by uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_header public.client_order_returns%ROWTYPE;
  v_line RECORD;
  v_holder uuid;
  v_change_holder uuid;
  v_variant_name text;
  v_updated integer;
  v_fate text;
  v_hold_qty integer;
BEGIN
  SELECT * INTO v_header
  FROM public.client_order_returns
  WHERE id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return not found';
  END IF;

  IF v_header.stock_applied_at IS NULL THEN
    RETURN;
  END IF;

  v_holder := COALESCE(v_header.original_agent_id, v_header.returned_by);
  v_change_holder := COALESCE(v_header.returned_by, v_header.original_agent_id);

  -- Reverse change deductions first (add sellable back).
  FOR v_line IN
    SELECT variant_id, SUM(quantity) AS qty
    FROM public.client_order_return_change_items
    WHERE return_id = p_return_id
    GROUP BY variant_id
  LOOP
    IF v_change_holder IS NULL THEN
      RAISE EXCEPTION 'Cannot reverse change items: missing agent';
    END IF;

    UPDATE public.agent_inventory
    SET
      stock = COALESCE(stock, 0) + v_line.qty,
      status = CASE
        WHEN COALESCE(stock, 0) + v_line.qty <= 0 THEN 'none'
        WHEN COALESCE(stock, 0) + v_line.qty <= 10 THEN 'low'
        ELSE 'available'
      END,
      updated_at = now()
    WHERE company_id = v_header.company_id
      AND agent_id = v_change_holder
      AND variant_id = v_line.variant_id;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      INSERT INTO public.agent_inventory (
        company_id, agent_id, variant_id, stock, returned_stock, allocated_price, status, allocated_at, updated_at
      ) VALUES (
        v_header.company_id,
        v_change_holder,
        v_line.variant_id,
        v_line.qty,
        0,
        0,
        CASE WHEN v_line.qty <= 10 THEN 'low' ELSE 'available' END,
        now(),
        now()
      );
    END IF;

    INSERT INTO public.inventory_transactions (
      company_id, variant_id, transaction_type, quantity,
      from_location, to_location,
      reference_type, reference_id, performed_by, notes, created_at
    ) VALUES (
      v_header.company_id,
      v_line.variant_id,
      'client_order_return',
      v_line.qty,
      'client_exchange',
      'agent_inventory:' || v_change_holder::text,
      'client_order_return',
      p_return_id,
      p_performed_by,
      'Reverse client order return change item ' || v_header.return_number,
      now()
    );
  END LOOP;

  -- Reverse returned lines (restock / disposal).
  FOR v_line IN
    SELECT
      variant_id,
      brand_id,
      COALESCE(stock_fate, 'disposal') AS stock_fate,
      SUM(quantity) AS qty
    FROM public.client_order_return_items
    WHERE return_id = p_return_id
    GROUP BY variant_id, brand_id, COALESCE(stock_fate, 'disposal')
  LOOP
    v_fate := v_line.stock_fate;
    SELECT v.name INTO v_variant_name
    FROM public.variants v
    WHERE v.id = v_line.variant_id;

    IF v_fate = 'restock' THEN
      IF v_holder IS NULL THEN
        RAISE EXCEPTION 'Cannot reverse restock: missing agent';
      END IF;

      UPDATE public.agent_inventory
      SET
        stock = stock - v_line.qty,
        status = CASE
          WHEN stock - v_line.qty <= 0 THEN 'none'
          WHEN stock - v_line.qty <= 10 THEN 'low'
          ELSE 'available'
        END,
        updated_at = now()
      WHERE company_id = v_header.company_id
        AND agent_id = v_holder
        AND variant_id = v_line.variant_id
        AND COALESCE(stock, 0) >= v_line.qty;

      GET DIAGNOSTICS v_updated = ROW_COUNT;
      IF v_updated = 0 THEN
        RAISE EXCEPTION
          'Cannot reverse restock for % — bag sellable qty is lower than this return',
          COALESCE(v_variant_name, 'item');
      END IF;

      INSERT INTO public.inventory_transactions (
        company_id, variant_id, transaction_type, quantity,
        from_location, to_location,
        reference_type, reference_id, performed_by, notes, created_at
      ) VALUES (
        v_header.company_id,
        v_line.variant_id,
        'client_order_return',
        v_line.qty,
        'agent_inventory:' || v_holder::text,
        'client_return',
        'client_order_return',
        p_return_id,
        p_performed_by,
        'Reverse client order return restock ' || v_header.return_number,
        now()
      );
    ELSE
      UPDATE public.main_inventory
      SET returned_stock = GREATEST(COALESCE(returned_stock, 0) - v_line.qty, 0),
          updated_at = now()
      WHERE company_id = v_header.company_id
        AND variant_id = v_line.variant_id
        AND COALESCE(returned_stock, 0) >= v_line.qty;

      GET DIAGNOSTICS v_updated = ROW_COUNT;
      IF v_updated = 0 THEN
        RAISE EXCEPTION
          'Cannot reverse disposal for % — main returned stock is lower than this return',
          COALESCE(v_variant_name, 'item');
      END IF;

      IF v_holder IS NOT NULL THEN
        SELECT qty_on_hand INTO v_hold_qty
        FROM public.client_return_stock_holds
        WHERE company_id = v_header.company_id
          AND holder_id = v_holder
          AND variant_id = v_line.variant_id
        FOR UPDATE;

        IF COALESCE(v_hold_qty, 0) < v_line.qty THEN
          RAISE EXCEPTION
            'Cannot reverse disposal for % — returned hold qty is lower than this return (may already be handed over)',
            COALESCE(v_variant_name, 'item');
        END IF;

        UPDATE public.client_return_stock_holds
        SET qty_on_hand = qty_on_hand - v_line.qty,
            updated_at = now()
        WHERE company_id = v_header.company_id
          AND holder_id = v_holder
          AND variant_id = v_line.variant_id;

        UPDATE public.agent_inventory
        SET returned_stock = GREATEST(COALESCE(returned_stock, 0) - v_line.qty, 0),
            updated_at = now()
        WHERE company_id = v_header.company_id
          AND agent_id = v_holder
          AND variant_id = v_line.variant_id;
      END IF;

      INSERT INTO public.inventory_transactions (
        company_id, variant_id, transaction_type, quantity,
        reference_type, reference_id, performed_by, notes, created_at
      ) VALUES (
        v_header.company_id,
        v_line.variant_id,
        'client_order_return',
        v_line.qty,
        'client_order_return',
        p_return_id,
        p_performed_by,
        'Reverse client order return disposal ' || v_header.return_number,
        now()
      );
    END IF;
  END LOOP;

  UPDATE public.client_order_returns
  SET stock_applied_at = NULL
  WHERE id = p_return_id;
END;
$$;

COMMENT ON FUNCTION public.reverse_client_order_return_stock(uuid, uuid) IS
  'Reverses bag/hold stock for a CR that already has stock_applied_at (used on TL reject of change-item).';

REVOKE EXECUTE ON FUNCTION public.reverse_client_order_return_stock(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Patch create: count pending change-item qty as used; apply stock for change pending_leader.
DO $$
DECLARE
  def text;
  patched text;
BEGIN
  def := pg_get_functiondef(
    'public.create_client_order_return(uuid, date, text, text, text, jsonb, jsonb, jsonb, text)'::regprocedure
  );
  patched := regexp_replace(def, '^CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION');

  -- Remaining qty: posted OR pending change-item
  IF patched !~ 'COALESCE\(r\.return_type, ''change_item''\) = ''change_item''' THEN
    patched := regexp_replace(
      patched,
      'WHERE i\.client_order_item_id = v_item_id[[:space:]]*'
        || 'AND r\.status = ''posted'';',
      E'WHERE i.client_order_item_id = v_item_id\n'
        || E'      AND (\n'
        || E'        r.status = ''posted''\n'
        || E'        OR (\n'
        || E'          COALESCE(r.return_type, ''change_item'') = ''change_item''\n'
        || E'          AND r.status = ''pending_leader''\n'
        || E'        )\n'
        || E'      );',
      'g'
    );
  END IF;

  -- Apply stock on change-item submit as well as posted
  IF patched !~ 'v_return_type = ''change_item'' AND v_status = ''pending_leader''' THEN
    patched := regexp_replace(
      patched,
      'IF v_status = ''posted'' THEN[[:space:]]*'
        || 'PERFORM public\.apply_client_order_return_posted_stock\(v_return_id, v_user\);[[:space:]]*'
        || 'END IF;',
      E'IF v_status = ''posted''\n'
        || E'     OR (v_return_type = ''change_item'' AND v_status = ''pending_leader'') THEN\n'
        || E'    PERFORM public.apply_client_order_return_posted_stock(v_return_id, v_user);\n'
        || E'  END IF;',
      'g'
    );
  END IF;

  IF patched !~ 'COALESCE\(r\.return_type, ''change_item''\) = ''change_item''' THEN
    RAISE EXCEPTION 'Failed to patch create_client_order_return remaining-qty check';
  END IF;

  IF patched !~ 'v_return_type = ''change_item'' AND v_status = ''pending_leader''' THEN
    RAISE EXCEPTION 'Failed to patch create_client_order_return apply-stock condition';
  END IF;

  EXECUTE patched;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_client_order_return(
  p_return_id uuid,
  p_note text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid;
  v_company_id uuid;
  v_role text;
  v_name text;
  v_header public.client_order_returns%ROWTYPE;
  v_return_type text;
BEGIN
  v_user := auth.uid();
  v_company_id := public.get_auth_company_id();

  IF v_user IS NULL OR v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT role, full_name INTO v_role, v_name
  FROM public.profiles
  WHERE id = v_user AND company_id = v_company_id;

  IF v_role IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Profile not found');
  END IF;

  SELECT * INTO v_header
  FROM public.client_order_returns
  WHERE id = p_return_id
    AND company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Return not found');
  END IF;

  v_return_type := COALESCE(v_header.return_type, 'change_item');

  IF v_return_type = 'change_item' THEN
    IF v_role IS DISTINCT FROM 'team_leader' THEN
      RETURN json_build_object('success', false, 'error', 'Only a team leader can reject a change-item return');
    END IF;

    IF v_header.status IS DISTINCT FROM 'pending_leader' THEN
      RETURN json_build_object('success', false, 'error', 'Only pending returns can be rejected');
    END IF;

    IF NOT (
      public.is_client_order_return_team_leader_of(v_header.returned_by)
      OR public.is_client_order_return_team_leader_of(COALESCE(v_header.original_agent_id, v_header.returned_by))
    ) THEN
      RETURN json_build_object('success', false, 'error', 'You can only reject returns from your team');
    END IF;

    -- Restore bag/hold stock that was applied on submit.
    PERFORM public.reverse_client_order_return_stock(p_return_id, v_user);
  ELSIF v_return_type = 'refund' THEN
    IF v_header.status = 'pending_super_admin' THEN
      IF v_role IS DISTINCT FROM 'super_admin' THEN
        RETURN json_build_object('success', false, 'error', 'Only a super admin can reject this refund');
      END IF;
    ELSIF v_header.status = 'pending_finance' THEN
      IF v_role IS DISTINCT FROM 'finance' THEN
        RETURN json_build_object('success', false, 'error', 'Only finance can reject this refund');
      END IF;
    ELSE
      RETURN json_build_object('success', false, 'error', 'This refund cannot be rejected');
    END IF;
  ELSE
    RETURN json_build_object('success', false, 'error', 'Unknown return type');
  END IF;

  UPDATE public.client_order_returns
  SET status = 'rejected',
      rejected_at = now(),
      rejected_by = v_user,
      rejected_by_name = v_name,
      rejection_note = NULLIF(btrim(COALESCE(p_note, '')), ''),
      approved_at = NULL,
      approved_by = NULL,
      approved_by_name = NULL
  WHERE id = p_return_id;

  RETURN json_build_object('success', true, 'id', p_return_id, 'status', 'rejected');
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.reject_client_order_return(uuid, text) IS
  'Change item: TL rejects and reverses bag stock applied on submit. Refund: SA/Finance reject with no stock reverse.';

GRANT EXECUTE ON FUNCTION public.reject_client_order_return(uuid, text) TO authenticated;
