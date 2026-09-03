import { fetchAllPaginated } from '../../../../lib/supabasePaginate';
import { getSupabaseAdmin } from '../../../db/supabaseAdmin';
import { HttpError } from '../../../http/errors';
import type { UserContext } from '../purchase-order';
import { chunkIds, resolveHubCompanyId } from './shared';

export type KAFsnLocation = {
  id: string;
  name: string;
  is_main: boolean;
};

export type KAFsnCatalogVariant = {
  id: string;
  name: string;
  variantType: string;
  stock: number;
  allocatedStock: number;
  price: number;
  status: 'in-stock' | 'out-of-stock';
};

export type KAFsnCatalogBrand = {
  id: string;
  name: string;
  allVariants: KAFsnCatalogVariant[];
};

export async function getKAFsnSetup(ctx: UserContext) {
  const hubCompanyId = await resolveHubCompanyId(ctx.companyId);
  if (!hubCompanyId) {
    return { hubCompanyId: null as string | null, locations: [] as KAFsnLocation[] };
  }

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('warehouse_locations')
    .select('id, name, is_main')
    .eq('company_id', hubCompanyId)
    .order('is_main', { ascending: false })
    .order('name');
  if (error) throw error;

  return {
    hubCompanyId,
    locations: ((data || []) as KAFsnLocation[]).map((loc) => ({
      id: loc.id,
      name: loc.name,
      is_main: !!loc.is_main,
    })),
  };
}

export async function getKAFsnCatalog(
  ctx: UserContext,
  locationId: string
): Promise<{ brands: KAFsnCatalogBrand[] }> {
  if (!locationId) throw new HttpError(400, 'locationId is required');
  const hubCompanyId = await resolveHubCompanyId(ctx.companyId);
  if (!hubCompanyId) return { brands: [] };

  const sb = getSupabaseAdmin();
  const { data: location, error: locErr } = await sb
    .from('warehouse_locations')
    .select('id, is_main')
    .eq('company_id', hubCompanyId)
    .eq('id', locationId)
    .maybeSingle();
  if (locErr) throw locErr;
  if (!location) throw new HttpError(404, 'Warehouse location not found');

  const { data: brandsData, error: brandsErr } = await sb
    .from('brands')
    .select(
      `
      id,
      name,
      is_active,
      variants (
        id,
        name,
        variant_type,
        created_at,
        is_active
      )
    `
    )
    .eq('company_id', hubCompanyId)
    .or('is_active.eq.true,is_active.is.null')
    .order('name');
  if (brandsErr) throw brandsErr;

  const variantIds = (brandsData || []).flatMap((brand) =>
    ((brand.variants as { id: string; is_active?: boolean }[]) || [])
      .filter((variant) => variant.is_active !== false)
      .map((variant) => variant.id)
  );

  const stockByVariant = await loadStockByVariant(
    hubCompanyId,
    locationId,
    !!location.is_main,
    variantIds
  );

  const brands: KAFsnCatalogBrand[] = (brandsData || [])
    .map((brand) => {
      const allVariants: KAFsnCatalogVariant[] = ((brand.variants as {
        id: string;
        name: string;
        variant_type?: string | null;
        created_at?: string | null;
        is_active?: boolean;
      }[]) || [])
        .filter((variant) => variant.is_active !== false)
        .sort(
          (a, b) =>
            new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
        )
        .map((variant) => {
          const stock = stockByVariant.get(variant.id) ?? 0;
          return {
            id: variant.id,
            name: variant.name,
            variantType: variant.variant_type || '',
            stock,
            allocatedStock: 0,
            price: 0,
            status: stock === 0 ? ('out-of-stock' as const) : ('in-stock' as const),
          };
        });
      return {
        id: brand.id as string,
        name: brand.name as string,
        allVariants,
      };
    })
    .filter((brand) => brand.allVariants.length > 0);

  return { brands };
}

async function loadStockByVariant(
  hubCompanyId: string,
  locationId: string,
  isMain: boolean,
  variantIds: string[]
) {
  const stockByVariant = new Map<string, number>();
  if (variantIds.length === 0) return stockByVariant;
  const sb = getSupabaseAdmin();

  if (isMain) {
    for (const chunk of chunkIds(variantIds)) {
      const rows = await fetchAllPaginated<{
        variant_id: string;
        stock: number | null;
        allocated_stock: number | null;
      }>(async (from, to) => {
        const { data, error } = await sb
          .from('main_inventory')
          .select('variant_id, stock, allocated_stock')
          .eq('company_id', hubCompanyId)
          .in('variant_id', chunk)
          .range(from, to);
        return { data, error };
      });
      for (const row of rows) {
        const stock = Number(row.stock) || 0;
        const allocated = Number(row.allocated_stock) || 0;
        stockByVariant.set(row.variant_id, Math.max(0, stock - allocated));
      }
    }
    return stockByVariant;
  }

  for (const chunk of chunkIds(variantIds)) {
    const rows = await fetchAllPaginated<{ variant_id: string; stock: number | null }>(
      async (from, to) => {
        const { data, error } = await sb
          .from('warehouse_location_inventory')
          .select('variant_id, stock')
          .eq('company_id', hubCompanyId)
          .eq('location_id', locationId)
          .in('variant_id', chunk)
          .range(from, to);
        return { data, error };
      }
    );
    for (const row of rows) {
      stockByVariant.set(row.variant_id, Number(row.stock) || 0);
    }
  }
  return stockByVariant;
}
