import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DateRangeFilterPopover,
  type DateRangeFilterValue,
} from '@/features/shared/components/DateRangeFilterPopover';
import { TargetMonthPicker } from '@/features/shared/components/TargetMonthPicker';
import {
  SalesTargetPeriodFilter,
  monthsInSalesTargetPeriod,
  type SalesTargetPeriodValue,
} from '../components/SalesTargetPeriodFilter';
import { SalesTargetActualDetailDialog } from '../components/SalesTargetActualDetailDialog';
import {
  useKeyAccountSalesTargets,
  type KASalesTargetDisplayRow,
} from '../hooks/useKeyAccountSalesTargets';
import { getDatePresetLabel } from '@/lib/dateRangePresets';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle, Crown, Loader2, Pencil, Target, Users, Eye } from 'lucide-react';

type AssigneeRole = 'sales_director' | 'key_account_manager';
type RoleFilter = 'all' | AssigneeRole;
type FilterMode = 'review' | 'plan';

function currentMonthValue(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatTargetMonth(month: string | null): string {
  if (!month) return '—';
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return new Date(y, m - 1, 1).toLocaleDateString('en-PH', {
    month: 'short',
    year: 'numeric',
  });
}

function formatPeso(value: number | null | undefined): string {
  if (value == null) return '—';
  return `₱${Math.round(value).toLocaleString('en-PH')}`;
}

function attainmentPct(target: number | null, actual: number): number | null {
  if (target == null || target <= 0) return null;
  return Math.round((actual / target) * 100);
}

function roleLabel(role: AssigneeRole): string {
  return role === 'sales_director' ? 'Sales Director' : 'Key Account Manager';
}

export function KeyAccountSalesTargetsPage() {
  const { toast } = useToast();
  const [filterMode, setFilterMode] = useState<FilterMode>('review');
  const [reviewFilter, setReviewFilter] = useState<DateRangeFilterValue>({
    preset: 'this_month',
  });
  const [planFilter, setPlanFilter] = useState<SalesTargetPeriodValue>({
    preset: 'next_month',
  });
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [editOpen, setEditOpen] = useState(false);
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [draftTarget, setDraftTarget] = useState('');
  const [draftMonth, setDraftMonth] = useState(() => currentMonthValue());
  const [viewOpen, setViewOpen] = useState(false);
  const [viewRow, setViewRow] = useState<KASalesTargetDisplayRow | null>(null);

  const periodFilter = filterMode === 'review' ? reviewFilter : planFilter;

  const periodLabel = useMemo(
    () =>
      getDatePresetLabel(
        periodFilter.preset,
        periodFilter.customStart,
        periodFilter.customEnd
      ),
    [periodFilter]
  );

  const viewMonths = useMemo(
    () => monthsInSalesTargetPeriod(periodFilter, currentMonthValue),
    [periodFilter]
  );

  const startMonth = viewMonths[0] || currentMonthValue();
  const endMonth = viewMonths[viewMonths.length - 1] || startMonth;

  const {
    assignees,
    purchaseOrders,
    detailKey,
    loading,
    saving,
    detailLoading,
    error,
    detailError,
    buildRows,
    saveTarget,
    clearTarget,
    loadPurchaseOrders,
    targetByKey,
  } = useKeyAccountSalesTargets(startMonth, endMonth);

  const people = useMemo(
    () =>
      roleFilter === 'all' ? assignees : assignees.filter((person) => person.role === roleFilter),
    [assignees, roleFilter]
  );

  const displayRows = useMemo(
    () => buildRows(people, viewMonths),
    [buildRows, people, viewMonths]
  );

  const summary = useMemo(() => {
    const withTarget = displayRows.filter((row) => row.targetRevenue != null);
    const totalTarget = withTarget.reduce((sum, row) => sum + (row.targetRevenue ?? 0), 0);
    const totalActual = displayRows.reduce((sum, row) => sum + row.actualRevenue, 0);
    const unset = displayRows.filter((row) => row.targetRevenue == null).length;
    return { totalTarget, totalActual, unset, count: displayRows.length };
  }, [displayRows]);

  const editingPerson = editingPersonId
    ? assignees.find((person) => person.id === editingPersonId) ?? null
    : null;

  const editingDraftRow = useMemo(() => {
    if (!editingPerson) return null;
    return buildRows([editingPerson], [draftMonth])[0] ?? null;
  }, [buildRows, draftMonth, editingPerson]);

  const editingHasTarget =
    editingPersonId != null && targetByKey.get(`${editingPersonId}:${draftMonth}`) != null;

  const openEdit = (row: KASalesTargetDisplayRow) => {
    setEditingPersonId(row.id);
    setDraftTarget(row.targetRevenue != null ? String(row.targetRevenue) : '');
    setDraftMonth(row.month);
    setEditOpen(true);
  };

  const openView = (row: KASalesTargetDisplayRow) => {
    setViewRow(row);
    setViewOpen(true);
    void loadPurchaseOrders({ assigneeId: row.id, month: row.month }).catch((err) => {
      toast({
        title: 'Could not load purchase orders',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    });
  };

  const saveEdit = async () => {
    if (!editingPersonId || !draftMonth) return;
    const parsed = draftTarget.trim() === '' ? null : Number(draftTarget.replace(/,/g, ''));
    const next = parsed == null || Number.isNaN(parsed) ? null : Math.max(0, parsed);

    try {
      if (next == null) {
        await clearTarget({ assigneeId: editingPersonId, targetMonth: draftMonth });
        toast({ title: 'Target cleared' });
      } else {
        await saveTarget({
          assigneeId: editingPersonId,
          targetMonth: draftMonth,
          targetRevenue: next,
        });
        toast({ title: 'Target saved' });
      }
      setEditOpen(false);
      setEditingPersonId(null);
    } catch (err) {
      toast({
        title: 'Could not save target',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleClearTarget = async () => {
    if (!editingPersonId || !draftMonth) return;
    try {
      await clearTarget({ assigneeId: editingPersonId, targetMonth: draftMonth });
      toast({ title: 'Target cleared' });
      setEditOpen(false);
      setEditingPersonId(null);
    } catch (err) {
      toast({
        title: 'Could not clear target',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const viewPosKey = viewRow ? `${viewRow.id}:${viewRow.month}` : null;
  const viewPurchaseOrders = viewPosKey && detailKey === viewPosKey ? purchaseOrders : [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sales Targets</h1>
          <p className="text-muted-foreground">
            Each person can have a different sales target every month. Filter by period to view or set.
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total target</CardDescription>
            <CardTitle className="text-xl">{formatPeso(summary.totalTarget)}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Across {summary.count} row{summary.count === 1 ? '' : 's'} in view
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total actual revenue</CardDescription>
            <CardTitle className="text-xl">{formatPeso(summary.totalActual)}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            PO revenue for {periodLabel}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Without target</CardDescription>
            <CardTitle className="text-xl">{summary.unset}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Still need a target set
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Target className="h-5 w-5" />
              Monthly targets
            </CardTitle>
            <Badge variant="secondary" className="w-fit font-normal">
              {filterMode === 'review' ? 'Reviewing' : 'Planning'} · {periodLabel}
              {viewMonths.length === 1 ? ` · ${formatTargetMonth(viewMonths[0])}` : ''}
            </Badge>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                Review
              </Label>
              <div
                className={cn(
                  'rounded-md transition-shadow',
                  filterMode === 'review' && 'ring-2 ring-primary/40'
                )}
              >
                <DateRangeFilterPopover
                  value={reviewFilter}
                  onChange={(next) => {
                    setReviewFilter(next);
                    setFilterMode('review');
                  }}
                  triggerClassName="w-full justify-between h-10"
                  align="start"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                Plan
              </Label>
              <SalesTargetPeriodFilter
                value={planFilter}
                onChange={setPlanFilter}
                active={filterMode === 'plan'}
                onActivate={() => setFilterMode('plan')}
                triggerClassName="w-full justify-between h-10"
                align="start"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                Role
              </Label>
              <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as RoleFilter)}>
                <SelectTrigger className="w-full h-10">
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  <SelectItem value="sales_director">Sales Directors</SelectItem>
                  <SelectItem value="key_account_manager">KAMs</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <CardDescription>
            {filterMode === 'review'
              ? 'Track targets and attainment for past or current periods.'
              : 'Set targets for upcoming months. Empty rows show — / ₱0 until assigned.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Target revenue</TableHead>
                <TableHead className="text-right min-w-[140px]">Actual sales</TableHead>
                <TableHead className="min-w-[140px]">Attainment</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading sales targets…
                    </span>
                  </TableCell>
                </TableRow>
              ) : displayRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    No directors or KAMs found for this company.
                  </TableCell>
                </TableRow>
              ) : (
                displayRows.map((row) => {
                  const pct = attainmentPct(row.targetRevenue, row.actualRevenue);
                  return (
                    <TableRow key={row.rowKey}>
                      <TableCell className="font-medium">{row.fullName}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="gap-1 font-normal">
                          {row.role === 'sales_director' ? (
                            <Crown className="h-3 w-3" />
                          ) : (
                            <Users className="h-3 w-3" />
                          )}
                          {roleLabel(row.role)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.role === 'sales_director' ? '—' : row.directorName || 'Unassigned'}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {formatTargetMonth(row.month)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPeso(row.targetRevenue)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="space-y-0.5">
                          <div className="tabular-nums font-medium">
                            {formatPeso(row.actualRevenue)}
                          </div>
                          <div className="text-xs text-muted-foreground tabular-nums">
                            {row.actualOrders.toLocaleString('en-PH')} POs ·{' '}
                            {row.actualQty.toLocaleString('en-PH')} units
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {pct == null ? (
                          <span className="text-sm text-muted-foreground">No target</span>
                        ) : (
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span
                                className={
                                  pct >= 100
                                    ? 'text-emerald-600 font-medium'
                                    : pct >= 70
                                      ? 'text-amber-600'
                                      : 'text-muted-foreground'
                                }
                              >
                                {pct}%
                              </span>
                            </div>
                            <Progress value={Math.min(pct, 100)} className="h-2" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openView(row)}
                            aria-label={`View actuals for ${row.fullName} · ${formatTargetMonth(row.month)}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEdit(row)}
                            aria-label={`Edit target for ${row.fullName} · ${formatTargetMonth(row.month)}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <SalesTargetActualDetailDialog
        open={viewOpen}
        onOpenChange={setViewOpen}
        person={
          viewRow
            ? {
                id: viewRow.id,
                fullName: viewRow.fullName,
                role: viewRow.role,
                directorName: viewRow.directorName ?? undefined,
              }
            : null
        }
        stats={
          viewRow
            ? {
                month: viewRow.month,
                monthLabel: formatTargetMonth(viewRow.month),
                targetRevenue: viewRow.targetRevenue,
                actualRevenue: viewRow.actualRevenue,
                actualOrders: viewRow.actualOrders,
                actualQty: viewRow.actualQty,
                attainmentPct: attainmentPct(viewRow.targetRevenue, viewRow.actualRevenue),
              }
            : null
        }
        purchaseOrders={viewPurchaseOrders}
        loading={detailLoading}
        error={detailError}
      />

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set sales target</DialogTitle>
            <DialogDescription>
              {editingPerson
                ? `${editingPerson.fullName} · ${roleLabel(editingPerson.role)}`
                : 'Assign a monthly revenue target'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Month</Label>
              <TargetMonthPicker
                value={draftMonth}
                onChange={setDraftMonth}
                triggerClassName="w-full justify-between h-10"
                className="w-[320px] p-0 z-[100]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="target-revenue">Target revenue (₱)</Label>
              <Input
                id="target-revenue"
                type="number"
                min={0}
                step={1000}
                placeholder="e.g. 850000"
                value={draftTarget}
                onChange={(e) => setDraftTarget(e.target.value)}
              />
            </div>
            {editingDraftRow && (
              <p className="text-sm text-muted-foreground">
                Actual sales:{' '}
                {`${formatPeso(editingDraftRow.actualRevenue)} · ${editingDraftRow.actualOrders.toLocaleString('en-PH')} POs · ${editingDraftRow.actualQty.toLocaleString('en-PH')} units`}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            {editingHasTarget && (
              <Button
                variant="outline"
                onClick={() => void handleClearTarget()}
                disabled={saving}
                className="sm:mr-auto"
              >
                Clear target
              </Button>
            )}
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void saveEdit()} disabled={!draftMonth || saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
