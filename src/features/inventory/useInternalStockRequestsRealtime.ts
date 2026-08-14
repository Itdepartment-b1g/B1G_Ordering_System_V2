/**
 * Live refresh for internal stock request lists (main + sub warehouse).
 *
 * Uses three mechanisms (postgres_changes alone is unreliable with RLS filters):
 * 1) Broadcast — instant notify after local mutations (cross-tab / cross-user same company)
 * 2) postgres_changes — no server filter; client filters by company / location
 * 3) Visibility polling — fallback every few seconds while the tab is visible
 */
import { useEffect, useRef } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { INTERNAL_STOCK_REQUESTS_QUERY_KEY } from './internalStockRequestsApi';

const BROADCAST_EVENT = 'isr-changed';
const POLL_MS = 8_000;

type UseInternalStockRequestsRealtimeOptions = {
  enabled?: boolean;
  companyId?: string | null;
  /** When set (sub warehouse), ignore rows for other locations. */
  fromLocationId?: string | null;
};

function broadcastChannelName(companyId: string): string {
  return `isr-company-${companyId}`;
}

export async function broadcastInternalStockRequestsChanged(
  companyId: string | null | undefined
): Promise<void> {
  if (!companyId) return;
  const channel = supabase.channel(broadcastChannelName(companyId), {
    config: { broadcast: { self: false } },
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => resolve(), 1500);
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timeout);
          void channel
            .send({
              type: 'broadcast',
              event: BROADCAST_EVENT,
              payload: { at: Date.now() },
            })
            .then(() => resolve())
            .catch(reject);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
  } catch (e) {
    console.warn('[internal-stock-requests] broadcast failed', e);
  } finally {
    void supabase.removeChannel(channel);
  }
}

export function refetchInternalStockRequestLists(queryClient: QueryClient): Promise<void> {
  return queryClient
    .refetchQueries({
      queryKey: [INTERNAL_STOCK_REQUESTS_QUERY_KEY],
      type: 'active',
    })
    .then(() => undefined);
}

export function useInternalStockRequestsRealtime(
  options: UseInternalStockRequestsRealtimeOptions
): void {
  const queryClient = useQueryClient();
  const { enabled = true, companyId, fromLocationId } = options;
  const refetchRef = useRef<() => void>(() => {});

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    refetchRef.current = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void refetchInternalStockRequestLists(queryClient);
      }, 50);
    };
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [queryClient]);

  useEffect(() => {
    if (!enabled || !companyId) return;

    const scheduleRefetch = () => refetchRef.current();

    // 1) Broadcast (reliable across clients after mutations)
    const broadcastCh = supabase
      .channel(broadcastChannelName(companyId))
      .on('broadcast', { event: BROADCAST_EVENT }, () => scheduleRefetch())
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[internal-stock-requests] broadcast subscribe failed:', status);
        }
      });

    // 2) postgres_changes — no filter (filters + RLS often yield silent empty streams)
    const pgCh = supabase
      .channel(`internal-stock-requests-pg-${companyId}-${fromLocationId || 'main'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'internal_stock_requests',
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as {
            company_id?: string;
            from_location_id?: string;
          } | null;
          if (row?.company_id && row.company_id !== companyId) return;
          if (fromLocationId && row?.from_location_id && row.from_location_id !== fromLocationId) {
            return;
          }
          scheduleRefetch();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[internal-stock-requests] postgres_changes subscribed');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[internal-stock-requests] postgres_changes failed:', status);
        }
      });

    // 3) Polling fallback while tab visible
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    const startPoll = () => {
      if (pollTimer) return;
      pollTimer = setInterval(() => {
        if (document.visibilityState === 'visible') scheduleRefetch();
      }, POLL_MS);
    };
    const stopPoll = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        scheduleRefetch();
        startPoll();
      } else {
        stopPoll();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    startPoll();

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stopPoll();
      void supabase.removeChannel(broadcastCh);
      void supabase.removeChannel(pgCh);
    };
  }, [enabled, companyId, fromLocationId]);
}
