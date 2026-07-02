-- Allow KAMs to update key account clients assigned to them.

CREATE POLICY "Key Account clients updatable by assigned KAM"
  ON public.key_account_clients
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.kam_client_assignments kca
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE kca.client_id = key_account_clients.id
        AND kca.kam_id = auth.uid()
        AND kca.company_id = key_account_clients.company_id
        AND p.role = 'key_account_manager'::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.kam_client_assignments kca
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE kca.client_id = key_account_clients.id
        AND kca.kam_id = auth.uid()
        AND kca.company_id = key_account_clients.company_id
        AND p.role = 'key_account_manager'::text
    )
  );
