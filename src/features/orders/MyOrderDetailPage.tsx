import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import { MyOrderDetailsPanel } from './components/MyOrderDetailsPanel';
import { useOrders } from './OrderContext';
import { generateAndOpenOrderReceiptFromOrder } from './generateOrderReceiptPdf';

export default function MyOrderDetailPage() {
  const { orderId = '' } = useParams<{ orderId: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const { getOrdersByAgent, orders: allOrders } = useOrders();
  const isAdmin = user?.role === 'admin';

  const myOrders = useMemo(
    () => (user ? getOrdersByAgent(user.id) : []),
    [getOrdersByAgent, user]
  );

  const order = useMemo(() => {
    const fromMine = myOrders.find((item) => item.id === orderId);
    if (fromMine) return fromMine;
    return allOrders.find((item) => item.id === orderId) || null;
  }, [allOrders, myOrders, orderId]);

  const loading = !user || (allOrders.length === 0 && myOrders.length === 0 && !order);

  if (loading && !order) {
    return (
      <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading order…
      </div>
    );
  }

  if (!order) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1.5" asChild>
          <Link to="/my-orders">
            <ArrowLeft className="h-4 w-4" />
            Back to my orders
          </Link>
        </Button>
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <p className="font-medium text-foreground">Order not found</p>
            <p className="mt-1 text-sm">It may have been removed, or the link is outdated.</p>
            <Button className="mt-4" asChild>
              <Link to="/my-orders">Go to My Orders</Link>
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
          <Link to="/my-orders">
            <ArrowLeft className="h-4 w-4" />
            Back to my orders
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Order details</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {order.orderNumber} · {order.clientName}
          </p>
        </div>
      </div>

      <MyOrderDetailsPanel
        order={order}
        isAdmin={isAdmin}
        onPrint={() => {
          try {
            generateAndOpenOrderReceiptFromOrder(order);
          } catch (error) {
            toast({
              title: 'Could not open receipt',
              description: error instanceof Error ? error.message : 'Failed to generate order receipt',
              variant: 'destructive',
            });
          }
        }}
      />
    </div>
  );
}
