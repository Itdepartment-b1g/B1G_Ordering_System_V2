-- Key Account multi-warehouse POs: partial_delivered when only some locations have dispatched.

ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_workflow_status_check;

ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_workflow_status_check
  CHECK (workflow_status = ANY (ARRAY[
    'kam_pending'::text,
    'director_pending'::text,
    'admin_pending'::text,
    'approved'::text,
    'rejected'::text,
    'warehouse_reserved'::text,
    'fulfilled'::text,
    'partial_delivered'::text,
    'delivered'::text
  ]));

ALTER TABLE public.purchase_order_deliveries
  ADD COLUMN IF NOT EXISTS dr_number text;

CREATE OR REPLACE FUNCTION public.key_account_transfer_po_visible_to_warehouse(p_po_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (
      SELECT
        CASE
          WHEN po.company_account_type IS DISTINCT FROM 'Key Accounts'::text THEN true
          WHEN po.workflow_status = ANY (
            ARRAY[
              'warehouse_reserved'::text,
              'fulfilled'::text,
              'partial_delivered'::text,
              'delivered'::text
            ]
          ) THEN true
          ELSE false
        END
      FROM public.purchase_orders po
      WHERE po.id = p_po_id
    ),
    false
  );
$$;

COMMENT ON FUNCTION public.key_account_transfer_po_visible_to_warehouse(uuid) IS
  'Key Account transfer POs are hidden from warehouse until workflow_status is warehouse_reserved or later (fulfilled/partial_delivered/delivered).';

GRANT EXECUTE ON FUNCTION public.key_account_transfer_po_visible_to_warehouse(uuid) TO authenticated;

-- Correct POs that were marked delivered after only one warehouse dispatched.
UPDATE public.purchase_orders po
SET workflow_status = 'partial_delivered',
    updated_at = NOW()
WHERE po.company_account_type = 'Key Accounts'
  AND po.workflow_status = 'delivered'
  AND po.status = 'partially_fulfilled';

-- Backfill per-dispatch DR on delivery rows from PO header when single-location dispatch.
UPDATE public.purchase_order_deliveries pod
SET dr_number = po.dr_number
FROM public.purchase_orders po
WHERE po.id = pod.purchase_order_id
  AND pod.dr_number IS NULL
  AND po.dr_number IS NOT NULL
  AND po.company_account_type = 'Key Accounts';
