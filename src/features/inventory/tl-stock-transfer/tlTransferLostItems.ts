import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import { isDateInRange } from '@/lib/dateRangePresets';
import { formatShortfallReasonLabel } from '@/features/orders/deliveryDiscrepancyShared';
import type {
  TLDiscrepancyStatus,
  TLReceiveShortfallReason,
} from '@/types/tlStockRequests.types';
import { tlShortageStatusLabel } from './tlStockTransferShared';
import type { TlTransferDateRange } from './tlStockTransferListHelpers';

export const TL_LOST_ITEM_QUERY_KEY = 'tl-transfer-lost-items';

const TRACKED_STATUSES: TLDiscrepancyStatus[] = [
  'open',
  'resolved_write_off',
  'resolved_write_off_replace',
];

export type TlLostTransferLine = {
  id: string;
  requestId: string;
  requestNumber: string;
  tdrNumber: string;
  quantity: number;
  reason: TLReceiveShortfallReason;
  reporterNotes: string | null;
  status: TLDiscrepancyStatus;
  createdAt: string;
  resolvedAt: string | null;
  requesterName: string;
  sourceName: string;
  sourceLeaderId: string;
  requesterLeaderId: string;
  variantId: string;
  brandName: string;
  variantName: string;
  variantType: string;
};

export type TlLostItemGroup = {
  variantId: string;
  brandName: string;
  variantName: string;
  variantType: string;
  missingQuantity: number;
  lostQuantity: number;
  transferCount: number;
  lastAt: string;
  transfers: TlLostTransferLine[];
};

function profileName(value: unknown): string {
  if (Array.isArray(value)) return value[0]?.full_name || '';
  if (value && typeof value === 'object' && 'full_name' in value) {
    return String((value as { full_name?: string | null }).full_name || '');
  }
  return '';
}

function isMissingStatus(status: TLDiscrepancyStatus | string): boolean {
  return status === 'open';
}

function isLostStatus(status: TLDiscrepancyStatus | string): boolean {
  return status === 'resolved_write_off' || status === 'resolved_write_off_replace';
}

export async function fetchTlTransferLostLines(options: {
  companyId: string;
  userId: string;
}): Promise<TlLostTransferLine[]> {
    const { data, error } = await supabase
      .from('tl_stock_request_discrepancies')
      .select(
        `
        id,
        request_id,
        variant_id,
        quantity,
        reason,
        reporter_notes,
        status,
        created_at,
        resolved_at,
        request:tl_stock_requests(
          request_number,
          tdr_number,
          source_leader_id,
          requester_leader_id,
          requester:profiles!requester_leader_id(full_name),
          source:profiles!source_leader_id(full_name)
        ),
        item:tl_stock_request_items(
          variant:variants(id, name, variant_type, brand:brands(name))
        )
      `
      )
      .eq('company_id', options.companyId)
      .in('status', TRACKED_STATUSES)
      .order('created_at', { ascending: false });
    if (error) throw error;

    return (data || []).flatMap((row: any) => {
      const request = row.request;
      const sourceLeaderId = request?.source_leader_id || '';
      const requesterLeaderId = request?.requester_leader_id || '';
      if (sourceLeaderId !== options.userId && requesterLeaderId !== options.userId) {
        return [];
      }

      const variant = row.item?.variant;
      const line: TlLostTransferLine = {
        id: row.id,
        requestId: row.request_id,
        requestNumber: request?.request_number || '',
        tdrNumber: request?.tdr_number || '',
        quantity: Number(row.quantity || 0),
        reason: row.reason as TLReceiveShortfallReason,
        reporterNotes: row.reporter_notes,
        status: row.status as TLDiscrepancyStatus,
        createdAt: row.created_at,
        resolvedAt: row.resolved_at,
        requesterName: profileName(request?.requester),
        sourceName: profileName(request?.source),
        sourceLeaderId,
        requesterLeaderId,
        variantId: variant?.id || row.variant_id || '',
        brandName: variant?.brand?.name || '',
        variantName: variant?.name || '',
        variantType: variant?.variant_type || variant?.type || '',
      };
      return [line];
    });
}

