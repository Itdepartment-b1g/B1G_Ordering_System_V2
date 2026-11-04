import { CreditCard, FileSignature, Printer, Split } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import type { Order, OrderItem } from '../OrderContext';
import { OrderCashDepositAttachment } from './OrderCashDepositAttachment';
import { getOrderStatusStack } from '../utils/orderStatusStack';

function variantTypeLabel(type: string | null | undefined): string {
  if (!type?.trim()) return 'Other';
  const key = type.trim().toLowerCase();
  if (key === 'flavor') return 'Flavor';
  if (key === 'battery') return 'Battery';
  if (key === 'foc') return 'FOC';
  if (key === 'posm') return 'POSM';
  if (key === 'ncv') return 'NCV';
  return type;
}

function variantTypeBadgeClass(type: string | null | undefined): string {
  if (!type) return '';
  const key = type.trim().toLowerCase();
  if (key === 'flavor') return 'border-purple-300 bg-purple-100 text-purple-800';
  if (key === 'battery') return 'border-green-300 bg-green-100 text-green-800';
  if (key === 'foc') return 'border-orange-300 bg-orange-100 text-orange-800';
  if (key === 'posm') return 'border-blue-300 bg-blue-100 text-blue-800';
  if (key === 'ncv') return 'border-slate-300 bg-slate-100 text-slate-800';
  return '';
}

