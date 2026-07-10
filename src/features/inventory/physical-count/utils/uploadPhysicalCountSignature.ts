import { supabase } from '@/lib/supabase';

export async function uploadPhysicalCountSignature({
  signatureDataUrl,
  companyId,
  batchNumber,
}: {
  signatureDataUrl: string;
  companyId: string;
  batchNumber: string;
}): Promise<{ url: string; path: string }> {
  const base64Data = signatureDataUrl.split(',')[1];
  if (!base64Data) {
    throw new Error('Invalid signature data');
  }

  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: 'image/png' });

  const sanitizedBatch = batchNumber.replace(/[^a-zA-Z0-9-_]/g, '_');
  const timestamp = Date.now();
  const path = `${companyId}/${sanitizedBatch}/${timestamp}_physical-count.png`;

  const { error: uploadError } = await supabase.storage
    .from('warehouse-physical-count-signatures')
    .upload(path, blob, {
      contentType: 'image/png',
      upsert: false,
    });

  if (uploadError) throw uploadError;

  const { data: urlData, error: urlError } = await supabase.storage
    .from('warehouse-physical-count-signatures')
    .createSignedUrl(path, 31536000);

  if (urlError || !urlData?.signedUrl) {
    throw new Error('Failed to generate signed URL for signature');
  }

  return { url: urlData.signedUrl, path };
}
