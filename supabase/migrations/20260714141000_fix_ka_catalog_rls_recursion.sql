-- Fix infinite recursion: brands policy queried variants (RLS) which queried brands (RLS).
-- Use SECURITY DEFINER helpers so the EXISTS checks do not re-enter brands/variants RLS.

CREATE OR REPLACE FUNCTION public.variant_visible_via_own_po_items(p_variant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.purchase_order_items poi
    JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
    WHERE poi.variant_id = p_variant_id
      AND po.company_id = public.get_auth_company_id()
  );
$$;

CREATE OR REPLACE FUNCTION public.brand_visible_via_own_po_items(p_brand_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.variants v
    JOIN public.purchase_order_items poi ON poi.variant_id = v.id
    JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
    WHERE v.brand_id = p_brand_id
      AND po.company_id = public.get_auth_company_id()
  );
$$;

GRANT EXECUTE ON FUNCTION public.variant_visible_via_own_po_items(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.brand_visible_via_own_po_items(uuid) TO authenticated;

DROP POLICY IF EXISTS "Variants: select via own purchase order items" ON public.variants;
CREATE POLICY "Variants: select via own purchase order items"
  ON public.variants FOR SELECT
  TO authenticated
  USING (public.variant_visible_via_own_po_items(variants.id));

DROP POLICY IF EXISTS "Brands: select via own purchase order items" ON public.brands;
CREATE POLICY "Brands: select via own purchase order items"
  ON public.brands FOR SELECT
  TO authenticated
  USING (public.brand_visible_via_own_po_items(brands.id));
