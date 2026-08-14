-- Allow 'reseller' as a Key Account client category.
ALTER TABLE public.key_account_clients
  DROP CONSTRAINT IF EXISTS key_account_clients_client_category_check;

ALTER TABLE public.key_account_clients
  ADD CONSTRAINT key_account_clients_client_category_check
  CHECK (
    client_category IS NULL
    OR client_category IN (
      'distributor',
      'distri w/ multi retail',
      'distri w/ retail',
      'multi retail',
      'retail',
      'reseller'
    )
  );
