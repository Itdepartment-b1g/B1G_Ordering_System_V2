import { Fragment, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Check, ChevronDown, ClipboardList, Eye, LayoutGrid, List, Loader2, Package, RotateCcw, Search, Truck, X } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  getListPaginationSlice,
  ListPagination,
  type PageSize,
} from '@/features/shared/components/ListPagination';
import { SortableTableHead } from '@/features/shared/components/SortableTableHead';
import {
  createInitialTableSortCycle,
  getNextTableSortCycleState,
  getTableSortDisplayDirection,
  resolveTableSortDirection,
  type TableSortCycleState,
} from '@/features/shared/utils/tableSortCycle';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import {
  clientReturnStatusBadgeClass,
  formatClientReturnReason,
  formatClientReturnStatus,
  getMockReturnLineQty,
  getReturnActionActor,
  type MockClientReturn,
  type MockClientReturnStatus,
} from './clientReturnMock';
import {
  CLIENT_ORDER_RETURNS_QUERY_KEY,
  approveClientOrderReturn,
  buildReturnedInventoryRows,
  canShowClientOrderReturns,
  fetchClientOrderReturns,
  rejectClientOrderReturn,
  type ReturnedInventoryRow,
} from './clientReturnApi';
import { BrandReturnedTable, groupLinesByBrand } from './ClientReturnBrandTable';
import { ClientReturnExpandedMeta } from './ClientReturnExpandedMeta';
import { ClientReturnViewDialog } from './ClientReturnViewDialog';
import { ReturnedInventoryPanel } from './ReturnedInventoryPanel';
import { ReturnedStockDetailDialog } from './ReturnedStockDetailDialog';
import { ReturnLeaderViewDialog } from './ReturnLeaderViewDialog';
import { ReturnToLeaderPanel } from './ReturnToLeaderPanel';
import {
  approveReturnLeaderHandover,
  canCreateReturnLeader,
  canReviewReturnLeaderAsLeader,
  canReviewReturnLeaderAsSuperAdmin,
  CLIENT_RETURN_STOCK_HOLDS_QUERY_KEY,
  fetchClientReturnStockHolds,
  fetchReturnLeaderHandovers,
  rejectReturnLeaderHandover,
  RETURN_LEADER_HANDOVERS_QUERY_KEY,
  type ReturnLeaderHandover,
} from './returnLeaderApi';
import type { PackageProofPhotoItem } from '@/features/shared/components/MultiProofPhotoField';
import {
  DEFAULT_CLIENT_RETURN_HISTORY_SORT_DIRECTION,
  DEFAULT_CLIENT_RETURN_HISTORY_SORT_KEY,
  sortClientReturnHistory,
  type ClientReturnHistorySortKey,
} from './utils/clientReturnsSorting';

const HISTORY_PAGE_SIZE: PageSize = 25;
const VIEW_MODE_KEY = 'client-order-returns-view';
const TABLE_MIN_WIDTH = 'min-w-[78rem]';

type HistoryViewMode = 'table' | 'cards';
type StatusFilter = 'all' | 'pending_leader' | 'posted' | 'rejected';
type PageTab = 'history' | 'inventory' | 'returnToLeader';
type RlConfirmKind = 'approve' | 'reject' | null;

function isCompactViewport() {
  return typeof window !== 'undefined' && window.innerWidth < 1024;
}

function readStoredViewMode(): HistoryViewMode {
  if (isCompactViewport()) return 'cards';
  if (typeof window === 'undefined') return 'table';
  const saved = window.localStorage.getItem(VIEW_MODE_KEY);
  if (saved === 'table' || saved === 'cards') return saved;
  return 'table';
}

function ActorNameCell({ name, at }: { name: string | null; at: string | null }) {
  if (!name) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium" title={name}>
        {name}
      </p>
      {at ? (
        <p className="text-[11px] text-muted-foreground truncate">
          {format(new Date(at), 'MMM d, yyyy')}
        </p>
      ) : null}
    </div>
  );
}

function ReturnStatusBadge({ status }: { status: MockClientReturnStatus }) {
  return (
    <Badge variant="outline" className={`font-normal shrink-0 ${clientReturnStatusBadgeClass(status)}`}>
      {formatClientReturnStatus(status)}
    </Badge>
  );
}

