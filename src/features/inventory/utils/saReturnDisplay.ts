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
  at: string | null;
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
  receipts?: Array<{ id: string; received_at: string; receivedByName?: string | null }>;
}): SaReturnTimelineEvent[] {
  const events: SaReturnTimelineEvent[] = [
    {
      id: 'submitted',
      title: 'Submitted',
      detail: input.createdByName
        ? `By ${input.createdByName}`
        : input.sourceAgentName
          ? `By ${input.sourceAgentName}`
          : null,
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

  for (const receipt of input.receipts ?? []) {
    events.push({
      id: `inspect-${receipt.id}`,
      title: 'Warehouse inspected',
      detail: receipt.receivedByName ? `By ${receipt.receivedByName}` : null,
      at: receipt.received_at,
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
