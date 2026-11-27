import { supabase } from '@/lib/supabase';

const BUCKET = 'client-order-return-proofs';
const SIGNED_URL_TTL_SECONDS = 31536000;

function dataUrlToBlob(dataUrl: string, fallbackMime = 'image/png'): Blob {
  const [header, base64Data] = dataUrl.split(',');
  if (!base64Data) throw new Error('Invalid image data');
  const mimeMatch = header?.match(/data:([^;]+);/);
  const mime = mimeMatch?.[1] || fallbackMime;
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

function extensionForMime(mime: string): string {
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  return 'png';
}

function extensionForFileName(fileName?: string): string | null {
  const ext = fileName?.split('.').pop()?.toLowerCase();
  if (!ext) return null;
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) {
    return ext === 'jpeg' ? 'jpg' : ext;
  }
  return null;
}

async function uploadBlob(
  path: string,
  blob: Blob,
  contentType: string
): Promise<{ url: string; path: string }> {
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data: urlData, error: urlError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (urlError || !urlData?.signedUrl) {
    throw new Error('Failed to generate signed URL for return proof');
  }

  return { url: urlData.signedUrl, path };
}

export async function uploadClientOrderReturnSignature({
  signatureDataUrl,
  companyId,
}: {
  signatureDataUrl: string;
  companyId: string;
}): Promise<{ url: string; path: string }> {
  const blob = dataUrlToBlob(signatureDataUrl, 'image/png');
  const path = `${companyId}/${Date.now()}_signature.png`;
  return uploadBlob(path, blob, 'image/png');
}

export async function uploadClientOrderReturnProof({
  file,
  dataUrl,
  companyId,
  fileName,
  kind,
}: {
  file?: File | null;
  dataUrl?: string;
  companyId: string;
  fileName?: string;
  kind: 'proof' | 'capture' | 'payout';
}): Promise<{ url: string; path: string; contentType: string }> {
  const blob = file
    ? file
    : dataUrl
      ? dataUrlToBlob(dataUrl, 'image/jpeg')
      : null;
  if (!blob) throw new Error('Proof photo is missing');

  const contentType = blob.type || 'image/jpeg';
  const ext =
    extensionForFileName(fileName || file?.name) || extensionForMime(contentType);
  const path = `${companyId}/${Date.now()}_${kind}.${ext}`;
  const uploaded = await uploadBlob(path, blob, contentType);
  return { ...uploaded, contentType };
}

export async function getClientOrderReturnProofSignedUrl(
  path: string | null | undefined
): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
