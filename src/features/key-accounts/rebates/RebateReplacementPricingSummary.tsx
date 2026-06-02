import { Card, CardContent } from '@/components/ui/card';
import {
  formatRebateCurrency,
  getRebateReplacementPricingTotals,
} from './keyAccountRebateShared';

type OrderPricingFields = {
  po_order_kind?: string | null;
  subtotal?: number | null;
  tax_rate?: number | null;
  tax_amount?: number | null;
  discount?: number | null;
  total_amount?: number | null;
};

type RebatePricingFields = {
  disputed_total?: number | null;
  replacement_total?: number | null;
};

interface RebateReplacementPricingSummaryProps {
  order: OrderPricingFields;
  rebate?: RebatePricingFields | null;
  /** Wrap in a Card (warehouse / key account detail modals). */
  variant?: 'card' | 'inline';
  className?: string;
}

function StandardPricingRows({ order }: { order: OrderPricingFields }) {
  const discount = Number(order.discount) || 0;
  return (
    <>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Subtotal</span>
        <span>{formatRebateCurrency(order.subtotal)}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Tax ({order.tax_rate || 0}%)</span>
        <span>{formatRebateCurrency(order.tax_amount)}</span>
      </div>
      {discount > 0 && (
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Discount</span>
          <span className="text-green-600">- {formatRebateCurrency(discount)}</span>
        </div>
      )}
      <div className="flex justify-between font-bold text-lg border-t pt-2">
        <span>Total</span>
        <span>{formatRebateCurrency(order.total_amount)}</span>
      </div>
    </>
  );
}

function RebateReplacementPricingRows({
  order,
  rebate,
}: {
  order: OrderPricingFields;
  rebate?: RebatePricingFields | null;
}) {
  const totals = getRebateReplacementPricingTotals(order, rebate);
  if (!totals) return <StandardPricingRows order={order} />;

  const taxAmount = Number(order.tax_amount) || 0;

  return (
    <>
      <p className="text-xs text-muted-foreground leading-relaxed">
        {totals.isFreeReplacement ? (
          <>
            Replacement shipment after rebate approval. The disputed value from the original PO
            covers the full replacement — no extra payment.
          </>
        ) : (
          <>
            Replacement item costs more than the disputed line value. The client pays only the
            difference; the rest is covered by the rebate credit from the source PO.
          </>
        )}
      </p>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Replacement items value</span>
        <span>{formatRebateCurrency(totals.replacementValue)}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Disputed value (rebate credit)</span>
        <span className="text-green-600">- {formatRebateCurrency(totals.disputedValue)}</span>
      </div>
      {taxAmount > 0 && (
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Tax ({order.tax_rate || 0}%)</span>
          <span>{formatRebateCurrency(taxAmount)}</span>
        </div>
      )}
      <div className="flex justify-between font-bold text-lg border-t pt-2">
        <span>
          {totals.isFreeReplacement ? 'Amount due' : 'Additional payment due'}
        </span>
        <span>{formatRebateCurrency(totals.additionalPaymentDue)}</span>
      </div>
    </>
  );
}

export function RebateReplacementPricingSummary({
  order,
  rebate,
  variant = 'card',
  className,
}: RebateReplacementPricingSummaryProps) {
  const isRebateReplacement = String(order.po_order_kind || '') === 'rebate_fulfillment';
  const rows = isRebateReplacement ? (
    <RebateReplacementPricingRows order={order} rebate={rebate} />
  ) : (
    <StandardPricingRows order={order} />
  );

  if (variant === 'inline') {
    return <div className={`space-y-2 ${className ?? ''}`.trim()}>{rows}</div>;
  }

  return (
    <Card className={className}>
      <CardContent className="pt-6">
        <div className="space-y-2">{rows}</div>
      </CardContent>
    </Card>
  );
}
