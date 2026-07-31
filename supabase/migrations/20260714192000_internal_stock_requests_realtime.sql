-- Enable Realtime so sub-warehouse UIs update when main approves/rejects/allocates.
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
