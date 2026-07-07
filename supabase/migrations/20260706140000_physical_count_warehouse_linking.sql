-- Physical count: resolve client tenant companies to linked warehouse inventory company.

-- ---------------------------------------------------------------------------
-- 1) Internal resolution (no auth — used by SECURITY DEFINER callers)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_inventory_company_id_for_tenant(p_tenant_company_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (
      SELECT wp.company_id
      FROM public.warehouse_company_assignments wca
      JOIN public.profiles wp ON wp.id = wca.warehouse_user_id
      WHERE wca.client_company_id = p_tenant_company_id
      LIMIT 1
    ),
    p_tenant_company_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.resolve_inventory_company_id_for_tenant(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.tenant_has_warehouse_link(p_tenant_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.warehouse_company_assignments wca
    WHERE wca.client_company_id = p_tenant_company_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.tenant_has_warehouse_link(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) Auth gate for tenant-scoped inventory access
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_access_tenant_for_inventory(p_tenant_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_tenant_company_id IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_system_administrator() THEN
    RETURN true;
  END IF;

  IF public.is_executive()
     AND p_tenant_company_id = ANY(public.get_my_executive_company_ids()) THEN
    RETURN true;
  END IF;

  IF p_tenant_company_id = public.get_auth_company_id() THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_access_tenant_for_inventory(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_inventory_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.resolve_inventory_company_id_for_tenant(public.get_auth_company_id());
$$;

GRANT EXECUTE ON FUNCTION public.get_my_inventory_company_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_executive_inventory_company_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    ARRAY_AGG(DISTINCT public.resolve_inventory_company_id_for_tenant(eca.company_id)),
    ARRAY[]::uuid[]
  )
  FROM public.executive_company_assignments eca
  WHERE eca.executive_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_executive_inventory_company_ids() TO authenticated;

-- Refactor existing PO helper to use shared resolver
CREATE OR REPLACE FUNCTION public.get_linked_warehouse_company_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.resolve_inventory_company_id_for_tenant(public.get_auth_company_id());
$$;

GRANT EXECUTE ON FUNCTION public.get_linked_warehouse_company_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_inventory_company_id_for_tenant(p_tenant_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.can_access_tenant_for_inventory(p_tenant_company_id) THEN
    RETURN NULL;
  END IF;

  RETURN public.resolve_inventory_company_id_for_tenant(p_tenant_company_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_inventory_company_id_for_tenant(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_physical_count_tenant_context(p_tenant_company_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inventory uuid;
  v_has_link boolean;
BEGIN
  IF NOT public.can_access_tenant_for_inventory(p_tenant_company_id) THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;

  v_has_link := public.tenant_has_warehouse_link(p_tenant_company_id);
  v_inventory := public.resolve_inventory_company_id_for_tenant(p_tenant_company_id);

  RETURN json_build_object(
    'success', true,
    'inventory_company_id', v_inventory,
    'has_warehouse_link', v_has_link
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_physical_count_tenant_context(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_warehouse_locations_for_tenant(p_tenant_company_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  is_main boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inventory uuid;
BEGIN
  IF NOT public.can_access_tenant_for_inventory(p_tenant_company_id) THEN
    RETURN;
  END IF;

  v_inventory := public.resolve_inventory_company_id_for_tenant(p_tenant_company_id);

  RETURN QUERY
  SELECT wl.id, wl.name, wl.is_main
  FROM public.warehouse_locations wl
  WHERE wl.company_id = v_inventory
  ORDER BY wl.is_main DESC, wl.name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_warehouse_locations_for_tenant(uuid) TO authenticated;

-- Delegate existing RPC to tenant-aware version
CREATE OR REPLACE FUNCTION public.get_linked_warehouse_locations()
RETURNS TABLE (
  id uuid,
  name text,
  is_main boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT * FROM public.get_warehouse_locations_for_tenant(public.get_auth_company_id());
$$;

GRANT EXECUTE ON FUNCTION public.get_linked_warehouse_locations() TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Fix physical count auth helpers (hub company IDs)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_submit_physical_count(p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF public.is_system_administrator() THEN
    RETURN true;
  END IF;

  IF public.is_accounting()
     AND p_company_id = public.get_my_inventory_company_id() THEN
    RETURN true;
  END IF;

  IF public.is_executive()
     AND p_company_id = ANY(public.get_executive_inventory_company_ids()) THEN
    RETURN true;
  END IF;

  IF public.is_warehouse()
     AND p_company_id = public.get_auth_company_id()
     AND (
       public.is_main_warehouse_user(v_actor)
       OR EXISTS (
         SELECT 1 FROM public.warehouse_location_users wlu
         WHERE wlu.user_id = v_actor
           AND wlu.location_id IN (
             SELECT wl.id FROM public.warehouse_locations wl
             WHERE wl.company_id = p_company_id
           )
       )
     ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_view_physical_count(p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.can_submit_physical_count(p_company_id) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'finance'
  ) AND p_company_id = public.get_my_inventory_company_id() THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) RLS — use hub inventory company IDs
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Physical count sessions: finance accounting select company"
  ON public.physical_count_sessions;
CREATE POLICY "Physical count sessions: finance accounting select company"
  ON public.physical_count_sessions FOR SELECT
  USING (
    (public.is_accounting() OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'finance'
    ))
    AND company_id = public.get_my_inventory_company_id()
  );

DROP POLICY IF EXISTS "Physical count sessions: executive select assigned"
  ON public.physical_count_sessions;
CREATE POLICY "Physical count sessions: executive select assigned"
  ON public.physical_count_sessions FOR SELECT
  USING (
    public.is_executive()
    AND company_id = ANY(public.get_executive_inventory_company_ids())
  );

DROP POLICY IF EXISTS "Physical count lines: finance accounting select company"
  ON public.physical_count_lines;
CREATE POLICY "Physical count lines: finance accounting select company"
  ON public.physical_count_lines FOR SELECT
  USING (
    (public.is_accounting() OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'finance'
    ))
    AND EXISTS (
      SELECT 1 FROM public.physical_count_sessions pcs
      WHERE pcs.id = physical_count_lines.session_id
        AND pcs.company_id = public.get_my_inventory_company_id()
    )
  );

DROP POLICY IF EXISTS "Physical count lines: executive select assigned"
  ON public.physical_count_lines;
CREATE POLICY "Physical count lines: executive select assigned"
  ON public.physical_count_lines FOR SELECT
  USING (
    public.is_executive()
    AND EXISTS (
      SELECT 1 FROM public.physical_count_sessions pcs
      WHERE pcs.id = physical_count_lines.session_id
        AND pcs.company_id = ANY(public.get_executive_inventory_company_ids())
    )
  );

DROP POLICY IF EXISTS "Warehouse locations: accounting select own company"
  ON public.warehouse_locations;
CREATE POLICY "Warehouse locations: accounting select own company"
  ON public.warehouse_locations FOR SELECT
  USING (
    public.is_accounting()
    AND company_id = public.get_my_inventory_company_id()
  );

DROP POLICY IF EXISTS "Warehouse locations: executive select assigned"
  ON public.warehouse_locations;
CREATE POLICY "Warehouse locations: executive select assigned"
  ON public.warehouse_locations FOR SELECT
  USING (
    public.is_executive()
    AND company_id = ANY(public.get_executive_inventory_company_ids())
  );

DROP POLICY IF EXISTS "Warehouse locations: finance select own company"
  ON public.warehouse_locations;
CREATE POLICY "Warehouse locations: finance select own company"
  ON public.warehouse_locations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'finance'
    )
    AND company_id = public.get_my_inventory_company_id()
  );

DROP POLICY IF EXISTS "Inventory batches: accounting select own company"
  ON public.inventory_batches;
CREATE POLICY "Inventory batches: accounting select own company"
  ON public.inventory_batches FOR SELECT
  USING (
    public.is_accounting()
    AND company_id = public.get_my_inventory_company_id()
  );

DROP POLICY IF EXISTS "Inventory batches: executive select assigned"
  ON public.inventory_batches;
CREATE POLICY "Inventory batches: executive select assigned"
  ON public.inventory_batches FOR SELECT
  USING (
    public.is_executive()
    AND company_id = ANY(public.get_executive_inventory_company_ids())
  );

DROP POLICY IF EXISTS "Inventory batches: finance select own company"
  ON public.inventory_batches;
CREATE POLICY "Inventory batches: finance select own company"
  ON public.inventory_batches FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'finance'
    )
    AND company_id = public.get_my_inventory_company_id()
  );

DROP POLICY IF EXISTS "Inventory batch lots: accounting select own company"
  ON public.inventory_batch_lots;
CREATE POLICY "Inventory batch lots: accounting select own company"
  ON public.inventory_batch_lots FOR SELECT
  USING (
    public.is_accounting()
    AND company_id = public.get_my_inventory_company_id()
  );

DROP POLICY IF EXISTS "Inventory batch lots: executive select assigned"
  ON public.inventory_batch_lots;
CREATE POLICY "Inventory batch lots: executive select assigned"
  ON public.inventory_batch_lots FOR SELECT
  USING (
    public.is_executive()
    AND company_id = ANY(public.get_executive_inventory_company_ids())
  );

DROP POLICY IF EXISTS "Inventory batch lots: finance select own company"
  ON public.inventory_batch_lots;
CREATE POLICY "Inventory batch lots: finance select own company"
  ON public.inventory_batch_lots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'finance'
    )
    AND company_id = public.get_my_inventory_company_id()
  );

-- ---------------------------------------------------------------------------
-- 5) warehouse_company_assignments — executives can read their client links
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Executives can view assignments for assigned companies"
  ON public.warehouse_company_assignments;
CREATE POLICY "Executives can view assignments for assigned companies"
  ON public.warehouse_company_assignments FOR SELECT
  USING (
    public.is_executive()
    AND client_company_id = ANY(public.get_my_executive_company_ids())
  );

-- ---------------------------------------------------------------------------
-- 6) Storage signature policies — hub company folder IDs
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Physical count: accounting upload signatures" ON storage.objects;
CREATE POLICY "Physical count: accounting upload signatures"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'warehouse-physical-count-signatures'
    AND (storage.foldername(name))[1] = public.get_my_inventory_company_id()::text
    AND public.is_accounting()
  );

DROP POLICY IF EXISTS "Physical count: executive upload signatures" ON storage.objects;
CREATE POLICY "Physical count: executive upload signatures"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'warehouse-physical-count-signatures'
    AND (storage.foldername(name))[1]::uuid = ANY(public.get_executive_inventory_company_ids())
    AND public.is_executive()
  );

DROP POLICY IF EXISTS "Warehouse physical count: view company signatures" ON storage.objects;
CREATE POLICY "Warehouse physical count: view company signatures"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'warehouse-physical-count-signatures'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
      )
      OR (
        public.is_executive()
        AND (storage.foldername(name))[1]::uuid = ANY(public.get_executive_inventory_company_ids())
      )
      OR (
        (public.is_accounting() OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.role = 'finance'
        ))
        AND (storage.foldername(name))[1] = public.get_my_inventory_company_id()::text
      )
    )
  );

COMMENT ON FUNCTION public.resolve_inventory_company_id_for_tenant(uuid) IS
  'Hub profiles.company_id for linked client, else tenant company_id.';
COMMENT ON FUNCTION public.get_physical_count_tenant_context(uuid) IS
  'Auth-gated tenant context: inventory hub company_id and whether a warehouse link exists.';
