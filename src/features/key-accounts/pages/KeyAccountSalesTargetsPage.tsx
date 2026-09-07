import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
import {
  SalesTargetActualDetailDialog,
  getMockPosForPersonMonth,
} from '../components/SalesTargetActualDetailDialog';
import { getDatePresetLabel } from '@/lib/dateRangePresets';
import { cn } from '@/lib/utils';
import { Target, Pencil, Users, Crown, Eye } from 'lucide-react';

type AssigneeRole = 'sales_director' | 'key_account_manager';
type RoleFilter = 'all' | AssigneeRole;
type FilterMode = 'review' | 'plan';


type MockPerson = {
  id: string;
  fullName: string;
  role: AssigneeRole;
  directorName?: string;
};

/** Stored target for one person + one month (YYYY-MM). */
type MockTarget = {
  targetRevenue: number;
  /** Mock PO actuals — 0 for future / unset months */
  actualRevenue: number;
  actualOrders: number;
  actualQty: number;
};

type DisplayRow = MockPerson & {
  rowKey: string;
  month: string;
  targetRevenue: number | null;
  actualRevenue: number;
  actualOrders: number;
  actualQty: number;
};

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

function targetKey(assigneeId: string, month: string): string {
  return `${assigneeId}:${month}`;
}

const MOCK_PEOPLE: MockPerson[] = [
  { id: 'd1', fullName: 'Maria Santos', role: 'sales_director' },
  { id: 'd2', fullName: 'James Reyes', role: 'sales_director' },
  {
    id: 'k1',
    fullName: 'Ana Cruz',
    role: 'key_account_manager',
    directorName: 'Maria Santos',
  },
  {
    id: 'k2',
    fullName: 'Paolo Lim',
    role: 'key_account_manager',
    directorName: 'Maria Santos',
  },
  {
    id: 'k3',
    fullName: 'Sofia Tan',
    role: 'key_account_manager',
    directorName: 'James Reyes',
  },
  {
    id: 'k4',
    fullName: 'Mark Villanueva',
    role: 'key_account_manager',
    directorName: 'James Reyes',
  },
];

