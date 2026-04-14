import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type WarehouseMembershipStatus = 'main' | 'sub' | 'unlinked';

export type WarehouseLocationMembership = {
  status: WarehouseMembershipStatus;
  isMain: boolean;
  locationId: string | null;
};

type MembershipParams = {
  userId?: string | null;
  isWarehouse?: boolean;
};

export function useWarehouseLocationMembership({ userId, isWarehouse }: MembershipParams): {
  membership: WarehouseLocationMembership;
  isLoading: boolean;
  error: Error | null;
} {
  const { data, isLoading, error } = useQuery({
    queryKey: ['warehouse-location-membership', userId],
    enabled: !!userId && !!isWarehouse,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    queryFn: async (): Promise<WarehouseLocationMembership> => {
      // 1) Find user’s linked location (if any)
      const { data: linkRow, error: linkErr } = await supabase
        .from('warehouse_location_users')
        .select('location_id')
        .eq('user_id', userId!)
        .maybeSingle();
      if (linkErr) throw linkErr;

      // Fail-safe-to-main: no link means “unlinked”, but treat as main for stock source.
      if (!linkRow?.location_id) {
        return { status: 'unlinked', isMain: true, locationId: null };
      }

      // 2) Read main/sub flag for that location
      const { data: locRow, error: locErr } = await supabase
        .from('warehouse_locations')
        .select('is_main')
        .eq('id', linkRow.location_id)
        .maybeSingle();
      if (locErr) throw locErr;

      const isMain = !!locRow?.is_main;
      return { status: isMain ? 'main' : 'sub', isMain, locationId: linkRow.location_id as string };
    },
  });

  // Non-warehouse users: treat as unlinked (but main=true doesn’t matter because pages gate by role).
  const membership: WarehouseLocationMembership =
    data ?? ({ status: 'unlinked', isMain: true, locationId: null } satisfies WarehouseLocationMembership);

  return { membership, isLoading, error: (error as Error) ?? null };
}

