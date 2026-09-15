import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  AlertCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  History,
  Loader2,
  MoreHorizontal,
  PackageX,
  Search,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getDateRangeFromPreset, isDateInRange } from '@/lib/dateRangePresets';
import {
  DateRangeFilterPopover,
  type DateRangeFilterValue,
} from '@/features/shared/components/DateRangeFilterPopover';
import { useAuth } from '@/features/auth';
import { useWarehouseLocationMembership } from './useWarehouseLocationMembership';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { SortableTableHead } from '@/features/shared/components/SortableTableHead';
import {
  createInitialTableSortCycle,
  getNextTableSortCycleState,
  getTableSortDisplayDirection,
  resolveTableSortDirection,
  type TableSortCycleState,
} from '@/features/shared/utils/tableSortCycle';
import {
  DEFAULT_WAREHOUSE_DISPOSAL_SORT_DIRECTION,
  DEFAULT_WAREHOUSE_DISPOSAL_SORT_KEY,
  sortWarehouseDisposals,
  type WarehouseDisposalSortKey,
} from './utils/warehouseDisposalSorting';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import PageManualDialog from '@/features/inventory/warehouse-manual/components/PageManualDialog';
import DisposalLogManual from '@/features/inventory/warehouse-manual/components/DisposalLogManual';
import {
  SaReturnTimelineDialog,
  type SaReturnTimelineDialogInput,
} from './components/SaReturnTimelineDialog';
import type { SaReturnType } from './utils/saReturnDisplay';

type DisposalSaReceiptLine = {
  qty_good: number;
  qty_damaged: number;
  warehouse_variant: {
    name: string;
    brand: { name: string } | null;
  } | null;
};

type DisposalSaReceipt = {
  id: string;
  received_at: string;
  notes: string | null;
  received_by_user: { full_name: string } | null;
  lines: DisposalSaReceiptLine[];
};

type DisposalSaReturn = {
  id: string;
  request_number: string;
  return_type: string | null;
  status: string | null;
  created_at: string | null;
  approved_at: string | null;
  cancelled_at: string | null;
  source_agent_id: string | null;
  client_company: { company_name: string } | null;
  created_by_user: { full_name: string } | null;
  source_agent: { full_name: string } | null;
  approved_by_user: { full_name: string } | null;
  cancelled_by_user: { full_name: string } | null;
  destination_location: { name: string; is_main: boolean } | null;
  receipts: DisposalSaReceipt[];
};

type DisposalRow = {
  id: string;
  quantity: number;
  source_type: string;
  notes: string | null;
  created_at: string;
  sa_stock_return_request_id: string | null;
  warehouse_location: { name: string; is_main: boolean } | null;
  variant: {
    name: string;
    variant_type: string;
    brand: { name: string } | { name: string }[] | null;
  } | null;
  disposed_by_user: { full_name: string } | null;
  fulfillment_po: { po_number: string } | null;
  rebate: { rebate_number: string } | null;
  sa_return: DisposalSaReturn | null;
  stock_return: { request_number: string } | null;
};

type LocationOption = {
  id: string;
  name: string;
  is_main: boolean;
};

type DisposalReferenceGroup = {
  key: string;
  reference: string;
  rows: DisposalRow[];
};

const SOURCE_LABELS: Record<string, string> = {
  rebate_return: 'Rebate return',
  sub_warehouse_return: 'Sub-warehouse return',
  adjustment: 'Adjustment',
  other: 'Other',
  standard_account_return: 'Client stock return',
};

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[0];

const SA_STATUS_LABELS: Record<string, string> = {
  pending_approval: 'Pending approval',
  pending_receive: 'Pending inspect',
  partially_received: 'Partially inspected',
  fully_received: 'Fully inspected',
  cancelled: 'Cancelled',
};

const SA_STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pending_approval: 'secondary',
  pending_receive: 'secondary',
  partially_received: 'default',
  fully_received: 'outline',
  cancelled: 'destructive',
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function extractBrandName(
  brand: { name: string } | { name: string }[] | null | undefined
): string {
  if (!brand) return '—';
  if (Array.isArray(brand)) return brand[0]?.name ?? '—';
  return brand.name ?? '—';
}

function disposalSourceLabel(row: DisposalRow): string {
  if (row.source_type === 'standard_account_return') {
    if (row.sa_return?.return_type === 'item_disposal') return 'For Disposal';
    return 'Client stock return';
  }
  return SOURCE_LABELS[row.source_type] ?? row.source_type;
}