function groupOrderItemsByBrand(items: OrderItem[]) {
  const byBrand = new Map<string, OrderItem[]>();
  for (const item of items) {
    const brand = item.brandName?.trim() || 'Unknown Brand';
    const list = byBrand.get(brand) ?? [];
    list.push(item);
    byBrand.set(brand, list);
  }

  return [...byBrand.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map(([brand, brandItems]) => {
      const byType = new Map<string, OrderItem[]>();
      for (const item of brandItems) {
        const type = variantTypeLabel(item.variantType);
        const list = byType.get(type) ?? [];
        list.push(item);
        byType.set(type, list);
      }
      return {
        brand,
        types: [...byType.entries()]
          .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
          .map(([type, typeItems]) => ({
            type,
            variantType: typeItems[0]?.variantType ?? null,
            items: [...typeItems].sort((a, b) =>
              a.variantName.localeCompare(b.variantName, undefined, { sensitivity: 'base' })
            ),
          })),
      };
    });
}

export function MyOrderDetailsPanel({
  order,
  onPrint,
  showPrint = true,
  isAdmin = false,
}: {
  order: Order;
  onPrint?: () => void;
  showPrint?: boolean;
  isAdmin?: boolean;
}) {
  const { primary, secondary } = getOrderStatusStack(order);
  const linesByBrand = groupOrderItemsByBrand(order.items || []);
  const totalQty = (order.items || []).reduce((sum, item) => sum + (item.quantity || 0), 0);

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
          <p className="text-xs text-muted-foreground">Order number</p>
          <p className="font-mono font-medium">{order.orderNumber}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Status</p>
          <div className="mt-0.5 flex flex-col items-start gap-1">
            <Badge variant={primary.variant}>{primary.text}</Badge>
            {secondary ? (
              <Badge variant={secondary.variant} className={secondary.className}>
                {secondary.text}
              </Badge>
            ) : null}
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Order date</p>
          <p className="font-medium">{new Date(order.date).toLocaleDateString()}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Client</p>
          <p className="font-medium">{order.clientName}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Sales agent</p>
          <p className="font-medium">{order.agentName}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Pricing</p>
          <p className="font-medium capitalize">
            {order.pricingStrategy === 'special'
              ? 'Special'
              : order.pricingStrategy === 'dsp'
                ? 'DSP'
                : 'RSP'}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Total qty</p>
          <p className="font-medium tabular-nums">{totalQty.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">SKUs</p>
          <p className="font-medium tabular-nums">{(order.items || []).length.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Total amount</p>
          <p className="font-medium tabular-nums">₱{Number(order.total || 0).toFixed(2)}</p>
        </div>
      </div>

      <div className="space-y-4 border-t pt-4">
        {linesByBrand.length === 0 ? (
          <p className="text-sm text-muted-foreground">No items found for this order.</p>
        ) : (
          linesByBrand.map((brandGroup) => {
            const brandQty = brandGroup.types.reduce(
              (sum, typeGroup) =>
                sum + typeGroup.items.reduce((typeSum, item) => typeSum + (item.quantity || 0), 0),
              0
            );
            const brandTotal = brandGroup.types.reduce(
              (sum, typeGroup) =>
                sum + typeGroup.items.reduce((typeSum, item) => typeSum + (item.total || 0), 0),
              0
            );
            return (
              <div key={brandGroup.brand} className="overflow-hidden rounded-lg border">
                <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2.5">
                  <h3 className="text-sm font-semibold">{brandGroup.brand}</h3>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {brandQty.toLocaleString()} units · ₱{brandTotal.toFixed(2)}
                  </span>
                </div>
                <div className="divide-y">
                  {brandGroup.types.map((typeGroup) => {
                    const typeQty = typeGroup.items.reduce(
                      (sum, item) => sum + (item.quantity || 0),
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
                          {typeGroup.items.map((item) => (
                            <div key={item.id} className="space-y-1 px-3 py-2.5 text-sm">
                              <div className="flex items-start justify-between gap-3">
                                <span className="min-w-0 font-medium leading-snug">
                                  {item.variantName}
                                </span>
                                <span className="shrink-0 tabular-nums font-semibold">
                                  ₱{Number(item.total || 0).toFixed(2)}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                <span className="tabular-nums">Qty {item.quantity}</span>
                                <span className="tabular-nums">
                                  Unit ₱{Number(item.unitPrice || 0).toFixed(2)}
                                </span>
                              </div>
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

      {(order.paymentMethod ||
        (order.paymentMode === 'SPLIT' && order.paymentSplits && order.paymentSplits.length > 0)) && (
        <div className="space-y-3 border-t pt-4">
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <CreditCard className="h-4 w-4" />
            Payment Information
          </h4>
          {order.paymentMode === 'SPLIT' &&
          Array.isArray(order.paymentSplits) &&
          order.paymentSplits.length > 0 ? (
            <div className="space-y-3">
              <Badge variant="outline">
                <Split className="mr-1 inline h-3.5 w-3.5" />
                Split Payment
              </Badge>
              {order.paymentSplits.map((split, index) => (
                <Card key={index} className="bg-muted/30 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <Badge variant="secondary">
                      {split.method === 'BANK_TRANSFER'
                        ? split.bank
                          ? `Bank Transfer (${split.bank})`
                          : 'Bank Transfer'
                        : split.method === 'GCASH'
                          ? 'GCash'
                          : split.method === 'CASH'
                            ? 'Cash'
                            : split.method === 'CHEQUE'
                              ? 'Cheque'
                              : split.method}
                    </Badge>
                    <span className="font-semibold text-primary tabular-nums">
                      ₱
                      {(split.amount || 0).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  {split.proofUrl ? (
                    <div className="mt-3 overflow-hidden rounded-md border bg-white">
                      <img
                        src={split.proofUrl}
                        alt={`Payment proof - ${split.method}`}
                        className="max-h-48 w-full cursor-pointer object-contain"
                        onClick={() => window.open(split.proofUrl, '_blank')}
                      />
                    </div>
                  ) : null}
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <div>
                <Label className="text-muted-foreground">Payment Method</Label>
                <p className="font-medium">
                  {order.paymentMethod === 'GCASH'
                    ? 'GCash'
                    : order.paymentMethod === 'BANK_TRANSFER'
                      ? order.bankType
                        ? `Bank Transfer (${order.bankType})`
                        : 'Bank Transfer'
                      : order.paymentMethod === 'CHEQUE'
                        ? 'Cheque'
                        : 'Cash'}
                </p>
              </div>
              {order.paymentProofUrl ? (
                <div className="overflow-hidden rounded-md border bg-white">
                  <img
                    src={order.paymentProofUrl}
                    alt="Payment proof"
                    className="max-h-64 w-full cursor-pointer object-contain"
                    onClick={() => window.open(order.paymentProofUrl, '_blank')}
                  />
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      <OrderCashDepositAttachment order={order} />

      {order.signatureUrl ? (
        <div className="space-y-2 border-t pt-4">
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <FileSignature className="h-4 w-4" />
            Client Signature
          </h4>
          <div className="rounded-lg border border-dashed bg-white p-3">
            <img
              src={order.signatureUrl}
              alt="Client signature"
              className="h-36 w-full object-contain"
            />
          </div>
        </div>
      ) : null}

      <div className="space-y-2 border-t pt-4 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-medium tabular-nums">₱{Number(order.subtotal || 0).toFixed(2)}</span>
        </div>
        {isAdmin ? (
          <>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax (12%)</span>
              <span className="font-medium tabular-nums">₱{Number(order.tax || 0).toFixed(2)}</span>
            </div>
            {Number(order.discount || 0) > 0 ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span className="font-medium tabular-nums text-green-600">
                  -₱{Number(order.discount || 0).toFixed(2)}
                </span>
              </div>
            ) : null}
          </>
        ) : null}
        <div className="flex justify-between border-t pt-2 text-base font-bold">
          <span>Total Amount</span>
          <span className="tabular-nums">₱{Number(order.total || 0).toFixed(2)}</span>
        </div>
      </div>

      {order.notes ? (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Notes</p>
          <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{order.notes}</p>
        </div>
      ) : null}
    </div>
  );
}
