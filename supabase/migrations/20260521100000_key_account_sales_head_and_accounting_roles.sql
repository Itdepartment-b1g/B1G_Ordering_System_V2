-- Key Account: sales_head (company bootstrap / sales lead) and key_account_accounting (view-only)

-- ---------------------------------------------------------------------------
-- 1) Profile roles
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_role_check CHECK (
  role = ANY (ARRAY[
    'system_administrator'::text,
    'super_admin'::text,
    'admin'::text,
    'finance'::text,
    'accounting'::text,
    'manager'::text,
    'team_leader'::text,
    'mobile_sales'::text,
    'executive'::text,
    'warehouse'::text,
    'sales_admin'::text,
    'sales_head'::text,
    'sales_director'::text,
    'key_account_manager'::text,
    'key_account_accounting'::text
  ])
);

COMMENT ON CONSTRAINT profiles_role_check ON public.profiles IS
  'Includes Key Account roles: sales_head (bootstrap lead), sales_admin (warehouse release), key_account_accounting (view-only).';

-- ---------------------------------------------------------------------------
-- 2) Role helpers (used in policies / functions)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.key_account_role_is_sales_lead(p_role text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT p_role = ANY (ARRAY['sales_admin'::text, 'sales_head'::text]);
$$;

CREATE OR REPLACE FUNCTION public.key_account_role_is_sales_admin(p_role text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT p_role = 'sales_admin'::text;
$$;

CREATE OR REPLACE FUNCTION public.key_account_role_is_accounting(p_role text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT p_role = 'key_account_accounting'::text;
$$;

CREATE OR REPLACE FUNCTION public.key_account_role_can_view_company_po(p_role text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT p_role = ANY (ARRAY[
    'sales_admin'::text,
    'sales_head'::text,
    'key_account_accounting'::text
  ]);
$$;

COMMENT ON FUNCTION public.key_account_role_is_sales_lead(text) IS
  'True for sales_admin and sales_head (Key Account company leads).';
COMMENT ON FUNCTION public.key_account_role_can_view_company_po(text) IS
  'True for roles that may SELECT all Key Account POs in their company.';

GRANT EXECUTE ON FUNCTION public.key_account_role_is_sales_lead(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.key_account_role_is_sales_admin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.key_account_role_is_accounting(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.key_account_role_can_view_company_po(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) purchase_orders: company-wide view + sales lead update
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Key Account POs viewable by sales_admin" ON public.purchase_orders;
CREATE POLICY "Key Account POs viewable by sales_admin" ON public.purchase_orders
  FOR SELECT USING (
    company_account_type = 'Key Accounts'
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND public.key_account_role_can_view_company_po(p.role)
        AND p.company_id = purchase_orders.company_id
    )
  );

DROP POLICY IF EXISTS "Key Account POs updatable by sales_admin" ON public.purchase_orders;
CREATE POLICY "Key Account POs updatable by sales_admin" ON public.purchase_orders
  FOR UPDATE USING (
    company_account_type = 'Key Accounts'
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND public.key_account_role_is_sales_lead(p.role)
        AND p.company_id = purchase_orders.company_id
    )
  )
  WITH CHECK (
    company_account_type = 'Key Accounts'
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND public.key_account_role_is_sales_lead(p.role)
        AND p.company_id = purchase_orders.company_id
    )
  );

-- ---------------------------------------------------------------------------
-- 4) key_account_clients / shops / addresses — sales lead manage
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Key Account clients manageable by sales_admin and directors" ON public.key_account_clients;
CREATE POLICY "Key Account clients manageable by sales_admin and directors" ON public.key_account_clients
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.company_id = key_account_clients.company_id
        AND profiles.role = ANY (ARRAY['sales_admin'::text, 'sales_head'::text, 'sales_director'::text])
    )
  );

