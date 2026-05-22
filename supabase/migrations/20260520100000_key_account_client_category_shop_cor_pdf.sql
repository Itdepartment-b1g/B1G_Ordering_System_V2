-- Key Account: client business category + shop COR PDF (certificate of registration)
--di pa naiimplement sa sql editor - naimplement na 05/21
ALTER TABLE public.key_account_clients
  ADD COLUMN IF NOT EXISTS client_category text;

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
      'retail'
    )
  );

COMMENT ON COLUMN public.key_account_clients.client_category IS
  'Business / channel category for the key account parent client.';

ALTER TABLE public.key_account_shops
  ADD COLUMN IF NOT EXISTS cor_pdf_path text;

COMMENT ON COLUMN public.key_account_shops.cor_pdf_path IS
  'Storage object path in ka-shop-cor bucket for COR PDF (Certificate of Registration).';

-- Private bucket: PDF COR documents for key account shops
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ka-shop-cor',
  'ka-shop-cor',
  false,
  10485760, -- 10MB
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "KA shop COR: users upload own prefix" ON storage.objects;
CREATE POLICY "KA shop COR: users upload own prefix"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ka-shop-cor'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "KA shop COR: company can read" ON storage.objects;
CREATE POLICY "KA shop COR: company can read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'ka-shop-cor'
    AND EXISTS (
      SELECT 1 FROM public.profiles p1, public.profiles p2
      WHERE p1.id = auth.uid()
        AND p2.id::text = (storage.foldername(name))[1]
        AND p1.company_id = p2.company_id
    )
  );

DROP POLICY IF EXISTS "KA shop COR: users update own prefix" ON storage.objects;
CREATE POLICY "KA shop COR: users update own prefix"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'ka-shop-cor'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'ka-shop-cor'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "KA shop COR: users delete own prefix" ON storage.objects;
CREATE POLICY "KA shop COR: users delete own prefix"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'ka-shop-cor'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "KA shop COR: admins manage company" ON storage.objects;
CREATE POLICY "KA shop COR: admins manage company"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'ka-shop-cor'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin', 'system_administrator')
    )
  )
  WITH CHECK (
    bucket_id = 'ka-shop-cor'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin', 'system_administrator')
    )
  );
