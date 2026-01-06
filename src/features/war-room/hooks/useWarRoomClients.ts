import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import type { Client } from '@/types/database.types';

export interface WarRoomClient {
  id: string;
  name: string;
  company: string;
  account_type: 'Key Accounts' | 'Standard Accounts';
  has_forge: boolean;
  location_latitude: number;
  location_longitude: number;
  address: string;
  city: string;
  region: string;
  email: string;
  phone: string;
  total_orders: number;
  total_spent: number;
}

export function useWarRoomClients() {
  const { user } = useAuth();
  const [clients, setClients] = useState<WarRoomClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.company_id) return;

    const fetchClients = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data, error: fetchError } = await supabase
          .from('clients')
          .select('id, name, company, account_type, has_forge, location_latitude, location_longitude, address, email, phone, total_orders, total_spent')
          .eq('company_id', user.company_id)
          .eq('status', 'active')
          .eq('approval_status', 'approved')
          .not('location_latitude', 'is', null)
          .not('location_longitude', 'is', null);

        if (fetchError) throw fetchError;

        // Transform database clients to WarRoomClient format 
        const transformedClients: WarRoomClient[] = (data || []).map((client: any) => {
          // Extract city and region from address if available
          const addressParts = client.address?.split(',').map(s => s.trim()) || [];
          const city = addressParts.length > 1 ? addressParts[addressParts.length - 2] : 'Unknown';
          const region = addressParts.length > 0 ? addressParts[addressParts.length - 1] : 'Unknown';

          return {
            id: client.id,
            name: client.name,
            company: client.company || 'N/A',
            account_type: client.account_type,
            has_forge: client.has_forge,
            location_latitude: client.location_latitude!,
            location_longitude: client.location_longitude!,
            address: client.address || 'No address provided',
            city,
            region,
            email: client.email || 'N/A',
            phone: client.phone || 'N/A',
            total_orders: client.total_orders || 0,
            total_spent: client.total_spent || 0,
          };
        });

        setClients(transformedClients);
      } catch (err) {
        console.error('Error fetching clients for War Room:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch clients');
      } finally {
        setLoading(false);
      }
    };

    fetchClients();

    // Set up real-time subscription
    const channel = supabase
      .channel('war-room-clients')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'clients',
          filter: `company_id=eq.${user.company_id}`,
        },
        () => {
          fetchClients();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.company_id]);

  return { clients, loading, error };
}