function ReturnedBrandBadges({ brands }: { brands: string[] }) {
  if (brands.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1" title={brands.join(', ')}>
      {brands.map((brand) => (
        <Badge key={brand} variant="secondary" className="font-normal text-[11px] px-1.5 py-0 h-5 max-w-[9rem] truncate">
          {brand}
        </Badge>
      ))}
    </div>
  );
}

function PendingReturnActions({
  onApprove,
  onReject,
  layout = 'row',
}: {
  onApprove: () => void;
  onReject: () => void;
  layout?: 'row' | 'stack';
}) {
  return (
    <div className={layout === 'stack' ? 'grid grid-cols-2 gap-2 w-full' : 'flex items-center justify-end gap-1.5 shrink-0'}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={
          layout === 'stack'
            ? 'h-10 w-full text-red-700 border-red-200 hover:bg-red-50'
            : 'h-8 px-2 text-red-700 border-red-200 hover:bg-red-50'
        }
        onClick={onReject}
      >
        <X className="h-3.5 w-3.5" />
        Reject
      </Button>
      <Button
        type="button"
        size="sm"
        className={
          layout === 'stack'
            ? 'h-10 w-full bg-emerald-600 hover:bg-emerald-700'
            : 'h-8 px-2 bg-emerald-600 hover:bg-emerald-700'
        }
        onClick={onApprove}
      >
        <Check className="h-3.5 w-3.5" />
        Approve
      </Button>
    </div>
  );
}

function uniqueReturnBrands(lines: MockClientReturn['lines']): string[] {
  return groupLinesByBrand(lines).map((group) => group.brandName);
}

