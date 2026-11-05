import { format } from 'date-fns';
import { Printer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  groupReturnLinesByBrand,
  variantTypeBadgeClass,
  type MyReturn,
  type ReturnStatus,
} from '../utils/mobileSalesReturnHistory';
import { exportMainInventoryReturnPdf } from '../utils/exportMainInventoryReturnPdf';

function statusBadge(status: ReturnStatus) {
  if (status === 'approved') return <Badge>Approved</Badge>;
  if (status === 'rejected') return <Badge variant="destructive">Rejected</Badge>;
  return <Badge variant="secondary">Pending</Badge>;
}

export function MobileSalesReturnDetailsPanel({
  row,
  returnedByName,
  showPrint = true,
}: {
  row: MyReturn;
  returnedByName: string;
  showPrint?: boolean;
}) {
  const linesByBrand = groupReturnLinesByBrand(row.lines);

  const printReturn = () => {
    exportMainInventoryReturnPdf({
      returnedBy: returnedByName || 'Mobile Sales',
      returnedTo: row.returnedTo,
      returnedAt: row.returnedAt,
      status: row.status === 'approved' ? 'Approved' : row.status === 'rejected' ? 'Rejected' : 'Pending',
      reason: row.reason,
      lines: row.lines.map((line) => ({
        brandName: line.brandName,
        variantName: line.variantName,
        variantType: line.variantType,
        quantity: line.quantity,
      })),
    });
  };

  return (
    <div className="space-y-4">
      {showPrint ? (
        <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={printReturn}>
          <Printer className="mr-2 h-4 w-4" />
          Print
        </Button>
      ) : null}

      <div className="grid grid-cols-2 gap-x-3 gap-y-3 rounded-lg border bg-muted/20 p-3 text-sm sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted-foreground">Returned by</p>
          <p className="font-medium">{returnedByName}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Returned to</p>
          <p className="font-medium">{row.returnedTo}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Returned date</p>
          <p className="font-medium">{format(new Date(row.returnedAt), 'MMM d, yyyy h:mm a')}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Total qty</p>
          <p className="font-medium tabular-nums">{row.totalQuantity.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">SKUs</p>
          <p className="font-medium tabular-nums">{row.variantCount.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Status</p>
          <div className="mt-0.5">{statusBadge(row.status)}</div>
        </div>
        <div className="col-span-2 sm:col-span-3">
          <p className="text-xs text-muted-foreground">Reason</p>
          <p className="font-medium">{row.reason.trim() || '—'}</p>
        </div>
        {row.status === 'rejected' && row.rejectionReason ? (
          <div className="col-span-2 sm:col-span-3">
            <p className="text-xs text-muted-foreground">Rejection reason</p>
            <p className="font-medium text-destructive">{row.rejectionReason}</p>
          </div>
        ) : null}
      </div>

      <div className="space-y-4 border-t pt-4">
        {linesByBrand.length === 0 ? (
          <p className="text-sm text-muted-foreground">No product lines on this return.</p>
        ) : (
          linesByBrand.map((brandGroup) => {
            const brandQty = brandGroup.types.reduce(
              (sum, typeGroup) =>
                sum + typeGroup.items.reduce((typeSum, line) => typeSum + line.quantity, 0),
              0
            );
            return (
              <div key={brandGroup.brand} className="overflow-hidden rounded-lg border">
                <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2.5">
                  <h3 className="text-sm font-semibold">{brandGroup.brand}</h3>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {brandQty.toLocaleString()} units
                  </span>
                </div>
                <div className="divide-y">
                  {brandGroup.types.map((typeGroup) => {
                    const typeQty = typeGroup.items.reduce((sum, line) => sum + line.quantity, 0);
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
                          {typeGroup.items.map((line) => (
                            <div
                              key={line.variantId}
                              className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm"
                            >
                              <span className="min-w-0 font-medium leading-snug">
                                {line.variantName.trim() || 'Item'}
                              </span>
                              <span className="shrink-0 tabular-nums text-muted-foreground">
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
          })
        )}
      </div>
    </div>
  );
}
