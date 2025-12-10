-- ============================================================================
-- TROUBLESHOOT CLIENT PHOTOS BUCKET
-- ============================================================================
-- Run this script to diagnose issues with the client-photos bucket
-- ============================================================================

-- 1. Check if bucket exists
SELECT 
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types,
  created_at,
  updated_at
FROM storage.buckets
WHERE id = 'client-photos';

-- If the above returns no rows, the bucket doesn't exist. Run the creation script.

-- ============================================================================

-- 2. List all storage policies for client-photos
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'storage'
AND tablename = 'objects'
ORDER BY policyname;

-- ============================================================================

-- 3. Check if there are any existing objects in the bucket
SELECT 
  id,
  name,
  bucket_id,
  owner,
  created_at,
  updated_at,
  last_accessed_at,
  metadata
FROM storage.objects
WHERE bucket_id = 'client-photos'
ORDER BY created_at DESC
LIMIT 20;

-- ============================================================================

-- 4. Check current user's permissions (run as the authenticated user)
SELECT 
  auth.uid() as current_user_id,
  (SELECT company_id FROM profiles WHERE id = auth.uid()) as user_company_id,
  (SELECT role FROM profiles WHERE id = auth.uid()) as user_role;

-- ============================================================================

-- 5. If you need to RESET the bucket (WARNING: This deletes everything!)
-- Uncomment the lines below ONLY if you want to start fresh

-- Delete all policies
-- DROP POLICY IF EXISTS "Users can upload client photos for their company" ON storage.objects;
-- DROP POLICY IF EXISTS "Users can view client photos from their company" ON storage.objects;
-- DROP POLICY IF EXISTS "Users can update their own client photos" ON storage.objects;
-- DROP POLICY IF EXISTS "Users can delete their own client photos" ON storage.objects;
-- DROP POLICY IF EXISTS "Admins can manage all client photos in their company" ON storage.objects;
-- DROP POLICY IF EXISTS "Authenticated users can upload client photos" ON storage.objects;
-- DROP POLICY IF EXISTS "Authenticated users can view client photos" ON storage.objects;
-- DROP POLICY IF EXISTS "Authenticated users can update client photos" ON storage.objects;
-- DROP POLICY IF EXISTS "Authenticated users can delete client photos" ON storage.objects;

-- Delete all objects in the bucket
-- DELETE FROM storage.objects WHERE bucket_id = 'client-photos';

-- Delete the bucket
-- DELETE FROM storage.buckets WHERE id = 'client-photos';

-- ============================================================================
-- After resetting, run one of the creation scripts again:
-- - create_client_photos_bucket.sql (with company-scoped policies)
-- - create_client_photos_bucket_simple.sql (simpler, permissive policies)
-- ============================================================================