function formatVariantType(type: string): string {
  const value = type.trim().toLowerCase();
  if (value === 'posm') return 'POSM';
  if (value === 'foc') return 'FOC';
  if (value === 'ncv') return 'NCV';
  if (!value) return '—';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function variantTypeBadgeClass(type: string): string {
  const value = type.trim().toLowerCase();
  if (value === 'flavor') return 'bg-blue-100 text-blue-700';
  if (value === 'battery') return 'bg-green-100 text-green-700';
  if (value === 'posm') return 'bg-purple-100 text-purple-700';
  if (value === 'foc') return 'bg-amber-100 text-amber-800';
  if (value === 'ncv') return 'bg-slate-100 text-slate-700';
  return 'bg-muted text-muted-foreground';
}

function groupDisposalRowsByBrand(rows: DisposalRow[]) {
  const map = new Map<string, DisposalRow[]>();
  for (const row of rows) {
    const brand = extractBrandName(row.variant?.brand ?? null);
    const list = map.get(brand) || [];
    list.push(row);
    map.set(brand, list);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([brandName, brandRows]) => ({
      brandName,
      qty: brandRows.reduce((sum, row) => sum + row.quantity, 0),
      variants: [...brandRows].sort((a, b) =>
        (a.variant?.name ?? '').localeCompare(b.variant?.name ?? '')
      ),
    }));
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return format(parsed, 'MMM d, yyyy HH:mm');
}

function formatPersonWithDate(
  name: string | null | undefined,
  date: string | null | undefined
): string {
  const person = name?.trim() || '—';
  if (!date) return person;
  return `${person} · ${formatDateTime(date)}`;
}

function toSaReturnTimelineInput(sa: DisposalSaReturn): SaReturnTimelineDialogInput {
  const dest = sa.destination_location;
  return {
    requestNumber: sa.request_number,
    createdAt: sa.created_at ?? new Date().toISOString(),
    createdByName: sa.created_by_user?.full_name,
    sourceAgentId: sa.source_agent_id,
    sourceAgentName: sa.source_agent?.full_name,
    approvedAt: sa.approved_at,
    approvedByName: sa.approved_by_user?.full_name,
    cancelledAt: sa.cancelled_at,
    cancelledByName: sa.cancelled_by_user?.full_name,
    status: sa.status ?? 'fully_received',
    returnType: (sa.return_type as SaReturnType | null) ?? null,
    destinationLocationName: dest
      ? `${dest.name}${dest.is_main ? ' (Main)' : ' (Sub)'}`
      : null,
    receipts: sa.receipts.map((receipt) => ({
      id: receipt.id,
      received_at: receipt.received_at,
      notes: receipt.notes,
      receivedByName: receipt.received_by_user?.full_name ?? null,
      lines: receipt.lines.map((line) => ({
        qty_good: line.qty_good,
        qty_damaged: line.qty_damaged,
        productLabel: line.warehouse_variant
          ? [line.warehouse_variant.brand?.name, line.warehouse_variant.name]
              .filter(Boolean)
              .join(' · ') || null
          : null,
      })),
    })),
  };
}

function DisposalGroupDetails({ rows }: { rows: DisposalRow[] }) {
  const primary = rows[0];
  const sa = primary?.sa_return ?? null;
  const brandGroups = useMemo(() => groupDisposalRowsByBrand(rows), [rows]);
  const brandKey = brandGroups.map((g) => g.brandName).join('\0');
  const [openBrands, setOpenBrands] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setOpenBrands(new Set(brandKey ? brandKey.split('\0') : []));
  }, [brandKey]);

  const toggleBrand = (brandName: string) => {
    setOpenBrands((current) => {
      const next = new Set(current);
      if (next.has(brandName)) next.delete(brandName);
      else next.add(brandName);
      return next;
    });
  };

  const notesText = primary?.notes?.trim() || '';
  const status = sa?.status ?? null;
  const statusLabel = status ? SA_STATUS_LABELS[status] ?? status : null;

  return (
    <div className="space-y-3 rounded-lg border bg-background p-3">
      <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <span className="text-muted-foreground">Client</span>
          <p className="font-medium">{sa?.client_company?.company_name ?? '—'}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Where from</span>
          <p className="font-medium">{sa?.source_agent?.full_name ?? '—'}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Status</span>
          <div className="mt-1">
            {statusLabel ? (
              <Badge variant={SA_STATUS_VARIANT[status ?? ''] ?? 'secondary'}>{statusLabel}</Badge>
            ) : (
              <span className="font-medium">—</span>
            )}
          </div>
        </div>
        <div>
          <span className="text-muted-foreground">Submitted by</span>
          <p className="font-medium">
            {formatPersonWithDate(sa?.created_by_user?.full_name, sa?.created_at)}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">Approved by</span>
          <p className="font-medium">
            {formatPersonWithDate(sa?.approved_by_user?.full_name, sa?.approved_at)}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">Warehouse inspected by</span>
          <p className="font-medium">{primary?.disposed_by_user?.full_name ?? '—'}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Created at</span>
          <p className="font-medium">{formatDateTime(primary?.created_at)}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Source</span>
          <p className="font-medium">{primary ? disposalSourceLabel(primary) : '—'}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Reference</span>
          <p className="font-medium">{primary ? disposalReferenceLabel(primary) || '—' : '—'}</p>
        </div>
      </div>

      {notesText ? (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Notes</Label>
          <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm">{notesText}</div>
        </div>
      ) : null}

      <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_5rem] gap-3 px-1 text-xs font-medium text-muted-foreground">
        <span>Brand / Variant</span>
        <span className="text-right">Qty</span>
      </div>

      <div className="space-y-3">
        {brandGroups.map((group) => {
          const isOpen = openBrands.has(group.brandName);
          return (
            <section
              key={group.brandName}
              className="overflow-hidden rounded-xl border bg-background shadow-sm"
            >
              <button
                type="button"
                className="flex w-full items-center gap-3 border-b bg-muted/40 px-4 py-3 text-left hover:bg-muted/60"
                onClick={() => toggleBrand(group.brandName)}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <h3 className="truncate text-base font-semibold">{group.brandName}</h3>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {group.variants.length} variant{group.variants.length === 1 ? '' : 's'}
                  </span>
                </div>
                <span className="shrink-0 text-base font-semibold tabular-nums text-rose-700">
                  {group.qty}
                </span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                    isOpen && 'rotate-180'
                  )}
                />
              </button>

              {isOpen ? (
                <ul className="divide-y">
                  {group.variants.map((row) => {
                    const variantType = row.variant?.variant_type ?? '';
                    return (
                      <li
                        key={row.id}
                        className="flex items-center justify-between gap-3 px-4 py-3"
                      >
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <p className="break-words font-medium leading-snug">
                            {row.variant?.name ?? '—'}
                          </p>
                          <Badge
                            variant="secondary"
                            className={cn('shrink-0 font-normal', variantTypeBadgeClass(variantType))}
                          >
                            {formatVariantType(variantType)}
                          </Badge>
                        </div>
                        <span className="shrink-0 text-lg font-bold tabular-nums text-rose-700">
                          {row.quantity}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function disposalReferenceLabel(row: DisposalRow): string {
  return (
    row.sa_return?.request_number ??
    row.stock_return?.request_number ??
    row.fulfillment_po?.po_number ??
    row.rebate?.rebate_number ??
    ''
  );
}

function groupDisposalsByReference(rows: DisposalRow[]): DisposalReferenceGroup[] {
  const map = new Map<string, DisposalRow[]>();

  for (const row of rows) {
    const reference = disposalReferenceLabel(row).trim();
    const key = reference || `__single_${row.id}`;
    const list = map.get(key) || [];
    list.push(row);
    map.set(key, list);
  }

  return Array.from(map.entries())
    .map(([key, groupRows]) => {
      const sorted = [...groupRows].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      return {
        key,
        reference: disposalReferenceLabel(sorted[0]).trim(),
        rows: sorted,
      };
    })
    .sort(
      (a, b) =>
        new Date(b.rows[0]?.created_at ?? 0).getTime() -
        new Date(a.rows[0]?.created_at ?? 0).getTime()
    );
}

type RawDisposalSaReturn = {
  id: string;
  request_number: string;
  return_type: string | null;
  status: string | null;
  created_at: string | null;
  approved_at: string | null;
  cancelled_at: string | null;
  source_agent_id: string | null;
  client_company:
    | { company_name: string }
    | { company_name: string }[]
    | null;
  created_by_user: { full_name: string } | { full_name: string }[] | null;
  source_agent: { full_name: string } | { full_name: string }[] | null;
  approved_by_user: { full_name: string } | { full_name: string }[] | null;
  cancelled_by_user: { full_name: string } | { full_name: string }[] | null;
  destination_location:
    | { name: string; is_main: boolean }
    | { name: string; is_main: boolean }[]
    | null;
  receipts:
    | Array<{
        id: string;
        received_at: string;
        notes: string | null;
        received_by_user: { full_name: string } | { full_name: string }[] | null;
        lines:
          | Array<{
              qty_good: number;
              qty_damaged: number;
              warehouse_variant:
                | {
                    name: string;
                    brand: { name: string } | { name: string }[] | null;
                  }
                | {
                    name: string;
                    brand: { name: string } | { name: string }[] | null;
                  }[]
                | null;
            }>
          | null;
      }>
    | null;
};

type RawDisposalRow = {
  id: string;
  quantity: number;
  source_type: string;
  notes: string | null;
  created_at: string;
  standard_account_stock_return_request_id: string | null;
  warehouse_location:
    | { name: string; is_main: boolean }
    | { name: string; is_main: boolean }[]
    | null;
  variant:
    | {
        name: string;
        variant_type: string;
        brand: { name: string } | { name: string }[] | null;
      }
    | {
        name: string;
        variant_type: string;
        brand: { name: string } | { name: string }[] | null;
      }[]
    | null;
  disposed_by_user: { full_name: string } | { full_name: string }[] | null;
  fulfillment_po: { po_number: string } | { po_number: string }[] | null;
  rebate: { rebate_number: string } | { rebate_number: string }[] | null;
  sa_return: RawDisposalSaReturn | RawDisposalSaReturn[] | null;
  stock_return: { request_number: string } | { request_number: string }[] | null;
};

function mapSaReturn(raw: RawDisposalSaReturn | null): DisposalSaReturn | null {
  if (!raw) return null;
  return {
    id: raw.id,
    request_number: raw.request_number,
    return_type: raw.return_type,
    status: raw.status,
    created_at: raw.created_at,
    approved_at: raw.approved_at,
    cancelled_at: raw.cancelled_at,
    source_agent_id: raw.source_agent_id,
    client_company: firstRelation(raw.client_company),
    created_by_user: firstRelation(raw.created_by_user),
    source_agent: firstRelation(raw.source_agent),
    approved_by_user: firstRelation(raw.approved_by_user),
    cancelled_by_user: firstRelation(raw.cancelled_by_user),
    destination_location: firstRelation(raw.destination_location),
    receipts: (raw.receipts ?? []).map((receipt) => ({
      id: receipt.id,
      received_at: receipt.received_at,
      notes: receipt.notes,
      received_by_user: firstRelation(receipt.received_by_user),
      lines: (receipt.lines ?? []).map((line) => {
        const variant = firstRelation(line.warehouse_variant);
        return {
          qty_good: line.qty_good,
          qty_damaged: line.qty_damaged,
          warehouse_variant: variant
            ? {
                name: variant.name,
                brand: firstRelation(variant.brand),
              }
            : null,
        };
      }),
    })),
  };
}

function mapDisposalRow(raw: RawDisposalRow): DisposalRow {
  const variant = firstRelation(raw.variant);
  const brand = variant ? firstRelation(variant.brand) : null;
  const saReturn = mapSaReturn(firstRelation(raw.sa_return));

  return {
    id: raw.id,
    quantity: raw.quantity,
    source_type: raw.source_type,
    notes: raw.notes,
    created_at: raw.created_at,
    sa_stock_return_request_id:
      raw.standard_account_stock_return_request_id ?? saReturn?.id ?? null,
    warehouse_location: firstRelation(raw.warehouse_location),
    variant: variant
      ? {
          name: variant.name,
          variant_type: variant.variant_type,
          brand,
        }
      : null,
    disposed_by_user: firstRelation(raw.disposed_by_user),
    fulfillment_po: firstRelation(raw.fulfillment_po),
    rebate: firstRelation(raw.rebate),
    sa_return: saReturn,
    stock_return: firstRelation(raw.stock_return),
  };
}

function SeeMoreChips({
  items,
  initialVisible = 3,
  isAccordionOpen = false,
  onSeeMore,
}: {
  items: string[];
  initialVisible?: number;
  isAccordionOpen?: boolean;
  onSeeMore?: () => void;
}) {
  if (items.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  const hasMore = items.length > initialVisible;
  const visibleItems = items.slice(0, initialVisible);
  const hiddenCount = items.length - initialVisible;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {visibleItems.map((label) => (
          <Badge key={label} variant="outline" className="max-w-[14rem] truncate font-normal">
            {label}
          </Badge>
        ))}
      </div>
      {hasMore && !isAccordionOpen && onSeeMore ? (
        <button
          type="button"
          className="text-xs font-medium text-primary hover:underline"
          onClick={(event) => {
            event.stopPropagation();
            onSeeMore();
          }}
        >
          See more ({hiddenCount})
        </button>
      ) : null}
    </div>
  );
}

function DisposalRowActions({
  canTimeline,
  onView,
  onTimeline,
}: {
  canTimeline: boolean;
  onView: () => void;
  onTimeline: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Open actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44" onClick={(event) => event.stopPropagation()}>
        <DropdownMenuItem
          onClick={(event) => {
            event.stopPropagation();
            onView();
          }}
        >
          <Eye className="mr-2 h-4 w-4" />
          View
        </DropdownMenuItem>
        {canTimeline ? (
          <DropdownMenuItem
            onClick={(event) => {
              event.stopPropagation();
              onTimeline();
            }}
          >
            <History className="mr-2 h-4 w-4" />
            Timeline
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DisposalTableCells({
  row,
  isMainWarehouseUser,
  lead,
  actions,
}: {
  row: DisposalRow;
  isMainWarehouseUser: boolean;
  lead?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <>
      <TableCell className="whitespace-nowrap text-muted-foreground">
        <div className="flex items-center gap-1.5">
          {lead}
          {format(new Date(row.created_at), 'MMM d, yyyy HH:mm')}
        </div>
      </TableCell>
      {isMainWarehouseUser && (
        <TableCell>
          {row.warehouse_location?.is_main
            ? `Main: ${row.warehouse_location.name}`
            : row.warehouse_location?.name ?? '—'}
        </TableCell>
      )}
      <TableCell>{extractBrandName(row.variant?.brand ?? null)}</TableCell>
      <TableCell>{row.variant?.name ?? '—'}</TableCell>
      <TableCell className="text-muted-foreground">{row.variant?.variant_type ?? '—'}</TableCell>
      <TableCell className="text-right font-medium">{row.quantity}</TableCell>
      <TableCell>
        <Badge variant="secondary">{disposalSourceLabel(row)}</Badge>
      </TableCell>
      <TableCell className="whitespace-nowrap">{disposalReferenceLabel(row) || '—'}</TableCell>
      <TableCell>{row.disposed_by_user?.full_name ?? '—'}</TableCell>
      <TableCell
        className="max-w-[200px] truncate text-muted-foreground"
        title={row.notes ?? undefined}
      >
        {row.notes?.trim() || '—'}
      </TableCell>
      <TableCell className="text-right">{actions}</TableCell>
    </>
  );
}

export default function WarehouseDisposalsPage() {
  const { user } = useAuth();
  const isWarehouse = user?.role === 'warehouse';
  const { membership } = useWarehouseLocationMembership({
    userId: user?.id,
    isWarehouse,
  });
  const isMainWarehouseUser = membership.isMain;

  const [searchQuery, setSearchQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilterValue>({
    preset: 'all',
  });
  const [sortState, setSortState] =
    useState<TableSortCycleState<WarehouseDisposalSortKey>>(createInitialTableSortCycle);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [viewOpen, setViewOpen] = useState(false);
  const [viewRows, setViewRows] = useState<DisposalRow[] | null>(null);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [timelineReturn, setTimelineReturn] = useState<SaReturnTimelineDialogInput | null>(null);

  const { data: locations = [] } = useQuery({
    queryKey: ['warehouse-disposal-locations', user?.company_id],
    enabled: !!user?.company_id && isWarehouse && isMainWarehouseUser,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warehouse_locations')
        .select('id, name, is_main')
        .eq('company_id', user!.company_id!)
        .order('is_main', { ascending: false })
        .order('name');
      if (error) throw error;
      return (data ?? []) as LocationOption[];
    },
  });

  const {
    data: disposalRows = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: [
      'warehouse-inventory-disposals',
      'v2',
      user?.company_id,
      user?.id,
      membership.locationId,
      isMainWarehouseUser ? locationFilter : membership.locationId,
    ],
    enabled: !!user?.company_id && isWarehouse,
    queryFn: async () => {
      let query = supabase
        .from('warehouse_inventory_disposals')
        .select(
          `
          id,
          quantity,
          source_type,
          notes,
          created_at,
          standard_account_stock_return_request_id,
          warehouse_location:warehouse_locations!warehouse_inventory_disposals_warehouse_location_id_fkey (
            name,
            is_main
          ),
          variant:variants!warehouse_inventory_disposals_variant_id_fkey (
            name,
            variant_type,
            brand:brands ( name )
          ),
          disposed_by_user:profiles!warehouse_inventory_disposals_disposed_by_fkey ( full_name ),
          fulfillment_po:purchase_orders!warehouse_inventory_disposals_fulfillment_po_id_fkey ( po_number ),
          rebate:key_account_po_rebates!warehouse_inventory_disposals_rebate_id_fkey ( rebate_number ),
          sa_return:standard_account_stock_return_requests!warehouse_inventory_disposals_sa_stock_return_request_id_fkey (
            id,
            request_number,
            return_type
          ),
          stock_return:warehouse_stock_return_requests!warehouse_inventory_disposals_stock_return_request_id_fkey (
            request_number
          )
        `
        )
        .eq('company_id', user!.company_id!)
        .order('created_at', { ascending: false });

      if (isMainWarehouseUser && locationFilter !== 'all') {
        query = query.eq('warehouse_location_id', locationFilter);
      }

      const { data, error: queryError } = await query;
      if (queryError) throw queryError;
      return (data ?? []).map((row) => mapDisposalRow(row as RawDisposalRow));
    },
  });

  const saReturnIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of disposalRows) {
      const id = row.sa_stock_return_request_id ?? row.sa_return?.id;
      if (id) ids.add(id);
    }
    return Array.from(ids);
  }, [disposalRows]);

  const { data: saReturnDetails = [] } = useQuery({
    queryKey: [
      'warehouse-disposal-sa-return-details',
      user?.company_id,
      saReturnIds.slice().sort().join(','),
    ],
    enabled: !!user?.company_id && isWarehouse && saReturnIds.length > 0,
    queryFn: async () => {
      const { data, error: queryError } = await supabase
        .from('standard_account_stock_return_requests')
        .select(
          `
          id,
          request_number,
          return_type,
          status,
          created_at,
          approved_at,
          cancelled_at,
          source_agent_id,
          client_company:companies!client_company_id ( company_name ),
          created_by_user:profiles!created_by ( full_name ),
          source_agent:profiles!source_agent_id ( full_name ),
          approved_by_user:profiles!approved_by ( full_name ),
          cancelled_by_user:profiles!cancelled_by ( full_name ),
          destination_location:warehouse_locations!destination_location_id (
            name,
            is_main
          ),
          receipts:standard_account_stock_return_receipts (
            id,
            received_at,
            notes,
            received_by_user:profiles!received_by ( full_name ),
            lines:standard_account_stock_return_receipt_lines (
              qty_good,
              qty_damaged,
              warehouse_variant:variants!warehouse_variant_id (
                name,
                brand:brands ( name )
              )
            )
          )
        `
        )
        .eq('warehouse_company_id', user!.company_id!)
        .in('id', saReturnIds);
      if (queryError) throw queryError;
      return (data ?? [])
        .map((row) => mapSaReturn(row as RawDisposalSaReturn))
        .filter((row): row is DisposalSaReturn => !!row);
    },
  });

  const saReturnById = useMemo(() => {
    const map = new Map<string, DisposalSaReturn>();
    for (const row of saReturnDetails) {
      map.set(row.id, row);
    }
    return map;
  }, [saReturnDetails]);

  const disposals = useMemo(() => {
    return disposalRows.map((row) => {
      const saId = row.sa_stock_return_request_id ?? row.sa_return?.id;
      if (!saId) return row;
      const details = saReturnById.get(saId);
      if (!details) return row;
      return {
        ...row,
        sa_return: {
          ...details,
          request_number: details.request_number || row.sa_return?.request_number || '',
          return_type: details.return_type ?? row.sa_return?.return_type ?? null,
        },
      };
    });
  }, [disposalRows, saReturnById]);

  const disposalDateRange = useMemo(() => {
    return getDateRangeFromPreset(
      dateRangeFilter.preset,
      dateRangeFilter.customStart,
      dateRangeFilter.customEnd
    );
  }, [dateRangeFilter]);

  const dateScopedDisposals = useMemo(() => {
    return disposals.filter((row) =>
      isDateInRange(new Date(row.created_at), disposalDateRange.start, disposalDateRange.end)
    );
  }, [disposals, disposalDateRange.end, disposalDateRange.start]);

  const filteredDisposals = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return dateScopedDisposals;

    return dateScopedDisposals.filter((row) => {
      const variant = row.variant;
      const brand = extractBrandName(variant?.brand ?? null);
      const variantName = variant?.name ?? '';
      const reference = disposalReferenceLabel(row);
      const locationName = row.warehouse_location?.name ?? '';
      const disposedBy = row.disposed_by_user?.full_name ?? '';
      const sourceLabel = disposalSourceLabel(row);

      return (
        brand.toLowerCase().includes(term) ||
        variantName.toLowerCase().includes(term) ||
        reference.toLowerCase().includes(term) ||
        locationName.toLowerCase().includes(term) ||
        disposedBy.toLowerCase().includes(term) ||
        sourceLabel.toLowerCase().includes(term) ||
        row.source_type.toLowerCase().includes(term)
      );
    });
  }, [dateScopedDisposals, searchQuery]);

  const { key: resolvedSortKey, direction: resolvedSortDirection } = useMemo(
    () =>
      resolveTableSortDirection(
        sortState,
        DEFAULT_WAREHOUSE_DISPOSAL_SORT_KEY,
        DEFAULT_WAREHOUSE_DISPOSAL_SORT_DIRECTION
      ),
    [sortState]
  );

  const sortedDisposals = useMemo(
    () => sortWarehouseDisposals(filteredDisposals, resolvedSortKey, resolvedSortDirection),
    [filteredDisposals, resolvedSortKey, resolvedSortDirection]
  );

  const groupedDisposals = useMemo(
    () => groupDisposalsByReference(sortedDisposals),
    [sortedDisposals]
  );

  const handleSort = (key: WarehouseDisposalSortKey) => {
    setSortState((current) => getNextTableSortCycleState(current, key));
  };

  const totalPages = Math.max(1, Math.ceil(groupedDisposals.length / pageSize));

  const paginatedGroups = useMemo(() => {
    const start = (page - 1) * pageSize;
    return groupedDisposals.slice(start, start + pageSize);
  }, [groupedDisposals, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, locationFilter, dateRangeFilter, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginationStart =
    groupedDisposals.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const paginationEnd = Math.min(page * pageSize, groupedDisposals.length);

  const totalUnits = useMemo(
    () => filteredDisposals.reduce((sum, row) => sum + row.quantity, 0),
    [filteredDisposals]
  );

  const toggleGroup = (key: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const openGroup = (key: string) => {
    setOpenGroups((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  };

  const openView = (rows: DisposalRow[]) => {
    setViewRows(rows);
    setViewOpen(true);
  };

  const openTimeline = (sa: DisposalSaReturn) => {
    setTimelineReturn(toSaReturnTimelineInput(sa));
    setTimelineOpen(true);
  };

  const colSpan = isMainWarehouseUser ? 11 : 10;

  const pageTitle = isMainWarehouseUser ? 'Disposal log' : 'Disposal log (your location)';
  const pageDescription = isMainWarehouseUser
    ? 'Damaged or unsellable units from rebate returns, client For Disposal returns, and other warehouse inspections.'
    : 'Damaged or unsellable units logged for your assigned sub-warehouse.';

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <PackageX className="h-7 w-7 text-muted-foreground" />
            <h1 className="text-2xl font-bold tracking-tight">{pageTitle}</h1>
          </div>
          <p className="text-muted-foreground">{pageDescription}</p>
        </div>
        <PageManualDialog
          title="Disposal Log Manual"
          fullManualHref="/warehouse-manual#disposal-log"
        >
          <DisposalLogManual embedded />
        </PageManualDialog>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Disposal entries</CardDescription>
            <CardTitle className="text-3xl">{filteredDisposals.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total units disposed</CardDescription>
            <CardTitle className="text-3xl">{totalUnits}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Scope</CardDescription>
            <CardTitle className="text-lg">
              {isMainWarehouseUser
                ? 'All locations'
                : membership.status === 'sub'
                  ? 'Your sub-warehouse'
                  : 'Your warehouse'}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Disposed items</CardTitle>
          <CardDescription>
            Good-condition Stock Returns are restocked. For Disposal returns and damaged units appear
            here only and are not sellable inventory. Expand any row for details; same reference
            groups expand to show all lines.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search brand, variant, RT, PO, rebate, location…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <DateRangeFilterPopover
              value={dateRangeFilter}
              onChange={setDateRangeFilter}
              triggerClassName="w-full sm:w-[220px] justify-between h-10 shrink-0"
              align="end"
            />
            {isMainWarehouseUser && locations.length > 0 && (
              <Select value={locationFilter} onValueChange={setLocationFilter}>
                <SelectTrigger className="w-full sm:w-[220px]">
                  <SelectValue placeholder="All locations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All locations</SelectItem>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.is_main ? `Main: ${loc.name}` : loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading disposal records…
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Could not load disposal records. Please try again.
            </div>
          ) : filteredDisposals.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {disposals.length === 0
                ? 'No disposal records yet. Damaged units and For Disposal client returns will appear here after warehouse inspect.'
                : 'No disposal records match the selected date range or search.'}
            </p>
          ) : (
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead
                      label="Date"
                      sortKey="createdAt"
                      sortDirection={getTableSortDisplayDirection(sortState, 'createdAt')}
                      onSort={handleSort}
                    />
                    {isMainWarehouseUser && (
                      <SortableTableHead
                        label="Location"
                        sortKey="locationName"
                        sortDirection={getTableSortDisplayDirection(sortState, 'locationName')}
                        onSort={handleSort}
                      />
                    )}
                    <SortableTableHead
                      label="Brand"
                      sortKey="brandName"
                      sortDirection={getTableSortDisplayDirection(sortState, 'brandName')}
                      onSort={handleSort}
                    />
                    <SortableTableHead
                      label="Variant"
                      sortKey="variantName"
                      sortDirection={getTableSortDisplayDirection(sortState, 'variantName')}
                      onSort={handleSort}
                    />
                    <SortableTableHead
                      label="Type"
                      sortKey="variantType"
                      sortDirection={getTableSortDisplayDirection(sortState, 'variantType')}
                      onSort={handleSort}
                    />
                    <SortableTableHead
                      label="Qty"
                      sortKey="quantity"
                      sortDirection={getTableSortDisplayDirection(sortState, 'quantity')}
                      onSort={handleSort}
                      className="text-right"
                    />
                    <SortableTableHead
                      label="Source"
                      sortKey="sourceType"
                      sortDirection={getTableSortDisplayDirection(sortState, 'sourceType')}
                      onSort={handleSort}
                    />
                    <SortableTableHead
                      label="Reference"
                      sortKey="reference"
                      sortDirection={getTableSortDisplayDirection(sortState, 'reference')}
                      onSort={handleSort}
                    />
                    <SortableTableHead
                      label="Disposed by"
                      sortKey="disposedBy"
                      sortDirection={getTableSortDisplayDirection(sortState, 'disposedBy')}
                      onSort={handleSort}
                    />
                    <SortableTableHead
                      label="Notes"
                      sortKey="notes"
                      sortDirection={getTableSortDisplayDirection(sortState, 'notes')}
                      onSort={handleSort}
                    />
                    <th className="h-10 w-12 px-2 text-right align-middle text-xs font-medium text-muted-foreground">
                      <span className="sr-only">Actions</span>
                    </th>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedGroups.map((group) => {
                    const isGrouped = group.rows.length > 1 && !!group.reference;
                    const isOpen = openGroups.has(group.key);
                    const primary = group.rows[0];
                    const saReturn = primary?.sa_return ?? null;
                    const rowActions = (
                      <DisposalRowActions
                        canTimeline={!!saReturn}
                        onView={() => openView(group.rows)}
                        onTimeline={() => {
                          if (saReturn) openTimeline(saReturn);
                        }}
                      />
                    );

                    if (!isGrouped) {
                      return (
                        <Fragment key={group.key}>
                          <TableRow
                            className="cursor-pointer hover:bg-muted/40"
                            onClick={() => toggleGroup(group.key)}
                          >
                            <DisposalTableCells
                              row={primary}
                              isMainWarehouseUser={isMainWarehouseUser}
                              lead={
                                <ChevronDown
                                  className={cn(
                                    'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                                    isOpen && 'rotate-180'
                                  )}
                                />
                              }
                              actions={rowActions}
                            />
                          </TableRow>
                          {isOpen ? (
                            <TableRow className="hover:bg-transparent">
                              <TableCell colSpan={colSpan} className="bg-muted/10 p-3">
                                <DisposalGroupDetails rows={group.rows} />
                              </TableCell>
                            </TableRow>
                          ) : null}
                        </Fragment>
                      );
                    }

                    const totalQty = group.rows.reduce((sum, r) => sum + r.quantity, 0);
                    const brandNames = Array.from(
                      new Set(
                        group.rows
                          .map((r) => extractBrandName(r.variant?.brand ?? null))
                          .filter((name) => name && name !== '—')
                      )
                    ).sort((a, b) => a.localeCompare(b));
                    const variantQtyByName = new Map<string, number>();
                    for (const row of group.rows) {
                      const name = row.variant?.name?.trim() || '';
                      if (!name) continue;
                      variantQtyByName.set(name, (variantQtyByName.get(name) ?? 0) + row.quantity);
                    }
                    const variantChips = Array.from(variantQtyByName.entries())
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([name, qty]) => `${name} ×${qty}`);
                    const variantTypes = Array.from(
                      new Set(
                        group.rows
                          .map((r) => r.variant?.variant_type?.trim() || '')
                          .filter(Boolean)
                      )
                    ).sort((a, b) => a.localeCompare(b));

                    return (
                      <Fragment key={group.key}>
                        <TableRow
                          className="cursor-pointer bg-muted/20 hover:bg-muted/40"
                          onClick={() => toggleGroup(group.key)}
                        >
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            <div className="flex items-center gap-1.5">
                              <ChevronDown
                                className={cn(
                                  'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                                  isOpen && 'rotate-180'
                                )}
                              />
                              {format(new Date(primary.created_at), 'MMM d, yyyy HH:mm')}
                            </div>
                          </TableCell>
                          {isMainWarehouseUser && (
                            <TableCell>
                              {primary.warehouse_location?.is_main
                                ? `Main: ${primary.warehouse_location.name}`
                                : primary.warehouse_location?.name ?? '—'}
                            </TableCell>
                          )}
                          <TableCell className="min-w-[10rem] align-top">
                            <SeeMoreChips
                              items={brandNames}
                              isAccordionOpen={isOpen}
                              onSeeMore={() => openGroup(group.key)}
                            />
                          </TableCell>
                          <TableCell className="min-w-[12rem] align-top">
                            <SeeMoreChips
                              items={variantChips}
                              isAccordionOpen={isOpen}
                              onSeeMore={() => openGroup(group.key)}
                            />
                          </TableCell>
                          <TableCell className="min-w-[8rem] align-top text-muted-foreground">
                            <SeeMoreChips
                              items={variantTypes.map(formatVariantType)}
                              isAccordionOpen={isOpen}
                              onSeeMore={() => openGroup(group.key)}
                            />
                          </TableCell>
                          <TableCell className="text-right font-medium">{totalQty}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{disposalSourceLabel(primary)}</Badge>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {group.reference || '—'}
                          </TableCell>
                          <TableCell>{primary.disposed_by_user?.full_name ?? '—'}</TableCell>
                          <TableCell
                            className="max-w-[200px] truncate text-muted-foreground"
                            title={primary.notes ?? undefined}
                          >
                            {primary.notes?.trim() || '—'}
                          </TableCell>
                          <TableCell className="text-right">{rowActions}</TableCell>
                        </TableRow>
                        {isOpen ? (
                          <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={colSpan} className="bg-muted/10 p-3">
                              <DisposalGroupDetails rows={group.rows} />
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="flex flex-col gap-3 border-t bg-muted/20 px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <span>
                    Showing {paginationStart}–{paginationEnd} of {groupedDisposals.length}
                  </span>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="disposals-page-size" className="text-xs whitespace-nowrap">
                      Rows per page
                    </Label>
                    <Select
                      value={String(pageSize)}
                      onValueChange={(v) => setPageSize(Number(v))}
                    >
                      <SelectTrigger id="disposals-page-size" className="h-8 w-[72px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAGE_SIZE_OPTIONS.map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <span className="min-w-[100px] text-center tabular-nums">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={viewOpen}
        onOpenChange={(open) => {
          setViewOpen(open);
          if (!open) setViewRows(null);
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3 pr-6">
              <DialogTitle>
                {viewRows?.[0]
                  ? disposalReferenceLabel(viewRows[0]) || 'Disposal details'
                  : 'Disposal details'}
              </DialogTitle>
              {viewRows?.[0]?.sa_return ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => openTimeline(viewRows[0].sa_return!)}
                >
                  <History className="mr-2 h-4 w-4" />
                  Timeline
                </Button>
              ) : null}
            </div>
          </DialogHeader>
          {viewRows ? <DisposalGroupDetails rows={viewRows} /> : null}
        </DialogContent>
      </Dialog>

      <SaReturnTimelineDialog
        open={timelineOpen}
        onOpenChange={(open) => {
          setTimelineOpen(open);
          if (!open) setTimelineReturn(null);
        }}
        returnRequest={timelineReturn}
      />
    </div>
  );
}
