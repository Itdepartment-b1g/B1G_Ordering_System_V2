import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  agreementProgress,
  cancelCompanyPriceChange,
  fetchAgentToLeaderNameMap,
  fetchLeaderTeamReportIds,
  fetchPriceChangeBatchDetail,
  fetchPriceChangeBatches,
  filterVisiblePriceAgreements,
  priceAgreementRoleLabel,
  type CompanyPriceChangeAgreement,
  type CompanyPriceChangeBatch,
  type PriceChangeBatchStatus,
} from './companyPriceChangeApi';
import { PriceChangeItemsGroupedTable } from './PriceChangeItemsGroupedTable';

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
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelCompanyPriceChange(batchId),
    onSuccess: () => {
      toast({ title: 'Cancelled', description: 'Main prices reverted to previous values.' });
      onCancelled();
    },
    onError: (err: Error) => {
      toast({ title: 'Cancel failed', description: err.message, variant: 'destructive' });
    },
  });

  if (isLoading || !batch) {
    return (
      <div className="py-4 flex items-center gap-2 text-sm text-muted-foreground">
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
  const showCompanyProgress =
    viewerRole === 'super_admin' || viewerRole === 'admin';

  return (
    <div className="space-y-4 pb-2">
      {batch.note && (
        <p className="text-sm text-muted-foreground">Note: {batch.note}</p>
      )}
      {showCompanyProgress && progress.total > 0 && (
        <Badge variant="outline">{progress.label}</Badge>
      )}
      {viewerRole === 'team_leader' && progress.total > 0 && (
        <Badge variant="outline">
          Team confirmed {progress.confirmed} / {progress.total}
        </Badge>
      )}
      {(batch.rejection_note || batch.rejected_by_name) && (
        <p className="text-sm text-red-700">
          Rejected by {batch.rejected_by_name || '—'}
          {batch.rejection_note ? `: ${batch.rejection_note}` : ''}
        </p>
      )}

      <PriceChangeItemsGroupedTable batch={batch} />

      {sortedAgreements.length > 0 && (
        <Accordion
          type="single"
          collapsible
          defaultValue={
            viewerRole === 'mobile_sales' || sortedAgreements.length <= 2
              ? 'who-confirmed'
              : undefined
          }
          className="rounded-md border px-3"
        >
          <AccordionItem value="who-confirmed" className="border-0">
            <AccordionTrigger className="py-3 text-sm font-semibold hover:no-underline">
              <span className="flex flex-wrap items-center gap-2 text-left">
                <span>
                  {viewerRole === 'mobile_sales' ? 'Your confirmation' : 'Show who confirmed'}
                </span>
                {viewerRole !== 'mobile_sales' && progress.total > 0 && (
                  <Badge variant="outline" className="font-normal">
                    {progress.confirmed}/{progress.total}
                  </Badge>
                )}
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-3">
              <div className="rounded-md border overflow-x-auto">
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
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

      {canCancel && batch.status === 'pending_agreement' && (
        <Button
          variant="outline"
          size="sm"
          disabled={cancelMutation.isPending}
          onClick={() => cancelMutation.mutate()}
        >
          {cancelMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Cancel batch (revert main)
        </Button>
      )}
    </div>
  );
}

export default function PriceHistoryPage() {
  const { user } = useAuth();
  const { hasWarehouseHubLink, hasWarehouseHubLinkLoading } = usePermissions();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const canAccess = hasWarehouseHubLink === true;
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return batches;
    return batches.filter(
      (b) =>
        b.batch_number.toLowerCase().includes(q) ||
        (b.created_by_name || '').toLowerCase().includes(q) ||
        (b.note || '').toLowerCase().includes(q) ||
        b.status.includes(q)
    );
  }, [batches, search]);

  if (hasWarehouseHubLinkLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Price history</CardTitle>
            <CardDescription>
              Available only for warehouse-linked companies.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Price history</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Flattened Selling / DSP / RSP changes, grouped by brand and update time within each
            batch.
          </p>
        </div>
        <Input
          className="max-w-xs"
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
        <div className="space-y-2">
          {filtered.map((batch: CompanyPriceChangeBatch) => {
            const open = expanded === batch.id;
            const visibleAgreements = filterVisiblePriceAgreements(batch.agreements, {
              role: user?.role,
              profileId: user?.id,
              teamReportIds,
            });
            const progress = agreementProgress(visibleAgreements);
            const showProgressBadge =
              (user?.role === 'super_admin' || user?.role === 'admin') && progress.total > 0;
            const showTeamProgressBadge =
              user?.role === 'team_leader' && progress.total > 0;

            return (
              <Card key={batch.id}>
                <button
                  type="button"
                  className="w-full text-left px-4 py-3 flex flex-wrap items-center gap-3 hover:bg-muted/40 transition-colors rounded-t-lg"
                  onClick={() => setExpanded(open ? null : batch.id)}
                >
                  {open ? (
                    <ChevronDown className="h-4 w-4 shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0" />
                  )}
                  <span className="font-mono font-semibold">{batch.batch_number}</span>
                  <span className="text-sm text-muted-foreground">
                    {new Date(batch.created_at).toLocaleString()}
                  </span>
                  <span className="text-sm">{batch.created_by_name || '—'}</span>
                  <Badge variant="outline" className={statusBadge(batch.status)}>
                    {statusLabel(batch.status)}
                  </Badge>
                  {showProgressBadge && (
                    <Badge variant="outline" className="font-normal">
                      {progress.label}
                    </Badge>
                  )}
                  {showTeamProgressBadge && (
                    <Badge variant="outline" className="font-normal">
                      Team {progress.confirmed}/{progress.total}
                    </Badge>
                  )}
                </button>
                {open && (
                  <CardContent className="pt-0 border-t">
                    <BatchDetail
                      batchId={batch.id}
                      canCancel={canCancel}
                      viewerRole={user?.role}
                      viewerId={user?.id}
                      teamReportIds={teamReportIds}
                      leaderNameByAgentId={leaderNameByAgentId}
                      onCancelled={() => {
                        qc.invalidateQueries({ queryKey: ['price-history'] });
                        qc.invalidateQueries({ queryKey: ['price-history-detail', batch.id] });
                        qc.invalidateQueries({ queryKey: ['inventory'] });
                      }}
                    />
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
