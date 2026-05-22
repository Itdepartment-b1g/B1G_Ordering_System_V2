-- Auto-generate Key Account client codes (CL-YYYY-NNNN) and shop codes (SH-YYYY-NNNN).

CREATE TABLE IF NOT EXISTS public.key_account_code_counters (
  scope_type text NOT NULL CHECK (scope_type IN ('client', 'shop')),
  scope_id uuid NOT NULL,
  year text NOT NULL CHECK (year ~ '^[0-9]{4}$'),
  last_value integer NOT NULL DEFAULT 0,
  PRIMARY KEY (scope_type, scope_id, year)
);

COMMENT ON TABLE public.key_account_code_counters IS
  'Per-scope, per-year sequence for Key Account client (company) and shop (client) codes.';

-- Seed counters from existing CL-/SH- formatted codes so new numbers do not collide.
INSERT INTO public.key_account_code_counters (scope_type, scope_id, year, last_value)
SELECT
  'client',
  kac.company_id,
  (regexp_match(kac.client_code, '^CL-([0-9]{4})-([0-9]+)$'))[1],
  MAX((regexp_match(kac.client_code, '^CL-[0-9]{4}-([0-9]+)$'))[1]::integer)
FROM public.key_account_clients kac
WHERE kac.client_code ~ '^CL-[0-9]{4}-[0-9]+$'
GROUP BY kac.company_id, (regexp_match(kac.client_code, '^CL-([0-9]{4})-([0-9]+)$'))[1]
ON CONFLICT (scope_type, scope_id, year) DO UPDATE
SET last_value = GREATEST(
  public.key_account_code_counters.last_value,
  EXCLUDED.last_value
);

INSERT INTO public.key_account_code_counters (scope_type, scope_id, year, last_value)
SELECT
  'shop',
  kas.client_id,
  (regexp_match(kas.shop_code, '^SH-([0-9]{4})-([0-9]+)$'))[1],
  MAX((regexp_match(kas.shop_code, '^SH-[0-9]{4}-([0-9]+)$'))[1]::integer)
FROM public.key_account_shops kas
WHERE kas.shop_code ~ '^SH-[0-9]{4}-[0-9]+$'
GROUP BY kas.client_id, (regexp_match(kas.shop_code, '^SH-([0-9]{4})-([0-9]+)$'))[1]
ON CONFLICT (scope_type, scope_id, year) DO UPDATE
SET last_value = GREATEST(
  public.key_account_code_counters.last_value,
  EXCLUDED.last_value
);

CREATE OR REPLACE FUNCTION public.generate_key_account_client_code(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_year text;
  v_next integer;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company id is required';
  END IF;

  IF p_company_id IS DISTINCT FROM public.get_auth_company_id() THEN
    RAISE EXCEPTION 'company does not match your account';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.company_id = p_company_id
      AND p.role IN ('sales_admin', 'sales_director', 'key_account_manager')
  ) THEN
    RAISE EXCEPTION 'not authorized to generate client codes';
  END IF;

  v_year := to_char(timezone('UTC', now()), 'YYYY');

  INSERT INTO public.key_account_code_counters (scope_type, scope_id, year, last_value)
  VALUES ('client', p_company_id, v_year, 1)
  ON CONFLICT (scope_type, scope_id, year)
  DO UPDATE SET last_value = public.key_account_code_counters.last_value + 1
  RETURNING last_value INTO v_next;

  RETURN 'CL-' || v_year || '-' || lpad(v_next::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_key_account_shop_code(p_client_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company_id uuid;
  v_year text;
  v_next integer;
BEGIN
  IF p_client_id IS NULL THEN
    RAISE EXCEPTION 'client id is required';
  END IF;

  SELECT kac.company_id INTO v_company_id
  FROM public.key_account_clients kac
  WHERE kac.id = p_client_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'client not found';
  END IF;

  IF v_company_id IS DISTINCT FROM public.get_auth_company_id() THEN
    RAISE EXCEPTION 'client does not belong to your company';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.company_id = v_company_id
      AND p.role IN ('sales_admin', 'sales_director', 'key_account_manager')
  ) THEN
    RAISE EXCEPTION 'not authorized to generate shop codes';
  END IF;

  v_year := to_char(timezone('UTC', now()), 'YYYY');

  INSERT INTO public.key_account_code_counters (scope_type, scope_id, year, last_value)
  VALUES ('shop', p_client_id, v_year, 1)
  ON CONFLICT (scope_type, scope_id, year)
  DO UPDATE SET last_value = public.key_account_code_counters.last_value + 1
  RETURNING last_value INTO v_next;

  RETURN 'SH-' || v_year || '-' || lpad(v_next::text, 4, '0');
END;
$$;

COMMENT ON FUNCTION public.generate_key_account_client_code(uuid) IS
  'Returns CL-YYYY-NNNN for the company; sequence resets each calendar year.';

COMMENT ON FUNCTION public.generate_key_account_shop_code(uuid) IS
  'Returns SH-YYYY-NNNN for the parent client; sequence resets each calendar year per client.';

GRANT EXECUTE ON FUNCTION public.generate_key_account_client_code(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_key_account_shop_code(uuid) TO authenticated;
