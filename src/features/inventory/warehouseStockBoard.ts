import { fetchAllPaginated } from '@/lib/supabasePaginate';
import { supabase } from '@/lib/supabase';
import {
  groupFlatInventoryRowsIntoBrands,
  LOW_STOCK_THRESHOLD,
  type Brand,
  type Variant,
} from './InventoryContext';

export const WAREHOUSE_STOCK_BOARD_QUERY_KEY = 'warehouse-stock-board';
export const WAREHOUSE_STOCK_BOARD_SETTINGS_QUERY_KEY = 'warehouse-stock-board-settings';

export type StockBoardViewMode = 'available' | 'overall' | 'sub';

export type WarehouseStockBoardSettings = {
  lowStockThreshold: number;
  usePerSkuReorderLevel: boolean;
  colors: {
    outOfStock: string;
    outOfStockText: string;
    lowStock: string;
    lowStockText: string;
    inStock: string;
    inStockText: string;
  };
};

export const DEFAULT_WAREHOUSE_STOCK_BOARD_SETTINGS: WarehouseStockBoardSettings = {
  lowStockThreshold: LOW_STOCK_THRESHOLD,
  usePerSkuReorderLevel: false,
  colors: {
    outOfStock: '#dc2626',
    outOfStockText: '#ffffff',
    lowStock: '#fbbf24',
    lowStockText: '#451a03',
    inStock: '#059669',
    inStockText: '#ffffff',
  },
};

type SettingsRow = {
  low_stock_threshold: number;
  use_per_sku_reorder_level: boolean;
  color_out_of_stock: string;
  color_out_of_stock_text: string;
  color_low_stock: string;
  color_low_stock_text: string;
  color_in_stock: string;
  color_in_stock_text: string;
};

export function mapStockBoardSettingsRow(row: SettingsRow | null): WarehouseStockBoardSettings {
  if (!row) return DEFAULT_WAREHOUSE_STOCK_BOARD_SETTINGS;
  return {
    lowStockThreshold: row.low_stock_threshold ?? DEFAULT_WAREHOUSE_STOCK_BOARD_SETTINGS.lowStockThreshold,
    usePerSkuReorderLevel: row.use_per_sku_reorder_level ?? true,
    colors: {
      outOfStock: row.color_out_of_stock || DEFAULT_WAREHOUSE_STOCK_BOARD_SETTINGS.colors.outOfStock,
      outOfStockText: row.color_out_of_stock_text || DEFAULT_WAREHOUSE_STOCK_BOARD_SETTINGS.colors.outOfStockText,
      lowStock: row.color_low_stock || DEFAULT_WAREHOUSE_STOCK_BOARD_SETTINGS.colors.lowStock,
      lowStockText: row.color_low_stock_text || DEFAULT_WAREHOUSE_STOCK_BOARD_SETTINGS.colors.lowStockText,
      inStock: row.color_in_stock || DEFAULT_WAREHOUSE_STOCK_BOARD_SETTINGS.colors.inStock,
      inStockText: row.color_in_stock_text || DEFAULT_WAREHOUSE_STOCK_BOARD_SETTINGS.colors.inStockText,
    },
  };
}

export function getDisplayedStock(
  variant: Pick<Variant, 'id' | 'stock' | 'allocatedStock'>,
  opts: {
    mode: StockBoardViewMode;
    isMainWarehouseUser: boolean;
    /** Open hard + soft transfer PO holds for this variant at the viewed location */
    poReservedByVariantId?: Record<string, number>;
  }
): number {
  const reserved = Math.max(0, opts.poReservedByVariantId?.[variant.id] || 0);
  if (opts.mode === 'overall') return variant.stock;
  if (opts.mode === 'sub' || !opts.isMainWarehouseUser) {
    return Math.max(0, variant.stock - reserved);
  }
  // Main warehouse "available": stock − allocated − open PO holds
  return Math.max(0, variant.stock - (variant.allocatedStock || 0) - reserved);
}

export function computeStockBoardStatus(
  displayedStock: number,
  reorderLevel: number
): Variant['status'] {
  if (displayedStock === 0) return 'out-of-stock';
  if (displayedStock <= reorderLevel) return 'low-stock';
  return 'in-stock';
}

export function resolveReorderLevel(
  variant: Variant,
  settings: WarehouseStockBoardSettings
): number {
  const companyThreshold = settings.lowStockThreshold;
  if (!settings.usePerSkuReorderLevel || variant.reorderLevel == null) {
    return companyThreshold;
  }
  // Per-SKU can be stricter (lower); company threshold still flags everything at/below it.
  return Math.max(variant.reorderLevel, companyThreshold);
}

