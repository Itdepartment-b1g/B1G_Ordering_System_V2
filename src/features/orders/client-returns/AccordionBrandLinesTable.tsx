import { Eye, MoreVertical, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatVariantType, groupLinesByBrand } from './ClientReturnBrandTable';
import { type PreviewClientReturnLine } from './clientReturnPreview';
import { ClientReturnStockFateBadge } from './ClientReturnStockFateBadge';

export type AccordionBrandLine = Pick<
  PreviewClientReturnLine,
  'brandName' | 'variantName' | 'variantType' | 'quantity'
> &
  Partial<Pick<PreviewClientReturnLine, 'stockFate' | 'variantId' | 'brandId' | 'variantTypeId'>>;

function BrandLineRowMenu({
  line,
  onView,
  onPrint,
}: {
  line: AccordionBrandLine;
  onView?: (line: AccordionBrandLine) => void;
  onPrint?: (line: AccordionBrandLine) => void;
}) {
  if (!onView && !onPrint) return null;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={`Actions for ${line.variantName}`}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreVertical className="h-4 w-4 text-gray-600" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44" onClick={(event) => event.stopPropagation()}>
        {onView ? (
          <DropdownMenuItem onSelect={() => window.setTimeout(() => onView(line), 0)}>
            <Eye className="h-4 w-4 mr-2" />
            View
          </DropdownMenuItem>
        ) : null}
        {onPrint ? (
          <DropdownMenuItem onSelect={() => window.setTimeout(() => onPrint(line), 0)}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AccordionBrandLinesTable({
  lines,
  qtyClassName = 'text-rose-700',
  showStockFate = false,
  typeColumnLabel = 'Type',
  onLineClick,
  onLinePrint,
}: {
  lines: AccordionBrandLine[];
  qtyClassName?: string;
  showStockFate?: boolean;
  /** Header label for the type column (e.g. "Variant type"). */
  typeColumnLabel?: string;
  onLineClick?: (line: AccordionBrandLine) => void;
  onLinePrint?: (line: AccordionBrandLine) => void;
}) {
  const groups = groupLinesByBrand(lines as PreviewClientReturnLine[]);
  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">No item lines.</p>;
  }

  const showActions = typeof onLineClick === 'function' || typeof onLinePrint === 'function';
  const tableMinWidth = showStockFate
    ? showActions
      ? 'min-w-[40rem]'
      : 'min-w-[36rem]'
    : showActions
      ? 'min-w-[24rem]'
      : 'min-w-[22rem]';

  return (
    <div className="space-y-2">
      {groups.map((group) => {
        const totalUnits = group.variants.reduce((sum, line) => sum + (line.quantity || 0), 0);
        return (
          <div key={group.brandName} className="rounded-md border bg-background overflow-hidden">
            <div className="border-b bg-muted/40 px-3 py-2">
              <p className="text-sm font-semibold truncate text-left">{group.brandName}</p>
            </div>
            <div className="overflow-x-auto">
              <Table className={`w-full ${tableMinWidth}`}>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-8 px-3 text-[11px] uppercase tracking-wide text-muted-foreground">
                      Variant
                    </TableHead>
                    <TableHead className="h-8 px-3 text-[11px] uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                      {typeColumnLabel}
                    </TableHead>
                    {showStockFate ? (
                      <TableHead className="h-8 px-3 text-[11px] uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                        Stock
                      </TableHead>
                    ) : null}
                    <TableHead className="h-8 px-3 text-[11px] uppercase tracking-wide text-muted-foreground text-right whitespace-nowrap">
                      Unit
                    </TableHead>
                    {showActions ? (
                      <TableHead className="h-8 w-[1%] px-3 text-[11px] uppercase tracking-wide text-muted-foreground text-right whitespace-nowrap">
                        Action
                      </TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.variants.map((line, index) => (
                    <TableRow
                      key={`${group.brandName}-${line.variantName}-${line.stockFate || ''}-${index}`}
                      className={
                        onLineClick
                          ? 'cursor-pointer hover:bg-rose-50/40'
                          : 'hover:bg-transparent'
                      }
                      onClick={onLineClick ? () => onLineClick(line) : undefined}
                    >
                      <TableCell className="px-3 py-2 text-sm font-medium whitespace-nowrap">
                        {line.variantName}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-sm text-muted-foreground whitespace-nowrap">
                        {formatVariantType(line.variantType)}
                      </TableCell>
                      {showStockFate ? (
                        <TableCell className="px-3 py-2.5 whitespace-nowrap">
                          {line.stockFate ? (
                            <ClientReturnStockFateBadge fate={line.stockFate} showDescription />
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
                      {showActions ? (
                        <TableCell className="px-3 py-2 text-right whitespace-nowrap">
                          <BrandLineRowMenu
                            line={line}
                            onView={onLineClick}
                            onPrint={onLinePrint}
                          />
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between gap-2 border-t bg-muted/30 px-3 py-2">
              <span className="text-xs font-medium text-muted-foreground">Total units:</span>
              <span className={`text-sm font-semibold tabular-nums ${qtyClassName}`}>
                {totalUnits.toLocaleString()}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
