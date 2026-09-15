-- Live updates for TL stock transfers (Incoming, status, shortages).
-- Header-only subscriptions miss item status changes, and filtered
-- subscriptions drop UPDATEs unless replica identity includes the filter column.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tl_stock_requests',
    'tl_stock_request_items',
    'tl_stock_request_tdrs',
    'tl_stock_request_discrepancies'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.tl_stock_requests REPLICA IDENTITY FULL;
ALTER TABLE public.tl_stock_request_items REPLICA IDENTITY FULL;
ALTER TABLE public.tl_stock_request_tdrs REPLICA IDENTITY FULL;
ALTER TABLE public.tl_stock_request_discrepancies REPLICA IDENTITY FULL;