export function getStockBoardLowStockLegendLabel(
  settings: WarehouseStockBoardSettings
): string {
  if (settings.usePerSkuReorderLevel) {
    return `Low stock (≤ ${settings.lowStockThreshold}, or per-SKU reorder when higher)`;
  }
  return `Low stock (≤ ${settings.lowStockThreshold})`;
}

export function applyStockBoardSettings(
  brands: Brand[],
  settings: WarehouseStockBoardSettings,
  opts: {
    mode: StockBoardViewMode;
    isMainWarehouseUser: boolean;
    poReservedByVariantId?: Record<string, number>;
  }
): Brand[] {
  return brands.map((brand) => {
    const mapVariant = (variant: Variant): Variant => {
      const displayedStock = getDisplayedStock(variant, opts);
      const reorderLevel = resolveReorderLevel(variant, settings);
      return {
        ...variant,
        status: computeStockBoardStatus(displayedStock, reorderLevel),
      };
    };

    const allVariants = brand.allVariants.map(mapVariant);
    const variantsByType = new Map<string, Variant[]>();
    for (const variant of allVariants) {
      const type = variant.variantType;
      if (!variantsByType.has(type)) variantsByType.set(type, []);
      variantsByType.get(type)!.push(variant);
    }

    return {
      ...brand,
      allVariants,
      variantsByType,
      flavors: allVariants.filter((v) => v.variantType === 'flavor'),
      batteries: allVariants.filter((v) => v.variantType === 'battery'),
      posms: allVariants.filter((v) => v.variantType === 'POSM' || v.variantType === 'posm'),
    };
  });
}

export function getStockBoardBadgeStyle(
  status: Variant['status'],
  colors: WarehouseStockBoardSettings['colors']
): { backgroundColor: string; color: string } {
  switch (status) {
    case 'out-of-stock':
      return { backgroundColor: colors.outOfStock, color: colors.outOfStockText };
    case 'low-stock':
      return { backgroundColor: colors.lowStock, color: colors.lowStockText };
    default:
      return { backgroundColor: colors.inStock, color: colors.inStockText };
  }
}

function rebuildVariantsByType(allVariants: Variant[]): Map<string, Variant[]> {
  const map = new Map<string, Variant[]>();
  for (const variant of allVariants) {
    const type = variant.variantType;
    if (!map.has(type)) map.set(type, []);
    map.get(type)!.push(variant);
  }
  return map;
}

export function finalizeStockBoardBrands(brands: Brand[]): Brand[] {
  return brands.map((brand) => ({
    ...brand,
    variantsByType: rebuildVariantsByType(brand.allVariants),
  }));
}

const MAIN_STOCK_BOARD_SELECT = `
  id,
  stock,
  allocated_stock,
  reorder_level,
  variants:variant_id (
    id,
    name,
    variant_type,
    created_at,
    is_active,
    brands:brand_id (
      id,
      name,
      is_active
    )
  )
`;

const LOCATION_STOCK_BOARD_SELECT = `
  stock,
  variant_id,
  variants:variant_id (
    id,
    name,
    variant_type,
    created_at,
    is_active,
    brands:brand_id (
      id,
      name,
      is_active
    ),
    main_inventory (
      reorder_level
    )
  )
`;

export async function fetchMainWarehouseStockBoard(companyId: string): Promise<Brand[]> {
  const rows = await fetchAllPaginated(async (from, to) => {
    const { data, error } = await supabase
      .from('main_inventory')
      .select(MAIN_STOCK_BOARD_SELECT)
      .eq('company_id', companyId)
      .order('variant_id')
      .range(from, to);
    return { data, error };
  });

  return groupFlatInventoryRowsIntoBrands(rows, (row) => ({
    id: row.id ?? `main:${row.variants?.id}`,
    stock: row.stock ?? 0,
    allocated_stock: row.allocated_stock ?? 0,
    unit_price: 0,
    selling_price: 0,
    dsp_price: 0,
    rsp_price: 0,
    reorder_level: row.reorder_level,
  }));
}

export async function fetchLocationWarehouseStockBoard(
  companyId: string,
  locationId: string
): Promise<Brand[]> {
  const rows = await fetchAllPaginated(async (from, to) => {
    const { data, error } = await supabase
      .from('warehouse_location_inventory')
      .select(LOCATION_STOCK_BOARD_SELECT)
      .eq('company_id', companyId)
      .eq('location_id', locationId)
      .order('variant_id')
      .range(from, to);
    return { data, error };
  });

  return groupFlatInventoryRowsIntoBrands(rows, (row, variantId) => {
    const mainInventory = Array.isArray(row.variants?.main_inventory)
      ? row.variants.main_inventory[0]
      : row.variants?.main_inventory;
    return {
      id: `loc:${locationId}:${variantId}`,
      stock: row.stock ?? 0,
      allocated_stock: 0,
      unit_price: 0,
      selling_price: 0,
      dsp_price: 0,
      rsp_price: 0,
      reorder_level: mainInventory?.reorder_level,
    };
  });
}

