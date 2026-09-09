import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  getListPaginationSlice,
  ListPagination,
  type PageSize,
} from '@/features/shared/components/ListPagination';
import type { MockClientReturnLine } from './clientReturnMock';

const BRAND_PAGE_SIZE: PageSize = 25;

function variantTypeOrder(type: string): number {
  const value = type.trim().toLowerCase();
  if (value === 'flavor') return 0;
  if (value === 'battery') return 1;
  if (value === 'posm') return 2;
  if (value === 'foc') return 3;
  if (value === 'ncv') return 4;
  return 99;
}

export function formatVariantType(type: string): string {
  const value = type.trim().toLowerCase();
  if (value === 'posm') return 'POSM';
  if (value === 'foc') return 'FOC';
  if (value === 'ncv') return 'NCV';
  if (!value) return '—';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function variantTypeBadgeClass(type: string): string {
  const value = type.trim().toLowerCase();
  if (value === 'flavor') return 'bg-blue-100 text-blue-700';
  if (value === 'battery') return 'bg-green-100 text-green-700';
  if (value === 'posm') return 'bg-purple-100 text-purple-700';
  if (value === 'foc') return 'bg-orange-100 text-orange-700';
  if (value === 'ncv') return 'bg-pink-100 text-pink-700';
  return 'bg-gray-100 text-gray-700';
}

export function groupLinesByBrand(lines: MockClientReturnLine[]) {
  const map = new Map<string, MockClientReturnLine[]>();
  for (const line of lines) {
    const brand = line.brandName?.trim() || 'Unknown';
    const list = map.get(brand) || [];
    const existing = list.find(
      (item) => item.variantName === line.variantName && item.variantType === line.variantType
    );
    if (existing) {
      existing.quantity += line.quantity;
    } else {
      list.push({ ...line, brandName: brand });
    }
    map.set(brand, list);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([groupBrand, variants]) => ({
      brandName: groupBrand,
      variants: variants.slice().sort((a, b) => {
        const typeCompare = variantTypeOrder(a.variantType) - variantTypeOrder(b.variantType);
        if (typeCompare !== 0) return typeCompare;
        return a.variantName.localeCompare(b.variantName);
      }),
    }));
}

export function BrandReturnedTable({
  brandName,
  variants,
}: {
  brandName: string;
  variants: MockClientReturnLine[];
}) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(BRAND_PAGE_SIZE);
  const brandQty = variants.reduce((sum, line) => sum + line.quantity, 0);
  const { pagedItems, safePage, pageCount } = getListPaginationSlice(variants, page, pageSize);

  useEffect(() => {
    setPage(0);
  }, [brandName, variants.length, pageSize]);

  return (
    <div className="rounded-md border bg-muted/20 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/50 border-b">
        <p className="font-semibold text-sm">{brandName}</p>
        <span className="text-xs text-muted-foreground">
          {variants.length} variant{variants.length === 1 ? '' : 's'} · {brandQty} qty
        </span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Variant</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Qty</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pagedItems.map((line) => (
            <TableRow key={`${brandName}-${line.variantType}-${line.variantName}`}>
              <TableCell className="font-medium">{line.variantName}</TableCell>
              <TableCell>
                <Badge
                  variant="secondary"
                  className={`font-normal capitalize ${variantTypeBadgeClass(line.variantType)}`}
                >
                  {formatVariantType(line.variantType)}
                </Badge>
              </TableCell>
              <TableCell className="text-right font-semibold text-rose-700 tabular-nums">
                {line.quantity}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="border-t px-3 py-2 bg-background/60">
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
      </div>
    </div>
  );
}
