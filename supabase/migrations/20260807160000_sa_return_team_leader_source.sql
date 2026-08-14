-- Allow hub-linked Standard Account team leaders to return stock they hold.
-- TL return deducts: agent_inventory + main_inventory.stock + main_inventory.allocated_stock.
-- TL returns start as pending_approval (super admin must approve before warehouse sees them).
-- Reject/cancel of a TL return restores the same three layers.
-- Admin/super_admin return stays unallocated-main-only (source_agent_id NULL → pending_receive).

ALTER TABLE public.standard_account_stock_return_requests
  ADD COLUMN IF NOT EXISTS source_agent_id uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.standard_account_stock_return_requests
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

ALTER TABLE public.standard_account_stock_return_requests
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.standard_account_stock_return_requests.source_agent_id IS
  'When set, return came from this team leader''s agent_inventory; cancel restores TL stock + main allocated.';

COMMENT ON COLUMN public.standard_account_stock_return_requests.approved_at IS
  'When a TL return was approved by company admin/super_admin and released to warehouse.';

CREATE INDEX IF NOT EXISTS idx_sa_stock_return_requests_source_agent
  ON public.standard_account_stock_return_requests (source_agent_id)
  WHERE source_agent_id IS NOT NULL;

ALTER TABLE public.standard_account_stock_return_requests
  DROP CONSTRAINT IF EXISTS standard_account_stock_return_requests_status_check;

ALTER TABLE public.standard_account_stock_return_requests
  ADD CONSTRAINT standard_account_stock_return_requests_status_check
  CHECK (
    status IN (
      'pending_approval',
      'pending_receive',
      'partially_received',
      'fully_received',
      'cancelled'
    )
  );

