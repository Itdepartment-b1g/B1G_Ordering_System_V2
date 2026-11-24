import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  agreementProgress,
  cancelCompanyPriceChange,
  fetchAgentToLeaderNameMap,
  fetchLeaderTeamReportIds,
  fetchPriceChangeBatchDetail,
  fetchPriceChangeBatches,
  filterVisiblePriceAgreements,
  priceAgreementRoleLabel,
  priceChangeScopeLabel,
  type CompanyPriceChangeAgreement,
  type CompanyPriceChangeBatch,
  type PriceChangeBatchStatus,
} from './companyPriceChangeApi';
import { PriceChangeItemsGroupedTable } from './PriceChangeItemsGroupedTable';
import { cn } from '@/lib/utils';

function statusBadge(status: PriceChangeBatchStatus) {
  switch (status) {
    case 'pending_agreement':
      return 'bg-amber-50 text-amber-900 border-amber-200';
    case 'applied':
      return 'bg-green-50 text-green-900 border-green-200';
    case 'rejected':
    case 'cancelled':
      return 'bg-red-50 text-red-900 border-red-200';
    default:
      return '';
  }
}

function statusLabel(status: PriceChangeBatchStatus) {
  switch (status) {
    case 'pending_agreement':
      return 'Pending agreement';
    case 'applied':
      return 'Applied';
    case 'rejected':
      return 'Rejected';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status;
  }
}

function typeLabel(batch: CompanyPriceChangeBatch) {
  if (batch.scope_type === 'team') {
    const names = (
      batch.target_leader_names ||
      batch.target_leader_name ||
      ''
    ).trim();
    return names ? `Bags only — ${names}` : 'Bags only — Team';
  }
  return 'Company (Main + bags)';
}

function sortAgreements(agreements: CompanyPriceChangeAgreement[]) {
  return [...agreements].sort((a, b) => {
    const rank = (s: string) => (s === 'pending' ? 0 : s === 'confirmed' ? 1 : 2);
    const byStatus = rank(a.status) - rank(b.status);
    if (byStatus !== 0) return byStatus;
    return a.profile_name.localeCompare(b.profile_name);
  });
}

