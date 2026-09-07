import { useCallback, useEffect, useMemo } from 'react';
import { useAuth } from '@/features/auth/hooks';
import { useAppDispatch, useAppSelector } from '@/store/store';
import {
  deleteKASalesTarget,
  fetchKASalesTargetPos,
  fetchKASalesTargets,
  upsertKASalesTarget,
  type KASalesTargetActual,
  type KASalesTargetAssignee,
  type KASalesTargetPo,
  type KASalesTargetRow,
} from '@/store/slices/key-accounts/sales-targets';

export type KASalesTargetDisplayRow = KASalesTargetAssignee & {
  rowKey: string;
  month: string;
  targetRevenue: number | null;
  actualRevenue: number;
  actualOrders: number;
  actualQty: number;
};

function targetKey(assigneeId: string, month: string) {
  return `${assigneeId}:${month}`;
}

export function useKeyAccountSalesTargets(startMonth: string, endMonth: string) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const {
    assignees,
    targets,
    actuals,
    purchaseOrders,
    range,
    detailKey,
    status,
    saveStatus,
    detailStatus,
    error,
    saveError,
    detailError,
  } = useAppSelector((state) => state.kaSalesTargets);

  const rangeMatches = range?.startMonth === startMonth && range?.endMonth === endMonth;

  const refetch = useCallback(async () => {
    if (!user?.company_id || !startMonth || !endMonth) return;
    await dispatch(fetchKASalesTargets({ startMonth, endMonth })).unwrap();
  }, [dispatch, endMonth, startMonth, user?.company_id]);

  useEffect(() => {
    if (!user?.company_id || !startMonth || !endMonth) return;
    void dispatch(fetchKASalesTargets({ startMonth, endMonth }));
  }, [dispatch, endMonth, startMonth, user?.company_id]);

  const targetByKey = useMemo(() => {
    const map = new Map<string, KASalesTargetRow>();
    for (const row of targets) map.set(targetKey(row.assigneeId, row.targetMonth), row);
    return map;
  }, [targets]);

  const actualByKey = useMemo(() => {
    const map = new Map<string, KASalesTargetActual>();
    for (const row of actuals) map.set(targetKey(row.assigneeId, row.month), row);
    return map;
  }, [actuals]);

  const buildRows = useCallback(
    (people: KASalesTargetAssignee[], months: string[]): KASalesTargetDisplayRow[] => {
      const rows: KASalesTargetDisplayRow[] = [];
      for (const person of people) {
        for (const month of months) {
          const key = targetKey(person.id, month);
          const stored = targetByKey.get(key);
          const actual = actualByKey.get(key);
          rows.push({
            ...person,
            rowKey: key,
            month,
            targetRevenue: stored?.targetRevenue ?? null,
            actualRevenue: actual?.actualRevenue ?? 0,
            actualOrders: actual?.actualOrders ?? 0,
            actualQty: actual?.actualQty ?? 0,
          });
        }
      }
      return rows;
    },
    [actualByKey, targetByKey]
  );

  const saveTarget = useCallback(
    async (payload: { assigneeId: string; targetMonth: string; targetRevenue: number }) => {
      await dispatch(upsertKASalesTarget(payload)).unwrap();
    },
    [dispatch]
  );

  const clearTarget = useCallback(
    async (payload: { assigneeId: string; targetMonth: string }) => {
      await dispatch(deleteKASalesTarget(payload)).unwrap();
    },
    [dispatch]
  );

  const loadPurchaseOrders = useCallback(
    async (payload: { assigneeId: string; month: string }) => {
      await dispatch(fetchKASalesTargetPos(payload)).unwrap();
    },
    [dispatch]
  );

  const loading =
    !rangeMatches ||
    status === 'loading' ||
    (status === 'idle' && !!user?.company_id);

  return {
    assignees: rangeMatches ? assignees : [],
    targets: rangeMatches ? targets : [],
    actuals: rangeMatches ? actuals : [],
    purchaseOrders,
    detailKey,
    loading,
    saving: saveStatus === 'loading',
    detailLoading: detailStatus === 'loading',
    error,
    saveError,
    detailError,
    refetch,
    buildRows,
    saveTarget,
    clearTarget,
    loadPurchaseOrders,
    targetByKey,
  };
}

export type { KASalesTargetAssignee, KASalesTargetPo };
