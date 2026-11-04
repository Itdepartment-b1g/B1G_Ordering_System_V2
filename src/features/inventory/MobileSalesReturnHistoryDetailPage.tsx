import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/features/auth';
import { MobileSalesReturnDetailsPanel } from './components/MobileSalesReturnDetailsPanel';
import {
  fetchMyReturns,
  MOBILE_SALES_RETURN_HISTORY_QUERY_KEY,
} from './utils/mobileSalesReturnHistory';

export default function MobileSalesReturnHistoryDetailPage() {
  const { returnId = '' } = useParams<{ returnId: string }>();
  const { user } = useAuth();
  const returnedByName = user?.full_name?.trim() || 'You';

  const { data: returns = [], isLoading, isError } = useQuery({
    queryKey: [MOBILE_SALES_RETURN_HISTORY_QUERY_KEY, user?.id],
    enabled: !!user?.id,
    queryFn: () => fetchMyReturns(user!.id),
  });

  const row = useMemo(
    () => returns.find((item) => item.id === returnId) || null,
    [returns, returnId]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading return…
      </div>
    );
  }

  if (isError || !row) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1.5" asChild>
          <Link to="/inventory/my-returns">
            <ArrowLeft className="h-4 w-4" />
            Back to return history
          </Link>
        </Button>
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <p className="font-medium text-foreground">Return not found</p>
            <p className="mt-1 text-sm">It may have been removed, or the link is outdated.</p>
            <Button className="mt-4" asChild>
              <Link to="/inventory/my-returns">Go to Return History</Link>
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
          <Link to="/inventory/my-returns">
            <ArrowLeft className="h-4 w-4" />
            Back to return history
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Return details</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            To {row.returnedTo} · {format(new Date(row.returnedAt), 'MMM d, yyyy h:mm a')}
          </p>
        </div>
      </div>

      <MobileSalesReturnDetailsPanel row={row} returnedByName={returnedByName} />
    </div>
  );
}
