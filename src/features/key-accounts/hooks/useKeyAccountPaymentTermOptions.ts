import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/hooks';
import type { KeyAccountPaymentTermOption } from '@/types/database.types';

export type KeyAccountPaymentTermOptionRow = KeyAccountPaymentTermOption & {
  created_by_name: string | null;
};

interface UseKeyAccountPaymentTermOptionsReturn {
  options: KeyAccountPaymentTermOptionRow[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useKeyAccountPaymentTermOptions(
  activeOnly = false
): UseKeyAccountPaymentTermOptionsReturn {
  const { user } = useAuth();
  const [options, setOptions] = useState<KeyAccountPaymentTermOptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOptions = useCallback(async () => {
    if (!user?.company_id) {
      setOptions([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from('key_account_payment_term_options')
        .select('*')
        .eq('company_id', user.company_id)
        .order('sort_order', { ascending: true })
        .order('label', { ascending: true });

      if (activeOnly) {
        query = query.eq('is_active', true);
      }

      const { data, error: fetchError } = await query;
      if (fetchError) throw fetchError;

      const rows = (data as KeyAccountPaymentTermOption[]) || [];
      const creatorIds = [
        ...new Set(rows.map((r) => r.created_by).filter((id): id is string => Boolean(id))),
      ];

      const nameById = new Map<string, string>();
      if (creatorIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', creatorIds);

        for (const profile of profiles || []) {
          nameById.set(
            profile.id,
            profile.full_name?.trim() || profile.email || '—'
          );
        }
      }

      setOptions(
        rows.map((row) => ({
          ...row,
          created_by_name: row.created_by ? nameById.get(row.created_by) ?? null : null,
        }))
      );
    } catch (err) {
      console.error('Error fetching key account payment term options:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch payment terms');
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, [user?.company_id, activeOnly]);

  useEffect(() => {
    fetchOptions();
  }, [fetchOptions]);

  return {
    options,
    loading,
    error,
    refetch: fetchOptions,
  };
}
