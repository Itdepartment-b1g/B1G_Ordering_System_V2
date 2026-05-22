-- Record which warehouse location fulfilled/dispatched each delivery (not all PO source warehouses).

ALTER TABLE public.purchase_order_deliveries
  ADD COLUMN IF NOT EXISTS warehouse_location_id uuid
  REFERENCES public.warehouse_locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_po_deliveries_warehouse_location_id
  ON public.purchase_order_deliveries(warehouse_location_id);

UPDATE public.purchase_order_deliveries pod
SET warehouse_location_id = public.get_warehouse_location_id(pod.created_by)
WHERE pod.warehouse_location_id IS NULL;

-- Extend Key Account warehouse_locations visibility to dispatch fulfilling locations.
DROP POLICY IF EXISTS "Key Account roles can view PO warehouse locations" ON public.warehouse_locations;
CREATE POLICY "Key Account roles can view PO warehouse locations"
  ON public.warehouse_locations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.purchase_orders po
      WHERE po.company_account_type = 'Key Accounts'
        AND (
          po.warehouse_location_id = warehouse_locations.id
          OR EXISTS (
            SELECT 1
            FROM public.purchase_order_items poi
            WHERE poi.purchase_order_id = po.id
              AND poi.warehouse_location_id = warehouse_locations.id
          )
          OR EXISTS (
            SELECT 1
            FROM public.purchase_order_deliveries pod
            WHERE pod.purchase_order_id = po.id
              AND pod.warehouse_location_id = warehouse_locations.id
          )
        )
        AND (
          po.kam_id = auth.uid()
          OR po.created_by = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role = 'sales_admin'
              AND p.company_id = po.company_id
          )
          OR EXISTS (
            SELECT 1
            FROM public.profiles p
            INNER JOIN public.kam_director_assignments a ON a.director_id = p.id
            WHERE p.id = auth.uid()
              AND p.role = 'sales_director'
              AND a.kam_id = po.kam_id
          )
        )
    )
  );
