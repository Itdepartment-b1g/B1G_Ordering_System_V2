import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShoppingCart, Plus, Check, X, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Order {
  id: string;
  orderNumber: string;
  clientName: string;
  items: string;
  quantity: number;
  amount: number;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  approvalStage: string;
  createdBy: string;
  createdAt: string;
}

const DEMO_ORDERS: Order[] = [
  {
    id: '1',
    orderNumber: 'ORD-1001',
    clientName: 'ABC Electronics',
    items: 'Laptops, Monitors',
    quantity: 25,
    amount: 45000,
    status: 'pending',
    approvalStage: 'Team Leader',
    createdBy: 'Charlie Sales',
    createdAt: '2024-03-15',
  },
  {
    id: '2',
    orderNumber: 'ORD-1002',
    clientName: 'XYZ Retail',
    items: 'Office Supplies',
    quantity: 100,
    amount: 12500,
    status: 'approved',
    approvalStage: 'Completed',
    createdBy: 'Charlie Sales',
    createdAt: '2024-03-14',
  },
  {
    id: '3',
    orderNumber: 'ORD-1003',
    clientName: 'Tech Solutions Inc',
    items: 'Software Licenses',
    quantity: 50,
    amount: 75000,
    status: 'pending',
    approvalStage: 'Manager',
    createdBy: 'Alice Leader',
    createdAt: '2024-03-13',
  },
  {
    id: '4',
    orderNumber: 'ORD-1004',
    clientName: 'GlobalMart',
    items: 'Furniture, Accessories',
    quantity: 30,
    amount: 22000,
    status: 'completed',
    approvalStage: 'Completed',
    createdBy: 'Charlie Sales',
    createdAt: '2024-03-12',
  },
];

export default function Orders() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>(DEMO_ORDERS);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleApprove = (orderId: string) => {
    setOrders(orders.map(order =>
      order.id === orderId
        ? { ...order, status: 'approved' as const, approvalStage: 'Completed' }
        : order
    ));
    toast({
      title: 'Order approved',
      description: 'The order has been approved successfully.',
    });
  };

  const handleReject = (orderId: string) => {
    setOrders(orders.map(order =>
      order.id === orderId
        ? { ...order, status: 'rejected' as const }
        : order
    ));
    toast({
      title: 'Order rejected',
      description: 'The order has been rejected.',
      variant: 'destructive',
    });
  };

  const getStatusBadge = (status: Order['status']) => {
    const variants = {
      pending: 'warning',
      approved: 'default',
      rejected: 'destructive',
      completed: 'default',
    };
    return (
      <Badge variant={variants[status] as any}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const canApprove = ['team_leader', 'manager', 'admin', 'super_admin'].includes(user?.role || '');

  const OrderCard = ({ order }: { order: Order }) => (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{order.orderNumber}</CardTitle>
            <p className="text-sm text-muted-foreground">{order.clientName}</p>
          </div>
          {getStatusBadge(order.status)}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Items</p>
              <p className="font-medium">{order.items}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Quantity</p>
              <p className="font-medium">{order.quantity} units</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Amount</p>
              <p className="text-xl font-bold">${order.amount.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Created By</p>
              <p className="font-medium">{order.createdBy}</p>
            </div>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Approval Stage</p>
            <p className="font-medium">{order.approvalStage}</p>
          </div>
          {canApprove && order.status === 'pending' && (
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => handleApprove(order.id)}
                className="flex-1"
              >
                <Check className="mr-2 h-4 w-4" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleReject(order.id)}
                className="flex-1"
              >
                <X className="mr-2 h-4 w-4" />
                Reject
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
              <ShoppingCart className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Orders</h1>
              <p className="text-muted-foreground">
                Manage and track all orders
              </p>
            </div>
          </div>
          {user?.role === 'mobile_sales' && (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  New Order
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Order</DialogTitle>
                  <DialogDescription>
                    Fill in the order details below
                  </DialogDescription>
                </DialogHeader>
                <form className="space-y-4">
                  <div className="space-y-2">
                    <Label>Client</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select client" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="abc">ABC Electronics</SelectItem>
                        <SelectItem value="xyz">XYZ Retail</SelectItem>
                        <SelectItem value="tech">Tech Solutions Inc</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Items</Label>
                    <Input placeholder="Enter items" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Quantity</Label>
                      <Input type="number" placeholder="0" />
                    </div>
                    <div className="space-y-2">
                      <Label>Amount</Label>
                      <Input type="number" placeholder="0.00" />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit">Create Order</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">All Orders</TabsTrigger>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>
          <TabsContent value="all" className="mt-6">
            <div className="grid gap-4 md:grid-cols-2">
              {orders.map(order => <OrderCard key={order.id} order={order} />)}
            </div>
          </TabsContent>
          <TabsContent value="pending" className="mt-6">
            <div className="grid gap-4 md:grid-cols-2">
              {orders.filter(o => o.status === 'pending').map(order => <OrderCard key={order.id} order={order} />)}
            </div>
          </TabsContent>
          <TabsContent value="approved" className="mt-6">
            <div className="grid gap-4 md:grid-cols-2">
              {orders.filter(o => o.status === 'approved').map(order => <OrderCard key={order.id} order={order} />)}
            </div>
          </TabsContent>
          <TabsContent value="completed" className="mt-6">
            <div className="grid gap-4 md:grid-cols-2">
              {orders.filter(o => o.status === 'completed').map(order => <OrderCard key={order.id} order={order} />)}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
