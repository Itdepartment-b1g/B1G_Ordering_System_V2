import { supabase } from '@/lib/supabase';

export interface ReferenceNamingVariant {
  id: string;
  name: string;
  variant_type: string;
  sku?: string | null;
  description?: string | null;
}

export interface ReferenceNamingBrand {
  id: string;
  name: string;
  description?: string | null;
  variants: ReferenceNamingVariant[];
}

export interface ReferenceNamingCatalog {
  company_id: string;
  brands: ReferenceNamingBrand[];
}

export async function fetchReferenceNamingCatalog(): Promise<ReferenceNamingCatalog> {
  const { data, error } = await supabase.rpc('get_reference_naming_catalog');
  if (error) throw error;

  const payload = data as ReferenceNamingCatalog | null;
  return {
    company_id: payload?.company_id ?? '',
    brands: Array.isArray(payload?.brands)
      ? payload.brands.map((b) => ({
          ...b,
          variants: Array.isArray(b.variants) ? b.variants : [],
        }))
      : [],
  };
}
