-- Key Account: Sales Admin create-on-behalf waits for order owner approval (owner_pending).

ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_workflow_status_check;

ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_workflow_status_check
  CHECK (workflow_status = ANY (ARRAY[
    'owner_pending'::text,
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

-- Soft-reserve stock while waiting for owner confirmation (same as other pending KA statuses).
CREATE OR REPLACE FUNCTION public.po_should_soft_reserve(p_po public.purchase_orders)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT
    p_po.fulfillment_type = 'warehouse_transfer'
    AND p_po.warehouse_company_id IS NOT NULL
    AND p_po.status IS DISTINCT FROM 'rejected'
    AND p_po.status IS DISTINCT FROM 'cancelled'
    AND p_po.status IS DISTINCT FROM 'approved_for_fulfillment'
    AND p_po.status IS DISTINCT FROM 'partially_fulfilled'
    AND p_po.status IS DISTINCT FROM 'fulfilled'
    AND p_po.status IS DISTINCT FROM 'approved'
    AND (
      (
        COALESCE(p_po.company_account_type, 'Standard Accounts') = 'Key Accounts'
        AND p_po.workflow_status = ANY (
          ARRAY[
            'owner_pending'::text,
            'kam_pending'::text,
            'director_pending'::text,
            'admin_pending'::text,
            'warehouse_reserved'::text
          ]
        )
      )
      OR (
        COALESCE(p_po.company_account_type, 'Standard Accounts') IS DISTINCT FROM 'Key Accounts'
        AND p_po.status = 'pending'
      )
    );
$$;

COMMENT ON FUNCTION public.po_should_soft_reserve(public.purchase_orders) IS
  'True when a warehouse-transfer PO should hold soft (pre-approval) stock commitments.';

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
              'owner_pending'::text,
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
    CASE
      WHEN b.is_main THEN COALESCE(m.on_hand, 0) > 0 OR COALESCE(m.allocated, 0) > 0
      ELSE COALESCE(lo.on_hand, 0) > 0
    END
    OR COALESCE(h.qty, 0) > 0
    OR COALESCE(s.qty, 0) > 0;
END;
$$;

-- Allow initial KA payment while owner_pending (same gate as other pending statuses).
CREATE OR REPLACE FUNCTION public.purchase_order_key_account_payments_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  po RECORD;
  applied_so_far numeric(14,2);
  pending_ok boolean;
  post_wh_ok boolean;
  is_consignment boolean;
  v_amount numeric(14,2);
  v_discount numeric(14,2);
BEGIN
  SELECT
    id,
    company_id,
    company_account_type,
    workflow_status,
    total_amount,
    key_account_payment_status,
    created_by,
    kam_id,
    po_order_kind
  INTO po
  FROM public.purchase_orders
  WHERE id = NEW.purchase_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase order not found';
  END IF;

  IF po.company_account_type IS DISTINCT FROM 'Key Accounts' THEN
    RAISE EXCEPTION 'Payments ledger applies to Key Account purchase orders only';
  END IF;

  IF NEW.company_id IS DISTINCT FROM po.company_id THEN
    RAISE EXCEPTION 'company_id must match purchase order company';
  END IF;

  IF NOT public.key_account_user_may_record_po_payment(po.id, auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed to record payment for this purchase order';
  END IF;

  IF po.key_account_payment_status = 'paid' THEN
    RAISE EXCEPTION 'This purchase order is already fully paid';
  END IF;

  v_amount := COALESCE(NEW.amount, 0);
  v_discount := COALESCE(NEW.settlement_discount, 0);
  NEW.amount := v_amount;
  NEW.settlement_discount := v_discount;

  IF v_discount > 0 THEN
    NEW.settlement_discount_reason := nullif(btrim(COALESCE(NEW.settlement_discount_reason, '')), '');
    IF NEW.settlement_discount_reason IS NULL THEN
      RAISE EXCEPTION 'Settlement discount reason is required';
    END IF;
  ELSE
    NEW.settlement_discount_reason := NULL;
  END IF;

  IF v_amount <= 0 AND v_discount <= 0 THEN
    RAISE EXCEPTION 'Enter a payment amount and/or settlement discount';
  END IF;

  SELECT
    COALESCE(SUM(amount), 0) + COALESCE(SUM(settlement_discount), 0)
  INTO applied_so_far
  FROM public.purchase_order_key_account_payments
  WHERE purchase_order_id = NEW.purchase_order_id;

  IF applied_so_far + v_amount + v_discount > po.total_amount + 0.0001 THEN
    RAISE EXCEPTION 'Payment + settlement discount exceeds remaining balance';
  END IF;

  pending_ok := po.workflow_status = ANY (
    ARRAY[
      'owner_pending'::text,
      'kam_pending'::text,
      'director_pending'::text,
      'admin_pending'::text,
      'approved'::text
    ]
  );

  post_wh_ok := po.workflow_status = ANY (
    ARRAY[
      'warehouse_reserved'::text,
      'fulfilled'::text,
      'partial_delivered'::text,
      'delivered'::text
    ]
  );

  is_consignment := po.po_order_kind IS NOT DISTINCT FROM 'consignment';

  IF applied_so_far <= 0 THEN
    IF NOT (pending_ok OR (is_consignment AND post_wh_ok)) THEN
      RAISE EXCEPTION
        'Initial payment can only be recorded while the PO is pending internal approval%s',
        CASE WHEN is_consignment THEN ' (or after warehouse for consignment POs)' ELSE '' END;
    END IF;
  END IF;

  NEW.recorded_by := auth.uid();

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.purchase_order_key_account_payments_before_insert() IS
  'Validates Key Account PO payment inserts; additional payments allowed at any workflow status; first payment still gated for standard/consignment.';
