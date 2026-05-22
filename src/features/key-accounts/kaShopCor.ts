import { supabase } from '@/lib/supabase';

const BUCKET = 'ka-shop-cor';

export async function getKeyAccountShopCorSignedUrl(
  storagePath: string,
  expiresInSec = 3600
): Promise<string | null> {
  if (!storagePath?.trim()) return null;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath.trim(), expiresInSec);
  if (error) throw error;
  return data?.signedUrl ?? null;
}

export async function openKeyAccountShopCorPdf(storagePath: string | null | undefined): Promise<void> {
  if (!storagePath?.trim()) return;
  const url = await getKeyAccountShopCorSignedUrl(storagePath);
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
}
