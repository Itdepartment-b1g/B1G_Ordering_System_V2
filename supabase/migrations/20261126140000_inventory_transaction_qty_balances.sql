-- Store before/after balances on inventory_transactions for Qty display:
-- e.g. 200 → 210 (+10)
--
-- 1) Add nullable columns
-- 2) BEFORE INSERT trigger stamps balances from live stock (writers update stock first)
-- 3) Best-effort historical backfill via ledger replay per location + variant

ALTER TABLE public.inventory_transactions
  ADD COLUMN IF NOT EXISTS from_qty_before numeric NULL,
  ADD COLUMN IF NOT EXISTS from_qty_after numeric NULL,
  ADD COLUMN IF NOT EXISTS to_qty_before numeric NULL,
  ADD COLUMN IF NOT EXISTS to_qty_after numeric NULL;

COMMENT ON COLUMN public.inventory_transactions.from_qty_before IS
  'Balance at from_location before this movement (nullable for technical/unknown locations).';
COMMENT ON COLUMN public.inventory_transactions.from_qty_after IS
  'Balance at from_location after this movement.';
COMMENT ON COLUMN public.inventory_transactions.to_qty_before IS
  'Balance at to_location before this movement.';
COMMENT ON COLUMN public.inventory_transactions.to_qty_after IS
  'Balance at to_location after this movement.';

-- Live stock lookup for bag locations (agent / warehouse / main).
CREATE OR REPLACE FUNCTION public.inventory_location_live_stock(
  p_company_id uuid,
  p_location text,
  p_variant_id uuid
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loc text := btrim(COALESCE(p_location, ''));
  v_id text;
  v_stock numeric;
BEGIN
  IF v_loc = '' OR p_company_id IS NULL OR p_variant_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_loc = 'main_inventory' THEN
    SELECT mi.stock::numeric
      INTO v_stock
    FROM public.main_inventory mi
    WHERE mi.company_id = p_company_id
      AND mi.variant_id = p_variant_id
    LIMIT 1;
    RETURN v_stock;
  END IF;

  IF v_loc LIKE 'agent_inventory:%' THEN
    v_id := NULLIF(btrim(substr(v_loc, length('agent_inventory:') + 1)), '');
    IF v_id IS NULL THEN
      RETURN NULL;
    END IF;
    BEGIN
      SELECT ai.stock::numeric
        INTO v_stock
      FROM public.agent_inventory ai
      WHERE ai.agent_id = v_id::uuid
        AND ai.variant_id = p_variant_id
      LIMIT 1;
    EXCEPTION
      WHEN invalid_text_representation THEN
        RETURN NULL;
    END;
    RETURN v_stock;
  END IF;

  IF v_loc LIKE 'warehouse_location:%' THEN
    v_id := NULLIF(btrim(substr(v_loc, length('warehouse_location:') + 1)), '');
    IF v_id IS NULL THEN
      RETURN NULL;
    END IF;
    BEGIN
      SELECT wli.stock::numeric
        INTO v_stock
      FROM public.warehouse_location_inventory wli
      WHERE wli.location_id = v_id::uuid
        AND wli.variant_id = p_variant_id
      LIMIT 1;
    EXCEPTION
      WHEN invalid_text_representation THEN
        RETURN NULL;
    END;
    RETURN v_stock;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_location_live_stock(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inventory_location_live_stock(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_location_live_stock(uuid, text, uuid) TO service_role;

-- Stamp balances when writers leave them NULL.
-- Assumes stock was already updated for bag locations (project convention).
CREATE OR REPLACE FUNCTION public.stamp_inventory_transaction_qty_balances()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qty numeric := ABS(COALESCE(NEW.quantity, 0)::numeric);
  v_after numeric;
BEGIN
  IF v_qty = 0 THEN
    RETURN NEW;
  END IF;

  -- from_location lost stock
  IF NEW.from_qty_before IS NULL OR NEW.from_qty_after IS NULL THEN
    v_after := public.inventory_location_live_stock(
      NEW.company_id,
      NEW.from_location,
      NEW.variant_id
    );
    IF v_after IS NOT NULL THEN
      IF NEW.from_qty_after IS NULL THEN
        NEW.from_qty_after := v_after;
      END IF;
      IF NEW.from_qty_before IS NULL THEN
        NEW.from_qty_before := v_after + v_qty;
      END IF;
    END IF;
  END IF;

  -- to_location gained stock
  IF NEW.to_qty_before IS NULL OR NEW.to_qty_after IS NULL THEN
    v_after := public.inventory_location_live_stock(
      NEW.company_id,
      NEW.to_location,
      NEW.variant_id
    );
    IF v_after IS NOT NULL THEN
      IF NEW.to_qty_after IS NULL THEN
        NEW.to_qty_after := v_after;
      END IF;
      IF NEW.to_qty_before IS NULL THEN
        NEW.to_qty_before := v_after - v_qty;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_inventory_transaction_qty_balances
  ON public.inventory_transactions;

CREATE TRIGGER trg_stamp_inventory_transaction_qty_balances
  BEFORE INSERT ON public.inventory_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_inventory_transaction_qty_balances();

-- Historical backfill: replay ledger (from −qty, to +qty) per location + variant.
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
    l.leg,
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
pivoted AS (
  SELECT
    id,
    MAX(CASE WHEN leg = 'from' THEN qty_before END) AS from_qty_before,
    MAX(CASE WHEN leg = 'from' THEN qty_after END) AS from_qty_after,
    MAX(CASE WHEN leg = 'to' THEN qty_before END) AS to_qty_before,
    MAX(CASE WHEN leg = 'to' THEN qty_after END) AS to_qty_after
  FROM running
  GROUP BY id
)
UPDATE public.inventory_transactions t
SET
  from_qty_before = COALESCE(t.from_qty_before, p.from_qty_before),
  from_qty_after = COALESCE(t.from_qty_after, p.from_qty_after),
  to_qty_before = COALESCE(t.to_qty_before, p.to_qty_before),
  to_qty_after = COALESCE(t.to_qty_after, p.to_qty_after)
FROM pivoted p
WHERE t.id = p.id
  AND (
    t.from_qty_before IS NULL
    OR t.from_qty_after IS NULL
    OR t.to_qty_before IS NULL
    OR t.to_qty_after IS NULL
  );
