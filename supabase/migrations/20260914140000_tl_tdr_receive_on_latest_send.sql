-- Receives belong to the current send (latest TDR), not leftover room on an
-- older TDR. Otherwise: dispatch 5, receive 2, redeliver 3, receive 3
-- showed 5/5 on the first TDR and nothing on the redeliver TDR.
-- Safe to re-run if tl_stock_request_tdr_items was dropped or never created.

CREATE TABLE IF NOT EXISTS public.tl_stock_request_tdr_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  tdr_id uuid NOT NULL REFERENCES public.tl_stock_request_tdrs(id) ON DELETE CASCADE,
  request_item_id uuid NOT NULL REFERENCES public.tl_stock_request_items(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.variants(id) ON DELETE RESTRICT,
  dispatched_quantity integer NOT NULL CHECK (dispatched_quantity > 0),
  received_quantity integer NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT tl_stock_request_tdr_items_tdr_item_key UNIQUE (tdr_id, request_item_id)
);

CREATE INDEX IF NOT EXISTS idx_tl_stock_request_tdr_items_item
  ON public.tl_stock_request_tdr_items(request_item_id);

ALTER TABLE public.tl_stock_request_tdr_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "TL transfer parties can view TDR items" ON public.tl_stock_request_tdr_items;
CREATE POLICY "TL transfer parties can view TDR items"
  ON public.tl_stock_request_tdr_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tl_stock_request_tdrs t
      JOIN public.tl_stock_requests r ON r.id = t.request_id
      WHERE t.id = tl_stock_request_tdr_items.tdr_id
        AND (
          auth.uid() IN (r.requester_leader_id, r.source_leader_id)
          OR EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.company_id = r.company_id
              AND p.role IN ('admin', 'super_admin')
          )
        )
    )
  );

GRANT SELECT ON public.tl_stock_request_tdr_items TO authenticated;

CREATE OR REPLACE FUNCTION public._tl_apply_tdr_receive(
  p_request_item_id uuid,
  p_quantity integer
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public._tl_apply_tdr_receive_as_of(p_request_item_id, p_quantity, NOW());
END;
$$;

CREATE OR REPLACE FUNCTION public._tl_apply_tdr_receive_as_of(
  p_request_item_id uuid,
  p_quantity integer,
  p_as_of timestamptz
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_left integer;
  v_apply integer;
  r record;
BEGIN
  v_left := COALESCE(p_quantity, 0);
  IF v_left <= 0 THEN
    RETURN;
  END IF;

  SELECT ti.id, ti.dispatched_quantity, ti.received_quantity
  INTO r
  FROM public.tl_stock_request_tdr_items ti
  JOIN public.tl_stock_request_tdrs t ON t.id = ti.tdr_id
  WHERE ti.request_item_id = p_request_item_id
    AND t.created_at <= COALESCE(p_as_of, NOW())
  ORDER BY t.created_at DESC, ti.created_at DESC
  LIMIT 1;

  IF r.id IS NULL THEN
    RETURN;
  END IF;

  v_apply := LEAST(v_left, GREATEST(r.dispatched_quantity - r.received_quantity, 0));
  IF v_apply <= 0 THEN
    RETURN;
  END IF;

  UPDATE public.tl_stock_request_tdr_items
  SET received_quantity = received_quantity + v_apply,
      updated_at = NOW()
  WHERE id = r.id;
END;
$$;

-- Rebuild per-TDR qty from inventory movements.
DELETE FROM public.tl_stock_request_tdr_items;

INSERT INTO public.tl_stock_request_tdr_items (
  tdr_id, request_item_id, variant_id, dispatched_quantity, received_quantity
)
SELECT
  mapped.tdr_id,
  mapped.request_item_id,
  mapped.variant_id,
  SUM(mapped.quantity)::integer,
  0
FROM (
  SELECT
    tdr.id AS tdr_id,
    i.id AS request_item_id,
    tx.variant_id,
    tx.quantity
  FROM public.inventory_transactions tx
  JOIN public.tl_stock_request_items i
    ON i.request_id = tx.reference_id
   AND i.variant_id = tx.variant_id
  JOIN LATERAL (
    SELECT t.id
    FROM public.tl_stock_request_tdrs t
    WHERE t.request_id = tx.reference_id
    ORDER BY abs(extract(epoch from (t.created_at - tx.created_at)))
    LIMIT 1
  ) tdr ON true
  WHERE tx.reference_type = 'tl_stock_request'
    AND tx.transaction_type = 'tl_stock_transfer_out'
    AND COALESCE(tx.notes, '') NOT ILIKE '%found — returned%'
) mapped
GROUP BY mapped.tdr_id, mapped.request_item_id, mapped.variant_id;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT i.id AS item_id, tx.quantity, tx.created_at
    FROM public.inventory_transactions tx
    JOIN public.tl_stock_request_items i
      ON i.request_id = tx.reference_id
     AND i.variant_id = tx.variant_id
    WHERE tx.reference_type = 'tl_stock_request'
      AND tx.transaction_type = 'tl_stock_transfer_in'
      AND COALESCE(tx.notes, '') ILIKE 'TL transfer receive%'
    ORDER BY tx.created_at ASC, tx.id ASC
  LOOP
    PERFORM public._tl_apply_tdr_receive_as_of(r.item_id, r.quantity, r.created_at);
  END LOOP;
END $$;
