import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Package, Search, Smartphone, UserCheck, Users } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import {
  DEFAULT_PAGE_SIZE,
  getListPaginationSlice,
  ListPagination,
  type PageSize,
} from '@/features/shared/components/ListPagination';
import { SortableTableHead } from '@/features/shared/components/SortableTableHead';
import {
  createInitialTableSortCycle,
  getNextTableSortCycleState,
  getTableSortDisplayDirection,
  resolveTableSortDirection,
  type TableSortCycleState,
} from '@/features/shared/utils/tableSortCycle';
import { getRoleDisplayName } from '@/lib/roleUtils';
import { supabase } from '@/lib/supabase';
import {
  useVariantStockHolders,
  type VariantStockHolder,
} from './hooks/useVariantStockHolders';

type VariantMeta = {
  id: string;
  name: string;
  variantType: string | null;
  brandName: string;
};

type HolderSortKey = 'holderName' | 'role' | 'leaderName' | 'status' | 'qty';
type RoleFilter = 'all' | 'team_leader' | 'mobile_sales';
type StatusFilter = 'all' | 'active' | 'inactive';

const DEFAULT_SORT_KEY: HolderSortKey = 'qty';
const DEFAULT_SORT_DIRECTION = 'desc' as const;

function unwrapOne<T>(value: T | T[] | null | undefined): T | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

function leaderDisplay(holder: VariantStockHolder): string {
  if (holder.role === 'team_leader') return '—';
  return holder.leaderName || 'Unassigned';
}

function compareHolders(
  a: VariantStockHolder,
  b: VariantStockHolder,
  key: HolderSortKey,
  direction: 'asc' | 'desc'
): number {
  const dir = direction === 'asc' ? 1 : -1;
  let result = 0;

  switch (key) {
    case 'qty':
      result = a.qty - b.qty;
      break;
    case 'holderName':
      result = a.holderName.localeCompare(b.holderName);
      break;
    case 'role':
      result = getRoleDisplayName(a.role).localeCompare(getRoleDisplayName(b.role));
      break;
    case 'leaderName':
      result = leaderDisplay(a).localeCompare(leaderDisplay(b));
      break;
    case 'status':
      result = a.status.localeCompare(b.status);
      break;
  }

  if (result !== 0) return result * dir;
  return a.holderName.localeCompare(b.holderName);
}

