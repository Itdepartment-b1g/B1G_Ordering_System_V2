-- Fix helper function for warehouse transfer PO access:
-- warehouse_company_assignments no longer has warehouse_company_id (dropped in 20260402120000_*),
-- so we must determine the hub company via the assigned warehouse user's profiles.company_id.

CREATE OR REPLACE FUNCTION public.warehouse_can_access_transfer_po(p_po_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  po_record RECORD;
  v_user_location uuid;
BEGIN
  SELECT id, company_id, fulfillment_type, warehouse_company_id, warehouse_location_id
  INTO po_record
  FROM public.purchase_orders
  WHERE id = p_po_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF po_record.fulfillment_type IS DISTINCT FROM 'warehouse_transfer' THEN
    RETURN false;
  END IF;

  -- Warehouse company must match the current warehouse user's company
  IF po_record.warehouse_company_id IS DISTINCT FROM public.get_auth_company_id() THEN
    RETURN false;
  END IF;

  -- Must be assigned to fulfill transfers for this client company.
  -- Assignments are stored as (warehouse_user_id <-> client_company_id); hub company is profiles.company_id.
  IF NOT EXISTS (
    SELECT 1
    FROM public.warehouse_company_assignments wca
    JOIN public.profiles wp ON wp.id = wca.warehouse_user_id
    WHERE wca.client_company_id = po_record.company_id
      AND wp.company_id = po_record.warehouse_company_id
  ) THEN
    RETURN false;
  END IF;

  -- Main warehouse user: can see all transfer POs for their company
  IF public.is_main_warehouse_user(p_user_id) THEN
    RETURN true;
  END IF;

  v_user_location := public.get_warehouse_location_id(p_user_id);
  IF v_user_location IS NULL THEN
    RETURN false;
  END IF;

  -- Legacy single-location PO: header location match
  IF po_record.warehouse_location_id IS NOT NULL AND po_record.warehouse_location_id = v_user_location THEN
    RETURN true;
  END IF;

  -- Multi-location PO: any item for user's location
  IF EXISTS (
    SELECT 1
    FROM public.purchase_order_items poi
    WHERE poi.purchase_order_id = p_po_id
      AND poi.warehouse_location_id = v_user_location
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

