/** Key Account PO workflow after warehouse dispatch (multi-location aware). */
export function keyAccountWorkflowStatusAfterLocationDispatch(
  locationStatuses: Array<{ status?: string | null }>
): 'partial_delivered' | 'delivered' {
  const statuses = locationStatuses.map((r) => String(r.status || '').toLowerCase());
  if (statuses.length === 0) return 'partial_delivered';
  const allFulfilled = statuses.every((s) => s === 'fulfilled');
  return allFulfilled ? 'delivered' : 'partial_delivered';
}

export function keyAccountDispatchWorkflowActive(workflowStatus: string | null | undefined): boolean {
  const ws = String(workflowStatus || '');
  return ws === 'partial_delivered' || ws === 'delivered';
}
