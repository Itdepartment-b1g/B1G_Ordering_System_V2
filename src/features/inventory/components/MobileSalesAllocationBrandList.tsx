import { useMemo, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ALL_TIME_DATE_RANGE } from '@/features/shared/components/DateRangeFilterPopover';
import {
  QuickFilterSheet,
  createQuickFilterAndClause,
  matchesQuickFilterAndClauses,
  type QuickFilterAndClause,
  type QuickFilterColumn,
} from '@/features/shared/components/QuickFilterSheet';
import type {
  AllocationHistoryGroup,
  AllocationHistoryLine,
} from '@/features/sales-agents/components/super-admin-allocation-history/utils/allocationHistoryMappers';
import { formatVariantTypeLabel } from '@/features/inventory/utils/myInventoryBrandDisplay';
import { variantTypeTone } from '@/features/inventory/utils/variantTypeTone';

const VARIANT_TYPE_ORDER = ['flavor', 'battery', 'posm', 'foc', 'ncv'];

type VariantTypeMeta = {
  name: string;
  display_name: string;
  color_code: string | null;
};

type AllocatedVariant = {
  id: string;
  name: string;
  quantity: number;
  amount?: number;
  unitPrice?: number;
};

type AllocatedTypeSection = {
  type: string;
  variants: AllocatedVariant[];
  totalAllocated: number;
  skuCount: number;
};

type AllocatedBrandSection = {
  key: string;
  name: string;
  types: AllocatedTypeSection[];
};

type AllocationQuickColumn = 'brand' | 'type' | 'variant';

const AllocationQuickFilterSheet = QuickFilterSheet<AllocationQuickColumn, 'all'>;

function variantMatchesAllocationFilters(
  brandKey: string,
  type: string,
  variant: AllocatedVariant,
  query: string,
  clauses: QuickFilterAndClause<AllocationQuickColumn>[]
) {
  if (query && !variant.name.toLowerCase().includes(query)) return false;
  return matchesQuickFilterAndClauses(clauses, (field, value) => {
    if (field === 'brand') return brandKey === value.toLowerCase();
    if (field === 'type') return type.toLowerCase() === value.toLowerCase();
    if (field === 'variant') return variant.id === value;
    return false;
  });
}

function unitLabel(count: number) {
  return Math.abs(count) === 1 ? 'unit' : 'units';
}

function typeSortIndex(type: string) {
  const index = VARIANT_TYPE_ORDER.indexOf(type.toLowerCase());
  return index === -1 ? 99 : index;
}

/** Turns product lines into the shape the brand cards already render. */
export function productLinesToAllocationGroup(
  groupId: string,
  lines: AllocationHistoryLine[]
): AllocationHistoryGroup {
  return {
    groupId,
    createdAt: '',
    allocatedToId: '',
    allocatedToName: '',
    allocatedById: '',
    allocatedByName: '',
    brandId: null,
    brandName: null,
    allocationType: 'leader_to_agent',
    totalQuantity: lines.reduce((sum, line) => sum + line.quantity, 0),
    lineCount: lines.length,
    lines,
  };
}

