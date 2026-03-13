-- ============================================================================
-- RETURN INVENTORY REQUEST APPROVAL FLOW
-- ============================================================================
-- Adds status, processed_by, processed_at, acknowledged, rejection_reason
-- to inventory_returns for approval-based return requests from mobile sales
-- to team leader (pending -> approved/rejected).
-- ============================================================================

-- 1. Add new columns to inventory_returns
ALTER TABLE inventory_returns
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS processed_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acknowledged BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- 2. Backfill existing rows as 'approved' (they were instant transfers)
UPDATE inventory_returns
SET status = 'approved'
WHERE status IS NULL;

-- 3. Add constraint and default for new rows
ALTER TABLE inventory_returns
  DROP CONSTRAINT IF EXISTS inventory_returns_status_check;
ALTER TABLE inventory_returns
  ADD CONSTRAINT inventory_returns_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));

ALTER TABLE inventory_returns
  ALTER COLUMN status SET DEFAULT 'pending';

-- 4. Index for pending returns by receiver (team leader dashboard)
CREATE INDEX IF NOT EXISTS idx_inventory_returns_pending_receiver
  ON inventory_returns(receiver_id, created_at DESC)
  WHERE status = 'pending';

-- 5. RLS: Team leaders (receiver) can update their pending returns (approve/reject)
DROP POLICY IF EXISTS "Receivers can update pending returns" ON inventory_returns;
CREATE POLICY "Receivers can update pending returns" ON inventory_returns
  FOR UPDATE
  USING (receiver_id = auth.uid() AND status = 'pending');

COMMENT ON COLUMN inventory_returns.status IS 'pending = awaiting team leader approval; approved = transferred; rejected = no transfer';
COMMENT ON COLUMN inventory_returns.processed_by IS 'Team leader who approved or rejected';
COMMENT ON COLUMN inventory_returns.processed_at IS 'When approved or rejected';
COMMENT ON COLUMN inventory_returns.acknowledged IS 'Team leader checked I acknowledge when approving';
COMMENT ON COLUMN inventory_returns.rejection_reason IS 'Optional reason when rejected';

