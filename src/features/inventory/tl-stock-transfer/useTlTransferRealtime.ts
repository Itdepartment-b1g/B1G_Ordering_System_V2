/**
 * Live refresh for TL stock transfer lists (Incoming, My transfers, shortages).
 *
 * Filtered postgres_changes on header.status / source_leader_id often drops UPDATEs
 * (replica identity + RLS). Item status changes (Found / Replace reopening Incoming)
 * also never hit a header-only subscription. The channel stays on Supabase; list
 * data is refetched through /api/motosales/tl-stock-transfers.
 */
import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { useAppDispatch } from '@/store/store';
import {
  refreshTlTransferLists,
  type TlTransferListName,
} from '@/store/slices/motosales/tl-stock-transfers';

const TL_TRANSFER_TABLES = [
  'tl_stock_requests',
  'tl_stock_request_items',
  'tl_stock_request_tdrs',
  'tl_stock_request_discrepancies',
] as const;

const LEADER_LISTS: TlTransferListName[] = [
  'mine',
  'incoming',
  'dispatched',
  'shortages',
  'lost',
];

export function useTlTransferRealtime(options: {
  enabled?: boolean;
  companyId?: string | null;
  channelKey?: string;
  lists?: TlTransferListName[];
}): void {
  const dispatch = useAppDispatch();
  const { user } = useAuth();
  const { enabled = true, companyId, channelKey = 'default', lists } = options;
  const includeAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const listsKey = (lists ?? (includeAdmin ? ['admin'] : LEADER_LISTS)).join(',');
  const refetchRef = useRef<() => void>(() => {});
  const aliveRef = useRef(false);

  useEffect(() => {
    aliveRef.current = !!enabled && !!companyId && !!user;
    return () => {
      aliveRef.current = false;
    };
  }, [enabled, companyId, user]);

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const refreshLists = listsKey.split(',').filter(Boolean) as TlTransferListName[];
    refetchRef.current = () => {
      if (!aliveRef.current) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (!aliveRef.current) return;
        void refreshTlTransferLists(dispatch, {
          lists: refreshLists,
          companyId: user?.company_id,
        });
      }, 80);
    };
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [dispatch, listsKey, user?.company_id]);

  useEffect(() => {
    if (!enabled || !companyId) return;

    const scheduleRefetch = () => {
      if (!aliveRef.current) return;
      refetchRef.current();
    };

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
      aliveRef.current = false;
      document.removeEventListener('visibilitychange', onVisibility);
      void supabase.removeChannel(pgCh);
    };
  }, [enabled, companyId, channelKey]);
}
