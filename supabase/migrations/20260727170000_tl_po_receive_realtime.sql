-- Enable Realtime for TL PO Receiving (dispatch, receive, shortage updates).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'purchase_order_deliveries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.purchase_order_deliveries;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'purchase_order_delivery_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.purchase_order_delivery_items;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'purchase_order_delivery_discrepancies'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.purchase_order_delivery_discrepancies;
  END IF;
END $$;
