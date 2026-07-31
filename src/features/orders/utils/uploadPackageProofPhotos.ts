import { supabase } from '@/lib/supabase';
import type { PackageProofPhotoItem } from '@/features/shared/components/MultiProofPhotoField';
import {
  MAX_PACKAGE_PROOF_PHOTOS,
  validatePackageProofFile,
} from '@/features/shared/components/MultiProofPhotoField';

export type UploadedPackageProof = {
  urls: string[];
  paths: string[];
  firstUrl: string;
  firstPath: string;
};

function extensionForFile(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (fromName && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(fromName)) {
    return fromName === 'jpeg' ? 'jpg' : fromName;
  }
  if (file.type.includes('png')) return 'png';
  if (file.type.includes('webp')) return 'webp';
  if (file.type.includes('gif')) return 'gif';
  return 'jpg';
}

/**
 * Upload package proof photos to a Supabase Storage bucket.
 * Returns signed URLs + paths; first entry is the legacy scalar proof.
 */
export async function uploadPackageProofPhotos(input: {
  photos: PackageProofPhotoItem[];
  bucket: string;
  /** Path prefix without trailing slash, e.g. `{companyId}/po/{poId}` */
  pathPrefix: string;
  /** Filename stem before index, e.g. `package` or `receive` */
  fileStem?: string;
  signedUrlSeconds?: number;
}): Promise<UploadedPackageProof> {
  const { photos, bucket, pathPrefix, fileStem = 'package', signedUrlSeconds = 60 * 60 * 24 * 365 } = input;

  if (!photos.length) {
    throw new Error('At least one package photo is required');
  }
  if (photos.length > MAX_PACKAGE_PROOF_PHOTOS) {
    throw new Error(`You can upload up to ${MAX_PACKAGE_PROOF_PHOTOS} package photos`);
  }

  const urls: string[] = [];
  const paths: string[] = [];
  const ts = Date.now();

  for (let i = 0; i < photos.length; i++) {
    const item = photos[i];
    const file = item.file;
    if (!file) {
      throw new Error(`Package photo ${i + 1} is missing the original file`);
    }
    const validationError = validatePackageProofFile(file);
    if (validationError) {
      throw new Error(validationError);
    }

    const ext = extensionForFile(file);
    const path = `${pathPrefix}/${ts}_${fileStem}_${i + 1}.${ext}`;
    const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
      contentType: file.type || 'image/jpeg',
      upsert: false,
    });
    if (uploadError) throw uploadError;

    const { data: urlData, error: urlError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, signedUrlSeconds);
    if (urlError || !urlData?.signedUrl) {
      throw new Error('Failed to generate signed URL for package photo');
    }

    urls.push(urlData.signedUrl);
    paths.push(path);
  }

  return {
    urls,
    paths,
    firstUrl: urls[0],
    firstPath: paths[0],
  };
}
