import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/store';
import {
  fetchWarehouseBatchViewLocations,
  type WarehouseLocationOption,
} from '@/store/slices/warehouse/batch-view';

export type { WarehouseLocationOption };

export function useWarehouseLocations(companyId?: string, enabled = true) {
  const dispatch = useAppDispatch();
  const { locations, locationsStatus, locationsError } = useAppSelector(
    (state) => state.warehouseBatchView
  );

  useEffect(() => {
    if (!enabled || !companyId) return;
    void dispatch(fetchWarehouseBatchViewLocations());
  }, [dispatch, enabled, companyId]);

  const isLoading =
    locationsStatus === 'loading' || (locationsStatus === 'idle' && enabled && !!companyId);

  return {
    data: locations,
    isLoading,
    error: locationsError ? new Error(locationsError) : null,
  };
}
