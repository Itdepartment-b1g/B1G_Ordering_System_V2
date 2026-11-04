import type { PreviewClientReturn } from '@/features/orders/client-returns/clientReturnPreview';
import type { AgentBrand, AgentVariant } from '../types';

export const LOW_STOCK_THRESHOLD = 10;

export const isLowStock = (stock: number) => stock <= LOW_STOCK_THRESHOLD;

export function isLowStockVariant(variant: { stock?: number; status?: string }) {
  const stock = variant.stock ?? 0;
  return stock > 0 && (variant.status === 'low' || isLowStock(stock));
}

export function countLowStockVariants(
  variants: Array<{ stock?: number; status?: string }> | undefined
) {
  return (variants || []).filter(isLowStockVariant).length;
}

export type ReturnedStockEntry = { qty: number; returns: PreviewClientReturn[] };

export function emptyReturnedStock(): ReturnedStockEntry {
  return { qty: 0, returns: [] };
}

function variantTypeKey(variantType?: string) {
  return (variantType || 'flavor').toLowerCase();
}

function appendVariantToBrand(brand: AgentBrand, variant: AgentVariant) {
  if (brand.allVariants.some((item) => item.id === variant.id)) return;
  brand.allVariants.push(variant);
  const typeKey = variantTypeKey(variant.variantType);
  const typeList = brand.variantsByType.get(typeKey);
  if (typeList) typeList.push(variant);
  else brand.variantsByType.set(typeKey, [variant]);
  if (typeKey === 'flavor') brand.flavors.push(variant);
  else if (typeKey === 'battery') brand.batteries.push(variant);
  else if (typeKey === 'posm') brand.posms.push(variant);
}

function placeholderReturnedVariant(line: {
  variantId: string;
  variantName: string;
  variantType: string;
}): AgentVariant {
  return {
    id: line.variantId,
    name: line.variantName,
    variantType: line.variantType || 'flavor',
    stock: 0,
    price: 0,
    status: 'none',
  };
}

function emptyAgentBrand(id: string, name: string): AgentBrand {
  return {
    id,
    name,
    flavors: [],
    batteries: [],
    posms: [],
    foc: [],
    allVariants: [],
    variantsByType: new Map(),
  };
}

function returnedVariantMeta(
  returns: PreviewClientReturn[],
  variantId: string
): { brandId?: string; brandName: string; variantName: string; variantType: string } | null {
  for (const cr of returns) {
    for (const line of cr.lines) {
      if (line.variantId === variantId) {
        return {
          brandId: line.brandId,
          brandName: line.brandName,
          variantName: line.variantName,
          variantType: line.variantType,
        };
      }
    }
  }
  return null;
}

export const getVariantTypeColor = (type: string) => {
  const typeLower = type.toLowerCase();
  switch (typeLower) {
    case 'flavor':
      return { bg: 'bg-blue-100', text: 'text-blue-700', header: 'text-blue-600', headerBg: 'bg-blue-50/50' };
    case 'battery':
      return { bg: 'bg-green-100', text: 'text-green-700', header: 'text-green-600', headerBg: 'bg-green-50/50' };
    case 'posm':
      return { bg: 'bg-purple-100', text: 'text-purple-700', header: 'text-purple-600', headerBg: 'bg-purple-50/50' };
    case 'foc':
      return { bg: 'bg-orange-100', text: 'text-orange-700', header: 'text-orange-600', headerBg: 'bg-orange-50/50' };
    case 'ncv':
      return { bg: 'bg-pink-100', text: 'text-pink-700', header: 'text-pink-600', headerBg: 'bg-pink-50/50' };
    default:
      return { bg: 'bg-gray-100', text: 'text-gray-700', header: 'text-gray-600', headerBg: 'bg-gray-50/50' };
  }
};

const VARIANT_TYPE_ORDER = ['flavor', 'battery', 'posm', 'foc', 'ncv'];

export function formatVariantTypeLabel(type: string, plural = false): string {
  const value = type.toLowerCase();
  if (value === 'posm') return 'POSM';
  if (value === 'foc') return 'FOC';
  if (value === 'ncv') return 'NCV';
  if (value === 'battery') return plural ? 'Batteries' : 'Battery';
  if (value === 'flavor') return plural ? 'Flavors' : 'Flavor';
  const base = value ? value.charAt(0).toUpperCase() + value.slice(1) : 'Other';
  if (!plural) return base;
  return base.endsWith('s') ? base : `${base}s`;
}

