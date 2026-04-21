-- =============================================================================
-- RPC: get_po_requestor_info(p_po_id)
--
-- Returns the requesting company and creator-profile details for a given
-- purchase order. Needed by the Customer Order Form (COF) so it can display
-- the client/requestor's contact information instead of the supplier's.
--
-- Because the requestor's `profiles` / `companies` rows may belong to a
-- different tenant than the caller (e.g. a warehouse user viewing a transfer
-- PO created by a tenant), the function is SECURITY DEFINER and re-implements
-- the same authorization rules used by the `purchase_orders` RLS policies.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_po_requestor_info(p_po_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po            record;
  v_company       record;
  v_profile       record;
  v_caller_cid    uuid;
  v_authorized    boolean := false;
BEGIN
  SELECT po.company_id,
         po.warehouse_company_id,
         po.fulfillment_type,
         po.created_by
    INTO v_po
  FROM public.purchase_orders po
  WHERE po.id = p_po_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object();
  END IF;

  -- Authorization: mirror the PO SELECT policies.
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
    -- Warehouse users can view transfer POs that target their hub.
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

  SELECT id, company_name
    INTO v_company
  FROM public.companies
  WHERE id = v_po.company_id;

  SELECT id, full_name, email, phone, address, city, country
    INTO v_profile
  FROM public.profiles
  WHERE id = v_po.created_by;

  RETURN jsonb_build_object(
    'company',
      CASE WHEN v_company.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id',            v_company.id,
        'company_name',  v_company.company_name
      ) END,
    'profile',
      CASE WHEN v_profile.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id',         v_profile.id,
        'full_name',  v_profile.full_name,
        'email',      v_profile.email,
        'phone',      v_profile.phone,
        'address',    v_profile.address,
        'city',       v_profile.city,
        'country',    v_profile.country
      ) END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_po_requestor_info(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_po_requestor_info(uuid) IS
  'Returns the requesting company and creator-profile details for a purchase order, '
  'subject to the same visibility rules as purchase_orders SELECT RLS. Used by the '
  'Customer Order Form (COF) renderer to display requestor/client contact info.';
