import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Check, Eye, LayoutGrid, List, RotateCcw, Search, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  getListPaginationSlice,
  ListPagination,
  type PageSize,
} from '@/features/shared/components/ListPagination';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import {
  clientReturnStatusBadgeClass,
  formatClientReturnReason,
  formatClientReturnStatus,
  getMockReturnLineQty,
  getReturnActionActor,
  MOCK_CLIENT_RETURNS,
  SHOW_CLIENT_RETURN_MOCK,
  type MockClientReturn,
  type MockClientReturnStatus,
} from './clientReturnMock';
import { BrandReturnedTable, groupLinesByBrand } from './ClientReturnBrandTable';
import { ClientReturnExpandedMeta } from './ClientReturnExpandedMeta';
import { ClientReturnViewDialog } from './ClientReturnViewDialog';

const HISTORY_PAGE_SIZE: PageSize = 25;
const VIEW_MODE_KEY = 'client-order-returns-view';
const TABLE_COLS =
  'grid-cols-[11rem_9rem_8.5rem_7.25rem_9rem_6.5rem_8.5rem_8.5rem]';
const TABLE_MIN_WIDTH = 'min-w-[90rem]';

type HistoryViewMode = 'table' | 'cards';
type StatusFilter = 'all' | 'pending_leader' | 'posted' | 'rejected';

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

