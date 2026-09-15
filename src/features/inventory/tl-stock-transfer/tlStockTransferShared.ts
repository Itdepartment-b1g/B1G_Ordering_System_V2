import type {
  TLDiscrepancyResolution,
  TLDiscrepancyStatus,
  TLDispatchShortfallReason,
  TLReceiveShortfallReason,
  TLRequestStatus,
  TLRequestWithDetails,
} from '@/types/tlStockRequests.types';
import { SHORTFALL_REASON_OPTIONS } from '@/features/orders/deliveryDiscrepancyShared';

export const TL_DISPATCH_SHORTFALL_OPTIONS: {
  value: TLDispatchShortfallReason;
  label: string;
}[] = [
  { value: 'insufficient_stock', label: 'Not enough stock on hand' },
  { value: 'reserved_for_team', label: 'Keeping stock for my team' },
  { value: 'damaged_on_hand', label: 'Units damaged / unsellable' },
  { value: 'other', label: 'Other' },
];

export const TL_DISPATCH_SHORTFALL_LABELS: Record<TLDispatchShortfallReason, string> = {
  insufficient_stock: 'Not enough stock on hand',
  reserved_for_team: 'Keeping stock for my team',
  damaged_on_hand: 'Units damaged / unsellable',
  other: 'Other',
};

export const TL_RECEIVE_SHORTFALL_OPTIONS = SHORTFALL_REASON_OPTIONS;
export type { TLReceiveShortfallReason };

export const TL_TRANSFER_RESOLUTION_OPTIONS: {
  value: TLDiscrepancyResolution;
  label: string;
  description: string;
}[] = [
  {
    value: 'redeliver',
    label: 'Found → dispatch again',
    description:
      'The missing units return to your inventory. Dispatch them again from Incoming (photos, signature, new TDR).',
  },
  {
    value: 'found_keep',
    label: 'Found → keep',
    description:
      'The missing units return to your inventory and stay with you. The requester does not get them. Transfer stays incomplete. This is not a write-off — the stock is not lost.',
  },
  {
    value: 'write_off_replace',
    label: 'Lost → write off & dispatch replacement (new TDR)',
    description:
      'Confirm the loss, deduct replacement units from your stock, and issue a new TDR. The other TL will receive the replacement.',
  },
  {
    value: 'write_off',
    label: 'Lost → write off only',
    description: 'Confirm the loss. Stock does not return to you. Transfer stays incomplete.',
  },
];

export function tlShortageStatusLabel(status: TLDiscrepancyStatus | string): string {
  switch (status) {
    case 'open':
      return 'Open';
    case 'resolved_redeliver':
      return 'Found · dispatch again';
    case 'resolved_found_keep':
      return 'Found · kept';
    case 'resolved_write_off':
      return 'Written off';
    case 'resolved_write_off_replace':
      return 'Replaced';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status;
  }
}

function mapVariant(variant: any) {
  return {
    id: variant?.id,
    name: variant?.name,
    type: variant?.variant_type ?? variant?.type,
    brand_id: variant?.brand_id,
    brand_name: variant?.brand?.name ?? variant?.brand_name,
  };
}

function mapProofUrls(value: unknown): string[] {
  return Array.isArray(value) ? value : [];
}

export function mapTlRequestRow(req: any): TLRequestWithDetails {
  const item = Array.isArray(req.items) && req.items.length === 1 ? req.items[0] : req;
  return {
    ...req,
    ...item,
    id: item?.id ?? req.id,
    request_id: req.request_id ?? (Array.isArray(req.items) ? req.id : req.request_id ?? req.id),
    written_off_quantity: Number(item?.written_off_quantity ?? req.written_off_quantity ?? 0),
    receive_proof_urls: mapProofUrls(req.receive_proof_urls),
    dispatch_proof_urls: mapProofUrls(req.dispatch_proof_urls),
    variant: mapVariant(item?.variant ?? req.variant),
  } as TLRequestWithDetails;
}

export function mapTlTransferRows(rows: any[]): TLRequestWithDetails[] {
  return (rows || []).flatMap((header) => {
    const items = Array.isArray(header.items) ? header.items : [];
    if (items.length === 0) {
      if (header.variant_id) return [mapTlRequestRow(header)];
      return [
        mapTlRequestRow({
          ...header,
          requested_quantity: Number(header.requested_quantity || 0),
          variant: header.variant ?? { id: '', name: '—', type: '', brand_name: '', brand_id: '' },
        }),
      ];
    }
    const {
      items: _nestedItems,
      variant: _headerVariant,
      ...headerFields
    } = header;
    return items.map((item: any) =>
      mapTlRequestRow({
        ...headerFields,
        ...item,
        request_id: header.id,
        id: item.id,
        status: item.status || header.status,
        requester_notes: header.requester_notes,
        admin_notes: header.admin_notes,
        source_tl_notes: header.source_tl_notes,
        tdr_number: header.tdr_number,
        tdrs: Array.isArray(header.tdrs) ? header.tdrs : [],
        requester: header.requester,
        source: header.source,
        variant: item.variant,
      })
    );
  });
}

export const TL_REQUEST_SELECT = `
  *,
  requester:profiles!requester_leader_id(id, full_name, region, email),
  source:profiles!source_leader_id(id, full_name, region, email),
  tdrs:tl_stock_request_tdrs(tdr_number, kind, created_at),
  items:tl_stock_request_items(
    *,
    variant:variants(
      id,
      name,
      variant_type,
      brand_id,
      brand:brands(name)
    )
  )
`;

export function tlDispatchedQty(request: {
  dispatched_quantity?: number | null;
  admin_approved_quantity?: number | null;
  requested_quantity: number;
}): number {
  return Number(
    request.dispatched_quantity ?? request.admin_approved_quantity ?? request.requested_quantity ?? 0
  );
}

