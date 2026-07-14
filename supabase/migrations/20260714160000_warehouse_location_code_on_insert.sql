-- Auto-assign warehouse_locations.code on insert when missing.
-- Fixes create-sub-warehouse failing after code became NOT NULL.

CREATE OR REPLACE FUNCTION public.allocate_warehouse_location_code(
  p_company_id uuid,
  p_name text,
  p_preferred text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_base text;
  v_try text;
  v_suffix integer := 0;
BEGIN
  IF p_preferred IS NOT NULL AND btrim(p_preferred) <> '' THEN
    v_base := left(upper(regexp_replace(btrim(p_preferred), '[^A-Z0-9]', '', 'g')), 3);
  ELSE
    v_base := public.derive_warehouse_location_code(p_name);
  END IF;

  IF v_base IS NULL OR v_base = '' THEN
    v_base := 'LOC';
  END IF;

  v_try := v_base;
  WHILE EXISTS (
    SELECT 1
    FROM public.warehouse_locations wl
    WHERE wl.company_id = p_company_id
      AND wl.code = v_try
  ) LOOP
    v_suffix := v_suffix + 1;
    IF v_suffix <= 26 THEN
      v_try := left(v_base, 2) || chr(64 + v_suffix);
    ELSE
      v_try := left(v_base, 1) || lpad((v_suffix - 26)::text, 2, '0');
    END IF;
  END LOOP;

  RETURN v_try;
END;
$$;

CREATE OR REPLACE FUNCTION public.warehouse_locations_set_code_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.code IS NULL OR btrim(NEW.code) = '' THEN
    NEW.code := public.allocate_warehouse_location_code(NEW.company_id, NEW.name, NULL);
  ELSE
    NEW.code := left(upper(regexp_replace(btrim(NEW.code), '[^A-Z0-9]', '', 'g')), 3);
    IF NEW.code = '' THEN
      NEW.code := public.allocate_warehouse_location_code(NEW.company_id, NEW.name, NULL);
    ELSIF TG_OP = 'INSERT'
      OR (TG_OP = 'UPDATE' AND NEW.code IS DISTINCT FROM OLD.code)
    THEN
      -- Keep provided code if unique; otherwise allocate a free variant from it.
      IF EXISTS (
        SELECT 1
        FROM public.warehouse_locations wl
        WHERE wl.company_id = NEW.company_id
          AND wl.code = NEW.code
          AND (TG_OP = 'INSERT' OR wl.id IS DISTINCT FROM NEW.id)
      ) THEN
        NEW.code := public.allocate_warehouse_location_code(NEW.company_id, NEW.name, NEW.code);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_warehouse_locations_set_code ON public.warehouse_locations;
CREATE TRIGGER trg_warehouse_locations_set_code
  BEFORE INSERT OR UPDATE OF name, code ON public.warehouse_locations
  FOR EACH ROW
  EXECUTE FUNCTION public.warehouse_locations_set_code_before_write();

COMMENT ON FUNCTION public.allocate_warehouse_location_code(uuid, text, text) IS
  'Returns a unique 3-char warehouse location code for a company, derived from name or preferred code.';
