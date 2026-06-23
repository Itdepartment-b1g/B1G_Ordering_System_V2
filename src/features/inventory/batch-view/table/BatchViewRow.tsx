import { useEffect, useMemo, useState } from 'react';
import {
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
  getListPaginationSlice,
  ListPagination,
  type PageSize,
} from '@/features/shared/components/ListPagination';
import { BATCH_SOURCE_LABELS } from '@/features/inventory/warehouseBatchAging';
import { useToast } from '@/hooks/use-toast';

import type { BatchInventoryBrandGroup, BatchInventoryGroup } from '../types';
import { buildBatchInventoryFilenamePrefix } from '../utils/batchInventoryExportHelpers';
import { exportBatchInventoryExcel } from '../utils/exportBatchInventoryExcel';
import { exportBatchInventoryPdf } from '../utils/exportBatchInventoryPdf';

const DEFAULT_DETAIL_PAGE_SIZE = 5 as PageSize;

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

function BrandVariantSection({ brand }: { brand: BatchInventoryBrandGroup }) {
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
          {brand.variants.map((variant) => (
            <TableRow key={variant.variantId}>
              <TableCell>
                <div className="flex flex-wrap items-center gap-2">
                  <span>{variant.variantName}</span>
                  {variantTypeLabel(variant.variantType) && (
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${variantTypeBadgeClass(variant.variantType)}`}
                    >
                      {variantTypeLabel(variant.variantType)}
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {variant.quantity.toLocaleString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function BatchViewRow({ group }: { group: BatchInventoryGroup }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [detailPage, setDetailPage] = useState(0);
  const [detailPageSize, setDetailPageSize] = useState<PageSize>(DEFAULT_DETAIL_PAGE_SIZE);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const sourceLabel = BATCH_SOURCE_LABELS[group.sourceType] ?? group.sourceType;
  const isExporting = isExportingExcel || isExportingPdf;

  const { pageCount, safePage, startIndex, endIndex, pagedItems: pagedBrands } =
    useMemo(
      () => getListPaginationSlice(group.brands, detailPage, detailPageSize),
      [group.brands, detailPage, detailPageSize]
    );

  useEffect(() => {
    setDetailPage(0);
  }, [group.batchId, group.brands.length]);

  const toggleOpen = () => {
    setOpen((prev) => {
      if (prev) setDetailPage(0);
      return !prev;
    });
  };

  const showBrandPagination = group.brands.length > detailPageSize;

  const onExportExcel = async (e: Event) => {
    e.stopPropagation();
    if (isExporting) return;

    try {
      setIsExportingExcel(true);
      await exportBatchInventoryExcel([group], buildBatchInventoryFilenamePrefix(group));
      toast({ title: 'Export complete', description: 'Batch record exported to Excel.' });
    } catch {
      toast({
        title: 'Export failed',
        description: 'Could not export batch record to Excel.',
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
      await exportBatchInventoryPdf(group);
      toast({ title: 'Export ready', description: 'Batch record opened for PDF export.' });
    } catch {
      toast({
        title: 'Export failed',
        description: 'Could not export batch record to PDF.',
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
            aria-label={open ? 'Collapse batch details' : 'Expand batch details'}
            aria-expanded={open}
            onClick={(e) => {
              e.stopPropagation();
              toggleOpen();
            }}
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </TableCell>
        <TableCell className="font-mono text-sm font-medium">{group.batchNumber}</TableCell>
        <TableCell className="font-medium">{group.locationName}</TableCell>
        <TableCell className="text-right tabular-nums">{group.skuCount}</TableCell>
        <TableCell className="text-right tabular-nums font-medium">
          {group.totalUnits.toLocaleString()}
        </TableCell>
        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
          {formatManilaDateTime(group.receivedAt)}
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
          <TableCell colSpan={7} className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Brands and variants in this batch
                </p>
                <Badge variant="outline" className="text-[10px] font-normal">
                  {sourceLabel}
                </Badge>
              </div>
              {showBrandPagination && (
                <span className="text-xs text-muted-foreground">
                  Showing brands {startIndex + 1}–{Math.min(endIndex, group.brands.length)} of{' '}
                  {group.brands.length}
                </span>
              )}
            </div>

            {group.brands.length === 0 ? (
              <p className="text-sm italic text-muted-foreground">No active stock in this batch.</p>
            ) : (
              <div className="space-y-4" onClick={(e) => e.stopPropagation()}>
                {pagedBrands.map((brand) => (
                  <BrandVariantSection key={brand.brandId} brand={brand} />
                ))}

                {showBrandPagination && (
                  <ListPagination
                    pageSize={detailPageSize}
                    safePage={safePage}
                    pageCount={pageCount}
                    rowsPerPageLabel="Brands per page"
                    onPageSizeChange={(size) => {
                      setDetailPageSize(size);
                      setDetailPage(0);
                    }}
                    onPrevious={() => setDetailPage((p) => Math.max(0, p - 1))}
                    onNext={() => setDetailPage((p) => Math.min(pageCount - 1, p + 1))}
                  />
                )}
              </div>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