async function fetchVariantMeta(companyId: string, variantId: string): Promise<VariantMeta | null> {
  const { data, error } = await supabase
    .from('variants')
    .select(`
      id,
      name,
      variant_type,
      brands!inner (
        id,
        name
      )
    `)
    .eq('company_id', companyId)
    .eq('id', variantId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const brand = unwrapOne(data.brands as { id: string; name: string } | { id: string; name: string }[] | null);
  return {
    id: data.id,
    name: data.name,
    variantType: data.variant_type,
    brandName: brand?.name || 'Unknown brand',
  };
}

export default function VariantStockHoldersPage() {
  const { variantId } = useParams<{ variantId: string }>();
  const { user } = useAuth();
  const companyId = user?.company_id;

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [sortState, setSortState] =
    useState<TableSortCycleState<HolderSortKey>>(createInitialTableSortCycle);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const {
    data: variantMeta,
    isLoading: metaLoading,
    isError: metaError,
    error: metaErr,
  } = useQuery({
    queryKey: ['variant-stock-holders-meta', companyId, variantId],
    queryFn: () => fetchVariantMeta(companyId!, variantId!),
    enabled: !!companyId && !!variantId,
  });

  const {
    data,
    isLoading: holdersLoading,
    isError: holdersError,
    error: holdersErr,
    refetch,
    isFetching,
  } = useVariantStockHolders(companyId, variantId, !!companyId && !!variantId);

  const holders = data?.holders ?? [];
  const totalHeld = data?.totalHeld ?? 0;
  const isLoading = metaLoading || holdersLoading;
  const isError = metaError || holdersError;
  const errorMessage =
    (metaErr as Error | undefined)?.message ||
    (holdersErr as Error | undefined)?.message ||
    'Failed to load stock holders.';

  const stockStats = useMemo(() => {
    let teamLeaderStock = 0;
    let mobileSalesStock = 0;
    for (const holder of holders) {
      if (holder.role === 'team_leader') teamLeaderStock += holder.qty;
      else if (holder.role === 'mobile_sales') mobileSalesStock += holder.qty;
    }
    return {
      totalStock: totalHeld,
      teamLeaderStock,
      mobileSalesStock,
    };
  }, [holders, totalHeld]);

  const filteredHolders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return holders.filter((holder) => {
      if (roleFilter !== 'all' && holder.role !== roleFilter) return false;
      if (statusFilter !== 'all' && holder.status !== statusFilter) return false;
      if (!q) return true;
      const leader = leaderDisplay(holder).toLowerCase();
      return (
        holder.holderName.toLowerCase().includes(q) ||
        leader.includes(q) ||
        getRoleDisplayName(holder.role).toLowerCase().includes(q)
      );
    });
  }, [holders, searchQuery, roleFilter, statusFilter]);

  const sortedHolders = useMemo(() => {
    const { key, direction } = resolveTableSortDirection(
      sortState,
      DEFAULT_SORT_KEY,
      DEFAULT_SORT_DIRECTION
    );
    return [...filteredHolders].sort((a, b) => compareHolders(a, b, key, direction));
  }, [filteredHolders, sortState]);

  const showStats = !!variantId && !isLoading && !isError && !!variantMeta;

  useEffect(() => {
    setPage(0);
  }, [variantId, pageSize, sortState, searchQuery, roleFilter, statusFilter]);

  const { pageCount, safePage, pagedItems } = getListPaginationSlice(
    sortedHolders,
    page,
    pageSize
  );

  const handleSort = (key: HolderSortKey) => {
    setSortState((prev) => getNextTableSortCycleState(prev, key));
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="space-y-3">
        <Button variant="outline" size="sm" asChild>
          <Link to="/inventory/main">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Main Inventory
          </Link>
        </Button>

        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6 text-sky-600" />
            Stock Holders
          </h1>
          <p className="text-muted-foreground">
            {metaLoading ? (
              'Loading variant…'
            ) : variantMeta ? (
              <>
                <span className="font-medium text-foreground">{variantMeta.brandName}</span>
                {' - '}
                {variantMeta.name}
                {variantMeta.variantType ? ` (${variantMeta.variantType})` : ''}
              </>
            ) : variantId ? (
              'Variant not found'
            ) : (
              'Open this page from Main Inventory'
            )}
          </p>
        </div>
      </div>

      {showStats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-sky-600" />
                <div>
                  <div className="text-2xl font-bold">
                    {stockStats.totalStock.toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">Total Stock</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-orange-600" />
                <div>
                  <div className="text-2xl font-bold">
                    {stockStats.teamLeaderStock.toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">Team Leader Stock</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-emerald-600" />
                <div>
                  <div className="text-2xl font-bold">
                    {stockStats.mobileSalesStock.toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">Mobile Sales Stock</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {showStats && holders.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search name, leader, or role…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Select
            value={roleFilter}
            onValueChange={(value) => setRoleFilter(value as RoleFilter)}
          >
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="team_leader">Team Leader</SelectItem>
              <SelectItem value="mobile_sales">Mobile Sales</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as StatusFilter)}
          >
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <Card>
        <CardContent className="p-6 space-y-4">
          {!variantId ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No variant selected. Open this page from Main Inventory.
            </p>
          ) : isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading holders…
            </div>
          ) : isError ? (
            <div className="py-10 text-center space-y-3">
              <p className="text-sm text-destructive">{errorMessage}</p>
              <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
                {isFetching ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Retrying…
                  </>
                ) : (
                  'Retry'
                )}
              </Button>
            </div>
          ) : !variantMeta ? (
            <div className="py-10 text-center text-muted-foreground space-y-2">
              <Package className="h-8 w-8 mx-auto opacity-50" />
              <p className="text-sm">Variant not found for this company.</p>
            </div>
          ) : holders.length > 0 ? (
            filteredHolders.length > 0 ? (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableTableHead
                        label="Name"
                        sortKey="holderName"
                        sortDirection={getTableSortDisplayDirection(sortState, 'holderName')}
                        onSort={handleSort}
                      />
                      <SortableTableHead
                        label="Role"
                        sortKey="role"
                        sortDirection={getTableSortDisplayDirection(sortState, 'role')}
                        onSort={handleSort}
                      />
                      <SortableTableHead
                        label="Leader"
                        sortKey="leaderName"
                        sortDirection={getTableSortDisplayDirection(sortState, 'leaderName')}
                        onSort={handleSort}
                      />
                      <SortableTableHead
                        label="Status"
                        sortKey="status"
                        sortDirection={getTableSortDisplayDirection(sortState, 'status')}
                        onSort={handleSort}
                      />
                      <SortableTableHead
                        label="Qty"
                        sortKey="qty"
                        sortDirection={getTableSortDisplayDirection(sortState, 'qty')}
                        onSort={handleSort}
                        className="text-right"
                      />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedItems.map((holder) => (
                      <TableRow key={holder.holderId}>
                        <TableCell className="font-medium">{holder.holderName}</TableCell>
                        <TableCell className="text-sm">{getRoleDisplayName(holder.role)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {leaderDisplay(holder)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              holder.status === 'inactive'
                                ? 'border-muted-foreground/30 bg-muted text-muted-foreground'
                                : 'border-emerald-300 bg-emerald-50 text-emerald-800'
                            }
                          >
                            {holder.status === 'inactive' ? 'Inactive' : 'Active'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {holder.qty.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <ListPagination
                  pageSize={pageSize}
                  safePage={safePage}
                  pageCount={pageCount}
                  onPageSizeChange={setPageSize}
                  onPrevious={() => setPage((p) => Math.max(0, p - 1))}
                  onNext={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                />
              </>
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No holders match the current filters.
              </p>
            )
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No field stock holders for this variant.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
