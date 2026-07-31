-- Switch main-allocation numbers from AL-{LOCATION_CODE}-{####}
-- to AL-{COMPANY_INITIALS}-{####} (e.g. B1G Main Warehouse → AL-BMW-0001).
-- Company-wide sequence (counter key AL:CO), not per destination sub-warehouse.

CREATE OR REPLACE FUNCTION public.generate_internal_stock_allocation_number(
  p_company_id uuid,
  p_from_location_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company_name text;
  v_code text;
  v_counter_key text := 'AL:CO';
  v_next integer;
BEGIN
  SELECT c.company_name INTO v_company_name
  FROM public.companies c
  WHERE c.id = p_company_id;

  IF v_company_name IS NULL OR btrim(v_company_name) = '' THEN
    RAISE EXCEPTION 'Company name is missing';
  END IF;

  -- e.g. "B1G Main Warehouse" → BMW (same helper used for order numbers)
  v_code := upper(btrim(public.extract_company_initials(v_company_name)));
  IF v_code IS NULL OR v_code = '' THEN
    RAISE EXCEPTION 'Failed to derive company initials';
  END IF;

  INSERT INTO public.internal_stock_request_number_counters (company_id, location_code, last_number)
  VALUES (p_company_id, v_counter_key, 1)
  ON CONFLICT (company_id, location_code)
  DO UPDATE SET last_number = public.internal_stock_request_number_counters.last_number + 1
  RETURNING last_number INTO v_next;

  RETURN 'AL-' || v_code || '-' || lpad(v_next::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_internal_stock_allocation_number(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.generate_internal_stock_allocation_number(uuid, uuid) IS
  'Generates AL-{COMPANY_INITIALS}-{####} for main-initiated allocations (e.g. B1G Main Warehouse → AL-BMW-0001). Counter key AL:CO per company.';
