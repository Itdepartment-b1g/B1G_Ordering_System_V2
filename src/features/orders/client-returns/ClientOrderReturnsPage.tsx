import { Component, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Loader2, Package, Truck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePermissions } from '@/hooks/usePermissions';
import { subscribeToTable, unsubscribe } from '@/lib/realtime.helpers';
import {
  buildReturnedInventoryRows,
  canShowClientOrderReturns,
  CLIENT_ORDER_RETURNS_QUERY_KEY,
  fetchClientOrderReturns,
  NO_WAREHOUSE_DISPOSAL_NOTE,
  type ReturnedInventoryRow,
} from './clientReturnApi';
import { ClientReturnHistoryList } from './ClientReturnHistoryList';
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
  countsTowardPendingReturnLeaderBadge,
  fetchClientReturnStockHolds,
  fetchReturnLeaderHandovers,
  rejectReturnLeaderHandover,
  RETURN_LEADER_HANDOVERS_QUERY_KEY,
  type ReturnLeaderHandover,
} from './returnLeaderApi';
import type { PackageProofPhotoItem } from '@/features/shared/components/MultiProofPhotoField';
import type { PreviewClientReturn } from './clientReturnPreview';

type PageTab = 'history' | 'inventory' | 'returnToLeader';

class PageErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-4 md:p-8">
          <h1 className="text-2xl font-bold tracking-tight">Client Order Returns</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This page could not be shown. Refresh and try again.
          </p>
          <p className="mt-2 text-sm text-destructive">{this.state.error.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}
type RlConfirmKind = 'approve' | 'reject' | null;

const EMPTY_RETURNS: PreviewClientReturn[] = [];
const EMPTY_HANDOVERS: ReturnLeaderHandover[] = [];
const EMPTY_HOLDS: ReturnedInventoryRow[] = [];

export default function ClientOrderReturnsPage() {
  return (
    <PageErrorBoundary>
      <ClientOrderReturnsView />
    </PageErrorBoundary>
  );
}

