import { Badge } from '@/components/ui/badge';
import {
  clientReturnStockFateBadgeClass,
  formatClientReturnStockFate,
  type PreviewClientReturnLine,
} from './clientReturnPreview';
import { formatVariantType, variantTypeBadgeClass } from './ClientReturnBrandTable';

function variantTypeOrder(type: string): number {
  const value = type.trim().toLowerCase();
  if (value === 'flavor') return 0;
  if (value === 'battery') return 1;
  if (value === 'posm') return 2;
  if (value === 'foc') return 3;
  if (value === 'ncv') return 4;
  return 99;
}

export function groupLinesByBrandAndType(lines: PreviewClientReturnLine[]) {
  const byBrand = new Map<string, PreviewClientReturnLine[]>();
  for (const line of lines) {
    const brand = line.brandName?.trim() || 'Unknown';
    const list = byBrand.get(brand) ?? [];
    list.push({ ...line, brandName: brand });
    byBrand.set(brand, list);
  }

  return [...byBrand.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map(([brand, brandLines]) => {
      const byType = new Map<string, PreviewClientReturnLine[]>();
      for (const line of brandLines) {
        const type = formatVariantType(line.variantType || '');
        const list = byType.get(type) ?? [];
        list.push(line);
        byType.set(type, list);
      }
      return {
        brand,
        types: [...byType.entries()]
          .sort(
            ([a], [b]) =>
              variantTypeOrder(a) - variantTypeOrder(b) ||
              a.localeCompare(b, undefined, { sensitivity: 'base' })
          )
          .map(([type, typeLines]) => ({
            type,
            variantType: typeLines[0]?.variantType || type,
            items: [...typeLines].sort((a, b) =>
              a.variantName.localeCompare(b.variantName, undefined, { sensitivity: 'base' })
            ),
          })),
      };
    });
}

export function BrandTypeLinesList({
  lines,
  qtyClassName = 'text-rose-700',
  showStockFate = false,
  emptyMessage = 'No item lines.',
}: {
  lines: PreviewClientReturnLine[];
  qtyClassName?: string;
  showStockFate?: boolean;
  emptyMessage?: string;
}) {
  const groups = groupLinesByBrandAndType(lines);

  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-4">
      {groups.map((brandGroup) => {
        const brandQty = brandGroup.types.reduce(
          (sum, typeGroup) =>
            sum + typeGroup.items.reduce((typeSum, line) => typeSum + (line.quantity || 0), 0),
          0
        );
        return (
          <div key={brandGroup.brand} className="overflow-hidden rounded-lg border">
            <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2.5">
              <h3 className="text-sm font-semibold">{brandGroup.brand}</h3>
              <span className={`text-xs font-semibold tabular-nums ${qtyClassName}`}>
                {brandQty.toLocaleString()} units
              </span>
            </div>
            <div className="divide-y">
              {brandGroup.types.map((typeGroup) => {
                const typeQty = typeGroup.items.reduce(
                  (sum, line) => sum + (line.quantity || 0),
                  0
                );
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
                      {typeGroup.items.map((line, index) => (
                        <div
                          key={`${line.variantId || line.variantName}-${line.stockFate || 'none'}-${index}`}
                          className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm"
                        >
                          <div className="min-w-0 space-y-1">
                            <p className="font-medium leading-snug">{line.variantName}</p>
                            {showStockFate && line.stockFate ? (
                              <Badge
                                variant="outline"
                                className={`text-[10px] font-normal ${clientReturnStockFateBadgeClass(line.stockFate)}`}
                              >
                                {formatClientReturnStockFate(line.stockFate)}
                              </Badge>
                            ) : null}
                          </div>
                          <span className={`shrink-0 tabular-nums font-semibold ${qtyClassName}`}>
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
