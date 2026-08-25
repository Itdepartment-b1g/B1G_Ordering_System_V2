import { useCallback, useEffect } from 'react';
import { useAuth } from '@/features/auth/hooks';
import { useAppDispatch, useAppSelector } from '@/store/store';
import {
  fetchKAPaymentTermOptions,
  type KAPaymentTermOptionRow,
} from '@/store/slices/key-accounts/payment-terms';

export type KeyAccountPaymentTermOptionRow = KAPaymentTermOptionRow;

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
  const dispatch = useAppDispatch();
  const { options, activeOnlyFilter, status, error } = useAppSelector(
    (state) => state.kaPaymentTerms
  );

  const refetch = useCallback(async () => {
    if (!user?.company_id) return;
    await dispatch(fetchKAPaymentTermOptions(activeOnly)).unwrap();
  }, [activeOnly, dispatch, user?.company_id]);

  useEffect(() => {
    if (!user?.company_id) return;
    void dispatch(fetchKAPaymentTermOptions(activeOnly));
  }, [activeOnly, dispatch, user?.company_id]);

  const loading =
    status === 'loading' ||
    (status === 'idle' && !!user?.company_id) ||
    (status === 'succeeded' && activeOnlyFilter !== activeOnly);

  return {
    options: activeOnlyFilter === activeOnly ? options : [],
    loading,
    error,
    refetch,
  };
}
