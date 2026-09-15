-- Fix: SUM(quantity) is bigint, but hold helpers were declared as integer.
-- Postgres looks for add_client_return_stock_hold(..., bigint) and fails approve.

DROP FUNCTION IF EXISTS public.add_client_return_stock_hold(uuid, uuid, uuid, uuid, integer);
DROP FUNCTION IF EXISTS public.add_client_return_stock_hold(uuid, uuid, uuid, uuid, bigint);
DROP FUNCTION IF EXISTS public.transfer_client_return_stock_hold(uuid, uuid, uuid, uuid, uuid, integer);
DROP FUNCTION IF EXISTS public.transfer_client_return_stock_hold(uuid, uuid, uuid, uuid, uuid, bigint);

CREATE OR REPLACE FUNCTION public.add_client_return_stock_hold(
  p_company_id uuid,
  p_holder_id uuid,
  p_variant_id uuid,
  p_brand_id uuid,
  p_qty bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.client_return_stock_holds (
    company_id, holder_id, variant_id, brand_id, qty_on_hand
  ) VALUES (
    p_company_id, p_holder_id, p_variant_id, p_brand_id, p_qty::integer
  )
  ON CONFLICT (company_id, holder_id, variant_id)
  DO UPDATE SET
    qty_on_hand = public.client_return_stock_holds.qty_on_hand + EXCLUDED.qty_on_hand,
    brand_id = COALESCE(EXCLUDED.brand_id, public.client_return_stock_holds.brand_id),
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_client_return_stock_hold(
  p_company_id uuid,
  p_from_holder uuid,
  p_to_holder uuid,
  p_variant_id uuid,
  p_brand_id uuid,
  p_qty bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_from_qty integer;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Transfer quantity must be positive';
  END IF;

  SELECT qty_on_hand INTO v_from_qty
  FROM public.client_return_stock_holds
  WHERE company_id = p_company_id
    AND holder_id = p_from_holder
    AND variant_id = p_variant_id
  FOR UPDATE;

  IF COALESCE(v_from_qty, 0) < p_qty THEN
    RAISE EXCEPTION 'Insufficient returned stock on hand';
  END IF;

  UPDATE public.client_return_stock_holds
  SET qty_on_hand = qty_on_hand - p_qty::integer,
      updated_at = now()
  WHERE company_id = p_company_id
    AND holder_id = p_from_holder
    AND variant_id = p_variant_id;

  PERFORM public.add_client_return_stock_hold(
    p_company_id, p_to_holder, p_variant_id, p_brand_id, p_qty
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_client_return_stock_hold(uuid, uuid, uuid, uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_client_return_stock_hold(uuid, uuid, uuid, uuid, uuid, bigint) TO authenticated;
