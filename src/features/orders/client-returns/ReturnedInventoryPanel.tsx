import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, RotateCcw, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  getListPaginationSlice,
  ListPagination,
  type PageSize,
} from '@/features/shared/components/ListPagination';
import type { ReturnedInventoryRow } from './clientReturnApi';
import { formatVariantType, variantTypeBadgeClass } from './ClientReturnBrandTable';
import { BulkReturnDialog } from './BulkReturnDialog';

const PAGE_SIZE: PageSize = 25;
const ROW_COLS = 'grid grid-cols-[minmax(0,1fr)_5rem] items-center gap-3';

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
  submitterName?: string;
  holderRole?: string | null;
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

export function ReturnedInventoryPanel({
  rows,
  onRowClick,
  canBulkReturn = false,
  companyId,
  submitterName = '',
  holderRole,
  onSubmitted,
}: ReturnedInventoryPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(PAGE_SIZE);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [openBrands, setOpenBrands] = useState<Set<string>>(new Set());
  const isTeamLeader = holderRole === 'team_leader';

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
  const pageBrandKey = pagedItems.map((group) => group.brandName).join('\0');

  useEffect(() => {
    setPage(0);
  }, [searchQuery, pageSize, rows.length]);

  useEffect(() => {
    setOpenBrands(new Set(pageBrandKey ? pageBrandKey.split('\0') : []));
  }, [pageBrandKey]);

  const toggleBrandOpen = (brandName: string) => {
    setOpenBrands((current) => {
      const next = new Set(current);
      if (next.has(brandName)) next.delete(brandName);
      else next.add(brandName);
      return next;
    });
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-4 space-y-3">
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
                    : 'Posted client returns show here. After TL confirms your RL, they move to the team leader.'}
              </p>
            </div>
          ) : (
            <>
              <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_5rem] gap-3 px-4 text-xs font-medium text-muted-foreground">
                <span>Brand / Variant</span>
                <span className="text-right">Qty</span>
              </div>

              <div className="space-y-3">
                {pagedItems.map((group) => {
                  const isOpen = openBrands.has(group.brandName);
                  return (
                    <section
                      key={group.brandName}
                      className="rounded-xl border bg-background overflow-hidden shadow-sm"
                    >
                      <button
                        type="button"
                        className={`${ROW_COLS} w-full px-4 py-3 bg-muted/40 border-b text-left hover:bg-muted/60`}
                        onClick={() => toggleBrandOpen(group.brandName)}
                      >
                        <div className="min-w-0 flex items-center gap-2">
                          <h3 className="font-semibold text-base truncate">{group.brandName}</h3>
                          <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                            {group.variants.length} variant{group.variants.length === 1 ? '' : 's'}
                          </span>
                          <ChevronDown
                            className={`ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                              isOpen ? 'rotate-180' : ''
                            }`}
                          />
                        </div>
                        <p className="text-right font-semibold tabular-nums text-rose-700">{group.qty}</p>
                      </button>

                      {isOpen ? (
                        <ul className="divide-y">
                          {group.variants.map((row) => (
                            <li key={row.variantId}>
                              <button
                                type="button"
                                onClick={() => onRowClick(row)}
                                className={`${ROW_COLS} w-full px-4 py-3 text-left hover:bg-rose-50/40 active:bg-muted/40`}
                              >
                                <div className="min-w-0">
                                  <p className="font-medium leading-snug break-words">{row.variantName}</p>
                                  <Badge
                                    variant="secondary"
                                    className={`mt-1 font-normal ${variantTypeBadgeClass(row.variantType)}`}
                                  >
                                    {formatVariantType(row.variantType)}
                                  </Badge>
                                </div>
                                <div className="flex items-center justify-end gap-1">
                                  <span className="text-lg font-bold tabular-nums text-rose-700">{row.qty}</span>
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                </div>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </section>
                  );
                })}
              </div>

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
    </>
  );
}
