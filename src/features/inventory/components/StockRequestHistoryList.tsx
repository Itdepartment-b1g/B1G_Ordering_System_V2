import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { useIsMobile } from '@/hooks/use-mobile';
import type { GroupedRequest } from '../requestHooks';
import { formatStockRequestWhen } from '../utils/stockRequestGrouping';
import { StockRequestDetailsPanel } from './StockRequestDetailsPanel';

function StockRequestTableRow({
  group,
  statusBadge,
  onPrint,
  onViewDetails,
}: {
  group: GroupedRequest;
  statusBadge: ReactNode;
  onPrint: () => void;
  onViewDetails: () => void;
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
          {formatStockRequestWhen(group.requested_at)}
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Request actions">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onSelect={onViewDetails}>
                <Eye className="mr-2 h-4 w-4" />
                View details
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onPrint}>
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
            <StockRequestDetailsPanel
              group={group}
              statusBadge={statusBadge}
              showPrint={false}
            />
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
  getDetailHref,
}: {
  groups: GroupedRequest[];
  renderStatus: (status: string) => ReactNode;
  onPrint: (group: GroupedRequest) => void;
  title: string;
  description: string;
  /** When set, mobile View details navigates here; desktop still uses a dialog. */
  getDetailHref?: (group: GroupedRequest) => string;
}) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
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

  const openDetails = (group: GroupedRequest) => {
    if (isMobile && getDetailHref) {
      navigate(getDetailHref(group));
      return;
    }
    setDetailGroup(group);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search requests..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="h-9 pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredRequests.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Package className="mx-auto mb-3 h-12 w-12 opacity-20" />
              <p>No stock requests found</p>
            </div>
          ) : (
            <>
              <div className="space-y-3 md:hidden">
                {filteredRequests.map((group) => (
                  <Card
                    key={group.id}
                    className={`border border-border/50 ${getDetailHref ? 'cursor-pointer active:bg-muted/40' : ''}`}
                    role={getDetailHref ? 'button' : undefined}
                    tabIndex={getDetailHref ? 0 : undefined}
                    onClick={getDetailHref ? () => openDetails(group) : undefined}
                    onKeyDown={
                      getDetailHref
                        ? (event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              openDetails(group);
                            }
                          }
                        : undefined
                    }
                  >
                    <div className="flex items-start justify-between gap-2 p-4">
                      <div className="min-w-0">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          {renderStatus(group.status)}
                          <span className="text-xs text-muted-foreground">
                            {formatStockRequestWhen(group.requested_at)}
                          </span>
                        </div>
                        <p className="text-sm font-medium">
                          Requesting {group.totalQuantity} items across {group.productCount} products
                          {group.id.startsWith('SR-') && (
                            <span className="ml-2 text-xs text-muted-foreground">({group.id})</span>
                          )}
                        </p>
                        {group.requester_notes && (
                          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                            "{group.requester_notes}"
                          </p>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            aria-label="Request actions"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="w-44"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <DropdownMenuItem onSelect={() => openDetails(group)}>
                            <Eye className="mr-2 h-4 w-4" />
                            View details
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => onPrint(group)}>
                            <Printer className="mr-2 h-4 w-4" />
                            Print
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </Card>
                ))}
              </div>

              <div className="hidden overflow-hidden rounded-md border md:block">
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
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRequests.map((group) => (
                      <StockRequestTableRow
                        key={group.id}
                        group={group}
                        statusBadge={renderStatus(group.status)}
                        onPrint={() => onPrint(group)}
                        onViewDetails={() => openDetails(group)}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={detailGroup != null}
        onOpenChange={(open) => {
          if (!open) setDetailGroup(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {detailGroup ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {detailGroup.id.startsWith('SR-') ? detailGroup.id : 'Stock request'}
                </DialogTitle>
                <DialogDescription>
                  {formatStockRequestWhen(detailGroup.requested_at)} · {detailGroup.totalQuantity}{' '}
                  items across {detailGroup.productCount} products
                </DialogDescription>
              </DialogHeader>
              <StockRequestDetailsPanel
                group={detailGroup}
                statusBadge={renderStatus(detailGroup.status)}
                onPrint={() => onPrint(detailGroup)}
              />
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
