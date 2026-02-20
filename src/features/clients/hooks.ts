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
    totalSpent: number;
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
    accountType?: 'Key Accounts' | 'Standard Accounts';
    category?: 'Permanently Closed' | 'Renovating' | 'Open';
    approvalStatus: 'pending' | 'approved' | 'rejected';
    approvalRequestedAt?: string;
    approvedAt?: string;
    approvalNotes?: string;
    approvedBy?: string | null;

    status?: 'active' | 'inactive';
    visitCount: number;
    corUrl?: string;
    insideStorePhotoUrl?: string | null;
    tin?: string;
    contactPerson?: string;
    taxStatus?: 'Tax on Sales' | 'Tax Exempt';
    brandIds?: string[];
    shopType?: string;
}

const getSignedPhotoUrl = async (photoUrl: string | null | undefined): Promise<string | null> => {
    if (!photoUrl) return null;
    if (photoUrl.includes('?token=')) return photoUrl;

    // If it's a storage path (e.g. inside_store/2026/02/13_ad/photo_xxx.jpg), get a signed URL
    if (!photoUrl.startsWith('http')) {
        const { data, error } = await supabase.storage
            .from('client-photos')
            .createSignedUrl(photoUrl, 3600);
        if (!error && data?.signedUrl) return data.signedUrl;
        return photoUrl;
    }

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

/** Sanitize client name to match folder naming used when uploading inside store photo */
function sanitizeClientNameForPath(str: string): string {
    return str
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '') || 'client';
}

/** Try to find an inside store photo in storage when DB has no path (e.g. client created before we saved path) */
async function discoverInsideStorePhotoPath(clientName: string): Promise<string | null> {
    try {
        const prefix = 'inside_store/';
        const { data: listData } = await supabase.storage
            .from('client-photos')
            .list(prefix, { limit: 500 });
        if (!listData?.length) return null;
        const sanitized = sanitizeClientNameForPath(clientName);
        // Folders are named like "2026/02/13_ad" - we need to find one ending with _clientName
        for (const item of listData) {
            if (item.name && item.name.endsWith(`_${sanitized}`) && item.id == null) {
                const folderPath = prefix + item.name;
                const { data: files } = await supabase.storage
                    .from('client-photos')
                    .list(folderPath, { limit: 10 });
                const photo = files?.find((f) => f.name?.startsWith('photo_') && f.name?.endsWith('.jpg'));
                if (photo?.name) return `${folderPath}/${photo.name}`;
            }
        }
        // Fallback: any folder whose name contains the sanitized client name
        for (const item of listData) {
            if (!item.name || item.id != null) continue;
            if (!item.name.includes(`_${sanitized}`) && item.name !== sanitized) continue;
            const folderPath = prefix + item.name;
            const { data: files } = await supabase.storage
                .from('client-photos')
                .list(folderPath, { limit: 10 });
            const photo = files?.find((f) => f.name?.startsWith('photo_') && f.name?.endsWith('.jpg'));
            if (photo?.name) return `${folderPath}/${photo.name}`;
        }
    } catch (e) {
        console.warn('Discover inside store photo:', e);
    }
    return null;
}

export function useMyClients() {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: ['my_clients', user?.id],
        enabled: !!user?.id,
        queryFn: async () => {
            if (!user?.id) return [];

            console.log('🔍 [useMyClients] Fetching clients for user:', user.id, 'role:', user.role, 'company_id:', user.company_id);
            
            // First, let's check what clients exist for this agent_id (without status filter) for debugging
            const { data: allClientsDebug } = await supabase
                .from('clients')
                .select('id, name, agent_id, status, company_id, approval_status')
                .eq('agent_id', user.id)
                .eq('company_id', user.company_id);
            console.log('🔍 [useMyClients] All clients for agent_id (debug):', allClientsDebug);
            
            const { data, error } = await supabase
                .from('clients')
                .select('id, name, email, phone, company, city, account_type, category, address, total_orders, last_order_date, photo_url, photo_timestamp, created_at, location_latitude, location_longitude, location_accuracy, location_captured_at, inside_store_photo_url, approval_status, approval_requested_at, approved_at, approval_notes, approved_by, status, cor_url, tin, contact_person, tax_status, brand_ids, shop_type, visit_logs(count)')
                .eq('agent_id', user.id)
                .eq('status', 'active')
                .eq('company_id', user.company_id) // Ensure company_id matches for RLS policies
                .order('created_at', { ascending: false });

            if (error) {
                console.error('❌ [useMyClients] Error fetching clients:', error);
                throw error;
            }
            
            console.log('✅ [useMyClients] Found clients:', data?.length || 0, 'clients for agent_id:', user.id);
            if (data && data.length > 0) {
                console.log('📋 [useMyClients] Client details:', data.map(c => ({ id: c.id, name: c.name, agent_id: c.agent_id, status: c.status })));
            }

            let ordersByClient: Record<string, { totalOrders: number; totalSpent: number; lastOrder?: string }> = {};

            const { data: orders } = await supabase
                .from('client_orders')
                .select('id, client_id, order_date, total_amount')
                .eq('agent_id', user.id)
                .or('stage.eq.admin_approved,status.eq.approved');

            if (orders) {
                ordersByClient = orders.reduce((acc: any, order: any) => {
                    const cid = order.client_id;
                    if (!acc[cid]) {
                        acc[cid] = { totalOrders: 0, totalSpent: 0, lastOrder: undefined };
                    }
                    acc[cid].totalOrders += 1;
                    acc[cid].totalSpent += Number(order.total_amount) || 0;

                    const d = order.order_date;
                    if (d) {
                        const prev = acc[cid].lastOrder ? new Date(acc[cid].lastOrder) : undefined;
                        if (!prev || new Date(d) > prev) acc[cid].lastOrder = d;
                    }
                    return acc;
                }, {});
            }


            const formattedClients = await Promise.all(
                (data || []).map(async (c: any) => {
                    const signedPhotoUrl = await getSignedPhotoUrl(c.photo_url);
                    const signedInsideStoreUrl = c.inside_store_photo_url ? await getSignedPhotoUrl(c.inside_store_photo_url) : null;
                    return {
                        id: c.id,
                        name: c.name,
                        email: c.email || '',
                        phone: c.phone || '',
                        company: c.company || '',
                        city: c.city || '',
                        accountType: c.account_type || 'Standard Accounts',
                        category: c.category || 'Open',
                        address: c.address || '',
                        totalOrders: ordersByClient[c.id]?.totalOrders ?? 0,
                        totalSpent: ordersByClient[c.id]?.totalSpent ?? 0,
                        lastOrder: ordersByClient[c.id]?.lastOrder ?? c.last_order_date ?? null,
                        photo: signedPhotoUrl,
                        photoTimestamp: c.photo_timestamp || c.created_at,
                        visitCount: c.visit_logs?.[0]?.count || 0,
                        corUrl: c.cor_url,
                        insideStorePhotoUrl: signedInsideStoreUrl ?? c.inside_store_photo_url ?? null,
                        tin: c.tin,
                        contactPerson: c.contact_person,
                        taxStatus: c.tax_status,
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
                        status: c.status || undefined,
                        brandIds: c.brand_ids || [],
                        shopType: c.shop_type || undefined
                    };
                })
            );

            return formattedClients as Client[];
        },
        staleTime: 1000 * 30, // 30 seconds - more responsive for newly added clients
        refetchOnWindowFocus: true, // Refetch when user returns to tab
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
