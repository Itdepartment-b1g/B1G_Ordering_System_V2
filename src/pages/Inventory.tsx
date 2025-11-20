import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Package, Plus, Edit, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

interface InventoryItem {
  id: string;
  brand: string;
  flavor: string;
  battery: string;
  quantity: number;
  unitPrice: number;
  dsp: number;
  rsp: number;
  specialPrice: number;
  status: 'in-stock' | 'low-stock' | 'out-of-stock';
}

const DEMO_INVENTORY: InventoryItem[] = [
  { id: '1', brand: 'XFORGE', flavor: 'Blueberry Ice', battery: '850mAh', quantity: 500, unitPrice: 180, dsp: 220, rsp: 250, specialPrice: 200, status: 'in-stock' },
  { id: '2', brand: 'XFORGE', flavor: 'Mango Tango', battery: '850mAh', quantity: 45, unitPrice: 180, dsp: 220, rsp: 250, specialPrice: 200, status: 'low-stock' },
  { id: '3', brand: 'XFORGE', flavor: 'Cool Mint', battery: '1200mAh', quantity: 0, unitPrice: 220, dsp: 280, rsp: 320, specialPrice: 260, status: 'out-of-stock' },
];

export default function Inventory() {
  const { toast } = useToast();
  const [inventory, setInventory] = useState<InventoryItem[]>(DEMO_INVENTORY);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const getStatusBadge = (status: string) => {
    const colors: Record<string, any> = { 'in-stock': 'default', 'low-stock': 'secondary', 'out-of-stock': 'destructive' };
    return <Badge variant={colors[status]}>{status}</Badge>;
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
              <h1 className="text-3xl font-bold">Main Inventory</h1>
              <p className="text-muted-foreground">Manage XFORGE vape inventory</p>
            </div>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />Add Product</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Vape Product</DialogTitle>
              </DialogHeader>
              <form className="space-y-4">
                <div className="space-y-2"><Label>Brand</Label><Input value="XFORGE" disabled /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Flavor</Label><Input placeholder="Blueberry Ice" /></div>
                  <div className="space-y-2"><Label>Battery</Label>
                    <Select><SelectTrigger><SelectValue placeholder="Select battery" /></SelectTrigger>
                      <SelectContent><SelectItem value="850mAh">850mAh</SelectItem><SelectItem value="1200mAh">1200mAh</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                  <Button type="submit">Add</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
        <div className="grid gap-4">
          {inventory.map((item) => (
            <Card key={item.id}>
              <CardHeader>
                <div className="flex justify-between">
                  <div><CardTitle>{item.brand} - {item.flavor}</CardTitle><p className="text-sm text-muted-foreground">{item.battery}</p></div>
                  {getStatusBadge(item.status)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-5 gap-4">
                  <div><p className="text-sm text-muted-foreground">Qty</p><p className="font-bold">{item.quantity}</p></div>
                  <div><p className="text-sm text-muted-foreground">Unit</p><p className="font-bold">₱{item.unitPrice}</p></div>
                  <div><p className="text-sm text-muted-foreground">DSP</p><p className="font-bold">₱{item.dsp}</p></div>
                  <div><p className="text-sm text-muted-foreground">RSP</p><p className="font-bold">₱{item.rsp}</p></div>
                  <div><p className="text-sm text-muted-foreground">Special</p><p className="font-bold">₱{item.specialPrice}</p></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
