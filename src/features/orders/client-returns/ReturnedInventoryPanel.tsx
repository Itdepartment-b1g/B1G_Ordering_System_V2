import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, RotateCcw, Search } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  getListPaginationSlice,
  ListPagination,
  type PageSize,
} from '@/features/shared/components/ListPagination';
import type { ReturnedInventoryRow } from './clientReturnApi';
import { formatVariantType, variantTypeBadgeClass } from './ClientReturnBrandTable';

const PAGE_SIZE: PageSize = 25;

type BrandGroup = {
  brandName: string;
  qty: number;
  variants: ReturnedInventoryRow[];
};

type ReturnedInventoryPanelProps = {
  rows: ReturnedInventoryRow[];
  onRowClick: (row: ReturnedInventoryRow) => void;
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

export function ReturnedInventoryPanel({ rows, onRowClick }: ReturnedInventoryPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(PAGE_SIZE);

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
  const [openBrands, setOpenBrands] = useState<string[]>(() =>
    pageBrandKey ? pageBrandKey.split('\0') : []
  );

  useEffect(() => {
    setPage(0);
  }, [searchQuery, pageSize, rows.length]);

  useEffect(() => {
    setOpenBrands(pageBrandKey ? pageBrandKey.split('\0') : []);
  }, [pageBrandKey]);

  return (
    <Card>
      <CardHeader className="pb-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Returned stock</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {brandGroups.length} brand{brandGroups.length === 1 ? '' : 's'} · {filteredRows.length} SKU
              {filteredRows.length === 1 ? '' : 's'} · {totalQty.toLocaleString()} unit
              {totalQty === 1 ? '' : 's'} · not sellable
            </p>
          </div>
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
      </CardHeader>
      <CardContent className="space-y-3">
        {filteredRows.length === 0 ? (
          <div className="text-center py-12 px-4">
            <RotateCcw className="h-8 w-8 mx-auto text-muted-foreground/60 mb-3" />
            <p className="font-medium">
              {searchQuery ? 'No matching returned items' : 'No returned stock yet'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {searchQuery
                ? 'Try a different brand or variant name.'
                : 'Posted client returns will show here grouped by brand.'}
            </p>
          </div>
        ) : (
          <>
            <Accordion
              type="multiple"
              value={openBrands}
              onValueChange={setOpenBrands}
              className="space-y-3"
            >
              {pagedItems.map((group) => (
                <AccordionItem
                  key={group.brandName}
                  value={group.brandName}
                  className="rounded-2xl border bg-background overflow-hidden shadow-sm border-b-0"
                >
                  <AccordionTrigger className="px-4 py-3 bg-muted/40 hover:no-underline hover:bg-muted/60 [&[data-state=open]]:border-b">
                    <div className="flex w-full items-center justify-between gap-3 pr-2 text-left">
                      <h3 className="font-semibold text-base truncate">{group.brandName}</h3>
                      <p className="text-xs text-muted-foreground shrink-0 tabular-nums">
                        {group.variants.length} variant{group.variants.length === 1 ? '' : 's'} · {group.qty}
                      </p>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-0">
                    <ul className="divide-y">
                      {group.variants.map((row) => (
                        <li key={row.variantId}>
                          <button
                            type="button"
                            onClick={() => onRowClick(row)}
                            className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-muted/40 hover:bg-rose-50/40"
                          >
                            <span className="text-muted-foreground shrink-0 w-3 text-center">-</span>
                            <div className="min-w-0 flex-1">
                              <p className="font-medium leading-snug break-words">{row.variantName}</p>
                              <Badge
                                variant="secondary"
                                className={`mt-1 font-normal ${variantTypeBadgeClass(row.variantType)}`}
                              >
                                {formatVariantType(row.variantType)}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <p className="text-lg font-bold tabular-nums text-rose-700">{row.qty}</p>
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>

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
  );
}
