-- ============================================================================
-- CREATE CLIENT COR STORAGE BUCKET
-- ============================================================================
-- This script creates a storage bucket for client COR (Certificate of Registration) 
-- images with proper RLS policies
-- Run this in your Supabase SQL Editor
-- ============================================================================

-- Create the client-cor bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'client-cor',
  'client-cor',
  false,  -- Private bucket, requires authentication
  10485760,  -- 10MB file size limit (COR documents may be larger)
  ARRAY['image/jpeg', 'image/jpg', 'image/png']  -- PNG and JPG only
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- STORAGE POLICIES
-- ============================================================================

-- Drop existing policies if they exist (for re-running script)
DROP POLICY IF EXISTS "Users can upload client COR for their company" ON storage.objects;
DROP POLICY IF EXISTS "Users can view client COR from their company" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own client COR" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own client COR" ON storage.objects;
DROP POLICY IF EXISTS "Admins can manage all client COR in their company" ON storage.objects;

-- Policy 1: Allow authenticated users to upload COR to their own company folder
CREATE POLICY "Users can upload client COR for their company"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'client-cor' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy 2: Allow authenticated users to view COR from their company
CREATE POLICY "Users can view client COR from their company"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'client-cor' AND
  (
    -- Users can see COR uploaded by anyone in their company
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

-- Policy 3: Allow users to update their own uploaded COR
CREATE POLICY "Users can update their own client COR"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'client-cor' AND
  (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'client-cor' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy 4: Allow users to delete their own uploaded COR
CREATE POLICY "Users can delete their own client COR"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'client-cor' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy 5: Allow admins to manage all COR in their company
CREATE POLICY "Admins can manage all client COR in their company"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'client-cor' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'super_admin', 'system_administrator')
  )
)
WITH CHECK (
  bucket_id = 'client-cor' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'super_admin', 'system_administrator')
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
WHERE id = 'client-cor';

-- Check policies
SELECT 
  policyname,
  permissive,
  roles,
  cmd,
  qual IS NOT NULL AS has_using_clause,
  with_check IS NOT NULL AS has_check_clause
FROM pg_policies
WHERE tablename = 'objects'
AND schemaname = 'storage'
AND policyname LIKE '%client COR%'
ORDER BY cmd, policyname;

-- ============================================================================
-- USAGE NOTES
-- ============================================================================
-- 
-- Upload path format: {user_id}/company_{company_id}_client_{client_id}_cor_{timestamp}.png
-- Example: 10e2ea5b-fdf8-4c94-9a37-fd68f544e0ce/company_abc123_client_xyz789_cor_1733731200000.png
--
-- The folder structure uses user_id as the first level to ensure users can only
-- upload to their own folders, then company scoping happens at the query level.
--
-- Supported formats: PNG, JPG/JPEG
-- Maximum file size: 10MB
--
-- To upload:
-- const { data, error } = await supabase.storage
--   .from('client-cor')
--   .upload(path, file)
--
-- To get a signed URL (recommended for private buckets):
-- const { data } = await supabase.storage
--   .from('client-cor')
--   .createSignedUrl(path, 3600)
-- ============================================================================
