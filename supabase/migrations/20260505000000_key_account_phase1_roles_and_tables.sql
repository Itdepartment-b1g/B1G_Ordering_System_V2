-- ============================================================================
-- PHASE 1: Key Account Data Model and Role Permissions
-- Option A: Super Admin field creates Sales Admin for Key Account companies
-- Date: 2026-05-05
-- ============================================================================

-- ============================================================================
-- 1.1 ADD NEW ROLES TO PROFILES ROLE CONSTRAINT
-- ============================================================================

-- First, drop the existing constraint
ALTER TABLE public.profiles 
DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Add new constraint with Key Account roles included
ALTER TABLE public.profiles 
ADD CONSTRAINT profiles_role_check CHECK (
  role = ANY (ARRAY[
    'system_administrator'::text,
    'super_admin'::text,
    'admin'::text,
    'finance'::text,
    'manager'::text,
    'team_leader'::text,
    'mobile_sales'::text,
    'executive'::text,
    'warehouse'::text,
    -- Key Account specific roles
    'sales_admin'::text,
    'sales_director'::text,
    'key_account_manager'::text
  ])
);

COMMENT ON CONSTRAINT profiles_role_check ON public.profiles IS 
'Extended role check including Key Account workflow roles: sales_admin, sales_director, key_account_manager';

-- ============================================================================
-- 1.2 CREATE KEY_ACCOUNT_CLIENTS TABLE
-- Parent clients like SM, Robinsons, Watsons
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.key_account_clients (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_code text NOT NULL,
  client_name text NOT NULL,
  industry text,
  contact_person text,
  contact_email text,
  contact_phone text,
  payment_terms text,
  credit_limit numeric(12,2) DEFAULT 0,
  status text DEFAULT 'active' NOT NULL,
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  -- Constraints
  CONSTRAINT key_account_clients_company_client_code_unique UNIQUE (company_id, client_code),
  CONSTRAINT key_account_clients_company_client_name_unique UNIQUE (company_id, client_name),
  CONSTRAINT key_account_clients_status_check CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'suspended'::text]))
);

COMMENT ON TABLE public.key_account_clients IS 
'Parent client companies for Key Account workflow (e.g., SM, Robinsons, Watsons). Each client belongs to one Key Account company and can have multiple shops/branches.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_key_account_clients_company 
  ON public.key_account_clients(company_id);
CREATE INDEX IF NOT EXISTS idx_key_account_clients_status 
  ON public.key_account_clients(status);
CREATE INDEX IF NOT EXISTS idx_key_account_clients_code 
  ON public.key_account_clients(client_code);

-- Updated at trigger
DROP TRIGGER IF EXISTS update_key_account_clients_updated_at ON public.key_account_clients;
CREATE TRIGGER update_key_account_clients_updated_at
  BEFORE UPDATE ON public.key_account_clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.key_account_clients ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Key Account clients viewable by company members" ON public.key_account_clients
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.company_id = key_account_clients.company_id
    )
  );

CREATE POLICY "Key Account clients manageable by sales_admin and directors" ON public.key_account_clients
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.company_id = key_account_clients.company_id
      AND profiles.role IN ('sales_admin', 'sales_director')
    )
  );

-- Allow warehouse users to view Key Account clients for POs assigned to their warehouse
CREATE POLICY "Key Account clients viewable by warehouse for assigned POs" ON public.key_account_clients
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.purchase_orders
      JOIN public.profiles ON profiles.company_id = purchase_orders.warehouse_company_id
      WHERE purchase_orders.key_account_client_id = key_account_clients.id
      AND profiles.id = auth.uid()
      AND profiles.role = 'warehouse'
    )
  );

-- ============================================================================
-- 1.3 CREATE KEY_ACCOUNT_SHOPS TABLE
-- Branches under parent clients (e.g., SM Cebu, SM Davao)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.key_account_shops (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.key_account_clients(id) ON DELETE CASCADE,
  shop_code text NOT NULL,
  shop_name text NOT NULL,
  city text,
  region text,
  province text,
  contact_person text,
  contact_phone text,
  contact_email text,
  operating_hours text,
  is_active boolean DEFAULT true NOT NULL,
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  -- Constraints
  CONSTRAINT key_account_shops_client_shop_code_unique UNIQUE (client_id, shop_code),
  CONSTRAINT key_account_shops_client_shop_name_unique UNIQUE (client_id, shop_name)
);

