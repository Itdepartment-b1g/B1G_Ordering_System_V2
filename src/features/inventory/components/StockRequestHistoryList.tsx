import { useMemo, useState, type ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ChevronDown, ChevronRight, Eye, MoreVertical, Package, Printer, Search } from 'lucide-react';
import type { GroupedRequest, Request } from '../requestHooks';

function formatRequestWhen(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString()} at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function variantTypeLabel(type: string | null | undefined): string | null {
  if (!type) return null;
  const normalized = type.trim().toLowerCase();
  if (normalized === 'flavor') return 'Flavor';
  if (normalized === 'battery') return 'Battery';
  if (normalized === 'foc') return 'FOC';
  if (normalized === 'posm') return 'POSM';
  if (normalized === 'ncv') return 'NCV';
  return type;
}

function variantTypeBadgeClass(type: string | null | undefined): string {
  if (!type) return '';
  const normalized = type.trim().toLowerCase();
  if (normalized === 'flavor') return 'border-purple-300 bg-purple-100 text-purple-800';
  if (normalized === 'battery') return 'border-green-300 bg-green-100 text-green-800';
  if (normalized === 'foc') return 'border-orange-300 bg-orange-100 text-orange-800';
  return '';
}

type BrandLineGroup = {
  brandName: string;
  lines: Array<{
    id: string;
    variantName: string;
    variantType: string | null;
    qty: number;
  }>;
};

function groupRequestLinesByBrand(requests: Request[]): BrandLineGroup[] {
  const map = new Map<string, BrandLineGroup>();

  requests.forEach((req) => {
    const brandName = req.variant?.brand?.name?.trim() || 'Unknown brand';
    const existing = map.get(brandName) ?? { brandName, lines: [] };
    existing.lines.push({
      id: req.id,
      variantName: req.variant?.name?.trim() || 'Item',
      variantType: req.variant?.variant_type ?? null,
      qty: Number(req.requested_quantity) || 0,
    });
    map.set(brandName, existing);
  });

  return Array.from(map.values()).sort((a, b) => a.brandName.localeCompare(b.brandName));
}