function cloneMockReturns(): MockClientReturn[] {
  return MOCK_CLIENT_RETURNS.map((row) => ({
    ...row,
    lines: row.lines.map((line) => ({ ...line })),
    proofLabels: [...row.proofLabels],
  }));
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
  const isLeader = user?.role === 'team_leader';
  const canReview = isLeader;

  const [rows, setRows] = useState<MockClientReturn[]>(cloneMockReturns);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(HISTORY_PAGE_SIZE);
  const [viewRow, setViewRow] = useState<MockClientReturn | null>(null);
  const [viewMode, setViewMode] = useState<HistoryViewMode>(readStoredViewMode);
  const [actionRow, setActionRow] = useState<MockClientReturn | null>(null);
  const [confirmKind, setConfirmKind] = useState<'approve' | 'reject' | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const startApprove = (row: MockClientReturn) => {
    if (!canReview) return;
    setActionRow(row);
    setRejectNote('');
    setConfirmKind('approve');
  };

  const startReject = (row: MockClientReturn) => {
    if (!canReview) return;
    setActionRow(row);
    setRejectNote('');
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
    return rows.filter((row) => {
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
  }, [rows, searchQuery, statusFilter]);

  useEffect(() => {
    setPage(0);
  }, [searchQuery, pageSize, statusFilter]);

  const { pagedItems, safePage, pageCount } = getListPaginationSlice(filtered, page, pageSize);

  const updateRow = (id: string, patch: Partial<MockClientReturn>) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const handleApproveConfirm = () => {
    if (!canReview || !actionRow) return;
    updateRow(actionRow.id, {
      status: 'posted',
      rejectionNote: null,
      approvedByName: user?.full_name?.trim() || 'Team leader',
      approvedAt: new Date().toISOString(),
      rejectedByName: null,
      rejectedAt: null,
    });
    toast({
      title: 'Return approved',
      description: `${actionRow.returnNumber} approved. Mock only — no stock change.`,
    });
    setConfirmKind(null);
    setActionRow(null);
  };

  const handleRejectConfirm = () => {
    if (!canReview || !actionRow) return;
    updateRow(actionRow.id, {
      status: 'rejected',
      rejectionNote: rejectNote.trim() || null,
      rejectedByName: user?.full_name?.trim() || 'Team leader',
      rejectedAt: new Date().toISOString(),
      approvedByName: null,
      approvedAt: null,
    });
    toast({
      title: 'Return rejected',
      description: `${actionRow.returnNumber} is closed. Agent can file a new CR on the same ORD.`,
    });
    setConfirmKind(null);
    setRejectNote('');
    setActionRow(null);
  };

  if (!SHOW_CLIENT_RETURN_MOCK) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold tracking-tight">Client Order Returns</h1>
        <p className="text-muted-foreground mt-2">This page is hidden until the mock flag is enabled.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6 min-w-0">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Client Order Returns</h1>
        <p className="text-muted-foreground">
          {isLeader
            ? 'All client returns from your team. Filter by Pending to approve or reject.'
            : 'History of items returned against an ORD number (CR-MTS-YYYYMM-000001).'}
        </p>
      </div>

      <Alert className="border-amber-200 bg-amber-50 text-amber-950">
        <AlertDescription>
          Visual mock with dummy data. No database writes. Open an approved order on{' '}
          <Link to="/my-orders" className="underline font-medium">
            My Orders
          </Link>{' '}
          to see the order → return timeline.
        </AlertDescription>
      </Alert>

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
          {filtered.length === 0 ? (
            <div className="py-12 text-center space-y-1">
              <p className="text-sm font-medium">No matching returns</p>
              <p className="text-sm text-muted-foreground">Try another status filter or search.</p>
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
                <div className="rounded-md border overflow-x-auto min-w-0">
                  <div className={TABLE_MIN_WIDTH}>
                  <div className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/50 border-b">
                    <span className="w-4 shrink-0" />
                    <div className={`grid flex-1 gap-2 items-center ${TABLE_COLS}`}>
                      <span>Return</span>
                      <span>Client</span>
                      <span>Returned by</span>
                      <span>Returned date</span>
                      <span>Brands</span>
                      <span>Status</span>
                      <span>Approved by</span>
                      <span>Rejected by</span>
                    </div>
                    <span className="w-10 shrink-0 text-right">Qty</span>
                    {canReview ? <span className="w-[11.75rem] shrink-0 text-right">Action</span> : null}
                  </div>
                  <Accordion type="multiple" className="w-full">
                    {pagedItems.map((row) => {
                      const qty = getMockReturnLineQty(row);
                      const actor = getReturnActionActor(row);
                      return (
                        <AccordionItem key={row.id} value={row.id} className="px-3">
                          <div className="flex items-center gap-2 w-full">
                            <div className="flex-1 min-w-0 [&>h3]:w-full">
                              <AccordionTrigger className="w-full hover:no-underline py-3 justify-start gap-2 [&>svg]:order-first [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0">
                                <div className={`grid w-full gap-2 text-left text-sm items-center ${TABLE_COLS}`}>
                                  <div className="min-w-0">
                                    <p className="font-mono text-xs font-semibold truncate whitespace-nowrap" title={row.returnNumber}>
                                      {row.returnNumber}
                                    </p>
                                    <p className="font-mono text-[11px] text-muted-foreground truncate whitespace-nowrap" title={row.orderNumber}>
                                      {row.orderNumber}
                                    </p>
                                  </div>
                                  <span className="truncate min-w-0" title={row.clientName}>
                                    {row.clientName}
                                  </span>
                                  <span className="truncate min-w-0" title={row.returnedByName}>
                                    {row.returnedByName}
                                  </span>
                                  <span className="text-sm whitespace-nowrap">
                                    {format(new Date(row.returnDate), 'MMM d, yyyy')}
                                  </span>
                                  <div className="min-w-0 overflow-hidden">
                                    <ReturnedBrandBadges brands={uniqueReturnBrands(row.lines)} />
                                  </div>
                                  <ReturnStatusBadge status={row.status} />
                                  <ActorNameCell name={row.approvedByName} at={row.approvedAt} />
                                  <ActorNameCell name={row.rejectedByName} at={row.rejectedAt} />
                                </div>
                              </AccordionTrigger>
                            </div>
                            <span className="w-10 shrink-0 font-semibold text-rose-700 tabular-nums text-right">
                              {qty}
                            </span>
                            {canReview ? (
                              <div className="py-2 shrink-0 flex justify-end w-[11.75rem]">
                                {row.status === 'pending_leader' ? (
                                  <PendingReturnActions
                                    onApprove={() => startApprove(row)}
                                    onReject={() => startReject(row)}
                                  />
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                          {canReview && row.status === 'pending_leader' ? (
                            <div className="lg:hidden pb-3">
                              <PendingReturnActions
                                layout="stack"
                                onApprove={() => startApprove(row)}
                                onReject={() => startReject(row)}
                              />
                            </div>
                          ) : null}
                          <AccordionContent>
                            <div className="lg:ml-6 space-y-2 min-w-0 max-w-4xl">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground mb-3">
                                <p className="lg:hidden">
                                  Returned by{' '}
                                  <span className="font-medium text-foreground">{row.returnedByName}</span>
                                </p>
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
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                  </div>
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

      <ClientReturnViewDialog
        open={!!viewRow}
        onOpenChange={(open) => {
          if (!open) setViewRow(null);
        }}
        row={viewRow}
      />

      <AlertDialog open={confirmKind === 'approve'} onOpenChange={(open) => !open && setConfirmKind(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve this return?</AlertDialogTitle>
            <AlertDialogDescription>
              {actionRow
                ? `${actionRow.returnNumber} will be approved. Mock only — inventory will not change.`
                : 'This return will be approved.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleApproveConfirm}>Approve</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmKind === 'reject'}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmKind(null);
            setRejectNote('');
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject this return?</AlertDialogTitle>
            <AlertDialogDescription>
              {actionRow
                ? `${actionRow.returnNumber} will be closed. The agent can still create a new CR on ${actionRow.orderNumber}.`
                : 'This return will be closed.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-note">Note (optional)</Label>
            <Textarea
              id="reject-note"
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="Why this return is rejected"
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRejectConfirm}>Reject</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
