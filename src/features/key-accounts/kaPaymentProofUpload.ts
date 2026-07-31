import { supabase } from '@/lib/supabase';

const BUCKET = 'ka-po-payment-proofs';

export function isPaymentProofImage(file: File) {
  return file.type.startsWith('image/');
}

export function isPaymentProofPdf(file: File) {
  return file.type === 'application/pdf';
}

export function paymentProofPathIsImage(path: string) {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  return ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext);
}

export function paymentProofPathIsPdf(path: string) {
  return path.split('.').pop()?.toLowerCase() === 'pdf';
}

export async function uploadKeyAccountPaymentProof(
  companyId: string,
  purchaseOrderId: string,
  file: File
): Promise<string> {
  if (!isPaymentProofImage(file)) {
    throw new Error('Payment proof must be an image (JPEG, PNG, WebP, or GIF).');
  }

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
