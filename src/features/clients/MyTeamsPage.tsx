import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, Edit, Eye, Loader2, Users, Filter, Building, Mail, Phone, MapPin, FileText, User, Tag, Camera, ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';
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
  email?: string;
  phone?: string;
  company?: string;
  address?: string;
  photo_url?: string;
  city?: string;
  total_orders: number;
  account_type: 'Key Accounts' | 'Standard Accounts';
  category: 'Permanently Closed' | 'Renovating' | 'Open';
  status: 'active' | 'inactive';
  has_forge: boolean;
  cor_url?: string;
  contact_person?: string;
  tin?: string;
  created_at: string;
  approval_status: 'pending' | 'approved' | 'rejected';
  tax_status?: 'Tax on Sales' | 'Tax Exempt';
  brand_ids?: string[];
  shop_type?: string;
  last_order_date?: string | null;
  visit_count?: number;
  total_spent?: number;
}

interface TeamAgent {
  id: string;
  full_name: string;
  email: string;
}

export default function MyTeamsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [teamAgents, setTeamAgents] = useState<TeamAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [cityFilter, setCityFilter] = useState<string>('all');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // View Client Dialog
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingClient, setViewingClient] = useState<Client | null>(null);
  
  // Edit Client Dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    company: '',
    email: '',
    phone: '',
    contact_person: '',
    tin: '',
    account_type: 'Standard Accounts' as 'Key Accounts' | 'Standard Accounts',
    category: 'Open' as 'Permanently Closed' | 'Renovating' | 'Open',
    has_forge: false,
    brand_ids: [] as string[],
    shop_type: ''
  });
  const [updateConfirmOpen, setUpdateConfirmOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Shop Types
  const [shopTypes, setShopTypes] = useState<Array<{ id: string; type_name: string; is_default: boolean }>>([]);
  const [isEditOtherShopType, setIsEditOtherShopType] = useState(false);
  const [editCustomShopType, setEditCustomShopType] = useState('');

  // Brands
  const [brands, setBrands] = useState<Array<{ id: string; name: string }>>([]);

  // Fetch team agents
  useEffect(() => {
    if (user?.id && user?.role === 'team_leader') {
      fetchTeamAgents();
    }
  }, [user?.id, user?.role]);

  // Fetch clients
  useEffect(() => {
    if (user?.id && user?.role === 'team_leader') {
      fetchClients();
    }
  }, [user?.id, user?.role]);

  // Fetch brands
  useEffect(() => {
    if (user?.company_id) {
      fetchBrands();
    }
  }, [user?.company_id]);

  // Fetch shop types
  useEffect(() => {
    if (user?.company_id) {
      fetchShopTypes();
    }
  }, [user?.company_id]);

  const fetchTeamAgents = async () => {
    try {
      const { data, error } = await supabase
        .from('leader_teams')
        .select('agent_id, profiles:agent_id(id, full_name, email)')
        .eq('leader_id', user?.id);

      if (error) throw error;

      const agents = data?.map((item: any) => ({
        id: item.profiles.id,
        full_name: item.profiles.full_name,
        email: item.profiles.email
      })) || [];

      // Add team leader's own entry to the agents list
      if (user?.id && user?.full_name) {
        agents.push({
          id: user.id,
          full_name: user.full_name,
          email: user.email || ''
        });
      }

      setTeamAgents(agents);
    } catch (error) {
      console.error('Error fetching team agents:', error);
    }
  };

  const fetchClients = async () => {
    try {
      setLoading(true);

      // First, get all agent IDs under this leader
      const { data: teamData, error: teamError } = await supabase
        .from('leader_teams')
        .select('agent_id')
        .eq('leader_id', user?.id);

      if (teamError) throw teamError;

      const agentIds = teamData?.map(t => t.agent_id) || [];

      // Include team leader's own ID in the agent list
      if (user?.id) {
        agentIds.push(user.id);
      }

      if (agentIds.length === 0) {
        setClients([]);
        setLoading(false);
        return;
      }

      // Fetch clients for these agents (same shape as MyClientsPage: last_order_date, visit_count)
      const { data, error } = await supabase
        .from('clients')
        .select(`
          *,
          profiles:agent_id(full_name, email),
          visit_logs(count)
        `)
        .in('agent_id', agentIds)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const clientIds = (data || []).map((c: any) => c.id);
      let ordersByClient: Record<string, { count: number; total: number }> = {};
      if (clientIds.length > 0) {
        const { data: approvedOrders } = await supabase
          .from('client_orders')
          .select('client_id, total_amount')
          .in('client_id', clientIds)
          .in('agent_id', agentIds)
          .or('stage.eq.admin_approved,status.eq.approved');
        ordersByClient = (approvedOrders || []).reduce((acc: Record<string, { count: number; total: number }>, o: any) => {
          const cid = o.client_id;
          if (!acc[cid]) acc[cid] = { count: 0, total: 0 };
          acc[cid].count += 1;
          acc[cid].total += Number(o.total_amount) || 0;
          return acc;
        }, {});
      }

      const formattedClients: Client[] = (data || []).map((client: any) => {
        const orderStats = ordersByClient[client.id];
        return {
          id: client.id,
          agent_id: client.agent_id,
          agent_name: client.profiles?.full_name || 'Unknown',
          name: client.name,
          email: client.email,
          phone: client.phone,
          company: client.company,
          address: client.address,
          photo_url: client.photo_url,
          city: client.city,
          total_orders: orderStats?.count ?? 0,
          account_type: client.account_type || 'Standard Accounts',
          category: client.category || 'Open',
          status: client.status || 'active',
          has_forge: client.has_forge || false,
          cor_url: client.cor_url,
          contact_person: client.contact_person,
          tin: client.tin,
          created_at: client.created_at,
          approval_status: client.approval_status || 'approved',
          tax_status: client.tax_status,
          brand_ids: client.brand_ids || [],
          shop_type: client.shop_type,
          last_order_date: client.last_order_date ?? null,
          visit_count: client.visit_logs?.[0]?.count ?? 0,
          total_spent: orderStats?.total ?? 0
        };
      });

      setClients(formattedClients);
    } catch (error) {
      console.error('Error fetching clients:', error);
      toast({
        title: 'Error',
        description: 'Failed to load team clients',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const getApprovalStatusBadge = (status: Client['approval_status']) => {
    switch (status) {
      case 'approved':
        return { label: 'Approved', className: 'bg-green-50 text-green-700 border-green-200' };
      case 'rejected':
        return { label: 'Rejected', className: 'bg-red-50 text-red-700 border-red-200' };
      default:
        return { label: 'Pending Approval', className: 'bg-yellow-50 text-yellow-700 border-yellow-200' };
    }
  };

  const fetchBrands = async () => {
    try {
      const { data, error } = await supabase
        .from('brands')
        .select('id, name')
        .eq('company_id', user?.company_id)
        .order('name');

      if (error) throw error;
      setBrands(data || []);
    } catch (error) {
      console.error('Error fetching brands:', error);
    }
  };

  const fetchShopTypes = async () => {
    try {
      const { data, error } = await supabase
        .from('shop_types')
        .select('id, type_name, is_default')
        .eq('company_id', user?.company_id)
        .order('is_default', { ascending: false })
        .order('type_name');

      if (error) throw error;
      setShopTypes(data || []);
    } catch (error) {
      console.error('Error fetching shop types:', error);
    }
  };

  const handleOpenViewClient = (client: Client) => {
    setViewingClient(client);
    setViewDialogOpen(true);
  };

  const handleOpenEditClient = (client: Client) => {
    setEditingClient(client);
    
    // Check if shop type is "Other" (not in the default list)
    const isOther = client.shop_type && !shopTypes.some(st => st.type_name === client.shop_type);
    
    setEditForm({
      name: client.name,
      company: client.company || '',
      email: client.email || '',
      phone: client.phone?.replace('+63 ', '') || '',
      contact_person: client.contact_person || '',
      tin: client.tin || '',
      account_type: client.account_type,
      category: client.category,
      has_forge: client.has_forge,
      brand_ids: client.brand_ids || [],
      shop_type: isOther ? 'Other' : (client.shop_type || '')
    });

    setIsEditOtherShopType(isOther);
    setEditCustomShopType(isOther ? (client.shop_type || '') : '');
    setEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingClient) return;

    if (!editForm.name.trim() || !editForm.company.trim() || !editForm.email.trim() || !editForm.phone.trim()) {
      toast({ title: 'Error', description: 'All fields except photo are required', variant: 'destructive' });
      return;
    }

    setUpdateConfirmOpen(true);
  };

  const handleConfirmUpdate = async () => {
    if (!editingClient) return;

    setIsUpdating(true);
    try {
      // Validate shop type for duplicates (Edit)
      if (isEditOtherShopType && editCustomShopType.trim()) {
        const normalizedCustomType = editCustomShopType.trim().toLowerCase();
        const existingShopType = shopTypes.find(
          (type) => type.type_name.toLowerCase() === normalizedCustomType
        );

        if (existingShopType) {
          toast({
            title: 'Duplicate Shop Type',
            description: `"${editCustomShopType.trim()}" already exists in the shop types. Please select it from the dropdown instead.`,
            variant: 'destructive'
          });
          setIsUpdating(false);
          setUpdateConfirmOpen(false);
          return;
        }
      }

      // Handle custom shop type if "Other" is selected
      let finalShopType = editForm.shop_type;
      if (isEditOtherShopType && editCustomShopType.trim()) {
        // Insert custom shop type into shop_types table
        const { error: shopTypeError } = await supabase
          .from('shop_types')
          .insert({
            company_id: user.company_id,
            type_name: editCustomShopType.trim(),
            is_default: false,
            created_by: user.id
          });
        
        // If error is due to duplicate (UNIQUE constraint), it's okay - just use the value
        if (shopTypeError && !shopTypeError.message.includes('duplicate')) {
          console.error('Error inserting custom shop type:', shopTypeError);
        }
        
        finalShopType = editCustomShopType.trim();
        
        // Refresh shop types list to include the new type
        fetchShopTypes();
      }

      const updateData: any = {
        name: editForm.name,
        company: editForm.company || null,
        email: editForm.email || null,
        phone: editForm.phone ? `+63 ${editForm.phone}` : null,
        contact_person: editForm.contact_person || null,
        tin: editForm.tin || null,
        account_type: editForm.account_type,
        category: editForm.category,
        has_forge: editForm.has_forge,
        brand_ids: editForm.brand_ids.length > 0 ? editForm.brand_ids : null,
        shop_type: finalShopType || null,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('clients')
        .update(updateData)
        .eq('id', editingClient.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: `${editForm.name} has been updated successfully`
      });

      setUpdateConfirmOpen(false);
      setEditDialogOpen(false);
      setEditingClient(null);
      
      // Refresh client list
      fetchClients();
    } catch (error: any) {
      console.error('Error updating client:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update client',
        variant: 'destructive'
      });
    } finally {
      setIsUpdating(false);
    }
  };

  // Filter clients
  const filteredClients = clients.filter(client => {
    const matchesSearch =
      client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.company?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.agent_name?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesAgent = selectedAgent === 'all' || client.agent_id === selectedAgent;
    const matchesCity = cityFilter === 'all' || (client.city || '').toLowerCase() === cityFilter.toLowerCase();

    return matchesSearch && matchesAgent && matchesCity;
  });

  // Get unique cities for filter
  const getUniqueCities = () => {
    const cities = clients
      .map(c => c.city)
      .filter((city): city is string => Boolean(city && city.trim()))
      .filter((city, index, self) => self.indexOf(city) === index)
      .sort();
    return cities;
  };

  // Pagination
  const totalPages = Math.ceil(filteredClients.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedClients = filteredClients.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedAgent, cityFilter]);

  if (!user || user.role !== 'team_leader') {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Access denied. Team Leaders only.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">My Team's Clients</h1>
          <p className="text-sm text-muted-foreground mt-1">
            View and manage clients from your team members
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{filteredClients.length}</div>
              <p className="text-xs text-muted-foreground">
                Across {teamAgents.length} team member{teamAgents.length !== 1 ? 's' : ''}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Key Accounts</CardTitle>
              <Building className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {filteredClients.filter(c => c.account_type === 'Key Accounts').length}
              </div>
              <p className="text-xs text-muted-foreground">High-value clients</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Team Members</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{teamAgents.length}</div>
              <p className="text-xs text-muted-foreground">Active agents</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {filteredClients.reduce((sum, c) => sum + c.total_orders, 0)}
              </div>
              <p className="text-xs text-muted-foreground">All team orders</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Clients Table */}
      <Card>
        <CardHeader>
          <div className="space-y-4">
            <CardTitle className="text-lg">Clients ({filteredClients.length})</CardTitle>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search clients..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={cityFilter} onValueChange={setCityFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by city" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Cities</SelectItem>
                    {getUniqueCities().map(city => (
                      <SelectItem key={city} value={city}>
                        {city}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="All Agents" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Agents</SelectItem>
                    {teamAgents.map(agent => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {(searchQuery || (cityFilter && cityFilter !== 'all') || (selectedAgent && selectedAgent !== 'all')) && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Showing {filteredClients.length} of {clients.length} clients</span>
                {cityFilter && cityFilter !== 'all' && (
                  <Badge variant="secondary" className="text-xs">
                    City: {cityFilter}
                  </Badge>
                )}
                {selectedAgent && selectedAgent !== 'all' && (
                  <Badge variant="secondary" className="text-xs">
                    Agent: {teamAgents.find(a => a.id === selectedAgent)?.full_name || 'Unknown'}
                  </Badge>
                )}
                {searchQuery && (
                  <Badge variant="secondary" className="text-xs">
                    Search: "{searchQuery}"
                  </Badge>
                )}
              </div>
            )}
            {filteredClients.length > 0 && (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  Showing {startIndex + 1}-{Math.min(endIndex, filteredClients.length)} of {filteredClients.length} clients
                </span>
                <span>Page {currentPage} of {totalPages}</span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-center">Photo</TableHead>
                  <TableHead className="text-center">Trade Name</TableHead>
                  <TableHead className="text-center">Shop Name</TableHead>
                  <TableHead className="text-center">Email</TableHead>
                  <TableHead className="text-center">Phone</TableHead>
                  <TableHead className="text-center">Agent</TableHead>
                  <TableHead className="text-center">City</TableHead>
                  <TableHead className="text-center">Account Type</TableHead>
                  <TableHead className="text-center">Category</TableHead>
                  <TableHead className="text-center">Orders</TableHead>
                  <TableHead className="text-center">Total Spent</TableHead>
                  <TableHead className="text-center">Visits</TableHead>
                  <TableHead className="text-center">Approval</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedClients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={14} className="text-center py-8 text-muted-foreground">
                      No clients found
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedClients.map(client => (
                    <TableRow key={client.id}>
                      <TableCell className="text-center">
                        {client.photo_url ? (
                          <div className="flex justify-center">
                            <img
                              src={client.photo_url}
                              alt={client.name}
                              className="w-10 h-10 rounded-full object-cover border-2 border-primary"
                            />
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto">
                            <Building className="w-5 h-5 text-muted-foreground" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-medium text-center">{client.name}</TableCell>
                      <TableCell className="text-center">{client.company || '-'}</TableCell>
                      <TableCell className="text-center">{client.email || '-'}</TableCell>
                      <TableCell className="text-center">{client.phone || '-'}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <User className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm">{client.agent_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">{client.city || '-'}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={client.account_type === 'Key Accounts' ? 'default' : 'secondary'} className="text-xs">
                          {client.account_type === 'Key Accounts' ? 'Key' : 'Standard'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={
                            client.category === 'Open'
                              ? 'default'
                              : client.category === 'Renovating'
                              ? 'secondary'
                              : 'destructive'
                          }
                          className="text-xs"
                        >
                          {client.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">{client.total_orders}</TableCell>
                      <TableCell className="text-center">
                        ₱{typeof client.total_spent === 'number' ? client.total_spent.toFixed(2) : '0.00'}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1 font-medium text-purple-600">
                          <MapPin className="h-3 w-3" />
                          {client.visit_count ?? 0}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={`border text-xs ${getApprovalStatusBadge(client.approval_status).className}`}>
                          {getApprovalStatusBadge(client.approval_status).label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center gap-1 md:gap-2">
                          <Button variant="ghost" size="icon" className="h-8 w-8 md:h-10 md:w-10" onClick={() => handleOpenViewClient(client)} title="View Details">
                            <Eye className="h-3.5 w-3.5 md:h-4 md:w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 md:h-10 md:w-10" onClick={() => handleOpenEditClient(client)} title="Edit">
                            <Edit className="h-3.5 w-3.5 md:h-4 md:w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          {filteredClients.length > itemsPerPage && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 mt-4 border-t">
              <div className="text-xs sm:text-sm text-muted-foreground">
                Showing {startIndex + 1}-{Math.min(endIndex, filteredClients.length)} of {filteredClients.length} clients
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="h-8 px-2 sm:px-4"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="hidden sm:inline ml-1">Previous</span>
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(page => page === 1 || page === totalPages || (page >= currentPage - 1 && page <= currentPage + 1))
                    .map((page, index, array) => {
                      const prevPage = array[index - 1];
                      const showEllipsis = prevPage && page - prevPage > 1;
                      return (
                        <div key={page} className="flex items-center gap-1">
                          {showEllipsis && <span className="px-2 text-muted-foreground">...</span>}
                          <Button
                            variant={currentPage === page ? 'default' : 'outline'}
                            size="sm"
                            className="w-10"
                            onClick={() => setCurrentPage(page)}
                          >
                            {page}
                          </Button>
                        </div>
                      );
                    })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="h-8 px-2 sm:px-4"
                >
                  <span className="hidden sm:inline mr-1">Next</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* View Client Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Client Details</DialogTitle>
            <DialogDescription>View complete client information</DialogDescription>
          </DialogHeader>
          {viewingClient && (
            <div className="space-y-6">
              {/* Photo */}
              {viewingClient.photo_url && (
                <div className="flex justify-center">
                  <img
                    src={viewingClient.photo_url}
                    alt={viewingClient.name}
                    className="w-32 h-32 rounded-lg object-cover border"
                  />
                </div>
              )}

              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Trade Name</Label>
                  <p className="font-medium">{viewingClient.name}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Assigned Agent</Label>
                  <p className="font-medium">{viewingClient.agent_name}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Shop Name</Label>
                  <p className="font-medium">{viewingClient.company || '-'}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <p className="font-medium">{viewingClient.email || '-'}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Phone</Label>
                  <p className="font-medium">{viewingClient.phone || '-'}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">City</Label>
                  <p className="font-medium">{viewingClient.city || '-'}</p>
                </div>
                <div className="md:col-span-2">
                  <Label className="text-xs text-muted-foreground">Address</Label>
                  <p className="font-medium">{viewingClient.address || '-'}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Contact Person</Label>
                  <p className="font-medium">{viewingClient.contact_person || '-'}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">TIN</Label>
                  <p className="font-medium">{viewingClient.tin || '-'}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Shop Type</Label>
                  <p className="font-medium">{viewingClient.shop_type || '-'}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Account Type</Label>
                  <Badge variant={viewingClient.account_type === 'Key Accounts' ? 'default' : 'secondary'}>
                    {viewingClient.account_type}
                  </Badge>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Category</Label>
                  <Badge>{viewingClient.category}</Badge>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Total Orders</Label>
                  <p className="font-medium">{viewingClient.total_orders}</p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Client Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Client</DialogTitle>
            <DialogDescription>Update client information</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Trade Name *</Label>
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="Enter trade name"
                />
              </div>
              <div>
                <Label>Shop Name</Label>
                <Input
                  value={editForm.company}
                  onChange={(e) => setEditForm({ ...editForm, company: e.target.value })}
                  placeholder="Enter shop name"
                />
              </div>
              <div>
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  placeholder="client@example.com"
                />
              </div>
              <div>
                <Label>Phone *</Label>
                <div className="flex">
                  <span className="inline-flex items-center px-3 border border-r-0 border-input bg-muted rounded-l-md text-sm">
                    +63
                  </span>
                  <Input
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    placeholder="9XX XXX XXXX"
                    className="rounded-l-none"
                  />
                </div>
              </div>
              <div>
                <Label>Contact Person</Label>
                <Input
                  value={editForm.contact_person}
                  onChange={(e) => setEditForm({ ...editForm, contact_person: e.target.value })}
                  placeholder="Enter contact person"
                />
              </div>
              <div>
                <Label>TIN</Label>
                <Input
                  value={editForm.tin}
                  onChange={(e) => setEditForm({ ...editForm, tin: e.target.value })}
                  placeholder="Enter TIN"
                />
              </div>
              <div>
                <Label>Account Type</Label>
                <Select
                  value={editForm.account_type}
                  onValueChange={(value: 'Key Accounts' | 'Standard Accounts') =>
                    setEditForm({ ...editForm, account_type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Key Accounts">Key Accounts</SelectItem>
                    <SelectItem value="Standard Accounts">Standard Accounts</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Category</Label>
                <Select
                  value={editForm.category}
                  onValueChange={(value: 'Open' | 'Renovating' | 'Permanently Closed') =>
                    setEditForm({ ...editForm, category: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Open">Open</SelectItem>
                    <SelectItem value="Renovating">Renovating</SelectItem>
                    <SelectItem value="Permanently Closed">Permanently Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Shop Type */}
              <div className="md:col-span-2">
                <Label>Shop Type</Label>
                <Select
                  value={isEditOtherShopType ? 'Other' : editForm.shop_type}
                  onValueChange={(value) => {
                    if (value === 'Other') {
                      setIsEditOtherShopType(true);
                      setEditForm({ ...editForm, shop_type: 'Other' });
                    } else {
                      setIsEditOtherShopType(false);
                      setEditCustomShopType('');
                      setEditForm({ ...editForm, shop_type: value });
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select shop type" />
                  </SelectTrigger>
                  <SelectContent>
                    {shopTypes.map((type) => (
                      <SelectItem key={type.id} value={type.type_name}>
                        {type.type_name}
                      </SelectItem>
                    ))}
                    <SelectItem value="Other">Other (Custom)</SelectItem>
                  </SelectContent>
                </Select>
                
                {isEditOtherShopType && (
                  <Input
                    className="mt-2"
                    placeholder="Enter custom shop type"
                    value={editCustomShopType}
                    onChange={(e) => setEditCustomShopType(e.target.value)}
                  />
                )}
              </div>

              {/* Brands */}
              <div className="md:col-span-2">
                <Label>Brands</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                  {brands.map((brand) => (
                    <div key={brand.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`edit-brand-${brand.id}`}
                        checked={editForm.brand_ids.includes(brand.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setEditForm({
                              ...editForm,
                              brand_ids: [...editForm.brand_ids, brand.id]
                            });
                          } else {
                            setEditForm({
                              ...editForm,
                              brand_ids: editForm.brand_ids.filter(id => id !== brand.id)
                            });
                          }
                        }}
                      />
                      <label
                        htmlFor={`edit-brand-${brand.id}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        {brand.name}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Has Forge */}
              <div className="md:col-span-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="edit-has-forge"
                    checked={editForm.has_forge}
                    onCheckedChange={(checked) =>
                      setEditForm({ ...editForm, has_forge: checked as boolean })
                    }
                  />
                  <label
                    htmlFor="edit-has-forge"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Has Forge
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setEditDialogOpen(false);
                  setEditingClient(null);
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleSaveEdit}>
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Update Confirmation Dialog */}
      <AlertDialog open={updateConfirmOpen} onOpenChange={setUpdateConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Update</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to update this client's information?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUpdating}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmUpdate} disabled={isUpdating}>
              {isUpdating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                'Confirm'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
