-- Ensure filtered Realtime (company_id / from_location_id) can see full row
-- payloads for UPDATE/DELETE. Also re-assert the table is in the publication.
ALTER TABLE public.internal_stock_requests REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'internal_stock_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_stock_requests;
  END IF;
END $$;
