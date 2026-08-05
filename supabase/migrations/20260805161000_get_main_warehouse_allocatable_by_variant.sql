-- Sub-warehouse users cannot SELECT main-location PO holds via RLS on
-- warehouse_transfer_* tables. Expose main allocatable qty via SECURITY DEFINER RPC
-- for stock request / available-to-request UI.

CREATE OR REPLACE FUNCTION public.get_main_warehouse_allocatable_by_variant(
  p_variant_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  variant_id uuid,
  allocatable integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company_id uuid;
  v_main_loc_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_warehouse() THEN
    RETURN;
  END IF;

  v_company_id := public.get_auth_company_id();
  IF v_company_id IS NULL THEN
    RETURN;
  END IF;

  v_main_loc_id := public.get_main_warehouse_location_id(v_company_id);
  IF v_main_loc_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    mi.variant_id,
    GREATEST(
      0,
      (COALESCE(mi.stock, 0) - COALESCE(mi.allocated_stock, 0))
      - public.warehouse_open_transfer_reserved(
          v_company_id,
          mi.variant_id,
          v_main_loc_id,
          NULL
        )
    )::int AS allocatable
  FROM public.main_inventory mi
  WHERE mi.company_id = v_company_id
    AND COALESCE(mi.stock, 0) > 0
    AND (p_variant_ids IS NULL OR mi.variant_id = ANY (p_variant_ids));
END;
$$;

COMMENT ON FUNCTION public.get_main_warehouse_allocatable_by_variant(uuid[]) IS
  'Main warehouse allocatable qty per variant (stock − allocated − open transfer PO holds). Callable by hub warehouse users including sub-locations.';

GRANT EXECUTE ON FUNCTION public.get_main_warehouse_allocatable_by_variant(uuid[]) TO authenticated;
