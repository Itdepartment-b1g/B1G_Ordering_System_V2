-- Key Account dispatch DR numbers: WH{L}-{YYYY}-{MM}-DR-{seq}
-- L = first letter (A–Z) of warehouse_locations.name for the fulfilling location (e.g. Bacoor → WHB).
-- Sequence resets per company, prefix, and calendar month (see 20260523100000_scope_dr_number_counters_per_company.sql).
-- Callable only by active warehouse users for a location in their hub (get_auth_company_id).

CREATE TABLE IF NOT EXISTS public.dr_number_counters (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  prefix text NOT NULL,
  year_month text NOT NULL,
  last_value integer NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, prefix, year_month)
);

DROP FUNCTION IF EXISTS public.generate_dr_number(uuid);
DROP FUNCTION IF EXISTS public.dr_prefix_from_warehouse_company_name(text);

CREATE OR REPLACE FUNCTION public.generate_dr_number(p_warehouse_location_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_loc_name text;
  v_loc_company uuid;
  v_letter text;
  v_prefix text;
  v_ym text;
  v_year text;
  v_month text;
  v_next integer;
BEGIN
  IF p_warehouse_location_id IS NULL THEN
    RAISE EXCEPTION 'warehouse location id is required';
  END IF;

  IF NOT public.is_warehouse() THEN
    RAISE EXCEPTION 'only warehouse users can generate dispatch DR numbers';
  END IF;

  SELECT trim(wl.name), wl.company_id
  INTO v_loc_name, v_loc_company
  FROM public.warehouse_locations wl
  WHERE wl.id = p_warehouse_location_id;

  IF v_loc_company IS NULL THEN
    RAISE EXCEPTION 'warehouse location not found';
  END IF;

  IF v_loc_company IS DISTINCT FROM public.get_auth_company_id() THEN
    RAISE EXCEPTION 'warehouse location does not belong to your company';
  END IF;

  v_letter := upper(COALESCE(substring(v_loc_name from '[A-Za-z]'), ''));
  IF v_letter IS NULL OR length(v_letter) = 0 THEN
    v_prefix := 'WH';
  ELSE
    v_prefix := 'WH' || substring(v_letter from 1 for 1);
  END IF;

  v_ym := to_char(timezone('UTC', now()), 'YYYY-MM');
  v_year := to_char(timezone('UTC', now()), 'YYYY');
  v_month := to_char(timezone('UTC', now()), 'MM');

  INSERT INTO public.dr_number_counters (company_id, prefix, year_month, last_value)
  VALUES (v_loc_company, v_prefix, v_ym, 1)
  ON CONFLICT (company_id, prefix, year_month)
  DO UPDATE SET last_value = dr_number_counters.last_value + 1
  RETURNING last_value INTO v_next;

  RETURN v_prefix || '-' || v_year || '-' || v_month || '-DR-' || lpad(v_next::text, 5, '0');
END;
$$;

COMMENT ON FUNCTION public.generate_dr_number(uuid) IS
  'DR for Key Account dispatch: WH{first letter of location name}-YYYY-MM-DR-NNNNN. Uses warehouse_locations.name; only warehouse users, own hub.';

GRANT EXECUTE ON FUNCTION public.generate_dr_number(uuid) TO authenticated;

DROP SEQUENCE IF EXISTS public.dr_number_seq;
