-- RPC: get_po_dr_receipt_info(p_po_id)
-- Returns delivery-details fields for the Delivery Receipt (DR) PDF renderer.
-- SECURITY DEFINER so warehouse users can read requestor company / key-account /
-- super_admin profile across tenant boundaries (same visibility as purchase_orders).

CREATE OR REPLACE FUNCTION public.get_po_dr_receipt_info(p_po_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po              record;
  v_caller_cid      uuid;
  v_authorized      boolean := false;
  v_company         record;
  v_super_admin     record;
  v_client          record;
  v_address         record;
  v_result          jsonb := '{}'::jsonb;
BEGIN
  SELECT po.id,
         po.company_id,
         po.warehouse_company_id,
         po.fulfillment_type,
         po.company_account_type,
         po.key_account_client_id,
         po.key_account_address_id
    INTO v_po
  FROM public.purchase_orders po
  WHERE po.id = p_po_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object();
  END IF;

  -- Authorization: mirror purchase_orders SELECT policies.
  IF public.is_system_administrator() THEN
    v_authorized := true;
  END IF;

  IF NOT v_authorized THEN
    v_caller_cid := public.get_auth_company_id();
    IF v_caller_cid IS NOT NULL AND v_caller_cid = v_po.company_id THEN
      v_authorized := true;
    END IF;
  END IF;

  IF NOT v_authorized THEN
    IF public.is_warehouse()
       AND v_po.fulfillment_type = 'warehouse_transfer'
       AND v_po.warehouse_company_id = public.get_auth_company_id()
    THEN
      v_authorized := true;
    END IF;
  END IF;

  IF NOT v_authorized THEN
    RETURN jsonb_build_object();
  END IF;

  v_result := jsonb_build_object(
    'company_account_type', COALESCE(v_po.company_account_type, 'Standard Accounts')
  );

  IF v_po.company_account_type = 'Key Accounts' THEN
    IF v_po.key_account_client_id IS NOT NULL THEN
      SELECT client_name
        INTO v_client
      FROM public.key_account_clients
      WHERE id = v_po.key_account_client_id;
    END IF;

    IF v_po.key_account_address_id IS NOT NULL THEN
      SELECT full_address, city, province, zip_code, contact_name, contact_phone
        INTO v_address
      FROM public.key_account_delivery_addresses
      WHERE id = v_po.key_account_address_id;
    END IF;

    v_result := v_result || jsonb_build_object(
      'key_account',
      jsonb_build_object(
        'client_name',    COALESCE(v_client.client_name, ''),
        'full_address',   COALESCE(v_address.full_address, ''),
        'city',           COALESCE(v_address.city, ''),
        'province',       COALESCE(v_address.province, ''),
        'zip_code',       COALESCE(v_address.zip_code, ''),
        'contact_name',   COALESCE(v_address.contact_name, ''),
        'contact_phone',  COALESCE(v_address.contact_phone, '')
      )
    );
  ELSE
    SELECT id, company_name
      INTO v_company
    FROM public.companies
    WHERE id = v_po.company_id;

    SELECT id, full_name, phone, address, city, country
      INTO v_super_admin
    FROM public.profiles
    WHERE company_id = v_po.company_id
      AND role = 'super_admin'
      AND status = 'active'
    ORDER BY created_at ASC NULLS LAST
    LIMIT 1;

    v_result := v_result || jsonb_build_object(
      'standard',
      jsonb_build_object(
        'company_name',   COALESCE(v_company.company_name, ''),
        'contact_person', COALESCE(v_super_admin.full_name, ''),
        'contact_phone',  COALESCE(v_super_admin.phone, ''),
        'address',        COALESCE(v_super_admin.address, ''),
        'city',           COALESCE(v_super_admin.city, ''),
        'country',        COALESCE(v_super_admin.country, '')
      )
    );
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_po_dr_receipt_info(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_po_dr_receipt_info(uuid) IS
  'Returns Key Account client/address or Standard Account super_admin contact info for DR receipt PDFs.';