-- ============================================================================
-- RPC: submit_return_inventory_request
-- Creates pending return request (no inventory transfer). Agent must be auth.uid().
-- ============================================================================
CREATE OR REPLACE FUNCTION submit_return_inventory_request(
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
  -- Only agent can submit for themselves
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

  -- Create return record with status=pending (no transfer)
  INSERT INTO inventory_returns (
    company_id, agent_id, receiver_id, return_type,
    return_reason, reason_notes, signature_url, signature_path,
    status
  ) VALUES (
    v_company_id, p_agent_id, p_receiver_id, p_return_type,
    p_return_reason, p_reason_notes, p_signature_url, p_signature_path,
    'pending'
  ) RETURNING id INTO v_return_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_variant_id := (v_item->>'variant_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;

    IF v_quantity <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity % for variant %', v_quantity, v_variant_id;
    END IF;

    SELECT stock, allocated_price INTO v_agent_stock, v_allocated_price
    FROM agent_inventory
    WHERE agent_id = p_agent_id AND variant_id = v_variant_id AND company_id = v_company_id;

    IF v_agent_stock IS NULL THEN
      RAISE EXCEPTION 'Variant % not found in agent inventory', v_variant_id;
    END IF;
    IF v_agent_stock < v_quantity THEN
      RAISE EXCEPTION 'Insufficient stock for variant %. Available: %, Requested: %',
        v_variant_id, v_agent_stock, v_quantity;
    END IF;

    INSERT INTO inventory_return_items (return_id, variant_id, quantity, allocated_price)
    VALUES (v_return_id, v_variant_id, v_quantity, v_allocated_price);

    v_total_items := v_total_items + 1;
    v_total_quantity := v_total_quantity + v_quantity;
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'message', 'Return request submitted. Awaiting team leader approval.',
    'return_id', v_return_id,
    'items_returned', v_total_items,
    'total_quantity', v_total_quantity
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION submit_return_inventory_request(UUID, UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- RPC: approve_return_inventory_request
-- Team leader approves; executes transfer; requires p_acknowledged = true.
-- ============================================================================
CREATE OR REPLACE FUNCTION approve_return_inventory_request(
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
BEGIN
  v_leader_id := auth.uid();
  IF v_leader_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  IF NOT p_acknowledged THEN
    RETURN json_build_object('success', false, 'message', 'You must check I acknowledge to approve');
  END IF;

  SELECT * INTO v_return FROM inventory_returns WHERE id = p_return_id;
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

  -- Execute transfer for each item
  FOR v_item IN
    SELECT iri.variant_id, iri.quantity, iri.allocated_price
    FROM inventory_return_items iri
    WHERE iri.return_id = p_return_id
  LOOP
    SELECT stock, allocated_price, dsp_price, rsp_price
    INTO v_agent_stock, v_allocated_price, v_dsp_price, v_rsp_price
    FROM agent_inventory
    WHERE agent_id = v_return.agent_id AND variant_id = v_item.variant_id AND company_id = v_company_id;

    IF v_agent_stock IS NULL OR v_agent_stock < v_item.quantity THEN
      RETURN json_build_object(
        'success', false,
        'message', 'Insufficient stock for variant. Agent may have sold items since request.'
      );
    END IF;

    -- Deduct from agent
    UPDATE agent_inventory
    SET stock = stock - v_item.quantity, updated_at = NOW()
    WHERE agent_id = v_return.agent_id AND variant_id = v_item.variant_id AND company_id = v_company_id;

    -- Add to receiver
    IF EXISTS (
      SELECT 1 FROM agent_inventory
      WHERE agent_id = v_return.receiver_id AND variant_id = v_item.variant_id AND company_id = v_company_id
    ) THEN
      UPDATE agent_inventory
      SET stock = stock + v_item.quantity, updated_at = NOW()
      WHERE agent_id = v_return.receiver_id AND variant_id = v_item.variant_id AND company_id = v_company_id;
    ELSE
      INSERT INTO agent_inventory (agent_id, variant_id, company_id, stock, allocated_price, dsp_price, rsp_price, updated_at)
      VALUES (v_return.receiver_id, v_item.variant_id, v_company_id, v_item.quantity,
        v_allocated_price, v_dsp_price, v_rsp_price, NOW());
    END IF;

    INSERT INTO inventory_transactions (
      company_id, variant_id, transaction_type, quantity,
      from_location, to_location, performed_by, notes
    ) VALUES (
      v_company_id, v_item.variant_id, 'return',
      v_item.quantity,
      CONCAT('agent_inventory:', v_return.agent_id),
      CONCAT('agent_inventory:', v_return.receiver_id),
      v_return.agent_id,
      CONCAT('Return approved by leader. Reason: ', v_return.return_reason)
    );

    v_total_quantity := v_total_quantity + v_item.quantity;
  END LOOP;

  UPDATE inventory_returns
  SET status = 'approved', processed_by = v_leader_id, processed_at = NOW(), acknowledged = TRUE
  WHERE id = p_return_id;

  RETURN json_build_object(
    'success', true,
    'message', 'Return approved. Inventory transferred.',
    'total_quantity', v_total_quantity
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION approve_return_inventory_request(UUID, BOOLEAN) TO authenticated;

-- ============================================================================
-- RPC: reject_return_inventory_request
-- Team leader rejects; no inventory transfer.
-- ============================================================================
CREATE OR REPLACE FUNCTION reject_return_inventory_request(
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
BEGIN
  v_leader_id := auth.uid();
  IF v_leader_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  SELECT * INTO v_return FROM inventory_returns WHERE id = p_return_id;
  IF v_return IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Return request not found');
  END IF;

  IF v_return.status != 'pending' THEN
    RETURN json_build_object('success', false, 'message', 'Request is not pending');
  END IF;

  IF v_return.receiver_id != v_leader_id THEN
    RETURN json_build_object('success', false, 'message', 'You are not the receiver for this return');
  END IF;

  UPDATE inventory_returns
  SET status = 'rejected', processed_by = v_leader_id, processed_at = NOW(), rejection_reason = p_reason
  WHERE id = p_return_id;

  RETURN json_build_object('success', true, 'message', 'Return request rejected');
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION reject_return_inventory_request(UUID, TEXT) TO authenticated;

-- ============================================================================
-- Update return_inventory_to_leader to set status = 'approved' (backward compat)
-- when doing instant transfer, so legacy callers get correct status.
-- ============================================================================
CREATE OR REPLACE FUNCTION return_inventory_to_leader(
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
  v_dsp_price NUMERIC(10,2);
  v_rsp_price NUMERIC(10,2);
  v_total_items INTEGER := 0;
  v_total_quantity INTEGER := 0;
BEGIN
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
    status
  ) VALUES (
    v_company_id, p_agent_id, p_receiver_id, p_return_type,
    p_return_reason, p_reason_notes, p_signature_url, p_signature_path,
    'approved'
  ) RETURNING id INTO v_return_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_variant_id := (v_item->>'variant_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;

    IF v_quantity <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity % for variant %', v_quantity, v_variant_id;
    END IF;

    SELECT stock, allocated_price, dsp_price, rsp_price
    INTO v_agent_stock, v_allocated_price, v_dsp_price, v_rsp_price
    FROM agent_inventory
    WHERE agent_id = p_agent_id AND variant_id = v_variant_id AND company_id = v_company_id;

    IF v_agent_stock IS NULL THEN
      RAISE EXCEPTION 'Variant % not found in agent inventory', v_variant_id;
    END IF;
    IF v_agent_stock < v_quantity THEN
      RAISE EXCEPTION 'Insufficient stock for variant %. Available: %, Requested: %',
        v_variant_id, v_agent_stock, v_quantity;
    END IF;

    UPDATE agent_inventory SET stock = stock - v_quantity, updated_at = NOW()
    WHERE agent_id = p_agent_id AND variant_id = v_variant_id AND company_id = v_company_id;

    IF EXISTS (SELECT 1 FROM agent_inventory WHERE agent_id = p_receiver_id AND variant_id = v_variant_id AND company_id = v_company_id) THEN
      UPDATE agent_inventory SET stock = stock + v_quantity, updated_at = NOW()
      WHERE agent_id = p_receiver_id AND variant_id = v_variant_id AND company_id = v_company_id;
    ELSE
      INSERT INTO agent_inventory (agent_id, variant_id, company_id, stock, allocated_price, dsp_price, rsp_price, updated_at)
      VALUES (p_receiver_id, v_variant_id, v_company_id, v_quantity, v_allocated_price, v_dsp_price, v_rsp_price, NOW());
    END IF;

    INSERT INTO inventory_return_items (return_id, variant_id, quantity, allocated_price)
    VALUES (v_return_id, v_variant_id, v_quantity, v_allocated_price);

    INSERT INTO inventory_transactions (company_id, variant_id, transaction_type, quantity, from_location, to_location, performed_by, notes)
    VALUES (v_company_id, v_variant_id, 'return', v_quantity,
      CONCAT('agent_inventory:', p_agent_id), CONCAT('agent_inventory:', p_receiver_id), p_agent_id,
      CONCAT('Returned ', v_quantity, ' units to leader. Reason: ', p_return_reason));

    v_total_items := v_total_items + 1;
    v_total_quantity := v_total_quantity + v_quantity;
  END LOOP;

  RETURN json_build_object('success', true, 'message', 'Inventory returned successfully', 'return_id', v_return_id,
    'items_returned', v_total_items, 'total_quantity', v_total_quantity, 'return_type', p_return_type);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;
