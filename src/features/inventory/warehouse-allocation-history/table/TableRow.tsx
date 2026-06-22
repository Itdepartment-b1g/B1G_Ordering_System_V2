import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  Loader2,
  MoreVertical,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

import type { WarehouseAllocationGroup, WarehouseAllocationLine } from '../types';
import { buildWarehouseAllocationFilenamePrefix } from '../utils/warehouseAllocationExportHelpers';
import { exportWarehouseAllocationHistoryExcel } from '../utils/exportWarehouseAllocationHistoryExcel';
import { exportWarehouseAllocationHistoryPdf } from '../utils/exportWarehouseAllocationHistoryPdf';
import { MULTIPLE_BRANDS_LABEL } from '../utils/warehouseAllocationMappers';

export function formatManilaDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function variantTypeLabel(type: string | null): string | null {
  if (!type) return null;
  const normalized = type.trim().toLowerCase();
  if (normalized === 'flavor') return 'Flavor';
  if (normalized === 'battery') return 'Battery';
  if (normalized === 'foc') return 'FOC';
  return type;
}

function variantTypeBadgeClass(type: string | null): string {
  if (!type) return '';
  const normalized = type.trim().toLowerCase();
  if (normalized === 'flavor') return 'border-purple-300 bg-purple-100 text-purple-800';
  if (normalized === 'battery') return 'border-green-300 bg-green-100 text-green-800';
  if (normalized === 'foc') return 'border-orange-300 bg-orange-100 text-orange-800';
  return '';
}