-- ---------------------------------------------------------------------------
-- Create: admin (unallocated main) OR team_leader (own agent stock)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_standard_account_stock_return_request(
  p_items jsonb,
  p_notes text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_destination_location_id uuid DEFAULT NULL,
  p_signature_url text DEFAULT NULL,
  p_signature_path text DEFAULT NULL,
  p_proof_image_url text DEFAULT NULL,
  p_proof_image_path text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid;
  v_creator uuid;
  v_actor_role text;
  v_is_team_leader boolean := false;
  v_client_company_id uuid;
  v_warehouse_company_id uuid;
  v_account_type text;
  v_request_id uuid;
  v_request_number text;
  v_item jsonb;
  v_client_variant_id uuid;
  v_warehouse_variant_id uuid;
  v_qty integer;
  v_available integer;
  v_agent_stock integer;
  v_inv RECORD;
  v_dest_loc RECORD;
BEGIN
  v_actor := auth.uid();
  v_creator := COALESCE(p_created_by, v_actor);
  v_client_company_id := public.get_auth_company_id();

  IF v_client_company_id IS NULL OR v_actor IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT p.role INTO v_actor_role
  FROM public.profiles p
  WHERE p.id = v_actor
    AND p.company_id = v_client_company_id;

  IF v_actor_role IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Profile not found for this company');
  END IF;

  -- Path is based on the authenticated caller, not p_created_by.
  v_is_team_leader := v_actor_role = 'team_leader';
  IF v_is_team_leader THEN
    v_creator := v_actor;
  END IF;

  IF NOT (
    public.is_system_administrator()
    OR (
      public.is_admin_or_super_admin()
      AND v_actor_role IN ('admin', 'super_admin')
    )
    OR v_is_team_leader
  ) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Only company admins or team leaders can create warehouse returns'
    );
  END IF;

  SELECT c.company_account_type INTO v_account_type
  FROM public.companies c
  WHERE c.id = v_client_company_id;

  IF v_account_type IS DISTINCT FROM 'Standard Accounts' THEN
    RETURN json_build_object('success', false, 'error', 'Only Standard Accounts can return stock to the warehouse');
  END IF;

  v_warehouse_company_id := public.get_linked_warehouse_company_id();
  IF v_warehouse_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'This company is not linked to a warehouse');
  END IF;

  IF p_destination_location_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Select a warehouse location to return to (main or sub)');
  END IF;

  IF NULLIF(trim(p_signature_url), '') IS NULL OR NULLIF(trim(p_signature_path), '') IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Signature is required');
  END IF;

  IF NULLIF(trim(p_proof_image_url), '') IS NULL OR NULLIF(trim(p_proof_image_path), '') IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Return proof photo is required');
  END IF;

  SELECT wl.id, wl.company_id, wl.name, COALESCE(wl.is_main, false) AS is_main
  INTO v_dest_loc
  FROM public.warehouse_locations wl
  WHERE wl.id = p_destination_location_id
    AND wl.company_id = v_warehouse_company_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Selected warehouse location is not valid for your linked warehouse');
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'At least one return line is required');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_client_variant_id := (v_item->>'client_variant_id')::uuid;
    v_qty := COALESCE((v_item->>'quantity')::int, 0);

    IF v_client_variant_id IS NULL OR v_qty <= 0 THEN
      RETURN json_build_object('success', false, 'error', 'Each line needs a valid product and quantity');
    END IF;

    SELECT m.warehouse_variant_id INTO v_warehouse_variant_id
    FROM public.warehouse_variant_mappings m
    WHERE m.client_company_id = v_client_company_id
      AND m.warehouse_company_id = v_warehouse_company_id
      AND m.client_variant_id = v_client_variant_id
    LIMIT 1;

    IF v_warehouse_variant_id IS NULL THEN
      RETURN json_build_object(
        'success', false,
        'error', 'No warehouse product mapping found for a selected variant',
        'client_variant_id', v_client_variant_id
      );
    END IF;

    SELECT * INTO v_inv
    FROM public.main_inventory
    WHERE company_id = v_client_company_id
      AND variant_id = v_client_variant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Product not found in company inventory',
        'client_variant_id', v_client_variant_id
      );
    END IF;

    IF v_is_team_leader THEN
      SELECT COALESCE(ai.stock, 0) INTO v_agent_stock
      FROM public.agent_inventory ai
      WHERE ai.company_id = v_client_company_id
        AND ai.agent_id = v_creator
        AND ai.variant_id = v_client_variant_id
      FOR UPDATE;

      IF v_agent_stock IS NULL THEN
        v_agent_stock := 0;
      END IF;

      IF v_qty > v_agent_stock THEN
        RETURN json_build_object(
          'success', false,
          'error', 'Insufficient team leader stock for return',
          'client_variant_id', v_client_variant_id,
          'available', v_agent_stock,
          'requested', v_qty
        );
      END IF;

      IF v_qty > COALESCE(v_inv.stock, 0) THEN
        RETURN json_build_object(
          'success', false,
          'error', 'Insufficient company stock for return',
          'client_variant_id', v_client_variant_id,
          'available', COALESCE(v_inv.stock, 0),
          'requested', v_qty
        );
      END IF;

      IF v_qty > COALESCE(v_inv.allocated_stock, 0) THEN
        RETURN json_build_object(
          'success', false,
          'error', 'Insufficient allocated stock for team leader return',
          'client_variant_id', v_client_variant_id,
          'allocated', COALESCE(v_inv.allocated_stock, 0),
          'requested', v_qty
        );
      END IF;
    ELSE
      v_available := GREATEST(0, COALESCE(v_inv.stock, 0) - COALESCE(v_inv.allocated_stock, 0));
      IF v_qty > v_available THEN
        RETURN json_build_object(
          'success', false,
          'error', 'Insufficient available stock for return',
          'client_variant_id', v_client_variant_id,
          'available', v_available,
          'requested', v_qty
        );
      END IF;
    END IF;
  END LOOP;

  v_request_number := public.generate_standard_account_stock_return_number(v_client_company_id);

  INSERT INTO public.standard_account_stock_return_requests (
    request_number, client_company_id, warehouse_company_id, destination_location_id,
    status, notes, created_by, source_agent_id,
    signature_url, signature_path, proof_image_url, proof_image_path
  ) VALUES (
    v_request_number, v_client_company_id, v_warehouse_company_id, p_destination_location_id,
    CASE WHEN v_is_team_leader THEN 'pending_approval' ELSE 'pending_receive' END,
    NULLIF(trim(p_notes), ''), v_creator,
    CASE WHEN v_is_team_leader THEN v_creator ELSE NULL END,
    NULLIF(trim(p_signature_url), ''), NULLIF(trim(p_signature_path), ''),
    NULLIF(trim(p_proof_image_url), ''), NULLIF(trim(p_proof_image_path), '')
  )
  RETURNING id INTO v_request_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_client_variant_id := (v_item->>'client_variant_id')::uuid;
    v_qty := (v_item->>'quantity')::int;

    SELECT m.warehouse_variant_id INTO v_warehouse_variant_id
    FROM public.warehouse_variant_mappings m
    WHERE m.client_company_id = v_client_company_id
      AND m.warehouse_company_id = v_warehouse_company_id
      AND m.client_variant_id = v_client_variant_id
    LIMIT 1;

    IF v_is_team_leader THEN
      UPDATE public.agent_inventory
      SET stock = stock - v_qty,
          updated_at = now()
      WHERE company_id = v_client_company_id
        AND agent_id = v_creator
        AND variant_id = v_client_variant_id
        AND stock >= v_qty;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Failed to deduct team leader stock for variant %', v_client_variant_id;
      END IF;

      UPDATE public.main_inventory
      SET stock = COALESCE(stock, 0) - v_qty,
          allocated_stock = GREATEST(0, COALESCE(allocated_stock, 0) - v_qty),
          updated_at = now()
      WHERE company_id = v_client_company_id
        AND variant_id = v_client_variant_id;
    ELSE
      UPDATE public.main_inventory
      SET stock = COALESCE(stock, 0) - v_qty,
          updated_at = now()
      WHERE company_id = v_client_company_id
        AND variant_id = v_client_variant_id;
    END IF;

    INSERT INTO public.standard_account_stock_return_request_items (
      request_id, client_variant_id, warehouse_variant_id, return_quantity
    ) VALUES (
      v_request_id, v_client_variant_id, v_warehouse_variant_id, v_qty
    );

    INSERT INTO public.inventory_transactions (
      company_id, variant_id, transaction_type, quantity,
      from_location, to_location,
      reference_type, reference_id, performed_by, notes, created_at
    ) VALUES (
      v_client_company_id, v_client_variant_id, 'client_return_out', v_qty,
      CASE
        WHEN v_is_team_leader THEN CONCAT('agent_inventory:', v_creator)
        ELSE 'main_inventory'
      END,
      CONCAT('warehouse_location:', p_destination_location_id),
      'standard_account_stock_return', v_request_id, v_creator,
      CASE
        WHEN v_is_team_leader THEN
          'TL return pending approval ' || v_request_number || ' @ ' || v_dest_loc.name
        ELSE
          'Return to warehouse ' || v_request_number || ' @ ' || v_dest_loc.name
      END,
      now()
    );
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'request_id', v_request_id,
    'request_number', v_request_number,
    'destination_location_id', p_destination_location_id,
    'source_agent_id', CASE WHEN v_is_team_leader THEN v_creator ELSE NULL END,
    'status', CASE WHEN v_is_team_leader THEN 'pending_approval' ELSE 'pending_receive' END
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('success', false, 'error', 'Duplicate product on return request');
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_standard_account_stock_return_request(
  jsonb, text, uuid, uuid, text, text, text, text
) TO authenticated;

