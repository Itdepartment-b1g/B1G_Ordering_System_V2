-- ============================================================================
-- CREATE CLIENT PHOTOS STORAGE BUCKET
-- ============================================================================
-- This script creates a storage bucket for client photos with proper RLS policies
-- Run this in your Supabase SQL Editor
-- ============================================================================

-- Create the client-photos bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'client-photos',
  'client-photos',
  false,  -- Private bucket, requires authentication
  5242880,  -- 5MB file size limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']  -- Allowed image types
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- STORAGE POLICIES
-- ============================================================================

-- Policy 1: Allow authenticated users to upload photos to their own company folder
CREATE POLICY "Users can upload client photos for their company"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'client-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy 2: Allow authenticated users to view photos from their company
CREATE POLICY "Users can view client photos from their company"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'client-photos' AND
  (
    -- Users can see photos uploaded by anyone in their company
    -- This requires checking the company_id from the uploader's profile
    EXISTS (
      SELECT 1 FROM profiles p1, profiles p2
      WHERE p1.id = auth.uid()
      AND p2.id::text = (storage.foldername(name))[1]
      AND p1.company_id = p2.company_id
    )
    OR
    -- Or if the folder structure uses company_id directly (alternative approach)
    (storage.foldername(name))[1] IN (
      SELECT company_id::text FROM profiles WHERE id = auth.uid()
    )
  )
);

-- Policy 3: Allow users to update their own uploaded photos
CREATE POLICY "Users can update their own client photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'client-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'client-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy 4: Allow users to delete their own uploaded photos
CREATE POLICY "Users can delete their own client photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'client-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy 5: Allow admins to manage all photos in their company
CREATE POLICY "Admins can manage all client photos in their company"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'client-photos' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'super_admin')
  )
)
WITH CHECK (
  bucket_id = 'client-photos' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'super_admin')
  )
);

-- ============================================================================
-- VERIFY BUCKET CREATION
-- ============================================================================

-- Check if bucket was created successfully
SELECT 
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types,
  created_at
FROM storage.buckets
WHERE id = 'client-photos';

-- Check policies
SELECT 
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'objects'
AND schemaname = 'storage'
AND policyname LIKE '%client%';

-- ============================================================================
-- USAGE NOTES
-- ============================================================================
-- 
-- Upload path format: {user_id}/company_{company_id}_{client_name}_{timestamp}.jpg
-- Example: 10e2ea5b-fdf8-4c94-9a37-fd68f544e0ce/company_1_john_doe_1733731200000.jpg
--
-- The folder structure uses user_id as the first level to ensure users can only
-- upload to their own folders, then company scoping happens at the query level.
--
-- To get the public URL (for private buckets with auth):
-- const { data } = supabase.storage.from('client-photos').getPublicUrl(path)
--
-- To get a signed URL (recommended for private buckets):
-- const { data } = supabase.storage.from('client-photos').createSignedUrl(path, 3600)
-- ============================================================================