function groupLinesByBrand(lines: WarehouseAllocationLine[]): [string, WarehouseAllocationLine[]][] {
  const byBrand = new Map<string, WarehouseAllocationLine[]>();
  for (const line of lines) {
    const brandName = line.brandName.trim() || 'Unknown brand';
    const list = byBrand.get(brandName) ?? [];
    list.push(line);
    byBrand.set(brandName, list);
  }
  return [...byBrand.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function flattenBrandLinesToRows(lines: WarehouseAllocationLine[]) {
  const rows: {
    key: string;
    batchNumber: string;
    variantName: string;
    variantType: string | null;
    quantity: number;
  }[] = [];

  for (const line of lines) {
    if (line.batches.length > 0) {
      for (const batch of line.batches) {
        rows.push({
          key: `${line.id}-${batch.id}`,
          batchNumber: batch.batchNumber,
          variantName: line.variantName,
          variantType: line.variantType,
          quantity: batch.quantity,
        });
      }
    } else {
      rows.push({
        key: line.id,
        batchNumber: '—',
        variantName: line.variantName,
        variantType: line.variantType,
        quantity: line.quantity,
      });
    }
  }

  return rows;
}

function BrandSessionTable({
  brandName,
  lines,
}: {
  brandName: string;
  lines: WarehouseAllocationLine[];
}) {
  const rows = flattenBrandLinesToRows(lines);

  return (
    <div className="overflow-hidden rounded-md border bg-white">
      <div className="border-b bg-muted/40 px-4 py-2.5 font-semibold">{brandName}</div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Batch</TableHead>
            <TableHead>Variant</TableHead>
            <TableHead className="text-right">Qty</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key}>
              <TableCell className="font-mono text-sm">{row.batchNumber}</TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-2">
                  <span>{row.variantName}</span>
                  {variantTypeLabel(row.variantType) && (
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${variantTypeBadgeClass(row.variantType)}`}
                    >
                      {variantTypeLabel(row.variantType)}
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">{row.quantity.toLocaleString()}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function WarehouseAllocationGroupRow({
  group,
  mainBrandFilterName,
}: {
  group: WarehouseAllocationGroup;
  mainBrandFilterName: string | null;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [rowBrandFilter, setRowBrandFilter] = useState('all');
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const missingLines = group.lineCount === 0;
  const isExporting = isExportingExcel || isExportingPdf;
  const brandGroups = groupLinesByBrand(group.lines);

  useEffect(() => {
    if (mainBrandFilterName) {
      setRowBrandFilter(mainBrandFilterName);
    } else {
      setRowBrandFilter('all');
    }
  }, [mainBrandFilterName]);

  const activeBrandFilter =
    mainBrandFilterName ?? (rowBrandFilter === 'all' ? null : rowBrandFilter);

  const filteredBrandGroups = useMemo(() => {
    if (!activeBrandFilter) return brandGroups;
    return brandGroups.filter(([brandName]) => brandName === activeBrandFilter);
  }, [brandGroups, activeBrandFilter]);

  const showRowBrandFilter = brandGroups.length > 1 && !mainBrandFilterName;

  const toggleOpen = () => {
    setOpen((prev) => {
      if (prev && !mainBrandFilterName) {
        setRowBrandFilter('all');
      }
      return !prev;
    });
  };

  const onExportExcel = async (e: Event) => {
    e.stopPropagation();
    if (isExporting) return;

    try {
      setIsExportingExcel(true);
      await exportWarehouseAllocationHistoryExcel(
        [group],
        buildWarehouseAllocationFilenamePrefix(group)
      );
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

  const onExportPdf = async (e: Event) => {
    e.stopPropagation();
    if (isExporting) return;

    try {
      setIsExportingPdf(true);
      await exportWarehouseAllocationHistoryPdf(group);
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

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/40" onClick={toggleOpen}>
        <TableCell className="w-10">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={open ? 'Collapse details' : 'Expand details'}
            aria-expanded={open}
            onClick={(e) => {
              e.stopPropagation();
              toggleOpen();
            }}
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </TableCell>
        <TableCell className="whitespace-nowrap text-sm">
          {formatManilaDateTime(group.createdAt)}
        </TableCell>
        <TableCell className="font-medium">{group.locationName}</TableCell>
        <TableCell
          className={
            group.brandName === MULTIPLE_BRANDS_LABEL
              ? 'text-muted-foreground italic'
              : 'text-muted-foreground'
          }
        >
          {group.brandName ?? '—'}
        </TableCell>
        <TableCell className="text-muted-foreground">{group.performedByName}</TableCell>
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={isExporting}
                onClick={(e) => e.stopPropagation()}
              >
                {isExporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MoreVertical className="h-4 w-4" />
                )}
                <span className="sr-only">Actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem disabled={isExporting} onSelect={onExportExcel}>
                {isExportingExcel ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                )}
                Export to Excel
              </DropdownMenuItem>
              <DropdownMenuItem disabled={isExporting} onSelect={onExportPdf}>
                {isExportingPdf ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="mr-2 h-4 w-4" />
                )}
                Export to PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>
      {open && (
        <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
          <TableCell colSpan={8} className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Variants and batches in this session
              </p>
              {mainBrandFilterName && (
                <span className="text-xs text-muted-foreground">
                  Showing: <span className="font-medium text-foreground">{mainBrandFilterName}</span>
                </span>
              )}
              {showRowBrandFilter && (
                <div
                  className="flex items-center gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Select value={rowBrandFilter} onValueChange={setRowBrandFilter}>
                    <SelectTrigger className="h-8 w-[180px]">
                      <SelectValue placeholder="All brands" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All brands</SelectItem>
                      {brandGroups.map(([brandName]) => (
                        <SelectItem key={brandName} value={brandName}>
                          {brandName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {missingLines ? (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/80 p-3 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  This session has no linked inventory transactions. New allocations from{' '}
                  <span className="font-medium">Sub Warehouses</span> will show variant and batch
                  lines after the database migration is applied.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredBrandGroups.length === 0 ? (
                  <p className="text-sm italic text-muted-foreground">No lines for this brand.</p>
                ) : (
                  filteredBrandGroups.map(([brandName, lines]) => (
                    <BrandSessionTable key={brandName} brandName={brandName} lines={lines} />
                  ))
                )}
              </div>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
