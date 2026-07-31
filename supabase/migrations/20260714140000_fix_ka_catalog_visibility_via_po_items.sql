-- Key Account / tenant users often cannot nest-read hub catalog variants on their own POs
-- (linked-hub RLS + get_linked_warehouse_company_id semantics). Allow SELECT on brands/
-- variants that appear on purchase_order_items belonging to the caller's company, and
-- restore get_linked_warehouse_company_id() to return NULL when no warehouse link exists
-- (physical count keeps using resolve_inventory_company_id_for_tenant).
--
-- NOTE: brands/variants visibility must use SECURITY DEFINER helpers. Inlining a JOIN
-- from brands → variants (or variants → brands) inside RLS causes infinite recursion
-- with the existing company-brand policies.

-- ---------------------------------------------------------------------------
-- 1) Restore hub-link sentinel (NULL = not linked)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_linked_warehouse_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT wp.company_id
  FROM public.warehouse_company_assignments wca
  JOIN public.profiles wp ON wp.id = wca.warehouse_user_id
  WHERE wca.client_company_id = public.get_auth_company_id()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_linked_warehouse_company_id() TO authenticated;

COMMENT ON FUNCTION public.get_linked_warehouse_company_id() IS
  'Linked warehouse hub company_id for the current tenant, or NULL if not linked.';

-- ---------------------------------------------------------------------------
-- 2) SECURITY DEFINER helpers (bypass RLS; avoid brands ↔ variants recursion)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 3) Allow reading catalog rows referenced by own PO line items
-- ---------------------------------------------------------------------------
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