export function groupTlLostItems(lines: TlLostTransferLine[]): TlLostItemGroup[] {
  const map = new Map<string, TlLostTransferLine[]>();
  for (const line of lines) {
    const key = line.variantId || `${line.brandName}::${line.variantName}`;
    const list = map.get(key) ?? [];
    list.push(line);
    map.set(key, list);
  }

  return [...map.entries()]
    .map(([variantId, groupLines]) => {
      const first = groupLines[0];
      const transfers = [...groupLines].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      return {
        variantId,
        brandName: first.brandName,
        variantName: first.variantName,
        variantType: first.variantType,
        missingQuantity: transfers
          .filter((line) => isMissingStatus(line.status))
          .reduce((sum, line) => sum + line.quantity, 0),
        lostQuantity: transfers
          .filter((line) => isLostStatus(line.status))
          .reduce((sum, line) => sum + line.quantity, 0),
        transferCount: new Set(transfers.map((line) => line.requestNumber || line.requestId)).size,
        lastAt: transfers[0]?.createdAt || first.createdAt,
        transfers,
      };
    })
    .sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
}

export function lostItemLabel(group: Pick<TlLostItemGroup, 'brandName' | 'variantName'>): string {
  return [group.brandName, group.variantName].filter(Boolean).join(' · ') || 'Item';
}

export function filterTlLostItemGroups(
  groups: TlLostItemGroup[],
  searchQuery: string,
  dateRange: TlTransferDateRange
): TlLostItemGroup[] {
  const q = searchQuery.trim().toLowerCase();
  return groups
    .map((group) => {
      const transfers = group.transfers.filter((line) =>
        isDateInRange(line.createdAt, dateRange.start, dateRange.end)
      );
      if (transfers.length === 0) return null;
      const filtered: TlLostItemGroup = {
        ...group,
        transfers,
        missingQuantity: transfers
          .filter((line) => isMissingStatus(line.status))
          .reduce((sum, line) => sum + line.quantity, 0),
        lostQuantity: transfers
          .filter((line) => isLostStatus(line.status))
          .reduce((sum, line) => sum + line.quantity, 0),
        transferCount: new Set(transfers.map((line) => line.requestNumber || line.requestId)).size,
        lastAt: transfers[0]?.createdAt || group.lastAt,
      };
      if (!q) return filtered;
      const haystack = [
        lostItemLabel(filtered),
        filtered.variantType,
        ...filtered.transfers.flatMap((line) => [
          line.requestNumber,
          line.tdrNumber,
          line.requesterName,
          line.sourceName,
          formatShortfallReasonLabel(line.reason, line.reporterNotes),
          tlShortageStatusLabel(line.status),
          line.status,
        ]),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q) ? filtered : null;
    })
    .filter((group): group is TlLostItemGroup => !!group);
}

export function lostLineStatusLabel(status: TLDiscrepancyStatus | string): string {
  switch (status) {
    case 'open':
      return 'Missing · under investigation';
    case 'resolved_write_off':
      return 'Lost · written off';
    case 'resolved_write_off_replace':
      return 'Lost · written off & replaced';
    default:
      return tlShortageStatusLabel(status);
  }
}

export function useTlLostItemTabCount() {
  const { user } = useAuth();
  const { data: lines = [] } = useQuery({
    queryKey: [TL_LOST_ITEM_QUERY_KEY, user?.company_id, user?.id],
    enabled: !!user?.company_id && !!user?.id,
    staleTime: 0,
    queryFn: () =>
      fetchTlTransferLostLines({
        companyId: user!.company_id!,
        userId: user!.id,
      }),
  });
  return groupTlLostItems(lines).length;
}
