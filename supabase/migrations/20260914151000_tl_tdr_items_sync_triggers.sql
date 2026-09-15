-- Persist dispatch/receive qty onto each TDR even if the RPC was not rebuilt.

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

CREATE OR REPLACE FUNCTION public._tl_record_tdr_dispatch(
  p_tdr_number text,
  p_request_id uuid,
  p_request_item_id uuid,
  p_variant_id uuid,
  p_quantity integer
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_tdr_id uuid;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 OR NULLIF(btrim(COALESCE(p_tdr_number, '')), '') IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO v_tdr_id
  FROM public.tl_stock_request_tdrs
  WHERE request_id = p_request_id
    AND tdr_number = btrim(p_tdr_number)
  LIMIT 1;

  IF v_tdr_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.tl_stock_request_tdr_items (
    tdr_id, request_item_id, variant_id, dispatched_quantity, received_quantity
  ) VALUES (
    v_tdr_id, p_request_item_id, p_variant_id, p_quantity, 0
  )
  ON CONFLICT (tdr_id, request_item_id)
  DO UPDATE SET
    dispatched_quantity = public.tl_stock_request_tdr_items.dispatched_quantity + EXCLUDED.dispatched_quantity,
    updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public._tl_tdr_attach_outs_for(p_tdr_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_request_id uuid;
  v_created_at timestamptz;
  v_prev timestamptz;
BEGIN
  SELECT request_id, created_at INTO v_request_id, v_created_at
  FROM public.tl_stock_request_tdrs
  WHERE id = p_tdr_id;

  IF v_request_id IS NULL THEN
    RETURN;
  END IF;

  SELECT MAX(created_at) INTO v_prev
  FROM public.tl_stock_request_tdrs
  WHERE request_id = v_request_id
    AND id IS DISTINCT FROM p_tdr_id
    AND created_at < v_created_at;

  INSERT INTO public.tl_stock_request_tdr_items (
    tdr_id, request_item_id, variant_id, dispatched_quantity, received_quantity
  )
  SELECT
    p_tdr_id,
    i.id,
    tx.variant_id,
    SUM(tx.quantity)::integer,
    0
  FROM public.inventory_transactions tx
  JOIN public.tl_stock_request_items i
    ON i.request_id = tx.reference_id
   AND i.variant_id = tx.variant_id
  WHERE tx.reference_type = 'tl_stock_request'
    AND tx.reference_id = v_request_id
    AND tx.transaction_type = 'tl_stock_transfer_out'
    AND COALESCE(tx.notes, '') NOT ILIKE '%found — returned%'
    AND tx.created_at > COALESCE(v_prev, TIMESTAMPTZ '-infinity')
    AND tx.created_at <= v_created_at + INTERVAL '5 seconds'
  GROUP BY i.id, tx.variant_id
  HAVING SUM(tx.quantity) > 0
  ON CONFLICT (tdr_id, request_item_id)
  DO UPDATE SET
    dispatched_quantity = GREATEST(
      public.tl_stock_request_tdr_items.dispatched_quantity,
      EXCLUDED.dispatched_quantity
    ),
    updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public._tl_tdr_attach_recent_outs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public._tl_tdr_attach_outs_for(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tl_tdr_attach_recent_outs ON public.tl_stock_request_tdrs;
CREATE TRIGGER trg_tl_tdr_attach_recent_outs
AFTER INSERT ON public.tl_stock_request_tdrs
FOR EACH ROW
EXECUTE PROCEDURE public._tl_tdr_attach_recent_outs();

CREATE OR REPLACE FUNCTION public._tl_tdr_on_receive_tx()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_item_id uuid;
BEGIN
  IF NEW.transaction_type IS DISTINCT FROM 'tl_stock_transfer_in' THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.notes, '') NOT ILIKE 'TL transfer receive%' THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_item_id
  FROM public.tl_stock_request_items
  WHERE request_id = NEW.reference_id
    AND variant_id = NEW.variant_id
  LIMIT 1;

  IF v_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public._tl_apply_tdr_receive_as_of(v_item_id, NEW.quantity, NEW.created_at);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tl_tdr_on_receive_tx ON public.inventory_transactions;
CREATE TRIGGER trg_tl_tdr_on_receive_tx
AFTER INSERT ON public.inventory_transactions
FOR EACH ROW
EXECUTE PROCEDURE public._tl_tdr_on_receive_tx();

DO $$
DECLARE
  t record;
  r record;
BEGIN
  FOR t IN
    SELECT id FROM public.tl_stock_request_tdrs ORDER BY created_at ASC
  LOOP
    PERFORM public._tl_tdr_attach_outs_for(t.id);
  END LOOP;

  UPDATE public.tl_stock_request_tdr_items SET received_quantity = 0;

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
