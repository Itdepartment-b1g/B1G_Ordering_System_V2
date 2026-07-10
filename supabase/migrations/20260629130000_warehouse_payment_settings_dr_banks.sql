-- Warehouse role: manage company payment settings (DR bank details).
-- DR RPC: return fulfilling warehouse payment settings for dynamic bank block.

-- RLS: allow warehouse users to insert/update their company's payment settings
DROP POLICY IF EXISTS "Super admin and finance can insert payment settings" ON public.company_payment_settings;
CREATE POLICY "Super admin finance warehouse can insert payment settings"
  ON public.company_payment_settings FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'finance', 'warehouse')
    )
  );

DROP POLICY IF EXISTS "Super admin and finance can update payment settings" ON public.company_payment_settings;
CREATE POLICY "Super admin finance warehouse can update payment settings"
  ON public.company_payment_settings FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'finance', 'warehouse')
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'finance', 'warehouse')
    )
  );

CREATE OR REPLACE FUNCTION public.get_po_dr_receipt_info(p_po_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po                  record;
  v_caller_cid          uuid;
  v_authorized          boolean := false;
  v_company             record;
  v_super_admin         record;
  v_client              record;
  v_address             record;
  v_payment_company_id  uuid;
  v_payment_company     record;
  v_payment_settings    record;
  v_result              jsonb := '{}'::jsonb;
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

  -- Bank details on DR come from the fulfilling warehouse company (fallback: PO company).
  v_payment_company_id := COALESCE(v_po.warehouse_company_id, v_po.company_id);

  SELECT company_name
    INTO v_payment_company
  FROM public.companies
  WHERE id = v_payment_company_id;

  SELECT bank_accounts, bank_transfer_enabled
    INTO v_payment_settings
  FROM public.company_payment_settings
  WHERE company_id = v_payment_company_id;

  v_result := v_result || jsonb_build_object(
    'payment',
    jsonb_build_object(
      'company_name', COALESCE(v_payment_company.company_name, ''),
      'bank_transfer_enabled', COALESCE(v_payment_settings.bank_transfer_enabled, false),
      'bank_accounts', COALESCE(v_payment_settings.bank_accounts, '[]'::jsonb)
    )
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_po_dr_receipt_info(uuid) IS
  'Returns delivery details and warehouse payment settings for DR receipt PDFs.';
