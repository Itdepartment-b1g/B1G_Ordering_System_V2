import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatVariantType, groupLinesByBrand } from './ClientReturnBrandTable';
import {
  clientReturnStockFateBadgeClass,
  formatClientReturnStockFate,
  type PreviewClientReturnLine,
} from './clientReturnPreview';

export type AccordionBrandLine = Pick<
  PreviewClientReturnLine,
  'brandName' | 'variantName' | 'variantType' | 'quantity'
> &
  Partial<Pick<PreviewClientReturnLine, 'stockFate' | 'variantId' | 'brandId' | 'variantTypeId'>>;

export function AccordionBrandLinesTable({
  lines,
  qtyClassName = 'text-rose-700',
  showStockFate = false,
}: {
  lines: AccordionBrandLine[];
  qtyClassName?: string;
  showStockFate?: boolean;
}) {
  const groups = groupLinesByBrand(lines as PreviewClientReturnLine[]);
  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">No item lines.</p>;
  }

  return (
    <div className="space-y-2">
      {groups.map((group) => {
        const totalUnits = group.variants.reduce((sum, line) => sum + (line.quantity || 0), 0);
        return (
          <div key={group.brandName} className="rounded-md border bg-background">
            <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
              <p className="text-sm font-semibold truncate">{group.brandName}</p>
              <span className={`text-xs font-semibold tabular-nums shrink-0 ${qtyClassName}`}>
                {totalUnits.toLocaleString()} units
              </span>
            </div>
            <Table className={`w-full ${showStockFate ? 'min-w-[28rem]' : 'min-w-[22rem]'}`}>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-8 px-3 text-[11px] uppercase tracking-wide text-muted-foreground">
                    Variant
                  </TableHead>
                  <TableHead className="h-8 px-3 text-[11px] uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                    Type
                  </TableHead>
                  {showStockFate ? (
                    <TableHead className="h-8 px-3 text-[11px] uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                      Stock
                    </TableHead>
                  ) : null}
                  <TableHead className="h-8 px-3 text-[11px] uppercase tracking-wide text-muted-foreground text-right whitespace-nowrap">
                    Unit
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.variants.map((line, index) => (
                  <TableRow
                    key={`${group.brandName}-${line.variantName}-${line.stockFate || ''}-${index}`}
                    className="hover:bg-transparent"
                  >
                    <TableCell className="px-3 py-2 text-sm font-medium whitespace-nowrap">
                      {line.variantName}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-sm text-muted-foreground whitespace-nowrap">
                      {formatVariantType(line.variantType)}
                    </TableCell>
                    {showStockFate ? (
                      <TableCell className="px-3 py-2 whitespace-nowrap">
                        {line.stockFate ? (
                          <Badge
                            variant="outline"
                            className={`font-normal text-[11px] px-1.5 py-0 h-5 ${clientReturnStockFateBadgeClass(line.stockFate)}`}
                          >
                            {formatClientReturnStockFate(line.stockFate)}
                          </Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    ) : null}
                    <TableCell
                      className={`px-3 py-2 text-right text-sm font-semibold tabular-nums whitespace-nowrap ${qtyClassName}`}
                    >
                      {(line.quantity || 0).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        );
      })}
    </div>
  );
}