export function groupAllocationsByBrand(groups: AllocationHistoryGroup[]): AllocatedBrandSection[] {
  const brands = new Map<
    string,
    { key: string; name: string; types: Map<string, Map<string, AllocatedVariant>> }
  >();

  for (const group of groups) {
    const fallbackBrand = group.brandName?.trim() || 'Unbranded';
    for (const line of group.lines) {
      const brandName =
        line.brandName?.trim() && line.brandName !== 'Unknown brand' ? line.brandName.trim() : fallbackBrand;
      const brandKey = brandName.toLowerCase();
      let brand = brands.get(brandKey);
      if (!brand) {
        brand = { key: brandKey, name: brandName, types: new Map() };
        brands.set(brandKey, brand);
      }

      const typeKey = (line.variantType || 'other').toLowerCase();
      let variants = brand.types.get(typeKey);
      if (!variants) {
        variants = new Map();
        brand.types.set(typeKey, variants);
      }

      const variantKey = line.variantId || line.id;
      const existing = variants.get(variantKey);
      if (existing) {
        existing.quantity += line.quantity;
        if (typeof line.amount === 'number') existing.amount = (existing.amount || 0) + line.amount;
      } else {
        variants.set(variantKey, {
          id: variantKey,
          name: line.variantName,
          quantity: line.quantity,
          amount: line.amount,
          unitPrice: line.unitPrice,
        });
      }
    }
  }

  return [...brands.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((brand) => ({
      key: brand.key,
      name: brand.name,
      types: [...brand.types.entries()]
        .sort(([a], [b]) => {
          const order = typeSortIndex(a) - typeSortIndex(b);
          return order !== 0 ? order : a.localeCompare(b);
        })
        .map(([type, variantMap]) => {
          const variants = [...variantMap.values()].sort((a, b) => a.name.localeCompare(b.name));
          return {
            type,
            variants,
            totalAllocated: variants.reduce((sum, variant) => sum + variant.quantity, 0),
            skuCount: variants.length,
          };
        }),
    }));
}

export function MobileSalesAllocationBrandList({
  isLoading,
  groups,
  variantTypes,
  emptyMessage,
  quantityLabel = 'Total Allocated',
}: {
  isLoading: boolean;
  groups: AllocationHistoryGroup[];
  variantTypes: VariantTypeMeta[];
  emptyMessage: string;
  quantityLabel?: string;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeTab, setTypeTab] = useState('all');
  const [columnClauses, setColumnClauses] = useState<QuickFilterAndClause<AllocationQuickColumn>[]>([
    createQuickFilterAndClause<AllocationQuickColumn>(),
  ]);

  const brands = useMemo(() => groupAllocationsByBrand(groups), [groups]);
  const typeByName = useMemo(
    () => new Map(variantTypes.map((type) => [type.name.toLowerCase(), type])),
    [variantTypes]
  );
  const typeLabelFor = (type: string) =>
    typeByName.get(type.toLowerCase())?.display_name?.trim() || formatVariantTypeLabel(type, false);

  const typeTabs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const brand of brands) {
      for (const section of brand.types) {
        counts.set(section.type, (counts.get(section.type) || 0) + section.skuCount);
      }
    }
    return [...counts.entries()].sort(([a], [b]) => {
      const order = typeSortIndex(a) - typeSortIndex(b);
      return order !== 0 ? order : a.localeCompare(b);
    });
  }, [brands]);

  const variantCount = typeTabs.reduce((sum, [, count]) => sum + count, 0);

  const filteredBrands = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return brands
      .map((brand) => {
        const types = brand.types
          .filter((section) => typeTab === 'all' || section.type.toLowerCase() === typeTab.toLowerCase())
          .map((section) => {
            const variants = section.variants.filter((variant) =>
              variantMatchesAllocationFilters(brand.key, section.type, variant, query, columnClauses)
            );
            return {
              ...section,
              variants,
              totalAllocated: variants.reduce((sum, variant) => sum + variant.quantity, 0),
              skuCount: variants.length,
            };
          })
          .filter((section) => section.variants.length > 0);
        return { ...brand, types };
      })
      .filter((brand) => brand.types.length > 0);
  }, [brands, columnClauses, searchQuery, typeTab]);

  const quickColumns = useMemo((): QuickFilterColumn<AllocationQuickColumn>[] => {
    const variants = brands.flatMap((brand) =>
      brand.types.flatMap((section) =>
        section.variants.map((variant) => ({ value: variant.id, label: variant.name }))
      )
    );
    const seen = new Set<string>();
    return [
      {
        key: 'brand',
        label: 'Brand',
        searchPlaceholder: 'Search brand...',
        options: brands.map((brand) => ({ value: brand.key, label: brand.name })),
      },
      {
        key: 'type',
        label: 'Variant type',
        searchPlaceholder: 'Search variant type...',
        options: typeTabs.map(([type]) => ({ value: type, label: typeLabelFor(type) })),
      },
      {
        key: 'variant',
        label: 'Variant',
        searchPlaceholder: 'Search variant...',
        options: variants.filter((variant) => {
          if (seen.has(variant.value)) return false;
          seen.add(variant.value);
          return true;
        }),
      },
    ];
  }, [brands, typeByName, typeTabs]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading allocation history...
      </div>
    );
  }

  if (brands.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#02066F]/40" />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search variants..."
            aria-label="Search variants"
            className="h-9 border-[#E4E7F2] bg-white pl-9 pr-9 text-[#02066F] placeholder:text-[#02066F]/40"
          />
          {searchQuery ? (
            <button
              type="button"
              aria-label="Clear search"
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-[#02066F]/50 hover:bg-[#F6F7FC]"
              onClick={() => setSearchQuery('')}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        <AllocationQuickFilterSheet
          showDate={false}
          showStatus={false}
          dateRange={ALL_TIME_DATE_RANGE}
          onDateRangeChange={() => undefined}
          columns={quickColumns}
          columnClauses={columnClauses}
          onColumnClausesChange={setColumnClauses}
          onClear={() => setColumnClauses([createQuickFilterAndClause<AllocationQuickColumn>()])}
          triggerClassName="h-9 shrink-0"
        />
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <button
          type="button"
          aria-pressed={typeTab === 'all'}
          onClick={() => setTypeTab('all')}
          className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${
            typeTab === 'all'
              ? 'bg-[#02066F] text-white'
              : 'bg-white text-[#02066F] ring-1 ring-[#02066F]/10'
          }`}
        >
          All
          <span className="ml-1.5 tabular-nums opacity-80">{variantCount}</span>
        </button>
        {typeTabs.map(([type, count]) => {
          const tone = variantTypeTone(typeByName.get(type)?.color_code);
          const active = typeTab.toLowerCase() === type.toLowerCase();
          return (
            <button
              key={type}
              type="button"
              aria-pressed={active}
              onClick={() => setTypeTab(type)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${
                active ? `${tone.accent} text-white` : `bg-white ring-1 ${tone.ring} ${tone.title}`
              }`}
            >
              {typeLabelFor(type)}
              <span className="ml-1.5 tabular-nums opacity-80">{count}</span>
            </button>
          );
        })}
      </div>

      {filteredBrands.length === 0 ? (
        <div className="rounded-lg border border-[#D5DCF3] bg-white px-4 py-10 text-center">
          <p className="font-medium text-[#02066F]">No variants match</p>
          <p className="mt-1 text-sm text-muted-foreground">Try another search, type, or filter.</p>
        </div>
      ) : null}

      {filteredBrands.map((brand) => {
        const typeCountLabel = `${brand.types.length} Variant Type${brand.types.length === 1 ? '' : 's'}`;
        return (
          <section key={brand.key} className="rounded-lg border border-[#D5DCF3] bg-white">
            <header className="flex items-center gap-2 border-b border-[#E4E8F5] px-3 py-2.5">
              <span className="h-4 w-1 shrink-0 rounded-full bg-[#02066F]" aria-hidden />
              <h2 className="min-w-0 flex-1 text-[15px] font-semibold leading-snug break-words text-[#02066F]">
                {brand.name}
              </h2>
              <span className="shrink-0 text-xs font-normal text-[#02066F]/55">{typeCountLabel}</span>
            </header>

            <div className="space-y-4 px-3 py-3">
              {brand.types.map((section) => {
                const typeRecord = typeByName.get(section.type);
                const tone = variantTypeTone(typeRecord?.color_code);
                const typeLabel = typeRecord?.display_name?.trim() || formatVariantTypeLabel(section.type, false);
                const skuLabel = `${section.skuCount} SKU${section.skuCount === 1 ? '' : 's'}`;
                const variantWord = section.skuCount === 1 ? 'variant' : 'variants';

                return (
                  <div key={section.type} className="rounded-lg border border-[#D5DCF3] bg-white p-3">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone.accent}`} aria-hidden />
                      <h3 className="min-w-0 flex-1 text-sm font-medium leading-snug break-words text-[#02066F]">
                        {typeLabel}
                      </h3>
                      <span className="shrink-0 text-xs font-normal text-[#02066F]/55">{skuLabel}</span>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div className={`min-w-0 rounded-md border bg-white px-2.5 py-2 ${tone.statBorder}`}>
                        <p className="text-[10px] font-medium uppercase tracking-wide text-[#02066F]/45">
                          {quantityLabel}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1">
                          <span className="text-base font-semibold tabular-nums text-[#1C1C3A]">
                            {section.totalAllocated.toLocaleString()}
                          </span>
                          <span className="text-xs font-normal text-[#02066F]/55">
                            {unitLabel(section.totalAllocated)}
                          </span>
                        </p>
                      </div>
                      <div className={`min-w-0 rounded-md border bg-white px-2.5 py-2 ${tone.statBorder}`}>
                        <p className="text-[10px] font-medium uppercase tracking-wide text-[#02066F]/45">Total SKUs</p>
                        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1">
                          <span className="text-base font-semibold tabular-nums text-[#1C1C3A]">
                            {section.skuCount.toLocaleString()}
                          </span>
                          <span className="text-xs font-normal text-[#02066F]/55">{variantWord}</span>
                        </p>
                      </div>
                    </div>

                    <ul className="divide-y divide-[#E4E8F5]">
                      {section.variants.map((variant) => (
                        <li key={variant.id} className="flex items-start justify-between gap-3 py-2">
                          <span className="min-w-0">
                            <span className="block text-sm font-normal leading-snug break-words text-[#02066F]">
                              {variant.name}
                            </span>
                            {typeof variant.unitPrice === 'number' ? (
                              <span className="mt-0.5 block text-xs font-normal tabular-nums text-[#02066F]/55">
                                ₱{variant.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} each
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block text-sm font-medium tabular-nums text-[#1C1C3A]">
                              {variant.quantity.toLocaleString()}{' '}
                              <span className="font-normal text-[#02066F]/55">{unitLabel(variant.quantity)}</span>
                            </span>
                            {typeof variant.amount === 'number' ? (
                              <span className="mt-0.5 block text-xs font-normal tabular-nums text-[#02066F]/55">
                                ₱{variant.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
