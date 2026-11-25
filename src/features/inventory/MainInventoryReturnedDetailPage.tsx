import { useMemo, type ElementType } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowLeftRight,
  Banknote,
  Loader2,
  PackageOpen,
  RotateCcw,
  Tags,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth';
import { usePermissions } from '@/hooks/usePermissions';
import {
  canShowClientOrderReturns,
  CLIENT_ORDER_RETURNS_QUERY_KEY,
  fetchClientOrderReturns,
} from '@/features/orders/client-returns/clientReturnApi';
import {
  formatClientReturnPeso,
  type PreviewClientReturn,
  type PreviewClientReturnLine,
} from '@/features/orders/client-returns/clientReturnPreview';
import {
  formatVariantType,
  variantTypeBadgeClass,
} from '@/features/orders/client-returns/ClientReturnBrandTable';
import { ClientReturnHistoryList } from '@/features/orders/client-returns/ClientReturnHistoryList';
import { cn } from '@/lib/utils';

const EMPTY_RETURNS: PreviewClientReturn[] = [];

type StatCardProps = {
  label: string;
  value: string;
  icon: ElementType;
  accentClassName: string;
};

function StatCard({ label, value, icon: Icon, accentClassName }: StatCardProps) {
  return (
    <div className="flex items-center gap-3 border border-border/70 bg-background px-3 py-2.5">
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center',
          accentClassName
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold tabular-nums leading-tight">{value}</p>
      </div>
    </div>
  );
}

function lineMatchesVariant(
  line: PreviewClientReturnLine,
  variantId: string,
  brandId?: string | null
) {
  if (!line.variantId || line.variantId !== variantId) return false;
  if (brandId) {
    const lineBrand = line.brandId || '';
    // Prefer brandId match when both sides have ids; fall back to variant-only.
    if (lineBrand && lineBrand !== brandId) return false;
  }
  return true;
}

function returnMatchesVariant(
  row: PreviewClientReturn,
  variantId: string,
  brandId?: string | null
) {
  return (row.lines || []).some((line) => lineMatchesVariant(line, variantId, brandId));
}