export function sortedVariantTypeEntries(
  variantsByType?: Map<string, AgentVariant[]>
): Array<[string, AgentVariant[]]> {
  if (!variantsByType) return [];
  return Array.from(variantsByType.entries()).sort(([a], [b]) => {
    const ai = VARIANT_TYPE_ORDER.indexOf(a.toLowerCase());
    const bi = VARIANT_TYPE_ORDER.indexOf(b.toLowerCase());
    const ao = ai === -1 ? 99 : ai;
    const bo = bi === -1 ? 99 : bi;
    if (ao !== bo) return ao - bo;
    return a.localeCompare(b);
  });
}

export function getBrandTotalStock(brand: { allVariants?: Array<{ stock?: number }> }) {
  return (brand.allVariants || []).reduce((sum, variant) => sum + (variant.stock || 0), 0);
}

export function getTypeStock(variants: AgentVariant[]) {
  return variants.reduce((sum, variant) => sum + variant.stock, 0);
}

export function getBrandReturnedStock(
  brand: { allVariants?: Array<{ id: string }> },
  getReturnedStock: (variantId: string) => ReturnedStockEntry
) {
  const returnsById = new Map<string, PreviewClientReturn>();
  let qty = 0;
  for (const variant of brand.allVariants || []) {
    const stock = getReturnedStock(variant.id);
    qty += stock.qty;
    for (const row of stock.returns) {
      returnsById.set(row.id, row);
    }
  }
  return { qty, returns: Array.from(returnsById.values()) };
}

/** Keep sellable stock plus returned-only variants/brands for the Return column. */
export function buildActiveAgentBrands(params: {
  agentBrands: AgentBrand[];
  clientReturns: PreviewClientReturn[];
  returnedStockByVariantId: Map<string, ReturnedStockEntry>;
  showReturnedColumn: boolean;
}): AgentBrand[] {
  const { agentBrands, clientReturns, returnedStockByVariantId, showReturnedColumn } = params;
  const hasReturnedQty = (variantId: string) =>
    showReturnedColumn && (returnedStockByVariantId.get(variantId)?.qty || 0) > 0;
  const keepVariant = (variant: AgentVariant) => variant.stock > 0 || hasReturnedQty(variant.id);

  const brands: AgentBrand[] = agentBrands.map((brand) => {
    const allVariants = (brand.allVariants || []).filter(keepVariant);
    const variantsByType = new Map<string, AgentVariant[]>();
    if (brand.variantsByType) {
      brand.variantsByType.forEach((variants, type) => {
        const filtered = variants.filter(keepVariant);
        if (filtered.length > 0) variantsByType.set(type, filtered);
      });
    }
    return {
      ...brand,
      allVariants,
      variantsByType,
      flavors: brand.flavors.filter(keepVariant),
      batteries: brand.batteries.filter(keepVariant),
      posms: (brand.posms || []).filter(keepVariant),
      foc: (brand.foc || []).filter(keepVariant),
    };
  });

  if (showReturnedColumn) {
    const seenIds = new Set<string>();
    for (const brand of brands) {
      for (const variant of brand.allVariants) seenIds.add(variant.id);
    }

    for (const [variantId, stock] of returnedStockByVariantId) {
      if (stock.qty <= 0 || seenIds.has(variantId)) continue;
      const meta = returnedVariantMeta(clientReturns, variantId);
      if (!meta) continue;
      const brandNameKey = meta.brandName.toLowerCase();
      let brand = meta.brandId ? brands.find((item) => item.id === meta.brandId) : undefined;
      if (!brand) {
        brand = brands.find((item) => item.name.toLowerCase() === brandNameKey);
      }
      if (!brand) {
        brand = emptyAgentBrand(meta.brandId || `returned-brand:${meta.brandName}`, meta.brandName);
        brands.push(brand);
      }
      appendVariantToBrand(
        brand,
        placeholderReturnedVariant({
          variantId,
          variantName: meta.variantName,
          variantType: meta.variantType,
        })
      );
      seenIds.add(variantId);
    }
  }

  return brands.filter((brand) => brand.allVariants.length > 0);
}
