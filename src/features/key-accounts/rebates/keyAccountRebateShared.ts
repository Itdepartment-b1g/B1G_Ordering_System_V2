export type KeyAccountRebateResolutionType = 'credit' | 'replacement' | 'mixed';

export type KeyAccountRebateStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'executed';

export type KeyAccountRebateReasonCode =
  | 'slow_moving'
  | 'quality_taste'
  | 'damaged'
  | 'wrong_item'
  | 'other';

export const REBATE_REASON_OPTIONS: { value: KeyAccountRebateReasonCode; label: string }[] = [
  { value: 'slow_moving', label: 'Slow moving / not selling' },
  { value: 'quality_taste', label: 'Quality / taste issue' },
  { value: 'damaged', label: 'Damaged goods' },
  { value: 'wrong_item', label: 'Wrong item delivered' },
  { value: 'other', label: 'Other' },
];

export const REBATE_RESOLUTION_OPTIONS: { value: KeyAccountRebateResolutionType; label: string }[] = [
  { value: 'credit', label: 'Money / credit' },
  { value: 'replacement', label: 'Change item (replacement)' },
  { value: 'mixed', label: 'Mixed (credit + replacement)' },
];

export function rebateStatusLabel(status: KeyAccountRebateStatus | string): string {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'submitted':
      return 'Pending approval';
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    case 'executed':
      return 'Executed';
    default:
      return status;
  }
}

export function rebateStatusBadgeClass(status: KeyAccountRebateStatus | string): string {
  switch (status) {
    case 'submitted':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'approved':
    case 'executed':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'rejected':
      return 'bg-red-100 text-red-800 border-red-200';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

export function rebateReasonLabel(code: KeyAccountRebateReasonCode | string): string {
  return REBATE_REASON_OPTIONS.find((o) => o.value === code)?.label ?? code;
}

export function rebateResolutionLabel(type: KeyAccountRebateResolutionType | string): string {
  return REBATE_RESOLUTION_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

export function formatRebateCurrency(value: number | null | undefined): string {
  const n = Number(value) || 0;
  return `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** POs spawned by rebate settlement — not eligible as a rebate source PO. */
export function isRebateDerivedPurchaseOrder(po: {
  po_order_kind?: string | null;
  source_rebate_id?: string | null;
}): boolean {
  const kind = String(po.po_order_kind || '');
  if (kind === 'rebate_fulfillment' || kind === 'rebate_topup') return true;
  return !!po.source_rebate_id;
}

export type RebateReplacementPricingTotals = {
  replacementValue: number;
  disputedValue: number;
  additionalPaymentDue: number;
  isFreeReplacement: boolean;
};

/** Breakdown for rebate replacement POs (replacement vs disputed vs client top-up). */
export function getRebateReplacementPricingTotals(
  order: {
    po_order_kind?: string | null;
    subtotal?: number | null;
    total_amount?: number | null;
  },
  rebate?: { disputed_total?: number | null; replacement_total?: number | null } | null
): RebateReplacementPricingTotals | null {
  if (String(order.po_order_kind || '') !== 'rebate_fulfillment') return null;

  const additionalPaymentDue = Number(order.total_amount) || 0;
  const replacementValue =
    rebate?.replacement_total != null
      ? Number(rebate.replacement_total)
      : Number(order.subtotal) || 0;
  const disputedValue =
    rebate?.disputed_total != null
      ? Number(rebate.disputed_total)
      : Math.max(0, Math.round((replacementValue - additionalPaymentDue) * 100) / 100);

  return {
    replacementValue,
    disputedValue,
    additionalPaymentDue,
    isFreeReplacement: additionalPaymentDue <= 0,
  };
}

export function rebateReplacementOrderTotalLabel(
  totals: RebateReplacementPricingTotals | null
): string {
  if (!totals) return 'Order total';
  if (totals.isFreeReplacement) return 'Amount due';
  return 'Additional payment due';
}