COMMENT ON TABLE public.key_account_shops IS 
'Individual shop/branch locations under Key Account parent clients. Each shop can have multiple delivery addresses.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_key_account_shops_client 
  ON public.key_account_shops(client_id);
CREATE INDEX IF NOT EXISTS idx_key_account_shops_city 
  ON public.key_account_shops(city);
CREATE INDEX IF NOT EXISTS idx_key_account_shops_active 
  ON public.key_account_shops(is_active) WHERE is_active = true;

-- Updated at trigger
DROP TRIGGER IF EXISTS update_key_account_shops_updated_at ON public.key_account_shops;
CREATE TRIGGER update_key_account_shops_updated_at
  BEFORE UPDATE ON public.key_account_shops
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.key_account_shops ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Key Account shops viewable by company members" ON public.key_account_shops
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.key_account_clients
      JOIN public.profiles ON profiles.company_id = key_account_clients.company_id
      WHERE key_account_shops.client_id = key_account_clients.id
      AND profiles.id = auth.uid()
    )
  );

CREATE POLICY "Key Account shops manageable by sales_admin, directors and assigned KAMs" ON public.key_account_shops
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.key_account_clients
      JOIN public.profiles ON profiles.company_id = key_account_clients.company_id
      WHERE key_account_shops.client_id = key_account_clients.id
      AND profiles.id = auth.uid()
      AND profiles.role IN ('sales_admin', 'sales_director', 'key_account_manager')
    )
  );

-- Allow warehouse users to view Key Account shops for POs assigned to their warehouse
CREATE POLICY "Key Account shops viewable by warehouse for assigned POs" ON public.key_account_shops
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.purchase_orders
      JOIN public.profiles ON profiles.company_id = purchase_orders.warehouse_company_id
      WHERE purchase_orders.key_account_shop_id = key_account_shops.id
      AND profiles.id = auth.uid()
      AND profiles.role = 'warehouse'
    )
  );

-- ============================================================================
-- 1.4 CREATE KEY_ACCOUNT_DELIVERY_ADDRESSES TABLE
-- Multiple delivery locations per shop
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.key_account_delivery_addresses (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  shop_id uuid NOT NULL REFERENCES public.key_account_shops(id) ON DELETE CASCADE,
  address_label text NOT NULL,
  full_address text NOT NULL,
  city text,
  region text,
  province text,
  zip_code text,
  contact_name text,
  contact_phone text,
  delivery_instructions text,
  receiving_hours text,
  is_default boolean DEFAULT false NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  latitude numeric(10,8),
  longitude numeric(11,8),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  -- Constraints
  CONSTRAINT key_account_addresses_shop_label_unique UNIQUE (shop_id, address_label)
);

COMMENT ON TABLE public.key_account_delivery_addresses IS 
'Delivery addresses for Key Account shops. Each shop can have multiple addresses (warehouse, storefront, receiving dock, etc.).';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_key_account_addresses_shop 
  ON public.key_account_delivery_addresses(shop_id);
CREATE INDEX IF NOT EXISTS idx_key_account_addresses_active 
  ON public.key_account_delivery_addresses(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_key_account_addresses_default 
  ON public.key_account_delivery_addresses(is_default) WHERE is_default = true;

-- Ensure only one default address per shop
CREATE OR REPLACE FUNCTION enforce_single_default_address()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.key_account_delivery_addresses 
    SET is_default = false 
    WHERE shop_id = NEW.shop_id 
    AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_enforce_single_default_address ON public.key_account_delivery_addresses;
CREATE TRIGGER trigger_enforce_single_default_address
  BEFORE INSERT OR UPDATE OF is_default ON public.key_account_delivery_addresses
  FOR EACH ROW WHEN (NEW.is_default = true)
  EXECUTE FUNCTION enforce_single_default_address();

-- Updated at trigger
DROP TRIGGER IF EXISTS update_key_account_addresses_updated_at ON public.key_account_delivery_addresses;
CREATE TRIGGER update_key_account_addresses_updated_at
  BEFORE UPDATE ON public.key_account_delivery_addresses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.key_account_delivery_addresses ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Key Account addresses viewable by company members" ON public.key_account_delivery_addresses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.key_account_shops
      JOIN public.key_account_clients ON key_account_clients.id = key_account_shops.client_id
      JOIN public.profiles ON profiles.company_id = key_account_clients.company_id
      WHERE key_account_delivery_addresses.shop_id = key_account_shops.id
      AND profiles.id = auth.uid()
    )
  );