DROP POLICY IF EXISTS "Key Account shops manageable by sales_admin, directors and assigned KAMs" ON public.key_account_shops;
CREATE POLICY "Key Account shops manageable by sales_admin, directors and assigned KAMs" ON public.key_account_shops
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.key_account_clients
      JOIN public.profiles ON profiles.company_id = key_account_clients.company_id
      WHERE key_account_shops.client_id = key_account_clients.id
        AND profiles.id = auth.uid()
        AND profiles.role = ANY (ARRAY[
          'sales_admin'::text,
          'sales_head'::text,
          'sales_director'::text,
          'key_account_manager'::text
        ])
    )
  );

DROP POLICY IF EXISTS "Key Account addresses manageable by sales_admin, directors and assigned KAMs" ON public.key_account_delivery_addresses;
CREATE POLICY "Key Account addresses manageable by sales_admin, directors and assigned KAMs" ON public.key_account_delivery_addresses
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.key_account_shops
      JOIN public.key_account_clients ON key_account_clients.id = key_account_shops.client_id
      JOIN public.profiles ON profiles.company_id = key_account_clients.company_id
      WHERE key_account_delivery_addresses.shop_id = key_account_shops.id
        AND profiles.id = auth.uid()
        AND profiles.role = ANY (ARRAY[
          'sales_admin'::text,
          'sales_head'::text,
          'sales_director'::text,
          'key_account_manager'::text
        ])
    )
  );

-- ---------------------------------------------------------------------------
-- 5) KAM assignments — sales lead manages directors
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "KAM Director assignments viewable by company sales roles" ON public.kam_director_assignments;
CREATE POLICY "KAM Director assignments viewable by company sales roles" ON public.kam_director_assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.company_id = kam_director_assignments.company_id
        AND profiles.role = ANY (ARRAY[
          'sales_admin'::text,
          'sales_head'::text,
          'sales_director'::text,
          'key_account_manager'::text,
          'key_account_accounting'::text
        ])
    )
  );

DROP POLICY IF EXISTS "KAM Director assignments manageable by sales_admin" ON public.kam_director_assignments;
CREATE POLICY "KAM Director assignments manageable by sales_admin" ON public.kam_director_assignments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.company_id = kam_director_assignments.company_id
        AND public.key_account_role_is_sales_lead(profiles.role)
    )
  );

DROP POLICY IF EXISTS "KAM Client assignments viewable by company sales roles" ON public.kam_client_assignments;
CREATE POLICY "KAM Client assignments viewable by company sales roles" ON public.kam_client_assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.company_id = kam_client_assignments.company_id
        AND profiles.role = ANY (ARRAY[
          'sales_admin'::text,
          'sales_head'::text,
          'sales_director'::text,
          'key_account_manager'::text,
          'key_account_accounting'::text
        ])
    )
  );

DROP POLICY IF EXISTS "KAM Client assignments manageable by sales_admin and directors" ON public.kam_client_assignments;
CREATE POLICY "KAM Client assignments manageable by sales_admin and directors" ON public.kam_client_assignments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.company_id = kam_client_assignments.company_id
        AND profiles.role = ANY (ARRAY['sales_admin'::text, 'sales_head'::text, 'sales_director'::text])
    )
  );

-- ---------------------------------------------------------------------------
-- 6) Hub catalog (sales_head; accounting read-only for PO detail context)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Brands: tenant select linked hub" ON public.brands;
CREATE POLICY "Brands: tenant select linked hub"
  ON public.brands FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = ANY (ARRAY[
          'super_admin'::text, 'admin'::text,
          'sales_admin'::text, 'sales_head'::text,
          'sales_director'::text, 'key_account_manager'::text,
          'key_account_accounting'::text
        ])
    )
    AND public.get_linked_warehouse_company_id() IS NOT NULL
    AND brands.company_id = public.get_linked_warehouse_company_id()
  );

DROP POLICY IF EXISTS "Variants: tenant select linked hub" ON public.variants;
CREATE POLICY "Variants: tenant select linked hub"
  ON public.variants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = ANY (ARRAY[
          'super_admin'::text, 'admin'::text,
          'sales_admin'::text, 'sales_head'::text,
          'sales_director'::text, 'key_account_manager'::text,
          'key_account_accounting'::text
        ])
    )
    AND public.get_linked_warehouse_company_id() IS NOT NULL
    AND variants.company_id = public.get_linked_warehouse_company_id()
  );

