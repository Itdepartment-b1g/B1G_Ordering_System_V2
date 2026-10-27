import { AlertCircle, CheckCircle, Landmark } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import type { Order } from '@/features/orders/OrderContext';

type DepositOrder = Pick<
  Order,
  | 'paymentMethod'
  | 'paymentMode'
  | 'paymentSplits'
  | 'depositId'
  | 'depositStatus'
  | 'depositBankAccount'
  | 'depositSlipUrl'
  | 'depositReferenceNumber'
  | 'depositNotes'
>;

function cashOrChequeMethods(order: DepositOrder): Array<'CASH' | 'CHEQUE'> {
  if (order.paymentMode === 'SPLIT' && order.paymentSplits?.length) {
    const methods = order.paymentSplits
      .map((split) => split.method)
      .filter((method): method is 'CASH' | 'CHEQUE' => method === 'CASH' || method === 'CHEQUE');
    return [...new Set(methods)];
  }
  if (order.paymentMethod === 'CASH' || order.paymentMethod === 'CHEQUE') {
    return [order.paymentMethod];
  }
  return [];
}

function attachmentTitle(methods: Array<'CASH' | 'CHEQUE'>): string {
  if (methods.length === 1 && methods[0] === 'CHEQUE') return 'Cheque Deposit Image';
  if (methods.length === 1 && methods[0] === 'CASH') return 'Cash Deposit Slip';
  return 'Cash / Cheque Deposit Slip';
}

function statusLabel(status: Order['depositStatus']): string {
  if (status === 'verified') return 'Verified';
  if (status === 'pending_verification') return 'Pending verification';
  return status || 'Recorded';
}

export function OrderCashDepositAttachment({ order }: { order: DepositOrder }) {
  const methods = cashOrChequeMethods(order);
  if (methods.length === 0 || !order.depositId) return null;

  const title = attachmentTitle(methods);

  return (
    <div className="space-y-3 border-t pt-4">
      <h4 className="flex items-center gap-2 text-lg font-semibold">
        <Landmark className="h-5 w-5" />
        {title}
      </h4>

      {order.depositSlipUrl ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={order.depositStatus === 'verified' ? 'default' : 'secondary'}>
              {statusLabel(order.depositStatus)}
            </Badge>
            {order.depositBankAccount && (
              <span className="text-sm text-muted-foreground">{order.depositBankAccount}</span>
            )}
          </div>
          {order.depositReferenceNumber && (
            <p className="text-sm">
              <span className="text-muted-foreground">Reference: </span>
              {order.depositReferenceNumber}
            </p>
          )}
          {order.depositNotes && (
            <p className="text-sm">
              <span className="text-muted-foreground">Notes: </span>
              {order.depositNotes}
            </p>
          )}
          <Label className="text-muted-foreground">Deposit attachment</Label>
          <div className="overflow-hidden rounded-lg border bg-white">
            <img
              src={order.depositSlipUrl}
              alt={title}
              className="h-auto max-h-96 w-full cursor-pointer object-contain"
              onClick={() => window.open(order.depositSlipUrl, '_blank', 'noopener,noreferrer')}
              onError={(event) => {
                (event.target as HTMLImageElement).src =
                  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2YzZjRmNiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM2YjcyODAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5JbWFnZSBub3QgZm91bmQ8L3RleHQ+PC9zdmc+';
              }}
            />
          </div>
          <p className="flex items-center gap-1 text-xs text-green-700">
            <CheckCircle className="h-3 w-3" />
            Deposit slip uploaded by the team leader. Click the image to view it full size.
          </p>
        </div>
      ) : (
        <p className="flex items-center gap-1 text-sm text-amber-700">
          <AlertCircle className="h-4 w-4" />
          Waiting for the team leader to upload the deposit image.
        </p>
      )}
    </div>
  );
}