CREATE POLICY "Key Account addresses manageable by sales_admin, directors and assigned KAMs" ON public.key_account_delivery_addresses
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.key_account_shops
      JOIN public.key_account_clients ON key_account_clients.id = key_account_shops.client_id
      JOIN public.profiles ON profiles.company_id = key_account_clients.company_id
      WHERE key_account_delivery_addresses.shop_id = key_account_shops.id
      AND profiles.id = auth.uid()
      AND profiles.role IN ('sales_admin', 'sales_director', 'key_account_manager')
    )
  );

-- Allow warehouse users to view Key Account delivery addresses for POs assigned to their warehouse
CREATE POLICY "Key Account addresses viewable by warehouse for assigned POs" ON public.key_account_delivery_addresses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.purchase_orders
      JOIN public.profiles ON profiles.company_id = purchase_orders.warehouse_company_id
      WHERE purchase_orders.key_account_address_id = key_account_delivery_addresses.id
      AND profiles.id = auth.uid()
      AND profiles.role = 'warehouse'
    )
  );

-- ============================================================================
-- 1.5 CREATE KAM_DIRECTOR_ASSIGNMENTS TABLE
-- Links Key Account Managers to their Sales Directors
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.kam_director_assignments (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  director_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kam_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  -- Constraints
  CONSTRAINT kam_director_assignments_kam_unique UNIQUE (kam_id),
  CONSTRAINT kam_director_assignments_director_kam_unique UNIQUE (director_id, kam_id)
  -- Note: Same-company validation is enforced via RLS policies and application logic
);

COMMENT ON TABLE public.kam_director_assignments IS 
'Hierarchical assignment of Key Account Managers to Sales Directors. Each KAM reports to exactly one Director.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_kam_director_director 
  ON public.kam_director_assignments(director_id);
CREATE INDEX IF NOT EXISTS idx_kam_director_kam 
  ON public.kam_director_assignments(kam_id);
CREATE INDEX IF NOT EXISTS idx_kam_director_company 
  ON public.kam_director_assignments(company_id);

-- Updated at trigger
DROP TRIGGER IF EXISTS update_kam_director_assignments_updated_at ON public.kam_director_assignments;
CREATE TRIGGER update_kam_director_assignments_updated_at
  BEFORE UPDATE ON public.kam_director_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.kam_director_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "KAM Director assignments viewable by company sales roles" ON public.kam_director_assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.company_id = kam_director_assignments.company_id
      AND profiles.role IN ('sales_admin', 'sales_director', 'key_account_manager')
    )
  );

CREATE POLICY "KAM Director assignments manageable by sales_admin" ON public.kam_director_assignments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.company_id = kam_director_assignments.company_id
      AND profiles.role = 'sales_admin'
    )
  );

-- ============================================================================
-- 1.6 CREATE KAM_CLIENT_ASSIGNMENTS TABLE
-- Links Key Account Managers to their assigned clients (1:1 per client)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.kam_client_assignments (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  kam_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.key_account_clients(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at timestamp with time zone DEFAULT now(),
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  -- Constraints
  CONSTRAINT kam_client_assignments_client_unique UNIQUE (client_id),
  CONSTRAINT kam_client_assignments_kam_client_unique UNIQUE (kam_id, client_id)
  -- Note: Same-company validation is enforced via RLS policies and application logic
);

COMMENT ON TABLE public.kam_client_assignments IS 
'Assignment of Key Account parent clients to specific KAMs. Each client is assigned to exactly one KAM for accountability.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_kam_client_kam 
  ON public.kam_client_assignments(kam_id);
CREATE INDEX IF NOT EXISTS idx_kam_client_client 
  ON public.kam_client_assignments(client_id);
CREATE INDEX IF NOT EXISTS idx_kam_client_company 
  ON public.kam_client_assignments(company_id);

-- Updated at trigger
DROP TRIGGER IF EXISTS update_kam_client_assignments_updated_at ON public.kam_client_assignments;
CREATE TRIGGER update_kam_client_assignments_updated_at
  BEFORE UPDATE ON public.kam_client_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.kam_client_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "KAM Client assignments viewable by company sales roles" ON public.kam_client_assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.company_id = kam_client_assignments.company_id
      AND profiles.role IN ('sales_admin', 'sales_director', 'key_account_manager')
    )
  );