-- ---------------------------------------------------------------------------
-- Cancel: restore TL agent + allocated when source_agent_id set
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_standard_account_stock_return_request(
  p_request_id uuid,
  p_reason text DEFAULT NULL,
  p_cancelled_by uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid;
  v_request RECORD;
  v_item RECORD;
  v_remaining integer;
  v_rows integer;
  v_user_location_id uuid;
  v_actor_role text;
BEGIN
  v_actor := COALESCE(p_cancelled_by, auth.uid());

  SELECT * INTO v_request
  FROM public.standard_account_stock_return_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Return request not found');
  END IF;

  IF v_request.status = 'cancelled' THEN
    RETURN json_build_object('success', false, 'error', 'Return request already cancelled');
  END IF;

  IF v_request.status NOT IN ('pending_approval', 'pending_receive') THEN
    RETURN json_build_object('success', false, 'error', 'Only pending returns can be cancelled');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.standard_account_stock_return_request_items i
    WHERE i.request_id = p_request_id AND i.inspected_quantity > 0
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Cannot cancel a return that has already been inspected');
  END IF;

  v_user_location_id := public.get_warehouse_location_id(v_actor);

  SELECT p.role INTO v_actor_role
  FROM public.profiles p
  WHERE p.id = v_actor;

  -- pending_approval: only company admin/super_admin (reject) or the TL who submitted.
  -- pending_receive: admin, submitting TL, or destination warehouse (existing rules).
  IF v_request.status = 'pending_approval' THEN
    IF NOT (
      public.is_system_administrator()
      OR (
        public.is_admin_or_super_admin()
        AND v_request.client_company_id = public.get_auth_company_id()
      )
      OR (
        v_actor_role = 'team_leader'
        AND v_request.client_company_id = public.get_auth_company_id()
        AND (
          v_request.source_agent_id = v_actor
          OR v_request.created_by = v_actor
        )
      )
    ) THEN
      RETURN json_build_object('success', false, 'error', 'Unauthorized to reject this return');
    END IF;
  ELSIF NOT (
    public.is_system_administrator()
    OR (
      public.is_admin_or_super_admin()
      AND v_request.client_company_id = public.get_auth_company_id()
    )
    OR (
      v_actor_role = 'team_leader'
      AND v_request.client_company_id = public.get_auth_company_id()
      AND (
        v_request.source_agent_id = v_actor
        OR v_request.created_by = v_actor
      )
    )
    OR (
      public.is_warehouse()
      AND v_request.warehouse_company_id = public.get_auth_company_id()
      AND (
        public.is_main_warehouse_user(v_actor)
        OR (
          v_request.destination_location_id IS NOT NULL
          AND v_user_location_id = v_request.destination_location_id
        )
      )
    )
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized to cancel this return');
  END IF;

  FOR v_item IN
    SELECT * FROM public.standard_account_stock_return_request_items
    WHERE request_id = p_request_id
  LOOP
    v_remaining := v_item.return_quantity - v_item.inspected_quantity;
    IF v_remaining <= 0 THEN
      CONTINUE;
    END IF;

    IF v_request.source_agent_id IS NOT NULL THEN
      UPDATE public.agent_inventory
      SET stock = COALESCE(stock, 0) + v_remaining,
          updated_at = now()
      WHERE company_id = v_request.client_company_id
        AND agent_id = v_request.source_agent_id
        AND variant_id = v_item.client_variant_id;
      GET DIAGNOSTICS v_rows = ROW_COUNT;

      IF v_rows = 0 THEN
        INSERT INTO public.agent_inventory (
          company_id, agent_id, variant_id, stock, allocated_price, dsp_price, rsp_price, created_at, updated_at
        ) VALUES (
          v_request.client_company_id, v_request.source_agent_id, v_item.client_variant_id,
          v_remaining, 0, 0, 0, now(), now()
        );
      END IF;

      UPDATE public.main_inventory
      SET stock = COALESCE(stock, 0) + v_remaining,
          allocated_stock = COALESCE(allocated_stock, 0) + v_remaining,
          updated_at = now()
      WHERE company_id = v_request.client_company_id
        AND variant_id = v_item.client_variant_id;
      GET DIAGNOSTICS v_rows = ROW_COUNT;

      IF v_rows = 0 THEN
        INSERT INTO public.main_inventory (
          company_id, variant_id, stock, unit_price, reorder_level, allocated_stock, created_at, updated_at
        ) VALUES (
          v_request.client_company_id, v_item.client_variant_id, v_remaining, 0, 100, v_remaining, now(), now()
        );
      END IF;
    ELSE
      UPDATE public.main_inventory
      SET stock = COALESCE(stock, 0) + v_remaining,
          updated_at = now()
      WHERE company_id = v_request.client_company_id
        AND variant_id = v_item.client_variant_id;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows = 0 THEN
        INSERT INTO public.main_inventory (
          company_id, variant_id, stock, unit_price, reorder_level, created_at, updated_at
        ) VALUES (
          v_request.client_company_id, v_item.client_variant_id, v_remaining, 0, 100, now(), now()
        );
      END IF;
    END IF;

    INSERT INTO public.inventory_transactions (
      company_id, variant_id, transaction_type, quantity,
      reference_type, reference_id, performed_by, notes, created_at
    ) VALUES (
      v_request.client_company_id, v_item.client_variant_id, 'client_return_cancel_in', v_remaining,
      'standard_account_stock_return', p_request_id, v_actor,
      'Cancelled return ' || v_request.request_number,
      now()
    );
  END LOOP;

  UPDATE public.standard_account_stock_return_requests
  SET status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = v_actor,
      cancellation_reason = NULLIF(trim(p_reason), ''),
      updated_at = now()
  WHERE id = p_request_id;

  RETURN json_build_object('success', true, 'request_number', v_request.request_number);
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_standard_account_stock_return_request(uuid, text, uuid)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- Approve TL return: pending_approval → pending_receive (warehouse can inspect)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_standard_account_stock_return_request(
  p_request_id uuid,
  p_approved_by uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid;
  v_request RECORD;
BEGIN
  v_actor := COALESCE(p_approved_by, auth.uid());

  SELECT * INTO v_request
  FROM public.standard_account_stock_return_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Return request not found');
  END IF;

  IF v_request.status IS DISTINCT FROM 'pending_approval' THEN
    RETURN json_build_object('success', false, 'error', 'Only returns pending approval can be approved');
  END IF;

  IF NOT (
    public.is_system_administrator()
    OR (
      public.is_admin_or_super_admin()
      AND v_request.client_company_id = public.get_auth_company_id()
    )
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Only company admins can approve team leader returns');
  END IF;

  UPDATE public.standard_account_stock_return_requests
  SET status = 'pending_receive',
      approved_at = now(),
      approved_by = v_actor,
      updated_at = now()
  WHERE id = p_request_id;

  RETURN json_build_object(
    'success', true,
    'request_number', v_request.request_number,
    'status', 'pending_receive'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_standard_account_stock_return_request(uuid, uuid)
  TO authenticated;
