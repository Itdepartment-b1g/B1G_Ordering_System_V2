import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth';
import { fetchManagerDashboardData, fetchManagerTeamInventory } from '@/features/manager/hooks/useManagerData';

export const PrefetchController = () => {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!user || user.role !== 'manager' || !user.company_id) return;

        // Prefetch Manager Dashboard Data
        queryClient.prefetchQuery({
            queryKey: ['manager', 'dashboard', user.company_id, user.id],
            queryFn: () => fetchManagerDashboardData(user.company_id!, user.id),
            staleTime: 1000 * 60 * 5, // 5 minutes
        });

        // Prefetch Manager Team Inventory
        queryClient.prefetchQuery({
            queryKey: ['manager', 'inventory', user.company_id, user.id],
            queryFn: () => fetchManagerTeamInventory(user.company_id!, user.id),
            staleTime: 1000 * 60 * 5, // 5 minutes
        });

    }, [user, queryClient]);

    return null;
};
