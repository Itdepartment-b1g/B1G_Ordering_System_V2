import { useEffect, useMemo, useState } from 'react';
import { RotateCcw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  getListPaginationSlice,
  ListPagination,
  type PageSize,
} from '@/features/shared/components/ListPagination';
import { NO_WAREHOUSE_DISPOSAL_NOTE, type ReturnedInventoryRow } from './clientReturnApi';
import { AccordionBrandLinesTable, type AccordionBrandLine } from './AccordionBrandLinesTable';
import { BulkReturnDialog } from './BulkReturnDialog';
import { DisposeToWarehouseDialog } from './DisposeToWarehouseDialog';
import { generateAndOpenReturnedInventoryPdf } from './generateReturnedInventoryPdf';

const PAGE_SIZE: PageSize = 25;

type BrandGroup = {
  brandName: string;
  qty: number;
  variants: ReturnedInventoryRow[];
};

type ReturnedInventoryPanelProps = {
  rows: ReturnedInventoryRow[];
  onRowClick: (row: ReturnedInventoryRow) => void;
  canBulkReturn?: boolean;
  companyId?: string;
  userId?: string;
  submitterName?: string;
  holderRole?: string | null;
  hasWarehouseHubLink?: boolean;
  onSubmitted?: () => void;
};

function groupRowsByBrand(rows: ReturnedInventoryRow[]): BrandGroup[] {
  const map = new Map<string, ReturnedInventoryRow[]>();
  for (const row of rows) {
    const brand = row.brandName.trim() || 'Unknown';
    const list = map.get(brand) || [];
    list.push(row);
    map.set(brand, list);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([brandName, variants]) => ({
      brandName,
      qty: variants.reduce((sum, row) => sum + row.qty, 0),
      variants: variants.slice().sort((a, b) => a.variantName.localeCompare(b.variantName)),
    }));
}

function rowsToAccordionLines(rows: ReturnedInventoryRow[]): AccordionBrandLine[] {
  return rows.map((row) => ({
    brandId: row.brandId,
    brandName: row.brandName,
    variantId: row.variantId,
    variantName: row.variantName,
    variantType: row.variantType,
    quantity: row.qty,
  }));
}

export function ReturnedInventoryPanel({
  rows,
  onRowClick,
  canBulkReturn = false,
  companyId,
  userId,
  submitterName = '',
  holderRole,
  hasWarehouseHubLink = true,
  onSubmitted,
}: ReturnedInventoryPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(PAGE_SIZE);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [disposeOpen, setDisposeOpen] = useState(false);
  const isTeamLeader = holderRole === 'team_leader';
  const canDisposeToWarehouse = isTeamLeader && rows.length > 0;

  const filteredRows = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (row) =>
        row.brandName.toLowerCase().includes(needle) ||
        row.variantName.toLowerCase().includes(needle) ||
        row.variantType.toLowerCase().includes(needle)
    );
  }, [rows, searchQuery]);

  const brandGroups = useMemo(() => groupRowsByBrand(filteredRows), [filteredRows]);

  const totalQty = useMemo(
    () => filteredRows.reduce((sum, row) => sum + row.qty, 0),
    [filteredRows]
  );

  const { pagedItems, safePage, pageCount } = getListPaginationSlice(brandGroups, page, pageSize);

  const pagedLines = useMemo(
    () => rowsToAccordionLines(pagedItems.flatMap((group) => group.variants)),
    [pagedItems]
  );

  const rowByVariantId = useMemo(() => {
    const map = new Map<string, ReturnedInventoryRow>();
    for (const row of filteredRows) {
      map.set(row.variantId, row);
    }
    return map;
  }, [filteredRows]);

  useEffect(() => {
    setPage(0);
  }, [searchQuery, pageSize, rows.length]);

  const showWarehouseNote = !hasWarehouseHubLink && rows.length > 0;

  return (
    <>
      <Card>
        <CardHeader className="pb-4 space-y-3">
          {showWarehouseNote ? (
            <div
              role="status"
              className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
            >
              {NO_WAREHOUSE_DISPOSAL_NOTE}
            </div>
          ) : null}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">
                {isTeamLeader ? 'Returned stock (team)' : 'Returned stock'}
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {brandGroups.length} brand{brandGroups.length === 1 ? '' : 's'} · {filteredRows.length} SKU
                {filteredRows.length === 1 ? '' : 's'} · {totalQty.toLocaleString()} unit
                {totalQty === 1 ? '' : 's'}
                {isTeamLeader
                  ? ' · received from mobile sales · not sellable'
                  : ' · not sellable · moves to TL after they confirm RL'}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              {canBulkReturn && rows.length > 0 ? (
                <Button type="button" onClick={() => setBulkOpen(true)} className="w-full sm:w-auto">
                  Return to TL
                </Button>
              ) : null}
              {canDisposeToWarehouse ? (
                <Button
                  type="button"
                  className="w-full sm:w-auto"
                  onClick={() => setDisposeOpen(true)}
                >
                  Dispose to warehouse
                </Button>
              ) : null}
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search brand or variant..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {filteredRows.length === 0 ? (
            <div className="text-center py-12 px-4">
              <RotateCcw className="h-8 w-8 mx-auto text-muted-foreground/60 mb-3" />
              <p className="font-medium">
                {searchQuery
                  ? 'No matching returned items'
                  : isTeamLeader
                    ? 'No returned stock held yet'
                    : 'No returned stock yet'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {searchQuery
                  ? 'Try a different brand or variant name.'
                  : isTeamLeader
                    ? 'When you confirm an RL from mobile sales, those brands and variants appear here.'
                    : 'Only stock not already in a pending Return to TL shows here. Rejected RLs come back; confirmed RLs move to your team leader.'}
              </p>
            </div>
          ) : (
            <>
              <AccordionBrandLinesTable
                lines={pagedLines}
                typeColumnLabel="Variant type"
                onLineClick={(line) => {
                  const row = line.variantId ? rowByVariantId.get(line.variantId) : undefined;
                  if (row) onRowClick(row);
                }}
                onLinePrint={(line) => {
                  const row = line.variantId ? rowByVariantId.get(line.variantId) : undefined;
                  if (row) generateAndOpenReturnedInventoryPdf(row);
                }}
              />

              <ListPagination
                pageSize={pageSize}
                safePage={safePage}
                pageCount={pageCount}
                onPageSizeChange={(value) => {
                  setPageSize(value);
                  setPage(0);
                }}
                onPrevious={() => setPage((current) => Math.max(0, current - 1))}
                onNext={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
              />
            </>
          )}
        </CardContent>
      </Card>

      <BulkReturnDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        rows={rows}
        companyId={companyId}
        submitterName={submitterName}
        onSubmitted={onSubmitted}
      />

      <DisposeToWarehouseDialog
        open={disposeOpen}
        onOpenChange={setDisposeOpen}
        rows={rows}
        companyId={companyId}
        userId={userId}
        submitterName={submitterName}
        hasWarehouseHubLink={hasWarehouseHubLink}
        onSubmitted={onSubmitted}
      />
    </>
  );
}
