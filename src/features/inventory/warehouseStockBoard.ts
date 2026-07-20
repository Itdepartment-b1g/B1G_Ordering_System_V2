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
  variant: Pick<Variant, 'stock' | 'allocatedStock'>,
  opts: { mode: StockBoardViewMode; isMainWarehouseUser: boolean }
): number {
  if (opts.mode === 'sub') return variant.stock;
  if (!opts.isMainWarehouseUser) return variant.stock;
  if (opts.mode === 'overall') return variant.stock;
  return Math.max(0, variant.stock - (variant.allocatedStock || 0));
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
  opts: { mode: StockBoardViewMode; isMainWarehouseUser: boolean }
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
