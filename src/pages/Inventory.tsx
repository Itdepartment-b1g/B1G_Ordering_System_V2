import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Package, Plus, Send, ArrowDown } from 'lucide-react';
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

interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  category: string;
  totalStock: number;
  allocated: number;
  available: number;
  unit: string;
  reorderLevel: number;
}

const DEMO_INVENTORY: InventoryItem[] = [
  {
    id: '1',
    sku: 'LAP-001',
    name: 'Business Laptop Pro',
    category: 'Electronics',
    totalStock: 150,
    allocated: 80,
    available: 70,
    unit: 'units',
    reorderLevel: 30,
  },
  {
    id: '2',
    sku: 'MON-002',
    name: '27" 4K Monitor',
    category: 'Electronics',
    totalStock: 200,
    allocated: 120,
    available: 80,
    unit: 'units',
    reorderLevel: 40,
  },
  {
    id: '3',
    sku: 'DES-003',
    name: 'Executive Desk',
    category: 'Furniture',
    totalStock: 50,
    allocated: 30,
    available: 20,
    unit: 'units',
    reorderLevel: 10,
  },
  {
    id: '4',
    sku: 'CHA-004',
    name: 'Ergonomic Chair',
    category: 'Furniture',
    totalStock: 120,
    allocated: 85,
    available: 35,
    unit: 'units',
    reorderLevel: 25,
  },
  {
    id: '5',
    sku: 'STA-005',
    name: 'Office Supplies Pack',
    category: 'Supplies',
    totalStock: 500,
    allocated: 350,
    available: 150,
    unit: 'packs',
    reorderLevel: 100,
  },
];

export default function Inventory() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [inventory, setInventory] = useState<InventoryItem[]>(DEMO_INVENTORY);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isAllocateDialogOpen, setIsAllocateDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);

  const canManage = ['super_admin', 'admin'].includes(user?.role || '');
  const canAllocate = ['super_admin', 'admin', 'manager', 'team_leader'].includes(user?.role || '');

  const handleAllocate = (item: InventoryItem) => {
    setSelectedItem(item);
    setIsAllocateDialogOpen(true);
  };

  const handleRequestInventory = () => {
    toast({
      title: 'Request sent',
      description: 'Your inventory request has been sent to your team leader.',
    });
  };

  const InventoryCard = ({ item }: { item: InventoryItem }) => {
    const isLowStock = item.available <= item.reorderLevel;
    
    return (
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-lg">{item.name}</CardTitle>
              <p className="text-sm text-muted-foreground">{item.sku}</p>
            </div>
            <Badge variant={isLowStock ? 'destructive' : 'default'}>
              {item.category}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Total Stock</p>
                <p className="text-2xl font-bold">{item.totalStock}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Allocated</p>
                <p className="text-2xl font-bold text-warning">{item.allocated}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Available</p>
                <p className="text-2xl font-bold text-success">{item.available}</p>
              </div>
            </div>
            {isLowStock && (
              <div className="rounded-lg bg-destructive/10 p-3">
                <p className="text-sm font-medium text-destructive">
                  Low Stock Alert: Below reorder level of {item.reorderLevel} {item.unit}
                </p>
              </div>
            )}
            <div className="flex gap-2">
              {canAllocate && (
                <Button
                  size="sm"
                  onClick={() => handleAllocate(item)}
                  className="flex-1"
                >
                  <Send className="mr-2 h-4 w-4" />
                  Allocate
                </Button>
              )}
              {user?.role === 'mobile_sales' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRequestInventory}
                  className="flex-1"
                >
                  <ArrowDown className="mr-2 h-4 w-4" />
                  Request
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
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
              <h1 className="text-3xl font-bold text-foreground">Inventory</h1>
              <p className="text-muted-foreground">
                Manage stock and allocations
              </p>
            </div>
          </div>
          {canManage && (
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Item
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Inventory Item</DialogTitle>
                  <DialogDescription>
                    Add a new item to the inventory
                  </DialogDescription>
                </DialogHeader>
                <form className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>SKU</Label>
                      <Input placeholder="LAP-001" />
                    </div>
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="electronics">Electronics</SelectItem>
                          <SelectItem value="furniture">Furniture</SelectItem>
                          <SelectItem value="supplies">Supplies</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Item Name</Label>
                    <Input placeholder="Enter item name" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Quantity</Label>
                      <Input type="number" placeholder="0" />
                    </div>
                    <div className="space-y-2">
                      <Label>Reorder Level</Label>
                      <Input type="number" placeholder="0" />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit">Add Item</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {inventory.map(item => <InventoryCard key={item.id} item={item} />)}
        </div>

        <Dialog open={isAllocateDialogOpen} onOpenChange={setIsAllocateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Allocate Inventory</DialogTitle>
              <DialogDescription>
                Allocate {selectedItem?.name} to team members
              </DialogDescription>
            </DialogHeader>
            <form className="space-y-4">
              <div className="space-y-2">
                <Label>Allocate To</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select user" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alice">Alice Leader (Team Leader)</SelectItem>
                    <SelectItem value="charlie">Charlie Sales (Mobile Sales)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input type="number" placeholder="0" max={selectedItem?.available} />
                <p className="text-xs text-muted-foreground">
                  Available: {selectedItem?.available} {selectedItem?.unit}
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsAllocateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Allocate</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
