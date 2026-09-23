import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/store';
import {
  fetchWarehouseBatchInventory,
  type BatchInventoryGroup,
} from '@/store/slices/warehouse/batch-view';

export function useWarehouseBatchInventory({
  companyId,
  locationId,
  enabled,
}: {
  companyId?: string;
  locationId?: string | null;
  enabled: boolean;
}): {
  data: BatchInventoryGroup[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
} {
  const dispatch = useAppDispatch();
  const {
    groups,
    locationId: loadedLocationId,
    status,
    error,
  } = useAppSelector((state) => state.warehouseBatchView);

  useEffect(() => {
    if (!enabled || !companyId || !locationId) return;
    void dispatch(fetchWarehouseBatchInventory(locationId));
  }, [dispatch, enabled, companyId, locationId]);

  const matching = loadedLocationId === locationId;
  const isFetching = status === 'loading' && matching;
  const isLoading =
    !!enabled &&
    !!locationId &&
    ((status === 'loading' && (!matching || groups.length === 0)) ||
      (status === 'idle' && !!companyId) ||
      (status === 'succeeded' && !matching));

  return {
    data: matching ? groups : [],
    isLoading,
    isFetching,
    isError: status === 'failed' && matching,
    error: status === 'failed' && matching && error ? new Error(error) : null,
    refetch: () =>
      locationId
        ? dispatch(fetchWarehouseBatchInventory(locationId))
        : Promise.resolve(),
  };
}
