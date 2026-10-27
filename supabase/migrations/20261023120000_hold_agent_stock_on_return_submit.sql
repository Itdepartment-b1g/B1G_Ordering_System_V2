-- Hold agent stock as soon as a return to the team leader is submitted.
-- The quantity is unavailable for new orders while the return is pending.
-- Approve moves the held quantity to the team leader.
-- Reject puts it back on the agent's sellable stock.
-- Pending returns that already exist are held here when the agent still has the stock.

ALTER TABLE public.inventory_returns
  ADD COLUMN IF NOT EXISTS stock_held BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.inventory_returns.stock_held IS
  'True when the returned quantity has been deducted from the agent and is unavailable for orders. Restored only if the return is rejected.';

COMMENT ON COLUMN public.inventory_returns.status IS
  'pending = awaiting team leader approval (stock already held); approved = held stock transferred to the leader; rejected = hold released back to the agent';

-- Hold every pending return that still has enough agent stock, oldest first.
-- A return that no longer has enough stock stays unheld so approval can still
-- try to transfer whatever remains, and rejection does not add stock back.
DO $$
DECLARE
  v_return RECORD;
  v_item RECORD;
  v_stock INTEGER;
  v_can_hold BOOLEAN;
BEGIN
  FOR v_return IN
    SELECT id, agent_id, company_id, return_reason
    FROM public.inventory_returns
    WHERE status = 'pending'
      AND stock_held = FALSE
    ORDER BY created_at ASC, id
    FOR UPDATE
  LOOP
    v_can_hold := TRUE;

    FOR v_item IN
      SELECT variant_id, SUM(quantity)::INTEGER AS quantity
      FROM public.inventory_return_items
      WHERE return_id = v_return.id
      GROUP BY variant_id
    LOOP
      SELECT stock
      INTO v_stock
      FROM public.agent_inventory
      WHERE agent_id = v_return.agent_id
        AND variant_id = v_item.variant_id
        AND company_id = v_return.company_id
      FOR UPDATE;

      IF NOT FOUND OR v_stock < v_item.quantity THEN
        v_can_hold := FALSE;
      END IF;
    END LOOP;

    IF NOT v_can_hold THEN
      RAISE NOTICE 'Pending return % left unheld: agent stock is already short', v_return.id;
      CONTINUE;
    END IF;

    FOR v_item IN
      SELECT variant_id, SUM(quantity)::INTEGER AS quantity
      FROM public.inventory_return_items
      WHERE return_id = v_return.id
      GROUP BY variant_id
    LOOP
      UPDATE public.agent_inventory
      SET stock = stock - v_item.quantity,
          updated_at = NOW()
      WHERE agent_id = v_return.agent_id
        AND variant_id = v_item.variant_id
        AND company_id = v_return.company_id;

      INSERT INTO public.inventory_transactions (
        company_id, variant_id, transaction_type, quantity,
        from_location, to_location, performed_by, notes
      ) VALUES (
        v_return.company_id,
        v_item.variant_id,
        'return',
        v_item.quantity,
        CONCAT('agent_inventory:', v_return.agent_id),
        CONCAT('return_hold:', v_return.id),
        v_return.agent_id,
        CONCAT('Held for pending return to team leader. Reason: ', COALESCE(v_return.return_reason, ''))
      );
    END LOOP;

    UPDATE public.inventory_returns
    SET stock_held = TRUE
    WHERE id = v_return.id;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.submit_return_inventory_request(
  p_agent_id UUID,
  p_receiver_id UUID,
  p_return_type TEXT,
  p_return_reason TEXT,
  p_reason_notes TEXT,
  p_items JSONB,
  p_signature_url TEXT DEFAULT NULL,
  p_signature_path TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_return_id UUID;
  v_item JSONB;
  v_variant_id UUID;
  v_quantity INTEGER;
  v_agent_stock INTEGER;
  v_allocated_price NUMERIC(10,2);
  v_total_items INTEGER := 0;
  v_total_quantity INTEGER := 0;
BEGIN
  IF auth.uid() != p_agent_id THEN
    RETURN json_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  SELECT company_id INTO v_company_id FROM profiles WHERE id = p_agent_id;
  IF v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Agent not found');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_receiver_id AND company_id = v_company_id) THEN
    RETURN json_build_object('success', false, 'message', 'Invalid receiver or company mismatch');
  END IF;

  IF p_return_type NOT IN ('full', 'partial') THEN
    RETURN json_build_object('success', false, 'message', 'Invalid return type');
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN json_build_object('success', false, 'message', 'No items specified for return');
  END IF;

  INSERT INTO inventory_returns (
    company_id, agent_id, receiver_id, return_type,
    return_reason, reason_notes, signature_url, signature_path,
    status, stock_held
  ) VALUES (
    v_company_id, p_agent_id, p_receiver_id, p_return_type,
    p_return_reason, p_reason_notes, p_signature_url, p_signature_path,
    'pending', TRUE
  ) RETURNING id INTO v_return_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_variant_id := (v_item->>'variant_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;

    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity % for variant %', v_quantity, v_variant_id;
    END IF;

    SELECT stock, allocated_price
    INTO v_agent_stock, v_allocated_price
    FROM agent_inventory
    WHERE agent_id = p_agent_id
      AND variant_id = v_variant_id
      AND company_id = v_company_id
    FOR UPDATE;

    IF v_agent_stock IS NULL THEN
      RAISE EXCEPTION 'Variant % not found in agent inventory', v_variant_id;
    END IF;
    IF v_agent_stock < v_quantity THEN
      RAISE EXCEPTION 'Insufficient stock for variant %. Available: %, Requested: %',
        v_variant_id, v_agent_stock, v_quantity;
    END IF;

    INSERT INTO inventory_return_items (return_id, variant_id, quantity, allocated_price)
    VALUES (v_return_id, v_variant_id, v_quantity, v_allocated_price);

    UPDATE agent_inventory
    SET stock = stock - v_quantity,
        updated_at = NOW()
    WHERE agent_id = p_agent_id
      AND variant_id = v_variant_id
      AND company_id = v_company_id;

    INSERT INTO inventory_transactions (
      company_id, variant_id, transaction_type, quantity,
      from_location, to_location, performed_by, notes
    ) VALUES (
      v_company_id,
      v_variant_id,
      'return',
      v_quantity,
      CONCAT('agent_inventory:', p_agent_id),
      CONCAT('return_hold:', v_return_id),
      p_agent_id,
      CONCAT('Held for pending return to team leader. Reason: ', p_return_reason)
    );

    v_total_items := v_total_items + 1;
    v_total_quantity := v_total_quantity + v_quantity;
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'message', 'Return request submitted. Quantity is held and cannot be ordered until the team leader approves or rejects it.',
    'return_id', v_return_id,
    'items_returned', v_total_items,
    'total_quantity', v_total_quantity
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_return_inventory_request(
  p_return_id UUID,
  p_acknowledged BOOLEAN
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_leader_id UUID;
  v_return RECORD;
  v_item RECORD;
  v_company_id UUID;
  v_agent_stock INTEGER;
  v_allocated_price NUMERIC(10,2);
  v_dsp_price NUMERIC(10,2);
  v_rsp_price NUMERIC(10,2);
  v_total_quantity INTEGER := 0;
  v_from_location TEXT;
BEGIN
  v_leader_id := auth.uid();
  IF v_leader_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  IF NOT p_acknowledged THEN
    RETURN json_build_object('success', false, 'message', 'You must check I acknowledge to approve');
  END IF;

  SELECT * INTO v_return
  FROM inventory_returns
  WHERE id = p_return_id
  FOR UPDATE;

  IF v_return IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Return request not found');
  END IF;

  IF v_return.status != 'pending' THEN
    RETURN json_build_object('success', false, 'message', 'Request is not pending approval');
  END IF;

  IF v_return.receiver_id != v_leader_id THEN
    RETURN json_build_object('success', false, 'message', 'You are not the receiver for this return');
  END IF;

  v_company_id := v_return.company_id;

  FOR v_item IN
    SELECT iri.variant_id, iri.quantity, iri.allocated_price
    FROM inventory_return_items iri
    WHERE iri.return_id = p_return_id
  LOOP
    SELECT stock, allocated_price, dsp_price, rsp_price
    INTO v_agent_stock, v_allocated_price, v_dsp_price, v_rsp_price
    FROM agent_inventory
    WHERE agent_id = v_return.agent_id
      AND variant_id = v_item.variant_id
      AND company_id = v_company_id
    FOR UPDATE;

    IF COALESCE(v_return.stock_held, FALSE) THEN
      -- Already deducted at submit. Do not deduct again.
      v_from_location := CONCAT('return_hold:', v_return.id);
      IF v_allocated_price IS NULL THEN
        v_allocated_price := v_item.allocated_price;
      END IF;
    ELSE
      IF v_agent_stock IS NULL OR v_agent_stock < v_item.quantity THEN
        RAISE EXCEPTION 'Insufficient stock for variant. Agent may have sold items since request.';
      END IF;

      UPDATE agent_inventory
      SET stock = stock - v_item.quantity,
          updated_at = NOW()
      WHERE agent_id = v_return.agent_id
        AND variant_id = v_item.variant_id
        AND company_id = v_company_id;

      v_from_location := CONCAT('agent_inventory:', v_return.agent_id);
      IF v_allocated_price IS NULL THEN
        v_allocated_price := v_item.allocated_price;
      END IF;
    END IF;

    UPDATE agent_inventory
    SET stock = stock + v_item.quantity,
        updated_at = NOW()
    WHERE agent_id = v_return.receiver_id
      AND variant_id = v_item.variant_id
      AND company_id = v_company_id;

    IF NOT FOUND THEN
      INSERT INTO agent_inventory (
        agent_id, variant_id, company_id, stock, allocated_price, dsp_price, rsp_price, updated_at
      ) VALUES (
        v_return.receiver_id, v_item.variant_id, v_company_id, v_item.quantity,
        v_allocated_price, v_dsp_price, v_rsp_price, NOW()
      );
    END IF;

    INSERT INTO inventory_transactions (
      company_id, variant_id, transaction_type, quantity,
      from_location, to_location, performed_by, notes
    ) VALUES (
      v_company_id,
      v_item.variant_id,
      'return',
      v_item.quantity,
      v_from_location,
      CONCAT('agent_inventory:', v_return.receiver_id),
      v_leader_id,
      CONCAT('Return approved by leader. Reason: ', v_return.return_reason)
    );

    v_total_quantity := v_total_quantity + v_item.quantity;
  END LOOP;

  UPDATE inventory_returns
  SET status = 'approved',
      processed_by = v_leader_id,
      processed_at = NOW(),
      acknowledged = TRUE
  WHERE id = p_return_id;

  RETURN json_build_object(
    'success', true,
    'message', 'Return approved. Held inventory transferred.',
    'total_quantity', v_total_quantity
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_return_inventory_request(
  p_return_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_leader_id UUID;
  v_return RECORD;
  v_item RECORD;
  v_was_held BOOLEAN;
BEGIN
  v_leader_id := auth.uid();
  IF v_leader_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  SELECT * INTO v_return
  FROM inventory_returns
  WHERE id = p_return_id
  FOR UPDATE;

  IF v_return IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Return request not found');
  END IF;

  IF v_return.status != 'pending' THEN
    RETURN json_build_object('success', false, 'message', 'Request is not pending');
  END IF;

  IF v_return.receiver_id != v_leader_id THEN
    RETURN json_build_object('success', false, 'message', 'You are not the receiver for this return');
  END IF;

  v_was_held := COALESCE(v_return.stock_held, FALSE);

  IF v_was_held THEN
    FOR v_item IN
      SELECT iri.variant_id, iri.quantity, iri.allocated_price
      FROM inventory_return_items iri
      WHERE iri.return_id = p_return_id
    LOOP
      UPDATE agent_inventory
      SET stock = stock + v_item.quantity,
          updated_at = NOW()
      WHERE agent_id = v_return.agent_id
        AND variant_id = v_item.variant_id
        AND company_id = v_return.company_id;

      IF NOT FOUND THEN
        INSERT INTO agent_inventory (
          agent_id, variant_id, company_id, stock, allocated_price, updated_at
        ) VALUES (
          v_return.agent_id, v_item.variant_id, v_return.company_id, v_item.quantity,
          v_item.allocated_price, NOW()
        );
      END IF;

      INSERT INTO inventory_transactions (
        company_id, variant_id, transaction_type, quantity,
        from_location, to_location, performed_by, notes
      ) VALUES (
        v_return.company_id,
        v_item.variant_id,
        'return',
        v_item.quantity,
        CONCAT('return_hold:', v_return.id),
        CONCAT('agent_inventory:', v_return.agent_id),
        v_leader_id,
        CONCAT('Return rejected. Held stock restored to agent.', CASE WHEN p_reason IS NOT NULL AND btrim(p_reason) <> '' THEN CONCAT(' Reason: ', p_reason) ELSE '' END)
      );
    END LOOP;
  END IF;

  UPDATE inventory_returns
  SET status = 'rejected',
      processed_by = v_leader_id,
      processed_at = NOW(),
      rejection_reason = p_reason,
      stock_held = FALSE
  WHERE id = p_return_id;

  RETURN json_build_object(
    'success', true,
    'message', CASE
      WHEN v_was_held THEN 'Return request rejected. Held stock is back on the agent''s sellable inventory.'
      ELSE 'Return request rejected.'
    END
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;
