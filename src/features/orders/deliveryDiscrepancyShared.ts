/** Shared labels/types for PO delivery shortfall discrepancies (Option B). */

export type ShortfallReason = 'missing_in_transit' | 'damaged' | 'wrong_item' | 'other';

export const SHORTFALL_REASON_OPTIONS: { value: ShortfallReason; label: string }[] = [
  { value: 'missing_in_transit', label: 'Missing / lost in transit' },
  { value: 'damaged', label: 'Damaged on arrival' },
  { value: 'wrong_item', label: 'Wrong / incomplete packaging' },
  { value: 'other', label: 'Other' },
];

export const SHORTFALL_REASON_LABELS: Record<ShortfallReason, string> = {
  missing_in_transit: 'Missing / lost in transit',
  damaged: 'Damaged on arrival',
  wrong_item: 'Wrong / incomplete packaging',
  other: 'Other',
};

/** Display label; when reason is `other`, append buyer free-text detail. */
export function formatShortfallReasonLabel(
  reason: ShortfallReason | string | null | undefined,
  detail?: string | null
): string {
  if (!reason) return '';
  const base =
    reason in SHORTFALL_REASON_LABELS
      ? SHORTFALL_REASON_LABELS[reason as ShortfallReason]
      : String(reason);
  const firstLine = detail?.trim().split(/\r?\n/)[0]?.trim();
  if (reason === 'other' && firstLine) return `${base} — ${firstLine}`;
  return base;
}

export type DiscrepancyStatus =
  | 'open'
  | 'resolved_redeliver'
  | 'resolved_write_off'
  | 'resolved_write_off_replace'
  | 'cancelled';

export type DiscrepancyResolution = 'redeliver' | 'write_off_replace' | 'write_off';

export const DISCREPANCY_STATUS_LABELS: Record<DiscrepancyStatus, string> = {
  open: 'Open',
  resolved_redeliver: 'Resolved · found & redeliver',
  resolved_write_off: 'Resolved · write-off',
  resolved_write_off_replace: 'Resolved · write-off & replace',
  cancelled: 'Cancelled',
};

export const DISCREPANCY_RESOLUTION_OPTIONS: {
  value: DiscrepancyResolution;
  label: string;
  description: string;
}[] = [
  {
    value: 'redeliver',
    label: 'Found → restore & redeliver',
    description: 'Put stock back and reopen this PO for another DR.',
  },
  {
    value: 'write_off_replace',
    label: 'Lost → write off & ship replacement',
    description: 'Do not restore stock. Reopen this PO so you can dispatch a replacement from remaining inventory.',
  },
  {
    value: 'write_off',
    label: 'Lost → write off only',
    description: 'Confirm the loss. Do not restore stock and do not reopen for another DR.',
  },
];

/** Resolution copy for internal sub-stock shortages (Main ↔ Sub, not supplier PO). */
export const INTERNAL_DISCREPANCY_RESOLUTION_OPTIONS: {
  value: DiscrepancyResolution;
  label: string;
  description: string;
}[] = [
  {
    value: 'redeliver',
    label: 'Found → restore & redeliver',
    description:
      'Release the held reservation. Then use Allocate Remaining on the request (rider + proof + new DR) to re-deliver — same idea as reopening a PO for another DR.',
  },
  {
    value: 'write_off_replace',
    label: 'Lost → write off & ship replacement',
    description:
      'Release the held reservation. Use Allocate Remaining on the request to ship a replacement from available stock.',
  },
  {
    value: 'write_off',
    label: 'Lost → write off only',
    description:
      'Confirm the loss. Release the reservation and reduce delivered qty — do not ship a replacement for this shortage.',
  },
];

export function formatInternalShortageContext(
  requestNumber?: string | null,
  drNumber?: string | null,
  subLocationName?: string | null
): string {
  return [requestNumber, drNumber, subLocationName].filter(Boolean).join(' · ');
}

export function isShortfallReason(value: string): value is ShortfallReason {
  return SHORTFALL_REASON_OPTIONS.some((o) => o.value === value);
}
