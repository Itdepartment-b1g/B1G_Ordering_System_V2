-- Resolve PO numbers for warehouse reservation breakdowns.
-- Key Account soft-reserved POs are often hidden from warehouse RLS until
-- workflow_status = warehouse_reserved, so nested selects return null and the UI
-- falls back to a truncated UUID. This SECURITY DEFINER helper returns po_number
-- for transfer POs belonging to the caller's warehouse hub.

CREATE OR REPLACE FUNCTION public.get_warehouse_transfer_po_numbers(p_po_ids uuid[])
RETURNS TABLE (
  purchase_order_id uuid,
  po_number text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    po.id AS purchase_order_id,
    po.po_number::text AS po_number
  FROM public.purchase_orders po
  WHERE po.id = ANY (COALESCE(p_po_ids, ARRAY[]::uuid[]))
    AND po.fulfillment_type = 'warehouse_transfer'
    AND po.warehouse_company_id = public.get_auth_company_id();
$$;

COMMENT ON FUNCTION public.get_warehouse_transfer_po_numbers(uuid[]) IS
  'Return po_number for warehouse-transfer POs owned by the caller hub (bypasses KA visibility gate for label display).';

GRANT EXECUTE ON FUNCTION public.get_warehouse_transfer_po_numbers(uuid[]) TO authenticated;
