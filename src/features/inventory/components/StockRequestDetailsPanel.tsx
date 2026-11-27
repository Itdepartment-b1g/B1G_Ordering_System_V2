import type { ReactNode } from 'react';
import { Printer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { GroupedRequest } from '../requestHooks';
import {
  formatStockRequestWhen,
  groupStockRequestLinesByBrand,
  variantTypeBadgeClass,
} from '../utils/stockRequestGrouping';

export function StockRequestDetailsPanel({
  group,
  statusBadge,
  onPrint,
  showPrint = true,
}: {
  group: GroupedRequest;
  statusBadge: ReactNode;
  onPrint?: () => void;
  showPrint?: boolean;
}) {
  const first = group.requests[0];
  const denialReason =
    group.requests.map((req) => req.denial_reason?.trim()).find(Boolean) ?? null;
  const linesByBrand = groupStockRequestLinesByBrand(group.requests);

  return (
    <div className="space-y-4">
      {showPrint && onPrint ? (
        <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={onPrint}>
          <Printer className="mr-2 h-4 w-4" />
          Print
        </Button>
      ) : null}

      <div className="grid grid-cols-2 gap-x-3 gap-y-3 rounded-lg border bg-muted/20 p-3 text-sm sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted-foreground">Request no.</p>
          <p className="font-medium font-mono text-xs">
            {group.id.startsWith('SR-') ? group.id : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Status</p>
          <div className="mt-0.5">{statusBadge}</div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Requested date</p>
          <p className="font-medium">{formatStockRequestWhen(group.requested_at)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Requested by</p>
          <p className="font-medium">{first?.requested_by_name?.trim() || '—'}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Requested from</p>
          <p className="font-medium">{first?.requested_from_name?.trim() || '—'}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Total qty</p>
          <p className="font-medium tabular-nums">{group.totalQuantity.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">SKUs</p>
          <p className="font-medium tabular-nums">{group.productCount.toLocaleString()}</p>
        </div>
        <div className="col-span-2 sm:col-span-3">
          <p className="text-xs text-muted-foreground">Notes</p>
          <p className="font-medium">{group.requester_notes?.trim() || '—'}</p>
        </div>
        {denialReason ? (
          <div className="col-span-2 sm:col-span-3">
            <p className="text-xs text-muted-foreground">Denial reason</p>
            <p className="font-medium text-destructive">{denialReason}</p>
          </div>
        ) : null}
      </div>

      <div className="space-y-4 border-t pt-4">
        {linesByBrand.length === 0 ? (
          <p className="text-sm text-muted-foreground">No items in this request.</p>
        ) : (
          linesByBrand.map((brandGroup) => {
            const brandQty = brandGroup.types.reduce(
              (sum, typeGroup) =>
                sum +
                typeGroup.items.reduce((typeSum, req) => typeSum + (Number(req.requested_quantity) || 0), 0),
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
                    const typeQty = typeGroup.items.reduce(
                      (sum, req) => sum + (Number(req.requested_quantity) || 0),
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
                          {typeGroup.items.map((req) => (
                            <div
                              key={req.id}
                              className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm"
                            >
                              <span className="min-w-0 font-medium leading-snug">
                                {req.variant?.name?.trim() || 'Item'}
                              </span>
                              <span className="shrink-0 tabular-nums text-muted-foreground">
                                {(Number(req.requested_quantity) || 0).toLocaleString()}
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
