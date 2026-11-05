import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Printer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import {
  MobileSalesAllocationBrandList,
  productLinesToAllocationGroup,
} from './components/MobileSalesAllocationBrandList';
import { exportMainInventoryReturnPdf } from './utils/exportMainInventoryReturnPdf';
import {
  fetchMyReturns,
  MOBILE_SALES_RETURN_HISTORY_QUERY_KEY,
  type ReturnStatus,
} from './utils/mobileSalesReturnHistory';

function statusBadge(status: ReturnStatus) {
  if (status === 'approved') return <Badge>Approved</Badge>;
  if (status === 'rejected') return <Badge variant="destructive">Rejected</Badge>;
  return <Badge variant="secondary">Pending</Badge>;
}

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
  const allocationGroup = useMemo(
    () =>
      productLinesToAllocationGroup(
        row?.id || returnId,
        (row?.lines || []).map((line) => ({
          id: `${row?.id || returnId}-${line.variantId}`,
          variantId: line.variantId,
          variantName: line.variantName,
          brandName: line.brandName,
          variantType: line.variantType,
          quantity: line.quantity,
        }))
      ),
    [returnId, row]
  );
  const { data: variantTypes = [] } = useQuery({
    queryKey: ['variant-types', user?.company_id],
    enabled: !!user?.company_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('variant_types')
        .select('name, display_name, color_code')
        .eq('company_id', user!.company_id)
        .eq('is_active', true);
      if (error) throw error;
      return data ?? [];
    },
  });

  const printReturn = () => {
    if (!row) return;
    exportMainInventoryReturnPdf({
      returnedBy: returnedByName,
      returnedTo: row.returnedTo,
      returnedAt: row.returnedAt,
      status: row.status === 'approved' ? 'Approved' : row.status === 'rejected' ? 'Rejected' : 'Pending',
      reason: row.reason,
      lines: row.lines.map((line) => ({
        brandName: line.brandName,
        variantName: line.variantName,
        variantType: line.variantType,
        quantity: line.quantity,
      })),
    });
  };

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
          <h1 className="text-2xl font-semibold tracking-tight text-[#02066F]">Return details</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            To {row.returnedTo} · {format(new Date(row.returnedAt), 'MMM d, yyyy h:mm a')}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {statusBadge(row.status)}
        {row.status === 'approved' ? (
          <Button type="button" variant="outline" onClick={printReturn}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
        ) : null}
      </div>

      {row.reason.trim() ? <p className="text-sm text-muted-foreground">{row.reason.trim()}</p> : null}
      {row.status === 'rejected' && row.rejectionReason ? (
        <p className="text-sm text-destructive">{row.rejectionReason}</p>
      ) : null}

      <MobileSalesAllocationBrandList
        isLoading={false}
        groups={[allocationGroup]}
        variantTypes={variantTypes}
        quantityLabel="Total Returned"
        emptyMessage="This return has no product lines yet."
      />
    </div>
  );
}
