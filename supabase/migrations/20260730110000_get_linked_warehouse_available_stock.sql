-- Reliable available-to-promise stock for linked tenants (Key Account / Standard create-PO views).
-- Computes on-hand minus allocated, hard reservations, and soft-committed open PO lines.
-- Soft qty is derived live from eligible open POs so display stays correct even if
-- warehouse_transfer_soft_reservations sync lagged.

CREATE OR REPLACE FUNCTION public.get_linked_warehouse_available_stock(
  p_warehouse_company_id uuid,
  p_variant_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  variant_id uuid,
  location_id uuid,
  on_hand integer,
  allocated integer,
  hard_reserved integer,
  soft_reserved integer,
  available integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_company uuid;
BEGIN
  v_caller_company := public.get_auth_company_id();
  IF v_caller_company IS NULL OR p_warehouse_company_id IS NULL THEN
    RETURN;
  END IF;

  -- Caller must be the hub itself, or a client company linked to this hub.
  IF v_caller_company IS DISTINCT FROM p_warehouse_company_id
     AND NOT EXISTS (
       SELECT 1
       FROM public.warehouse_company_assignments wca
       JOIN public.profiles wp ON wp.id = wca.warehouse_user_id
       WHERE wca.client_company_id = v_caller_company
         AND wp.company_id = p_warehouse_company_id
     ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH locs AS (
    SELECT wl.id AS location_id, COALESCE(wl.is_main, false) AS is_main
    FROM public.warehouse_locations wl
    WHERE wl.company_id = p_warehouse_company_id
  ),
  variants AS (
    SELECT DISTINCT v.id AS variant_id
    FROM public.variants v
    WHERE v.company_id = p_warehouse_company_id
      AND (p_variant_ids IS NULL OR v.id = ANY (p_variant_ids))
  ),
  base AS (
    SELECT l.location_id, l.is_main, v.variant_id
    FROM locs l
    CROSS JOIN variants v
  ),
  main_on_hand AS (
    SELECT
      mi.variant_id,
      GREATEST(0, COALESCE(mi.stock, 0))::int AS on_hand,
      GREATEST(0, COALESCE(mi.allocated_stock, 0))::int AS allocated
    FROM public.main_inventory mi
    WHERE mi.company_id = p_warehouse_company_id
      AND (p_variant_ids IS NULL OR mi.variant_id = ANY (p_variant_ids))
  ),
  loc_on_hand AS (
    SELECT
      wli.location_id,
      wli.variant_id,
      GREATEST(0, COALESCE(wli.stock, 0))::int AS on_hand
    FROM public.warehouse_location_inventory wli
    WHERE wli.company_id = p_warehouse_company_id
      AND (p_variant_ids IS NULL OR wli.variant_id = ANY (p_variant_ids))
  ),
  hard AS (
    SELECT
      r.warehouse_location_id AS location_id,
      r.variant_id,
      COALESCE(SUM(GREATEST(0, r.quantity_reserved - r.quantity_fulfilled)), 0)::int AS qty
    FROM public.warehouse_transfer_reservations r
    WHERE r.warehouse_company_id = p_warehouse_company_id
      AND r.status IN ('reserved', 'partial')
      AND (p_variant_ids IS NULL OR r.variant_id = ANY (p_variant_ids))
    GROUP BY r.warehouse_location_id, r.variant_id
  ),
  soft AS (
    SELECT
      COALESCE(poi.warehouse_location_id, po.warehouse_location_id) AS location_id,
      poi.variant_id,
      COALESCE(SUM(poi.quantity), 0)::int AS qty
    FROM public.purchase_order_items poi
    JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
    WHERE po.warehouse_company_id = p_warehouse_company_id
      AND po.fulfillment_type = 'warehouse_transfer'
      AND po.status IS DISTINCT FROM 'rejected'
      AND po.status IS DISTINCT FROM 'cancelled'
      AND po.status IS DISTINCT FROM 'approved_for_fulfillment'
      AND po.status IS DISTINCT FROM 'partially_fulfilled'
      AND po.status IS DISTINCT FROM 'fulfilled'
      AND po.status IS DISTINCT FROM 'approved'
      AND (
        (
          COALESCE(po.company_account_type, 'Standard Accounts') = 'Key Accounts'
          AND po.workflow_status = ANY (
            ARRAY[
              'kam_pending'::text,
              'director_pending'::text,
              'admin_pending'::text,
              'warehouse_reserved'::text
            ]
          )
        )
        OR (
          COALESCE(po.company_account_type, 'Standard Accounts') IS DISTINCT FROM 'Key Accounts'
          AND po.status = 'pending'
        )
      )
      AND poi.variant_id IS NOT NULL
      AND (p_variant_ids IS NULL OR poi.variant_id = ANY (p_variant_ids))
      AND COALESCE(poi.warehouse_location_id, po.warehouse_location_id) IS NOT NULL
    GROUP BY COALESCE(poi.warehouse_location_id, po.warehouse_location_id), poi.variant_id
  )
  SELECT
    b.variant_id,
    b.location_id,
    CASE
      WHEN b.is_main THEN COALESCE(m.on_hand, 0)
      ELSE COALESCE(lo.on_hand, 0)
    END::int AS on_hand,
    CASE
      WHEN b.is_main THEN COALESCE(m.allocated, 0)
      ELSE 0
    END::int AS allocated,
    COALESCE(h.qty, 0)::int AS hard_reserved,
    COALESCE(s.qty, 0)::int AS soft_reserved,
    GREATEST(
      0,
      CASE
        WHEN b.is_main THEN COALESCE(m.on_hand, 0) - COALESCE(m.allocated, 0)
        ELSE COALESCE(lo.on_hand, 0)
      END
      - COALESCE(h.qty, 0)
      - COALESCE(s.qty, 0)
    )::int AS available
  FROM base b
  LEFT JOIN main_on_hand m ON m.variant_id = b.variant_id AND b.is_main
  LEFT JOIN loc_on_hand lo ON lo.location_id = b.location_id AND lo.variant_id = b.variant_id
  LEFT JOIN hard h ON h.location_id = b.location_id AND h.variant_id = b.variant_id
  LEFT JOIN soft s ON s.location_id = b.location_id AND s.variant_id = b.variant_id
  WHERE
    -- Only return rows that have inventory presence or open holds (keeps payload small)
    CASE
      WHEN b.is_main THEN COALESCE(m.on_hand, 0) > 0 OR COALESCE(m.allocated, 0) > 0
      ELSE COALESCE(lo.on_hand, 0) > 0
    END
    OR COALESCE(h.qty, 0) > 0
    OR COALESCE(s.qty, 0) > 0;
END;
$$;

COMMENT ON FUNCTION public.get_linked_warehouse_available_stock(uuid, uuid[]) IS
  'ATP by location+variant for linked buyers/hub: on_hand - allocated - hard reserved - soft open POs.';

GRANT EXECUTE ON FUNCTION public.get_linked_warehouse_available_stock(uuid, uuid[]) TO authenticated;
