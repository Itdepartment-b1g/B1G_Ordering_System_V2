import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ClipboardList, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

interface PurchaseOrder {
  id: string;
  brand: string;
  flavor: string;
  battery: string;
  quantity: number;
  unitPrice: number;
  totalCost: number;
  supplier: string;
  orderDate: string;
  status: 'pending' | 'completed' | 'cancelled';
}

const DEMO_PURCHASE_ORDERS: PurchaseOrder[] = [
  {
    id: 'PO-001',
    brand: 'XFORGE',
    flavor: 'Blueberry Ice',
    battery: '850mAh',
    quantity: 500,
    unitPrice: 180,
    totalCost: 90000,
    supplier: 'Vape Distributors Inc.',
    orderDate: '2024-01-15',
    status: 'completed',
  },
  {
    id: 'PO-002',
    brand: 'XFORGE',
    flavor: 'Mango Tango',
    battery: '850mAh',
    quantity: 300,
    unitPrice: 180,
    totalCost: 54000,
    supplier: 'Vape Distributors Inc.',
    orderDate: '2024-01-16',
    status: 'pending',
  },
  {
    id: 'PO-003',
    brand: 'XFORGE',
    flavor: 'Grape Fusion',
    battery: '1200mAh',
    quantity: 200,
    unitPrice: 220,
    totalCost: 44000,
    supplier: 'Premium Vapes Ltd.',
    orderDate: '2024-01-17',
    status: 'pending',
  },
];

export default function PurchaseOrders() {
  const { toast } = useToast();
  const [orders] = useState<PurchaseOrder[]>(DEMO_PURCHASE_ORDERS);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleCreateOrder = () => {
    toast({
      title: 'Purchase order created',
      description: 'The purchase order has been created successfully.',
    });
    setIsDialogOpen(false);
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, any> = {
      pending: 'secondary',
      completed: 'default',
      cancelled: 'destructive',
    };
    return <Badge variant={colors[status]}>{status}</Badge>;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
              <ClipboardList className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Purchase Orders</h1>
              <p className="text-muted-foreground">
                Create and manage purchase orders for inventory
              </p>
            </div>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Purchase Order
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create Purchase Order</DialogTitle>
                <DialogDescription>
                  Create a new purchase order to buy stock
                </DialogDescription>
              </DialogHeader>
              <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleCreateOrder(); }}>
                <div className="space-y-2">
                  <Label>Brand</Label>
                  <Input value="XFORGE" disabled />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Flavor</Label>
                    <Input placeholder="Blueberry Ice" />
                  </div>
                  <div className="space-y-2">
                    <Label>Battery</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select battery" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="850mAh">850mAh</SelectItem>
                        <SelectItem value="1200mAh">1200mAh</SelectItem>
                        <SelectItem value="1500mAh">1500mAh</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Quantity</Label>
                    <Input type="number" placeholder="500" />
                  </div>
                  <div className="space-y-2">
                    <Label>Unit Price (₱)</Label>
                    <Input type="number" placeholder="180" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Supplier</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select supplier" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="supplier1">Vape Distributors Inc.</SelectItem>
                      <SelectItem value="supplier2">Premium Vapes Ltd.</SelectItem>
                      <SelectItem value="supplier3">Global Vape Supply</SelectItem>
                    </SelectContent>
                  </Select>
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
        </div>

        <div className="grid gap-4">
          {orders.map((order) => (
            <Card key={order.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{order.id} - {order.brand} {order.flavor}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Supplier: {order.supplier}
                    </p>
                  </div>
                  {getStatusBadge(order.status)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-5 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Battery</p>
                    <p className="font-medium">{order.battery}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Quantity</p>
                    <p className="font-medium">{order.quantity}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Unit Price</p>
                    <p className="font-medium">₱{order.unitPrice}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Cost</p>
                    <p className="text-xl font-bold">₱{order.totalCost.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Order Date</p>
                    <p className="font-medium">{order.orderDate}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
