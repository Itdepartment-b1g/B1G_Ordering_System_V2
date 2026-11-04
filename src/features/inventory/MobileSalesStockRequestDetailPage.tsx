import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import { StockRequestDetailsPanel } from './components/StockRequestDetailsPanel';
import { useMyLeader, useMyRequests } from './requestHooks';
import { exportMobileSalesStockRequestPdf } from './utils/exportMobileSalesStockRequestPdf';
import {
  formatStockRequestWhen,
  groupMyStockRequests,
} from './utils/stockRequestGrouping';
import { Clock, CheckCircle2, XCircle } from 'lucide-react';

function statusBadge(status: string) {
  switch (status) {
    case 'pending':
      return (
        <Badge variant="secondary" className="border-yellow-200 bg-yellow-50 text-yellow-700">
          <Clock className="mr-1 h-3 w-3" />
          Pending
        </Badge>
      );
    case 'approved_by_leader':
      return (
        <Badge variant="secondary" className="border-blue-200 bg-blue-50 text-blue-700">
          <Clock className="mr-1 h-3 w-3" />
          Pending Approval
        </Badge>
      );
    case 'approved_by_admin':
    case 'fulfilled':
      return (
        <Badge variant="secondary" className="border-green-200 bg-green-50 text-green-700">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Approved
        </Badge>
      );
    case 'rejected':
      return (
        <Badge variant="secondary" className="border-red-200 bg-red-50 text-red-700">
          <XCircle className="mr-1 h-3 w-3" />
          Denied
        </Badge>
      );
    default:
      return <Badge>{status}</Badge>;
  }
}

export default function MobileSalesStockRequestDetailPage() {
  const { requestId: rawRequestId = '' } = useParams<{ requestId: string }>();
  const requestId = decodeURIComponent(rawRequestId);
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: requests = [], isLoading, isError } = useMyRequests();
  const { data: leaderData } = useMyLeader();

  const groups = useMemo(() => groupMyStockRequests(requests), [requests]);
  const group = useMemo(
    () => groups.find((item) => item.id === requestId) || null,
    [groups, requestId]
  );

  const handlePrint = () => {
    if (!group) return;
    try {
      const first = group.requests[0];
      const denialReason =
        group.requests.map((req) => req.denial_reason?.trim()).find(Boolean) ?? null;
      exportMobileSalesStockRequestPdf({
        requestNumber: group.id.startsWith('SR-') ? group.id : '—',
        status: group.status,
        requestedAt: group.requested_at,
        requestedByName: first?.requested_by_name || user?.full_name || null,
        requestedFromName: first?.requested_from_name || leaderData?.leaderName || null,
        notes: group.requester_notes,
        denialReason,
        lines: group.requests.map((req) => ({
          brandName: req.variant?.brand?.name ?? null,
          variantName: req.variant?.name ?? null,
          requestedQuantity: req.requested_quantity,
        })),
      });
    } catch (error) {
      toast({
        title: 'Could not open print view',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading request…
      </div>
    );
  }

  if (isError || !group) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1.5" asChild>
          <Link to="/inventory/mobile-request">
            <ArrowLeft className="h-4 w-4" />
            Back to stock requests
          </Link>
        </Button>
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <p className="font-medium text-foreground">Request not found</p>
            <p className="mt-1 text-sm">It may have been removed, or the link is outdated.</p>
            <Button className="mt-4" asChild>
              <Link to="/inventory/mobile-request">Go to Stock Requests</Link>
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
          <Link to="/inventory/mobile-request">
            <ArrowLeft className="h-4 w-4" />
            Back to stock requests
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Request details</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {group.id.startsWith('SR-') ? group.id : 'Stock request'} ·{' '}
            {formatStockRequestWhen(group.requested_at)}
          </p>
        </div>
      </div>

      <StockRequestDetailsPanel
        group={group}
        statusBadge={statusBadge(group.status)}
        onPrint={handlePrint}
      />
    </div>
  );
}
