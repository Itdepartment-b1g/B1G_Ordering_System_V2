import { useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  applyStockBoardSettings,
  fetchMainWarehouseStockBoard,
  fetchLocationWarehouseStockBoard,
  fetchSubWarehouseUserStockBoard,
  fetchWarehouseStockBoardSettings,
  finalizeStockBoardBrands,
  WAREHOUSE_STOCK_BOARD_QUERY_KEY,
  WAREHOUSE_STOCK_BOARD_SETTINGS_QUERY_KEY,
  type StockBoardViewMode,
  type WarehouseStockBoardSettings,
} from './warehouseStockBoard';
import type { Brand } from './InventoryContext';

/** Cache window for fast tab switches; realtime + manual refresh still update immediately. */
const STOCK_BOARD_STALE_TIME_MS = 2 * 60 * 1000;

export type WarehouseStockBoardScope =
  | { kind: 'main'; mode: 'available' | 'overall' }
  | { kind: 'sub'; locationId: string };

function scopeKey(scope: WarehouseStockBoardScope | null): string {
  if (!scope) return 'none';
  if (scope.kind === 'main') return `main:${scope.mode}`;
  return `sub:${scope.locationId}`;
}

export function useWarehouseStockBoardSettings({
  companyId,
  enabled = true,
}: {
  companyId?: string;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: [WAREHOUSE_STOCK_BOARD_SETTINGS_QUERY_KEY, companyId],
    enabled: enabled && !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchWarehouseStockBoardSettings(companyId!),
  });
}

export function useWarehouseStockBoard({
  companyId,
  userId,
  membershipStatus,
  scope,
  settings,
  enabled = true,
}: {
  companyId?: string;
  userId?: string;
  membershipStatus?: string;
  scope: WarehouseStockBoardScope | null;
  settings: WarehouseStockBoardSettings;
  enabled?: boolean;
}) {
  const qc = useQueryClient();
  const scopeCacheKey = scopeKey(scope);

  const query = useQuery({
    queryKey: [WAREHOUSE_STOCK_BOARD_QUERY_KEY, companyId, userId, membershipStatus, scopeCacheKey],
    enabled: enabled && !!companyId && !!scope,
    staleTime: STOCK_BOARD_STALE_TIME_MS,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<Brand[]> => {
      if (!companyId || !scope) return [];

      let brands: Brand[];
      if (membershipStatus === 'sub') {
        brands = await fetchSubWarehouseUserStockBoard(companyId);
      } else if (scope.kind === 'sub') {
        brands = await fetchLocationWarehouseStockBoard(companyId, scope.locationId);
      } else {
        brands = await fetchMainWarehouseStockBoard(companyId);
      }

      return finalizeStockBoardBrands(brands);
    },
  });

  useEffect(() => {
    if (!enabled || !companyId) return;

    const channel = supabase
      .channel(`warehouse-stock-board-${companyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'main_inventory' }, () => {
        void qc.invalidateQueries({ queryKey: [WAREHOUSE_STOCK_BOARD_QUERY_KEY, companyId] });
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'warehouse_location_inventory' },
        () => {
          void qc.invalidateQueries({ queryKey: [WAREHOUSE_STOCK_BOARD_QUERY_KEY, companyId] });
        }
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'brands' }, () => {
        void qc.invalidateQueries({ queryKey: [WAREHOUSE_STOCK_BOARD_QUERY_KEY, companyId] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'variants' }, () => {
        void qc.invalidateQueries({ queryKey: [WAREHOUSE_STOCK_BOARD_QUERY_KEY, companyId] });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [companyId, enabled, qc]);

  const viewMode: StockBoardViewMode = useMemo(() => {
    if (!scope) return 'available';
    if (scope.kind === 'sub') return 'sub';
    return scope.mode;
  }, [scope]);

  const brands = useMemo(() => {
    if (!query.data) return [];
    const isMainWarehouseUser = membershipStatus !== 'sub';
    return applyStockBoardSettings(query.data, settings, {
      mode: viewMode,
      isMainWarehouseUser,
    });
  }, [query.data, settings, viewMode, membershipStatus]);

  return {
    brands,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
    viewMode,
  };
}

export function useUpdateWarehouseStockBoardSettings() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      companyId,
      settings,
    }: {
      companyId: string;
      settings: WarehouseStockBoardSettings;
    }) => {
      const { data, error } = await supabase.rpc('upsert_warehouse_stock_board_settings', {
        p_low_stock_threshold: settings.lowStockThreshold,
        p_use_per_sku_reorder_level: settings.usePerSkuReorderLevel,
        p_color_out_of_stock: settings.colors.outOfStock,
        p_color_out_of_stock_text: settings.colors.outOfStockText,
        p_color_low_stock: settings.colors.lowStock,
        p_color_low_stock_text: settings.colors.lowStockText,
        p_color_in_stock: settings.colors.inStock,
        p_color_in_stock_text: settings.colors.inStockText,
      });

      if (error) throw error;
      const result = data as { success?: boolean; message?: string } | null;
      if (!result?.success) {
        throw new Error(result?.message || 'Failed to save stock board settings');
      }

      return settings;
    },
    onSuccess: (settings, { companyId }) => {
      qc.setQueryData([WAREHOUSE_STOCK_BOARD_SETTINGS_QUERY_KEY, companyId], settings);
    },
  });
}

export async function invalidateWarehouseStockBoard(
  qc: ReturnType<typeof useQueryClient>,
  companyId?: string
) {
  await qc.invalidateQueries({
    queryKey: companyId
      ? [WAREHOUSE_STOCK_BOARD_QUERY_KEY, companyId]
      : [WAREHOUSE_STOCK_BOARD_QUERY_KEY],
  });
}
