-- ============================================================================
-- ALLOCATE TO AGENT FUNCTION
-- ============================================================================
-- This function allocates stock from a leader's inventory to a mobile agent's
-- agent_inventory record.
--
-- UPDATED: Now DEDUCTS stock from the leader's agent_inventory when allocating
-- to team members. For example:
--   - Leader has 241 units
--   - Allocates 200 units to agent
--   - Leader now has 41 units remaining
--
-- Flow:
--   1. Gets the leader ID from p_performed_by (the leader doing the allocation)
--   2. Validates leader has sufficient stock for this variant
--   3. Deducts quantity from leader's agent_inventory
--   4. Adds/updates agent's agent_inventory record
--   5. Logs inventory transaction
--
-- Parameters:
--   - p_agent_id:       UUID of the mobile agent receiving stock
--   - p_variant_id:     UUID of the product variant
--   - p_quantity:       Number of units to allocate
--   - p_allocated_price NUMERIC: effective cost/allocated price
--   - p_dsp_price       NUMERIC (optional)
--   - p_rsp_price       NUMERIC (optional)
--   - p_performed_by:   UUID of the user performing the allocation (leader/admin)
--
-- Returns:
--   JSON object shaped like FunctionResponse:
--     { success: boolean, message?: string, error?: string, data?: any }
-- ============================================================================

-- Drop legacy signature if it exists (older 5-arg version)
DROP FUNCTION IF EXISTS allocate_to_agent(UUID, UUID, INTEGER, DECIMAL, UUID);

-- Create the allocate_to_agent function (7 args, matching frontend usage)
CREATE OR REPLACE FUNCTION allocate_to_agent(
  p_agent_id        UUID,
  p_variant_id      UUID,
  p_quantity        INTEGER,
  p_allocated_price NUMERIC,
  p_dsp_price       NUMERIC,
  p_rsp_price       NUMERIC,
  p_performed_by    UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id         UUID;
  v_agent_inventory_id UUID;
  v_current_stock      INTEGER;
  v_leader_inventory_id UUID;
  v_leader_stock       INTEGER;
  v_leader_role        TEXT;
BEGIN
  -- Basic validation
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Quantity must be greater than zero'
    );
  END IF;

  -- Get the company_id from the agent's profile
  SELECT company_id
  INTO v_company_id
  FROM profiles
  WHERE id = p_agent_id;

  IF v_company_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Agent not found or has no company'
    );
  END IF;

  -- Get the leader's role (person performing the allocation)
  SELECT role
  INTO v_leader_role
  FROM profiles
  WHERE id = p_performed_by;

  -- If the performer is a team_leader, deduct from their inventory
  -- (Admins/Super_admins can allocate without deduction as they allocate from main_inventory)
  IF v_leader_role = 'team_leader' OR v_leader_role = 'manager' THEN
    -- Get leader's current stock for this variant
    SELECT id, stock
    INTO v_leader_inventory_id, v_leader_stock
    FROM agent_inventory
    WHERE agent_id = p_performed_by
      AND variant_id = p_variant_id
      AND company_id = v_company_id;

    -- Validate leader has enough stock
    IF v_leader_inventory_id IS NULL THEN
      RETURN json_build_object(
        'success', false,
        'error', 'You do not have this product in your inventory'
      );
    END IF;

    IF v_leader_stock < p_quantity THEN
      RETURN json_build_object(
        'success', false,
        'error', CONCAT('Insufficient stock. You have ', v_leader_stock, ' units available, but tried to allocate ', p_quantity, ' units')
      );
    END IF;

    -- Deduct from leader's inventory
    UPDATE agent_inventory
    SET stock = stock - p_quantity,
        updated_at = NOW()
    WHERE id = v_leader_inventory_id;
  END IF;

  -- Look for existing agent_inventory row for this agent + variant
  SELECT id, stock
  INTO v_agent_inventory_id, v_current_stock
  FROM agent_inventory
  WHERE agent_id = p_agent_id
    AND variant_id = p_variant_id
    AND company_id = v_company_id;

  IF v_agent_inventory_id IS NULL THEN
    -- Insert new inventory row for the agent
    INSERT INTO agent_inventory (
      agent_id,
      variant_id,
      company_id,
      stock,
      allocated_price,
      dsp_price,
      rsp_price
    ) VALUES (
      p_agent_id,
      p_variant_id,
      v_company_id,
      p_quantity,
      p_allocated_price,
      p_dsp_price,
      p_rsp_price
    )
    RETURNING id INTO v_agent_inventory_id;
  ELSE
    -- Update existing row: increase stock, refresh pricing
    UPDATE agent_inventory
    SET stock          = stock + p_quantity,
        allocated_price = p_allocated_price,
        dsp_price       = COALESCE(p_dsp_price, dsp_price),
        rsp_price       = COALESCE(p_rsp_price, rsp_price),
        updated_at      = NOW()
    WHERE id = v_agent_inventory_id;
  END IF;

  -- Log inventory transaction for audit trail
  INSERT INTO inventory_transactions (
    company_id,
    variant_id,
    transaction_type,
    quantity,
    from_location,
    to_location,
    performed_by,
    notes
  ) VALUES (
    v_company_id,
    p_variant_id,
    'allocated_to_agent',
    p_quantity,
    'leader_inventory',
    CONCAT('agent_inventory:', p_agent_id),
    p_performed_by,
    CONCAT('Allocated ', p_quantity, ' units to agent ', p_agent_id,
           ' at price ₱', COALESCE(p_allocated_price::TEXT, '0'),
           CASE WHEN p_dsp_price IS NOT NULL THEN CONCAT(', DSP ₱', p_dsp_price::TEXT) ELSE '' END,
           CASE WHEN p_rsp_price IS NOT NULL THEN CONCAT(', RSP ₱', p_rsp_price::TEXT) ELSE '' END)
  );

  -- Return success payload
  RETURN json_build_object(
    'success', true,
    'message', CASE 
      WHEN v_leader_role = 'team_leader' OR v_leader_role = 'manager' 
      THEN CONCAT('Stock allocated successfully. ', p_quantity, ' units deducted from your inventory')
      ELSE 'Stock allocated to agent successfully'
    END,
    'data', json_build_object(
      'agent_id', p_agent_id,
      'variant_id', p_variant_id,
      'quantity', p_quantity,
      'leader_stock_deducted', CASE WHEN v_leader_role IN ('team_leader', 'manager') THEN true ELSE false END
    )
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION allocate_to_agent(
  UUID, UUID, INTEGER, NUMERIC, NUMERIC, NUMERIC, UUID
) TO authenticated;


