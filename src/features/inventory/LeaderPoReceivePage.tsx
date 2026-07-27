import { useMemo, useState } from 'react';
import { Loader2, PackageCheck, Clock, CheckCircle2, AlertTriangle, Package } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  PoBuyerReceiveDialog,
  type PoReceiveLine,
} from '@/features/orders/components/PoBuyerReceiveDialog';
import type { PurchaseOrder } from '@/features/orders/types';
import {
  LeaderPoReceiveList,
  getTlPoReceiveStats,
} from './components/LeaderPoReceiveList';
import { useLeaderAssignedPoReceives } from './hooks/useLeaderAssignedPoReceives';
import type { TlReceiveListItem } from './types/tlPoReceiveTypes';

type ReceiveTarget = {
  order: TlReceiveListItem;
  deliveryId: string;
  companyId: string;
  drNumber: string | null;
  warehouseLocationId: string | null;
  warehouseLocationName: string | null;
  lines: PoReceiveLine[];
};

function toPurchaseOrder(order: TlReceiveListItem): PurchaseOrder {
  const snap = order.poSnapshot;
  return {
    id: order.id,
    po_number: order.po_number,
    company_id: order.companyId,
    supplier_id: null,
    fulfillment_type: 'warehouse_transfer',
    order_date: order.order_date,
    expected_delivery_date: order.expected_delivery_date,
    subtotal: snap?.subtotal ?? order.total_amount,
    tax_rate: snap?.tax_rate ?? 0,
    tax_amount: snap?.tax_amount ?? 0,
    discount: snap?.discount ?? 0,
    total_amount: order.total_amount,
    status: (snap?.status as PurchaseOrder['status']) || 'fulfilled',
    notes: snap?.notes || order.receiveNotes || '',
    created_by: snap?.created_by || '',
    created_at: snap?.created_at || order.order_date,
    supplier: null,
    items: order.items.map((item, index) => ({
      id: `${order.id}-item-${index}`,
      variant_id: item.variantId,
      brand_name: item.brandName || 'Unknown',
      variant_name: item.variantName,
      variant_type: 'flavor',
      quantity: item.orderedQuantity,
      unit_price: 0,
      total_price: 0,
    })),
  };
}

export default function LeaderPoReceivePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { hasWarehouseHubLink, hasWarehouseHubLinkLoading } = usePermissions();
  const { orders, loading, error, refresh } = useLeaderAssignedPoReceives(
    user?.id,
    user?.company_id,
    hasWarehouseHubLink
  );

  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveTarget, setReceiveTarget] = useState<ReceiveTarget | null>(null);

  const stats = useMemo(() => getTlPoReceiveStats(orders), [orders]);
  const openShortageCount = useMemo(
    () => orders.filter((o) => o.status === 'shortfall_investigation').length,
    [orders]
  );

  const handleOpenReceive = (order: TlReceiveListItem) => {
    const pending = order.pendingReceive;
    if (!pending) {
      toast({
        title: 'Nothing to receive',
        description: 'No dispatched delivery is waiting for receive on this PO.',
        variant: 'destructive',
      });
      return;
    }
    setReceiveTarget({
      order,
      deliveryId: pending.deliveryId,
      companyId: pending.companyId || order.companyId || user?.company_id || '',
      drNumber: pending.drNumber,
      warehouseLocationId: pending.warehouseLocationId,
      warehouseLocationName: pending.warehouseLocationName,
      lines: pending.lines,
    });
    setReceiveOpen(true);
  };

  if (!user || user.role !== 'team_leader') {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>Only team leaders can access this page</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (hasWarehouseHubLinkLoading) {
    return (
      <div className="w-full p-4 md:p-6">
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          Checking warehouse link…
        </div>
      </div>
    );
  }

  if (!hasWarehouseHubLink) {
    return (
      <div className="w-full p-4 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Warehouse not linked</CardTitle>
            <CardDescription>
              PO Receiving becomes available after your company is assigned to a warehouse hub.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <PackageCheck className="h-7 w-7" />
            PO Receiving
          </h1>
          <p className="text-muted-foreground mt-1">
            Confirm receipt for warehouse transfer POs assigned to you.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Awaiting receive</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.awaiting}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Received</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.delivered}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open shortages</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{openShortageCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total assigned</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
      </div>

      {error ? (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      {loading && orders.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading assigned purchase orders…
        </div>
      ) : (
        <LeaderPoReceiveList orders={orders} onReceive={handleOpenReceive} />
      )}

      {receiveTarget ? (
        <PoBuyerReceiveDialog
          open={receiveOpen}
          onOpenChange={(open) => {
            setReceiveOpen(open);
            if (!open) setReceiveTarget(null);
          }}
          deliveryId={receiveTarget.deliveryId}
          purchaseOrderId={receiveTarget.order.id}
          companyId={receiveTarget.companyId}
          drNumber={receiveTarget.drNumber}
          lines={receiveTarget.lines}
          purchaseOrder={toPurchaseOrder(receiveTarget.order)}
          warehouseLocationId={receiveTarget.warehouseLocationId}
          warehouseLocationName={receiveTarget.warehouseLocationName}
          onSuccess={() => {
            setReceiveTarget(null);
            refresh();
          }}
        />
      ) : null}
    </div>
  );
}
