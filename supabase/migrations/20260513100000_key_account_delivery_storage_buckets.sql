-- Separate private buckets for Key Account dispatch rider photos vs warehouse signatures.
-- Object path: {warehouse_company_id}/po/{purchase_order_id}/...

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'ka-delivery-rider-photos',
    'ka-delivery-rider-photos',
    false,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
  ),
  (
    'ka-delivery-warehouse-signatures',
    'ka-delivery-warehouse-signatures',
    false,
    2097152,
    ARRAY['image/png', 'image/jpeg', 'image/webp']::text[]
  )
ON CONFLICT (id) DO NOTHING;

-- Rider photos
DROP POLICY IF EXISTS "KA rider photos: warehouse insert under own company" ON storage.objects;
CREATE POLICY "KA rider photos: warehouse insert under own company"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ka-delivery-rider-photos'
    AND public.is_warehouse()
    AND (storage.foldername(name))[1] = public.get_auth_company_id()::text
  );

DROP POLICY IF EXISTS "KA rider photos: warehouse read own company prefix" ON storage.objects;
CREATE POLICY "KA rider photos: warehouse read own company prefix"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'ka-delivery-rider-photos'
    AND public.is_warehouse()
    AND (storage.foldername(name))[1] = public.get_auth_company_id()::text
  );

-- Warehouse signatures
DROP POLICY IF EXISTS "KA wh signatures: warehouse insert under own company" ON storage.objects;
CREATE POLICY "KA wh signatures: warehouse insert under own company"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ka-delivery-warehouse-signatures'
    AND public.is_warehouse()
    AND (storage.foldername(name))[1] = public.get_auth_company_id()::text
  );

DROP POLICY IF EXISTS "KA wh signatures: warehouse read own company prefix" ON storage.objects;
CREATE POLICY "KA wh signatures: warehouse read own company prefix"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'ka-delivery-warehouse-signatures'
    AND public.is_warehouse()
    AND (storage.foldername(name))[1] = public.get_auth_company_id()::text
  );
