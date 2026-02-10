-- ============================================================================
-- CREATE STORAGE BUCKET FOR PAYMENT QR CODES
-- ============================================================================
-- This migration creates a Supabase storage bucket for payment QR code images
-- Public read access, restricted write access to super_admin and finance
-- ============================================================================

-- 1. Create storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'payment-qr-codes',
    'payment-qr-codes',
    TRUE,  -- Public bucket for read access
    5242880,  -- 5MB max file size
    ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']  -- Image types only
)
ON CONFLICT (id) DO NOTHING;

-- 2. Drop existing policies if they exist (for migration reruns)
DROP POLICY IF EXISTS "Public can view payment QR codes" ON storage.objects;
DROP POLICY IF EXISTS "Super admin and finance can upload payment QR codes" ON storage.objects;
DROP POLICY IF EXISTS "Super admin and finance can update payment QR codes" ON storage.objects;
DROP POLICY IF EXISTS "Super admin and finance can delete payment QR codes" ON storage.objects;

-- 3. Storage Policies for payment-qr-codes bucket
-- Note: storage.objects already has RLS enabled by default in Supabase

-- Policy: Allow public read access to QR codes (agents need to view them)
CREATE POLICY "Public can view payment QR codes"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'payment-qr-codes');

-- Policy: Only super_admin and finance can upload QR codes
CREATE POLICY "Super admin and finance can upload payment QR codes"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'payment-qr-codes'
        AND auth.uid() IN (
            SELECT id FROM profiles 
            WHERE role IN ('super_admin', 'finance')
        )
    );

-- Policy: Only super_admin and finance can update QR codes
CREATE POLICY "Super admin and finance can update payment QR codes"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'payment-qr-codes'
        AND auth.uid() IN (
            SELECT id FROM profiles 
            WHERE role IN ('super_admin', 'finance')
        )
    )
    WITH CHECK (
        bucket_id = 'payment-qr-codes'
        AND auth.uid() IN (
            SELECT id FROM profiles 
            WHERE role IN ('super_admin', 'finance')
        )
    );

-- Policy: Only super_admin and finance can delete QR codes
CREATE POLICY "Super admin and finance can delete payment QR codes"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'payment-qr-codes'
        AND auth.uid() IN (
            SELECT id FROM profiles 
            WHERE role IN ('super_admin', 'finance')
        )
    );

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Successfully created payment-qr-codes storage bucket with RLS policies';
END $$;
