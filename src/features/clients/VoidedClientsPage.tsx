import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Search, Building, Loader2, Eye, RotateCcw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { subscribeToTable, unsubscribe } from '@/lib/realtime.helpers';
import { useAuth } from '@/features/auth';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Client {
  id: string;
  agent_id: string;
  agent_name?: string;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  photo_url?: string;
  total_orders: number;
  total_spent: number;
  status: string;
  last_order_date?: string;
  created_at: string;
  updated_at: string;
}

interface Agent {
  id: string;
  name: string;
  cities: string[];
  clientCount: number;
  role?: string;
}

export default function VoidedClientsPage() {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [roleResolved, setRoleResolved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [cityFilter, setCityFilter] = useState<string>('');
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingClient, setViewingClient] = useState<Client | null>(null);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [clientToRestore, setClientToRestore] = useState<Client | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  
  const { toast } = useToast();

  // Resolve role first
  useEffect(() => {
    const resolveRole = async () => {
      try {
        if (!user?.id) {
          setIsAdmin(false);
          setRoleResolved(true);
          return;
        }
        const { data } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();
        setIsAdmin((data?.role || '') === 'admin');
      } catch (error) {
        console.error('Error resolving role:', error);
        setIsAdmin(false);
      } finally {
        setRoleResolved(true);
      }
    };
    resolveRole();
  }, [user?.id]);

  // Fetch voided clients and subscribe after role resolution
  useEffect(() => {
    if (!roleResolved) return;
    fetchVoidedClients();
    fetchAgents();

    const clientsChannel = subscribeToTable('clients', () => fetchVoidedClients());
    return () => {
      unsubscribe(clientsChannel);
    };
  }, [roleResolved, isAdmin, user?.id]);

  const fetchVoidedClients = async () => {
    try {
      setLoading(true);
      const isAgent = !isAdmin && !!user?.id;
      let clientsQuery = supabase
        .from('clients')
        .select(`
          *,
          profiles!clients_agent_id_fkey (
            full_name,
            email
          )
        `)
        .eq('status', 'inactive')
        .order('created_at', { ascending: false });

      if (isAgent && user?.id) {
        clientsQuery = clientsQuery.eq('agent_id', user.id);
      }

      const { data, error } = await clientsQuery;

      if (error) throw error;

      // Prefer aggregated stats from view for accuracy and performance
      let statsQuery = supabase
        .from('client_order_stats')
        .select('client_id, agent_id, total_orders, total_spent, last_order_date');
      if (isAgent && user?.id) {
        statsQuery = statsQuery.eq('agent_id', user.id);
      }
      const { data: statsView, error: statsError } = await statsQuery;

      let ordersByClient: Record<string, { count: number; total: number; last?: string }> = {};
      if (statsView && statsView.length > 0 && !statsError) {
        ordersByClient = statsView.reduce((acc: any, r: any) => {
          acc[r.client_id] = {
            count: r.total_orders || 0,
            total: r.total_spent || 0,
            last: r.last_order_date
          };
          return acc;
        }, {});
      }

      const clientsWithStats = (data || []).map((client: any) => ({
        id: client.id,
        agent_id: client.agent_id,
        agent_name: client.profiles?.full_name || null,
        name: client.name,
        company: client.company,
        email: client.email,
        phone: client.phone,
        address: client.address,
        city: client.city,
        photo_url: client.photo_url,
        total_orders: ordersByClient[client.id]?.count || client.total_orders || 0,
        total_spent: ordersByClient[client.id]?.total || client.total_spent || 0,
        status: client.status,
        last_order_date: ordersByClient[client.id]?.last || client.last_order_date,
        created_at: client.created_at,
        updated_at: client.updated_at,
      }));

      setClients(clientsWithStats);
    } catch (error) {
      console.error('Error fetching voided clients:', error);
      toast({
        title: 'Error',
        description: 'Failed to load voided clients',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Fetch agents with client counts
  const fetchAgents = async () => {
    try {
      setLoadingAgents(true);
      const { data: agentsData, error } = await supabase
        .from('profiles')
        .select('id, full_name, city, role')
        .in('role', ['sales_agent', 'admin'])
        .eq('status', 'active');

      if (error) throw error;

      // Get client counts for each agent
      const agentsWithCounts: Agent[] = await Promise.all(
        (agentsData || []).map(async (agent: any) => {
          const { count } = await supabase
            .from('clients')
            .select('*', { count: 'exact', head: true })
            .eq('agent_id', agent.id)
            .neq('status', 'inactive');

          return {
            id: agent.id,
            name: agent.full_name || '',
            cities: agent.city ? agent.city.split(',').map((c: string) => c.trim()).filter((c: string) => c) : [],
            clientCount: count || 0,
            role: agent.role,
          };
        })
      );

      setAgents(agentsWithCounts);
    } catch (error) {
      console.error('Error fetching agents:', error);
    } finally {
      setLoadingAgents(false);
    }
  };

  // Helper function to determine if a client is unassigned (assigned to admin)
  const isClientUnassigned = (client: Client) => {
    const agent = agents.find(a => a.id === client.agent_id);
    return agent?.role === 'admin' || (isAdmin && client.agent_id === user?.id);
  };

  const handleOpenView = (client: Client) => {
    setViewingClient(client);
    setViewDialogOpen(true);
  };

  const handleOpenRestore = (client: Client) => {
    setClientToRestore(client);
    setRestoreDialogOpen(true);
  };

  const handleConfirmRestore = async () => {
    if (!clientToRestore) return;
    
    try {
      setRestoring(true);
      
      // Restore the client by changing status back to 'active'
      const { error } = await supabase
        .from('clients')
        .update({ status: 'active' })
        .eq('id', clientToRestore.id);

      if (error) throw error;

      // Update local state - remove from voided list
      setClients(clients.filter(c => c.id !== clientToRestore.id));
      
      toast({ 
        title: 'Success', 
        description: `${clientToRestore.name} has been restored successfully` 
      });
      
      setRestoreDialogOpen(false);
      setClientToRestore(null);
    } catch (error) {
      console.error('Error restoring client:', error);
      toast({
        title: 'Error',
        description: 'Failed to restore client. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setRestoring(false);
    }
  };

  // Get unique cities from all voided clients
  const getUniqueCities = () => {
    const cities = new Set<string>();
    clients.forEach(client => {
      if (client.city && client.city.trim() !== '') {
        cities.add(client.city);
      }
    });
    return Array.from(cities).sort();
  };

  const filteredClients = clients.filter(client => {
    const matchesSearch = client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (client.email && client.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (client.company && client.company.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (client.agent_name && client.agent_name.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCity = !cityFilter || client.city === cityFilter;

    return matchesSearch && matchesCity;
  });

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading voided clients...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <p className="text-sm font-medium">Voided Clients</p>
            <Building className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clients.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <p className="text-sm font-medium">Total Orders</p>
            <Building className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {clients.reduce((sum, c) => sum + c.total_orders, 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <p className="text-sm font-medium">Total Revenue</p>
            <Building className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ₱{clients.reduce((sum, c) => sum + c.total_spent, 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">Voided Clients</h1>
              <p className="text-muted-foreground">Manage clients that have been voided</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input
                    placeholder="Search voided clients..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select
                  value={cityFilter || 'ALL'}
                  onValueChange={(v) => setCityFilter(v === 'ALL' ? '' : v)}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Filter by city" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Cities</SelectItem>
                    {getUniqueCities().map((city) => (
                      <SelectItem key={city} value={city}>
                        {city}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          {(searchQuery || cityFilter) && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Filtered results:</span>
              <Badge variant="outline">
                {filteredClients.length} of {clients.length} clients
              </Badge>
              {searchQuery && (
                <Badge variant="outline">
                  Search: "{searchQuery}"
                </Badge>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {/* Mobile: card list */}
          <div className="md:hidden space-y-3">
            {filteredClients.length === 0 ? (
              <div className="text-center text-muted-foreground py-6">No voided clients found</div>
            ) : (
              filteredClients.map((client) => (
                <div key={client.id} className="rounded-lg border bg-background p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    {client.photo_url ? (
                      <img src={client.photo_url} alt={client.name} className="w-12 h-12 rounded-full object-cover border" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                        <Building className="w-6 h-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold truncate">{client.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{client.company || '—'}</div>
                    </div>
                    <Badge variant="destructive" className="text-xs">Voided</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground">Email</div>
                      <div className="truncate">{client.email || '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Phone</div>
                      <div className="truncate">{client.phone || '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Agent</div>
                      <div className="truncate">
                        {isClientUnassigned(client) ? 'No Agent' : (client.agent_name || 'Unknown')}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">City</div>
                      <div className="truncate">{client.city || '—'}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleOpenView(client)}>
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleOpenRestore(client)}>
                      <RotateCcw className="h-4 w-4 mr-1" />
                      Restore
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-center">Photo</TableHead>
                  <TableHead className="text-center">Name</TableHead>
                  <TableHead className="text-center">Company</TableHead>
                  <TableHead className="text-center">Email</TableHead>
                  <TableHead className="text-center">Phone</TableHead>
                  <TableHead className="text-center">Agent</TableHead>
                  <TableHead className="text-center">City</TableHead>
                  <TableHead className="text-center">Orders</TableHead>
                  <TableHead className="text-center">Total Spent</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map((client) => (
                  <TableRow key={client.id}>
                    <TableCell className="text-center">
                      {client.photo_url ? (
                        <div className="relative group">
                          <img 
                            src={client.photo_url} 
                            alt={client.name}
                            className="w-10 h-10 rounded-full object-cover border-2 border-primary cursor-pointer"
                            title="Click to view full size"
                            onClick={() => {
                              const newWindow = window.open();
                              if (newWindow) {
                                newWindow.document.write(`
                                  <html>
                                    <head><title>${client.name}</title></head>
                                    <body style="margin:0; display:flex; justify-content:center; align-items:center; min-height:100vh; background:#f5f5f5;">
                                      <img src="${client.photo_url}" style="max-width:90%; max-height:90%; border-radius:8px; box-shadow:0 4px 20px rgba(0,0,0,0.15);" />
                                    </body>
                                  </html>
                                `);
                              }
                            }}
                          />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto">
                          <Building className="w-5 h-5 text-muted-foreground" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium text-center">{client.name}</TableCell>
                    <TableCell className="text-center">{client.company}</TableCell>
                    <TableCell className="text-center">{client.email}</TableCell>
                    <TableCell className="text-center">{client.phone}</TableCell>
                    <TableCell className="text-center">
                      {isClientUnassigned(client) ? (
                        <Badge variant="secondary" className="text-xs">No Agent</Badge>
                      ) : client.agent_name ? (
                        <Badge variant="secondary" className="text-xs">{client.agent_name}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Unknown</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {client.city ? (
                        <Badge variant="outline" className="text-xs">
                          {client.city}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">{client.total_orders}</TableCell>
                    <TableCell className="text-center">₱{client.total_spent.toLocaleString()}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleOpenView(client)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleOpenRestore(client)}>
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filteredClients.length === 0 && (
              <div className="text-center text-muted-foreground py-8">No voided clients found</div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* View Client Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="w-[92vw] max-w-md sm:max-w-lg md:max-w-2xl lg:max-w-3xl max-h-[85vh] overflow-y-auto md:max-h-none md:overflow-visible">
          <DialogHeader>
            <DialogTitle>Voided Client Details</DialogTitle>
            <DialogDescription>
              View detailed information about this voided client
            </DialogDescription>
          </DialogHeader>
          {viewingClient && (
            <div className="space-y-6 py-2">
              <div className="flex items-center gap-4">
                {viewingClient.photo_url ? (
                  <img src={viewingClient.photo_url} alt={viewingClient.name} className="w-16 h-16 rounded-full object-cover border" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                    <Building className="w-8 h-8 text-muted-foreground" />
                  </div>
                )}
                <div>
                  <h3 className="text-xl font-semibold">{viewingClient.name}</h3>
                  <p className="text-muted-foreground">{viewingClient.company || 'No company'}</p>
                  <Badge variant="destructive" className="mt-1">Voided</Badge>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-muted/40 rounded-lg border">
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="font-medium">{viewingClient.email || '—'}</p>
                </div>
                <div className="p-4 bg-muted/40 rounded-lg border">
                  <p className="text-xs text-muted-foreground">Phone</p>
                  <p className="font-medium">{viewingClient.phone || '—'}</p>
                </div>
                <div className="p-4 bg-muted/40 rounded-lg border">
                  <p className="text-xs text-muted-foreground">Address</p>
                  <p className="font-medium">{viewingClient.address || '—'}</p>
                </div>
                <div className="p-4 bg-muted/40 rounded-lg border">
                  <p className="text-xs text-muted-foreground">City</p>
                  <p className="font-medium">{viewingClient.city || '—'}</p>
                </div>
                <div className="p-4 bg-muted/40 rounded-lg border">
                  <p className="text-xs text-muted-foreground">Agent</p>
                  <p className="font-medium">
                    {isClientUnassigned(viewingClient) ? 'No Agent' : (viewingClient.agent_name || 'Unknown')}
                  </p>
                </div>
                <div className="p-4 bg-muted/40 rounded-lg border">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge variant="destructive">Voided</Badge>
                </div>
                <div className="p-4 bg-muted/40 rounded-lg border">
                  <p className="text-xs text-muted-foreground">Total Orders</p>
                  <p className="font-medium">{viewingClient.total_orders}</p>
                </div>
                <div className="p-4 bg-muted/40 rounded-lg border">
                  <p className="text-xs text-muted-foreground">Total Spent</p>
                  <p className="font-medium">₱{viewingClient.total_spent.toLocaleString()}</p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Restore Confirmation Dialog */}
      <AlertDialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore Client</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to restore <strong>{clientToRestore?.name}</strong>? 
              This will change their status back to active and make them visible in the main clients list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRestore} disabled={restoring}>
              {restoring ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Restoring...
                </>
              ) : (
                'Restore Client'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
