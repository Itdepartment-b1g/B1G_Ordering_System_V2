import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Battery,
  ChevronRight,
  Gift,
  Package,
  RefreshCw,
  Search,
  Tag,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ALL_TIME_DATE_RANGE } from '@/features/shared/components/DateRangeFilterPopover';
import {
  QuickFilterSheet,
  createQuickFilterAndClause,
  matchesQuickFilterAndClauses,
  type QuickFilterAndClause,
  type QuickFilterColumn,
} from '@/features/shared/components/QuickFilterSheet';
import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import { usePermissions } from '@/hooks/usePermissions';
import {
  CLIENT_ORDER_RETURNS_QUERY_KEY,
  buildReturnedStockByVariantId,
  canShowClientOrderReturns,
  fetchClientOrderReturns,
} from '@/features/orders/client-returns/clientReturnApi';
import type { PreviewClientReturn } from '@/features/orders/client-returns/clientReturnPreview';
import { ReturnedStockDetailDialog } from '@/features/orders/client-returns/ReturnedStockDetailDialog';
import { useAgentInventory } from './hooks';
import type { AgentVariant } from './types';
import {
  buildActiveAgentBrands,
  countLowStockVariants,
  emptyReturnedStock,
  formatVariantTypeLabel,
  getBrandReturnedStock,
  getBrandTotalStock,
  getTypeStock,
  isLowStock,
  sortedVariantTypeEntries,
  type ReturnedStockEntry,
} from './utils/myInventoryBrandDisplay';
import { variantTypeTone } from './utils/variantTypeTone';

const VARIANT_TYPES_QUERY_KEY = 'variant-types';

type VariantTypeRow = {
  name: string;
  display_name: string;
  description: string | null;
  color_code: string | null;
};

type StockStatusFilter = 'all' | 'in_stock' | 'low' | 'returned' | 'out';
type BrandQuickColumn = 'variant' | 'type';

const BrandQuickFilterSheet = QuickFilterSheet<BrandQuickColumn, StockStatusFilter>;

function variantMatchesFilters(
  variant: AgentVariant,
  type: string,
  query: string,
  status: StockStatusFilter,
  returnedQty: number,
  clauses: QuickFilterAndClause<BrandQuickColumn>[]
) {
  if (query && !variant.name.toLowerCase().includes(query)) return false;
  if (status === 'in_stock' && variant.stock <= 0) return false;
  if (status === 'low' && !(isLowStock(variant.stock) && variant.stock > 0)) return false;
  if (status === 'returned' && returnedQty <= 0) return false;
  if (status === 'out' && variant.stock !== 0) return false;
  return matchesQuickFilterAndClauses(clauses, (field, value) => {
    if (field === 'variant') return variant.id === value;
    if (field === 'type') return type.toLowerCase() === value.toLowerCase();
    return false;
  });
}

function unitLabel(count: number) {
  return Math.abs(count) === 1 ? 'unit' : 'units';
}

function formatPrice(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `₱${value.toFixed(2)}`;
}

function categorySubtitle(type: string) {
  switch (type.toLowerCase()) {
    case 'flavor':
      return 'Product variants and stock overview';
    case 'foc':
      return 'Free of Charge Items';
    case 'battery':
      return 'Battery variants and stock overview';
    case 'posm':
      return 'Point of sale materials';
    case 'ncv':
      return 'Non-commercial variants';
    default:
      return 'Product variants and stock overview';
  }
}

function categoryIcon(type: string): LucideIcon {
  switch (type.toLowerCase()) {
    case 'battery':
      return Battery;
    case 'foc':
      return Gift;
    case 'ncv':
      return Tag;
    default:
      return Package;
  }
}

const STOCK_BOX = 'flex h-full min-w-0 flex-col rounded-md border border-[#D5DCF3] bg-white px-2.5 py-2';

function PriceColumn({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 flex-1 px-1.5 text-center">
      <p className="text-[10px] font-medium uppercase tracking-wide text-[#02066F]/45">{label}</p>
      <p className="mt-0.5 text-[13px] font-normal tabular-nums leading-tight text-[#02066F]">{value}</p>
    </div>
  );
}

function QuantityLine({ quantity, emphasize }: { quantity: number; emphasize?: boolean }) {
  return (
    <p className="mt-1.5 flex flex-wrap items-baseline gap-x-1">
      <span
        className={`text-lg font-semibold leading-none tabular-nums ${
          emphasize ? 'text-amber-700' : 'text-[#1C1C3A]'
        }`}
      >
        {quantity}
      </span>
      <span className="text-xs font-normal text-[#02066F]/55">{unitLabel(quantity)}</span>
    </p>
  );
}

