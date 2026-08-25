import { useCallback, useEffect } from 'react';
import { useAuth } from '@/features/auth/hooks';
import { useAppDispatch, useAppSelector } from '@/store/store';
import { fetchKAPaymentSettings } from '@/store/slices/key-accounts/payment-settings';
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
  const dispatch = useAppDispatch();
  const { settings, createdByName, status, error } = useAppSelector(
    (state) => state.kaPaymentSettings
  );

  const refetch = useCallback(async () => {
    if (!user?.company_id) return;
    await dispatch(fetchKAPaymentSettings()).unwrap();
  }, [dispatch, user?.company_id]);

  useEffect(() => {
    if (!user?.company_id) return;
    void dispatch(fetchKAPaymentSettings());
  }, [dispatch, user?.company_id]);

  return {
    settings,
    createdByName,
    loading: status === 'loading' || (status === 'idle' && !!user?.company_id),
    error,
    refetch,
  };
}
