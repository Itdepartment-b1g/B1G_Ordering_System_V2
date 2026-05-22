import { Badge } from '@/components/ui/badge';

/** Badge colors for Key Account PO workflow_status (matches Key Account PO page). */
export function keyAccountWorkflowBadgeClass(workflowStatus: string) {
  switch (workflowStatus) {
    case 'delivered':
    case 'fulfilled':
      return 'bg-green-600 text-white';
    case 'approved':
    case 'warehouse_reserved':
      return 'bg-blue-600 text-white';
    case 'admin_pending':
    case 'director_pending':
    case 'kam_pending':
      return 'bg-amber-500 text-white';
    case 'rejected':
      return 'bg-red-600 text-white';
    default:
      return 'bg-gray-600 text-white';
  }
}

export function keyAccountWorkflowLabel(workflowStatus: string | null | undefined) {
  return String(workflowStatus || '').replace(/_/g, ' ');
}

export function isKeyAccountPendingWorkflow(workflowStatus: string | null | undefined) {
  return (
    workflowStatus === 'kam_pending' ||
    workflowStatus === 'director_pending' ||
    workflowStatus === 'admin_pending'
  );
}

export function KeyAccountWorkflowStatusBadge({
  workflowStatus,
}: {
  workflowStatus: string | null | undefined;
}) {
  const ws = workflowStatus || '';
  return (
    <Badge className={keyAccountWorkflowBadgeClass(ws)}>
      {keyAccountWorkflowLabel(ws)}
    </Badge>
  );
}
