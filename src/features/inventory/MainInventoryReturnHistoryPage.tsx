import { Fragment, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Eye,
  Loader2,
  MoreVertical,
  Printer,
  RotateCcw,
  Search,
  Users,
} from 'lucide-react';
import { useAuth } from '@/features/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  DateRangeFilterPopover,
  type DateRangeFilterValue,
} from '@/features/shared/components/DateRangeFilterPopover';
import { getDateRangeFromPreset, isDateInRange } from '@/lib/dateRangePresets';
import {
  DEFAULT_PAGE_SIZE,
  getListPaginationSlice,
  ListPagination,
  type PageSize,
} from '@/features/shared/components/ListPagination';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { fetchAllPaginated, SUPABASE_PAGE_SIZE } from '@/lib/supabasePaginate';
import { isAdmin } from '@/lib/roleUtils';
import { useWarehouseLocationMembership } from './useWarehouseLocationMembership';
import { exportMainInventoryReturnPdf } from './utils/exportMainInventoryReturnPdf';
import { fetchLeaderRequestedFromName } from './utils/exportLeaderStockRequestPdf';

type ReturnLine = {
  id: string;
  quantity: number;
  notes: string | null;
  createdAt: string;
  returnedBy: string;
  performerId: string | null;
  variantName: string;
  variantType: string | null;
  brandName: string;
  fromLocation: string | null;
  isSubWarehouseReturn: boolean;
};

type ReturnGroup = {
  id: string;
  returnedBy: string;
  returnedAt: string;
  reason: string | null;
  isSubWarehouseReturn: boolean;
  variantCount: number;
  totalQuantity: number;
  lines: ReturnLine[];
};

function variantTypeLabel(type: string | null | undefined): string | null {
  if (!type?.trim()) return null;
  const key = type.trim().toLowerCase();
  if (key === 'flavor') return 'Flavor';
  if (key === 'battery') return 'Battery';
  if (key === 'foc') return 'FOC';
  if (key === 'posm') return 'POSM';
  if (key === 'ncv') return 'NCV';
  return type;
}

function returnLineLabel(line: Pick<ReturnLine, 'brandName' | 'variantName' | 'variantType'>): string {
  const brand = line.brandName?.trim();
  const variant = line.variantName?.trim() || 'Item';
  const type = variantTypeLabel(line.variantType);
  const name = brand && brand !== 'Unknown' ? `${brand} — ${variant}` : variant;
  return type ? `${name} (${type})` : name;
}

function variantTypeBadgeClass(type: string | null | undefined): string {
  const key = type?.trim().toLowerCase();
  if (key === 'flavor') return 'border-purple-300 bg-purple-100 text-purple-800';
  if (key === 'battery') return 'border-green-300 bg-green-100 text-green-800';
  if (key === 'foc') return 'border-orange-300 bg-orange-100 text-orange-800';
  return '';
}

function compareReturnLines(a: ReturnLine, b: ReturnLine): number {
  const brandCmp = a.brandName.localeCompare(b.brandName, undefined, { sensitivity: 'base' });
  if (brandCmp !== 0) return brandCmp;
  const variantCmp = a.variantName.localeCompare(b.variantName, undefined, { sensitivity: 'base' });
  if (variantCmp !== 0) return variantCmp;
  return (a.variantType || '').localeCompare(b.variantType || '', undefined, { sensitivity: 'base' });
}

function groupReturns(lines: ReturnLine[]): ReturnGroup[] {
  const groups = new Map<string, ReturnGroup>();

  lines.forEach((line) => {
    // One return_inventory_to_main call writes every line with the same timestamp.
    const key = [
      line.createdAt,
      line.fromLocation || '',
      line.performerId || '',
      line.notes || '',
      line.isSubWarehouseReturn ? 'sub' : 'leader',
    ].join('|');

    const existing = groups.get(key);
    if (existing) {
      existing.lines.push(line);
      existing.variantCount += 1;
      existing.totalQuantity += line.quantity;
      if (new Date(line.createdAt).getTime() < new Date(existing.returnedAt).getTime()) {
        existing.returnedAt = line.createdAt;
      }
      return;
    }

    groups.set(key, {
      id: key,
      returnedBy: line.returnedBy,
      returnedAt: line.createdAt,
      reason: line.notes,
      isSubWarehouseReturn: line.isSubWarehouseReturn,
      variantCount: 1,
      totalQuantity: line.quantity,
      lines: [line],
    });
  });

  const grouped = Array.from(groups.values());
  grouped.forEach((group) => {
    group.lines.sort(compareReturnLines);
  });

  return grouped.sort(
    (a, b) => new Date(b.returnedAt).getTime() - new Date(a.returnedAt).getTime()
  );
}

