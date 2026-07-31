import { supabase } from '@/lib/supabase';
import type { PackageProofPhotoItem } from '@/features/shared/components/MultiProofPhotoField';
import { uploadPackageProofPhotos } from '@/features/orders/utils/uploadPackageProofPhotos';

export const INTERNAL_STOCK_PROOF_BUCKET = 'internal-stock-delivery-proofs';

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
  const { error: uploadError } = await supabase.storage
    .from(INTERNAL_STOCK_PROOF_BUCKET)
    .upload(path, blob, {
      contentType,
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const { data: urlData, error: urlError } = await supabase.storage
    .from(INTERNAL_STOCK_PROOF_BUCKET)
    .createSignedUrl(path, 31536000);

  if (urlError || !urlData?.signedUrl) {
    throw new Error('Failed to generate signed URL for internal stock evidence');
  }

  return { url: urlData.signedUrl, path };
}

export async function uploadInternalStockSignature(input: {
  signatureDataUrl: string;
  companyId: string;
  requestId?: string;
}): Promise<{ url: string; path: string }> {
  const blob = dataUrlToBlob(input.signatureDataUrl, 'image/png');
  const prefix = input.requestId
    ? `${input.companyId}/internal-stock/${input.requestId}`
    : `${input.companyId}/internal-stock`;
  const path = `${prefix}/${Date.now()}_signature.png`;
  return uploadBlob(path, blob, 'image/png');
}

export async function uploadInternalStockRiderPhoto(input: {
  riderPhotoDataUrl: string;
  companyId: string;
  requestId?: string;
  fileName?: string;
}): Promise<{ url: string; path: string }> {
  const blob = dataUrlToBlob(input.riderPhotoDataUrl, 'image/jpeg');
  const extFromName = input.fileName?.split('.').pop()?.toLowerCase();
  const ext =
    extFromName && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extFromName)
      ? extFromName === 'jpeg'
        ? 'jpg'
        : extFromName
      : extensionForMime(blob.type);
  const prefix = input.requestId
    ? `${input.companyId}/internal-stock/${input.requestId}`
    : `${input.companyId}/internal-stock`;
  const path = `${prefix}/${Date.now()}_rider.${ext}`;
  return uploadBlob(path, blob, blob.type || 'image/jpeg');
}

export async function uploadInternalStockPackagePhotos(input: {
  photos: PackageProofPhotoItem[];
  companyId: string;
  requestId?: string;
}): Promise<{ urls: string[]; paths: string[]; firstUrl: string; firstPath: string }> {
  const prefix = input.requestId
    ? `${input.companyId}/internal-stock/${input.requestId}`
    : `${input.companyId}/internal-stock`;
  return uploadPackageProofPhotos({
    photos: input.photos,
    bucket: INTERNAL_STOCK_PROOF_BUCKET,
    pathPrefix: prefix,
    fileStem: 'package',
  });
}

export async function attachInternalStockProofImageUrls(input: {
  requestId: string;
  eventType: string;
  proofImageUrls: string[];
  proofImagePaths?: string[];
  receiveId?: string;
}) {
  const { data, error } = await supabase.rpc('attach_internal_stock_proof_image_urls', {
    p_request_id: input.requestId,
    p_event_type: input.eventType,
    p_proof_image_urls: input.proofImageUrls,
    p_proof_image_paths: input.proofImagePaths ?? null,
    p_receive_id: input.receiveId ?? null,
  });
  if (error) throw error;
  const result = data as { success?: boolean; error?: string };
  if (!result?.success) {
    throw new Error(result?.error || 'Failed to attach package photos');
  }
  return result;
}

export async function prepareInternalStockDeliveryUploads(input: {
  companyId: string;
  requestId?: string;
  riderPhotoDataUrl: string;
  riderPhotoName?: string;
  packagePhotos: PackageProofPhotoItem[];
  signatureDataUrl: string;
}) {
  if (!input.packagePhotos.length) {
    throw new Error('At least one package photo is required');
  }
  const [signature, rider, packages] = await Promise.all([
    uploadInternalStockSignature({
      signatureDataUrl: input.signatureDataUrl,
      companyId: input.companyId,
      requestId: input.requestId,
    }),
    uploadInternalStockRiderPhoto({
      riderPhotoDataUrl: input.riderPhotoDataUrl,
      companyId: input.companyId,
      requestId: input.requestId,
      fileName: input.riderPhotoName,
    }),
    uploadInternalStockPackagePhotos({
      photos: input.packagePhotos,
      companyId: input.companyId,
      requestId: input.requestId,
    }),
  ]);
  return { signature, rider, packages };
}