function VariantCard({
  variant,
  returnedStock,
  accentClassName,
  onViewReturns,
}: {
  variant: AgentVariant;
  returnedStock: ReturnedStockEntry;
  accentClassName: string;
  onViewReturns: () => void;
}) {
  const low = isLowStock(variant.stock) && variant.stock > 0;
  const prices = [
    { label: 'Price', value: formatPrice(variant.price) },
    { label: 'RSP', value: formatPrice(variant.rspPrice) },
    { label: 'DSP', value: formatPrice(variant.dspPrice) },
  ];

  return (
    <article className="rounded-lg border border-[#D5DCF3] bg-white px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className={`h-4 w-1 shrink-0 rounded-full ${accentClassName}`} aria-hidden />
        <h3 className="min-w-0 text-[15px] font-semibold leading-snug break-words text-[#02066F]">
          {variant.name}
        </h3>
      </div>

      <div className="mt-2.5 grid grid-cols-2 items-stretch gap-2">
        <div className={STOCK_BOX}>
          <div className="flex min-h-10 min-w-0 items-center gap-1.5 text-[#02066F]/70">
            <Package className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
            <span className="min-w-0 text-[11px] font-medium leading-tight">Available Stock</span>
          </div>
          <QuantityLine quantity={variant.stock} emphasize={low} />
        </div>

        <div className={STOCK_BOX}>
          <div className="flex min-h-10 items-center justify-between gap-1">
            <div className="flex min-w-0 items-center gap-1.5 text-[#5C4D8A]">
              <RefreshCw className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
              <span className="min-w-0 text-[11px] font-medium leading-tight">Returned Stock</span>
            </div>
            <button
              type="button"
              onClick={onViewReturns}
              aria-label={`View returns for ${variant.name}`}
              className="inline-flex min-h-10 shrink-0 items-center gap-0.5 rounded-md px-1.5 text-xs font-medium text-[#02066F] hover:bg-[#F4F6FC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#02066F]"
            >
              View
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
          <QuantityLine quantity={returnedStock.qty} />
        </div>
      </div>

      <div className="mt-2.5 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center border-t border-[#E4E8F5] pt-2.5">
        {prices.map((price, index) => (
          <div key={price.label} className="contents">
            {index > 0 ? (
              <span className="text-sm font-normal leading-none text-[#C5CDEA]" aria-hidden>
                |
              </span>
            ) : null}
            <PriceColumn label={price.label} value={price.value} />
          </div>
        ))}
      </div>
    </article>
  );
}

