-- ============================================================================
-- CREATE CLIENT PHOTOS BUCKET (SIMPLE VERSION)
-- ============================================================================
-- This is a simpler version with more permissive policies
-- Use this if the main script causes issues
-- ============================================================================

-- Create the client-photos bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'client-photos',
  'client-photos',
  false,  -- Private bucket
  5242880,  -- 5MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- SIMPLE POLICIES - All authenticated users can manage photos
-- ============================================================================

-- Allow all authenticated users to upload
CREATE POLICY "Authenticated users can upload client photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'client-photos');

-- Allow all authenticated users to view
CREATE POLICY "Authenticated users can view client photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'client-photos');

-- Allow all authenticated users to update
CREATE POLICY "Authenticated users can update client photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'client-photos')
WITH CHECK (bucket_id = 'client-photos');

-- Allow all authenticated users to delete
CREATE POLICY "Authenticated users can delete client photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'client-photos');

-- ============================================================================
-- VERIFY
-- ============================================================================

SELECT 
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
FROM storage.buckets
WHERE id = 'client-photos';

-- ============================================================================
-- NOTES
-- ============================================================================
-- This simpler version allows any authenticated user to manage photos.
-- Company-level filtering should be handled at the application level
-- by filtering the clients table queries by company_id.
-- 
-- If you need stricter security, use the main script instead.
-- ============================================================================

