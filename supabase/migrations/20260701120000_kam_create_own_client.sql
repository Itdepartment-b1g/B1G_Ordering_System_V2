-- Allow Key Account Managers to create parent clients for their company.
-- A trigger auto-assigns the new client to the creating KAM.

CREATE POLICY "Key Account clients insertable by assigned KAM"
  ON public.key_account_clients
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.company_id = key_account_clients.company_id
        AND profiles.role = 'key_account_manager'::text
    )
    AND created_by = auth.uid()
  );

CREATE OR REPLACE FUNCTION public.auto_assign_kam_created_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = NEW.created_by
      AND profiles.role = 'key_account_manager'::text
      AND profiles.company_id = NEW.company_id
  ) THEN
    INSERT INTO public.kam_client_assignments (
      kam_id,
      client_id,
      company_id,
      assigned_by,
      assigned_at
    )
    VALUES (
      NEW.created_by,
      NEW.id,
      NEW.company_id,
      NEW.created_by,
      now()
    )
    ON CONFLICT (client_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.auto_assign_kam_created_client() IS
  'When a KAM creates a key_account_clients row, assign that client to them in kam_client_assignments.';

DROP TRIGGER IF EXISTS trg_auto_assign_kam_created_client ON public.key_account_clients;
CREATE TRIGGER trg_auto_assign_kam_created_client
  AFTER INSERT ON public.key_account_clients
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_kam_created_client();
