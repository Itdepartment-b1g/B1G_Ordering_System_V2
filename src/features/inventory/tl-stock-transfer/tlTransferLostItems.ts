import { useEffect } from 'react';
import { useAuth } from '@/features/auth';
import { isDateInRange } from '@/lib/dateRangePresets';
import { formatShortfallReasonLabel } from '@/features/orders/deliveryDiscrepancyShared';
import { useAppDispatch, useAppSelector } from '@/store/store';
import { fetchTlLostLines } from '@/store/slices/motosales/tl-stock-transfers';
import type {
  TLDiscrepancyStatus,
  TLReceiveShortfallReason,
} from '@/types/tlStockRequests.types';
import { tlShortageStatusLabel } from './tlStockTransferShared';
import type { TlTransferDateRange } from './tlStockTransferListHelpers';

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

function isMissingStatus(status: TLDiscrepancyStatus | string): boolean {
  return status === 'open';
}

function isLostStatus(status: TLDiscrepancyStatus | string): boolean {
  return status === 'resolved_write_off' || status === 'resolved_write_off_replace';
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
  const dispatch = useAppDispatch();
  const { user } = useAuth();
  const lines = useAppSelector((state) => state.motoSalesTlTransfers.lostLines);

  useEffect(() => {
    if (!user?.company_id || !user?.id) return;
    void dispatch(fetchTlLostLines());
  }, [dispatch, user?.company_id, user?.id]);

  return groupTlLostItems(lines).length;
}
