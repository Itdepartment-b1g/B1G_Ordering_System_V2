-- Persist create-dialog return type: sellable stock return vs disposal stock.
-- UI already sends p_return_type = my_inventory | item_disposal.

ALTER TABLE public.standard_account_stock_return_requests
  ADD COLUMN IF NOT EXISTS return_type text NOT NULL DEFAULT 'my_inventory';

UPDATE public.standard_account_stock_return_requests
SET return_type = 'my_inventory'
WHERE return_type IS DISTINCT FROM 'my_inventory'
  AND return_type IS DISTINCT FROM 'item_disposal';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'standard_account_stock_return_requests_return_type_check'
  ) THEN
    ALTER TABLE public.standard_account_stock_return_requests
      ADD CONSTRAINT standard_account_stock_return_requests_return_type_check
      CHECK (return_type IN ('my_inventory', 'item_disposal'));
  END IF;
END $$;

COMMENT ON COLUMN public.standard_account_stock_return_requests.return_type IS
  'Create-dialog choice: my_inventory = sellable stock return; item_disposal = client-returned disposal stock.';

DROP FUNCTION IF EXISTS public.create_standard_account_stock_return_request(
  jsonb, text, uuid, uuid, text, text, text, text
);

CREATE OR REPLACE FUNCTION public.create_standard_account_stock_return_request(
  p_items jsonb,
  p_notes text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_destination_location_id uuid DEFAULT NULL,
  p_signature_url text DEFAULT NULL,
  p_signature_path text DEFAULT NULL,
  p_proof_image_url text DEFAULT NULL,
  p_proof_image_path text DEFAULT NULL,
  p_return_type text DEFAULT 'my_inventory'
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
  v_hold_qty integer;
  v_returned_stock integer;
  v_inv RECORD;
  v_dest_loc RECORD;
  v_product_label text;
  v_return_type text;
BEGIN
  v_actor := auth.uid();
  v_creator := COALESCE(p_created_by, v_actor);
  v_client_company_id := public.get_auth_company_id();
  v_return_type := COALESCE(NULLIF(btrim(lower(p_return_type)), ''), 'my_inventory');
  IF v_return_type NOT IN ('my_inventory', 'item_disposal') THEN
    RETURN json_build_object('success', false, 'error', 'Invalid return type');
  END IF;

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

    v_warehouse_variant_id := public.ensure_client_warehouse_variant_mapping(
      v_client_company_id,
      v_warehouse_company_id,
      v_client_variant_id
    );

    IF v_warehouse_variant_id IS NULL THEN
      SELECT CONCAT(COALESCE(b.name, ''), CASE WHEN b.name IS NULL THEN '' ELSE ' — ' END, COALESCE(v.name, v.id::text))
      INTO v_product_label
      FROM public.variants v
      LEFT JOIN public.brands b ON b.id = v.brand_id
      WHERE v.id = v_client_variant_id;

      RETURN json_build_object(
        'success', false,
        'error',
          'No matching warehouse product for "'
          || COALESCE(NULLIF(trim(v_product_label), ''), 'selected variant')
          || '". Add the same brand/product in the warehouse catalog (or complete a warehouse transfer receive) so it can be mapped.',
        'client_variant_id', v_client_variant_id
      );
    END IF;

    IF v_return_type = 'item_disposal' THEN
      IF v_is_team_leader THEN
        SELECT COALESCE(h.qty_on_hand, 0) INTO v_hold_qty
        FROM public.client_return_stock_holds h
        WHERE h.company_id = v_client_company_id
          AND h.holder_id = v_creator
          AND h.variant_id = v_client_variant_id
        FOR UPDATE;

        IF v_hold_qty IS NULL THEN
          v_hold_qty := 0;
        END IF;

        IF v_qty > v_hold_qty THEN
          RETURN json_build_object(
            'success', false,
            'error', 'Insufficient disposal stock for return',
            'client_variant_id', v_client_variant_id,
            'available', v_hold_qty,
            'requested', v_qty
          );
        END IF;
      ELSE
        SELECT COALESCE(mi.returned_stock, 0) INTO v_returned_stock
        FROM public.main_inventory mi
        WHERE mi.company_id = v_client_company_id
          AND mi.variant_id = v_client_variant_id
        FOR UPDATE;

        IF v_returned_stock IS NULL THEN
          v_returned_stock := 0;
        END IF;

        IF v_qty > v_returned_stock THEN
          RETURN json_build_object(
            'success', false,
            'error', 'Insufficient disposal stock for return',
            'client_variant_id', v_client_variant_id,
            'available', v_returned_stock,
            'requested', v_qty
          );
        END IF;
      END IF;
    ELSE
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
    END IF;
  END LOOP;

  v_request_number := public.generate_standard_account_stock_return_number(v_client_company_id);

  INSERT INTO public.standard_account_stock_return_requests (
    request_number, client_company_id, warehouse_company_id, destination_location_id,
    status, notes, created_by, source_agent_id, return_type,
    signature_url, signature_path, proof_image_url, proof_image_path
  ) VALUES (
    v_request_number, v_client_company_id, v_warehouse_company_id, p_destination_location_id,
    CASE WHEN v_is_team_leader THEN 'pending_approval' ELSE 'pending_receive' END,
    NULLIF(trim(p_notes), ''), v_creator,
    CASE WHEN v_is_team_leader THEN v_creator ELSE NULL END,
    v_return_type,
    NULLIF(trim(p_signature_url), ''), NULLIF(trim(p_signature_path), ''),
    NULLIF(trim(p_proof_image_url), ''), NULLIF(trim(p_proof_image_path), '')
  )
  RETURNING id INTO v_request_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_client_variant_id := (v_item->>'client_variant_id')::uuid;
    v_qty := (v_item->>'quantity')::int;

    v_warehouse_variant_id := public.ensure_client_warehouse_variant_mapping(
      v_client_company_id,
      v_warehouse_company_id,
      v_client_variant_id
    );

    IF v_warehouse_variant_id IS NULL THEN
      RAISE EXCEPTION 'Warehouse mapping missing for variant % during return apply', v_client_variant_id;
    END IF;

    IF v_return_type = 'item_disposal' THEN
      IF v_is_team_leader THEN
        UPDATE public.client_return_stock_holds
        SET qty_on_hand = qty_on_hand - v_qty,
            updated_at = now()
        WHERE company_id = v_client_company_id
          AND holder_id = v_creator
          AND variant_id = v_client_variant_id
          AND qty_on_hand >= v_qty;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Failed to deduct disposal hold stock for variant %', v_client_variant_id;
        END IF;
      ELSE
        UPDATE public.main_inventory
        SET returned_stock = GREATEST(0, COALESCE(returned_stock, 0) - v_qty),
            updated_at = now()
        WHERE company_id = v_client_company_id
          AND variant_id = v_client_variant_id
          AND COALESCE(returned_stock, 0) >= v_qty;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Failed to deduct disposal returned_stock for variant %', v_client_variant_id;
        END IF;
      END IF;
    ELSIF v_is_team_leader THEN
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
        WHEN v_return_type = 'item_disposal' AND v_is_team_leader THEN
          CONCAT('client_return_stock_holds:', v_creator)
        WHEN v_return_type = 'item_disposal' THEN
          'main_inventory.returned_stock'
        WHEN v_is_team_leader THEN
          CONCAT('agent_inventory:', v_creator)
        ELSE
          'main_inventory'
      END,
      CONCAT('warehouse_location:', p_destination_location_id),
      'standard_account_stock_return', v_request_id, v_creator,
      CASE
        WHEN v_return_type = 'item_disposal' AND v_is_team_leader THEN
          'TL disposal return pending approval ' || v_request_number || ' @ ' || v_dest_loc.name
        WHEN v_return_type = 'item_disposal' THEN
          'Disposal return to warehouse ' || v_request_number || ' @ ' || v_dest_loc.name
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
    'return_type', v_return_type,
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
  jsonb, text, uuid, uuid, text, text, text, text, text
) TO authenticated;
