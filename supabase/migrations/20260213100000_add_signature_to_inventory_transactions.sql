-- Add signature columns to inventory_transactions for return-to-main tracking
ALTER TABLE inventory_transactions
  ADD COLUMN IF NOT EXISTS signature_url TEXT,
  ADD COLUMN IF NOT EXISTS signature_path TEXT;

-- Update the return_inventory_to_main function to accept and store signature
CREATE OR REPLACE FUNCTION return_inventory_to_main(
  p_leader_id UUID,
  p_items JSONB,
  p_performed_by UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
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
  v_item JSONB;
  v_variant_id UUID;
  v_quantity INTEGER;
  v_leader_stock INTEGER;
  v_allocated_stock INTEGER;
  v_total_items INTEGER := 0;
  v_total_quantity INTEGER := 0;
  v_performer UUID;
BEGIN
  v_performer := COALESCE(p_performed_by, p_leader_id);

  SELECT company_id INTO v_company_id
  FROM profiles WHERE id = p_leader_id;

  IF v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Leader not found');
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN json_build_object('success', false, 'message', 'No items specified');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_variant_id := (v_item->>'variant_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;

    IF v_quantity <= 0 THEN
      RETURN json_build_object('success', false, 'message', 'Invalid quantity for variant ' || v_variant_id);
    END IF;

    SELECT stock INTO v_leader_stock
    FROM agent_inventory
    WHERE agent_id = p_leader_id
      AND variant_id = v_variant_id
      AND company_id = v_company_id;

    IF v_leader_stock IS NULL OR v_leader_stock < v_quantity THEN
      RETURN json_build_object(
        'success', false,
        'message', 'Insufficient stock for variant. Leader has: ' || COALESCE(v_leader_stock::TEXT, '0') || ', requested: ' || v_quantity
      );
    END IF;

    UPDATE agent_inventory
    SET stock = stock - v_quantity,
        updated_at = NOW()
    WHERE agent_id = p_leader_id
      AND variant_id = v_variant_id
      AND company_id = v_company_id;

    UPDATE main_inventory
    SET
      allocated_stock = GREATEST(0, COALESCE(allocated_stock, 0) - v_quantity),
      updated_at = NOW()
    WHERE variant_id = v_variant_id
      AND company_id = v_company_id;

    INSERT INTO inventory_transactions (
      company_id,
      variant_id,
      transaction_type,
      quantity,
      from_location,
      to_location,
      performed_by,
      notes,
      signature_url,
      signature_path
    ) VALUES (
      v_company_id,
      v_variant_id,
      'return_to_main',
      v_quantity,
      CONCAT('agent_inventory:', p_leader_id),
      'main_inventory',
      v_performer,
      COALESCE(p_reason, 'Leader returned stock to main inventory'),
      p_signature_url,
      p_signature_path
    );

    v_total_items := v_total_items + 1;
    v_total_quantity := v_total_quantity + v_quantity;
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'message', 'Stock returned to main inventory',
    'items_returned', v_total_items,
    'total_quantity', v_total_quantity
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION return_inventory_to_main(UUID, JSONB, UUID, TEXT, TEXT, TEXT) TO authenticated;
COMMENT ON FUNCTION return_inventory_to_main IS 'When a team leader returns stock to the company, deducts from leader agent_inventory and decrements main_inventory.allocated_stock. Stores signature for audit trail.';
