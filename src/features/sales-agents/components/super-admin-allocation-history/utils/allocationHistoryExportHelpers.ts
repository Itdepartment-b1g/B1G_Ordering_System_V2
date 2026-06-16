import type { AllocationHistoryGroup } from './allocationHistoryMappers';

export function buildAllocationFilenamePrefix(group: AllocationHistoryGroup): string {
  const date = group.createdAt.split('T')[0];
  const slug = group.allocatedToName.replace(/[^a-z0-9]+/gi, '_').slice(0, 30);
  return `allocation_history_${slug}_${date}`;
}
