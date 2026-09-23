import { getSupabaseAdmin } from '../../db/supabaseAdmin';
import type { WarehouseContext } from '../../auth/requireWarehouseContext';

export type WarehouseLocationRow = {
  id: string;
  name: string;
  is_main: boolean;
};

export type WarehouseMembershipDto = {
  status: WarehouseContext['status'];
  isMain: boolean;
  locationId: string | null;
};

export async function getWarehouseMembership(
  ctx: WarehouseContext
): Promise<{ membership: WarehouseMembershipDto }> {
  return {
    membership: {
      status: ctx.status,
      isMain: ctx.isMain,
      locationId: ctx.locationId,
    },
  };
}

export async function listWarehouseLocations(
  ctx: WarehouseContext
): Promise<{ locations: WarehouseLocationRow[] }> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('warehouse_locations')
    .select('id, name, is_main')
    .eq('company_id', ctx.companyId)
    .order('is_main', { ascending: false })
    .order('name');
  if (error) throw error;
  return { locations: (data ?? []) as WarehouseLocationRow[] };
}