CREATE POLICY "KAM Client assignments manageable by sales_admin and directors" ON public.kam_client_assignments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.company_id = kam_client_assignments.company_id
      AND profiles.role IN ('sales_admin', 'sales_director')
    )
  );

-- ============================================================================
-- 1.7 UPDATE PURCHASE_ORDERS FOR KEY ACCOUNT WORKFLOW
-- Add Key Account specific columns
-- ============================================================================

-- Add Key Account workflow columns to purchase_orders
ALTER TABLE public.purchase_orders 
  ADD COLUMN IF NOT EXISTS company_account_type text DEFAULT 'Standard Accounts',
  ADD COLUMN IF NOT EXISTS key_account_client_id uuid REFERENCES public.key_account_clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS key_account_shop_id uuid REFERENCES public.key_account_shops(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS key_account_address_id uuid REFERENCES public.key_account_delivery_addresses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kam_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS workflow_status text DEFAULT 'kam_pending',
  ADD COLUMN IF NOT EXISTS custom_pricing_confirmed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS director_approved_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS director_approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS admin_approved_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS admin_approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dr_number text;

-- Add constraint for company_account_type
ALTER TABLE public.purchase_orders 
  DROP CONSTRAINT IF EXISTS purchase_orders_company_account_type_check;

ALTER TABLE public.purchase_orders 
  ADD CONSTRAINT purchase_orders_company_account_type_check 
  CHECK (company_account_type = ANY (ARRAY['Standard Accounts'::text, 'Key Accounts'::text]));

-- Add constraint for workflow_status
ALTER TABLE public.purchase_orders 
  DROP CONSTRAINT IF EXISTS purchase_orders_workflow_status_check;

ALTER TABLE public.purchase_orders 
  ADD CONSTRAINT purchase_orders_workflow_status_check 
  CHECK (workflow_status = ANY (ARRAY[
    'kam_pending'::text,
    'director_pending'::text,
    'admin_pending'::text,
    'approved'::text,
    'rejected'::text,
    'warehouse_reserved'::text,
    'fulfilled'::text,
    'delivered'::text
  ]));

-- Add indexes for Key Account queries
CREATE INDEX IF NOT EXISTS idx_purchase_orders_account_type 
  ON public.purchase_orders(company_account_type);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_key_account_client 
  ON public.purchase_orders(key_account_client_id) WHERE key_account_client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_workflow_status 
  ON public.purchase_orders(workflow_status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_kam 
  ON public.purchase_orders(kam_id) WHERE kam_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_dr_number 
  ON public.purchase_orders(dr_number) WHERE dr_number IS NOT NULL;

-- Update RLS policies for Key Account access
-- Note: Existing policies remain, we add Key Account specific ones

CREATE POLICY "Key Account POs viewable by assigned KAM" ON public.purchase_orders
  FOR SELECT USING (
    company_account_type = 'Key Accounts' 
    AND kam_id = auth.uid()
  );

CREATE POLICY "Key Account POs viewable by director" ON public.purchase_orders
  FOR SELECT USING (
    company_account_type = 'Key Accounts' 
    AND EXISTS (
      SELECT 1 FROM public.kam_director_assignments 
      WHERE kam_director_assignments.kam_id = purchase_orders.kam_id
      AND kam_director_assignments.director_id = auth.uid()
    )
  );

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================

SELECT 
  'Tables Created' as check_item,
  COUNT(*) as count
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'key_account_clients',
  'key_account_shops', 
  'key_account_delivery_addresses',
  'kam_director_assignments',
  'kam_client_assignments'
)

UNION ALL

SELECT 
  'Roles Added' as check_item,
  COUNT(*) as count
FROM information_schema.check_constraints
WHERE constraint_schema = 'public'
AND constraint_name = 'profiles_role_check'
AND check_clause LIKE '%sales_admin%'

UNION ALL

SELECT 
  'PO Columns Added' as check_item,
  COUNT(*) as count
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'purchase_orders'
AND column_name IN (
  'company_account_type',
  'key_account_client_id',
  'workflow_status',
  'dr_number'
);
