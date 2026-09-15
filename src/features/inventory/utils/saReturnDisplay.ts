import { format } from 'date-fns';

export type SaReturnType = 'my_inventory' | 'item_disposal';

export function formatSaReturnType(type: string | null | undefined): string {
  if (type === 'item_disposal') return 'For Disposal';
  return 'Stock Return';
}

export function saReturnTypeBadgeClass(type: string | null | undefined): string {
  if (type === 'item_disposal') {
    return 'bg-rose-100 text-rose-700 border-rose-200';
  }
  return 'bg-blue-100 text-blue-700 border-blue-200';
}

export type SaReturnTimelineEvent = {
  id: string;
  title: string;
  detail?: string | null;
  /** Extra destination / outcome lines under the event */
  outcomes?: string[];
  at: string | null;
};

export type SaReturnTimelineReceiptLine = {
  qty_good: number;
  qty_damaged: number;
  productLabel?: string | null;
};

export type SaReturnTimelineReceipt = {
  id: string;
  received_at: string;
  receivedByName?: string | null;
  notes?: string | null;
  lines?: SaReturnTimelineReceiptLine[];
};

export function buildSaReturnTimeline(input: {
  createdAt: string;
  createdByName?: string | null;
  sourceAgentName?: string | null;
  sourceAgentId?: string | null;
  approvedAt?: string | null;
  approvedByName?: string | null;
  cancelledAt?: string | null;
  cancelledByName?: string | null;
  status: string;
  returnType?: SaReturnType | null;
  destinationLocationName?: string | null;
  receipts?: SaReturnTimelineReceipt[];
}): SaReturnTimelineEvent[] {
  const returnTypeLabel = formatSaReturnType(input.returnType);
  const destination = input.destinationLocationName?.trim() || null;
  const receipts = [...(input.receipts ?? [])].sort(
    (a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime()
  );

  const events: SaReturnTimelineEvent[] = [
    {
      id: 'submitted',
      title: 'Submitted',
      detail: [
        input.createdByName
          ? `By ${input.createdByName}`
          : input.sourceAgentName
            ? `By ${input.sourceAgentName}`
            : null,
        `Type: ${returnTypeLabel}`,
        destination ? `Destination: ${destination}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      at: input.createdAt,
    },
  ];

  if (input.sourceAgentId && input.sourceAgentName) {
    events.push({
      id: 'from-tl',
      title: 'From team leader',
      detail: input.sourceAgentName,
      at: input.createdAt,
    });
  }

  if (input.approvedAt) {
    events.push({
      id: 'approved',
      title: 'Approved by super admin',
      detail: input.approvedByName ? `By ${input.approvedByName}` : null,
      at: input.approvedAt,
    });
  } else if (input.status === 'pending_approval') {
    events.push({
      id: 'awaiting-approval',
      title: 'Awaiting super admin approval',
      detail: null,
      at: null,
    });
  }

  if (
    receipts.length === 0 &&
    (input.status === 'pending_receive' || input.status === 'partially_received')
  ) {
    events.push({
      id: 'awaiting-inspect',
      title: 'Awaiting warehouse inspect',
      detail:
        input.returnType === 'item_disposal'
          ? 'Not inspected yet — will go to Disposal log'
          : 'Not inspected yet — good stock restocks warehouse inventory; damaged goes to disposal',
      at: null,
    });
  }

  for (const receipt of receipts) {
    const lines = receipt.lines ?? [];
    const qtyGood = lines.reduce((sum, line) => sum + Math.max(0, line.qty_good || 0), 0);
    const qtyDamaged = lines.reduce((sum, line) => sum + Math.max(0, line.qty_damaged || 0), 0);
    const outcomes: string[] = [];

    if (qtyGood > 0) {
      outcomes.push(
        destination
          ? `${qtyGood} → warehouse inventory @ ${destination}`
          : `${qtyGood} → warehouse inventory (sellable)`
      );
    }
    if (qtyDamaged > 0) {
      outcomes.push(`${qtyDamaged} → Disposal log`);
    }
    if (qtyGood === 0 && qtyDamaged === 0) {
      outcomes.push(
        input.returnType === 'item_disposal'
          ? 'Logged for disposal'
          : 'Inspection recorded (no qty posted)'
      );
    }

    if (lines.length > 1) {
      for (const line of lines) {
        const label = line.productLabel?.trim();
        if (!label) continue;
        const parts: string[] = [];
        if (line.qty_good > 0) parts.push(`${line.qty_good} inventory`);
        if (line.qty_damaged > 0) parts.push(`${line.qty_damaged} disposal`);
        if (parts.length > 0) {
          outcomes.push(`${label}: ${parts.join(', ')}`);
        }
      }
    } else if (lines.length === 1) {
      const label = lines[0]?.productLabel?.trim();
      if (label) {
        outcomes.unshift(label);
      }
    }

    const detailParts = [
      receipt.receivedByName ? `By ${receipt.receivedByName}` : null,
      receipt.notes?.trim() ? `Notes: ${receipt.notes.trim()}` : null,
    ].filter(Boolean);

    events.push({
      id: `inspect-${receipt.id}`,
      title: 'Warehouse inspected',
      detail: detailParts.length > 0 ? detailParts.join(' · ') : null,
      outcomes,
      at: receipt.received_at,
    });
  }

  if (input.status === 'partially_received') {
    events.push({
      id: 'awaiting-more-inspect',
      title: 'Partially inspected',
      detail: 'Some qty still awaiting warehouse inspect',
      at: null,
    });
  } else if (input.status === 'fully_received') {
    events.push({
      id: 'fully-inspected',
      title: 'Fully inspected',
      detail:
        input.returnType === 'item_disposal'
          ? 'All returned qty sent to Disposal log'
          : 'All returned qty posted to warehouse inventory and/or disposal',
      at: receipts.length > 0 ? receipts[receipts.length - 1]?.received_at ?? null : null,
    });
  }

  if (input.status === 'cancelled' || input.cancelledAt) {
    events.push({
      id: 'cancelled',
      title: 'Cancelled / rejected',
      detail: input.cancelledByName ? `By ${input.cancelledByName}` : null,
      at: input.cancelledAt,
    });
  }

  return events;
}

export function formatSaReturnTimelineAt(at: string | null | undefined): string {
  if (!at) return 'Pending';
  try {
    return format(new Date(at), 'MMM d, yyyy · h:mm a');
  } catch {
    return '—';
  }
}
