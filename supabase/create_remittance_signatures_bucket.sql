-- ============================================================================
-- CREATE REMITTANCE SIGNATURES STORAGE BUCKET
-- ============================================================================
-- This script creates a storage bucket for remittance signatures with proper RLS policies
-- Run this in your Supabase SQL Editor
-- ============================================================================
-- 
-- Folder Structure:
--   - {date_folder}/{user_name_folder}/signature.png
--     Example: 2025-01-15/john-doe/1767594126564.png
-- ============================================================================

-- Create the remittance-signatures bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'remittance-signatures',
  'remittance-signatures',
  false,  -- Private bucket, requires authentication
  5242880,  -- 5MB file size limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']  -- Allowed image types
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- STORAGE POLICIES
-- ============================================================================
-- Drop existing policies if they exist (to allow re-running this script)

DROP POLICY IF EXISTS "Authenticated users can upload remittance signatures" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view remittance signatures" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own remittance signatures" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own remittance signatures" ON storage.objects;

-- Policy 1: Allow authenticated users to upload remittance signatures
CREATE POLICY "Authenticated users can upload remittance signatures"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'remittance-signatures' AND
  auth.uid() IS NOT NULL -- Ensure user is authenticated
);

-- Policy 2: Allow authenticated users to view remittance signatures
-- (Agents, leaders, managers, and admins need to view signatures for remittances)
CREATE POLICY "Authenticated users can view remittance signatures"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'remittance-signatures' AND
  auth.uid() IS NOT NULL -- Ensure user is authenticated
);

-- Policy 3: Allow users to update their own uploaded remittance signatures
CREATE POLICY "Users can update their own remittance signatures"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'remittance-signatures' AND
  auth.uid() IS NOT NULL AND -- Ensure user is authenticated
  owner = auth.uid() -- User is the owner of the object
)
WITH CHECK (
  bucket_id = 'remittance-signatures' AND
  auth.uid() IS NOT NULL AND
  owner = auth.uid()
);

-- Policy 4: Allow users to delete their own uploaded remittance signatures
CREATE POLICY "Users can delete their own remittance signatures"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'remittance-signatures' AND
  auth.uid() IS NOT NULL AND -- Ensure user is authenticated
  owner = auth.uid() -- User is the owner of the object
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
WHERE id = 'remittance-signatures';

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
AND policyname LIKE '%remittance signatures%';

-- ============================================================================
-- USAGE NOTES
-- ============================================================================
-- 
-- Upload path format: {date_folder}/{user_name_folder}/signature.png
-- Example: 2025-01-15/john-doe/1767594126564.png
--
-- To get the public URL (for private buckets with auth):
--   const { data } = supabase.storage.from('remittance-signatures').getPublicUrl(path)
--
-- To get a signed URL (recommended for private buckets):
--   const { data } = supabase.storage.from('remittance-signatures').createSignedUrl(path, 3600)
-- ============================================================================