/** Seed targets for this month only — other months stay empty until set. */
function buildInitialTargets(): Record<string, MockTarget> {
  const month = currentMonthValue();
  const seed: Array<{
    id: string;
    target: number;
    actual: number;
    orders: number;
    qty: number;
  }> = [
    { id: 'd1', target: 2_500_000, actual: 1_820_000, orders: 48, qty: 1_240 },
    { id: 'd2', target: 1_800_000, actual: 2_050_000, orders: 52, qty: 1_510 },
    { id: 'k1', target: 850_000, actual: 612_000, orders: 18, qty: 420 },
    { id: 'k2', target: 720_000, actual: 490_000, orders: 14, qty: 310 },
    { id: 'k4', target: 600_000, actual: 640_000, orders: 21, qty: 455 },
    // k3 intentionally unset this month
  ];
  const map: Record<string, MockTarget> = {};
  for (const row of seed) {
    map[targetKey(row.id, month)] = {
      targetRevenue: row.target,
      actualRevenue: row.actual,
      actualOrders: row.orders,
      actualQty: row.qty,
    };
  }
  return map;
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

/**
 * Visual mock for Sales Head / Sales Admin to assign monthly sales targets.
 * Page filter selects which month(s) to view; unset months show empty/zero so you can set.
 */
export function KeyAccountSalesTargetsPage() {
  const [filterMode, setFilterMode] = useState<FilterMode>('review');
  const [reviewFilter, setReviewFilter] = useState<DateRangeFilterValue>({
    preset: 'this_month',
  });
  const [planFilter, setPlanFilter] = useState<SalesTargetPeriodValue>({
    preset: 'next_month',
  });
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [targets, setTargets] = useState<Record<string, MockTarget>>(buildInitialTargets);
  const [editOpen, setEditOpen] = useState(false);
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [draftTarget, setDraftTarget] = useState('');
  const [draftMonth, setDraftMonth] = useState(() => currentMonthValue());
  const [viewOpen, setViewOpen] = useState(false);
  const [viewRow, setViewRow] = useState<DisplayRow | null>(null);

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

  const displayRows = useMemo((): DisplayRow[] => {
    const people =
      roleFilter === 'all'
        ? MOCK_PEOPLE
        : MOCK_PEOPLE.filter((p) => p.role === roleFilter);

    const rows: DisplayRow[] = [];
    for (const person of people) {
      for (const month of viewMonths) {
        const stored = targets[targetKey(person.id, month)];
        rows.push({
          ...person,
          rowKey: targetKey(person.id, month),
          month,
          targetRevenue: stored?.targetRevenue ?? null,
          // Future / unset months: show 0 so Sales Head can set a new target
          actualRevenue: stored?.actualRevenue ?? 0,
          actualOrders: stored?.actualOrders ?? 0,
          actualQty: stored?.actualQty ?? 0,
        });
      }
    }
    return rows;
  }, [roleFilter, viewMonths, targets]);

  const summary = useMemo(() => {
    const withTarget = displayRows.filter((r) => r.targetRevenue != null);
    const totalTarget = withTarget.reduce((s, r) => s + (r.targetRevenue ?? 0), 0);
    const totalActual = displayRows.reduce((s, r) => s + r.actualRevenue, 0);
    const unset = displayRows.filter((r) => r.targetRevenue == null).length;
    return { totalTarget, totalActual, unset, count: displayRows.length };
  }, [displayRows]);

  const editingPerson = editingPersonId
    ? MOCK_PEOPLE.find((p) => p.id === editingPersonId)
    : null;

  const openEdit = (row: DisplayRow) => {
    setEditingPersonId(row.id);
    setDraftTarget(row.targetRevenue != null ? String(row.targetRevenue) : '');
    setDraftMonth(row.month);
    setEditOpen(true);
  };

  const openView = (row: DisplayRow) => {
    setViewRow(row);
    setViewOpen(true);
  };

  const viewPurchaseOrders = useMemo(() => {
    if (!viewRow) return [];
    return getMockPosForPersonMonth(
      viewRow.id,
      viewRow.month,
      viewRow.actualOrders,
      viewRow.actualRevenue
    );
  }, [viewRow]);

  const saveEdit = () => {
    if (!editingPersonId || !draftMonth) return;
    const parsed = draftTarget.trim() === '' ? null : Number(draftTarget.replace(/,/g, ''));
    const next =
      parsed == null || Number.isNaN(parsed) ? null : Math.max(0, parsed);
    const key = targetKey(editingPersonId, draftMonth);

    setTargets((prev) => {
      const copy = { ...prev };
      if (next == null) {
        delete copy[key];
      } else {
        const existing = copy[key];
        copy[key] = {
          targetRevenue: next,
          actualRevenue: existing?.actualRevenue ?? 0,
          actualOrders: existing?.actualOrders ?? 0,
          actualQty: existing?.actualQty ?? 0,
        };
      }
      return copy;
    });
    setEditOpen(false);
    setEditingPersonId(null);
  };

  const clearTarget = () => {
    if (!editingPersonId || !draftMonth) return;
    const key = targetKey(editingPersonId, draftMonth);
    setTargets((prev) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
    setEditOpen(false);
    setEditingPersonId(null);
  };

  const editingHasTarget =
    editingPersonId != null &&
    targets[targetKey(editingPersonId, draftMonth)] != null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sales Targets</h1>
          <p className="text-muted-foreground">
            Each person can have a different sales target every month. Filter by period to view or set.
          </p>
          <Badge variant="outline" className="mt-2 text-amber-700 border-amber-300 bg-amber-50">
            UI preview — mock data only
          </Badge>
        </div>
      </div>

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
            Mock PO revenue for {periodLabel}
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
              {displayRows.map((row) => {
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
                      {row.role === 'sales_director'
                        ? '—'
                        : row.directorName ?? 'Unassigned'}
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
              })}
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
                directorName: viewRow.directorName,
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
      />

      <Dialog open={editOpen} onOpenChange={setEditOpen}>        <DialogContent>
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
            {editingPerson && (
              <p className="text-sm text-muted-foreground">
                Actual sales (mock):{' '}
                {(() => {
                  const a = targets[targetKey(editingPerson.id, draftMonth)];
                  return `${formatPeso(a?.actualRevenue ?? 0)} · ${(a?.actualOrders ?? 0).toLocaleString('en-PH')} POs · ${(a?.actualQty ?? 0).toLocaleString('en-PH')} units`;
                })()}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            {editingHasTarget && (
              <Button variant="outline" onClick={clearTarget} className="sm:mr-auto">
                Clear target
              </Button>
            )}
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveEdit} disabled={!draftMonth}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
