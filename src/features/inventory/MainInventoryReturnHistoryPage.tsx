import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { Building2, ChevronDown, ChevronRight, Loader2, Printer, RotateCcw, Users } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

export default function MainInventoryReturnHistoryPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isWarehouse = user?.role === 'warehouse';
  const { membership } = useWarehouseLocationMembership({ userId: user?.id, isWarehouse });
  const isMainWarehouseUser = membership.isMain;
  const [openId, setOpenId] = useState<string | null>(null);

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

  return (
    <div className="w-full p-4 md:p-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Stock Returns</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isMainWarehouseUser
              ? 'Returns from team leaders and sub-warehouses to main inventory'
              : 'Your returns to main inventory'}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/inventory/main">Back to Main Inventory</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5" />
            Return history
          </CardTitle>
          <CardDescription>Grouped by who returned the stock and when.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : groups.length === 0 ? (
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
                      <TableHead className="text-right">Print</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groups.map((group) => {
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
                            <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                              <Button type="button" variant="outline" size="sm" onClick={() => printGroup(group)}>
                                <Printer className="h-4 w-4" />
                                Print
                              </Button>
                            </TableCell>
                          </TableRow>
                          {open && (
                            <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                              <TableCell colSpan={6} className="p-4">
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
                {groups.map((group) => {
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
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
