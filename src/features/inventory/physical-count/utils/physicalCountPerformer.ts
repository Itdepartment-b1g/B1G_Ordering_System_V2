import type { PhysicalCountHistoryRow } from '../types';

export function getPhysicalCountPerformerName(
  row: Pick<PhysicalCountHistoryRow, 'performed_by_name' | 'performed_by_user'>
): string {
  const snapshot = row.performed_by_name?.trim();
  if (snapshot) return snapshot;
  const joined = row.performed_by_user?.full_name?.trim();
  if (joined) return joined;
  return '—';
}

export function getPhysicalCountPerformerId(
  row: Pick<PhysicalCountHistoryRow, 'performed_by' | 'performed_by_user'>
): string | null {
  return row.performed_by ?? row.performed_by_user?.id ?? null;
}
