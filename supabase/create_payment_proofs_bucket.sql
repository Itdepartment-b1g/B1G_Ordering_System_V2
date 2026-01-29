-- ============================================================================
-- CREATE PAYMENT PROOFS STORAGE BUCKET
-- ============================================================================
-- This script creates a storage bucket for payment proofs with proper RLS policies
-- Run this in your Supabase SQL Editor
-- ============================================================================
-- 
-- Folder Structure:
--   - bank-transfer/{bank_name}/{order_number}/filename.jpg
--     Example: bank-transfer/Unionbank/ORD-2025-0001/12/15/2025_1:30pm.jpg
--   - GCASH/{client_name}/{date_time}.jpg
--   - CASH/{client_name}/{date_time}.jpg
-- ============================================================================

-- Create the payment-proofs bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-proofs',
  'payment-proofs',
  false,  -- Private bucket, requires authentication
  10485760,  -- 10MB file size limit (larger for payment proof photos)
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']  -- Allowed image types
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- STORAGE POLICIES
-- ============================================================================
-- Drop existing policies if they exist (to allow re-running this script)

DROP POLICY IF EXISTS "Authenticated users can upload payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own payment proofs" ON storage.objects;

-- Policy 1: Allow authenticated users to upload payment proofs
CREATE POLICY "Authenticated users can upload payment proofs"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'payment-proofs');

-- Policy 2: Allow authenticated users to view payment proofs
-- (Agents, leaders, managers, and admins need to view payment proofs for orders)
CREATE POLICY "Authenticated users can view payment proofs"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'payment-proofs');

-- Policy 3: Allow users to update their own uploads (optional, for retries)
CREATE POLICY "Users can update their own payment proofs"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'payment-proofs' AND 
  owner = auth.uid()
)
WITH CHECK (
  bucket_id = 'payment-proofs' AND 
  owner = auth.uid()
);

-- Policy 4: Allow users to delete their own uploads (optional)
CREATE POLICY "Users can delete their own payment proofs"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'payment-proofs' AND 
  owner = auth.uid()
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
WHERE id = 'payment-proofs';

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
AND policyname LIKE '%payment%';

-- ============================================================================
-- USAGE NOTES
-- ============================================================================
-- 
-- Upload path formats:
-- 
-- Bank Transfer:
--   bank-transfer/{bank_name}/{order_number}/{date_time}.jpg
--   Example: bank-transfer/Unionbank/ORD-2025-0001/12/15/2025_1:30pm.jpg
-- 
-- GCash:
--   GCASH/{client_name}_{company_name}/{date_time}.jpg
--   Example: GCASH/John Doe _ ABC Company/12/15/2025_1:30pm.jpg
-- 
-- Cash:
--   CASH/{client_name}_{company_name}/{date_time}.jpg
--   Example: CASH/John Doe _ ABC Company/12/15/2025_1:30pm.jpg
--
-- To get the public URL:
--   const { data } = supabase.storage.from('payment-proofs').getPublicUrl(path)
--
-- To get a signed URL (recommended for private buckets):
--   const { data } = supabase.storage.from('payment-proofs').createSignedUrl(path, 3600)
-- ============================================================================

