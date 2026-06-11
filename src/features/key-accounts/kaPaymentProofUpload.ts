import { supabase } from '@/lib/supabase';

const BUCKET = 'ka-po-payment-proofs';

export async function uploadKeyAccountPaymentProof(
  companyId: string,
  purchaseOrderId: string,
  file: File
): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
  const safeExt = ext.replace(/[^a-z0-9]/g, '') || 'bin';
  const path = `${companyId}/${purchaseOrderId}/${crypto.randomUUID()}.${safeExt}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  return path;
}

export async function getKeyAccountPaymentProofSignedUrl(
  storagePath: string,
  expiresInSec = 3600
): Promise<string | null> {
  if (!storagePath) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, expiresInSec);
  if (error) throw error;
  return data?.signedUrl ?? null;
}
