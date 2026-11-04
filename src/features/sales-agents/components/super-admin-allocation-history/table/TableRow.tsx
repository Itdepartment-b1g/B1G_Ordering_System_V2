import { Fragment, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Eye,
  FileSpreadsheet,
  FileText,
  Loader2,
  MoreVertical,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { useToast } from '@/hooks/use-toast';

import { buildAllocationFilenamePrefix } from '../utils/allocationHistoryExportHelpers';
import { exportAllocationHistoryExcel } from '../utils/exportAllocationHistoryExcel';
import { exportAllocationHistoryPdf } from '../utils/exportAllocationHistoryPdf';
import {
  MULTIPLE_BRANDS_LABEL,
  type AllocationHistoryGroup,
} from '../utils/allocationHistoryMappers';

export function formatManilaDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function allocationTypeLabel(type: AllocationHistoryGroup['allocationType']): string {
  if (type === 'leader_to_agent') return 'Leader to Agent';
  if (type === 'leader_to_leader') return 'TL to TL';
  return 'Main to Leader';
}

function variantTypeLabel(type: string | null): string | null {
  if (!type) return null;
  const normalized = type.trim().toLowerCase();
  if (normalized === 'flavor') return 'Flavor';
  if (normalized === 'battery') return 'Battery';
  if (normalized === 'foc') return 'FOC';
  if (normalized === 'posm') return 'POSM';
  if (normalized === 'ncv') return 'NCV';
  return type;
}

function variantTypeBadgeClass(type: string | null): string {
  if (!type) return '';
  const normalized = type.trim().toLowerCase();
  if (normalized === 'flavor') return 'border-purple-300 bg-purple-100 text-purple-800';
  if (normalized === 'battery') return 'border-green-300 bg-green-100 text-green-800';
  if (normalized === 'foc') return 'border-orange-300 bg-orange-100 text-orange-800';
  if (normalized === 'posm') return 'border-blue-300 bg-blue-100 text-blue-800';
  if (normalized === 'ncv') return 'border-slate-300 bg-slate-100 text-slate-800';
  return '';
}

function groupLinesByBrand(lines: AllocationHistoryGroup['lines']) {
  const byBrand = new Map<string, AllocationHistoryGroup['lines']>();
  for (const line of lines) {
    const brand = line.brandName.trim() || 'Unbranded';
    const list = byBrand.get(brand) ?? [];
    list.push(line);
    byBrand.set(brand, list);
  }
  return [...byBrand.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map(([brand, items]) => {
      const byType = new Map<string, AllocationHistoryGroup['lines']>();
      for (const line of items) {
        const type = variantTypeLabel(line.variantType) || 'Other';
        const list = byType.get(type) ?? [];
        list.push(line);
        byType.set(type, list);
      }
      return {
        brand,
        types: [...byType.entries()]
          .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
          .map(([type, typeItems]) => ({
            type,
            variantType: typeItems[0]?.variantType ?? null,
            items: [...typeItems].sort((a, b) =>
              a.variantName.localeCompare(b.variantName, undefined, { sensitivity: 'base' })
            ),
          })),
      };
    });
}

function useAllocationRecordExport(group: AllocationHistoryGroup | null) {
  const { toast } = useToast();
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const isExporting = isExportingExcel || isExportingPdf;

  const onExportExcel = async () => {
    if (!group || isExporting) return;
    try {
      setIsExportingExcel(true);
      await exportAllocationHistoryExcel([group], buildAllocationFilenamePrefix(group));
      toast({ title: 'Export complete', description: 'Allocation record exported to Excel.' });
    } catch {
      toast({
        title: 'Export failed',
        description: 'Could not export allocation record to Excel.',
        variant: 'destructive',
      });
    } finally {
      setIsExportingExcel(false);
    }
  };

  const onExportPdf = async () => {
    if (!group || isExporting) return;
    try {
      setIsExportingPdf(true);
      await exportAllocationHistoryPdf(group);
      toast({ title: 'Export ready', description: 'Allocation record opened for PDF export.' });
    } catch {
      toast({
        title: 'Export failed',
        description: 'Could not export allocation record to PDF.',
        variant: 'destructive',
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  return { isExporting, isExportingExcel, isExportingPdf, onExportExcel, onExportPdf };
}

function AllocationDetailsBody({ group }: { group: AllocationHistoryGroup }) {
  const missingLines = group.lineCount === 0;
  const linesByBrand = groupLinesByBrand(group.lines);

  if (missingLines) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/80 p-3 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>This allocation has no product lines yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {linesByBrand.map((brandGroup) => {
        const brandQty = brandGroup.types.reduce(
          (sum, typeGroup) =>
            sum + typeGroup.items.reduce((typeSum, line) => typeSum + line.quantity, 0),
          0
        );
        return (
          <div key={brandGroup.brand} className="overflow-hidden rounded-lg border">
            <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2.5">
              <h3 className="text-sm font-semibold">{brandGroup.brand}</h3>
              <span className="text-xs tabular-nums text-muted-foreground">
                {brandQty.toLocaleString()} units
              </span>
            </div>
            <div className="divide-y">
              {brandGroup.types.map((typeGroup) => {
                const typeQty = typeGroup.items.reduce((sum, line) => sum + line.quantity, 0);
                return (
                  <div key={`${brandGroup.brand}-${typeGroup.type}`}>
                    <div className="flex items-center justify-between gap-2 border-b bg-background px-3 py-2">
                      <Badge
                        variant="outline"
                        className={`text-[11px] ${variantTypeBadgeClass(typeGroup.variantType)}`}
                      >
                        {typeGroup.type}
                      </Badge>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {typeQty.toLocaleString()}
                      </span>
                    </div>
                    <div className="divide-y bg-background">
                      {typeGroup.items.map((line) => (
                        <div
                          key={line.id}
                          className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm"
                        >
                          <span className="min-w-0 font-medium leading-snug">
                            {line.variantName.trim() || 'Item'}
                          </span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {line.quantity.toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function AllocationDetailsPanel({ group }: { group: AllocationHistoryGroup }) {
  const exports = useAllocationRecordExport(group);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={exports.isExporting}
          onClick={() => void exports.onExportExcel()}
        >
          {exports.isExportingExcel ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <FileSpreadsheet className="mr-2 h-4 w-4" />
          )}
          Excel
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={exports.isExporting}
          onClick={() => void exports.onExportPdf()}
        >
          {exports.isExportingPdf ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <FileText className="mr-2 h-4 w-4" />
          )}
          PDF
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-3 rounded-lg border bg-muted/20 p-3 text-sm sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted-foreground">Allocated by</p>
          <p className="font-medium">{group.allocatedByName}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Allocated to</p>
          <p className="font-medium">{group.allocatedToName}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Allocated date</p>
          <p className="font-medium">{formatManilaDateTime(group.createdAt)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Total qty</p>
          <p className="font-medium tabular-nums">{group.totalQuantity.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">SKUs</p>
          <p className="font-medium tabular-nums">{group.lineCount.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Type</p>
          <p className="font-medium">{allocationTypeLabel(group.allocationType)}</p>
        </div>
      </div>

      <div className="border-t pt-4">
        <AllocationDetailsBody group={group} />
      </div>
    </div>
  );
}

export function AllocationDetailsDialog({
  group,
  open,
  onOpenChange,
}: {
  group: AllocationHistoryGroup | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-1.5rem)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Allocation details</DialogTitle>
          <DialogDescription>
            {group
              ? `${group.allocatedByName} · ${formatManilaDateTime(group.createdAt)}`
              : 'Allocated products'}
          </DialogDescription>
        </DialogHeader>
        {group ? <AllocationDetailsPanel group={group} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function AllocationActionsMenu({
  group,
  onView,
}: {
  group: AllocationHistoryGroup;
  onView?: () => void;
}) {
  const { isExporting, isExportingExcel, isExportingPdf, onExportExcel, onExportPdf } =
    useAllocationRecordExport(group);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          disabled={isExporting}
          aria-label="Allocation actions"
          onClick={(event) => event.stopPropagation()}
        >
          {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44" onClick={(event) => event.stopPropagation()}>
        {onView && (
          <DropdownMenuItem onSelect={onView}>
            <Eye className="mr-2 h-4 w-4" />
            View details
          </DropdownMenuItem>
        )}
        <DropdownMenuItem disabled={isExporting} onSelect={() => void onExportExcel()}>
          {isExportingExcel ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
          Export to Excel
        </DropdownMenuItem>
        <DropdownMenuItem disabled={isExporting} onSelect={() => void onExportPdf()}>
          {isExportingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
          Export to PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AllocationHistoryMobileList({
  isLoading,
  groups,
  emptyMessage,
  getDetailHref,
}: {
  isLoading: boolean;
  groups: AllocationHistoryGroup[];
  emptyMessage: string;
  /** When set, View details navigates here instead of opening a dialog. */
  getDetailHref?: (group: AllocationHistoryGroup) => string;
}) {
  const navigate = useNavigate();
  const [detail, setDetail] = useState<AllocationHistoryGroup | null>(null);

  const openDetails = (group: AllocationHistoryGroup) => {
    if (getDetailHref) {
      navigate(getDetailHref(group));
      return;
    }
    setDetail(group);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading allocation history...
      </div>
    );
  }

  if (groups.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <>
      <div className="space-y-2">
        {groups.map((group) => (
          <div
            key={group.groupId}
            className={`rounded-lg border bg-card p-3 ${getDetailHref ? 'cursor-pointer active:bg-muted/40' : ''}`}
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
            role={getDetailHref ? 'button' : undefined}
            tabIndex={getDetailHref ? 0 : undefined}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{group.brandName ?? 'Allocation'}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">From {group.allocatedByName}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatManilaDateTime(group.createdAt)}</p>
                <p className="mt-1 text-xs">
                  {group.totalQuantity.toLocaleString()} units
                  {group.lineCount > 0 ? ` · ${group.lineCount} products` : ''}
                </p>
              </div>
              <AllocationActionsMenu group={group} onView={() => openDetails(group)} />
            </div>
          </div>
        ))}
      </div>
      {!getDetailHref ? (
        <AllocationDetailsDialog
          group={detail}
          open={!!detail}
          onOpenChange={(open) => {
            if (!open) setDetail(null);
          }}
        />
      ) : null}
    </>
  );
}

export function AllocationGroupRow({
  group,
  detailsInDialog = false,
}: {
  group: AllocationHistoryGroup;
  detailsInDialog?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const missingLines = group.lineCount === 0;
  const linesByBrand = groupLinesByBrand(group.lines);

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/40"
        onClick={() => (detailsInDialog ? setDetailOpen(true) : setOpen((value) => !value))}
      >
        <TableCell className="w-10">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={detailsInDialog ? 'View details' : open ? 'Collapse variants' : 'Expand variants'}
            aria-expanded={detailsInDialog ? undefined : open}
            onClick={(event) => {
              event.stopPropagation();
              if (detailsInDialog) setDetailOpen(true);
              else setOpen((value) => !value);
            }}
          >
            {detailsInDialog ? (
              <Eye className="h-4 w-4" />
            ) : open ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        </TableCell>
        <TableCell className="whitespace-nowrap text-sm">{formatManilaDateTime(group.createdAt)}</TableCell>
        <TableCell className="font-medium">{group.allocatedToName}</TableCell>
        <TableCell>
          <div className="flex flex-col items-start gap-1">
            <Badge
              variant="secondary"
              className={
                group.allocationType === 'leader_to_leader'
                  ? 'border-purple-200 bg-purple-100 text-purple-900 hover:bg-purple-100'
                  : undefined
              }
            >
              {allocationTypeLabel(group.allocationType)}
            </Badge>
            {group.requestNumber ? (
              <span className="font-mono text-[11px] text-muted-foreground">{group.requestNumber}</span>
            ) : null}
          </div>
        </TableCell>
        <TableCell
          className={
            group.brandName === MULTIPLE_BRANDS_LABEL
              ? 'text-muted-foreground italic'
              : 'text-muted-foreground'
          }
        >
          {group.brandName ?? '—'}
        </TableCell>
        <TableCell className="text-muted-foreground">{group.allocatedByName}</TableCell>
        <TableCell className="text-right tabular-nums">
          {missingLines ? (
            <Badge variant="outline" className="font-normal text-amber-700">
              No lines
            </Badge>
          ) : (
            group.lineCount
          )}
        </TableCell>
        <TableCell className="text-right tabular-nums font-medium">
          {group.totalQuantity.toLocaleString()}
        </TableCell>
        <TableCell className="text-right">
          <AllocationActionsMenu
            group={group}
            onView={detailsInDialog ? () => setDetailOpen(true) : undefined}
          />
        </TableCell>
      </TableRow>
      {detailsInDialog && (
        <AllocationDetailsDialog group={group} open={detailOpen} onOpenChange={setDetailOpen} />
      )}
      {open && (
        <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
          <TableCell colSpan={9} className="p-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Variants in this session
            </p>
            {missingLines ? (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/80 p-3 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  This session has no linked inventory transactions. New allocations from{' '}
                  <span className="font-medium">Stock Allocations</span> should show variant lines
                  after the database migration is applied.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-md border bg-white">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Variant</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linesByBrand.map((brandGroup) => {
                      const brandItemCount = brandGroup.types.reduce(
                        (sum, typeGroup) => sum + typeGroup.items.length,
                        0
                      );
                      return (
                        <Fragment key={brandGroup.brand}>
                          <TableRow className="bg-muted/50 hover:bg-muted/50">
                            <TableCell colSpan={2} className="py-2">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">{brandGroup.brand}</span>
                                <Badge variant="outline" className="text-[10px] font-normal">
                                  {brandItemCount} item{brandItemCount === 1 ? '' : 's'}
                                </Badge>
                              </div>
                            </TableCell>
                          </TableRow>
                          {brandGroup.types.map((typeGroup) => (
                            <Fragment key={`${brandGroup.brand}-${typeGroup.type}`}>
                              <TableRow className="hover:bg-transparent">
                                <TableCell colSpan={2} className="py-1.5 pl-6">
                                  <div className="flex items-center gap-2">
                                    <Badge
                                      variant="outline"
                                      className={`text-[10px] ${variantTypeBadgeClass(typeGroup.variantType)}`}
                                    >
                                      {typeGroup.type}
                                    </Badge>
                                    <span className="text-[11px] text-muted-foreground">
                                      {typeGroup.items.length} item
                                      {typeGroup.items.length === 1 ? '' : 's'}
                                    </span>
                                  </div>
                                </TableCell>
                              </TableRow>
                              {typeGroup.items.map((line) => (
                                <TableRow key={line.id}>
                                  <TableCell className="pl-10">{line.variantName}</TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {line.quantity.toLocaleString()}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </Fragment>
                          ))}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
