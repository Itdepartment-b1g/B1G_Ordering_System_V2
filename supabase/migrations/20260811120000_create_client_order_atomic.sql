-- ============================================================================
-- CREATE CLIENT ORDER ATOMIC
-- ============================================================================
-- Creates a client order, inserts all line items, and deducts agent inventory
-- in a SINGLE database transaction. If any item fails stock validation (or any
-- other error occurs), the entire order + all deductions are rolled back.
--
-- This replaces the previous client-side loop in OrderContext.addOrder that
-- could partially deduct stock when the network failed mid-loop.
--
-- NOTE: Only agent_inventory is deducted at creation (matches prior app behavior).
--       main_inventory is deducted on finance approval via approve_order_and_verify_deposit.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_client_order_atomic(
  p_agent_id UUID,
  p_client_id UUID,
  p_items JSONB,
  p_order_date DATE,
  p_subtotal NUMERIC DEFAULT 0,
  p_tax_amount NUMERIC DEFAULT 0,
  p_discount NUMERIC DEFAULT 0,
  p_total_amount NUMERIC DEFAULT 0,
  p_notes TEXT DEFAULT NULL,
  p_signature_url TEXT DEFAULT NULL,
  p_payment_method TEXT DEFAULT NULL,
  p_bank_type TEXT DEFAULT NULL,
  p_payment_proof_url TEXT DEFAULT NULL,
  p_payment_mode TEXT DEFAULT 'FULL',
  p_payment_splits JSONB DEFAULT NULL,
  p_stage TEXT DEFAULT 'agent_pending',
  p_remitted BOOLEAN DEFAULT FALSE,
  p_pricing_strategy TEXT DEFAULT 'rsp',
  p_order_number TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_order_number TEXT;
  v_company_id UUID;
  v_client_account_type TEXT;
  v_created_at TIMESTAMPTZ;
  v_item RECORD;
  v_current_stock INTEGER;
  v_item_count INTEGER;
BEGIN
  -- 1. Validate items payload
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order must include at least one item';
  END IF;

  -- 2. Resolve client / company
  SELECT company_id, account_type
  INTO v_company_id, v_client_account_type
  FROM clients
  WHERE id = p_client_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Client not found';
  END IF;

  IF v_client_account_type IS NULL THEN
    v_client_account_type := 'Standard Accounts';
  END IF;

  -- 3. Order number (use pre-generated when provided)
  IF p_order_number IS NOT NULL AND btrim(p_order_number) <> '' THEN
    v_order_number := btrim(p_order_number);
  ELSE
    SELECT generate_order_number(v_company_id) INTO v_order_number;
  END IF;

  -- 4. Pre-validate stock for ALL items (lock rows) before any writes
  FOR v_item IN
    SELECT *
    FROM jsonb_to_recordset(p_items) AS x(
      variant_id UUID,
      quantity INTEGER,
      unit_price NUMERIC,
      selling_price NUMERIC,
      dsp_price NUMERIC,
      rsp_price NUMERIC,
      total_price NUMERIC
    )
  LOOP
    IF v_item.variant_id IS NULL THEN
      RAISE EXCEPTION 'Each order item requires a variant_id';
    END IF;

    IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity for variant %', v_item.variant_id;
    END IF;

    SELECT stock
    INTO v_current_stock
    FROM agent_inventory
    WHERE agent_id = p_agent_id
      AND variant_id = v_item.variant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Agent inventory not found for variant %', v_item.variant_id;
    END IF;

    IF v_current_stock < v_item.quantity THEN
      RAISE EXCEPTION
        'Insufficient agent inventory for variant %. Available: %, Required: %',
        v_item.variant_id, v_current_stock, v_item.quantity;
    END IF;
  END LOOP;

  -- 5. Insert order header
  INSERT INTO client_orders (
    company_id,
    order_number,
    agent_id,
    client_id,
    client_account_type,
    order_date,
    subtotal,
    tax_rate,
    tax_amount,
    discount,
    total_amount,
    notes,
    signature_url,
    payment_method,
    bank_type,
    payment_proof_url,
    payment_mode,
    payment_splits,
    status,
    stage,
    remitted,
    pricing_strategy
  ) VALUES (
    v_company_id,
    v_order_number,
    p_agent_id,
    p_client_id,
    v_client_account_type,
    p_order_date,
    COALESCE(p_subtotal, 0),
    0,
    COALESCE(p_tax_amount, 0),
    COALESCE(p_discount, 0),
    COALESCE(p_total_amount, 0),
    p_notes,
    p_signature_url,
    p_payment_method,
    p_bank_type,
    p_payment_proof_url,
    COALESCE(p_payment_mode, 'FULL'),
    p_payment_splits,
    'pending',
    COALESCE(p_stage, 'agent_pending'),
    COALESCE(p_remitted, FALSE),
    COALESCE(p_pricing_strategy, 'rsp')
  )
  RETURNING id, created_at INTO v_order_id, v_created_at;

  -- 6. Insert items + deduct agent stock (already validated + locked)
  v_item_count := 0;
  FOR v_item IN
    SELECT *
    FROM jsonb_to_recordset(p_items) AS x(
      variant_id UUID,
      quantity INTEGER,
      unit_price NUMERIC,
      selling_price NUMERIC,
      dsp_price NUMERIC,
      rsp_price NUMERIC,
      total_price NUMERIC
    )
  LOOP
    INSERT INTO client_order_items (
      company_id,
      client_order_id,
      variant_id,
      quantity,
      unit_price,
      selling_price,
      dsp_price,
      rsp_price,
      total_price
    ) VALUES (
      v_company_id,
      v_order_id,
      v_item.variant_id,
      v_item.quantity,
      v_item.unit_price,
      v_item.selling_price,
      v_item.dsp_price,
      v_item.rsp_price,
      COALESCE(v_item.total_price, v_item.quantity * v_item.unit_price)
    );

    UPDATE agent_inventory
    SET
      stock = stock - v_item.quantity,
      updated_at = NOW()
    WHERE agent_id = p_agent_id
      AND variant_id = v_item.variant_id;

    v_item_count := v_item_count + 1;
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'message', 'Order created and agent stock deducted',
    'data', json_build_object(
      'id', v_order_id,
      'order_number', v_order_number,
      'created_at', v_created_at,
      'company_id', v_company_id,
      'client_account_type', v_client_account_type,
      'item_count', v_item_count
    )
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Any failure rolls back the whole function body (order + items + deductions)
    RETURN json_build_object(
      'success', false,
      'message', SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_client_order_atomic(
  UUID, UUID, JSONB, DATE, NUMERIC, NUMERIC, NUMERIC, NUMERIC,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, BOOLEAN, TEXT, TEXT
) TO authenticated;

COMMENT ON FUNCTION public.create_client_order_atomic(
  UUID, UUID, JSONB, DATE, NUMERIC, NUMERIC, NUMERIC, NUMERIC,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, BOOLEAN, TEXT, TEXT
) IS
  'Atomically create a client order, insert items, and deduct agent inventory. All-or-nothing.';
