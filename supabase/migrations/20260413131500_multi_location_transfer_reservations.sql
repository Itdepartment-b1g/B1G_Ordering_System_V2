-- Reservations + per-location status for multi-location warehouse transfer POs

CREATE TABLE IF NOT EXISTS public.warehouse_transfer_reservations (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  warehouse_company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  warehouse_location_id uuid NOT NULL REFERENCES public.warehouse_locations(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.variants(id) ON DELETE CASCADE,
  quantity_reserved integer NOT NULL CHECK (quantity_reserved >= 0),
  quantity_fulfilled integer NOT NULL DEFAULT 0 CHECK (quantity_fulfilled >= 0),
  status text NOT NULL DEFAULT 'reserved' CHECK (status = ANY (ARRAY['reserved'::text, 'partial'::text, 'fulfilled'::text, 'cancelled'::text])),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT warehouse_transfer_reservations_unique UNIQUE (purchase_order_id, warehouse_location_id, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_wtr_po ON public.warehouse_transfer_reservations(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_wtr_location ON public.warehouse_transfer_reservations(warehouse_location_id);
CREATE INDEX IF NOT EXISTS idx_wtr_company ON public.warehouse_transfer_reservations(warehouse_company_id);

DROP TRIGGER IF EXISTS update_wtr_updated_at ON public.warehouse_transfer_reservations;
CREATE TRIGGER update_wtr_updated_at
  BEFORE UPDATE ON public.warehouse_transfer_reservations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.warehouse_transfer_reservations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.warehouse_transfer_location_status (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  warehouse_company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  warehouse_location_id uuid NOT NULL REFERENCES public.warehouse_locations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status = ANY (ARRAY['pending'::text, 'ready'::text, 'partial'::text, 'fulfilled'::text, 'rejected'::text])),
  updated_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT warehouse_transfer_location_status_unique UNIQUE (purchase_order_id, warehouse_location_id)
);

CREATE INDEX IF NOT EXISTS idx_wtls_po ON public.warehouse_transfer_location_status(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_wtls_location ON public.warehouse_transfer_location_status(warehouse_location_id);

DROP TRIGGER IF EXISTS update_wtls_updated_at ON public.warehouse_transfer_location_status;
CREATE TRIGGER update_wtls_updated_at
  BEFORE UPDATE ON public.warehouse_transfer_location_status
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.warehouse_transfer_location_status ENABLE ROW LEVEL SECURITY;

