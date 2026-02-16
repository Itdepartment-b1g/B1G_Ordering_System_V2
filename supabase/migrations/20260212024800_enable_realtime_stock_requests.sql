-- Enable Realtime for stock_requests table
-- This allows the frontend to receive updates when stock requests are created, updated, or deleted.

begin;
  -- check if the publication exists (it should by default in Supabase)
  -- and add the table to it
  alter publication supabase_realtime add table stock_requests;
commit;
