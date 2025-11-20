import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Check, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

interface PendingClient {
  id: string;
  name: string;
  businessName: string;
  city: string;
  addedBy: string;
  assignedCity: string;
  date: string;
  reason: string;
}

const DEMO_PENDING: PendingClient[] = [
  {
    id: '1',
    name: 'James Wilson',
    businessName: 'Wilson Retail',
    city: 'Boston',
    addedBy: 'Charlie Sales (New York)',
    assignedCity: 'New York',
    date: '2024-01-18',
    reason: 'Client location outside assigned territory',
  },
  {
    id: '2',
    name: 'Sarah Martinez',
    businessName: 'Martinez Store',
    city: 'Miami',
    addedBy: 'Henry Sales (Los Angeles)',
    assignedCity: 'Los Angeles',
    date: '2024-01-17',
    reason: 'Cross-territory client request',
  },
  {
    id: '3',
    name: 'Tom Anderson',
    businessName: 'Anderson Shop',
    city: 'Seattle',
    addedBy: 'David Sales (New York)',
    assignedCity: 'New York',
    date: '2024-01-16',
    reason: 'Outside city range',
  },
];

export default function PendingClients() {
  const { toast } = useToast();
  const [clients, setClients] = useState<PendingClient[]>(DEMO_PENDING);

  const handleApprove = (clientId: string) => {
    setClients(clients.filter(c => c.id !== clientId));
    toast({
      title: 'Client approved',
      description: 'The client has been added to the database.',
    });
  };

  const handleReject = (clientId: string) => {
    setClients(clients.filter(c => c.id !== clientId));
    toast({
      title: 'Client rejected',
      description: 'The client has been moved to voided clients.',
      variant: 'destructive',
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
            <Users className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Pending Clients</h1>
            <p className="text-muted-foreground">
              Review clients added outside assigned territories
            </p>
          </div>
        </div>

        <div className="grid gap-4">
          {clients.map((client) => (
            <Card key={client.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{client.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">{client.businessName}</p>
                  </div>
                  <Badge variant="secondary">Pending Review</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Client City</p>
                      <p className="font-medium">{client.city}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Added By</p>
                      <p className="font-medium">{client.addedBy}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Date Added</p>
                      <p className="font-medium">{client.date}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Reason</p>
                    <p className="font-medium">{client.reason}</p>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleReject(client.id)}
                    >
                      <X className="mr-2 h-4 w-4" />
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleApprove(client.id)}
                    >
                      <Check className="mr-2 h-4 w-4" />
                      Approve
                    </Button>
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
