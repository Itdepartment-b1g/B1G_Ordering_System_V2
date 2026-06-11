-- Key Account dispatch/delivery capture after warehouse fulfillment
-- Stores rider info + proof photo for Key Account warehouse_transfer POs.

CREATE TABLE IF NOT EXISTS public.purchase_order_deliveries (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Dispatch/proof fields
  rider_name text,
  rider_plate_number text,
  rider_photo_url text,
  warehouse_signature_url text,
  warehouse_signature_path text,
  proof_of_delivery_url text,

  status text DEFAULT 'dispatched' NOT NULL,
  notes text,

  dispatched_at timestamp with time zone DEFAULT now(),
  delivered_at timestamp with time zone,

  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_deliveries_po_id
  ON public.purchase_order_deliveries(purchase_order_id);

CREATE INDEX IF NOT EXISTS idx_po_deliveries_company_id
  ON public.purchase_order_deliveries(company_id);

CREATE INDEX IF NOT EXISTS idx_po_deliveries_status
  ON public.purchase_order_deliveries(status);

ALTER TABLE public.purchase_order_deliveries ENABLE ROW LEVEL SECURITY;

-- Warehouse can view deliveries for transfer POs they can access (Key Accounts only).
DROP POLICY IF EXISTS "Warehouse can view Key Account PO deliveries" ON public.purchase_order_deliveries;
CREATE POLICY "Warehouse can view Key Account PO deliveries"
  ON public.purchase_order_deliveries FOR SELECT
  USING (
    public.is_warehouse()
    AND EXISTS (
      SELECT 1
      FROM public.purchase_orders po
      WHERE po.id = purchase_order_deliveries.purchase_order_id
        AND po.company_account_type = 'Key Accounts'
        AND public.warehouse_can_access_transfer_po(po.id, auth.uid())
        AND public.key_account_transfer_po_visible_to_warehouse(po.id)
    )
  );

-- Warehouse can create dispatch records for Key Account transfer POs they can access.
DROP POLICY IF EXISTS "Warehouse can create Key Account PO deliveries" ON public.purchase_order_deliveries;
CREATE POLICY "Warehouse can create Key Account PO deliveries"
  ON public.purchase_order_deliveries FOR INSERT
  WITH CHECK (
    public.is_warehouse()
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.purchase_orders po
      WHERE po.id = purchase_order_deliveries.purchase_order_id
        AND po.company_account_type = 'Key Accounts'
        AND po.company_id = purchase_order_deliveries.company_id
        AND public.warehouse_can_access_transfer_po(po.id, auth.uid())
        AND public.key_account_transfer_po_visible_to_warehouse(po.id)
    )
  );

