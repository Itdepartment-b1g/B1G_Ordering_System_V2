-- Read-only naming reference for warehouse: brands/variants from the first tenant
-- that established catalog naming. Warehouse users copy names into their own company.
-- Intentionally ignores inventory stock and is_active — naming guide shows the full catalog.

CREATE OR REPLACE FUNCTION public.get_reference_naming_catalog()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  -- First tenant naming source (original catalog)
  c_ref_company_id constant uuid := 'e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13';
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'warehouse'
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  RETURN (
    SELECT json_build_object(
      'company_id', c_ref_company_id,
      'brands', COALESCE((
        SELECT json_agg(
          json_build_object(
            'id', b.id,
            'name', b.name,
            'description', b.description,
            'variants', COALESCE((
              SELECT json_agg(
                json_build_object(
                  'id', v.id,
                  'name', v.name,
                  'variant_type', v.variant_type,
                  'sku', v.sku,
                  'description', v.description
                ) ORDER BY v.name
              )
              FROM public.variants v
              WHERE v.brand_id = b.id
            ), '[]'::json)
          ) ORDER BY b.name
        )
        FROM public.brands b
        WHERE b.company_id = c_ref_company_id
      ), '[]'::json)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_reference_naming_catalog() TO authenticated;

COMMENT ON FUNCTION public.get_reference_naming_catalog() IS
  'Warehouse-only full brand/variant naming catalog from the original tenant (ignores stock and is_active).';
