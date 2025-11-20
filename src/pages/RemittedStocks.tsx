import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Package, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

interface RemittedStock {
  id: string;
  product: string;
  flavor: string;
  quantity: number;
  remittedBy: string;
  remittedTo: string;
  date: string;
  status: 'pending' | 'confirmed';
  reason: string;
}

const DEMO_REMITTED: RemittedStock[] = [
  {
    id: '1',
    product: 'XFORGE',
    flavor: 'Blueberry Ice',
    quantity: 15,
    remittedBy: 'Charlie Sales',
    remittedTo: 'Alice Leader',
    date: '2024-01-18',
    status: 'pending',
    reason: 'Excess inventory - slow moving in area',
  },
  {
    id: '2',
    product: 'XFORGE',
    flavor: 'Mango Tango',
    quantity: 10,
    remittedBy: 'David Sales',
    remittedTo: 'Alice Leader',
    date: '2024-01-17',
    status: 'confirmed',
    reason: 'End of week return',
  },
  {
    id: '3',
    product: 'XFORGE',
    flavor: 'Cool Mint',
    quantity: 25,
    remittedBy: 'Emma Sales',
    remittedTo: 'Alice Leader',
    date: '2024-01-16',
    status: 'confirmed',
    reason: 'Territory reassignment',
  },
];

export default function RemittedStocks() {
  const { toast } = useToast();
  const [remitted, setRemitted] = useState<RemittedStock[]>(DEMO_REMITTED);

  const handleConfirm = (id: string) => {
    setRemitted(remitted.map(item => 
      item.id === id ? { ...item, status: 'confirmed' as const } : item
    ));
    toast({
      title: 'Return confirmed',
      description: 'The stock return has been confirmed.',
    });
  };

  const getStatusBadge = (status: string) => {
    return status === 'confirmed' ? (
      <Badge>Confirmed</Badge>
    ) : (
      <Badge variant="secondary">Pending</Badge>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
            <Package className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Remitted Stocks</h1>
            <p className="text-muted-foreground">
              Track stock returns from mobile sales to team leaders
            </p>
          </div>
        </div>

        <div className="grid gap-4">
          {remitted.map((item) => (
            <Card key={item.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{item.product} - {item.flavor}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {item.remittedBy} → {item.remittedTo}
                    </p>
                  </div>
                  {getStatusBadge(item.status)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Quantity Returned</p>
                      <p className="text-xl font-bold">{item.quantity}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Return Date</p>
                      <p className="font-medium">{item.date}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Reason</p>
                    <p className="font-medium">{item.reason}</p>
                  </div>
                  {item.status === 'pending' && (
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        onClick={() => handleConfirm(item.id)}
                      >
                        <Check className="mr-2 h-4 w-4" />
                        Confirm Return
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