function ClientOrderReturnsView() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const { hasWarehouseHubLink, hasWarehouseHubLinkLoading } = usePermissions();
  const isLeader = user?.role === 'team_leader';
  const isSuperAdmin = user?.role === 'super_admin';
  const canBulkReturn = canCreateReturnLeader(user?.role);
  const showReturns = canShowClientOrderReturns(hasWarehouseHubLink, user?.role);

  const liveQueryOpts = {
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always' as const,
    refetchOnWindowFocus: true,
    refetchInterval: 8_000,
  };

  const {
    data: returnsData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: [CLIENT_ORDER_RETURNS_QUERY_KEY, 'list', user?.company_id],
    enabled: showReturns && !!user?.company_id,
    queryFn: fetchClientOrderReturns,
    ...liveQueryOpts,
  });
  const rows = Array.isArray(returnsData) ? returnsData : EMPTY_RETURNS;

  const [pageTab, setPageTab] = useState<PageTab>('history');
  const [inventoryRow, setInventoryRow] = useState<ReturnedInventoryRow | null>(null);
  const [rlViewRow, setRlViewRow] = useState<ReturnLeaderHandover | null>(null);
  const [rlActionRow, setRlActionRow] = useState<ReturnLeaderHandover | null>(null);
  const [rlConfirmKind, setRlConfirmKind] = useState<RlConfirmKind>(null);
  const [rlActing, setRlActing] = useState(false);

  const holderId =
    user?.role === 'mobile_sales' || user?.role === 'sales_agent' || user?.role === 'team_leader'
      ? user.id
      : undefined;

  const {
    data: holdsData,
    isLoading: holdsLoading,
    isError: holdsError,
  } = useQuery({
    queryKey: [CLIENT_RETURN_STOCK_HOLDS_QUERY_KEY, holderId],
    enabled: showReturns && !!holderId,
    queryFn: () => fetchClientReturnStockHolds(holderId!),
    ...liveQueryOpts,
  });
  const holdRows = Array.isArray(holdsData) ? holdsData : EMPTY_HOLDS;

  const {
    data: handoversData,
    isLoading: rlLoading,
    isError: rlIsError,
    error: rlError,
  } = useQuery({
    queryKey: [RETURN_LEADER_HANDOVERS_QUERY_KEY, user?.company_id],
    enabled: showReturns && !!user?.company_id,
    queryFn: fetchReturnLeaderHandovers,
    ...liveQueryOpts,
  });
  const rlRows = Array.isArray(handoversData) ? handoversData : EMPTY_HANDOVERS;

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
      rlRows.filter((row) =>
        countsTowardPendingReturnLeaderBadge(user?.role, user?.id, row)
      ).length,
    [rlRows, user?.id, user?.role]
  );

  // Keep Client Returns / Return to TL / Returned Items in sync (same user + other users).
  useEffect(() => {
    if (!showReturns || !user?.company_id) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void queryClient.refetchQueries({ queryKey: [CLIENT_ORDER_RETURNS_QUERY_KEY], type: 'active' });
        void queryClient.refetchQueries({ queryKey: [RETURN_LEADER_HANDOVERS_QUERY_KEY], type: 'active' });
        void queryClient.refetchQueries({ queryKey: [CLIENT_RETURN_STOCK_HOLDS_QUERY_KEY], type: 'active' });
      }, 200);
    };

    // No column filters: filtered realtime often fails until publication + REPLICA IDENTITY
    // are applied; unfiltered still only delivers rows the session can SELECT (RLS).
    const channels = [
      subscribeToTable('client_order_returns', refresh),
      subscribeToTable('return_leader_handovers', refresh),
      subscribeToTable('client_return_stock_holds', refresh),
    ];

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      channels.forEach(unsubscribe);
    };
  }, [showReturns, user?.company_id, queryClient]);

  // Also refetch when switching tabs so Client Returns never shows a stale cache.
  useEffect(() => {
    if (!showReturns) return;
    void queryClient.refetchQueries({ queryKey: [CLIENT_ORDER_RETURNS_QUERY_KEY], type: 'active' });
    void queryClient.refetchQueries({ queryKey: [RETURN_LEADER_HANDOVERS_QUERY_KEY], type: 'active' });
    void queryClient.refetchQueries({ queryKey: [CLIENT_RETURN_STOCK_HOLDS_QUERY_KEY], type: 'active' });
  }, [pageTab, showReturns, queryClient]);

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

  const refreshInventoryQueries = async () => {
    await Promise.all([
      queryClient.refetchQueries({ queryKey: [RETURN_LEADER_HANDOVERS_QUERY_KEY] }),
      queryClient.refetchQueries({ queryKey: [CLIENT_RETURN_STOCK_HOLDS_QUERY_KEY] }),
      queryClient.refetchQueries({ queryKey: [CLIENT_ORDER_RETURNS_QUERY_KEY] }),
    ]);
  };

  const handleRlApproveConfirm = async (photos: PackageProofPhotoItem[]) => {
    if (!rlActionRow || rlActing || !user?.company_id) return;
    setRlActing(true);
    try {
      await approveReturnLeaderHandover(rlActionRow.id, photos, user.company_id);
      await refreshInventoryQueries();
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
      await refreshInventoryQueries();
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

  if (hasWarehouseHubLinkLoading) {
    return (
      <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading client order returns...
      </div>
    );
  }

  if (!showReturns) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold tracking-tight">Client Order Returns</h1>
        <p className="text-muted-foreground mt-2">
          Client order returns are not available for this role.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-full min-w-0 overflow-x-hidden p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Client Order Returns</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          {isSuperAdmin
            ? 'CR history, refunds waiting for Super Admin, and team leader return handovers (RL). Super admin does not hold stock.'
            : isLeader
              ? 'CR history, returned items you hold, and RL handovers from your team.'
              : 'CR history, your returned items, and submit RL handovers to your team leader.'}
        </p>
      </div>

      {!hasWarehouseHubLink ? (
        <div
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          {NO_WAREHOUSE_DISPOSAL_NOTE}
        </div>
      ) : null}

      <Tabs value={pageTab} onValueChange={(value) => setPageTab(value as PageTab)} className="space-y-4">
        <TabsList
          className={`grid w-full h-auto p-1 ${isSuperAdmin ? 'grid-cols-2' : 'grid-cols-3'}`}
        >
          <TabsTrigger value="history" className="h-auto gap-1.5 whitespace-normal py-2.5 text-xs sm:text-sm">
            <ClipboardList className="h-4 w-4 shrink-0" />
            Client Returns
          </TabsTrigger>
          {!isSuperAdmin ? (
            <TabsTrigger value="inventory" className="h-auto gap-1.5 whitespace-normal py-2.5 text-xs sm:text-sm">
              <Package className="h-4 w-4 shrink-0" />
              <span className="sm:hidden">Items</span>
              <span className="hidden sm:inline">Returned Items (Disposals)</span>
              {inventoryRows.length > 0 ? (
                <span className="tabular-nums opacity-80">({inventoryRows.length})</span>
              ) : null}
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="returnToLeader" className="h-auto gap-1.5 whitespace-normal py-2.5 text-xs sm:text-sm">
            <Truck className="h-4 w-4 shrink-0" />
            <span className="sm:hidden">RL</span>
            <span className="hidden sm:inline">Return to TL</span>
            {pendingRlCount > 0 ? (
              <span className="tabular-nums opacity-80">({pendingRlCount})</span>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="mt-0">
          <ClientReturnHistoryList
            rows={rows}
            isLoading={isLoading}
            isError={isError}
            error={error}
            getDetailHref={(row) => `/client-order-returns/cr/${row.id}`}
          />
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
                onRowClick={(row) => {
                  if (isMobile) {
                    navigate(`/client-order-returns/item/${row.variantId}`);
                    return;
                  }
                  setInventoryRow(row);
                }}
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
            onView={(row) => {
              if (isMobile) {
                navigate(`/client-order-returns/rl/${row.id}`);
                return;
              }
              setRlViewRow(row);
            }}
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
