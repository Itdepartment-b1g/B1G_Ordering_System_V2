import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/features/auth';
import { subscribeToTable, unsubscribe } from '@/lib/realtime.helpers';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Search, Check, XCircle } from 'lucide-react';

interface PendingClient {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  city?: string;
  agent_id: string;
  agent_name?: string;
  approval_status: 'pending' | 'approved' | 'rejected';
  approval_requested_at?: string;
  approval_notes?: string | null;
  approved_at?: string | null;
  created_at: string;
}

const statusBadge = (status: PendingClient['approval_status']) => {
  switch (status) {
    case 'approved':
      return { label: 'Approved', className: 'bg-green-50 text-green-700 border-green-200' };
    case 'rejected':
      return { label: 'Rejected', className: 'bg-red-50 text-red-700 border-red-200' };
    default:
      return { label: 'Pending Approval', className: 'bg-yellow-50 text-yellow-700 border-yellow-200' };
  }
};

const PendingClientsPage = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<PendingClient[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [clientToReject, setClientToReject] = useState<PendingClient | null>(null);

  const fetchClients = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('clients')
        .select(`
          *,
          profiles:profiles!clients_agent_id_fkey (full_name)
        `)
        .in('approval_status', ['pending', 'rejected'])
        .order('approval_status', { ascending: false })
        .order('approval_requested_at', { ascending: true, nullsFirst: false });

      if (error) throw error;

      const formatted: PendingClient[] = (data || []).map((client: any) => ({
        id: client.id,
        name: client.name,
        email: client.email || undefined,
        phone: client.phone || undefined,
        company: client.company || undefined,
        city: client.city || undefined,
        agent_id: client.agent_id,
        agent_name: client.profiles?.full_name || undefined,
        approval_status: client.approval_status,
        approval_requested_at: client.approval_requested_at || client.created_at,
        approval_notes: client.approval_notes || null,
        approved_at: client.approved_at || null,
        created_at: client.created_at,
      }));

      setClients(formatted);
    } catch (error) {
      console.error('Error fetching pending clients:', error);
      toast({
        title: 'Error',
        description: 'Failed to load pending clients. Please try again later.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();

    // Real-time subscriptions for clients
    const channel = subscribeToTable('clients', () => {
      console.log('🔄 Real-time: Clients updated');
      fetchClients();
    });

    return () => unsubscribe(channel);
  }, []);

  const filteredClients = useMemo(() => {
    return clients.filter(client => {
      const query = searchQuery.toLowerCase();
      return (
        client.name.toLowerCase().includes(query) ||
        (client.email && client.email.toLowerCase().includes(query)) ||
        (client.company && client.company.toLowerCase().includes(query)) ||
        (client.city && client.city.toLowerCase().includes(query))
      );
    });
  }, [clients, searchQuery]);

  const handleApprove = async (client: PendingClient) => {
    try {
      setProcessingId(client.id);
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from('clients')
        .update({
          approval_status: 'approved',
          approval_notes: null,
          approved_at: nowIso,
          approved_by: user?.id || null,
        })
        .eq('id', client.id);

      if (error) throw error;

      toast({ title: 'Client Approved', description: `${client.name} is now approved.` });
      await fetchClients();
      setProcessingId(null);
    } catch (error) {
      console.error('Approve client failed:', error);
      toast({
        title: 'Approval Failed',
        description: 'Unable to approve client. Please try again.',
        variant: 'destructive'
      });
      setProcessingId(null);
    }
  };

  const openRejectDialog = (client: PendingClient) => {
    setClientToReject(client);
    setRejectReason('');
    setRejectDialogOpen(true);
  };

  const handleReject = async () => {
    if (!clientToReject) return;

    try {
      setProcessingId(clientToReject.id);
      const { error } = await supabase
        .from('clients')
        .update({
          approval_status: 'rejected',
          approval_notes: rejectReason || 'Rejected by admin',
          approved_at: null,
          approved_by: null,
        })
        .eq('id', clientToReject.id);

      if (error) throw error;

      toast({ title: 'Client Rejected', description: `${clientToReject.name} has been rejected.` });
      setRejectDialogOpen(false);
      setClientToReject(null);
      await fetchClients();
      setProcessingId(null);
    } catch (error) {
      console.error('Reject client failed:', error);
      toast({
        title: 'Rejection Failed',
        description: 'Unable to reject client. Please try again.',
        variant: 'destructive'
      });
      setProcessingId(null);
    }
  };

  const pendingCount = clients.filter(c => c.approval_status === 'pending').length;
  const rejectedCount = clients.filter(c => c.approval_status === 'rejected').length;

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Pending Clients</h1>
        <p className="text-muted-foreground">
          Review and approve clients submitted by agents that need manual validation.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <p className="text-sm text-muted-foreground">Pending Approval</p>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <p className="text-sm text-muted-foreground">Rejected</p>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rejectedCount}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search clients by name, company, email, or city"
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 text-center text-muted-foreground">Loading pending clients...</div>
          ) : filteredClients.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">No pending clients found.</div>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table className="min-w-[900px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClients.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell className="font-medium">{client.name}</TableCell>
                      <TableCell>{client.company || '—'}</TableCell>
                      <TableCell>{client.email || '—'}</TableCell>
                      <TableCell>{client.phone || '—'}</TableCell>
                      <TableCell>{client.city || '—'}</TableCell>
                      <TableCell>
                        {client.agent_name ? (
                          <Badge variant="secondary" className="text-xs">{client.agent_name}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`border ${statusBadge(client.approval_status).className}`}>
                          {statusBadge(client.approval_status).label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {client.approval_requested_at ? new Date(client.approval_requested_at).toLocaleString() : '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {client.approval_notes || '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleApprove(client)}
                            disabled={processingId === client.id}
                          >
                            <Check className="h-4 w-4 mr-1" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => openRejectDialog(client)}
                            disabled={processingId === client.id}
                          >
                            <XCircle className="h-4 w-4 mr-1" /> Reject
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Client</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Provide a reason for rejecting this client. The agent will be notified of this decision.
            </p>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Enter rejection reason"
              rows={4}
            />
          </div>
          <DialogFooter className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={processingId === clientToReject?.id}>
              Reject Client
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PendingClientsPage;

