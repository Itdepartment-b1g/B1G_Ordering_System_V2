import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { subscribeToTable, unsubscribe } from '@/lib/realtime.helpers';

export interface WarRoomClient {
  id: string;
  name: string;
  company: string;
  account_type: 'Key Accounts' | 'Standard Accounts';
  has_forge: boolean;
  // Brands this client is holding (from clients.brand_ids)
  brand_ids: string[];
  brand_names?: string[];
  // Owning agent info (for filtering by team level / agent)
  agent_id?: string | null;
  agent_name?: string | null;
  // Owning agent's role (for filtering by team level)
  agent_role?: string | null;
  location_latitude: number;
  location_longitude: number;
  address: string;
  city: string;
  region: string;
  email: string;
  phone: string;
  total_orders: number;
  total_spent: number;
  total_visits: number;
}

export function useWarRoomClients() {
  const { user } = useAuth();
  const [clients, setClients] = useState<WarRoomClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.company_id) return;

    const fetchClients = async (silent = false) => {
      if (!silent) {
        setLoading(true);
        setError(null);
      }

      try {
        // Fetch brands first (for mapping IDs to names)
        const { data: brands } = await supabase
          .from('brands')
          .select('id, name')
          .eq('company_id', user.company_id);

        // Create a fast lookup map for brands
        const brandMap = new Map<string, string>();
        (brands || []).forEach(b => brandMap.set(b.id, b.name));

        const { data, error: fetchError } = await supabase
          .from('clients')
          .select(`
            id,
            agent_id,
            name,
            company,
            account_type,
            has_forge,
            brand_ids,
            city,
            location_latitude,
            location_longitude,
            address,
            email,
            phone,
            total_orders,
            total_spent,
            visit_logs (count),
            agent:profiles!clients_agent_id_fkey (full_name, role)
          `)
          .eq('company_id', user.company_id)
          .eq('status', 'active')
          .eq('approval_status', 'approved')
          .not('location_latitude', 'is', null)
          .not('location_longitude', 'is', null);

        if (fetchError) throw fetchError;

        // Transform database clients to WarRoomClient format
        const transformedClients: WarRoomClient[] = (data || []).map((client: any) => {
          const city = client.city || 'Unknown';
          const addressParts = client.address?.split(',').map((s: string) => s.trim()) || [];
          const region = addressParts.length > 0 ? addressParts[addressParts.length - 1] : 'Unknown';
          const totalVisits = client.visit_logs?.[0]?.count || 0;
          const agentRole = client.agent?.role || null;
          const agentName = client.agent?.full_name || null;

          return {
            id: client.id,
            agent_id: client.agent_id || null,
            agent_name: agentName,
            name: client.name,
            company: client.company || 'N/A',
            account_type: client.account_type,
            has_forge: client.has_forge,
            brand_ids: client.brand_ids || [],
            brand_names: (client.brand_ids || []).map((id: string) => brandMap.get(id) || 'Unknown'),
            agent_role: agentRole,
            location_latitude: client.location_latitude!,
            location_longitude: client.location_longitude!,
            address: client.address || 'No address provided',
            city,
            region,
            email: client.email || 'N/A',
            phone: client.phone || 'N/A',
            total_orders: client.total_orders || 0,
            total_spent: client.total_spent || 0,
            total_visits: totalVisits,
          };
        });

        setClients(transformedClients);
      } catch (err) {
        console.error('Error fetching clients for War Room:', err);
        if (!silent) setError(err instanceof Error ? err.message : 'Failed to fetch clients');
      } finally {
        if (!silent) setLoading(false);
      }
    };

    // Initial load from clients database
    fetchClients();

    // Listen to clients table for real-time updates (imports, transfers, etc.)
    const clientsChannel = subscribeToTable(
      'clients',
      () => fetchClients(true),
      '*',
      { column: 'company_id', value: user.company_id }
    );

    return () => {
      unsubscribe(clientsChannel);
    };
  }, [user?.company_id]);

  return { clients, loading, error };
}

