import { supabase } from '@/lib/supabase';

const BUCKET = 'sa-stock-return-proofs';

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
    .createSignedUrl(path, 31536000);

  if (urlError || !urlData?.signedUrl) {
    throw new Error('Failed to generate signed URL for return evidence');
  }

  return { url: urlData.signedUrl, path };
}

export async function uploadStandardAccountReturnSignature({
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

export async function uploadStandardAccountReturnProof({
  proofImageDataUrl,
  companyId,
  fileName,
}: {
  proofImageDataUrl: string;
  companyId: string;
  fileName?: string;
}): Promise<{ url: string; path: string }> {
  const blob = dataUrlToBlob(proofImageDataUrl, 'image/jpeg');
  const extFromName = fileName?.split('.').pop()?.toLowerCase();
  const ext =
    extFromName && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extFromName)
      ? extFromName === 'jpeg'
        ? 'jpg'
        : extFromName
      : extensionForMime(blob.type);
  const path = `${companyId}/${Date.now()}_proof.${ext}`;
  return uploadBlob(path, blob, blob.type || 'image/jpeg');
}

export async function getStandardAccountReturnEvidenceSignedUrl(
  path: string | null | undefined
): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
