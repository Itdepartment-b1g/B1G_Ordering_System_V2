import { supabase } from '@/lib/supabase';

/** Allowed values for `key_account_clients.client_category` (must match DB check constraint). */
export const KEY_ACCOUNT_CLIENT_CATEGORIES = [
  'distributor',
  'distri w/ multi retail',
  'distri w/ retail',
  'multi retail',
  'retail',
  'reseller',
] as const;

export type KeyAccountClientCategory = (typeof KEY_ACCOUNT_CLIENT_CATEGORIES)[number];

/** Split a stored comma-separated payment_terms string into a list. */
export function parsePaymentTerms(value?: string | null): string[] {
  if (!value?.trim()) return [];
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const part of value.split(',')) {
    const term = part.trim();
    if (!term) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
  }
  return terms;
}

/** Join payment terms for storage on `key_account_clients.payment_terms`. */
export function formatPaymentTerms(terms: string[]): string {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const raw of terms) {
    const term = raw.trim();
    if (!term) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(term);
  }
  return cleaned.join(', ');
}

export async function generateKeyAccountClientCode(companyId: string): Promise<string> {
  const { data, error } = await supabase.rpc('generate_key_account_client_code', {
    p_company_id: companyId,
  });
  if (error) throw error;
  if (!data || typeof data !== 'string') {
    throw new Error('Failed to generate client code');
  }
  return data;
}

export async function generateKeyAccountShopCode(clientId: string): Promise<string> {
  const { data, error } = await supabase.rpc('generate_key_account_shop_code', {
    p_client_id: clientId,
  });
  if (error) throw error;
  if (!data || typeof data !== 'string') {
    throw new Error('Failed to generate shop code');
  }
  return data;
}
