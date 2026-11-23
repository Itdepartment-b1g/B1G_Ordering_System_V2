-- Enable Realtime for Client Order Returns tabs (Return to TL + Returned Items).
-- FULL replica identity so company_id / holder_id filters work on UPDATE/DELETE.
ALTER TABLE public.client_order_returns REPLICA IDENTITY FULL;
ALTER TABLE public.return_leader_handovers REPLICA IDENTITY FULL;
ALTER TABLE public.client_return_stock_holds REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'client_order_returns'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.client_order_returns;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'return_leader_handovers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.return_leader_handovers;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'client_return_stock_holds'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.client_return_stock_holds;
  END IF;
END $$;
