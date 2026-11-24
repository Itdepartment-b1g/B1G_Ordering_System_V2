import { useMemo, type ElementType } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowLeftRight,
  Loader2,
  Package,
  PackageOpen,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import {
  buildReturnedInventoryRows,
  canShowClientOrderReturns,
  CLIENT_ORDER_RETURNS_QUERY_KEY,
  fetchClientOrderReturns,
  type ReturnedInventoryRow,
} from './clientReturnApi';
import { CLIENT_RETURN_STOCK_HOLDS_QUERY_KEY, fetchClientReturnStockHolds } from './returnLeaderApi';
import { formatVariantType, variantTypeBadgeClass } from './ClientReturnBrandTable';
import { ClientReturnHistoryList } from './ClientReturnHistoryList';
import type { PreviewClientReturn } from './clientReturnPreview';

const EMPTY_RETURNS: PreviewClientReturn[] = [];
const EMPTY_HOLDS: ReturnedInventoryRow[] = [];

type StatCardProps = {
  label: string;
  value: string;
  icon: ElementType;
  accentClassName: string;
};

function StatCard({ label, value, icon: Icon, accentClassName }: StatCardProps) {
  return (
    <div className="flex items-center gap-3 border border-border/70 bg-background px-3 py-2.5">
      <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center', accentClassName)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold tabular-nums leading-tight">{value}</p>
      </div>
    </div>
  );
}

export default function ReturnedStockDetailPage() {
  const { variantId = '' } = useParams<{ variantId: string }>();
  const { user } = useAuth();
  const { hasWarehouseHubLink } = usePermissions();
  const showReturns = canShowClientOrderReturns(hasWarehouseHubLink, user?.role);
  const isLeader = user?.role === 'team_leader';

  const holderId =
    user?.role === 'mobile_sales' || user?.role === 'sales_agent' || user?.role === 'team_leader'
      ? user.id
      : undefined;

  const { data: rows = EMPTY_RETURNS, isLoading: listLoading } = useQuery({
    queryKey: [CLIENT_ORDER_RETURNS_QUERY_KEY, 'list', user?.company_id],
    enabled: showReturns && !!user?.company_id,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: fetchClientOrderReturns,
  });

  const {
    data: holdRows = EMPTY_HOLDS,
    isLoading: holdsLoading,
    isError: holdsErrorMsg,
  } = useQuery({
    queryKey: [CLIENT_RETURN_STOCK_HOLDS_QUERY_KEY, holderId],
    enabled: showReturns && !!holderId,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: () => fetchClientReturnStockHolds(holderId!),
  });

  const inventoryRow = useMemo(() => {
    const crForDetail = buildReturnedInventoryRows(rows, isLeader ? undefined : { holderId });
    const crByVariant = new Map(crForDetail.map((row) => [row.variantId, row]));

    if (!holdsErrorMsg) {
      const hold = holdRows.find((row) => row.variantId === variantId && row.qty > 0);
      if (!hold) return null;
      return {
        ...hold,
        returns: crByVariant.get(hold.variantId)?.returns || [],
      };
    }

    if (!holderId) return null;
    return buildReturnedInventoryRows(rows, { holderId }).find((row) => row.variantId === variantId) || null;
  }, [holdRows, holdsErrorMsg, holderId, isLeader, rows, variantId]);

  const scopedReturns = inventoryRow?.returns || EMPTY_RETURNS;

  const stats = useMemo(() => {
    let totalUnits = 0;
    let totalRestock = 0;
    let totalDisposals = 0;
    let changeItemCount = 0;

    for (const row of scopedReturns) {
      if (row.returnType === 'change_item') changeItemCount += 1;

      const lines = (row.lines || []).filter((line) => !variantId || line.variantId === variantId);
      for (const line of lines) {
        const qty = Number(line.quantity) || 0;
        totalUnits += qty;
        if (line.stockFate === 'restock') totalRestock += qty;
        else totalDisposals += qty;
      }
    }

    // Held disposal qty is the source of truth for this page when CR history is incomplete.
    const heldQty = inventoryRow?.qty || 0;
    if (heldQty > totalUnits) {
      totalDisposals += heldQty - totalUnits;
      totalUnits = heldQty;
    }

    return {
      totalReturns: scopedReturns.length,
      totalUnits,
      totalRestock,
      totalDisposals,
      changeItemCount,
    };
  }, [scopedReturns, variantId, inventoryRow?.qty]);

  const loading = listLoading || holdsLoading;

  if (!showReturns) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1.5" asChild>
          <Link to="/client-order-returns">
            <ArrowLeft className="h-4 w-4" />
            Back to returned items
          </Link>
        </Button>
        <p className="text-sm text-muted-foreground">
          Returned stock is not available for this account.
        </p>
      </div>
    );
  }

  if (loading && !inventoryRow) {
    return (
      <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading returned items…
      </div>
    );
  }

  if (!inventoryRow) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1.5" asChild>
          <Link to="/client-order-returns">
            <ArrowLeft className="h-4 w-4" />
            Back to returned items
          </Link>
        </Button>
        <p className="text-sm font-medium">Returned item not found</p>
        <p className="text-sm text-muted-foreground">
          This variant is not in your returned stock holdings.
        </p>
        <Button asChild>
          <Link to="/client-order-returns">Go to Returned Items</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 pb-8 md:p-6">
      <div className="space-y-1">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1.5" asChild>
          <Link to="/client-order-returns">
            <ArrowLeft className="h-4 w-4" />
            Back to returned items
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">RETURNED STOCKS</h1>
        </div>
        <div className="space-y-1 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-medium leading-snug">
              {[inventoryRow.brandName, inventoryRow.variantName || 'Selected variant']
                .filter(Boolean)
                .join(' - ')}
            </p>
            {inventoryRow.variantType ? (
              <Badge
                variant="secondary"
                className={`font-normal ${variantTypeBadgeClass(inventoryRow.variantType)}`}
              >
                {formatVariantType(inventoryRow.variantType)}
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            Showing client returns for this held returned variant.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <StatCard
          label="Total Returns"
          value={stats.totalReturns.toLocaleString()}
          icon={PackageOpen}
          accentClassName="bg-sky-50 text-sky-700"
        />
        <StatCard
          label="Total Units"
          value={stats.totalUnits.toLocaleString()}
          icon={Package}
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
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading returned items…
        </div>
      ) : (
        <ClientReturnHistoryList
          embedded
          showConditionFilter={false}
          resetKey={inventoryRow.variantId}
          rows={scopedReturns}
          emptyTitle={
            inventoryRow.qty > 0 ? 'No matching client returns' : 'No returns for this variant'
          }
          emptyDescription={
            inventoryRow.qty > 0
              ? 'Stock is held, but linked CR history was not found.'
              : undefined
          }
          getDetailHref={(row) => `/client-order-returns/cr/${row.id}`}
        />
      )}
    </div>
  );
}
