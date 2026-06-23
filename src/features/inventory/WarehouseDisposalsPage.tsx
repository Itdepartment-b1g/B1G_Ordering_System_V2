import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { AlertCircle, ChevronLeft, ChevronRight, Loader2, PackageX, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getDateRangeFromPreset, isDateInRange } from '@/lib/dateRangePresets';
import {
  DateRangeFilterPopover,
  type DateRangeFilterValue,
} from '@/features/shared/components/DateRangeFilterPopover';
import { useAuth } from '@/features/auth';
import { useWarehouseLocationMembership } from './useWarehouseLocationMembership';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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

type DisposalRow = {
  id: string;
  quantity: number;
  source_type: string;
  notes: string | null;
  created_at: string;
  warehouse_location: { name: string; is_main: boolean } | null;
  variant: {
    name: string;
    variant_type: string;
    brand: { name: string } | { name: string }[] | null;
  } | null;
  disposed_by_user: { full_name: string } | null;
  fulfillment_po: { po_number: string } | null;
  rebate: { rebate_number: string } | null;
};

type LocationOption = {
  id: string;
  name: string;
  is_main: boolean;
};

const SOURCE_LABELS: Record<string, string> = {
  rebate_return: 'Rebate return',
  sub_warehouse_return: 'Sub-warehouse return',
  adjustment: 'Adjustment',
  other: 'Other',
};

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[0];

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

type RawDisposalRow = {
  id: string;
  quantity: number;
  source_type: string;
  notes: string | null;
  created_at: string;
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
};

function mapDisposalRow(raw: RawDisposalRow): DisposalRow {
  const variant = firstRelation(raw.variant);
  const brand = variant ? firstRelation(variant.brand) : null;

  return {
    id: raw.id,
    quantity: raw.quantity,
    source_type: raw.source_type,
    notes: raw.notes,
    created_at: raw.created_at,
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
  };
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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

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
    data: disposals = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: [
      'warehouse-inventory-disposals',
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
          rebate:key_account_po_rebates!warehouse_inventory_disposals_rebate_id_fkey ( rebate_number )
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
      const poNumber = row.fulfillment_po?.po_number ?? '';
      const rebateNumber = row.rebate?.rebate_number ?? '';
      const locationName = row.warehouse_location?.name ?? '';
      const disposedBy = row.disposed_by_user?.full_name ?? '';

      return (
        brand.toLowerCase().includes(term) ||
        variantName.toLowerCase().includes(term) ||
        poNumber.toLowerCase().includes(term) ||
        rebateNumber.toLowerCase().includes(term) ||
        locationName.toLowerCase().includes(term) ||
        disposedBy.toLowerCase().includes(term)
      );
    });
  }, [dateScopedDisposals, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredDisposals.length / pageSize));

  const paginatedDisposals = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredDisposals.slice(start, start + pageSize);
  }, [filteredDisposals, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, locationFilter, dateRangeFilter, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginationStart =
    filteredDisposals.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const paginationEnd = Math.min(page * pageSize, filteredDisposals.length);

  const totalUnits = useMemo(
    () => filteredDisposals.reduce((sum, row) => sum + row.quantity, 0),
    [filteredDisposals]
  );

  const pageTitle = isMainWarehouseUser ? 'Disposal log' : 'Disposal log (your location)';
  const pageDescription = isMainWarehouseUser
    ? 'Damaged or unsellable units from rebate returns across all warehouse locations.'
    : 'Damaged or unsellable units logged for your assigned sub-warehouse.';

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <PackageX className="h-7 w-7 text-muted-foreground" />
          <h1 className="text-2xl font-bold tracking-tight">{pageTitle}</h1>
        </div>
        <p className="text-muted-foreground">{pageDescription}</p>
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
              {isMainWarehouseUser ? 'All locations' : membership.status === 'sub' ? 'Your sub-warehouse' : 'Your warehouse'}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Disposed items</CardTitle>
          <CardDescription>
            Good-condition returns are restocked; damaged units appear here only and are not sellable inventory.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search brand, variant, PO, rebate, location…"
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
                ? 'No disposal records yet. Damaged units from rebate return inspection will appear here.'
                : 'No disposal records match the selected date range or search.'}
            </p>
          ) : (
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    {isMainWarehouseUser && <TableHead>Location</TableHead>}
                    <TableHead>Brand</TableHead>
                    <TableHead>Variant</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>PO / Rebate</TableHead>
                    <TableHead>Disposed by</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedDisposals.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {format(new Date(row.created_at), 'MMM d, yyyy HH:mm')}
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
                        <Badge variant="secondary">
                          {SOURCE_LABELS[row.source_type] ?? row.source_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {row.fulfillment_po?.po_number ?? row.rebate?.rebate_number ?? '—'}
                      </TableCell>
                      <TableCell>{row.disposed_by_user?.full_name ?? '—'}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-muted-foreground" title={row.notes ?? undefined}>
                        {row.notes?.trim() || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex flex-col gap-3 border-t bg-muted/20 px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <span>
                    Showing {paginationStart}–{paginationEnd} of {filteredDisposals.length}
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
    </div>
  );
}
