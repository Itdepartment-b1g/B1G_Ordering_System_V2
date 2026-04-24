-- Fix: Allow tenant users (super_admin, admin, etc.) to view main_inventory from their linked warehouse hub
-- This mirrors the existing policy for warehouse_location_inventory
-- Now also allows viewing allocated_stock for calculating available stock

DROP POLICY IF EXISTS "Tenant can view linked hub main inventory" ON public.main_inventory;

CREATE POLICY "Tenant can view linked hub main inventory"
  ON public.main_inventory FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'manager'::text, 'team_leader'::text, 'mobile_sales'::text])
    )
    AND public.get_linked_warehouse_company_id() IS NOT NULL
    AND main_inventory.company_id = public.get_linked_warehouse_company_id()
  );

-- Ensure authenticated users can SELECT from main_inventory (needed for stock - allocated_stock calculation)
GRANT SELECT (id, company_id, variant_id, stock, allocated_stock) ON public.main_inventory TO authenticated;
