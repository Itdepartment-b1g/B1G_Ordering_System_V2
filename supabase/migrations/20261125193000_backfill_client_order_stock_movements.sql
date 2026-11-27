-- ============================================================================
-- Backfill inventory_transactions for historical client orders so Stock Movements
-- can show past sales. Skips orders that already have order_fulfilled ledger rows
-- (e.g. created after create_client_order_atomic started logging).
-- Does not change agent_inventory balances.
-- ============================================================================

INSERT INTO public.inventory_transactions (
  company_id,
  variant_id,
  transaction_type,
  quantity,
  from_location,
  to_location,
  reference_type,
  reference_id,
  performed_by,
  notes,
  created_at
)
SELECT
  o.company_id,
  i.variant_id,
  'order_fulfilled',
  i.quantity,
  'agent_inventory:' || o.agent_id::text,
  'client_sale',
  'client_order',
  o.id,
  o.agent_id,
  'Client order ' || o.order_number || ' — ' || COALESCE(c.name, 'Client'),
  o.created_at
FROM public.client_order_items i
INNER JOIN public.client_orders o
  ON o.id = i.client_order_id
LEFT JOIN public.clients c
  ON c.id = o.client_id
WHERE COALESCE(i.quantity, 0) > 0
  AND o.agent_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.inventory_transactions t
    WHERE t.reference_type = 'client_order'
      AND t.reference_id = o.id
      AND t.transaction_type = 'order_fulfilled'
  );
