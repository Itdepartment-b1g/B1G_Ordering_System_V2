export type ArchiveTaskSortKey =
  | 'title'
  | 'agentName'
  | 'priority'
  | 'status'
  | 'dueDate'
  | 'createdAt';

export type ArchiveTaskSortDirection = 'asc' | 'desc';

export const DEFAULT_ARCHIVE_TASK_SORT_KEY: ArchiveTaskSortKey = 'createdAt';
export const DEFAULT_ARCHIVE_TASK_SORT_DIRECTION: ArchiveTaskSortDirection = 'desc';

const PRIORITY_ORDER: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
  urgent: 4,
};

export type ArchiveTaskSortable = {
  title: string;
  agent_name: string;
  priority: string;
  status: string;
  due_date: string | null;
  created_at: string;
};

function compareDates(a: string | null | undefined, b: string | null | undefined): number {
  const aTime = a ? new Date(a).getTime() : 0;
  const bTime = b ? new Date(b).getTime() : 0;
  return aTime - bTime;
}

function comparePriority(a: string, b: string): number {
  return (PRIORITY_ORDER[a] ?? 0) - (PRIORITY_ORDER[b] ?? 0);
}

export function sortArchiveTasks<T extends ArchiveTaskSortable>(
  tasks: T[],
  sortKey: ArchiveTaskSortKey,
  sortDirection: ArchiveTaskSortDirection
): T[] {
  const direction = sortDirection === 'asc' ? 1 : -1;

  return [...tasks].sort((a, b) => {
    let result = 0;

    switch (sortKey) {
      case 'title':
        result = a.title.localeCompare(b.title);
        break;
      case 'agentName':
        result = a.agent_name.localeCompare(b.agent_name);
        break;
      case 'priority':
        result = comparePriority(a.priority, b.priority);
        break;
      case 'status':
        result = a.status.localeCompare(b.status);
        break;
      case 'dueDate':
        result = compareDates(a.due_date, b.due_date);
        break;
      case 'createdAt':
        result = compareDates(a.created_at, b.created_at);
        break;
      default:
        result = 0;
    }

    if (result !== 0) return result * direction;
    return compareDates(b.created_at, a.created_at);
  });
}