type DetailLine = {
  id: string;
  brandName: string;
  variantName: string;
  variantType: string | null;
  quantity: number;
};

function BrandReturnTables({ lines }: { lines: DetailLine[] }) {
  const brands = useMemo(() => {
    const map = new Map<string, DetailLine[]>();
    lines.forEach((line) => {
      const name = line.brandName?.trim() || 'Unknown brand';
      const list = map.get(name) ?? [];
      list.push(line);
      map.set(name, list);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [lines]);

  if (brands.length === 0) {
    return <p className="text-sm text-muted-foreground">No items on this return.</p>;
  }

  return (
    <div className="space-y-4">
      {brands.map(([brandName, brandLines]) => (
        <div key={brandName} className="overflow-hidden rounded-md border bg-white">
          <div className="border-b bg-muted/40 px-4 py-2.5 font-semibold">{brandName}</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Variant</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Qty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {brandLines.map((line) => {
                const label = variantTypeLabel(line.variantType);
                return (
                  <TableRow key={line.id}>
                    <TableCell className="break-words">{line.variantName}</TableCell>
                    <TableCell>
                      {label ? (
                        <Badge variant="outline" className={`text-[10px] ${variantTypeBadgeClass(line.variantType)}`}>
                          {label}
                        </Badge>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{line.quantity.toLocaleString()}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ))}
    </div>
  );
}

function ReturnDetails({ group }: { group: ReturnGroup }) {
  return (
    <div>
      <p className="mb-3 text-sm">
        <span className="font-medium">Reason of returned:</span>{' '}
        <span className="text-muted-foreground">{group.reason?.trim() || '—'}</span>
      </p>
      <BrandReturnTables
        lines={group.lines.map((line) => ({
          id: line.id,
          brandName: line.brandName,
          variantName: line.variantName,
          variantType: line.variantType,
          quantity: line.quantity,
        }))}
      />
    </div>
  );
}

const RETURN_HISTORY_ROW_CAP = 5000;
const AGENT_LOCATION_PREFIX = 'agent_inventory:';

function agentIdFromLocation(fromLocation: string | null | undefined): string | null {
  if (!fromLocation?.startsWith(AGENT_LOCATION_PREFIX)) return null;
  const id = fromLocation.slice(AGENT_LOCATION_PREFIX.length).trim();
  return id || null;
}

type ReturnTransactionRow = {
  id: string;
  quantity: number | null;
  notes: string | null;
  created_at: string;
  from_location: string | null;
  transaction_type: string;
  performed_by: string | null;
  variant:
    | {
        name: string | null;
        variant_type: string | null;
        brand: { name: string | null } | { name: string | null }[] | null;
      }
    | {
        name: string | null;
        variant_type: string | null;
        brand: { name: string | null } | { name: string | null }[] | null;
      }[]
    | null;
};

async function fetchReturnTransactions(
  companyId: string,
  transactionType: 'return_to_main' | 'warehouse_return_from_sub'
): Promise<ReturnTransactionRow[]> {
  const rows: ReturnTransactionRow[] = [];
  let offset = 0;
  let reachedCap = false;

  while (rows.length < RETURN_HISTORY_ROW_CAP) {
    const pageEnd = Math.min(offset + SUPABASE_PAGE_SIZE, RETURN_HISTORY_ROW_CAP) - 1;
    const { data, error } = await supabase
      .from('inventory_transactions')
      .select(`
        id,
        quantity,
        notes,
        created_at,
        from_location,
        transaction_type,
        performed_by,
        variant:variants!inventory_transactions_variant_id_fkey(
          name,
          variant_type,
          brand:brands!variants_brand_id_fkey(name)
        )
      `)
      .eq('company_id', companyId)
      .eq('transaction_type', transactionType)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, pageEnd);

    if (error) throw error;

    const batch = (data ?? []) as ReturnTransactionRow[];
    rows.push(...batch);
    if (batch.length < pageEnd - offset + 1) break;
    offset += batch.length;
    if (rows.length >= RETURN_HISTORY_ROW_CAP) {
      reachedCap = true;
      break;
    }
  }

  if (!reachedCap || rows.length === 0) return rows;
  const boundary = rows[rows.length - 1].created_at;
  return rows.filter((row) => row.created_at !== boundary);
}

async function fetchProfileNames(ids: string[]): Promise<Map<string, string>> {
  const nameById = new Map<string, string>();
  for (let index = 0; index < ids.length; index += 100) {
    const chunk = ids.slice(index, index + 100);
    const { data, error } = await supabase.from('profiles').select('id, full_name').in('id', chunk);
    if (error) throw error;
    for (const profile of data ?? []) {
      nameById.set(profile.id, profile.full_name?.trim() || 'Unknown');
    }
  }
  return nameById;
}

async function printGroup(group: ReturnGroup, companyId?: string | null) {
  const returnedTo = await fetchLeaderRequestedFromName(companyId);
  exportMainInventoryReturnPdf({
    returnedBy: group.returnedBy,
    returnedTo: returnedTo || 'Super Admin',
    returnedAt: group.returnedAt,
    reason: group.reason,
    lines: group.lines.map((line) => ({
      brandName: line.brandName,
      variantName: line.variantName,
      variantType: line.variantType,
      quantity: line.quantity,
    })),
  });
}

type AgentReturnStatus = 'pending' | 'approved' | 'rejected';

type AgentReturnItem = {
  variantId: string;
  quantity: number;
  variantName: string;
  variantType: string | null;
  brandName: string;
};

type AgentToLeaderReturn = {
  id: string;
  returnedBy: string;
  returnedTo: string;
  returnedAt: string;
  status: AgentReturnStatus;
  reason: string;
  rejectionReason: string | null;
  variantCount: number;
  totalQuantity: number;
  items: AgentReturnItem[];
};

type AgentReturnHeaderRow = {
  id: string;
  return_reason: string | null;
  reason_notes: string | null;
  rejection_reason: string | null;
  created_at: string;
  status: string | null;
  agent: { full_name: string | null } | { full_name: string | null }[] | null;
  receiver: { full_name: string | null } | { full_name: string | null }[] | null;
};

type AgentReturnItemRow = {
  id: string;
  return_id: string;
  variant_id: string;
  quantity: number | null;
  variant:
    | {
        name: string | null;
        variant_type: string | null;
        brand: { name: string | null } | { name: string | null }[] | null;
      }
    | {
        name: string | null;
        variant_type: string | null;
        brand: { name: string | null } | { name: string | null }[] | null;
      }[]
    | null;
};

/** Keep `.in(return_id)` URLs short, then page each chunk past the 1,000-row cap. */
const RETURN_ID_CHUNK = 80;

const STOCK_RETURN_QUERY_OPTIONS = {
  staleTime: 0,
  refetchOnMount: 'always' as const,
};

async function fetchAllAgentReturns(companyId: string): Promise<AgentReturnHeaderRow[]> {
  return fetchAllPaginated(async (from, to) => {
    const { data, error } = await supabase
      .from('inventory_returns')
      .select(`
        id,
        return_reason,
        reason_notes,
        rejection_reason,
        created_at,
        status,
        agent:profiles!inventory_returns_agent_id_fkey(full_name),
        receiver:profiles!inventory_returns_receiver_id_fkey(full_name)
      `)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);
    return { data: (data ?? null) as AgentReturnHeaderRow[] | null, error };
  });
}

async function fetchAllAgentReturnItems(returnIds: string[]): Promise<AgentReturnItemRow[]> {
  const items: AgentReturnItemRow[] = [];
  for (let index = 0; index < returnIds.length; index += RETURN_ID_CHUNK) {
    const chunk = returnIds.slice(index, index + RETURN_ID_CHUNK);
    const page = await fetchAllPaginated(async (from, to) => {
      const { data, error } = await supabase
        .from('inventory_return_items')
        .select(`
          id,
          return_id,
          variant_id,
          quantity,
          variant:variants(name, variant_type, brand:brands(name))
        `)
        .in('return_id', chunk)
        .order('id', { ascending: true })
        .range(from, to);
      return { data: (data ?? null) as AgentReturnItemRow[] | null, error };
    });
    items.push(...page);
  }
  return items;
}
//use return for the status label since return to main(superadmin) doesnt have approval
function agentStatusLabel(status: AgentReturnStatus): string {
  if (status === 'approved') return 'Returned';
  if (status === 'rejected') return 'Rejected';
  return 'Pending';
}

function agentStatusBadge(status: AgentReturnStatus) {
  const label = agentStatusLabel(status);
  if (status === 'approved') return <Badge>{label}</Badge>;
  if (status === 'rejected') return <Badge variant="destructive">{label}</Badge>;
  return <Badge variant="secondary">{label}</Badge>;
}

function AgentToLeaderReturns({
  companyId,
  searchQuery,
  rangeStart,
  rangeEnd,
}: {
  companyId: string;
  searchQuery: string;
  rangeStart?: Date;
  rangeEnd?: Date;
}) {
  const { toast } = useToast();
  const [detailReturn, setDetailReturn] = useState<AgentToLeaderReturn | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);

  const { data: returns = [], isLoading } = useQuery({
    queryKey: ['agent-to-leader-return-history', companyId],
    ...STOCK_RETURN_QUERY_OPTIONS,
    queryFn: async () => {
      let data: AgentReturnHeaderRow[] = [];
      try {
        data = await fetchAllAgentReturns(companyId);
      } catch (error) {
        toast({ title: 'Error', description: 'Failed to load team leader returns', variant: 'destructive' });
        throw error;
      }
      if (!data.length) return [];

      const itemsData = await fetchAllAgentReturnItems(data.map((row) => row.id));

      const itemsByReturn = new Map<string, AgentReturnItem[]>();
      itemsData.forEach((row) => {
        const variant = Array.isArray(row.variant) ? row.variant[0] : row.variant;
        const brand = variant?.brand
          ? Array.isArray(variant.brand) ? variant.brand[0] : variant.brand
          : null;
        const list = itemsByReturn.get(row.return_id) ?? [];
        list.push({
          variantId: row.variant_id,
          quantity: Number(row.quantity) || 0,
          variantName: variant?.name || 'Unknown',
          variantType: variant?.variant_type || null,
          brandName: brand?.name || 'Unknown',
        });
        itemsByReturn.set(row.return_id, list);
      });

      return data.map((row) => {
        const agent = Array.isArray(row.agent) ? row.agent[0] : row.agent;
        const receiver = Array.isArray(row.receiver) ? row.receiver[0] : row.receiver;
        const items = itemsByReturn.get(row.id) ?? [];
        const reason = [row.return_reason, row.reason_notes].map((part) => part?.trim()).filter(Boolean).join(' — ');
        const status: AgentReturnStatus =
          row.status === 'approved' || row.status === 'rejected' ? row.status : 'pending';
        return {
          id: row.id,
          returnedBy: agent?.full_name || 'Unknown',
          returnedTo: receiver?.full_name || 'Unknown',
          returnedAt: row.created_at,
          status,
          reason,
          rejectionReason: row.rejection_reason,
          variantCount: items.length,
          totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
          items,
        } satisfies AgentToLeaderReturn;
      });
    },
  });

  const visible = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return returns.filter((row) => {
      if (!isDateInRange(row.returnedAt, rangeStart, rangeEnd)) return false;
      if (!query) return true;
      return (
        row.returnedBy.toLowerCase().includes(query) ||
        row.returnedTo.toLowerCase().includes(query) ||
        row.reason.toLowerCase().includes(query) ||
        agentStatusLabel(row.status).toLowerCase().includes(query) ||
        row.items.some(
          (item) =>
            item.brandName.toLowerCase().includes(query) ||
            item.variantName.toLowerCase().includes(query)
        )
      );
    });
  }, [returns, searchQuery, rangeStart, rangeEnd]);

  useEffect(() => {
    setPage(0);
  }, [searchQuery, rangeStart, rangeEnd, pageSize]);

  const { pageCount, safePage, pagedItems } = getListPaginationSlice(visible, page, pageSize);

  const printReturn = (row: AgentToLeaderReturn) => {
    exportMainInventoryReturnPdf({
      returnedBy: row.returnedBy,
      returnedTo: row.returnedTo,
      returnedAt: row.returnedAt,
      status: agentStatusLabel(row.status),
      reason: row.reason,
      lines: row.items.map((item) => ({
        brandName: item.brandName,
        variantName: item.variantName,
        variantType: item.variantType,
        quantity: item.quantity,
      })),
    });
  };

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Mobile Sales to Team Leader
        </CardTitle>
        <CardDescription>Returns requested by mobile sales and received by their team leader.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <RotateCcw className="h-10 w-10 mb-3 opacity-40" />
            <p className="font-medium text-foreground">No returns found</p>
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Returned by</TableHead>
                    <TableHead>Returned to</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Total qty</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedItems.map((row) => {
                    const open = openId === row.id;
                    return (
                      <Fragment key={row.id}>
                        <TableRow
                          className="cursor-pointer hover:bg-muted/40"
                          onClick={() => setOpenId(open ? null : row.id)}
                        >
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label={open ? 'Collapse return' : 'Expand return'}
                              onClick={(event) => {
                                event.stopPropagation();
                                setOpenId(open ? null : row.id);
                              }}
                            >
                              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </Button>
                          </TableCell>
                          <TableCell className="font-medium">{row.returnedBy}</TableCell>
                          <TableCell>{row.returnedTo}</TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            {format(new Date(row.returnedAt), 'MMM d, yyyy h:mm a')}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {row.totalQuantity.toLocaleString()}
                          </TableCell>
                          <TableCell>{agentStatusBadge(row.status)}</TableCell>
                          <TableCell className="max-w-[220px] truncate text-sm text-muted-foreground" title={row.reason || undefined}>
                            {row.reason?.trim() || '—'}
                          </TableCell>
                          <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Return actions">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40">
                                <DropdownMenuItem onClick={() => printReturn(row)}>
                                  <Printer className="mr-2 h-4 w-4" />
                                  Print
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                        {open && (
                          <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                            <TableCell colSpan={8} className="p-4">
                              <p className="mb-3 text-sm">
                                <span className="font-medium">Reason of returned:</span>{' '}
                                <span className="text-muted-foreground">{row.reason || '—'}</span>
                              </p>
                              {row.status === 'rejected' && row.rejectionReason && (
                                <p className="mb-3 text-sm">
                                  <span className="font-medium">Rejection reason:</span>{' '}
                                  <span className="text-muted-foreground">{row.rejectionReason}</span>
                                </p>
                              )}
                              <BrandReturnTables
                                lines={row.items.map((item) => ({
                                  id: `${row.id}-${item.variantId}`,
                                  brandName: item.brandName,
                                  variantName: item.variantName,
                                  variantType: item.variantType,
                                  quantity: item.quantity,
                                }))}
                              />
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="md:hidden space-y-3">
              {pagedItems.map((row) => (
                <div key={row.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{row.returnedBy}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">To {row.returnedTo}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {format(new Date(row.returnedAt), 'MMM d, yyyy h:mm a')}
                      </p>
                      <p className="mt-1 text-xs">
                        {row.variantCount} variants · {row.totalQuantity.toLocaleString()} qty
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {agentStatusBadge(row.status)}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Return actions">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem onClick={() => setDetailReturn(row)}>
                            <Eye className="mr-2 h-4 w-4" />
                            View details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => printReturn(row)}>
                            <Printer className="mr-2 h-4 w-4" />
                            Print
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <ListPagination
              pageSize={pageSize}
              safePage={safePage}
              pageCount={pageCount}
              onPageSizeChange={setPageSize}
              onPrevious={() => setPage((current) => Math.max(0, current - 1))}
              onNext={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
            />
          </>
        )}
      </CardContent>
    </Card>

    <Dialog open={!!detailReturn} onOpenChange={(open) => { if (!open) setDetailReturn(null); }}>
      <DialogContent className="max-h-[85vh] w-[calc(100%-1.5rem)] max-w-2xl overflow-x-hidden overflow-y-auto [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>Return details</DialogTitle>
          <DialogDescription className="break-words">
            {detailReturn
              ? `${detailReturn.returnedBy} to ${detailReturn.returnedTo} · ${format(new Date(detailReturn.returnedAt), 'MMM d, yyyy h:mm a')}`
              : 'Return items'}
          </DialogDescription>
        </DialogHeader>
        {detailReturn && (
          <div className="min-w-0 space-y-3">
            <div>{agentStatusBadge(detailReturn.status)}</div>
            <p className="mb-0 text-sm">
              <span className="font-medium">Reason of returned:</span>{' '}
              <span className="text-muted-foreground">{detailReturn.reason?.trim() || '—'}</span>
            </p>
            {detailReturn.status === 'rejected' && detailReturn.rejectionReason && (
              <p className="text-sm">
                <span className="font-medium">Rejection reason:</span>{' '}
                <span className="text-muted-foreground">{detailReturn.rejectionReason}</span>
              </p>
            )}
            <BrandReturnTables
              lines={detailReturn.items.map((item) => ({
                id: `${detailReturn.id}-${item.variantId}`,
                brandName: item.brandName,
                variantName: item.variantName,
                variantType: item.variantType,
                quantity: item.quantity,
              }))}
            />
            <Button type="button" className="w-full" onClick={() => printReturn(detailReturn)}>
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}

export default function MainInventoryReturnHistoryPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isWarehouse = user?.role === 'warehouse';
  const { membership } = useWarehouseLocationMembership({ userId: user?.id, isWarehouse });
  const isMainWarehouseUser = membership.isMain;
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilterValue>({ preset: 'all' });
  const [returnTab, setReturnTab] = useState<'all' | 'main' | 'mobile'>('all');
  const [historyPage, setHistoryPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [openHistoryId, setOpenHistoryId] = useState<string | null>(null);
  const [detailGroup, setDetailGroup] = useState<ReturnGroup | null>(null);

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['main-inventory-return-history', user?.company_id, membership.locationId, isMainWarehouseUser],
    ...STOCK_RETURN_QUERY_OPTIONS,
    enabled: !!user?.company_id,
    queryFn: async () => {
      if (!user?.company_id) return [];

      let leaderRows: ReturnTransactionRow[] = [];
      let warehouseRows: ReturnTransactionRow[] = [];
      try {
        [leaderRows, warehouseRows] = await Promise.all([
          fetchReturnTransactions(user.company_id, 'return_to_main'),
          fetchReturnTransactions(user.company_id, 'warehouse_return_from_sub'),
        ]);
      } catch (error) {
        toast({ title: 'Error', description: 'Failed to load return history', variant: 'destructive' });
        throw error;
      }

      const data = [...leaderRows, ...warehouseRows];

      const locationIds = [
        ...new Set(
          warehouseRows
            .filter((row) => row.from_location)
            .map((row) => String(row.from_location).replace('warehouse_location:', ''))
            .filter(Boolean)
        ),
      ];

      const locationNameMap = new Map<string, string>();
      if (locationIds.length > 0) {
        const { data: locations } = await supabase
          .from('warehouse_locations')
          .select('id, name')
          .in('id', locationIds);
        locations?.forEach((location) => locationNameMap.set(location.id, location.name));
      }

      const profileIds = [
        ...new Set(
          leaderRows.flatMap((row) => {
            const ids = [row.performed_by, agentIdFromLocation(row.from_location)];
            return ids.filter((id): id is string => Boolean(id));
          })
        ),
      ];
      const profileNames = await fetchProfileNames(profileIds);

      const lines: ReturnLine[] = data.map((row) => {
        const variant = Array.isArray(row.variant) ? row.variant[0] : row.variant;
        const brand = variant?.brand
          ? Array.isArray(variant.brand) ? variant.brand[0] : variant.brand
          : null;
        const isSubWarehouseReturn = row.transaction_type === 'warehouse_return_from_sub';
        const locationId = row.from_location?.replace('warehouse_location:', '') || '';
        const locationName = locationNameMap.get(locationId);
        const leaderId = agentIdFromLocation(row.from_location);
        const leaderName = leaderId ? profileNames.get(leaderId) : undefined;
        const performerName = row.performed_by ? profileNames.get(row.performed_by) : undefined;

        return {
          id: row.id,
          quantity: Number(row.quantity) || 0,
          notes: row.notes,
          createdAt: row.created_at,
          returnedBy: isSubWarehouseReturn
            ? locationName || 'Sub Warehouse'
            : leaderName || performerName || 'Unknown',
          performerId: row.performed_by,
          variantName: variant?.name || 'Unknown',
          variantType: variant?.variant_type || null,
          brandName: brand?.name || 'Unknown',
          fromLocation: row.from_location,
          isSubWarehouseReturn,
        };
      });

      const isUserSubWarehouse = !isMainWarehouseUser && !!membership.locationId;
      const ownLeaderReturns = user.role === 'team_leader';
      const visible = isUserSubWarehouse
        ? lines.filter(
            (line) =>
              line.isSubWarehouseReturn &&
              line.fromLocation === `warehouse_location:${membership.locationId}`
          )
        : ownLeaderReturns
          ? lines.filter(
              (line) =>
                !line.isSubWarehouseReturn &&
                (agentIdFromLocation(line.fromLocation) === user.id || line.performerId === user.id)
            )
          : lines;

      return groupReturns(visible);
    },
  });

  const { data: superAdminName } = useQuery({
    queryKey: ['leader-requested-from-name', user?.company_id],
    enabled: !!user?.company_id,
    queryFn: () => fetchLeaderRequestedFromName(user?.company_id),
  });

  const canViewAgentReturns = isAdmin(user?.role);
  const isTeamLeader = user?.role === 'team_leader';
  const dateRange = useMemo(
    () =>
      getDateRangeFromPreset(
        dateRangeFilter.preset,
        dateRangeFilter.customStart,
        dateRangeFilter.customEnd
      ),
    [dateRangeFilter]
  );
  const filteredGroups = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return groups.filter((group) => {
      if (!isDateInRange(group.returnedAt, dateRange.start, dateRange.end)) return false;
      if (!query) return true;
      return (
        group.returnedBy.toLowerCase().includes(query) ||
        (group.reason || '').toLowerCase().includes(query) ||
        group.lines.some(
          (line) =>
            line.brandName.toLowerCase().includes(query) ||
            line.variantName.toLowerCase().includes(query)
        )
      );
    });
  }, [groups, searchQuery, dateRange.start, dateRange.end]);

  useEffect(() => {
    setHistoryPage(0);
  }, [searchQuery, dateRange.start, dateRange.end, pageSize, returnTab]);

  const renderHistoryCard = (
    cardGroups: ReturnGroup[],
    page: number,
    setPage: (value: number | ((current: number) => number)) => void,
    title: string
  ) => {
    const { pageCount, safePage, pagedItems: pagedGroups } = getListPaginationSlice(
      cardGroups,
      page,
      pageSize
    );

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5" />
            {title}
          </CardTitle>
          <CardDescription>Grouped by who returned the stock and when.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : cardGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <RotateCcw className="h-10 w-10 mb-3 opacity-40" />
              <p className="font-medium text-foreground">No returns found</p>
            </div>
          ) : (
            <>
              <div className="hidden md:block overflow-hidden rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      <TableHead>Returned by</TableHead>
                      <TableHead>Returned to</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Total qty</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedGroups.map((group) => {
                      const open = openHistoryId === group.id;
                      return (
                        <Fragment key={group.id}>
                          <TableRow
                            className="cursor-pointer hover:bg-muted/40"
                            onClick={() => setOpenHistoryId(open ? null : group.id)}
                          >
                            <TableCell>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label={open ? 'Collapse return' : 'Expand return'}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setOpenHistoryId(open ? null : group.id);
                                }}
                              >
                                {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </Button>
                            </TableCell>
                            <TableCell>
                              <span className="flex min-w-0 items-center gap-1 font-medium">
                                {group.isSubWarehouseReturn ? (
                                  <Building2 className="h-3 w-3 shrink-0 text-blue-500" />
                                ) : (
                                  <Users className="h-3 w-3 shrink-0 text-green-500" />
                                )}
                                {group.returnedBy}
                              </span>
                            </TableCell>
                            <TableCell>
                              {group.isSubWarehouseReturn ? 'Main inventory' : superAdminName || 'Super Admin'}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-sm">
                              {format(new Date(group.returnedAt), 'MMM d, yyyy h:mm a')}
                            </TableCell>
                            <TableCell className="text-right font-medium tabular-nums">
                              {group.totalQuantity.toLocaleString()}
                            </TableCell>
                            <TableCell><Badge>Returned</Badge></TableCell>
                            <TableCell className="max-w-[220px] truncate text-sm text-muted-foreground" title={group.reason || undefined}>
                              {group.reason?.trim() || '—'}
                            </TableCell>
                            <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Return actions">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-40">
                                  <DropdownMenuItem onClick={() => void printGroup(group, user?.company_id)}>
                                    <Printer className="mr-2 h-4 w-4" />
                                    Print
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                          {open && (
                            <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                              <TableCell colSpan={8} className="p-4">
                                <ReturnDetails group={group} />
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="md:hidden space-y-3">
                {pagedGroups.map((group) => (
                  <div key={`mobile-${group.id}`} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1 truncate text-sm font-medium">
                          {group.isSubWarehouseReturn ? (
                            <Building2 className="h-3 w-3 shrink-0 text-blue-500" />
                          ) : (
                            <Users className="h-3 w-3 shrink-0 text-green-500" />
                          )}
                          {group.returnedBy}
                        </p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {group.lines.length === 1
                            ? returnLineLabel(group.lines[0])
                            : `${group.variantCount} products`}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {group.totalQuantity.toLocaleString()} units · {format(new Date(group.returnedAt), 'MMM d, yyyy h:mm a')}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Badge>Returned</Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Return actions">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem onClick={() => setDetailGroup(group)}>
                              <Eye className="mr-2 h-4 w-4" />
                              View details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => void printGroup(group, user?.company_id)}>
                              <Printer className="mr-2 h-4 w-4" />
                              Print
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <ListPagination
                pageSize={pageSize}
                safePage={safePage}
                pageCount={pageCount}
                onPageSizeChange={setPageSize}
                onPrevious={() => setPage((current) => Math.max(0, current - 1))}
                onNext={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
              />
            </>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="w-full p-4 md:p-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            {isTeamLeader ? 'Returns to Main' : 'Stock Returns'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isTeamLeader
              ? 'Stock you returned to main'
              : canViewAgentReturns
                ? 'Returns into main inventory, and returns from mobile sales to team leaders'
                : isMainWarehouseUser
                  ? 'Returns from team leaders and sub-warehouses to main inventory'
                  : 'Your returns to main inventory'}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to={isTeamLeader ? '/my-inventory' : '/inventory/main'}>
            {isTeamLeader ? 'Back to My Inventory' : 'Back to Main Inventory'}
          </Link>
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search name, brand, or variant…"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>
        <DateRangeFilterPopover
          value={dateRangeFilter}
          onChange={setDateRangeFilter}
          triggerClassName="w-full sm:w-[220px] justify-between h-10 shrink-0"
          align="end"
        />
      </div>

      {canViewAgentReturns && (
        <Tabs
          value={returnTab}
          onValueChange={(value) => setReturnTab(value as 'all' | 'main' | 'mobile')}
          className="space-y-4"
        >
          <TabsList className="grid h-auto w-full grid-cols-1 sm:grid-cols-3">
            <TabsTrigger value="all" className="whitespace-normal px-2 py-2 text-center leading-tight">
              All
            </TabsTrigger>
            <TabsTrigger value="main" className="whitespace-normal px-2 py-2 text-center leading-tight">
              Team Leader to Main
            </TabsTrigger>
            <TabsTrigger value="mobile" className="whitespace-normal px-2 py-2 text-center leading-tight">
              Mobile Sales to Team Leader
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {(!canViewAgentReturns || returnTab !== 'mobile') &&
        renderHistoryCard(
          filteredGroups,
          historyPage,
          setHistoryPage,
          isTeamLeader ? 'Return history' : 'Returns to main inventory'
        )}

      {canViewAgentReturns && user?.company_id && returnTab !== 'main' && (
        <AgentToLeaderReturns
          companyId={user.company_id}
          searchQuery={searchQuery}
          rangeStart={dateRange.start}
          rangeEnd={dateRange.end}
        />
      )}

      <Dialog open={!!detailGroup} onOpenChange={(open) => { if (!open) setDetailGroup(null); }}>
        <DialogContent className="max-h-[85vh] w-[calc(100%-1.5rem)] max-w-2xl overflow-x-hidden overflow-y-auto [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle>Return details</DialogTitle>
            <DialogDescription className="break-words">
              {detailGroup
                ? `${detailGroup.returnedBy} · ${format(new Date(detailGroup.returnedAt), 'MMM d, yyyy h:mm a')}`
                : 'Return items'}
            </DialogDescription>
          </DialogHeader>
          {detailGroup && (
            <div className="min-w-0 space-y-3">
              <div><Badge>Returned</Badge></div>
              <ReturnDetails group={detailGroup} />
              <Button type="button" className="w-full" onClick={() => void printGroup(detailGroup, user?.company_id)}>
                <Printer className="mr-2 h-4 w-4" />
                Print
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
