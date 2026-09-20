import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Loader2, Package, Truck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import {
  CLIENT_ORDER_RETURNS_QUERY_KEY,
  buildReturnedInventoryRows,
  canShowClientOrderReturns,
  fetchClientOrderReturns,
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
  fetchClientReturnStockHolds,
  fetchReturnLeaderHandovers,
  rejectReturnLeaderHandover,
  RETURN_LEADER_HANDOVERS_QUERY_KEY,
  type ReturnLeaderHandover,
} from './returnLeaderApi';
import type { PackageProofPhotoItem } from '@/features/shared/components/MultiProofPhotoField';

type PageTab = 'history' | 'inventory' | 'returnToLeader';
type RlConfirmKind = 'approve' | 'reject' | null;

export default function ClientOrderReturnsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasWarehouseHubLink } = usePermissions();
  const isLeader = user?.role === 'team_leader';
  const isSuperAdmin = user?.role === 'super_admin';
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
            ? 'CR history, refunds waiting for Super Admin, and team leader return handovers (RL). Super admin does not hold stock.'
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
          <ClientReturnHistoryList
            rows={rows}
            isLoading={isLoading}
            isError={isError}
            error={error}
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
