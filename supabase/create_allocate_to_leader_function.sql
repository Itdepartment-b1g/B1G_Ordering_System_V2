-- ============================================================================
-- ALLOCATE TO LEADER FUNCTION
-- ============================================================================
-- This function allocates stock from main_inventory to a team leader's
-- agent_inventory. It handles:
--   1. Calculates available stock (Total Stock - Already Allocated)
--   2. Validates sufficient available stock exists
--   3. Adds stock to agent_inventory (leader) - DOES NOT reduce main_inventory
--   4. Transfers pricing (Selling Price, DSP, RSP)
--   5. Creates transaction log for audit trail
--
-- IMPORTANT: Stock Calculation Logic
--   - Total Stock (main_inventory.stock) = Warehouse stock + Allocated stock
--   - Available Stock = Total Stock - SUM(agent_inventory.stock)
--   - When allocating, we check AVAILABLE stock, not TOTAL stock
--   - main_inventory.stock remains unchanged (represents company's total inventory)
--   - agent_inventory tracks distribution/allocation to leaders/agents
--
-- Parameters:
--   - p_leader_id: UUID of the team leader receiving the stock
--   - p_variant_id: UUID of the product variant to allocate
--   - p_quantity: Number of units to allocate
--   - p_performed_by: UUID of the user performing the allocation (usually admin)
--
-- Returns:
--   JSON object with success status, stock details, and pricing information
-- ============================================================================

-- Drop the function if it exists
DROP FUNCTION IF EXISTS allocate_to_leader(UUID, UUID, INTEGER, UUID);

-- Create the allocate_to_leader function
CREATE OR REPLACE FUNCTION allocate_to_leader(
  p_leader_id UUID,
  p_variant_id UUID,
  p_quantity INTEGER,
  p_performed_by UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_main_inventory_id UUID;
  v_total_stock INTEGER;
  v_allocated_stock INTEGER;
  v_available_stock INTEGER;
  v_unit_price NUMERIC;
  v_selling_price NUMERIC;
  v_dsp_price NUMERIC;
  v_rsp_price NUMERIC;
  v_company_id UUID;
  v_agent_inventory_id UUID;
  v_agent_current_stock INTEGER;
BEGIN
  -- Get the company_id from the leader's profile
  SELECT company_id INTO v_company_id
  FROM profiles
  WHERE id = p_leader_id;

  IF v_company_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Leader not found or has no company'
    );
  END IF;

  -- Get total stock and prices from main_inventory
  SELECT id, stock, unit_price, selling_price, dsp_price, rsp_price 
  INTO v_main_inventory_id, v_total_stock, v_unit_price, v_selling_price, v_dsp_price, v_rsp_price
  FROM main_inventory
  WHERE variant_id = p_variant_id
    AND company_id = v_company_id;

  -- Check if inventory exists
  IF v_main_inventory_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Variant not found in main inventory'
    );
  END IF;

  -- Calculate currently allocated stock (sum of all agent inventories for this variant)
  SELECT COALESCE(SUM(stock), 0) INTO v_allocated_stock
  FROM agent_inventory
  WHERE variant_id = p_variant_id
    AND company_id = v_company_id;

  -- Calculate available stock (total - allocated)
  v_available_stock := v_total_stock - v_allocated_stock;

  -- Check if enough available stock (not total stock)
  IF v_available_stock < p_quantity THEN
    RETURN json_build_object(
      'success', false,
      'error', CONCAT('Insufficient available stock. Available: ', v_available_stock, ', Requested: ', p_quantity)
    );
  END IF;

  -- Note: We do NOT reduce stock from main_inventory
  -- The main_inventory.stock represents TOTAL stock (warehouse + allocated)
  -- Available stock is calculated dynamically as: total - sum(agent_inventory)

  -- Check if leader already has this variant in agent_inventory
  SELECT id, stock INTO v_agent_inventory_id, v_agent_current_stock
  FROM agent_inventory
  WHERE agent_id = p_leader_id
    AND variant_id = p_variant_id
    AND company_id = v_company_id;

  IF v_agent_inventory_id IS NULL THEN
    -- Insert new record in agent_inventory with all pricing information
    INSERT INTO agent_inventory (
      agent_id,
      variant_id,
      company_id,
      stock,
      allocated_price,
      dsp_price,
      rsp_price
    ) VALUES (
      p_leader_id,
      p_variant_id,
      v_company_id,
      p_quantity,
      v_selling_price,
      v_dsp_price,
      v_rsp_price
    )
    RETURNING id INTO v_agent_inventory_id;
  ELSE
    -- Update existing record in agent_inventory with all pricing information
    UPDATE agent_inventory
    SET stock = stock + p_quantity,
        allocated_price = v_selling_price,
        dsp_price = v_dsp_price,
        rsp_price = v_rsp_price,
        updated_at = NOW()
    WHERE id = v_agent_inventory_id;
  END IF;

  -- Create transaction record with pricing and stock information
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
    'main_inventory',
    CONCAT('agent_inventory:', p_leader_id),
    p_performed_by,
    CONCAT('Stock allocated to team leader - ',
           'Total Stock: ', v_total_stock, ', ',
           'Previously Allocated: ', v_allocated_stock, ', ',
           'Available Before: ', v_available_stock, ', ',
           'Allocated Now: ', p_quantity, ', ',
           'Available After: ', (v_available_stock - p_quantity), ' | ',
           'Selling Price: ₱', COALESCE(v_selling_price::TEXT, '0'), 
           ', DSP: ₱', COALESCE(v_dsp_price::TEXT, '0'), 
           ', RSP: ₱', COALESCE(v_rsp_price::TEXT, '0'))
  );

  -- Return success with pricing and stock information
  RETURN json_build_object(
    'success', true,
    'allocated_quantity', p_quantity,
    'leader_id', p_leader_id,
    'variant_id', p_variant_id,
    'total_stock', v_total_stock,
    'allocated_stock_before', v_allocated_stock,
    'available_stock_before', v_available_stock,
    'available_stock_after', (v_available_stock - p_quantity),
    'allocated_price', v_selling_price,
    'dsp_price', v_dsp_price,
    'rsp_price', v_rsp_price
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
GRANT EXECUTE ON FUNCTION allocate_to_leader(UUID, UUID, INTEGER, UUID) TO authenticated;

-- Test the function (optional - comment out if not needed)
-- SELECT allocate_to_leader(
--   'leader-uuid-here'::UUID,
--   'variant-uuid-here'::UUID,
--   10,
--   'performer-uuid-here'::UUID
-- );

