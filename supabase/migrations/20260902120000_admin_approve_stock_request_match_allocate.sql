-- Direct leader request approval must match allocate_to_leader:
-- keep main_inventory.stock (total), increase allocated_stock, credit leader inventory.

CREATE OR REPLACE FUNCTION public.admin_approve_stock_request(
  p_request_id uuid,
  p_admin_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
  v_total_quantity INTEGER;
  v_available_stock INTEGER;
  v_alloc_result json;
BEGIN
  SELECT * INTO v_request
  FROM stock_requests
  WHERE id = p_request_id AND status = 'approved_by_leader';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Request not found or not awaiting admin approval');
  END IF;

  v_total_quantity := v_request.requested_quantity + COALESCE(v_request.leader_additional_quantity, 0);

  v_available_stock := get_available_stock(v_request.variant_id, v_request.company_id);

  IF v_available_stock < v_total_quantity THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', format('Insufficient stock. Available: %s, Requested: %s', v_available_stock, v_total_quantity)
    );
  END IF;

  -- CASE A: Direct leader request — same accounting as Allocate Stock
  IF v_request.agent_id = v_request.leader_id THEN
    v_alloc_result := public.allocate_to_leader(
      v_request.leader_id,
      v_request.variant_id,
      v_total_quantity,
      p_admin_id,
      'stock_request',
      p_request_id
    );

    IF COALESCE((v_alloc_result->>'success')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION '%', COALESCE(v_alloc_result->>'error', 'Failed to allocate stock to leader');
    END IF;

    UPDATE stock_requests
    SET
      status = 'fulfilled',
      admin_approved_at = NOW(),
      admin_approved_by = p_admin_id,
      admin_notes = COALESCE(p_notes, admin_notes),
      fulfilled_at = NOW(),
      fulfilled_by = p_admin_id,
      fulfilled_quantity = v_total_quantity,
      updated_at = NOW()
    WHERE id = p_request_id;

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Request fulfilled and stock allocated to leader',
      'total_transferred', v_total_quantity
    );

  -- CASE B: Mobile agent request via leader — reserve only, leader distributes later
  ELSE
    UPDATE main_inventory
    SET
      allocated_stock = COALESCE(allocated_stock, 0) + v_total_quantity,
      updated_at = NOW()
    WHERE variant_id = v_request.variant_id AND company_id = v_request.company_id;

    UPDATE stock_requests
    SET
      status = 'approved_by_admin',
      admin_approved_at = NOW(),
      admin_approved_by = p_admin_id,
      admin_notes = COALESCE(p_notes, admin_notes),
      updated_at = NOW()
    WHERE id = p_request_id;

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Request approved and stock allocated (pending leader distribution)',
      'total_allocated', v_total_quantity,
      'agent_quantity', v_request.requested_quantity,
      'leader_quantity', COALESCE(v_request.leader_additional_quantity, 0)
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_approve_stock_request(uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.admin_approve_stock_request(uuid, uuid, text) IS
  'Approves a leader-forwarded stock request. Direct leader requests use allocate_to_leader (total stock unchanged, allocated_stock increases, leader inventory credited). Mobile-agent requests reserve allocated_stock pending leader distribution.';
