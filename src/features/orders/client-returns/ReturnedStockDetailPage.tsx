import { useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/features/auth';
import { usePermissions } from '@/hooks/usePermissions';
import { useAppDispatch, useAppSelector } from '@/store/store';
import { fetchClientOrderReturns } from '@/store/slices/moto-sales/client-returns';
import { fetchClientReturnStockHolds } from '@/store/slices/moto-sales/return-leader';
import {
  buildReturnedInventoryRows,
  canShowClientOrderReturns,
} from './clientReturnApi';
import { formatVariantType, variantTypeBadgeClass } from './ClientReturnBrandTable';
import { ClientReturnHistoryList } from './ClientReturnHistoryList';

export default function ReturnedStockDetailPage() {
  const { variantId = '' } = useParams<{ variantId: string }>();
  const { user } = useAuth();
  const { hasWarehouseHubLink } = usePermissions();
  const dispatch = useAppDispatch();
  const showReturns = canShowClientOrderReturns(hasWarehouseHubLink, user?.role);
  const isLeader = user?.role === 'team_leader';

  const rows = useAppSelector((state) => state.motoClientReturns.returns);
  const listStatus = useAppSelector((state) => state.motoClientReturns.listStatus);
  const holderId =
    user?.role === 'mobile_sales' || user?.role === 'sales_agent' || user?.role === 'team_leader'
      ? user.id
      : undefined;
  const holdRows = useAppSelector((state) =>
    holderId ? state.motoReturnLeader.holdsByHolderId[holderId] || [] : []
  );
  const holdsStatus = useAppSelector((state) => state.motoReturnLeader.holdsStatus);
  const holdsErrorMsg = useAppSelector((state) => state.motoReturnLeader.holdsError);

  useEffect(() => {
    if (!showReturns || !user?.company_id) return;
    void dispatch(fetchClientOrderReturns());
  }, [dispatch, showReturns, user?.company_id]);

  useEffect(() => {
    if (!showReturns || !holderId) return;
    void dispatch(fetchClientReturnStockHolds(holderId));
  }, [dispatch, holderId, showReturns]);

  const inventoryRow = useMemo(() => {
    const crForDetail = buildReturnedInventoryRows(rows, isLeader ? undefined : { holderId });
    const crByVariant = new Map(crForDetail.map((row) => [row.variantId, row]));

    if (!holdsErrorMsg) {
      const hold = holdRows.find((row) => row.variantId === variantId && row.qty > 0);
      if (!hold) return null;
      return {
        ...hold,
        returns: crByVariant.get(hold.variantId)?.returns || [],
      };
    }

    if (!holderId) return null;
    return buildReturnedInventoryRows(rows, { holderId }).find((row) => row.variantId === variantId) || null;
  }, [holdRows, holdsErrorMsg, holderId, isLeader, rows, variantId]);

  const loading =
    listStatus === 'loading' ||
    listStatus === 'idle' ||
    (!!holderId && (holdsStatus === 'loading' || holdsStatus === 'idle'));

  if (loading && !inventoryRow) {
    return (
      <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading returned items…
      </div>
    );
  }

  if (!inventoryRow) {
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
            <p className="font-medium text-foreground">Returned item not found</p>
            <Button className="mt-4" asChild>
              <Link to="/client-order-returns">Go to Client Returns</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 pb-8 md:p-6">
      <div className="space-y-2">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1.5" asChild>
          <Link to="/client-order-returns">
            <ArrowLeft className="h-4 w-4" />
            Back to client returns
          </Link>
        </Button>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 shrink-0 text-rose-600" />
              <h1 className="text-2xl font-semibold tracking-tight">Returned items</h1>
            </div>
            {inventoryRow.brandName ? (
              <p className="text-sm font-semibold">{inventoryRow.brandName}</p>
            ) : null}
            <p className="text-base font-medium leading-snug">{inventoryRow.variantName}</p>
            {inventoryRow.variantType ? (
              <Badge
                variant="secondary"
                className={`font-normal ${variantTypeBadgeClass(inventoryRow.variantType)}`}
              >
                {formatVariantType(inventoryRow.variantType)}
              </Badge>
            ) : null}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-3xl font-bold tabular-nums leading-none text-rose-700">
              {inventoryRow.qty}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              unit{inventoryRow.qty === 1 ? '' : 's'} returned
            </p>
          </div>
        </div>
      </div>

      <ClientReturnHistoryList
        embedded
        resetKey={inventoryRow.variantId}
        rows={inventoryRow.returns}
        emptyTitle={
          inventoryRow.qty > 0 ? 'No matching client returns' : 'No returns for this variant'
        }
        emptyDescription={
          inventoryRow.qty > 0
            ? 'Stock is held, but linked CR history was not found.'
            : undefined
        }
        getDetailHref={(row) => `/client-order-returns/cr/${row.id}`}
      />
    </div>
  );
}
