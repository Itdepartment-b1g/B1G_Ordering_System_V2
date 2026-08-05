import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AnalyticsTablePagination, paginateAnalyticsRows } from './AnalyticsTablePagination';
import type {
  KeyAccountBrandAnalyticsRow,
  KeyAccountProductAnalyticsRow,
} from './keyAccountAnalyticsShared';

export function KeyAccountBrandVariantsDialog({
  open,
  onOpenChange,
  brandRow,
  dateRangeLabel,
  onSelectVariant,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandRow: KeyAccountBrandAnalyticsRow | null;
  dateRangeLabel: string;
  onSelectVariant: (variant: KeyAccountProductAnalyticsRow) => void;
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [search, brandRow?.brand, open]);

  const filteredVariants = useMemo(() => {
    if (!brandRow) return [];
    const q = search.trim().toLowerCase();
    if (!q) return brandRow.variants;
    return brandRow.variants.filter((row) => row.variant.toLowerCase().includes(q));
  }, [brandRow, search]);

  const pagedVariants = useMemo(
    () => paginateAnalyticsRows(filteredVariants, page),
    [filteredVariants, page]
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setSearch('');
          setPage(1);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-3xl w-[calc(100vw-2rem)] max-h-[85vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>{brandRow ? `${brandRow.brand} — Variants` : 'Brand variants'}</DialogTitle>
          <DialogDescription>
            Products under this brand for {dateRangeLabel}. Totals roll up PO line quantities. Click
            a variant for PO breakdown.
          </DialogDescription>
        </DialogHeader>

        {brandRow && (
          <div className="space-y-4 text-sm min-w-0">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <p className="text-muted-foreground text-xs">Variants</p>
                <p className="font-semibold">{brandRow.variantCount}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Total Units Ordered</p>
                <p className="font-semibold">{brandRow.quantity.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Total POs</p>
                <p className="font-semibold">{brandRow.orderCount}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Clients</p>
                <p className="font-semibold">{brandRow.clientCount}</p>
              </div>
            </div>

            {brandRow.consignmentQuantity > 0 && (
              <p className="text-xs text-sky-700 dark:text-sky-400">
                Consignment units: {brandRow.consignmentQuantity.toLocaleString()}
              </p>
            )}

            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search variant..."
              className="max-w-md"
            />

            <div className="rounded-md border min-w-0">
              <Table className="w-full table-fixed text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[44%]">Variant</TableHead>
                    <TableHead className="w-[16%] text-right">Total Units</TableHead>
                    <TableHead className="w-[14%] text-right">POs</TableHead>
                    <TableHead className="w-[14%] text-right">Clients</TableHead>
                    <TableHead className="w-[12%]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedVariants.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No variants for this brand in the selected period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pagedVariants.map((row) => (
                      <TableRow key={row.key}>
                        <TableCell className="align-top font-medium">
                          <button
                            type="button"
                            className="text-left text-primary hover:underline underline-offset-2"
                            onClick={() => onSelectVariant(row)}
                          >
                            {row.variant}
                          </button>
                          {row.consignmentQuantity > 0 ? (
                            <div className="mt-1">
                              <Badge
                                variant="outline"
                                className="text-[10px] font-normal border-amber-300 text-amber-800 bg-amber-50 px-1.5 py-0"
                              >
                                {row.consignmentQuantity.toLocaleString()} consignment units
                              </Badge>
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right align-top tabular-nums font-medium">
                          {row.quantity.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right align-top tabular-nums">
                          {row.orderCount}
                        </TableCell>
                        <TableCell className="text-right align-top tabular-nums">
                          {row.clientCount}
                        </TableCell>
                        <TableCell className="align-top text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => onSelectVariant(row)}
                          >
                            POs
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <AnalyticsTablePagination
              page={page}
              onPageChange={setPage}
              totalRows={filteredVariants.length}
            />
            <p className="text-xs text-muted-foreground">
              {filteredVariants.length} variant{filteredVariants.length === 1 ? '' : 's'}
              {search.trim() ? ` matching “${search.trim()}”` : ''}
              {' · '}Click a variant for PO breakdown (qty per PO rolls up to the total)
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
