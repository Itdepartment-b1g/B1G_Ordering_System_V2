-- Warehouse sub-warehouses (locations) + per-location inventory
-- Main warehouse can allocate stock to sub-warehouses (implemented via RPCs in a later migration).

-- ---------------------------------------------------------------------------
-- 1) warehouse_locations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.warehouse_locations (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_main boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT warehouse_locations_company_name_key UNIQUE (company_id, name)
);

-- Exactly one main location per warehouse company
CREATE UNIQUE INDEX IF NOT EXISTS warehouse_locations_one_main_per_company
  ON public.warehouse_locations(company_id)
  WHERE is_main;

DROP TRIGGER IF EXISTS update_warehouse_locations_updated_at ON public.warehouse_locations;
CREATE TRIGGER update_warehouse_locations_updated_at
  BEFORE UPDATE ON public.warehouse_locations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.warehouse_locations ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2) warehouse_location_users (which warehouse user belongs to which location)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.warehouse_location_users (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  location_id uuid NOT NULL REFERENCES public.warehouse_locations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT warehouse_location_users_location_user_key UNIQUE (location_id, user_id)
);

DROP TRIGGER IF EXISTS update_warehouse_location_users_updated_at ON public.warehouse_location_users;
CREATE TRIGGER update_warehouse_location_users_updated_at
  BEFORE UPDATE ON public.warehouse_location_users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.warehouse_location_users ENABLE ROW LEVEL SECURITY;

-- A warehouse user belongs to at most one location (main or sub)
CREATE UNIQUE INDEX IF NOT EXISTS warehouse_location_users_one_location_per_user
  ON public.warehouse_location_users(user_id);

-- ---------------------------------------------------------------------------
-- 3) warehouse_location_inventory (stock held at a sub-warehouse location)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.warehouse_location_inventory (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.warehouse_locations(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.variants(id) ON DELETE CASCADE,
  stock integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT warehouse_location_inventory_location_variant_key UNIQUE (location_id, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_warehouse_location_inventory_company
  ON public.warehouse_location_inventory(company_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_location_inventory_location
  ON public.warehouse_location_inventory(location_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_location_inventory_variant
  ON public.warehouse_location_inventory(variant_id);

DROP TRIGGER IF EXISTS update_warehouse_location_inventory_updated_at ON public.warehouse_location_inventory;
CREATE TRIGGER update_warehouse_location_inventory_updated_at
  BEFORE UPDATE ON public.warehouse_location_inventory
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.warehouse_location_inventory ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 4) purchase_orders: tag warehouse transfers to a location
-- ---------------------------------------------------------------------------
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS warehouse_location_id uuid REFERENCES public.warehouse_locations(id) ON DELETE SET NULL;

-- Enforce fulfillment fields (supplier vs warehouse_transfer) including location id
ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_fulfillment_fields_check;
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_fulfillment_fields_check
  CHECK (
    (fulfillment_type = 'supplier' AND supplier_id IS NOT NULL AND warehouse_company_id IS NULL AND warehouse_location_id IS NULL)
    OR
    (fulfillment_type = 'warehouse_transfer' AND supplier_id IS NULL AND warehouse_company_id IS NOT NULL AND warehouse_location_id IS NOT NULL)
  );

-- ---------------------------------------------------------------------------
-- 5) Backfill: create MAIN location for existing warehouse companies
-- ---------------------------------------------------------------------------
INSERT INTO public.warehouse_locations (company_id, name, is_main, created_by)
SELECT DISTINCT
  p.company_id,
  'Main Warehouse',
  true,
  CAST(NULL AS uuid)
FROM public.profiles p
WHERE p.role = 'warehouse'
  AND p.company_id IS NOT NULL
ON CONFLICT (company_id, name) DO NOTHING;

-- Ensure all existing warehouse users are linked to their company's main location
INSERT INTO public.warehouse_location_users (location_id, user_id)
SELECT wl.id AS location_id, p.id AS user_id
FROM public.profiles p
JOIN public.warehouse_locations wl
  ON wl.company_id = p.company_id
 AND wl.is_main = true
WHERE p.role = 'warehouse'
  AND p.company_id IS NOT NULL
ON CONFLICT (location_id, user_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6) Minimal RLS policies (tighten/extend in later migrations)
-- ---------------------------------------------------------------------------
-- warehouse_locations
DROP POLICY IF EXISTS "Warehouse locations: sysadmin all" ON public.warehouse_locations;
CREATE POLICY "Warehouse locations: sysadmin all"
  ON public.warehouse_locations FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'system_administrator'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'system_administrator'));

DROP POLICY IF EXISTS "Warehouse locations: warehouse select own company" ON public.warehouse_locations;
CREATE POLICY "Warehouse locations: warehouse select own company"
  ON public.warehouse_locations FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'warehouse')
    AND company_id = public.get_auth_company_id()
  );

-- warehouse_location_users
DROP POLICY IF EXISTS "Warehouse location users: sysadmin all" ON public.warehouse_location_users;
CREATE POLICY "Warehouse location users: sysadmin all"
  ON public.warehouse_location_users FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'system_administrator'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'system_administrator'));

DROP POLICY IF EXISTS "Warehouse location users: warehouse select own company" ON public.warehouse_location_users;
CREATE POLICY "Warehouse location users: warehouse select own company"
  ON public.warehouse_location_users FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.warehouse_locations wl WHERE wl.id = warehouse_location_users.location_id AND wl.company_id = public.get_auth_company_id())
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'warehouse')
  );

-- warehouse_location_inventory
DROP POLICY IF EXISTS "Warehouse location inventory: sysadmin all" ON public.warehouse_location_inventory;
CREATE POLICY "Warehouse location inventory: sysadmin all"
  ON public.warehouse_location_inventory FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'system_administrator'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'system_administrator'));

DROP POLICY IF EXISTS "Warehouse location inventory: warehouse select own company" ON public.warehouse_location_inventory;
CREATE POLICY "Warehouse location inventory: warehouse select own company"
  ON public.warehouse_location_inventory FOR SELECT
  USING (
    company_id = public.get_auth_company_id()
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'warehouse')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouse_locations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouse_location_users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouse_location_inventory TO authenticated;

