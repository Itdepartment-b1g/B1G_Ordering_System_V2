-- Scope DR number sequences per company (not globally per warehouse letter prefix).
-- Format unchanged: WH{L}-YYYY-MM-DR-NNNNN

ALTER TABLE public.dr_number_counters
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.dr_number_counters
  DROP CONSTRAINT IF EXISTS dr_number_counters_pkey;

-- Legacy counters were global; replace with per-company rows seeded from existing DRs.
DELETE FROM public.dr_number_counters;

INSERT INTO public.dr_number_counters (company_id, prefix, year_month, last_value)
SELECT
  po.company_id,
  (regexp_match(po.dr_number, '^(WH[A-Z]?)'))[1] AS prefix,
  (regexp_match(po.dr_number, '^WH[A-Z]?-(\d{4}-\d{2})-DR-'))[1] AS year_month,
  max((regexp_match(po.dr_number, '-DR-(\d+)$'))[1]::integer) AS last_value
FROM public.purchase_orders po
WHERE po.company_id IS NOT NULL
  AND po.dr_number ~ '^WH[A-Z]?-\d{4}-\d{2}-DR-\d+$'
GROUP BY po.company_id, prefix, year_month;

ALTER TABLE public.dr_number_counters
  ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE public.dr_number_counters
  ADD PRIMARY KEY (company_id, prefix, year_month);

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
  'DR for Key Account dispatch: WH{location letter}-YYYY-MM-DR-NNNNN. Counter resets per company, prefix, and calendar month.';

COMMENT ON TABLE public.dr_number_counters IS
  'Per-company DR sequence counters (company_id + warehouse prefix + year_month).';
