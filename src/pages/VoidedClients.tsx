import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, RotateCcw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

interface VoidedClient {
  id: string;
  name: string;
  businessName: string;
  city: string;
  voidedBy: string;
  voidedDate: string;
  reason: string;
}

const DEMO_VOIDED: VoidedClient[] = [
  {
    id: '1',
    name: 'Robert Chen',
    businessName: 'Chen Trading',
    city: 'San Francisco',
    voidedBy: 'Admin',
    voidedDate: '2024-01-10',
    reason: 'Business closed',
  },
  {
    id: '2',
    name: 'Lisa Park',
    businessName: 'Park Store',
    city: 'Chicago',
    voidedBy: 'Bob Manager',
    voidedDate: '2024-01-08',
    reason: 'Payment issues',
  },
  {
    id: '3',
    name: 'Mike Johnson',
    businessName: 'Johnson Shop',
    city: 'Dallas',
    voidedBy: 'Super Admin',
    voidedDate: '2024-01-05',
    reason: 'Duplicate entry',
  },
];

export default function VoidedClients() {
  const { toast } = useToast();
  const [clients, setClients] = useState<VoidedClient[]>(DEMO_VOIDED);

  const handleRestore = (clientId: string) => {
    setClients(clients.filter(c => c.id !== clientId));
    toast({
      title: 'Client restored',
      description: 'The client has been restored to the active database.',
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
            <h1 className="text-3xl font-bold text-foreground">Voided Clients</h1>
            <p className="text-muted-foreground">
              View and restore voided client records
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
                  <Badge variant="destructive">Voided</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">City</p>
                      <p className="font-medium">{client.city}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Voided By</p>
                      <p className="font-medium">{client.voidedBy}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Voided Date</p>
                      <p className="font-medium">{client.voidedDate}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Reason</p>
                    <p className="font-medium">{client.reason}</p>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRestore(client.id)}
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Restore Client
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