DROP POLICY IF EXISTS "Variant types: tenant select linked hub" ON public.variant_types;
CREATE POLICY "Variant types: tenant select linked hub"
  ON public.variant_types FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = ANY (ARRAY[
          'super_admin'::text, 'admin'::text,
          'sales_admin'::text, 'sales_head'::text,
          'sales_director'::text, 'key_account_manager'::text,
          'key_account_accounting'::text
        ])
    )
    AND public.get_linked_warehouse_company_id() IS NOT NULL
    AND variant_types.company_id = public.get_linked_warehouse_company_id()
  );

DROP POLICY IF EXISTS "Tenant can view linked hub main inventory" ON public.main_inventory;
CREATE POLICY "Tenant can view linked hub main inventory"
  ON public.main_inventory FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = ANY (ARRAY[
          'super_admin'::text, 'admin'::text, 'manager'::text,
          'team_leader'::text, 'mobile_sales'::text,
          'sales_admin'::text, 'sales_head'::text,
          'sales_director'::text, 'key_account_manager'::text,
          'key_account_accounting'::text
        ])
    )
    AND public.get_linked_warehouse_company_id() IS NOT NULL
    AND main_inventory.company_id = public.get_linked_warehouse_company_id()
  );

DROP POLICY IF EXISTS "Tenant can view linked hub location inventory" ON public.warehouse_location_inventory;
CREATE POLICY "Tenant can view linked hub location inventory"
  ON public.warehouse_location_inventory FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = ANY (ARRAY[
          'super_admin'::text, 'admin'::text, 'manager'::text,
          'team_leader'::text, 'mobile_sales'::text,
          'sales_admin'::text, 'sales_head'::text,
          'sales_director'::text, 'key_account_manager'::text,
          'key_account_accounting'::text
        ])
    )
    AND public.get_linked_warehouse_company_id() IS NOT NULL
    AND warehouse_location_inventory.company_id = public.get_linked_warehouse_company_id()
  );

