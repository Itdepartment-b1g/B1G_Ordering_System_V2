import { Fragment, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { Building2, ChevronDown, ChevronRight, Loader2, Printer, RotateCcw, Search, Users } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { isAdmin } from '@/lib/roleUtils';
import { useWarehouseLocationMembership } from './useWarehouseLocationMembership';
import { exportMainInventoryReturnPdf } from './utils/exportMainInventoryReturnPdf';

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

function variantTypeBadgeClass(type: string | null | undefined): string {
  const key = type?.trim().toLowerCase();
  if (key === 'flavor') return 'border-purple-300 bg-purple-100 text-purple-800';
  if (key === 'battery') return 'border-green-300 bg-green-100 text-green-800';
  if (key === 'foc') return 'border-orange-300 bg-orange-100 text-orange-800';
  return '';
}

function groupReturns(lines: ReturnLine[]): ReturnGroup[] {
  const groups = new Map<string, ReturnGroup>();

  lines.forEach((line) => {
    const minute = format(new Date(line.createdAt), 'yyyy-MM-dd HH:mm');
    const key = [
      minute,
      line.performerId || line.returnedBy,
      line.notes || '',
      line.isSubWarehouseReturn ? 'sub' : 'leader',
      line.fromLocation || '',
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

  return Array.from(groups.values()).sort(
    (a, b) => new Date(b.returnedAt).getTime() - new Date(a.returnedAt).getTime()
  );
}

function BrandReturnTables({ lines }: { lines: ReturnLine[] }) {
  const brands = useMemo(() => {
    const map = new Map<string, ReturnLine[]>();
    lines.forEach((line) => {
      const name = line.brandName?.trim() || 'Unknown brand';
      const list = map.get(name) ?? [];
      list.push(line);
      map.set(name, list);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [lines]);

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
                    <TableCell>{line.variantName}</TableCell>
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
      <BrandReturnTables lines={group.lines} />
    </div>
  );
}

function printGroup(group: ReturnGroup) {
  exportMainInventoryReturnPdf({
    returnedBy: group.returnedBy,
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

function agentStatusBadge(status: AgentReturnStatus) {
  if (status === 'approved') return <Badge>Approved</Badge>;
  if (status === 'rejected') return <Badge variant="destructive">Rejected</Badge>;
  return <Badge variant="secondary">Pending</Badge>;
}

function AgentReturnBrandTables({ items }: { items: AgentReturnItem[] }) {
  const brands = useMemo(() => {
    const map = new Map<string, AgentReturnItem[]>();
    items.forEach((item) => {
      const name = item.brandName?.trim() || 'Unknown brand';
      const list = map.get(name) ?? [];
      list.push(item);
      map.set(name, list);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  return (
    <div className="space-y-4">
      {brands.map(([brandName, brandItems]) => (
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
              {brandItems.map((item) => {
                const label = variantTypeLabel(item.variantType);
                return (
                  <TableRow key={`${brandName}-${item.variantId}`}>
                    <TableCell>{item.variantName}</TableCell>
                    <TableCell>
                      {label ? (
                        <Badge variant="outline" className={`text-[10px] ${variantTypeBadgeClass(item.variantType)}`}>
                          {label}
                        </Badge>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{item.quantity.toLocaleString()}</TableCell>
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
  const [openId, setOpenId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);

  const { data: returns = [], isLoading } = useQuery({
    queryKey: ['agent-to-leader-return-history', companyId],
    queryFn: async () => {
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
        .limit(200);

      if (error) {
        toast({ title: 'Error', description: 'Failed to load team leader returns', variant: 'destructive' });
        throw error;
      }
      if (!data?.length) return [];

      const { data: itemsData, error: itemsError } = await supabase
        .from('inventory_return_items')
        .select(`
          return_id,
          variant_id,
          quantity,
          variant:variants(name, variant_type, brand:brands(name))
        `)
        .in('return_id', data.map((row) => row.id));

      if (itemsError) throw itemsError;

      const itemsByReturn = new Map<string, AgentReturnItem[]>();
      (itemsData || []).forEach((row) => {
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
        row.status.includes(query) ||
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
      returnedAt: row.returnedAt,
      status: row.status === 'approved' ? 'Approved' : row.status === 'rejected' ? 'Rejected' : 'Pending',
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
                    <TableHead className="text-right">Variant Qty</TableHead>
                    <TableHead className="text-right">Total Qty</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="text-right">Print</TableHead>
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
                          <TableCell className="text-right tabular-nums">{row.variantCount}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {row.totalQuantity.toLocaleString()}
                          </TableCell>
                          <TableCell>{agentStatusBadge(row.status)}</TableCell>
                          <TableCell className="max-w-[220px] truncate text-sm text-muted-foreground" title={row.reason || undefined}>
                            {row.reason?.trim() || '—'}
                          </TableCell>
                          <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                            {row.status === 'approved' ? (
                              <Button type="button" variant="outline" size="sm" onClick={() => printReturn(row)}>
                                <Printer className="h-4 w-4" />
                                Print
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                        {open && (
                          <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                            <TableCell colSpan={9} className="p-4">
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
                              <AgentReturnBrandTables items={row.items} />
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
              {pagedItems.map((row) => {
                const open = openId === row.id;
                return (
                  <div key={row.id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm">{row.returnedBy}</p>
                        <p className="text-xs text-muted-foreground mt-1">To {row.returnedTo}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(row.returnedAt), 'MMM d, yyyy h:mm a')}
                        </p>
                        <p className="text-xs mt-1">
                          {row.variantCount} variants · {row.totalQuantity.toLocaleString()} qty
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {agentStatusBadge(row.status)}
                        {row.status === 'approved' && (
                          <Button type="button" variant="outline" size="sm" onClick={() => printReturn(row)}>
                            <Printer className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full justify-between"
                      onClick={() => setOpenId(open ? null : row.id)}
                    >
                      {open ? 'Hide items' : 'View items'}
                      {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                    {open && (
                      <div>
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
                        <AgentReturnBrandTables items={row.items} />
                      </div>
                    )}
                  </div>
                );
              })}
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
}

export default function MainInventoryReturnHistoryPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isWarehouse = user?.role === 'warehouse';
  const { membership } = useWarehouseLocationMembership({ userId: user?.id, isWarehouse });
  const isMainWarehouseUser = membership.isMain;
  const [openId, setOpenId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilterValue>({ preset: 'all' });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['main-inventory-return-history', user?.company_id, membership.locationId, isMainWarehouseUser],
    enabled: !!user?.company_id,
    queryFn: async () => {
      if (!user?.company_id) return [];

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
          ),
          performer:profiles!inventory_transactions_performed_by_fkey(full_name)
        `)
        .eq('company_id', user.company_id)
        .in('transaction_type', ['return_to_main', 'warehouse_return_from_sub'])
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        toast({ title: 'Error', description: 'Failed to load return history', variant: 'destructive' });
        throw error;
      }

      const locationIds = [
        ...new Set(
          (data || [])
            .filter((row) => row.transaction_type === 'warehouse_return_from_sub' && row.from_location)
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

      const lines: ReturnLine[] = (data || []).map((row) => {
        const variant = Array.isArray(row.variant) ? row.variant[0] : row.variant;
        const brand = variant?.brand
          ? Array.isArray(variant.brand) ? variant.brand[0] : variant.brand
          : null;
        const performer = Array.isArray(row.performer) ? row.performer[0] : row.performer;
        const isSubWarehouseReturn = row.transaction_type === 'warehouse_return_from_sub';
        const locationId = row.from_location?.replace('warehouse_location:', '') || '';
        const locationName = locationNameMap.get(locationId);

        return {
          id: row.id,
          quantity: Number(row.quantity) || 0,
          notes: row.notes,
          createdAt: row.created_at,
          returnedBy: isSubWarehouseReturn
            ? locationName || 'Sub Warehouse'
            : performer?.full_name || 'Unknown',
          performerId: row.performed_by,
          variantName: variant?.name || 'Unknown',
          variantType: variant?.variant_type || null,
          brandName: brand?.name || 'Unknown',
          fromLocation: row.from_location,
          isSubWarehouseReturn,
        };
      });

      const isUserSubWarehouse = !isMainWarehouseUser && !!membership.locationId;
      const visible = isUserSubWarehouse
        ? lines.filter(
            (line) =>
              line.isSubWarehouseReturn &&
              line.fromLocation === `warehouse_location:${membership.locationId}`
          )
        : lines;

      return groupReturns(visible);
    },
  });

  const canViewAgentReturns = isAdmin(user?.role);
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
    setPage(0);
  }, [searchQuery, dateRange.start, dateRange.end, pageSize]);

  const { pageCount, safePage, pagedItems: pagedGroups } = getListPaginationSlice(
    filteredGroups,
    page,
    pageSize
  );

  const renderHistoryCard = () => (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5" />
            {canViewAgentReturns ? 'Team Leader to Super Admin' : 'Return history'}
          </CardTitle>
          <CardDescription>Grouped by who returned the stock and when.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredGroups.length === 0 ? (
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
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Variant Qty</TableHead>
                      <TableHead className="text-right">Total Qty</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="text-right">Print</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedGroups.map((group) => {
                      const open = openId === group.id;
                      return (
                        <Fragment key={group.id}>
                          <TableRow
                            className="cursor-pointer hover:bg-muted/40"
                            onClick={() => setOpenId(open ? null : group.id)}
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
                                  setOpenId(open ? null : group.id);
                                }}
                              >
                                {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </Button>
                            </TableCell>
                            <TableCell className="font-medium">
                              <span className="flex items-center gap-1">
                                {group.isSubWarehouseReturn ? (
                                  <Building2 className="h-3 w-3 text-blue-500" />
                                ) : (
                                  <Users className="h-3 w-3 text-green-500" />
                                )}
                                {group.returnedBy}
                              </span>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-sm">
                              {format(new Date(group.returnedAt), 'MMM d, yyyy h:mm a')}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{group.variantCount}</TableCell>
                            <TableCell className="text-right font-medium tabular-nums">
                              {group.totalQuantity.toLocaleString()}
                            </TableCell>
                            <TableCell className="max-w-[220px] truncate text-sm text-muted-foreground" title={group.reason || undefined}>
                              {group.reason?.trim() || '—'}
                            </TableCell>
                            <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                              <Button type="button" variant="outline" size="sm" onClick={() => printGroup(group)}>
                                <Printer className="h-4 w-4" />
                                Print
                              </Button>
                            </TableCell>
                          </TableRow>
                          {open && (
                            <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                              <TableCell colSpan={7} className="p-4">
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
                {pagedGroups.map((group) => {
                  const open = openId === group.id;
                  return (
                    <div key={group.id} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-sm flex items-center gap-1">
                            {group.isSubWarehouseReturn ? (
                              <Building2 className="h-3 w-3 text-blue-500" />
                            ) : (
                              <Users className="h-3 w-3 text-green-500" />
                            )}
                            {group.returnedBy}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(new Date(group.returnedAt), 'MMM d, yyyy h:mm a')}
                          </p>
                          <p className="text-xs mt-1">
                            {group.variantCount} variants · {group.totalQuantity.toLocaleString()} qty
                          </p>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={() => printGroup(group)}>
                          <Printer className="h-4 w-4" />
                        </Button>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full justify-between"
                        onClick={() => setOpenId(open ? null : group.id)}
                      >
                        {open ? 'Hide items' : 'View items'}
                        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </Button>
                      {open && <ReturnDetails group={group} />}
                    </div>
                  );
                })}
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

  return (
    <div className="w-full p-4 md:p-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Stock Returns</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {canViewAgentReturns
              ? 'Returns into main inventory, and returns from mobile sales to team leaders'
              : isMainWarehouseUser
                ? 'Returns from team leaders and sub-warehouses to main inventory'
                : 'Your returns to main inventory'}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/inventory/main">Back to Main Inventory</Link>
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

      {canViewAgentReturns && user?.company_id ? (
        <Tabs defaultValue="all" className="space-y-4">
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="leader">Team Leader to Super Admin</TabsTrigger>
            <TabsTrigger value="agent">Mobile Sales to Team Leader</TabsTrigger>
          </TabsList>
          <TabsContent value="all" className="space-y-4">
            {renderHistoryCard()}
            <AgentToLeaderReturns
              companyId={user.company_id}
              searchQuery={searchQuery}
              rangeStart={dateRange.start}
              rangeEnd={dateRange.end}
            />
          </TabsContent>
          <TabsContent value="leader">{renderHistoryCard()}</TabsContent>
          <TabsContent value="agent">
            <AgentToLeaderReturns
              companyId={user.company_id}
              searchQuery={searchQuery}
              rangeStart={dateRange.start}
              rangeEnd={dateRange.end}
            />
          </TabsContent>
        </Tabs>
      ) : (
        renderHistoryCard()
      )}
    </div>
  );
}
