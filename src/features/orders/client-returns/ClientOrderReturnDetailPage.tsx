import { useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/features/auth';
import { useAppDispatch, useAppSelector } from '@/store/store';
import { fetchClientOrderReturns } from '@/store/slices/moto-sales/client-returns';
import { BrandTypeLinesList } from './BrandTypeLinesList';
import { ClientReturnExpandedMeta } from './ClientReturnExpandedMeta';
import {
  clientReturnStatusBadgeClass,
  clientReturnTypeBadgeClass,
  formatClientReturnStatus,
  formatClientReturnType,
  getPreviewReturnLineQty,
} from './clientReturnPreview';

export default function ClientOrderReturnDetailPage() {
  const { returnId = '' } = useParams<{ returnId: string }>();
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const rows = useAppSelector((state) => state.motoClientReturns.returns);
  const listStatus = useAppSelector((state) => state.motoClientReturns.listStatus);

  useEffect(() => {
    if (!user?.company_id) return;
    if (listStatus === 'idle' || listStatus === 'failed') {
      void dispatch(fetchClientOrderReturns());
    }
  }, [dispatch, listStatus, user?.company_id]);

  const row = useMemo(() => rows.find((item) => item.id === returnId) || null, [rows, returnId]);
  const loading = listStatus === 'loading' || listStatus === 'idle';
  const qty = row ? getPreviewReturnLineQty(row) : 0;

  if (loading && !row) {
    return (
      <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading return…
      </div>
    );
  }

  if (!row) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1.5" asChild>
          <Link to="/client-order-returns">
            <ArrowLeft className="h-4 w-4" />
            Back to client returns
          </Link>
        </Button>
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <p className="font-medium text-foreground">Return not found</p>
            <Button className="mt-4" asChild>
              <Link to="/client-order-returns">Go to Client Returns</Link>
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
          <Link to="/client-order-returns">
            <ArrowLeft className="h-4 w-4" />
            Back to client returns
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <RotateCcw className="h-5 w-5 text-rose-600" />
          <h1 className="font-mono text-2xl font-semibold tracking-tight">{row.returnNumber}</h1>
          <Badge variant="outline" className={`font-normal ${clientReturnTypeBadgeClass(row.returnType)}`}>
            {formatClientReturnType(row.returnType)}
          </Badge>
          <Badge variant="outline" className={`font-normal ${clientReturnStatusBadgeClass(row.status)}`}>
            {formatClientReturnStatus(row.status)}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {row.orderNumber} · {row.clientName} · {qty} unit{qty === 1 ? '' : 's'}
        </p>
      </div>

      <ClientReturnExpandedMeta row={row} />

      <div className="space-y-2 border-t pt-4">
        <p className="text-sm font-semibold">Returned</p>
        <BrandTypeLinesList lines={row.lines} showStockFate />
      </div>

      {(row.changeLines || []).length > 0 ? (
        <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-semibold">Change item</p>
          <BrandTypeLinesList
            lines={row.changeLines || []}
            qtyClassName="text-emerald-700"
          />
        </div>
      ) : null}
    </div>
  );
}
