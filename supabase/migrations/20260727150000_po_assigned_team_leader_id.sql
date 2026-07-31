-- Assign a team leader to receive warehouse-transfer POs at the requesting company.

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS assigned_team_leader_id uuid NULL
    CONSTRAINT purchase_orders_assigned_team_leader_id_fkey
    REFERENCES public.profiles (id)
    ON DELETE SET NULL;

COMMENT ON COLUMN public.purchase_orders.assigned_team_leader_id IS
  'Team leader at the requesting company who receives dispatched stock for warehouse_transfer POs.';

CREATE INDEX IF NOT EXISTS idx_purchase_orders_assigned_team_leader_id
  ON public.purchase_orders (assigned_team_leader_id)
  WHERE assigned_team_leader_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.purchase_orders_validate_assigned_team_leader_fn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  me_company uuid;
BEGIN
  IF NEW.assigned_team_leader_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.company_id INTO me_company
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles tl
    WHERE tl.id = NEW.assigned_team_leader_id
      AND tl.role = 'team_leader'
      AND tl.company_id IS NOT DISTINCT FROM NEW.company_id
  ) THEN
    RAISE EXCEPTION 'assigned_team_leader_id must reference a team_leader in the PO company'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_orders_validate_assigned_team_leader ON public.purchase_orders;
CREATE TRIGGER trg_purchase_orders_validate_assigned_team_leader
  BEFORE INSERT OR UPDATE OF assigned_team_leader_id
  ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.purchase_orders_validate_assigned_team_leader_fn();

DROP POLICY IF EXISTS "Team leaders can view assigned transfer POs" ON public.purchase_orders;
CREATE POLICY "Team leaders can view assigned transfer POs"
  ON public.purchase_orders FOR SELECT
  USING (
    assigned_team_leader_id = auth.uid()
    AND fulfillment_type = 'warehouse_transfer'
  );
