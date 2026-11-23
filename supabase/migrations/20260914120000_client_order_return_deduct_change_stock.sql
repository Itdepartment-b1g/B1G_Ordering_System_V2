-- Posted client-order returns: change items leave the filer's sellable bag.
-- Returned SKUs still go to returned_stock only (not sellable).
-- Pending / reject still do not move stock.

COMMENT ON TABLE public.client_order_return_change_items IS
  'Exchange SKUs. Same brand + qty as returned lines. On post, sellable stock is deducted from the agent who filed the CR.';

CREATE OR REPLACE FUNCTION public.apply_client_order_return_posted_stock(
  p_return_id uuid,
  p_performed_by uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_header public.client_order_returns%ROWTYPE;
  v_line RECORD;
  v_holder uuid;
  v_change_holder uuid;
  v_variant_name text;
  v_updated integer;
BEGIN
  SELECT * INTO v_header
  FROM public.client_order_returns
  WHERE id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return not found';
  END IF;

  v_holder := COALESCE(v_header.original_agent_id, v_header.returned_by);
  v_change_holder := COALESCE(v_header.returned_by, v_header.original_agent_id);

  FOR v_line IN
    SELECT variant_id, SUM(quantity) AS qty
    FROM public.client_order_return_items
    WHERE return_id = p_return_id
    GROUP BY variant_id
  LOOP
    UPDATE public.main_inventory
    SET returned_stock = COALESCE(returned_stock, 0) + v_line.qty,
        updated_at = now()
    WHERE company_id = v_header.company_id
      AND variant_id = v_line.variant_id;

    IF NOT FOUND THEN
      INSERT INTO public.main_inventory (
        company_id, variant_id, stock, allocated_stock, returned_stock, status, updated_at
      ) VALUES (
        v_header.company_id, v_line.variant_id, 0, 0, v_line.qty, 'in-stock', now()
      );
    END IF;

    IF v_holder IS NOT NULL THEN
      UPDATE public.agent_inventory
      SET returned_stock = COALESCE(returned_stock, 0) + v_line.qty,
          updated_at = now()
      WHERE company_id = v_header.company_id
        AND agent_id = v_holder
        AND variant_id = v_line.variant_id;

      IF NOT FOUND THEN
        INSERT INTO public.agent_inventory (
          company_id, agent_id, variant_id, stock, returned_stock, allocated_price, status, allocated_at, updated_at
        ) VALUES (
          v_header.company_id, v_holder, v_line.variant_id, 0, v_line.qty, 0, 'available', now(), now()
        );
      END IF;
    END IF;

    INSERT INTO public.inventory_transactions (
      company_id, variant_id, transaction_type, quantity,
      reference_type, reference_id, performed_by, notes, created_at
    ) VALUES (
      v_header.company_id,
      v_line.variant_id,
      'client_order_return',
      v_line.qty,
      'client_order_return',
      p_return_id,
      p_performed_by,
      'Client order return ' || v_header.return_number,
      now()
    );
  END LOOP;

  FOR v_line IN
    SELECT variant_id, SUM(quantity) AS qty
    FROM public.client_order_return_change_items
    WHERE return_id = p_return_id
    GROUP BY variant_id
  LOOP
    IF v_change_holder IS NULL THEN
      RAISE EXCEPTION 'Cannot issue change items: missing agent';
    END IF;

    SELECT v.name INTO v_variant_name
    FROM public.variants v
    WHERE v.id = v_line.variant_id;

    UPDATE public.agent_inventory
    SET
      stock = stock - v_line.qty,
      status = CASE
        WHEN stock - v_line.qty <= 0 THEN 'none'
        WHEN stock - v_line.qty <= 10 THEN 'low'
        ELSE 'available'
      END,
      updated_at = now()
    WHERE company_id = v_header.company_id
      AND agent_id = v_change_holder
      AND variant_id = v_line.variant_id
      AND COALESCE(stock, 0) >= v_line.qty;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      RAISE EXCEPTION 'Not enough stock to change %', COALESCE(v_variant_name, 'item');
    END IF;

    INSERT INTO public.inventory_transactions (
      company_id, variant_id, transaction_type, quantity,
      from_location, to_location,
      reference_type, reference_id, performed_by, notes, created_at
    ) VALUES (
      v_header.company_id,
      v_line.variant_id,
      'client_order_return',
      v_line.qty,
      'agent_inventory:' || v_change_holder::text,
      'client_exchange',
      'client_order_return',
      p_return_id,
      p_performed_by,
      'Client order return change item ' || v_header.return_number,
      now()
    );
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.apply_client_order_return_posted_stock(uuid, uuid) IS
  'On posted CR: add returned qty to returned_stock; deduct change qty from the filer''s sellable agent_inventory.stock.';
