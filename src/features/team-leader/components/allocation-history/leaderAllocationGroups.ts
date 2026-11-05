import type { AllocationHistoryGroup } from '@/features/sales-agents/components/super-admin-allocation-history/utils/allocationHistoryMappers';

/** Stock this leader received, TL-to-TL they sent, and leader-to-agent allocations for their team. */
export function filterLeaderAllocationGroups(
  allGroups: AllocationHistoryGroup[],
  userId: string | undefined,
  teamAgentIds: string[]
): AllocationHistoryGroup[] {
  if (!userId) return [];
  const teamAgentIdSet = new Set(teamAgentIds);
  return allGroups.filter((group) => {
    if (group.allocationType === 'main_to_leader' && group.allocatedToId === userId) {
      return true;
    }
    if (
      group.allocationType === 'leader_to_leader' &&
      (group.allocatedToId === userId || group.allocatedById === userId)
    ) {
      return true;
    }
    return (
      group.allocationType === 'leader_to_agent' &&
      group.allocatedById === userId &&
      teamAgentIdSet.has(group.allocatedToId)
    );
  });
}
