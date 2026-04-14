-- Allow new Purchase Order statuses used by multi-location warehouse transfers.
-- Error seen: violates check constraint "purchase_orders_status_check" when setting status = 'approved_for_fulfillment'.

ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_status_check;

ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_status_check
  CHECK (
    status = ANY (
      ARRAY[
        'draft'::text,
        'submitted'::text,
        'pending'::text,
        'approved'::text,
        'approved_for_fulfillment'::text,
        'partially_fulfilled'::text,
        'fulfilled'::text,
        'rejected'::text,
        'cancelled'::text,
        'delivered'::text
      ]
    )
  );

