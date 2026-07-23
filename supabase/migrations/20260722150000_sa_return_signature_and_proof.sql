  -- SA stock returns: signature + proof image columns, storage bucket, create RPC params.

  ALTER TABLE public.standard_account_stock_return_requests
    ADD COLUMN IF NOT EXISTS signature_url text,
    ADD COLUMN IF NOT EXISTS signature_path text,
    ADD COLUMN IF NOT EXISTS proof_image_url text,
    ADD COLUMN IF NOT EXISTS proof_image_path text;

  COMMENT ON COLUMN public.standard_account_stock_return_requests.signature_url IS
    'Signed/public URL of submitter signature at create time.';
  COMMENT ON COLUMN public.standard_account_stock_return_requests.proof_image_url IS
    'Signed/public URL of return proof photo at create time.';

  -- ---------------------------------------------------------------------------
  -- Storage bucket
  -- ---------------------------------------------------------------------------
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'sa-stock-return-proofs',
    'sa-stock-return-proofs',
    false,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
  )
  ON CONFLICT (id) DO NOTHING;

  -- Client company users: upload/read under their own company folder
  DROP POLICY IF EXISTS "SA return proofs: client insert own company" ON storage.objects;
  CREATE POLICY "SA return proofs: client insert own company"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'sa-stock-return-proofs'
      AND (storage.foldername(name))[1] = public.get_auth_company_id()::text
    );

  DROP POLICY IF EXISTS "SA return proofs: client read own company" ON storage.objects;
  CREATE POLICY "SA return proofs: client read own company"
    ON storage.objects FOR SELECT TO authenticated
    USING (
      bucket_id = 'sa-stock-return-proofs'
      AND (storage.foldername(name))[1] = public.get_auth_company_id()::text
    );

  -- Warehouse: read proofs for assigned client companies
  DROP POLICY IF EXISTS "SA return proofs: warehouse read assigned clients" ON storage.objects;
  CREATE POLICY "SA return proofs: warehouse read assigned clients"
    ON storage.objects FOR SELECT TO authenticated
    USING (
      bucket_id = 'sa-stock-return-proofs'
      AND public.is_warehouse()
      AND EXISTS (
        SELECT 1
        FROM public.warehouse_company_assignments wca
        JOIN public.profiles wp ON wp.id = wca.warehouse_user_id
        WHERE wp.company_id = public.get_auth_company_id()
          AND wca.client_company_id::text = (storage.foldername(name))[1]
      )
    );

  DROP POLICY IF EXISTS "SA return proofs: sysadmin all" ON storage.objects;
  CREATE POLICY "SA return proofs: sysadmin all"
    ON storage.objects FOR ALL TO authenticated
    USING (
      bucket_id = 'sa-stock-return-proofs'
      AND public.is_system_administrator()
    )
    WITH CHECK (
      bucket_id = 'sa-stock-return-proofs'
      AND public.is_system_administrator()
    );

  -- ---------------------------------------------------------------------------
  -- Create RPC: require signature + proof
  -- ---------------------------------------------------------------------------
  DROP FUNCTION IF EXISTS public.create_standard_account_stock_return_request(jsonb, text, uuid, uuid);

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
    v_creator uuid;
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
    v_inv RECORD;
    v_dest_loc RECORD;
  BEGIN
    v_creator := COALESCE(p_created_by, auth.uid());
    v_client_company_id := public.get_auth_company_id();

    IF v_client_company_id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    IF NOT (
      public.is_system_administrator()
      OR (
        public.is_admin_or_super_admin()
        AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = v_creator AND p.company_id = v_client_company_id
        )
      )
    ) THEN
      RETURN json_build_object('success', false, 'error', 'Only company admins can create warehouse returns');
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
    END LOOP;

    v_request_number := public.generate_standard_account_stock_return_number(v_client_company_id);

    INSERT INTO public.standard_account_stock_return_requests (
      request_number, client_company_id, warehouse_company_id, destination_location_id,
      status, notes, created_by,
      signature_url, signature_path, proof_image_url, proof_image_path
    ) VALUES (
      v_request_number, v_client_company_id, v_warehouse_company_id, p_destination_location_id,
      'pending_receive', NULLIF(trim(p_notes), ''), v_creator,
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

      UPDATE public.main_inventory
      SET stock = COALESCE(stock, 0) - v_qty,
          updated_at = now()
      WHERE company_id = v_client_company_id
        AND variant_id = v_client_variant_id;

      INSERT INTO public.standard_account_stock_return_request_items (
        request_id, client_variant_id, warehouse_variant_id, return_quantity
      ) VALUES (
        v_request_id, v_client_variant_id, v_warehouse_variant_id, v_qty
      );

      INSERT INTO public.inventory_transactions (
        company_id, variant_id, transaction_type, quantity,
        reference_type, reference_id, performed_by, notes, created_at
      ) VALUES (
        v_client_company_id, v_client_variant_id, 'client_return_out', v_qty,
        'standard_account_stock_return', v_request_id, v_creator,
        'Return to warehouse ' || v_request_number || ' @ ' || v_dest_loc.name,
        now()
      );
    END LOOP;

    RETURN json_build_object(
      'success', true,
      'request_id', v_request_id,
      'request_number', v_request_number,
      'destination_location_id', p_destination_location_id
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
