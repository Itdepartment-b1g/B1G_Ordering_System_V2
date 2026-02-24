-- Create Storage Bucket for TL Stock Request Signatures

-- Create bucket (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('tl-stock-request-signatures', 'tl-stock-request-signatures', false)
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for bucket

-- Allow team leaders to upload their own signatures
CREATE POLICY "Team leaders can upload signatures"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'tl-stock-request-signatures'
  AND (storage.foldername(name))[1] IN (
    SELECT company_id::TEXT FROM profiles WHERE id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('team_leader', 'admin', 'super_admin')
  )
);

-- Allow users to view signatures for their company's requests
CREATE POLICY "Users can view their company signatures"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'tl-stock-request-signatures'
  AND (storage.foldername(name))[1] IN (
    SELECT company_id::TEXT FROM profiles WHERE id = auth.uid()
  )
);

-- Allow admins to view all signatures in their company
CREATE POLICY "Admins can view all company signatures"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'tl-stock-request-signatures'
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'super_admin')
    AND company_id::TEXT = (storage.foldername(name))[1]
  )
);

-- Allow deletion of signatures (for admins only, in case of errors)
CREATE POLICY "Admins can delete signatures"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'tl-stock-request-signatures'
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'super_admin')
    AND company_id::TEXT = (storage.foldername(name))[1]
  )
);
