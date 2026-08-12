import { supabase } from '@/lib/supabase';

const BUCKET = 'ka-po-payment-proofs';

export function isPaymentProofImage(file: File) {
  return file.type.startsWith('image/');
}

export function isPaymentProofPdf(file: File) {
  return file.type === 'application/pdf';
}

function paymentProofPathExtension(path: string) {
  const clean = path.split('?')[0]?.split('#')[0] || path;
  const base = clean.split('/').pop() || clean;
  return base.includes('.') ? base.split('.').pop()?.toLowerCase() || '' : '';
}

export function paymentProofPathIsImage(path: string) {
  const ext = paymentProofPathExtension(path);
  if (!ext || ext === 'bin') return true;
  return ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'bmp', 'svg'].includes(ext);
}

export function paymentProofPathIsPdf(path: string) {
  return paymentProofPathExtension(path) === 'pdf';
}

export function normalizeKeyAccountPaymentProofPath(storagePath: string) {
  const raw = storagePath.trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return raw
    .replace(/^\/+/, '')
    .replace(/^ka-po-payment-proofs\//, '');
}

export async function uploadKeyAccountPaymentProof(
  companyId: string,
  purchaseOrderId: string,
  file: File
): Promise<string> {
  if (!isPaymentProofImage(file)) {
    throw new Error('Payment proof must be an image (JPEG, PNG, WebP, or GIF).');
  }

  const mimeExt =
    file.type === 'image/jpeg'
      ? 'jpg'
      : file.type === 'image/png'
        ? 'png'
        : file.type === 'image/webp'
          ? 'webp'
          : file.type === 'image/gif'
            ? 'gif'
            : '';
  const nameExt = file.name.split('.').pop()?.toLowerCase() || '';
  const ext = (mimeExt || nameExt).replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${companyId}/${purchaseOrderId}/${crypto.randomUUID()}.${ext}`;

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
  const path = normalizeKeyAccountPaymentProofPath(storagePath);
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresInSec);
  if (!error && data?.signedUrl) return data.signedUrl;

  const downloaded = await supabase.storage.from(BUCKET).download(path);
  if (downloaded.error || !downloaded.data) {
    throw error || downloaded.error || new Error('Proof could not be loaded.');
  }
  return URL.createObjectURL(downloaded.data);
}
