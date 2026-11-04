import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/features/auth';
import {
  AllocationDetailsPanel,
  formatManilaDateTime,
} from '@/features/sales-agents/components/super-admin-allocation-history/table/TableRow';
import {
  fetchMyLeaderAllocations,
  MOBILE_SALES_ALLOCATION_HISTORY_QUERY_KEY,
} from './utils/fetchMyLeaderAllocations';

export default function MobileSalesAllocationHistoryDetailPage() {
  const { groupId = '' } = useParams<{ groupId: string }>();
  const { user } = useAuth();

  const { data: groups = [], isLoading, isError } = useQuery({
    queryKey: [MOBILE_SALES_ALLOCATION_HISTORY_QUERY_KEY, user?.id, user?.company_id],
    enabled: !!user?.id,
    queryFn: () => fetchMyLeaderAllocations(user!.id, user?.company_id),
  });

  const group = useMemo(
    () => groups.find((item) => item.groupId === groupId) || null,
    [groups, groupId]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading allocation…
      </div>
    );
  }

  if (isError || !group) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1.5" asChild>
          <Link to="/my-allocation-history">
            <ArrowLeft className="h-4 w-4" />
            Back to allocation history
          </Link>
        </Button>
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <p className="font-medium text-foreground">Allocation not found</p>
            <p className="mt-1 text-sm">It may have been removed, or the link is outdated.</p>
            <Button className="mt-4" asChild>
              <Link to="/my-allocation-history">Go to Allocation History</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 pb-8 md:p-6">
      <div className="space-y-2">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1.5" asChild>
          <Link to="/my-allocation-history">
            <ArrowLeft className="h-4 w-4" />
            Back to allocation history
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Allocation details</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            From {group.allocatedByName} · {formatManilaDateTime(group.createdAt)}
          </p>
        </div>
      </div>

      <AllocationDetailsPanel group={group} />
    </div>
  );
}
