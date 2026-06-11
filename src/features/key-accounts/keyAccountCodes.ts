import { supabase } from '@/lib/supabase';

/** Allowed values for `key_account_clients.client_category` (must match DB check constraint). */
export const KEY_ACCOUNT_CLIENT_CATEGORIES = [
  'distributor',
  'distri w/ multi retail',
  'distri w/ retail',
  'multi retail',
  'retail',
] as const;

export type KeyAccountClientCategory = (typeof KEY_ACCOUNT_CLIENT_CATEGORIES)[number];

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
