-- Rebase historical before/after balances so the last movement per bag+variant
-- matches live inventory (agent_inventory / warehouse_location_inventory / main_inventory).
-- Fixes displays like "-35 → -34" when live stock is actually 3.

WITH legs AS (
  SELECT
    t.id,
    t.company_id,
    t.variant_id,
    t.created_at,
    t.from_location AS location_key,
    -ABS(t.quantity)::numeric AS signed_qty,
    'from'::text AS leg
  FROM public.inventory_transactions t
  WHERE t.from_location IS NOT NULL
    AND btrim(t.from_location) <> ''
    AND (
      t.from_location = 'main_inventory'
      OR t.from_location LIKE 'agent_inventory:%'
      OR t.from_location LIKE 'warehouse_location:%'
    )

  UNION ALL

  SELECT
    t.id,
    t.company_id,
    t.variant_id,
    t.created_at,
    t.to_location AS location_key,
    ABS(t.quantity)::numeric AS signed_qty,
    'to'::text AS leg
  FROM public.inventory_transactions t
  WHERE t.to_location IS NOT NULL
    AND btrim(t.to_location) <> ''
    AND (
      t.to_location = 'main_inventory'
      OR t.to_location LIKE 'agent_inventory:%'
      OR t.to_location LIKE 'warehouse_location:%'
    )
),
running AS (
  SELECT
    l.id,
    l.company_id,
    l.variant_id,
    l.location_key,
    l.leg,
    l.created_at,
    COALESCE(
      SUM(l.signed_qty) OVER (
        PARTITION BY l.company_id, l.location_key, l.variant_id
        ORDER BY l.created_at ASC, l.id ASC, l.leg ASC
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ),
      0
    ) AS qty_before,
    SUM(l.signed_qty) OVER (
      PARTITION BY l.company_id, l.location_key, l.variant_id
      ORDER BY l.created_at ASC, l.id ASC, l.leg ASC
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS qty_after
  FROM legs l
),
ending AS (
  SELECT DISTINCT ON (company_id, location_key, variant_id)
    company_id,
    location_key,
    variant_id,
    qty_after AS ledger_end
  FROM running
  ORDER BY company_id, location_key, variant_id, created_at DESC, id DESC, leg DESC
),
live AS (
  SELECT
    e.company_id,
    e.location_key,
    e.variant_id,
    e.ledger_end,
    public.inventory_location_live_stock(e.company_id, e.location_key, e.variant_id) AS live_stock
  FROM ending e
),
offsets AS (
  SELECT
    company_id,
    location_key,
    variant_id,
    COALESCE(live_stock, 0) - ledger_end AS offset_qty
  FROM live
  WHERE live_stock IS NOT NULL
    AND ABS(COALESCE(live_stock, 0) - ledger_end) > 0.0001
),
adjusted AS (
  SELECT
    r.id,
    r.leg,
    r.qty_before + o.offset_qty AS qty_before,
    r.qty_after + o.offset_qty AS qty_after
  FROM running r
  INNER JOIN offsets o
    ON o.company_id = r.company_id
   AND o.location_key = r.location_key
   AND o.variant_id = r.variant_id
),
pivoted AS (
  SELECT
    id,
    MAX(CASE WHEN leg = 'from' THEN qty_before END) AS from_qty_before,
    MAX(CASE WHEN leg = 'from' THEN qty_after END) AS from_qty_after,
    MAX(CASE WHEN leg = 'to' THEN qty_before END) AS to_qty_before,
    MAX(CASE WHEN leg = 'to' THEN qty_after END) AS to_qty_after
  FROM adjusted
  GROUP BY id
)
UPDATE public.inventory_transactions t
SET
  from_qty_before = COALESCE(p.from_qty_before, t.from_qty_before),
  from_qty_after = COALESCE(p.from_qty_after, t.from_qty_after),
  to_qty_before = COALESCE(p.to_qty_before, t.to_qty_before),
  to_qty_after = COALESCE(p.to_qty_after, t.to_qty_after)
FROM pivoted p
WHERE t.id = p.id;
