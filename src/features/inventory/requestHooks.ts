import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { useEffect } from 'react';
import { subscribeToTable, unsubscribe } from '@/lib/realtime.helpers';

export interface Request {
    id: string;
    variant_id: string;
    requested_quantity: number;
    status: string;
    requested_at: string;
    requester_notes: string | null;
    approver_notes: string | null;
    denial_reason: string | null;
    variant?: {
        id: string;
        name: string;
        variant_type: string;
        brand: {
            name: string;
        };
    };
}

export interface GroupedRequest {
    id: string;
    requested_at: string;
    status: string;
    productCount: number;
    totalQuantity: number;
    requests: Request[];
    requester_notes: string | null;
}

export function useMyRequests() {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: ['my_requests', user?.id],
        enabled: !!user?.id,
        queryFn: async () => {
            if (!user?.id) return [];

            const { data, error } = await supabase
                .from('stock_requests')
                .select(`
          id,
          variant_id,
          requested_quantity,
          requested_at,
          status,
          leader_notes,
          admin_notes,
          rejection_reason,
          variant:variants(
            id,
            name,
            variant_type,
            brand:brands(name)
          )
        `)
                .eq('agent_id', user.id)
                .order('requested_at', { ascending: false });

            if (error) throw error;

            return (data || []).map((row: any) => ({
                id: row.id,
                variant_id: row.variant_id,
                requested_quantity: row.requested_quantity,
                requested_at: row.requested_at,
                status: row.status,
                requester_notes: row.leader_notes || null,
                approver_notes: row.admin_notes || null,
                denial_reason: row.rejection_reason || null,
                variant: row.variant || undefined,
            })) as Request[];
        },
        staleTime: 1000 * 60 * 5, // 5 minutes
    });

    useEffect(() => {
        if (!user?.id) return;

        const channel = subscribeToTable('stock_requests', () => {
            queryClient.invalidateQueries({ queryKey: ['my_requests', user.id] });
        });

        return () => unsubscribe(channel);
    }, [user?.id, queryClient]);

    return query;
}

export function useInventoryBaseData() {
    return useQuery({
        queryKey: ['inventory_base_data'],
        queryFn: async () => {
            const [{ data: brands }, { data: variants }] = await Promise.all([
                supabase.from('brands').select('id, name').order('name'),
                supabase.from('variants').select('id, name, variant_type, sku, brand:brands(id, name)').order('name')
            ]);

            return {
                brands: brands || [],
                variants: (variants || []).map((v: any) => ({
                    ...v,
                    brand: v.brand
                }))
            };
        },
        staleTime: 1000 * 60 * 60, // 1 hour
    });
}
