-- Physical count: executives can pick any warehouse hub company (role = Warehouse).

-- Allow executives to read warehouse hub company rows for the picker.
DROP POLICY IF EXISTS "Executives can view warehouse hub companies" ON public.companies;
CREATE POLICY "Executives can view warehouse hub companies"
  ON public.companies FOR SELECT
  TO authenticated
  USING (
    public.is_executive()
    AND (
      role = 'Warehouse'
      OR company_account_type = 'Warehouse'
    )
  );

-- Executive physical count access: linked client hubs + all warehouse hub companies.
CREATE OR REPLACE FUNCTION public.get_executive_inventory_company_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(ARRAY_AGG(DISTINCT hub_id), ARRAY[]::uuid[])
  FROM (
    SELECT public.resolve_inventory_company_id_for_tenant(eca.company_id) AS hub_id
    FROM public.executive_company_assignments eca
    WHERE eca.executive_id = auth.uid()
    UNION
    SELECT c.id AS hub_id
    FROM public.companies c
    WHERE c.status = 'active'
      AND (c.role = 'Warehouse' OR c.company_account_type = 'Warehouse')
  ) hubs
  WHERE hub_id IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.get_executive_inventory_company_ids() TO authenticated;
