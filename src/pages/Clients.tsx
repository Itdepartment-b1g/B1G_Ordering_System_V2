import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Users, Plus, Check, X, MapPin, Mail, Phone } from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  address: string;
  status: 'active' | 'pending' | 'rejected';
  assignedTo: string;
  totalOrders: number;
  totalRevenue: number;
  createdAt: string;
}

const DEMO_CLIENTS: Client[] = [
  {
    id: '1',
    name: 'ABC Electronics',
    email: 'contact@abcelectronics.com',
    phone: '+1 234 567 8900',
    city: 'New York',
    address: '123 Business Ave, NY 10001',
    status: 'active',
    assignedTo: 'Charlie Sales',
    totalOrders: 15,
    totalRevenue: 125000,
    createdAt: '2024-01-10',
  },
  {
    id: '2',
    name: 'XYZ Retail Corp',
    email: 'info@xyzretail.com',
    phone: '+1 234 567 8901',
    city: 'Los Angeles',
    address: '456 Commerce St, LA 90001',
    status: 'active',
    assignedTo: 'Charlie Sales',
    totalOrders: 22,
    totalRevenue: 185000,
    createdAt: '2024-02-15',
  },
  {
    id: '3',
    name: 'Tech Solutions Inc',
    email: 'sales@techsolutions.com',
    phone: '+1 234 567 8902',
    city: 'San Francisco',
    address: '789 Innovation Blvd, SF 94102',
    status: 'pending',
    assignedTo: 'Charlie Sales',
    totalOrders: 0,
    totalRevenue: 0,
    createdAt: '2024-03-20',
  },
  {
    id: '4',
    name: 'Global Supplies LLC',
    email: 'orders@globalsupplies.com',
    phone: '+1 234 567 8903',
    city: 'Chicago',
    address: '321 Market Plaza, Chicago 60601',
    status: 'active',
    assignedTo: 'Charlie Sales',
    totalOrders: 8,
    totalRevenue: 67000,
    createdAt: '2024-01-25',
  },
];

export default function Clients() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>(DEMO_CLIENTS);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const canApprove = ['admin', 'super_admin'].includes(user?.role || '');
  const canAdd = ['mobile_sales', 'team_leader', 'manager', 'admin', 'super_admin'].includes(user?.role || '');

  const handleApprove = (clientId: string) => {
    setClients(clients.map(client =>
      client.id === clientId
        ? { ...client, status: 'active' as const }
        : client
    ));
    toast({
      title: 'Client approved',
      description: 'The client has been approved successfully.',
    });
  };

  const handleReject = (clientId: string) => {
    setClients(clients.map(client =>
      client.id === clientId
        ? { ...client, status: 'rejected' as const }
        : client
    ));
    toast({
      title: 'Client rejected',
      description: 'The client registration has been rejected.',
      variant: 'destructive',
    });
  };

  const getStatusBadge = (status: Client['status']) => {
    const variants = {
      active: 'default',
      pending: 'warning',
      rejected: 'destructive',
    };
    return (
      <Badge variant={variants[status] as any}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const ClientCard = ({ client }: { client: Client }) => (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{client.name}</CardTitle>
            <p className="text-sm text-muted-foreground">{client.assignedTo}</p>
          </div>
          {getStatusBadge(client.status)}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span>{client.email}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span>{client.phone}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span>{client.address}</span>
            </div>
          </div>
          {client.status === 'active' && (
            <div className="grid grid-cols-2 gap-4 border-t pt-4">
              <div>
                <p className="text-sm text-muted-foreground">Total Orders</p>
                <p className="text-xl font-bold">{client.totalOrders}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                <p className="text-xl font-bold">${client.totalRevenue.toLocaleString()}</p>
              </div>
            </div>
          )}
          {canApprove && client.status === 'pending' && (
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => handleApprove(client.id)}
                className="flex-1"
              >
                <Check className="mr-2 h-4 w-4" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleReject(client.id)}
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
              <Users className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Clients</h1>
              <p className="text-muted-foreground">
                Manage customer accounts and relationships
              </p>
            </div>
          </div>
          {canAdd && (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Client
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Add New Client</DialogTitle>
                  <DialogDescription>
                    Register a new client account
                  </DialogDescription>
                </DialogHeader>
                <form className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Company Name</Label>
                      <Input placeholder="ABC Corp" />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input type="email" placeholder="contact@company.com" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input type="tel" placeholder="+1 234 567 8900" />
                    </div>
                    <div className="space-y-2">
                      <Label>City</Label>
                      <Input placeholder="New York" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Address</Label>
                    <Input placeholder="123 Business Street" />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit">Add Client</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">All Clients</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="pending">Pending Approval</TabsTrigger>
          </TabsList>
          <TabsContent value="all" className="mt-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {clients.map(client => <ClientCard key={client.id} client={client} />)}
            </div>
          </TabsContent>
          <TabsContent value="active" className="mt-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {clients.filter(c => c.status === 'active').map(client => <ClientCard key={client.id} client={client} />)}
            </div>
          </TabsContent>
          <TabsContent value="pending" className="mt-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {clients.filter(c => c.status === 'pending').map(client => <ClientCard key={client.id} client={client} />)}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
