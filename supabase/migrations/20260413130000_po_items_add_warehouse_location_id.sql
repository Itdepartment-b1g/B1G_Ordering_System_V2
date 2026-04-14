-- Add per-item warehouse_location_id to support multi-location warehouse transfers.
-- Backward compatible: existing single-location transfers keep using purchase_orders.warehouse_location_id,
-- and we backfill items to match the PO header location where missing.

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS warehouse_location_id uuid REFERENCES public.warehouse_locations(id) ON DELETE SET NULL;

-- Backfill: for warehouse_transfer POs, set item location from PO header where item is missing it.
UPDATE public.purchase_order_items poi
SET warehouse_location_id = po.warehouse_location_id
FROM public.purchase_orders po
WHERE po.id = poi.purchase_order_id
  AND po.fulfillment_type = 'warehouse_transfer'
  AND po.warehouse_location_id IS NOT NULL
  AND poi.warehouse_location_id IS NULL;

-- Enforce: warehouse_transfer items must have a warehouse_location_id.
-- (Cross-table requirement; implemented via trigger.)
CREATE OR REPLACE FUNCTION public.enforce_transfer_item_has_location()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  po_type text;
BEGIN
  SELECT fulfillment_type INTO po_type
  FROM public.purchase_orders
  WHERE id = NEW.purchase_order_id;

  IF COALESCE(po_type, 'supplier') = 'warehouse_transfer' AND NEW.warehouse_location_id IS NULL THEN
    RAISE EXCEPTION 'warehouse_location_id is required for warehouse_transfer purchase_order_items';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_transfer_item_has_location ON public.purchase_order_items;
CREATE TRIGGER trg_enforce_transfer_item_has_location
  BEFORE INSERT OR UPDATE ON public.purchase_order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_transfer_item_has_location();

