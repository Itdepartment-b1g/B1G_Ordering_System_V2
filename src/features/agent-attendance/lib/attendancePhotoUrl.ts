import { supabase } from '@/lib/supabase';

const SIGNED_URL_TTL_SEC = 3600;

/** Resolves a storage path in `agent-attendance-photos` to a short-lived signed URL. */
export async function getAgentAttendancePhotoSignedUrl(
  photoPath: string | null | undefined
): Promise<string | null> {
  if (!photoPath?.trim()) return null;
  const path = photoPath.trim();

  if (path.includes('?token=')) return path;

  const { data, error } = await supabase.storage
    .from('agent-attendance-photos')
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);

  if (error) {
    console.error('Agent attendance photo signed URL failed', error);
    return null;
  }

  return data?.signedUrl ?? null;
}
