-- Fix: receive_inventory_lots_to_main had two overloads after 20260609150000 added an
-- optional 11th parameter without dropping the original 10-parameter version.
-- A 10-argument call (e.g. stock request receive) matched both signatures → "not unique".

DROP FUNCTION IF EXISTS public.receive_inventory_lots_to_main(
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
  timestamptz,
  text,
  uuid,
  uuid,
  text
);

GRANT EXECUTE ON FUNCTION public.receive_inventory_lots_to_main(
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
  timestamptz,
  text,
  uuid,
  uuid,
  text,
  text
) TO authenticated;