CREATE OR REPLACE FUNCTION public.key_account_role_can_view_delivery_creator_profile(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.purchase_order_deliveries pod
    INNER JOIN public.purchase_orders po ON po.id = pod.purchase_order_id
    WHERE pod.created_by = p_profile_id
      AND po.company_account_type = 'Key Accounts'
      AND po.company_id = pod.company_id
      AND (
        po.kam_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND public.key_account_role_can_view_company_po(p.role)
            AND p.company_id = po.company_id
        )
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          INNER JOIN public.kam_director_assignments a ON a.director_id = p.id
          WHERE p.id = auth.uid()
            AND p.role = 'sales_director'
            AND a.kam_id = po.kam_id
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.generate_key_account_client_code(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_year text;
  v_next integer;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company id is required';
  END IF;
  IF p_company_id IS DISTINCT FROM public.get_auth_company_id() THEN
    RAISE EXCEPTION 'company does not match your account';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.company_id = p_company_id
      AND p.role = ANY (ARRAY[
        'sales_admin'::text, 'sales_head'::text,
        'sales_director'::text, 'key_account_manager'::text
      ])
  ) THEN
    RAISE EXCEPTION 'not authorized to generate client codes';
  END IF;
  v_year := to_char(timezone('UTC', now()), 'YYYY');
  INSERT INTO public.key_account_code_counters (scope_type, scope_id, year, last_value)
  VALUES ('client', p_company_id, v_year, 1)
  ON CONFLICT (scope_type, scope_id, year)
  DO UPDATE SET last_value = public.key_account_code_counters.last_value + 1
  RETURNING last_value INTO v_next;
  RETURN 'CL-' || v_year || '-' || lpad(v_next::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_key_account_shop_code(p_client_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company_id uuid;
  v_year text;
  v_next integer;
BEGIN
  IF p_client_id IS NULL THEN
    RAISE EXCEPTION 'client id is required';
  END IF;
  SELECT kac.company_id INTO v_company_id
  FROM public.key_account_clients kac
  WHERE kac.id = p_client_id;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'client not found';
  END IF;
  IF v_company_id IS DISTINCT FROM public.get_auth_company_id() THEN
    RAISE EXCEPTION 'client does not belong to your company';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.company_id = v_company_id
      AND p.role = ANY (ARRAY[
        'sales_admin'::text, 'sales_head'::text,
        'sales_director'::text, 'key_account_manager'::text
      ])
  ) THEN
    RAISE EXCEPTION 'not authorized to generate shop codes';
  END IF;
  v_year := to_char(timezone('UTC', now()), 'YYYY');
  INSERT INTO public.key_account_code_counters (scope_type, scope_id, year, last_value)
  VALUES ('shop', p_client_id, v_year, 1)
  ON CONFLICT (scope_type, scope_id, year)
  DO UPDATE SET last_value = public.key_account_code_counters.last_value + 1
  RETURNING last_value INTO v_next;
  RETURN 'SH-' || v_year || '-' || lpad(v_next::text, 4, '0');
END;
$$;

-- ---------------------------------------------------------------------------
-- 7) PO deliveries, payments, warehouse locations, delivery profiles
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Key Account roles can view PO deliveries for their company" ON public.purchase_order_deliveries;
CREATE POLICY "Key Account roles can view PO deliveries for their company"
  ON public.purchase_order_deliveries
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.purchase_orders po
      WHERE po.id = purchase_order_deliveries.purchase_order_id
        AND po.company_account_type = 'Key Accounts'
        AND po.company_id = purchase_order_deliveries.company_id
        AND (
          po.kam_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND public.key_account_role_can_view_company_po(p.role)
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

DROP POLICY IF EXISTS "KA PO payments: tenant select" ON public.purchase_order_key_account_payments;
CREATE POLICY "KA PO payments: tenant select"
  ON public.purchase_order_key_account_payments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.purchase_orders po
      WHERE po.id = purchase_order_key_account_payments.purchase_order_id
        AND po.company_account_type = 'Key Accounts'
        AND po.company_id = purchase_order_key_account_payments.company_id
        AND (
          (po.created_by = auth.uid() AND po.kam_id = auth.uid())
          OR EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND public.key_account_role_can_view_company_po(p.role)
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

-- warehouse_locations visibility — see 20260521200000_fix_warehouse_key_account_rls_performance.sql
-- (warehouse fast path + bounded KA scan; applied in follow-up migration if 211 ran first)

COMMENT ON FUNCTION public.key_account_po_warehouse_location_visible(uuid) IS
  'RLS helper: Key Account roles may read a warehouse_locations row referenced by their visible POs.';

GRANT EXECUTE ON FUNCTION public.key_account_po_warehouse_location_visible(uuid) TO authenticated;

-- warehouse_locations policy — see 20260521200000_fix_warehouse_key_account_rls_performance.sql

-- Payment proof storage: read for accounting
DROP POLICY IF EXISTS "KA PO payment proofs: tenant read" ON storage.objects;
CREATE POLICY "KA PO payment proofs: tenant read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'ka-po-payment-proofs'
    AND (storage.foldername(name))[1] = public.get_auth_company_id()::text
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = public.get_auth_company_id()
        AND p.role = ANY (ARRAY[
          'key_account_manager'::text,
          'sales_director'::text,
          'sales_admin'::text,
          'sales_head'::text,
          'key_account_accounting'::text
        ])
    )
  );

DROP POLICY IF EXISTS "KA PO payment proofs: tenant insert" ON storage.objects;
CREATE POLICY "KA PO payment proofs: tenant insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ka-po-payment-proofs'
    AND (storage.foldername(name))[1] = public.get_auth_company_id()::text
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = public.get_auth_company_id()
        AND p.role = ANY (ARRAY[
          'key_account_manager'::text,
          'sales_director'::text,
          'sales_admin'::text,
          'sales_head'::text
        ])
    )
  );