/** Returned stock for a Main Inventory variant (scoped by route + optional brandId). */
export default function MainInventoryReturnedDetailPage() {
  const { variantId = '' } = useParams<{ variantId?: string }>();
  const [searchParams] = useSearchParams();
  const brandId = searchParams.get('brandId') || '';
  const brandNameParam = searchParams.get('brandName') || '';
  const variantNameParam = searchParams.get('variantName') || '';

  const { user } = useAuth();
  const { hasWarehouseHubLink } = usePermissions();
  const showReturns =
    canShowClientOrderReturns(hasWarehouseHubLink, user?.role) && user?.role !== 'warehouse';

  const { data: allRows = EMPTY_RETURNS, isLoading } = useQuery({
    queryKey: [CLIENT_ORDER_RETURNS_QUERY_KEY, 'main-inventory', user?.company_id],
    enabled: showReturns && !!user?.company_id,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: fetchClientOrderReturns,
  });

  const scopedRows = useMemo(() => {
    if (!variantId) return allRows;
    return allRows.filter((row) => returnMatchesVariant(row, variantId, brandId || null));
  }, [allRows, variantId, brandId]);

  const variantMeta = useMemo(() => {
    if (!variantId) {
      return {
        brandName: brandNameParam || null,
        variantName: variantNameParam || null,
        variantType: null as string | null,
      };
    }
    for (const row of scopedRows) {
      const line = (row.lines || []).find((l) => lineMatchesVariant(l, variantId, brandId || null));
      if (line) {
        return {
          brandName: brandNameParam || line.brandName || null,
          variantName: variantNameParam || line.variantName || null,
          variantType: line.variantType || null,
        };
      }
    }
    return {
      brandName: brandNameParam || null,
      variantName: variantNameParam || null,
      variantType: null as string | null,
    };
  }, [scopedRows, variantId, brandId, brandNameParam, variantNameParam]);

  const stats = useMemo(() => {
    const brands = new Set<string>();
    let totalRestock = 0;
    let totalDisposals = 0;
    let changeItemCount = 0;
    let totalRefund = 0;

    for (const row of scopedRows) {
      if (row.returnType === 'change_item') changeItemCount += 1;

      const lines = variantId
        ? (row.lines || []).filter((line) => lineMatchesVariant(line, variantId, brandId || null))
        : row.lines || [];

      if (row.returnType === 'refund') {
        for (const line of lines) {
          const lineTotal = Number(line.lineTotal);
          if (Number.isFinite(lineTotal) && lineTotal > 0) totalRefund += lineTotal;
          else totalRefund += (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);
        }
      }

      for (const line of lines) {
        const qty = Number(line.quantity) || 0;
        if (line.stockFate === 'restock') totalRestock += qty;
        else totalDisposals += qty;

        const brand = String(line.brandName || '').trim();
        if (brand) brands.add(brand);
      }
    }

    return {
      totalReturns: scopedRows.length,
      totalBrand: brands.size,
      totalRestock,
      totalDisposals,
      changeItemCount,
      totalRefund,
    };
  }, [scopedRows, variantId, brandId]);

  if (!showReturns) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1.5" asChild>
          <Link to="/inventory/main">
            <ArrowLeft className="h-4 w-4" />
            Back to Main Inventory
          </Link>
        </Button>
        <p className="text-sm text-muted-foreground">
          Returned stock is not available for this account.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 pb-8 md:p-6">
      <div className="space-y-1">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1.5" asChild>
          <Link to="/inventory/main">
            <ArrowLeft className="h-4 w-4" />
            Back to Main Inventory
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">RETURNED STOCKS</h1>
        </div>
        {variantId ? (
          <div className="space-y-1 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-medium leading-snug">
                {[variantMeta.brandName, variantMeta.variantName || 'Selected variant']
                  .filter(Boolean)
                  .join(' - ')}
              </p>
              {variantMeta.variantType ? (
                <Badge
                  variant="secondary"
                  className={`font-normal ${variantTypeBadgeClass(variantMeta.variantType)}`}
                >
                  {formatVariantType(variantMeta.variantType)}
                </Badge>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              Showing client returns for this variant only.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Client returns affecting main inventory, with restock and disposal totals.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
        <StatCard
          label="Total Returns"
          value={stats.totalReturns.toLocaleString()}
          icon={PackageOpen}
          accentClassName="bg-sky-50 text-sky-700"
        />
        <StatCard
          label="Total Brand"
          value={stats.totalBrand.toLocaleString()}
          icon={Tags}
          accentClassName="bg-slate-100 text-slate-700"
        />
        <StatCard
          label="Total Restock"
          value={stats.totalRestock.toLocaleString()}
          icon={RotateCcw}
          accentClassName="bg-emerald-50 text-emerald-700"
        />
        <StatCard
          label="Total Disposals"
          value={stats.totalDisposals.toLocaleString()}
          icon={Trash2}
          accentClassName="bg-rose-50 text-rose-700"
        />
        <StatCard
          label="Total Change Item"
          value={stats.changeItemCount.toLocaleString()}
          icon={ArrowLeftRight}
          accentClassName="bg-amber-50 text-amber-800"
        />
        <StatCard
          label="Total Refund"
          value={formatClientReturnPeso(stats.totalRefund)}
          icon={Banknote}
          accentClassName="bg-violet-50 text-violet-700"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading returned items…
        </div>
      ) : (
        <ClientReturnHistoryList
          embedded
          showConditionFilter={false}
          resetKey={`${variantId}|${brandId}|${scopedRows.length}`}
          rows={scopedRows}
          stockFateVariantId={variantId || undefined}
          emptyTitle={
            variantId
              ? 'No returned stock for this variant'
              : 'No returned stock yet'
          }
          emptyDescription={
            variantId
              ? 'There are no client returns linked to this SKU.'
              : 'Posted client returns will show up here.'
          }
          getDetailHref={(row) => `/client-order-returns/cr/${row.id}`}
        />
      )}
    </div>
  );
}
