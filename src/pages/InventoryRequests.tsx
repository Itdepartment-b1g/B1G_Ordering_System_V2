import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ClipboardList, Check, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

interface InventoryRequest {
  id: string;
  product: string;
  flavor: string;
  quantity: number;
  requestedBy: string;
  role: string;
  date: string;
  status: 'pending' | 'approved' | 'rejected';
  reason: string;
}

const DEMO_REQUESTS: InventoryRequest[] = [
  {
    id: '1',
    product: 'XFORGE',
    flavor: 'Blueberry Ice',
    quantity: 50,
    requestedBy: 'Charlie Sales',
    role: 'mobile_sales',
    date: '2024-01-18',
    status: 'pending',
    reason: 'High demand in current territory',
  },
  {
    id: '2',
    product: 'XFORGE',
    flavor: 'Mango Tango',
    quantity: 30,
    requestedBy: 'Alice Leader',
    role: 'team_leader',
    date: '2024-01-17',
    status: 'approved',
    reason: 'Restocking for team',
  },
  {
    id: '3',
    product: 'XFORGE',
    flavor: 'Cool Mint',
    quantity: 100,
    requestedBy: 'Bob Manager',
    role: 'manager',
    date: '2024-01-16',
    status: 'approved',
    reason: 'New territory expansion',
  },
  {
    id: '4',
    product: 'XFORGE',
    flavor: 'Grape Fusion',
    quantity: 20,
    requestedBy: 'David Sales',
    role: 'mobile_sales',
    date: '2024-01-15',
    status: 'rejected',
    reason: 'Insufficient stock available',
  },
];

export default function InventoryRequests() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<InventoryRequest[]>(DEMO_REQUESTS);

  const handleApprove = (requestId: string) => {
    setRequests(requests.map(req => 
      req.id === requestId ? { ...req, status: 'approved' as const } : req
    ));
    toast({
      title: 'Request approved',
      description: 'The inventory request has been approved.',
    });
  };

  const handleReject = (requestId: string) => {
    setRequests(requests.map(req => 
      req.id === requestId ? { ...req, status: 'rejected' as const } : req
    ));
    toast({
      title: 'Request rejected',
      description: 'The inventory request has been rejected.',
      variant: 'destructive',
    });
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, any> = {
      pending: 'secondary',
      approved: 'default',
      rejected: 'destructive',
    };
    return <Badge variant={colors[status]}>{status}</Badge>;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
            <ClipboardList className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Inventory Requests</h1>
            <p className="text-muted-foreground">
              Review and approve stock requests from team members
            </p>
          </div>
        </div>

        <div className="grid gap-4">
          {requests.map((request) => (
            <Card key={request.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{request.product} - {request.flavor}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Requested by: {request.requestedBy}
                    </p>
                  </div>
                  {getStatusBadge(request.status)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Quantity</p>
                      <p className="text-xl font-bold">{request.quantity}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Role</p>
                      <p className="font-medium capitalize">{request.role.replace('_', ' ')}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Date</p>
                      <p className="font-medium">{request.date}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Reason</p>
                    <p className="font-medium">{request.reason}</p>
                  </div>
                  {request.status === 'pending' && (
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReject(request.id)}
                      >
                        <X className="mr-2 h-4 w-4" />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleApprove(request.id)}
                      >
                        <Check className="mr-2 h-4 w-4" />
                        Approve
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
