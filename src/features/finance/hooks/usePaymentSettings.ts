import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/hooks';
import type { CompanyPaymentSettings } from '@/types/database.types';

interface UsePaymentSettingsReturn {
  settings: CompanyPaymentSettings | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch and manage company payment settings
 * Includes real-time subscription for automatic updates
 */
export function usePaymentSettings(): UsePaymentSettingsReturn {
  const { user } = useAuth();
  const [settings, setSettings] = useState<CompanyPaymentSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = async () => {
    if (!user?.company_id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('company_payment_settings')
        .select('*')
        .eq('company_id', user.company_id)
        .single();

      if (fetchError) {
        // If no settings exist yet, return null (not an error)
        if (fetchError.code === 'PGRST116') {
          setSettings(null);
          setError(null);
        } else {
          throw fetchError;
        }
      } else {
        setSettings(data);
      }
    } catch (err) {
      console.error('Error fetching payment settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch payment settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();

    // Set up real-time subscription
    if (user?.company_id) {
      const channel = supabase
        .channel(`payment-settings-${user.company_id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'company_payment_settings',
            filter: `company_id=eq.${user.company_id}`
          },
          (payload) => {
            console.log('💰 [Payment Settings] Real-time update received:', payload.eventType);
            
            if (payload.eventType === 'DELETE') {
              setSettings(null);
            } else if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              // Directly update state with new data from payload
              const newData = payload.new as CompanyPaymentSettings;
              console.log('💰 [Payment Settings] Updating settings:', newData);
              setSettings(newData);
            }
          }
        )
        .subscribe((status) => {
          console.log('💰 [Payment Settings] Subscription status:', status);
        });

      return () => {
        console.log('💰 [Payment Settings] Cleaning up subscription');
        supabase.removeChannel(channel);
      };
    }
  }, [user?.company_id]);

  return {
    settings,
    loading,
    error,
    refetch: fetchSettings
  };
}
