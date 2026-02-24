import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { useEffect } from 'react';
import { subscribeToTable, unsubscribe } from '@/lib/realtime.helpers';

export interface Request {
    id: string;
    request_number?: string; // Added optional for backward compatibility
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
          request_number,
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
                request_number: row.request_number, // Added
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

        const channel = subscribeToTable('stock_requests', (payload) => {
            console.log('🔔 Stock request update:', payload);
            // Client-side filtering to ensure we only update for relevant requests
            // This is more reliable than server-side filtering with RLS in some cases
            if (payload.new && (payload.new as any).agent_id === user.id) {
                queryClient.invalidateQueries({ queryKey: ['my_requests', user.id] });
            } else if (payload.old && (payload.old as any).agent_id === user.id) {
                 // Handle deletion case or if we only have old record
                queryClient.invalidateQueries({ queryKey: ['my_requests', user.id] });
            }
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
                supabase.from('variants').select('id, name, variant_type, sku, brand_id, brand:brands(id, name)').order('name')
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

export function useLeaderInventorySummary(leaderId: string | null) {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: ['leader_inventory_summary', leaderId],
        enabled: !!leaderId && !!user?.company_id,
        queryFn: async () => {
            if (!leaderId || !user?.company_id) return { brands: [], variants: [] };

            // Fetch leader's actual inventory items
            const { data: inventoryData, error: inventoryError } = await supabase
                .from('agent_inventory')
                .select(`
                    variant_id,
                    stock,
                    variants (
                        id,
                        name,
                        variant_type,
                        brand_id,
                        brand:brands(id, name)
                    )
                `)
                .eq('agent_id', leaderId)
                .eq('company_id', user.company_id)
                .gt('stock', 0);

            if (inventoryError) throw inventoryError;

            // Extract unique brands and variants
            const brandsMap = new Map();
            const variantsSet = new Set();
            const formattedVariants: any[] = [];

            inventoryData?.forEach((item: any) => {
                const v = item.variants;
                if (!v) return;

                if (!variantsSet.has(v.id)) {
                    variantsSet.add(v.id);
                    formattedVariants.push({
                        ...v,
                        brand: v.brand,
                        stock: item.stock // Include the stock from the leader's inventory
                    });
                }

                if (v.brand && !brandsMap.has(v.brand.id)) {
                    brandsMap.set(v.brand.id, v.brand);
                }
            });

            return {
                brands: Array.from(brandsMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
                variants: formattedVariants.sort((a, b) => a.name.localeCompare(b.name))
            };
        },
        staleTime: 1000 * 60 * 2, // 2 minutes (shorter than global data)
    });

    useEffect(() => {
        if (!leaderId) return;

        console.log(`🎧 Subscribing to leader inventory changes (leader: ${leaderId})`);
        const channel = subscribeToTable('agent_inventory', (payload) => {
            console.log('🔔 Leader inventory update detected:', payload.eventType);
            queryClient.invalidateQueries({ queryKey: ['leader_inventory_summary', leaderId] });
        }, '*', { column: 'agent_id', value: leaderId });

        return () => {
            unsubscribe(channel);
        };
    }, [leaderId, queryClient]);

    return query;
}

export function useMainInventorySummary() {
    return useQuery({
        queryKey: ['main_inventory_summary'],
        queryFn: async () => {
            // Fetch main inventory items (stock > 0)
            const { data: inventoryData, error: inventoryError } = await supabase
                .from('main_inventory')
                .select(`
                    variant_id,
                    stock,
                    variants (
                        id,
                        name,
                        variant_type,
                        brand_id,
                        brand:brands(id, name)
                    )
                `)
                .gt('stock', 0);

            if (inventoryError) throw inventoryError;

            // Extract unique brands and variants
            const brandsMap = new Map();
            const variantsSet = new Set();
            const formattedVariants: any[] = [];

            inventoryData?.forEach((item: any) => {
                const v = item.variants;
                if (!v) return;

                if (!variantsSet.has(v.id)) {
                    variantsSet.add(v.id);
                    formattedVariants.push({
                        ...v,
                        brand: v.brand
                    });
                }

                if (v.brand && !brandsMap.has(v.brand.id)) {
                    brandsMap.set(v.brand.id, v.brand);
                }
            });

            return {
                brands: Array.from(brandsMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
                variants: formattedVariants.sort((a, b) => a.name.localeCompare(b.name))
            };
        },
        staleTime: 1000 * 60 * 5, // 5 minutes
    });
}

export function useMyLeader() {
    const { user } = useAuth();
    
    return useQuery({
        queryKey: ['my_leader', user?.id],
        enabled: !!user?.id && user.role === 'mobile_sales',
        queryFn: async () => {
            if (!user?.id) return null;

            const { data, error } = await supabase
                .from('leader_teams')
                .select('leader_id, leader:profiles!leader_teams_leader_id_fkey(full_name)')
                .eq('agent_id', user.id)
                .single();

            if (error) {
                console.error('Error fetching leader:', error);
                return null;
            }

            return {
                leaderId: data.leader_id,
                leaderName: (data.leader as any)?.full_name
            };
        },
        staleTime: 1000 * 60 * 30, // 30 minutes
    });
}
