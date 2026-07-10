import type { SortDirection } from '@/features/shared/components/SortableTableHead';

/** 0 = default/reset, 1 = asc, 2 = desc */
export type TableSortStep = 0 | 1 | 2;

export type TableSortCycleState<T extends string> = {
  key: T | null;
  step: TableSortStep;
};

export const INITIAL_TABLE_SORT_CYCLE: TableSortCycleState<string> = {
  key: null,
  step: 0,
};

export function createInitialTableSortCycle<T extends string>(): TableSortCycleState<T> {
  return { key: null, step: 0 };
}

/** Same-column cycle: desc → asc → reset → desc … */
export function getNextTableSortCycleState<T extends string>(
  state: TableSortCycleState<T>,
  clickedKey: T
): TableSortCycleState<T> {
  if (state.key !== clickedKey) {
    return { key: clickedKey, step: 2 };
  }
  const nextStep: TableSortStep = state.step === 2 ? 1 : state.step === 1 ? 0 : 2;
  return { key: clickedKey, step: nextStep };
}

export function resolveTableSortDirection<T extends string>(
  state: TableSortCycleState<T>,
  defaultKey: T,
  defaultDirection: SortDirection
): { key: T; direction: SortDirection } {
  if (state.step === 0) {
    return { key: defaultKey, direction: defaultDirection };
  }
  return { key: state.key!, direction: state.step === 1 ? 'asc' : 'desc' };
}

export function getTableSortDisplayDirection<T extends string>(
  state: TableSortCycleState<T>,
  columnKey: T
): SortDirection | null {
  if (state.key !== columnKey || state.step === 0) return null;
  return state.step === 1 ? 'asc' : 'desc';
}