export function tlRemainingToReceive(request: {
  dispatched_quantity?: number | null;
  admin_approved_quantity?: number | null;
  requested_quantity: number;
  received_quantity?: number | null;
  written_off_quantity?: number | null;
}): number {
  return Math.max(
    0,
    tlDispatchedQty(request) -
      Number(request.received_quantity || 0) -
      Number(request.written_off_quantity || 0)
  );
}

export function tlRemainingToDispatch(request: {
  dispatched_quantity?: number | null;
  admin_approved_quantity?: number | null;
  requested_quantity: number;
}): number {
  const approved = Number(request.admin_approved_quantity ?? request.requested_quantity ?? 0);
  return Math.max(0, approved - Number(request.dispatched_quantity || 0));
}

export function tlDispatchShortfallSummary(line: {
  requested_quantity: number;
  admin_approved_quantity?: number | null;
  dispatched_quantity?: number | null;
  dispatch_shortfall_reason?: TLDispatchShortfallReason | null;
  source_tl_notes?: string | null;
}) {
  const requested = Number(line.requested_quantity || 0);
  const approved = Number(line.admin_approved_quantity ?? requested);
  const dispatched = line.dispatched_quantity == null ? null : Number(line.dispatched_quantity);
  const isShort = dispatched != null && dispatched < approved;
  if (!isShort) {
    return null;
  }
  return {
    requested,
    approved,
    dispatched,
    short: Math.max(0, approved - dispatched),
    reasonLabel: line.dispatch_shortfall_reason
      ? TL_DISPATCH_SHORTFALL_LABELS[line.dispatch_shortfall_reason]
      : null,
    notes: line.source_tl_notes?.trim() || null,
  };
}

export function tlTdrKindLabel(kind: string) {
  switch (kind) {
    case 'redeliver':
      return 'Redeliver';
    case 'replace':
      return 'Replace';
    default:
      return 'Dispatch';
  }
}

export function tlStatusLabel(status: TLRequestStatus | string): string {
  switch (status) {
    case 'pending_admin':
      return 'Pending Super Admin';
    case 'pending_source_tl':
    case 'admin_approved':
      return 'Awaiting dispatch';
    case 'pending_receipt':
      return 'In transit';
    case 'completed':
      return 'Completed';
    case 'incomplete':
      return 'Incomplete';
    case 'admin_rejected':
    case 'source_tl_rejected':
      return 'Rejected';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status;
  }
}

/** Same priority as `_tl_refresh_request_status`: open work beats completed. */
export function tlRollupItemStatus(
  items: Array<{ status?: string | null }>
): TLRequestStatus | string {
  const statuses = items.map((item) => item.status || '');
  if (statuses.some((status) => status === 'admin_rejected')) return 'admin_rejected';
  if (statuses.some((status) => status === 'source_tl_rejected')) return 'source_tl_rejected';
  if (statuses.some((status) => status === 'cancelled')) return 'cancelled';
  if (statuses.some((status) => status === 'pending_admin')) return 'pending_admin';
  if (statuses.some((status) => status === 'pending_source_tl' || status === 'admin_approved')) {
    return 'pending_source_tl';
  }
  if (statuses.some((status) => status === 'pending_receipt' || status === 'source_tl_approved')) {
    return 'pending_receipt';
  }
  if (statuses.some((status) => status === 'incomplete')) return 'incomplete';
  if (statuses.length > 0 && statuses.every((status) => status === 'completed')) return 'completed';
  return statuses[0] || 'incomplete';
}

export type TLRequestGroup = {
  request_number: string;
  items: TLRequestWithDetails[];
  status: TLRequestStatus | string;
  created_at: string;
  requester: TLRequestWithDetails['requester'];
  source: TLRequestWithDetails['source'];
  requester_notes: string | null;
  admin_notes: string | null;
  rejection_reason: string | null;
  tdr_number: string | null;
  totalRequested: number;
  totalDispatched: number;
  totalReceived: number;
};

export function invalidateTlTransferQueries(queryClient: {
  invalidateQueries: (opts: { queryKey: unknown[] }) => unknown;
}) {
  queryClient.invalidateQueries({ queryKey: ['my-tl-requests'] });
  queryClient.invalidateQueries({ queryKey: ['incoming-tl-requests'] });
  queryClient.invalidateQueries({ queryKey: ['dispatched-tl-requests'] });
  queryClient.invalidateQueries({ queryKey: ['admin-tl-requests'] });
}

export function groupTlRequests(rows: TLRequestWithDetails[]): TLRequestGroup[] {
  const map = new Map<string, TLRequestWithDetails[]>();
  for (const row of rows) {
    const key = row.request_number || row.id;
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }

  return [...map.entries()]
    .map(([request_number, items]) => {
      const first = items[0];
      return {
        request_number,
        items,
        status: tlRollupItemStatus(items),
        created_at: first.created_at,
        requester: first.requester,
        source: first.source,
        requester_notes: items.find((item) => item.requester_notes)?.requester_notes ?? null,
        admin_notes: items.find((item) => item.admin_notes)?.admin_notes ?? null,
        rejection_reason: items.find((item) => item.rejection_reason)?.rejection_reason ?? null,
        tdr_number:
          items.find((item) => item.tdr_number)?.tdr_number ??
          first.tdr_number ??
          null,
        totalRequested: items.reduce((sum, item) => sum + Number(item.requested_quantity || 0), 0),
        totalDispatched: items.reduce((sum, item) => sum + Number(item.dispatched_quantity || 0), 0),
        totalReceived: items.reduce((sum, item) => sum + Number(item.received_quantity || 0), 0),
      };
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}
