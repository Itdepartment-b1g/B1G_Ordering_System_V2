/**
 * Live refresh for TL stock transfer lists (Incoming, My transfers, shortages).
 *
 * Filtered postgres_changes on header.status / source_leader_id often drops UPDATEs
 * (replica identity + RLS). Item status changes (Found / Replace reopening Incoming)
 * also never hit a header-only subscription.
 */
import { useEffect, useRef } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { TL_REQUEST_SELECT, mapTlTransferRows, tlRemainingToDispatch } from './tlStockTransferShared';

const TL_TRANSFER_TABLES = [
  'tl_stock_requests',
  'tl_stock_request_items',
  'tl_stock_request_tdrs',
  'tl_stock_request_discrepancies',
] as const;

export async function fetchIncomingTlTransfers(sourceLeaderId: string) {
  const { data, error } = await supabase
    .from('tl_stock_requests')
    .select(TL_REQUEST_SELECT)
    .eq('source_leader_id', sourceLeaderId)
    .in('status', ['pending_source_tl', 'admin_approved', 'pending_receipt'])
    .order('created_at', { ascending: false });
  if (error) throw error;
  return mapTlTransferRows(data || []).filter(
    (row) =>
      row.status === 'pending_source_tl' ||
      row.status === 'admin_approved' ||
      tlRemainingToDispatch(row) > 0
  );
}

export function refetchTlTransferLists(queryClient: QueryClient): Promise<void> {
  return Promise.all([
    queryClient.refetchQueries({ queryKey: ['incoming-tl-requests'] }),
    queryClient.invalidateQueries({ queryKey: ['my-tl-requests'] }),
    queryClient.invalidateQueries({ queryKey: ['dispatched-tl-requests'] }),
    queryClient.invalidateQueries({ queryKey: ['admin-tl-requests'] }),
    queryClient.invalidateQueries({ queryKey: ['tl-transfer-shortages'] }),
    queryClient.invalidateQueries({ queryKey: ['tl-transfer-lost-items'] }),
  ]).then(() => undefined);
}

export function useTlTransferRealtime(options: {
  enabled?: boolean;
  companyId?: string | null;
  channelKey?: string;
}): void {
  const queryClient = useQueryClient();
  const { enabled = true, companyId, channelKey = 'default' } = options;
  const refetchRef = useRef<() => void>(() => {});

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    refetchRef.current = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void refetchTlTransferLists(queryClient);
      }, 80);
    };
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [queryClient]);

  useEffect(() => {
    if (!enabled || !companyId) return;

    const scheduleRefetch = () => refetchRef.current();

    const pgCh = supabase.channel(`tl-transfer-pg-${companyId}-${channelKey}`);
    for (const table of TL_TRANSFER_TABLES) {
      pgCh.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        (payload) => {
          const row = (payload.new ?? payload.old) as { company_id?: string } | null;
          if (row?.company_id && row.company_id !== companyId) return;
          scheduleRefetch();
        }
      );
    }
    pgCh.subscribe();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') scheduleRefetch();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      void supabase.removeChannel(pgCh);
    };
  }, [enabled, companyId, channelKey]);
}