export async function fetchSubWarehouseUserStockBoard(companyId: string): Promise<Brand[]> {
  const { data: locId, error: locErr } = await supabase.rpc('get_warehouse_location_id', {});
  if (locErr) throw locErr;
  if (!locId) return [];
  return fetchLocationWarehouseStockBoard(companyId, String(locId));
}

/**
 * Open transfer PO holds (hard reservations + soft pending commitments) by variant
 * for a warehouse location. Used by stock board Available / Sub views.
 */
export async function fetchOpenTransferPoReservedByVariant(
  companyId: string,
  locationId: string | null
): Promise<Record<string, number>> {
  if (!companyId || !locationId) return {};

  let hardQuery = supabase
    .from('warehouse_transfer_reservations')
    .select('variant_id, quantity_reserved, quantity_fulfilled, status')
    .eq('warehouse_company_id', companyId)
    .eq('warehouse_location_id', locationId)
    .in('status', ['reserved', 'partial']);

  let softQuery = supabase
    .from('warehouse_transfer_soft_reservations')
    .select('variant_id, quantity_committed, status')
    .eq('warehouse_company_id', companyId)
    .eq('warehouse_location_id', locationId)
    .eq('status', 'active');

  const [{ data: hardData, error: hardErr }, { data: softData, error: softErr }] = await Promise.all([
    hardQuery,
    softQuery,
  ]);

  if (hardErr) throw hardErr;
  // Soft table may not be migrated yet — treat as empty.
  if (softErr) {
    const msg = String(softErr.message || '');
    if (
      softErr.code !== '42P01' &&
      softErr.code !== 'PGRST205' &&
      !msg.includes('warehouse_transfer_soft_reservations')
    ) {
      throw softErr;
    }
  }

  const map: Record<string, number> = {};
  for (const row of hardData || []) {
    const remaining = Math.max(
      0,
      Number((row as any).quantity_reserved || 0) - Number((row as any).quantity_fulfilled || 0)
    );
    if (remaining <= 0) continue;
    const vid = String((row as any).variant_id);
    map[vid] = (map[vid] || 0) + remaining;
  }
  for (const row of softData || []) {
    const remaining = Math.max(0, Number((row as any).quantity_committed || 0));
    if (remaining <= 0) continue;
    const vid = String((row as any).variant_id);
    map[vid] = (map[vid] || 0) + remaining;
  }
  return map;
}

export async function resolveStockBoardReservedLocationId(opts: {
  companyId: string;
  scope: { kind: 'main'; mode: 'available' | 'overall' } | { kind: 'sub'; locationId: string };
  membershipStatus?: string;
}): Promise<string | null> {
  if (opts.scope.kind === 'sub') return opts.scope.locationId;

  if (opts.membershipStatus === 'sub') {
    const { data: locId, error } = await supabase.rpc('get_warehouse_location_id', {});
    if (error) throw error;
    return locId ? String(locId) : null;
  }

  // Main available/overall: holds at the main warehouse location
  const { data: mainLoc, error } = await supabase
    .from('warehouse_locations')
    .select('id')
    .eq('company_id', opts.companyId)
    .eq('is_main', true)
    .maybeSingle();
  if (error) throw error;
  return mainLoc?.id ? String(mainLoc.id) : null;
}

export async function fetchWarehouseStockBoardSettings(
  companyId: string
): Promise<WarehouseStockBoardSettings> {
  const { data, error } = await supabase
    .from('warehouse_stock_board_settings')
    .select(
      `
      low_stock_threshold,
      use_per_sku_reorder_level,
      color_out_of_stock,
      color_out_of_stock_text,
      color_low_stock,
      color_low_stock_text,
      color_in_stock,
      color_in_stock_text
    `
    )
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) {
    // Table not migrated yet — fall back to defaults so the stock board still loads.
    if (
      error.code === '42P01' ||
      error.code === 'PGRST205' ||
      error.message.includes('warehouse_stock_board_settings')
    ) {
      return DEFAULT_WAREHOUSE_STOCK_BOARD_SETTINGS;
    }
    throw error;
  }
  return mapStockBoardSettingsRow((data as SettingsRow | null) ?? null);
}
