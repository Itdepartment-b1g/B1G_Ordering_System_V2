-- Stop TDR qty from being applied twice:
-- 1) source_tl_dispatch_stock records the line, then trg_tl_tdr_attach_recent_outs
--    also attaches the same inventory out (ADD made first SKU 4/4 instead of 2/2).
-- 2) requester_tl_receive_stock calls _tl_apply_tdr_receive, then
--    trg_tl_tdr_on_receive_tx applies the same receive again and fills the
--    leftover up to dispatched (3 received became 5/5).

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
    dispatched_quantity = GREATEST(
      public.tl_stock_request_tdr_items.dispatched_quantity,
      EXCLUDED.dispatched_quantity
    ),
    updated_at = NOW();
END;
$$;

-- RPC still calls this after inserting the receive transaction. The trigger
-- trg_tl_tdr_on_receive_tx now owns the write.
CREATE OR REPLACE FUNCTION public._tl_apply_tdr_receive(
  p_request_item_id uuid,
  p_quantity integer
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN;
END;
$$;

DELETE FROM public.tl_stock_request_tdr_items;

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
