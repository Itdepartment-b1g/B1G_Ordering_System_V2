import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { useEffect } from 'react';
import { subscribeToTable, unsubscribe } from '@/lib/realtime.helpers';

export interface Client {
    id: string;
    name: string;
    email: string;
    phone: string;
    company: string;
    city?: string;
    totalOrders: number;
    lastOrder: string;
    photo?: string;
    photoTimestamp?: string;
    address?: string;
    location?: {
        latitude: number;
        longitude: number;
        accuracy: number;
        capturedAt: string;
    };
    account_type?: 'Key Accounts' | 'Standard Accounts';
    category?: 'Permanently Closed' | 'Renovating' | 'Open';
    approvalStatus: 'pending' | 'approved' | 'rejected';
    approvalRequestedAt?: string;
    approvedAt?: string;
    approvalNotes?: string;
    approvedBy?: string | null;

    status?: 'active' | 'inactive';
    visitCount: number;
    corUrl?: string;
    tin?: string;
    contactPerson?: string;
}

const getSignedPhotoUrl = async (photoUrl: string | null | undefined): Promise<string | null> => {
    if (!photoUrl) return null;
    if (photoUrl.includes('?token=')) return photoUrl;

    const publicUrlMatch = photoUrl.match(/\/storage\/v1\/object\/public\/client-photos\/(.+)$/);
    if (publicUrlMatch) {
        const filePath = publicUrlMatch[1];
        const { data, error } = await supabase.storage
            .from('client-photos')
            .createSignedUrl(filePath, 3600);
        if (!error && data?.signedUrl) return data.signedUrl;
    }

    try {
        const url = new URL(photoUrl);
        const pathParts = url.pathname.split('/client-photos/');
        if (pathParts.length > 1) {
            const filePath = pathParts[1];
            const { data, error } = await supabase.storage
                .from('client-photos')
                .createSignedUrl(filePath, 3600);
            if (!error && data?.signedUrl) return data.signedUrl;
        }
    } catch (e) { }

    return photoUrl;
};

export function useMyClients() {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: ['my_clients', user?.id],
        enabled: !!user?.id,
        queryFn: async () => {
            if (!user?.id) return [];

            const { data, error } = await supabase
                .from('clients')
                .select('id, name, email, phone, company, city, account_type, category, address, total_orders, last_order_date, photo_url, photo_timestamp, created_at, location_latitude, location_longitude, location_accuracy, location_captured_at, approval_status, approval_requested_at, approved_at, approval_notes, approved_by, status, cor_url, tin, contact_person, visit_logs(count)')
                .eq('agent_id', user.id)
                .eq('status', 'active')
                .order('created_at', { ascending: false });

            if (error) throw error;

            const { data: statsView } = await supabase
                .from('client_order_stats')
                .select('client_id, total_orders, last_order_date')
                .eq('agent_id', user.id);

            const statsByClient = (statsView || []).reduce((acc: any, r: any) => {
                acc[r.client_id] = {
                    totalOrders: Number(r.total_orders) || 0,
                    lastOrder: r.last_order_date || null,
                };
                return acc;
            }, {});

            const formattedClients = await Promise.all(
                (data || []).map(async (c: any) => {
                    const signedPhotoUrl = await getSignedPhotoUrl(c.photo_url);
                    return {
                        id: c.id,
                        name: c.name,
                        email: c.email || '',
                        phone: c.phone || '',
                        company: c.company || '',
                        city: c.city || '',
                        account_type: c.account_type || 'Standard Accounts',
                        category: c.category || 'Open',
                        address: c.address || '',
                        totalOrders: statsByClient[c.id]?.totalOrders ?? c.total_orders ?? 0,
                        lastOrder: statsByClient[c.id]?.lastOrder ?? c.last_order_date ?? new Date().toISOString().split('T')[0],
                        photo: signedPhotoUrl,
                        photoTimestamp: c.photo_timestamp || c.created_at,
                        visitCount: c.visit_logs?.[0]?.count || 0,
                        corUrl: c.cor_url,
                        tin: c.tin,
                        contactPerson: c.contact_person,
                        location: c.location_latitude && c.location_longitude ? {
                            latitude: c.location_latitude,
                            longitude: c.location_longitude,
                            accuracy: c.location_accuracy || 0,
                            capturedAt: c.location_captured_at || c.created_at
                        } : undefined,
                        approvalStatus: (c.approval_status || 'approved') as Client['approvalStatus'],
                        approvalRequestedAt: c.approval_requested_at || undefined,
                        approvedAt: c.approved_at || undefined,
                        approvalNotes: c.approval_notes || undefined,
                        approvedBy: c.approved_by || null,
                        status: c.status || undefined
                    };
                })
            );

            return formattedClients as Client[];
        },
        staleTime: 1000 * 60 * 5, // 5 minutes fresh
    });

    useEffect(() => {
        if (!user?.id) return;

        const clientsChannel = subscribeToTable('clients', () => {
            queryClient.invalidateQueries({ queryKey: ['my_clients', user.id] });
        });
        const ordersChannel = subscribeToTable('client_orders', () => {
            queryClient.invalidateQueries({ queryKey: ['my_clients', user.id] });
        });

        return () => {
            unsubscribe(clientsChannel);
            unsubscribe(ordersChannel);
        };
    }, [user?.id, queryClient]);

    return query;
}

export function useAgentCities() {
    const { user } = useAuth();

    return useQuery({
        queryKey: ['agent_cities', user?.id],
        enabled: !!user?.id,
        queryFn: async () => {
            if (!user?.id) return [];

            const { data, error } = await supabase
                .from('profiles')
                .select('city')
                .eq('id', user.id)
                .single();

            if (error) throw error;

            return data?.city
                ? data.city.split(',').map((c: string) => c.trim()).filter((c: string) => c.length > 0)
                : [];
        },
        staleTime: 1000 * 60 * 60, // 1 hour
    });
}
