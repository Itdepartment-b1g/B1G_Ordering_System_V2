-- Catch-up: Standard Account return types on inventory CHECKs.
-- Production missed 20260722120000 constraint updates, so TL return-to-warehouse
-- fails with inventory_transactions_transaction_type_check (client_return_out).
-- Warehouse inspect also needs client_return_in / standard_account_return.
-- Safe to re-run on local: allowed values match the current local constraints.

ALTER TABLE public.inventory_transactions
  DROP CONSTRAINT IF EXISTS inventory_transactions_transaction_type_check;

ALTER TABLE public.inventory_transactions
  ADD CONSTRAINT inventory_transactions_transaction_type_check
  CHECK (transaction_type = ANY (ARRAY[
    'purchase_order_received'::text,
    'allocated_to_agent'::text,
    'order_fulfilled'::text,
    'adjustment'::text,
    'return'::text,
    'return_to_main'::text,
    'warehouse_transfer_out'::text,
    'warehouse_transfer_in'::text,
    'warehouse_allocate_to_sub'::text,
    'warehouse_return_from_sub'::text,
    'rebate_return_in'::text,
    'rebate_return_disposed'::text,
    'warehouse_stock_receive'::text,
    'warehouse_return_in'::text,
    'warehouse_return_disposed'::text,
    'internal_stock_request_reserve'::text,
    'internal_stock_request_receive'::text,
    'internal_stock_request_short_release'::text,
    'client_return_out'::text,
    'client_return_cancel_in'::text,
    'client_return_in'::text,
    'client_return_disposed'::text
  ]));

ALTER TABLE public.inventory_batch_movements
  DROP CONSTRAINT IF EXISTS inventory_batch_movements_movement_type_check;

ALTER TABLE public.inventory_batch_movements
  ADD CONSTRAINT inventory_batch_movements_movement_type_check
  CHECK (movement_type = ANY (ARRAY[
    'receive'::text,
    'allocate_out'::text,
    'allocate_in'::text,
    'return_out'::text,
    'return_in'::text,
    'fulfill_out'::text,
    'adjustment_in'::text,
    'adjustment_out'::text,
    'opening_balance'::text,
    'rebate_return_in'::text,
    'warehouse_return_disposed'::text,
    'internal_request_out'::text,
    'internal_request_in'::text,
    'client_return_in'::text
  ]));

ALTER TABLE public.warehouse_inventory_disposals
  DROP CONSTRAINT IF EXISTS warehouse_inventory_disposals_source_type_check;

ALTER TABLE public.warehouse_inventory_disposals
  ADD CONSTRAINT warehouse_inventory_disposals_source_type_check
  CHECK (source_type = ANY (ARRAY[
    'rebate_return'::text,
    'adjustment'::text,
    'other'::text,
    'sub_warehouse_return'::text,
    'standard_account_return'::text
  ]));