function BrandRequestTable({ brand }: { brand: BrandLineGroup }) {
  return (
    <div className="overflow-hidden rounded-md border bg-white">
      <div className="border-b bg-muted/40 px-4 py-2.5 font-semibold">{brand.brandName}</div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Variant</TableHead>
            <TableHead className="text-right">Qty</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {brand.lines.map((line) => {
            const typeLabel = variantTypeLabel(line.variantType);
            return (
              <TableRow key={line.id}>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{line.variantName}</span>
                    {typeLabel && (
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${variantTypeBadgeClass(line.variantType)}`}
                      >
                        {typeLabel}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{line.qty.toLocaleString()}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function RequestBrandDetails({ requests }: { requests: Request[] }) {
  const brandGroups = groupRequestLinesByBrand(requests);
  const [brandFilter, setBrandFilter] = useState('all');
  const filtered = brandFilter === 'all'
    ? brandGroups
    : brandGroups.filter((brand) => brand.brandName === brandFilter);

  if (brandGroups.length === 0) {
    return <p className="text-sm italic text-muted-foreground">No items in this request.</p>;
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Items in this request
        </p>
        {brandGroups.length > 1 && (
          <div onClick={(event) => event.stopPropagation()}>
            <Select value={brandFilter} onValueChange={setBrandFilter}>
              <SelectTrigger className="h-8 w-[180px]">
                <SelectValue placeholder="All brands" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All brands</SelectItem>
                {brandGroups.map((brand) => (
                  <SelectItem key={brand.brandName} value={brand.brandName}>
                    {brand.brandName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <div className="space-y-4">
        {filtered.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">No lines for this brand.</p>
        ) : (
          filtered.map((brand) => <BrandRequestTable key={brand.brandName} brand={brand} />)
        )}
      </div>
    </>
  );
}

function StockRequestTableRow({
  group,
  statusBadge,
  onPrint,
}: {
  group: GroupedRequest;
  statusBadge: ReactNode;
  onPrint: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/40" onClick={() => setOpen((prev) => !prev)}>
        <TableCell className="w-10">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={open ? 'Collapse details' : 'Expand details'}
            aria-expanded={open}
            onClick={(event) => {
              event.stopPropagation();
              setOpen((prev) => !prev);
            }}
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </TableCell>
        <TableCell className="whitespace-nowrap text-sm">
          {formatRequestWhen(group.requested_at)}
        </TableCell>
        <TableCell className="font-mono text-xs">
          {group.id.startsWith('SR-') ? group.id : '—'}
        </TableCell>
        <TableCell>{statusBadge}</TableCell>
        <TableCell className="text-right tabular-nums">{group.productCount}</TableCell>
        <TableCell className="text-right font-medium tabular-nums">
          {group.totalQuantity.toLocaleString()}
        </TableCell>
        <TableCell className="max-w-[200px] text-sm text-muted-foreground">
          <span className="line-clamp-2">{group.requester_notes || '—'}</span>
        </TableCell>
        <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
          <Button type="button" variant="outline" size="sm" onClick={onPrint}>
            <Printer className="h-4 w-4" />
            Print
          </Button>
        </TableCell>
      </TableRow>
      {open && (
        <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
          <TableCell colSpan={8} className="p-4">
            <RequestBrandDetails requests={group.requests} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export function StockRequestHistoryList({
  groups,
  renderStatus,
  onPrint,
  title,
  description,
}: {
  groups: GroupedRequest[];
  renderStatus: (status: string) => ReactNode;
  onPrint: (group: GroupedRequest) => void;
  title: string;
  description: string;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [detailGroup, setDetailGroup] = useState<GroupedRequest | null>(null);

  const filteredRequests = useMemo(() => {
    const searchLower = searchQuery.trim().toLowerCase();
    if (!searchLower) return groups;
    return groups.filter((group) => {
      const notesMatch = group.requester_notes?.toLowerCase().includes(searchLower);
      const statusMatch = group.status.toLowerCase().includes(searchLower);
      const numberMatch = group.id.toLowerCase().includes(searchLower);
      const itemMatch = group.requests.some((req) =>
        `${req.variant?.brand?.name ?? ''} ${req.variant?.name ?? ''}`.toLowerCase().includes(searchLower)
      );
      return notesMatch || statusMatch || numberMatch || itemMatch;
    });
  }, [groups, searchQuery]);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search requests..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="pl-9 h-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredRequests.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>No stock requests found</p>
            </div>
          ) : (
            <>
              <div className="md:hidden space-y-3">
                {filteredRequests.map((group) => (
                  <Card key={group.id} className="border border-border/50">
                    <div className="p-4 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          {renderStatus(group.status)}
                          <span className="text-xs text-muted-foreground">
                            {formatRequestWhen(group.requested_at)}
                          </span>
                        </div>
                        <p className="font-medium text-sm">
                          Requesting {group.totalQuantity} items across {group.productCount} products
                          {group.id.startsWith('SR-') && (
                            <span className="text-xs text-muted-foreground ml-2">({group.id})</span>
                          )}
                        </p>
                        {group.requester_notes && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">"{group.requester_notes}"</p>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Request actions">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => setDetailGroup(group)}>
                            <Eye className="mr-2 h-4 w-4" />
                            View details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onPrint(group)}>
                            <Printer className="mr-2 h-4 w-4" />
                            Print
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </Card>
                ))}
              </div>

              <div className="hidden md:block overflow-hidden rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      <TableHead>Date</TableHead>
                      <TableHead>Request no.</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Products</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="text-right">Print</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRequests.map((group) => (
                      <StockRequestTableRow
                        key={group.id}
                        group={group}
                        statusBadge={renderStatus(group.status)}
                        onPrint={() => onPrint(group)}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={detailGroup != null} onOpenChange={(open) => { if (!open) setDetailGroup(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {detailGroup && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {detailGroup.id.startsWith('SR-') ? detailGroup.id : 'Stock request'}
                </DialogTitle>
                <DialogDescription>
                  {formatRequestWhen(detailGroup.requested_at)} · {detailGroup.totalQuantity} items across {detailGroup.productCount} products
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>{renderStatus(detailGroup.status)}</div>
                {detailGroup.requester_notes && (
                  <p className="text-sm text-muted-foreground">"{detailGroup.requester_notes}"</p>
                )}
                <RequestBrandDetails requests={detailGroup.requests} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onPrint(detailGroup)}>
                  <Printer className="h-4 w-4" />
                  Print
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
