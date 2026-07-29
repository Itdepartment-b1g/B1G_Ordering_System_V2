import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/hooks';
import type { KeyAccountPaymentSettings } from '@/types/database.types';

interface UseKeyAccountPaymentSettingsReturn {
  settings: KeyAccountPaymentSettings | null;
  createdByName: string | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useKeyAccountPaymentSettings(): UseKeyAccountPaymentSettingsReturn {
  const { user } = useAuth();
  const [settings, setSettings] = useState<KeyAccountPaymentSettings | null>(null);
  const [createdByName, setCreatedByName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    if (!user?.company_id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('key_account_payment_settings')
        .select('*')
        .eq('company_id', user.company_id)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (!data) {
        setSettings(null);
        setCreatedByName(null);
        return;
      }

      setSettings(data as KeyAccountPaymentSettings);

      if (data.created_by) {
        const { data: creator } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', data.created_by)
          .maybeSingle();
        setCreatedByName(creator?.full_name?.trim() || creator?.email || null);
      } else {
        setCreatedByName(null);
      }
    } catch (err) {
      console.error('Error fetching key account payment settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch payment settings');
      setSettings(null);
      setCreatedByName(null);
    } finally {
      setLoading(false);
    }
  }, [user?.company_id]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return {
    settings,
    createdByName,
    loading,
    error,
    refetch: fetchSettings,
  };
}
