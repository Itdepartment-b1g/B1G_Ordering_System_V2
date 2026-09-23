import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/store';
import {
  fetchWarehouseMembership,
  type WarehouseMembership,
  type WarehouseMembershipStatus,
} from '@/store/slices/warehouse/locations';

export type { WarehouseMembershipStatus, WarehouseMembership };

type MembershipParams = {
  userId?: string | null;
  isWarehouse?: boolean;
};

export function useWarehouseLocationMembership({ userId, isWarehouse }: MembershipParams): {
  membership: WarehouseMembership;
  isLoading: boolean;
  error: Error | null;
} {
  const dispatch = useAppDispatch();
  const { membership, membershipStatus, membershipError } = useAppSelector(
    (state) => state.warehouseLocations
  );

  useEffect(() => {
    if (!userId || !isWarehouse) return;
    void dispatch(fetchWarehouseMembership());
  }, [dispatch, userId, isWarehouse]);

  // Non-warehouse users: treat as unlinked (main=true doesn't matter; pages gate by role).
  if (!isWarehouse) {
    return {
      membership: { status: 'unlinked', isMain: true, locationId: null },
      isLoading: false,
      error: null,
    };
  }

  const isLoading =
    membershipStatus === 'loading' || (membershipStatus === 'idle' && !!userId);

  return {
    membership,
    isLoading,
    error: membershipError ? new Error(membershipError) : null,
  };
}