function ReturnHistoryCard({
  row,
  canReview,
  onView,
  onApprove,
  onReject,
}: {
  row: MockClientReturn;
  canReview: boolean;
  onView: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const qty = getMockReturnLineQty(row);
  const pending = canReview && row.status === 'pending_leader';
  return (
    <div
      className={`rounded-2xl border bg-background p-4 shadow-sm ${
        pending ? 'border-l-[3px] border-l-amber-400' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="font-mono font-semibold text-sm truncate">{row.returnNumber}</p>
          <p className="font-mono text-xs text-muted-foreground truncate">{row.orderNumber}</p>
          <ReturnStatusBadge status={row.status} />
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-10 w-10 shrink-0 rounded-full"
          onClick={onView}
          aria-label={`View ${row.returnNumber}`}
        >
          <Eye className="h-4 w-4" />
        </Button>
      </div>

      <h3 className="text-lg sm:text-xl font-bold tracking-tight mt-3 truncate">{row.clientName}</h3>

      <div className="grid grid-cols-2 gap-x-3 gap-y-3 mt-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Returned by</p>
          <p className="font-semibold text-sm truncate">{row.returnedByName}</p>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Returned date</p>
          <p className="font-semibold text-sm">{format(new Date(row.returnDate), 'MMM d, yyyy')}</p>
        </div>
        <div className="min-w-0 col-span-2 sm:col-span-1">
          <p className="text-xs text-muted-foreground">Created</p>
          <p className="font-semibold text-sm">{format(new Date(row.createdAt), 'MMM d, yyyy · h:mm a')}</p>
        </div>
        <div className="min-w-0 col-span-2 sm:col-span-1">
          <p className="text-xs text-muted-foreground">Returned brands</p>
          <div className="mt-0.5">
            <ReturnedBrandBadges brands={uniqueReturnBrands(row.lines)} />
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Approved by</p>
          <ActorNameCell name={row.approvedByName} at={row.approvedAt} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Rejected by</p>
          <ActorNameCell name={row.rejectedByName} at={row.rejectedAt} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 mt-3">
        <Badge variant="outline" className="font-normal">
          {formatClientReturnReason(row.reason)}
        </Badge>
        <span className="text-sm font-semibold tabular-nums">
          {qty} {qty === 1 ? 'unit' : 'units'}
        </span>
      </div>

      {pending ? (
        <div className="mt-4 pt-3 border-t">
          <PendingReturnActions layout="stack" onApprove={onApprove} onReject={onReject} />
        </div>
      ) : null}
    </div>
  );
}

function ReturnHistoryDetails({ row }: { row: MockClientReturn }) {
  const brandGroups = groupLinesByBrand(row.lines);
  return (
    <div className="space-y-3 mb-2">
      <ClientReturnExpandedMeta row={row} />
      {brandGroups.map((group) => (
        <BrandReturnedTable key={group.brandName} brandName={group.brandName} variants={group.variants} />
      ))}
    </div>
  );
}

function ViewModeToggle({
  value,
  onChange,
}: {
  value: HistoryViewMode;
  onChange: (mode: HistoryViewMode) => void;
}) {
  const options: { id: HistoryViewMode; label: string; icon: typeof List }[] = [
    { id: 'table', label: 'Table', icon: List },
    { id: 'cards', label: 'Cards', icon: LayoutGrid },
  ];

  return (
    <div className="flex rounded-md border p-0.5 shrink-0">
      {options.map((option) => {
        const Icon = option.icon;
        const active = value === option.id;
        return (
          <Button
            key={option.id}
            type="button"
            variant={active ? 'default' : 'ghost'}
            size="sm"
            className="h-8 gap-1.5 px-2.5 text-xs"
            onClick={() => onChange(option.id)}
          >
            <Icon className="h-3.5 w-3.5" />
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}

function StatusFilterChips({
  value,
  counts,
  onChange,
}: {
  value: StatusFilter;
  counts: Record<StatusFilter, number>;
  onChange: (filter: StatusFilter) => void;
}) {
  const options: { id: StatusFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'pending_leader', label: 'Pending' },
    { id: 'posted', label: 'Approve' },
    { id: 'rejected', label: 'Reject' },
  ];

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1 scrollbar-thin">
      {options.map((option) => {
        const active = value === option.id;
        return (
          <Button
            key={option.id}
            type="button"
            variant={active ? 'default' : 'outline'}
            size="sm"
            className="h-8 px-3 text-xs rounded-full shrink-0"
            onClick={() => onChange(option.id)}
          >
            {option.label}
            <span className="ml-1 tabular-nums opacity-80">{counts[option.id]}</span>
          </Button>
        );
      })}
    </div>
  );
}

export default function ClientOrderReturnsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasWarehouseHubLink } = usePermissions();
  const isLeader = user?.role === 'team_leader';
  const isSuperAdmin = user?.role === 'super_admin';
  const canReview = isLeader;
  const canBulkReturn = canCreateReturnLeader(user?.role);
  const showReturns = canShowClientOrderReturns(hasWarehouseHubLink, user?.role);

  const {
    data: rows = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: [CLIENT_ORDER_RETURNS_QUERY_KEY, user?.company_id],
    enabled: showReturns && !!user?.company_id,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: fetchClientOrderReturns,
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(HISTORY_PAGE_SIZE);
  const [viewRow, setViewRow] = useState<MockClientReturn | null>(null);
  const [viewMode, setViewMode] = useState<HistoryViewMode>(readStoredViewMode);
  const [actionRow, setActionRow] = useState<MockClientReturn | null>(null);
  const [confirmKind, setConfirmKind] = useState<'approve' | 'reject' | null>(null);
  const [acting, setActing] = useState(false);
  const [pageTab, setPageTab] = useState<PageTab>('history');
  const [inventoryRow, setInventoryRow] = useState<ReturnedInventoryRow | null>(null);
  const [rlViewRow, setRlViewRow] = useState<ReturnLeaderHandover | null>(null);
  const [rlActionRow, setRlActionRow] = useState<ReturnLeaderHandover | null>(null);
  const [rlConfirmKind, setRlConfirmKind] = useState<RlConfirmKind>(null);
  const [rlActing, setRlActing] = useState(false);
  const [historySortState, setHistorySortState] =
    useState<TableSortCycleState<ClientReturnHistorySortKey>>(createInitialTableSortCycle);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    setExpandedRows((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const holderId =
    user?.role === 'mobile_sales' || user?.role === 'sales_agent' || user?.role === 'team_leader'
      ? user.id
      : undefined;

  const {
    data: holdRows = [],
    isLoading: holdsLoading,
    isError: holdsError,
  } = useQuery({
    queryKey: [CLIENT_RETURN_STOCK_HOLDS_QUERY_KEY, user?.company_id, holderId],
    enabled: showReturns && !!holderId,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async () => {
      try {
        return await fetchClientReturnStockHolds(holderId!);
      } catch {
        return [];
      }
    },
  });

  const {
    data: rlRows = [],
    isLoading: rlLoading,
    isError: rlIsError,
    error: rlError,
  } = useQuery({
    queryKey: [RETURN_LEADER_HANDOVERS_QUERY_KEY, user?.company_id],
    enabled: showReturns && !!user?.company_id,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async () => {
      try {
        return await fetchReturnLeaderHandovers();
      } catch {
        return [];
      }
    },
  });

  const inventoryRows = useMemo(() => {
    // MS: only their own posted CRs. TL: any posted CRs they can see (team), so detail still
    // shows CR # after stock was transferred to the leader on RL confirm.
    const crForDetail = buildReturnedInventoryRows(
      rows,
      isLeader ? undefined : { holderId }
    );
    const crByVariant = new Map(crForDetail.map((row) => [row.variantId, row]));

    // Holds ledger is the source of truth for Returned Items. fetchClientReturnStockHolds
    // already subtracts qty reserved on pending RL (pending_leader / pending_super_admin),
    // so pending handovers do not duplicate here. Rejected RLs free the qty again.
    if (!holdsError) {
      return holdRows
        .filter((row) => row.qty > 0)
        .map((row) => ({
          ...row,
          returns: crByVariant.get(row.variantId)?.returns || [],
        }));
    }

    if (!holderId) return [];
    return buildReturnedInventoryRows(rows, { holderId });
  }, [holdRows, holdsError, rows, holderId, isLeader]);

  const pendingRlCount = useMemo(
    () =>
      rlRows.filter((row) => {
        if (row.status === 'pending_leader' && canReviewReturnLeaderAsLeader(user?.role, row, user?.id)) {
          return true;
        }
        if (row.status === 'pending_super_admin' && canReviewReturnLeaderAsSuperAdmin(user?.role, row)) {
          return true;
        }
        return false;
      }).length,
    [rlRows, user?.id, user?.role]
  );

  const startApprove = (row: MockClientReturn) => {
    if (!canReview) return;
    setViewRow(null);
    setActionRow(row);
    setConfirmKind('approve');
  };

  const startReject = (row: MockClientReturn) => {
    if (!canReview) return;
    setViewRow(null);
    setActionRow(row);
    setConfirmKind('reject');
  };

  const setAndStoreViewMode = (mode: HistoryViewMode) => {
    setViewMode(mode);
    window.localStorage.setItem(VIEW_MODE_KEY, mode);
  };

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)');
    const onChange = () => {
      if (media.matches) setViewMode('cards');
      else setViewMode(readStoredViewMode());
    };
    media.addEventListener('change', onChange);
    if (media.matches) setViewMode('cards');
    return () => media.removeEventListener('change', onChange);
  }, []);

  const counts = useMemo<Record<StatusFilter, number>>(
    () => ({
      all: rows.length,
      pending_leader: rows.filter((row) => row.status === 'pending_leader').length,
      posted: rows.filter((row) => row.status === 'posted').length,
      rejected: rows.filter((row) => row.status === 'rejected').length,
    }),
    [rows]
  );

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const matched = rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (!query) return true;
      const haystack = [
        row.returnNumber,
        row.orderNumber,
        row.clientName,
        row.returnedByName,
        row.reason,
        formatClientReturnReason(row.reason),
        formatClientReturnStatus(row.status),
        row.notes || '',
        row.rejectionNote || '',
        row.approvedByName || '',
        row.rejectedByName || '',
        ...uniqueReturnBrands(row.lines),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
    const { key, direction } = resolveTableSortDirection(
      historySortState,
      DEFAULT_CLIENT_RETURN_HISTORY_SORT_KEY,
      DEFAULT_CLIENT_RETURN_HISTORY_SORT_DIRECTION
    );
    return sortClientReturnHistory(matched, key, direction);
  }, [rows, searchQuery, statusFilter, historySortState]);

  useEffect(() => {
    setPage(0);
  }, [searchQuery, pageSize, statusFilter, historySortState]);

  const { pagedItems, safePage, pageCount } = getListPaginationSlice(filtered, page, pageSize);

  const handleHistorySort = (key: ClientReturnHistorySortKey) => {
    setHistorySortState((current) => getNextTableSortCycleState(current, key));
  };

  const handleApproveConfirm = async () => {
    if (!canReview || !actionRow || acting) return;
    setActing(true);
    try {
      await approveClientOrderReturn(actionRow.id);
      await queryClient.invalidateQueries({ queryKey: [CLIENT_ORDER_RETURNS_QUERY_KEY] });
      await queryClient.invalidateQueries({ queryKey: ['inventory'] });
      toast({
        title: 'Return approved',
        description: `${actionRow.returnNumber} posted. Returned stock was updated.`,
      });
      setConfirmKind(null);
      setActionRow(null);
    } catch (err) {
      toast({
        title: 'Could not approve return',
        description: err instanceof Error ? err.message : 'Failed to approve client return',
        variant: 'destructive',
      });
    } finally {
      setActing(false);
    }
  };

  const handleRejectConfirm = async (note?: string) => {
    if (!canReview || !actionRow || acting) return;
    setActing(true);
    try {
      await rejectClientOrderReturn(actionRow.id, note);
      await queryClient.invalidateQueries({ queryKey: [CLIENT_ORDER_RETURNS_QUERY_KEY] });
      toast({
        title: 'Return rejected',
        description: `${actionRow.returnNumber} is closed. Agent can file a new CR on the same ORD.`,
      });
      setConfirmKind(null);
      setActionRow(null);
    } catch (err) {
      toast({
        title: 'Could not reject return',
        description: err instanceof Error ? err.message : 'Failed to reject client return',
        variant: 'destructive',
      });
    } finally {
      setActing(false);
    }
  };

  const startRlApprove = (row: ReturnLeaderHandover) => {
    setRlViewRow(null);
    setRlActionRow(row);
    setRlConfirmKind('approve');
  };

  const startRlReject = (row: ReturnLeaderHandover) => {
    setRlViewRow(null);
    setRlActionRow(row);
    setRlConfirmKind('reject');
  };

  const handleRlApproveConfirm = async (photos: PackageProofPhotoItem[]) => {
    if (!rlActionRow || rlActing || !user?.company_id) return;
    setRlActing(true);
    try {
      await approveReturnLeaderHandover(rlActionRow.id, photos, user.company_id);
      await queryClient.invalidateQueries({ queryKey: [RETURN_LEADER_HANDOVERS_QUERY_KEY] });
      await queryClient.invalidateQueries({ queryKey: [CLIENT_RETURN_STOCK_HOLDS_QUERY_KEY] });
      toast({
        title: 'Return confirmed',
        description: `${rlActionRow.returnNumber} received. Stock moved to your Returned Items.`,
      });
      setRlConfirmKind(null);
      setRlActionRow(null);
    } catch (err) {
      toast({
        title: 'Could not confirm return',
        description: err instanceof Error ? err.message : 'Failed to confirm return to leader',
        variant: 'destructive',
      });
    } finally {
      setRlActing(false);
    }
  };

  const handleRlRejectConfirm = async (note?: string) => {
    if (!rlActionRow || rlActing) return;
    setRlActing(true);
    try {
      await rejectReturnLeaderHandover(rlActionRow.id, note);
      await queryClient.invalidateQueries({ queryKey: [RETURN_LEADER_HANDOVERS_QUERY_KEY] });
      await queryClient.invalidateQueries({ queryKey: [CLIENT_RETURN_STOCK_HOLDS_QUERY_KEY] });
      toast({
        title: 'Return rejected',
        description: `${rlActionRow.returnNumber} was rejected.`,
      });
      setRlConfirmKind(null);
      setRlActionRow(null);
    } catch (err) {
      toast({
        title: 'Could not reject return',
        description: err instanceof Error ? err.message : 'Failed to reject return to leader',
        variant: 'destructive',
      });
    } finally {
      setRlActing(false);
    }
  };

  const refreshInventoryQueries = async () => {
    await queryClient.invalidateQueries({ queryKey: [RETURN_LEADER_HANDOVERS_QUERY_KEY] });
    await queryClient.invalidateQueries({ queryKey: [CLIENT_RETURN_STOCK_HOLDS_QUERY_KEY] });
  };

  if (!showReturns) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold tracking-tight">Client Order Returns</h1>
        <p className="text-muted-foreground mt-2">
          Client order returns are available when this company is linked to a warehouse.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6 min-w-0">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Client Order Returns</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          {isSuperAdmin
            ? 'Confirm team leader return handovers (RL). Super admin does not hold stock.'
            : isLeader
              ? 'CR history, returned items you hold, and RL handovers from your team.'
              : 'CR history, your returned items, and submit RL handovers to your team leader.'}
        </p>
      </div>

      <Tabs value={pageTab} onValueChange={(value) => setPageTab(value as PageTab)} className="space-y-4">
        <TabsList
          className={`grid w-full h-auto p-1 ${isSuperAdmin ? 'grid-cols-2' : 'grid-cols-3'}`}
        >
          <TabsTrigger value="history" className="gap-1.5 py-2.5 text-xs sm:text-sm">
            <ClipboardList className="h-4 w-4 shrink-0" />
            Client Returns
          </TabsTrigger>
          {!isSuperAdmin ? (
            <TabsTrigger value="inventory" className="gap-1.5 py-2.5 text-xs sm:text-sm">
              <Package className="h-4 w-4 shrink-0" />
              <span className="sm:hidden">Items</span>
              <span className="hidden sm:inline">Returned Items</span>
              {inventoryRows.length > 0 ? (
                <span className="tabular-nums opacity-80">({inventoryRows.length})</span>
              ) : null}
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="returnToLeader" className="gap-1.5 py-2.5 text-xs sm:text-sm">
            <Truck className="h-4 w-4 shrink-0" />
            <span className="sm:hidden">RL</span>
            <span className="hidden sm:inline">Return to TL</span>
            {pendingRlCount > 0 ? (
              <span className="tabular-nums opacity-80">({pendingRlCount})</span>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="mt-0">
      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <RotateCcw className="h-4 w-4 text-rose-600 shrink-0" />
                <h2 className="font-semibold truncate">
                  {filtered.length} return{filtered.length === 1 ? '' : 's'}
                </h2>
              </div>
              <div className="hidden lg:block">
                <ViewModeToggle value={viewMode} onChange={setAndStoreViewMode} />
              </div>
            </div>
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <div className="min-w-0 flex-1">
                <StatusFilterChips value={statusFilter} counts={counts} onChange={setStatusFilter} />
              </div>
              <div className="relative w-full md:max-w-64 md:ml-auto">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search CR, ORD, client..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="min-w-0">
          {isLoading ? (
            <div className="py-12 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading returns...
            </div>
          ) : isError ? (
            <div className="py-12 text-center space-y-1">
              <p className="text-sm font-medium">Could not load returns</p>
              <p className="text-sm text-muted-foreground">
                {error instanceof Error ? error.message : 'Refresh the page and try again.'}
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center space-y-1">
              <p className="text-sm font-medium">
                {rows.length === 0 ? 'No client returns yet' : 'No matching returns'}
              </p>
              <p className="text-sm text-muted-foreground">
                {rows.length === 0
                  ? 'Returns filed from an approved order will show up here.'
                  : 'Try another status filter or search.'}
              </p>
            </div>
          ) : (
            <>
              {viewMode === 'cards' && (
                <div className="space-y-3">
                  {pagedItems.map((row) => (
                    <ReturnHistoryCard
                      key={row.id}
                      row={row}
                      canReview={canReview}
                      onView={() => setViewRow(row)}
                      onApprove={() => startApprove(row)}
                      onReject={() => startReject(row)}
                    />
                  ))}
                </div>
              )}

              {viewMode === 'table' && (
                <div className="rounded-md border overflow-hidden">
                  <Table className={`table-fixed ${TABLE_MIN_WIDTH}`}>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-10 px-2" />
                        <SortableTableHead
                          label="Return"
                          sortKey="returnNumber"
                          sortDirection={getTableSortDisplayDirection(historySortState, 'returnNumber')}
                          onSort={handleHistorySort}
                          className="w-[12rem]"
                        />
                        <SortableTableHead
                          label="Client"
                          sortKey="clientName"
                          sortDirection={getTableSortDisplayDirection(historySortState, 'clientName')}
                          onSort={handleHistorySort}
                          className="w-[10rem]"
                        />
                        <SortableTableHead
                          label="Returned by"
                          sortKey="returnedByName"
                          sortDirection={getTableSortDisplayDirection(historySortState, 'returnedByName')}
                          onSort={handleHistorySort}
                          className="w-[9rem]"
                        />
                        <SortableTableHead
                          label="Returned date"
                          sortKey="returnDate"
                          sortDirection={getTableSortDisplayDirection(historySortState, 'returnDate')}
                          onSort={handleHistorySort}
                          className="w-[8rem]"
                        />
                        <TableHead className="w-[9rem]">Brands</TableHead>
                        <SortableTableHead
                          label="Status"
                          sortKey="status"
                          sortDirection={getTableSortDisplayDirection(historySortState, 'status')}
                          onSort={handleHistorySort}
                          className="w-[7rem]"
                        />
                        <SortableTableHead
                          label="Approved by"
                          sortKey="approvedByName"
                          sortDirection={getTableSortDisplayDirection(historySortState, 'approvedByName')}
                          onSort={handleHistorySort}
                          className="w-[9rem]"
                        />
                        <SortableTableHead
                          label="Rejected by"
                          sortKey="rejectedByName"
                          sortDirection={getTableSortDisplayDirection(historySortState, 'rejectedByName')}
                          onSort={handleHistorySort}
                          className="w-[9rem]"
                        />
                        <SortableTableHead
                          label="Qty"
                          sortKey="qty"
                          sortDirection={getTableSortDisplayDirection(historySortState, 'qty')}
                          onSort={handleHistorySort}
                          className="w-16 text-right"
                        />
                        {canReview ? <TableHead className="w-[12rem] text-right">Action</TableHead> : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedItems.map((row) => {
                        const qty = getMockReturnLineQty(row);
                        const actor = getReturnActionActor(row);
                        const isOpen = expandedRows.has(row.id);
                        const colSpan = canReview ? 11 : 10;
                        return (
                          <Fragment key={row.id}>
                            <TableRow className={isOpen ? 'bg-muted/20' : undefined}>
                              <TableCell className="px-2">
                                <button
                                  type="button"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
                                  onClick={() => toggleExpanded(row.id)}
                                  aria-expanded={isOpen}
                                  aria-label={isOpen ? 'Collapse return details' : 'Expand return details'}
                                >
                                  <ChevronDown
                                    className={`h-4 w-4 text-muted-foreground transition-transform ${
                                      isOpen ? 'rotate-180' : ''
                                    }`}
                                  />
                                </button>
                              </TableCell>
                              <TableCell className="align-top">
                                <p className="font-mono text-xs font-semibold truncate" title={row.returnNumber}>
                                  {row.returnNumber}
                                </p>
                                <p className="font-mono text-[11px] text-muted-foreground truncate" title={row.orderNumber}>
                                  {row.orderNumber}
                                </p>
                              </TableCell>
                              <TableCell className="align-top truncate" title={row.clientName}>
                                {row.clientName}
                              </TableCell>
                              <TableCell className="align-top truncate" title={row.returnedByName}>
                                {row.returnedByName}
                              </TableCell>
                              <TableCell className="align-top whitespace-nowrap">
                                {format(new Date(row.returnDate), 'MMM d, yyyy')}
                              </TableCell>
                              <TableCell className="align-top">
                                <ReturnedBrandBadges brands={uniqueReturnBrands(row.lines)} />
                              </TableCell>
                              <TableCell className="align-top">
                                <ReturnStatusBadge status={row.status} />
                              </TableCell>
                              <TableCell className="align-top">
                                <ActorNameCell name={row.approvedByName} at={row.approvedAt} />
                              </TableCell>
                              <TableCell className="align-top">
                                <ActorNameCell name={row.rejectedByName} at={row.rejectedAt} />
                              </TableCell>
                              <TableCell className="align-top text-right font-semibold tabular-nums text-rose-700">
                                {qty}
                              </TableCell>
                              {canReview ? (
                                <TableCell className="align-top text-right">
                                  {row.status === 'pending_leader' ? (
                                    <PendingReturnActions
                                      onApprove={() => startApprove(row)}
                                      onReject={() => startReject(row)}
                                    />
                                  ) : null}
                                </TableCell>
                              ) : null}
                            </TableRow>
                            {isOpen ? (
                              <TableRow className="hover:bg-transparent">
                                <TableCell colSpan={colSpan} className="bg-muted/10 p-4">
                                  <div className="space-y-2 min-w-0 max-w-4xl ml-2">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground mb-3">
                                      <p>
                                        Returned date{' '}
                                        <span className="font-medium text-foreground">
                                          {format(new Date(row.returnDate), 'MMM d, yyyy')}
                                        </span>
                                      </p>
                                      <p>
                                        Created{' '}
                                        <span className="font-medium text-foreground">
                                          {format(new Date(row.createdAt), 'MMM d, yyyy · h:mm a')}
                                        </span>
                                      </p>
                                      <p>
                                        Reason{' '}
                                        <Badge variant="outline" className="font-normal">
                                          {formatClientReturnReason(row.reason)}
                                        </Badge>
                                      </p>
                                      {actor.kind ? (
                                        <p className="sm:col-span-2">
                                          {actor.kind === 'reject' ? 'Rejected by' : 'Approved by'}{' '}
                                          <span className="font-medium text-foreground">{actor.name || '—'}</span>
                                          {actor.at ? (
                                            <>
                                              {' · '}
                                              <span className="font-medium text-foreground">
                                                {format(new Date(actor.at), 'MMM d, yyyy · h:mm a')}
                                              </span>
                                            </>
                                          ) : null}
                                        </p>
                                      ) : null}
                                    </div>
                                    <ReturnHistoryDetails row={row} />
                                  </div>
                                </TableCell>
                              </TableRow>
                            ) : null}
                          </Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="mt-4">
                <ListPagination
                  pageSize={pageSize}
                  safePage={safePage}
                  pageCount={pageCount}
                  onPageSizeChange={(value) => {
                    setPageSize(value);
                    setPage(0);
                  }}
                  onPrevious={() => setPage((current) => Math.max(0, current - 1))}
                  onNext={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        {!isSuperAdmin ? (
          <TabsContent value="inventory" className="mt-0">
            {isLoading || holdsLoading ? (
              <Card>
                <CardContent className="py-12 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading returned inventory...
                </CardContent>
              </Card>
            ) : isError ? (
              <Card>
                <CardContent className="py-12 text-center space-y-1">
                  <p className="text-sm font-medium">Could not load returned inventory</p>
                  <p className="text-sm text-muted-foreground">
                    {error instanceof Error ? error.message : 'Refresh the page and try again.'}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <ReturnedInventoryPanel
                rows={inventoryRows}
                onRowClick={(row) => setInventoryRow(row)}
                canBulkReturn={canBulkReturn}
                companyId={user?.company_id}
                submitterName={user?.full_name}
                holderRole={user?.role}
                onSubmitted={() => void refreshInventoryQueries()}
              />
            )}
          </TabsContent>
        ) : null}

        <TabsContent value="returnToLeader" className="mt-0">
          <ReturnToLeaderPanel
            rows={rlRows}
            isLoading={rlLoading}
            isError={rlIsError}
            error={rlError}
            canReviewLeader={(row) => canReviewReturnLeaderAsLeader(user?.role, row, user?.id)}
            canReviewSuperAdmin={(row) => canReviewReturnLeaderAsSuperAdmin(user?.role, row)}
            onView={(row) => setRlViewRow(row)}
            onApprove={startRlApprove}
            onReject={startRlReject}
          />
        </TabsContent>
      </Tabs>

      <ReturnedStockDetailDialog
        open={!!inventoryRow}
        onOpenChange={(open) => {
          if (!open) setInventoryRow(null);
        }}
        brandName={inventoryRow?.brandName}
        variantName={inventoryRow?.variantName || ''}
        variantType={inventoryRow?.variantType}
        variantId={inventoryRow?.variantId}
        totalReturned={inventoryRow?.qty || 0}
        returns={inventoryRow?.returns || []}
      />

      <ClientReturnViewDialog
        open={!!viewRow}
        onOpenChange={(open) => {
          if (!open) setViewRow(null);
        }}
        row={viewRow}
      />

      <ClientReturnViewDialog
        mode={confirmKind === 'reject' ? 'reject' : confirmKind === 'approve' ? 'approve' : 'view'}
        open={confirmKind === 'approve' || confirmKind === 'reject'}
        row={actionRow}
        acting={acting}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !acting) {
            setConfirmKind(null);
            setActionRow(null);
          }
        }}
        onApprove={() => void handleApproveConfirm()}
        onReject={(note) => void handleRejectConfirm(note)}
      />

      <ReturnLeaderViewDialog
        open={!!rlViewRow}
        onOpenChange={(open) => {
          if (!open) setRlViewRow(null);
        }}
        row={rlViewRow}
      />

      <ReturnLeaderViewDialog
        mode={rlConfirmKind === 'reject' ? 'reject' : rlConfirmKind === 'approve' ? 'approve' : 'view'}
        open={rlConfirmKind === 'approve' || rlConfirmKind === 'reject'}
        row={rlActionRow}
        acting={rlActing}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !rlActing) {
            setRlConfirmKind(null);
            setRlActionRow(null);
          }
        }}
        onApprove={(photos) => void handleRlApproveConfirm(photos)}
        onReject={(note) => void handleRlRejectConfirm(note)}
      />
    </div>
  );
}
