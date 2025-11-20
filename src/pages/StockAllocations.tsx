import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Package, Plus } from 'lucide-react';
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

interface Allocation {
  id: string;
  product: string;
  flavor: string;
  quantity: number;
  allocatedTo: string;
  role: string;
  date: string;
  status: 'pending' | 'completed';
}

const DEMO_ALLOCATIONS: Allocation[] = [
  {
    id: '1',
    product: 'XFORGE',
    flavor: 'Blueberry Ice',
    quantity: 100,
    allocatedTo: 'Bob Manager',
    role: 'manager',
    date: '2024-01-15',
    status: 'completed',
  },
  {
    id: '2',
    product: 'XFORGE',
    flavor: 'Mango Tango',
    quantity: 50,
    allocatedTo: 'Alice Leader',
    role: 'team_leader',
    date: '2024-01-16',
    status: 'pending',
  },
  {
    id: '3',
    product: 'XFORGE',
    flavor: 'Cool Mint',
    quantity: 75,
    allocatedTo: 'Bob Manager',
    role: 'manager',
    date: '2024-01-17',
    status: 'completed',
  },
];

export default function StockAllocations() {
  const { toast } = useToast();
  const [allocations] = useState<Allocation[]>(DEMO_ALLOCATIONS);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleAllocate = () => {
    toast({
      title: 'Stock allocated',
      description: 'The stock has been allocated successfully.',
    });
    setIsDialogOpen(false);
  };

  const getStatusBadge = (status: string) => {
    return status === 'completed' ? (
      <Badge>Completed</Badge>
    ) : (
      <Badge variant="secondary">Pending</Badge>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
              <Package className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Stock Allocations</h1>
              <p className="text-muted-foreground">
                Allocate inventory to managers and team leaders
              </p>
            </div>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Allocate Stock
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Allocate Stock</DialogTitle>
                <DialogDescription>
                  Allocate inventory to a manager or team leader
                </DialogDescription>
              </DialogHeader>
              <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleAllocate(); }}>
                <div className="space-y-2">
                  <Label>Product</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select product" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">XFORGE - Blueberry Ice (850mAh)</SelectItem>
                      <SelectItem value="2">XFORGE - Mango Tango (850mAh)</SelectItem>
                      <SelectItem value="3">XFORGE - Cool Mint (850mAh)</SelectItem>
                      <SelectItem value="4">XFORGE - Grape Fusion (1200mAh)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Quantity</Label>
                  <Input type="number" placeholder="100" />
                </div>
                <div className="space-y-2">
                  <Label>Allocate To</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select user" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manager1">Bob Manager</SelectItem>
                      <SelectItem value="leader1">Alice Leader</SelectItem>
                      <SelectItem value="leader2">Frank Leader</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">Allocate</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4">
          {allocations.map((allocation) => (
            <Card key={allocation.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{allocation.product} - {allocation.flavor}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Allocated to: {allocation.allocatedTo}
                    </p>
                  </div>
                  {getStatusBadge(allocation.status)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Quantity</p>
                    <p className="text-xl font-bold">{allocation.quantity}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Role</p>
                    <p className="font-medium capitalize">{allocation.role.replace('_', ' ')}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Date</p>
                    <p className="font-medium">{allocation.date}</p>
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