function BatchDetail({
  batchId,
  canCancel,
  onCancelled,
  viewerRole,
  viewerId,
  teamReportIds,
  leaderNameByAgentId,
}: {
  batchId: string;
  canCancel: boolean;
  onCancelled: () => void;
  viewerRole: string | undefined;
  viewerId: string | undefined;
  teamReportIds: string[];
  leaderNameByAgentId: Record<string, string>;
}) {
  const { toast } = useToast();
  const { data: batch, isLoading } = useQuery({
    queryKey: ['price-history-detail', batchId],
    queryFn: () => fetchPriceChangeBatchDetail(batchId),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const isTeamScope = batch?.scope_type === 'team';

  const cancelMutation = useMutation({
    mutationFn: () => cancelCompanyPriceChange(batchId),
    onSuccess: () => {
      toast({
        title: 'Cancelled',
        description: isTeamScope
          ? 'Batch cancelled. Confirmed bags reverted where applicable. Main was not changed.'
          : 'Main prices reverted to previous values. Confirmed bags reverted where applicable.',
      });
      onCancelled();
    },
    onError: (err: Error) => {
      toast({ title: 'Cancel failed', description: err.message, variant: 'destructive' });
    },
  });

  if (isLoading || !batch) {
    return (
      <div className="py-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading details…
      </div>
    );
  }

  const visibleAgreements = filterVisiblePriceAgreements(batch.agreements, {
    role: viewerRole,
    profileId: viewerId,
    teamReportIds,
  });
  const progress = agreementProgress(visibleAgreements);
  const sortedAgreements = sortAgreements(visibleAgreements);
  const showCompanyProgress = viewerRole === 'super_admin' || viewerRole === 'admin';
  const createdAt = new Date(batch.created_at).toLocaleString();
  const itemCount = batch.items?.length ?? 0;
  const lastUpdatedAt = (() => {
    const items = batch.items ?? [];
    let maxMs = 0;
    let raw: string | null = batch.main_applied_at;
    for (const item of items) {
      const at = item.updated_at || item.created_at;
      const ms = new Date(at).getTime();
      if (ms > maxMs) {
        maxMs = ms;
        raw = at;
      }
    }
    if (batch.main_applied_at) {
      const mainMs = new Date(batch.main_applied_at).getTime();
      if (mainMs > maxMs) raw = batch.main_applied_at;
    }
    return raw ? new Date(raw).toLocaleString() : createdAt;
  })();

  return (
    <div className="space-y-5 py-4">
      <div className="rounded-lg border bg-card px-4 py-3 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Details
        </p>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm items-start">
          <div className="min-w-0">
            <dt className="text-muted-foreground text-xs mb-0.5">Created by</dt>
            <dd className="font-medium leading-6">{batch.created_by_name || '—'}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground text-xs mb-0.5">Created at</dt>
            <dd className="font-medium leading-6">{createdAt}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground text-xs mb-0.5">Last price update</dt>
            <dd className="font-medium leading-6">{lastUpdatedAt}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground text-xs mb-0.5">SKU changes</dt>
            <dd className="font-medium leading-6 tabular-nums">{itemCount}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground text-xs mb-0.5">Type</dt>
            <dd className="font-medium leading-6">{typeLabel(batch)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground text-xs mb-0.5">Status</dt>
            <dd className="leading-6">
              <Badge variant="outline" className={cn('font-normal', statusBadge(batch.status))}>
                {statusLabel(batch.status)}
              </Badge>
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground text-xs mb-0.5">Total confirmed</dt>
            <dd className="font-medium leading-6 tabular-nums">
              {(showCompanyProgress || viewerRole === 'team_leader') && progress.total > 0
                ? `${progress.confirmed} / ${progress.total}`
                : '—'}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground text-xs mb-0.5">Breakdown</dt>
            <dd className="font-medium leading-6 tabular-nums text-muted-foreground">
              {(showCompanyProgress || viewerRole === 'team_leader') && progress.total > 0
                ? `${progress.tlConfirmed} TL · ${progress.msConfirmed} MS`
                : '—'}
            </dd>
          </div>
          <div className="sm:col-span-2 min-w-0">
            <dt className="text-muted-foreground text-xs mb-0.5">Note</dt>
            <dd className="font-medium leading-6 whitespace-pre-wrap">
              {batch.note?.trim() ? batch.note : '—'}
            </dd>
          </div>
        </dl>
        {(batch.rejection_note || batch.rejected_by_name) && (
          <p className="text-sm text-red-700">
            Rejected by {batch.rejected_by_name || '—'}
            {batch.rejection_note ? `: ${batch.rejection_note}` : ''}
          </p>
        )}
      </div>

      <Tabs defaultValue="price-changes" className="w-full">
        <TabsList className="w-full sm:w-auto h-auto flex flex-wrap justify-start gap-1 bg-transparent p-0">
          <TabsTrigger
            value="price-changes"
            className="gap-1.5 shadow-none data-[state=active]:shadow-none data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-foreground rounded-none px-3"
          >
            Price changes
            {itemCount > 0 && (
              <Badge variant="outline" className="font-normal text-[10px] px-1.5 py-0 h-5">
                {itemCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="who-confirmed"
            className="gap-1.5 shadow-none data-[state=active]:shadow-none data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-foreground rounded-none px-3"
          >
            {viewerRole === 'mobile_sales' ? 'Your confirmation' : 'Show who confirmed'}
            {viewerRole !== 'mobile_sales' && progress.total > 0 && (
              <Badge variant="outline" className="font-normal text-[10px] px-1.5 py-0 h-5">
                {progress.confirmed}/{progress.total}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="price-changes" className="mt-3 focus-visible:outline-none">
          <div className="md:hidden">
            <PriceChangeItemsGroupedTable batch={batch} viewMode="cards" />
          </div>
          <div className="hidden md:block">
            <PriceChangeItemsGroupedTable batch={batch} viewMode="table" />
          </div>
        </TabsContent>

        <TabsContent value="who-confirmed" className="mt-3 space-y-3 focus-visible:outline-none">
          {sortedAgreements.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center rounded-md border">
              No confirmers for this batch.
            </p>
          ) : (
            <>
              {viewerRole !== 'mobile_sales' && progress.total > 0 && (
                <dl className="grid gap-2 sm:grid-cols-3 text-sm rounded-md border bg-muted/20 px-3 py-2.5">
                  <div>
                    <dt className="text-xs text-muted-foreground mb-0.5">Total confirmed</dt>
                    <dd className="font-semibold tabular-nums">
                      {progress.confirmed} / {progress.total}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground mb-0.5">Team Leaders</dt>
                    <dd className="font-medium tabular-nums">
                      {progress.tlConfirmed} / {progress.tlTotal}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground mb-0.5">Mobile Sales</dt>
                    <dd className="font-medium tabular-nums">
                      {progress.msConfirmed} / {progress.msTotal}
                    </dd>
                  </div>
                </dl>
              )}
              {/* Mobile confirmer cards */}
              <div className="md:hidden space-y-2">
                {sortedAgreements.map((a) => (
                  <div key={a.id} className="rounded-md border p-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-sm">
                        {viewerRole === 'mobile_sales' ? 'You' : a.profile_name}
                      </p>
                      <Badge
                        variant="outline"
                        className={
                          a.status === 'confirmed'
                            ? 'bg-green-50 text-green-900 border-green-200 font-normal capitalize shrink-0'
                            : a.status === 'pending'
                              ? 'bg-amber-50 text-amber-900 border-amber-200 font-normal capitalize shrink-0'
                              : 'font-normal capitalize shrink-0'
                        }
                      >
                        {a.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {priceAgreementRoleLabel(a, leaderNameByAgentId)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Confirmed{' '}
                      {a.confirmed_at ? new Date(a.confirmed_at).toLocaleString() : '—'}
                    </p>
                  </div>
                ))}
              </div>

              {/* Desktop confirmer table */}
              <div className="hidden md:block rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[28%]">Name</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="w-[110px]">Status</TableHead>
                      <TableHead className="w-[160px]">Confirmed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedAgreements.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium align-middle">
                          {viewerRole === 'mobile_sales' ? 'You' : a.profile_name}
                        </TableCell>
                        <TableCell className="align-middle text-muted-foreground text-sm">
                          {priceAgreementRoleLabel(a, leaderNameByAgentId)}
                        </TableCell>
                        <TableCell className="align-middle">
                          <Badge
                            variant="outline"
                            className={
                              a.status === 'confirmed'
                                ? 'bg-green-50 text-green-900 border-green-200 font-normal capitalize'
                                : a.status === 'pending'
                                  ? 'bg-amber-50 text-amber-900 border-amber-200 font-normal capitalize'
                                  : 'font-normal capitalize'
                            }
                          >
                            {a.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="align-middle text-sm text-muted-foreground whitespace-nowrap">
                          {a.confirmed_at ? new Date(a.confirmed_at).toLocaleString() : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {canCancel && batch.status === 'pending_agreement' && (
        <Button
          variant="outline"
          size="sm"
          disabled={cancelMutation.isPending}
          onClick={() => cancelMutation.mutate()}
        >
          {cancelMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {isTeamScope ? 'Cancel batch (bags only)' : 'Cancel batch (revert main)'}
        </Button>
      )}
    </div>
  );
}

export default function PriceHistoryPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const canAccess = user?.role !== 'warehouse';
  const canCancel = user?.role === 'super_admin' || user?.role === 'admin';

  const { data: teamReportIds = [] } = useQuery({
    queryKey: ['leader-team-reports', user?.company_id, user?.id],
    queryFn: () => fetchLeaderTeamReportIds(user!.company_id!, user!.id),
    enabled:
      !!user?.company_id &&
      !!user?.id &&
      user.role === 'team_leader' &&
      canAccess,
  });

  const { data: leaderNameByAgentId = {} } = useQuery({
    queryKey: ['price-history-leader-map', user?.company_id],
    queryFn: () => fetchAgentToLeaderNameMap(user!.company_id!),
    enabled: !!user?.company_id && canAccess,
  });

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['price-history', user?.company_id],
    queryFn: () => fetchPriceChangeBatches(user!.company_id!),
    enabled: !!user?.company_id && canAccess,
  });

  // Live updates when batches / items / agreements change (create, confirm, cancel, append)
  useEffect(() => {
    if (!canAccess || !user?.company_id) return;

    const companyId = user.company_id;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ['price-history', companyId] });
        void qc.invalidateQueries({ queryKey: ['price-history-detail'] });
        void qc.invalidateQueries({ queryKey: ['brand-price-history'] });
        void qc.refetchQueries({ queryKey: ['price-history-detail'], type: 'active' });
      }, 400);
    };

    const channel = supabase
      .channel(`cpc-price-history-${companyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'company_price_change_batches',
          filter: `company_id=eq.${companyId}`,
        },
        refresh
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'company_price_change_items',
          filter: `company_id=eq.${companyId}`,
        },
        refresh
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'company_price_change_agreements',
          filter: `company_id=eq.${companyId}`,
        },
        refresh
      )
      .subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [canAccess, user?.company_id, qc]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return batches;
    return batches.filter(
      (b) =>
        b.batch_number.toLowerCase().includes(q) ||
        (b.created_by_name || '').toLowerCase().includes(q) ||
        (b.note || '').toLowerCase().includes(q) ||
        b.status.includes(q) ||
        priceChangeScopeLabel(b).toLowerCase().includes(q) ||
        typeLabel(b).toLowerCase().includes(q)
    );
  }, [batches, search]);

  if (!canAccess) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Price history</CardTitle>
            <CardDescription>Not available for warehouse accounts.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Price history</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Company Main updates and team bag-only pushes, with confirmation status.
          </p>
        </div>
        <Input
          className="w-full sm:max-w-xs"
          placeholder="Search batch, creator, note…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No company price change batches yet.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Mobile card list */}
          <div className="md:hidden space-y-3">
            {filtered.map((batch: CompanyPriceChangeBatch) => {
              const open = expanded === batch.id;
              const visibleAgreements = filterVisiblePriceAgreements(batch.agreements, {
                role: user?.role,
                profileId: user?.id,
                teamReportIds,
              });
              const progress = agreementProgress(visibleAgreements);
              const confirmedLabel =
                progress.total > 0 ? `${progress.confirmed} / ${progress.total}` : '—';
              const isTeam = batch.scope_type === 'team';

              return (
                <Card key={batch.id} className={cn('overflow-hidden', open && 'ring-1 ring-border')}>
                  <button
                    type="button"
                    className="w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors"
                    onClick={() => setExpanded(open ? null : batch.id)}
                    aria-expanded={open}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 shrink-0">
                        {open ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-semibold text-sm break-all">
                            {batch.batch_number}
                          </span>
                          <Badge
                            variant="outline"
                            className={cn('font-normal text-xs', statusBadge(batch.status))}
                          >
                            {statusLabel(batch.status)}
                          </Badge>
                        </div>
                        <p className="text-sm">
                          <span className="text-muted-foreground">By </span>
                          {batch.created_by_name || '—'}
                        </p>
                        <Badge
                          variant="secondary"
                          className={cn(
                            'font-normal max-w-full',
                            isTeam && 'bg-sky-50 text-sky-900 border-sky-200'
                          )}
                          title={typeLabel(batch)}
                        >
                          {typeLabel(batch)}
                        </Badge>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                          <p>
                            <span className="text-muted-foreground">Confirmed </span>
                            <span className="tabular-nums font-medium">{confirmedLabel}</span>
                          </p>
                          <p className="text-muted-foreground">
                            {new Date(batch.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  </button>

                  {open && (
                    <CardContent className="pt-0 border-t px-4 pb-3">
                      <BatchDetail
                        batchId={batch.id}
                        canCancel={canCancel}
                        viewerRole={user?.role}
                        viewerId={user?.id}
                        teamReportIds={teamReportIds}
                        leaderNameByAgentId={leaderNameByAgentId}
                        onCancelled={() => {
                          qc.invalidateQueries({ queryKey: ['price-history'] });
                          qc.invalidateQueries({
                            queryKey: ['price-history-detail', batch.id],
                          });
                          qc.invalidateQueries({ queryKey: ['inventory'] });
                        }}
                      />
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block rounded-lg border bg-card overflow-x-auto">
            <div className="min-w-[1100px]">
              <div className="grid grid-cols-[40px_minmax(140px,1.1fr)_minmax(120px,0.9fr)_minmax(180px,1.3fr)_minmax(130px,0.9fr)_minmax(120px,0.85fr)_minmax(150px,0.95fr)] gap-3 px-4 py-2.5 border-b bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground sticky top-0 z-[1]">
                <div aria-hidden />
                <div>Price batch</div>
                <div>Performed by</div>
                <div>Type</div>
                <div>Status</div>
                <div>Total confirmed</div>
                <div>Created at</div>
              </div>

              <div className="divide-y">
                {filtered.map((batch: CompanyPriceChangeBatch) => {
                  const open = expanded === batch.id;
                  const visibleAgreements = filterVisiblePriceAgreements(batch.agreements, {
                    role: user?.role,
                    profileId: user?.id,
                    teamReportIds,
                  });
                  const progress = agreementProgress(visibleAgreements);
                  const confirmedLabel =
                    progress.total > 0 ? `${progress.confirmed} / ${progress.total}` : '—';
                  const isTeam = batch.scope_type === 'team';

                  return (
                    <div key={batch.id} className={cn(open && 'bg-muted/10')}>
                      <button
                        type="button"
                        className="w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors"
                        onClick={() => setExpanded(open ? null : batch.id)}
                        aria-expanded={open}
                      >
                        <div className="grid grid-cols-[40px_minmax(140px,1.1fr)_minmax(120px,0.9fr)_minmax(180px,1.3fr)_minmax(130px,0.9fr)_minmax(120px,0.85fr)_minmax(150px,0.95fr)] gap-3 items-center">
                          <div className="flex items-center justify-center">
                            {open ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="font-mono font-semibold text-sm">
                              {batch.batch_number}
                            </span>
                          </div>
                          <div className="text-sm truncate">{batch.created_by_name || '—'}</div>
                          <div className="min-w-0">
                            <Badge
                              variant="secondary"
                              className={cn(
                                'font-normal max-w-full truncate',
                                isTeam && 'bg-sky-50 text-sky-900 border-sky-200'
                              )}
                              title={typeLabel(batch)}
                            >
                              {typeLabel(batch)}
                            </Badge>
                          </div>
                          <div>
                            <Badge
                              variant="outline"
                              className={cn('font-normal text-xs', statusBadge(batch.status))}
                            >
                              {statusLabel(batch.status)}
                            </Badge>
                          </div>
                          <div
                            className="text-sm tabular-nums"
                            title={progress.total > 0 ? progress.label : undefined}
                          >
                            {confirmedLabel}
                          </div>
                          <div className="text-sm text-muted-foreground whitespace-nowrap">
                            {new Date(batch.created_at).toLocaleString()}
                          </div>
                        </div>
                      </button>

                      {open && (
                        <div className="px-4 pb-2 border-t bg-background/80">
                          <BatchDetail
                            batchId={batch.id}
                            canCancel={canCancel}
                            viewerRole={user?.role}
                            viewerId={user?.id}
                            teamReportIds={teamReportIds}
                            leaderNameByAgentId={leaderNameByAgentId}
                            onCancelled={() => {
                              qc.invalidateQueries({ queryKey: ['price-history'] });
                              qc.invalidateQueries({
                                queryKey: ['price-history-detail', batch.id],
                              });
                              qc.invalidateQueries({ queryKey: ['inventory'] });
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