export default function MyInventoryBrandPage() {
  const { brandId = '' } = useParams<{ brandId: string }>();

  useLayoutEffect(() => {
    const main = document.querySelector('main');
    if (main instanceof HTMLElement) main.scrollTop = 0;
    window.scrollTo(0, 0);
  }, [brandId]);
  const { agentBrands } = useAgentInventory();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { hasWarehouseHubLink } = usePermissions();
  const showReturnedColumn = canShowClientOrderReturns(hasWarehouseHubLink, user?.role);

  const [returnedDialog, setReturnedDialog] = useState<{
    variantName: string;
    brandName: string;
    totalReturned: number;
    returns: PreviewClientReturn[];
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeTab, setTypeTab] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StockStatusFilter>('all');
  const [columnClauses, setColumnClauses] = useState<QuickFilterAndClause<BrandQuickColumn>[]>([
    createQuickFilterAndClause<BrandQuickColumn>(),
  ]);

  const { data: clientReturns = [] } = useQuery({
    queryKey: [CLIENT_ORDER_RETURNS_QUERY_KEY, user?.company_id, user?.id],
    enabled: !!user?.company_id,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: fetchClientOrderReturns,
  });

  const { data: variantTypes = [] } = useQuery({
    queryKey: [VARIANT_TYPES_QUERY_KEY, user?.company_id],
    enabled: !!user?.company_id,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('variant_types')
        .select('name, display_name, description, color_code')
        .eq('company_id', user!.company_id)
        .eq('is_active', true);
      if (error) throw error;
      return (data || []) as VariantTypeRow[];
    },
  });

  useEffect(() => {
    if (!user?.company_id) return;
    const channel = supabase
      .channel(`my-inventory-variant-types-${user.company_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'variant_types',
          filter: `company_id=eq.${user.company_id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: [VARIANT_TYPES_QUERY_KEY, user.company_id] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, user?.company_id]);

  const variantTypeByName = useMemo(() => {
    const map = new Map<string, VariantTypeRow>();
    for (const row of variantTypes) {
      map.set(row.name.toLowerCase(), row);
    }
    return map;
  }, [variantTypes]);

  const returnedStockByVariantId = useMemo(() => {
    return buildReturnedStockByVariantId(clientReturns, { holderId: user?.id });
  }, [clientReturns, user?.id]);

  const getReturnedStock = (variantId: string) =>
    returnedStockByVariantId.get(variantId) || emptyReturnedStock();

  const brand = useMemo(() => {
    const active = buildActiveAgentBrands({
      agentBrands,
      clientReturns,
      returnedStockByVariantId,
      showReturnedColumn,
    });
    return active.find((item) => item.id === brandId) || null;
  }, [agentBrands, brandId, clientReturns, returnedStockByVariantId, showReturnedColumn]);

  const totalStock = brand ? getBrandTotalStock(brand) : 0;
  const returned = brand
    ? getBrandReturnedStock(brand, getReturnedStock)
    : { qty: 0, returns: [] as PreviewClientReturn[] };
  const lowStockCount = brand ? countLowStockVariants(brand.allVariants) : 0;
  const typeEntries = brand ? sortedVariantTypeEntries(brand.variantsByType) : [];
  const itemCount = (brand?.allVariants || []).length;
  const filteredTypeEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return typeEntries
      .filter(([type]) => typeTab === 'all' || type.toLowerCase() === typeTab.toLowerCase())
      .map(([type, variants]) => {
        const visible = variants.filter((variant) =>
          variantMatchesFilters(
            variant,
            type,
            query,
            statusFilter,
            getReturnedStock(variant.id).qty,
            columnClauses
          )
        );
        return [type, visible] as [string, AgentVariant[]];
      })
      .filter(([, variants]) => variants.length > 0);
  }, [columnClauses, searchQuery, statusFilter, typeEntries, typeTab, returnedStockByVariantId]);

  if (!brand) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1.5" asChild>
          <Link to="/my-inventory">
            <ArrowLeft className="h-4 w-4" />
            Back to inventory
          </Link>
        </Button>
        <div className="rounded-2xl border border-[#E4E7F2] bg-white py-10 text-center">
          <p className="font-medium text-[#02066F]">Brand not found</p>
          <p className="mt-1 text-sm text-muted-foreground">It may have no stock, or the link is outdated.</p>
          <Button className="mt-4" asChild>
            <Link to="/my-inventory">Go to My Inventory</Link>
          </Button>
        </div>
      </div>
    );
  }

  const summary = [
    { label: 'Total stock', value: String(totalStock), emphasize: lowStockCount > 0 && totalStock > 0 },
    { label: 'Returned', value: String(returned.qty), emphasize: false },
    { label: 'Low stock', value: String(lowStockCount), emphasize: lowStockCount > 0 },
  ];

  const brandVariants = typeEntries.flatMap(([, variants]) => variants);
  const statusOptions: Array<{ value: StockStatusFilter; label: string; count: number }> = [
    { value: 'all', label: 'All', count: brandVariants.length },
    { value: 'in_stock', label: 'In stock', count: brandVariants.filter((variant) => variant.stock > 0).length },
    {
      value: 'low',
      label: 'Low stock',
      count: brandVariants.filter((variant) => isLowStock(variant.stock) && variant.stock > 0).length,
    },
    {
      value: 'returned',
      label: 'Returned',
      count: brandVariants.filter((variant) => getReturnedStock(variant.id).qty > 0).length,
    },
    { value: 'out', label: 'Out of stock', count: brandVariants.filter((variant) => variant.stock === 0).length },
  ];
  const quickColumns: QuickFilterColumn<BrandQuickColumn>[] = [
    {
      key: 'type',
      label: 'Variant type',
      searchPlaceholder: 'Search variant type...',
      options: typeEntries.map(([type]) => ({
        value: type,
        label:
          variantTypeByName.get(type.toLowerCase())?.display_name?.trim() ||
          formatVariantTypeLabel(type, true),
      })),
    },
    {
      key: 'variant',
      label: 'Variant',
      searchPlaceholder: 'Search variant...',
      options: brandVariants.map((variant) => ({ value: variant.id, label: variant.name })),
    },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 pb-8 md:p-6">
      <div className="space-y-2">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1.5" asChild>
          <Link to="/my-inventory">
            <ArrowLeft className="h-4 w-4" />
            Back to inventory
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#02066F]">{brand.name}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {itemCount} item{itemCount === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {summary.map((item) => {
          const filter =
            item.label === 'Low stock' ? 'low' : item.label === 'Returned' ? 'returned' : null;
          const active = filter !== null && statusFilter === filter;
          const activeClass =
            filter === 'low'
              ? 'border-amber-300 ring-1 ring-amber-200'
              : 'border-[#C9BDE8] ring-1 ring-[#DDD4F3]';
          const className = `rounded-xl border bg-white px-2 py-3 text-center ${
            active ? activeClass : 'border-[#E4E7F2]'
          }`;
          const content = (
            <>
              <p className="text-[11px] font-medium uppercase tracking-wide text-[#02066F]/50">{item.label}</p>
              <p
                className={`mt-1 text-2xl font-bold tabular-nums leading-none ${
                  item.emphasize ? 'text-amber-600' : 'text-[#14142B]'
                }`}
              >
                {item.value}
              </p>
            </>
          );

          if (!filter) {
            return (
              <div key={item.label} className={className}>
                {content}
              </div>
            );
          }

          return (
            <button
              key={item.label}
              type="button"
              aria-pressed={active}
              aria-label={
                active
                  ? 'Show all variants'
                  : filter === 'low'
                    ? `Show ${lowStockCount} low stock variants`
                    : `Show variants with ${returned.qty} returned units`
              }
              onClick={() => {
                setStatusFilter((current) => (current === filter ? 'all' : filter));
                setTypeTab('all');
              }}
              className={`${className} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#02066F]`}
            >
              {content}
            </button>
          );
        })}
      </div>

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
        <BrandQuickFilterSheet
          showDate={false}
          dateRange={ALL_TIME_DATE_RANGE}
          onDateRangeChange={() => undefined}
          columns={quickColumns}
          columnClauses={columnClauses}
          onColumnClausesChange={setColumnClauses}
          status={statusFilter}
          statusOptions={statusOptions}
          onStatusChange={setStatusFilter}
          onClear={() => {
            setStatusFilter('all');
            setColumnClauses([createQuickFilterAndClause<BrandQuickColumn>()]);
          }}
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
          <span className="ml-1.5 tabular-nums opacity-80">{itemCount}</span>
        </button>
        {typeEntries.map(([type, variants]) => {
          const typeRecord = variantTypeByName.get(type.toLowerCase());
          const tone = variantTypeTone(typeRecord?.color_code);
          const label = typeRecord?.display_name?.trim() || formatVariantTypeLabel(type, true);
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
              {label}
              <span className="ml-1.5 tabular-nums opacity-80">{variants.length}</span>
            </button>
          );
        })}
      </div>

      <div className="space-y-4">
        {filteredTypeEntries.length === 0 ? (
          <div className="rounded-2xl border border-[#E4E7F2] bg-white px-4 py-10 text-center">
            <p className="font-medium text-[#02066F]">No variants match</p>
            <p className="mt-1 text-sm text-muted-foreground">Try another search, type, or filter.</p>
          </div>
        ) : null}
        {filteredTypeEntries.map(([type, variants]) => {
          const typeStock = getTypeStock(variants);
          const CategoryIcon = categoryIcon(type);
          const variantCountLabel = `${variants.length} ${variants.length === 1 ? 'variant' : 'variants'}`;
          const typeRecord = variantTypeByName.get(type.toLowerCase());
          const tone = variantTypeTone(typeRecord?.color_code);
          const savedDescription = typeRecord?.description?.trim();
          const hasPresetSubtitle = ['flavor', 'foc', 'battery', 'posm', 'ncv'].includes(type.toLowerCase());
          const subtitle = !hasPresetSubtitle && savedDescription ? savedDescription : categorySubtitle(type);

          return (
            <section key={type} className={`rounded-2xl border p-3 ${tone.section} ${tone.border}`}>
              <header className="flex items-center gap-3 px-1 pb-3">
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white ring-1 ${tone.icon} ${tone.ring}`}
                >
                  <CategoryIcon className="h-5 w-5" strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className={`text-base font-semibold leading-tight ${tone.title}`}>
                    {typeRecord?.display_name?.trim() || formatVariantTypeLabel(type, true)}
                  </h2>
                  <p className={`mt-0.5 text-xs leading-snug ${tone.muted}`}>{subtitle}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${tone.pill}`}>
                    {variantCountLabel}
                  </span>
                  <span className={`text-[11px] font-medium tabular-nums ${tone.muted}`}>
                    {typeStock} {unitLabel(typeStock)}
                  </span>
                </div>
              </header>

              <div className="space-y-3">
                {variants.map((variant) => {
                  const returnedStock = getReturnedStock(variant.id);
                  return (
                    <VariantCard
                      key={variant.id}
                      variant={variant}
                      returnedStock={returnedStock}
                      accentClassName={tone.accent}
                      onViewReturns={() =>
                        setReturnedDialog({
                          brandName: brand.name,
                          variantName: variant.name,
                          totalReturned: returnedStock.qty,
                          returns: returnedStock.returns,
                        })
                      }
                    />
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <ReturnedStockDetailDialog
        open={!!returnedDialog}
        onOpenChange={(open) => {
          if (!open) setReturnedDialog(null);
        }}
        brandName={returnedDialog?.brandName}
        variantName={returnedDialog?.variantName || ''}
        totalReturned={returnedDialog?.totalReturned || 0}
        returns={returnedDialog?.returns || []}
      />
    </div>
  );
}
