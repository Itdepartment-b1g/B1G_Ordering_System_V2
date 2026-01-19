import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, Edit, Trash2, Building, Camera, Loader2, Filter, Eye, Users, ArrowRightLeft, Upload, X, MapPin, RefreshCw, Download, MoreHorizontal, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { subscribeToTable, unsubscribe } from '@/lib/realtime.helpers';
import { useAuth } from '@/features/auth';
import { exportClientsToExcel } from '@/lib/excel.helpers';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  photo_timestamp?: string;
  location_latitude?: number;
  location_longitude?: number;
  location_accuracy?: number;
  location_captured_at?: string;
  city?: string;
  total_orders: number;
  total_spent: number;
  account_type: 'Key Accounts' | 'Standard Accounts';
  category: 'Permanently Closed' | 'Renovating' | 'Open';
  status: 'active' | 'inactive';
  has_forge: boolean;
  last_order_date?: string;
  cor_url?: string;
  contact_person?: string;
  tin?: string;
  created_at: string;
  updated_at: string;
  approval_status: 'pending' | 'approved' | 'rejected';
  approval_notes?: string;
  approval_requested_at?: string;
  approved_at?: string;
  approved_by?: string | null;
  visit_count: number; // Added
  tax_status?: 'Tax on Sales' | 'Tax Exempt';
}

interface Agent {
  id: string;
  name: string;
  cities: string[];
  clientCount: number;
  role?: string;
}

export default function ClientsPage() {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [allClientsRevenue, setAllClientsRevenue] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isManager, setIsManager] = useState(false);
  const [roleResolved, setRoleResolved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [cityFilter, setCityFilter] = useState<string>('');

  // Edit Dialog States
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    company: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    contact_person: '',
    tin: '',
    account_type: 'Standard Accounts' as 'Key Accounts' | 'Standard Accounts',
    category: 'Open' as 'Permanently Closed' | 'Renovating' | 'Open',
    has_forge: false
  });

  // Delete Confirmation States
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);

  // Update Confirmation States
  const [updateConfirmOpen, setUpdateConfirmOpen] = useState(false);

  // Add Client Dialog States
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    name: '',
    company: '',
    email: '',
    phone: '',
    address: '',
    has_forge: false,
    city: '',
    contact_person: '',
    tin: '',
    account_type: 'Standard Accounts' as 'Key Accounts' | 'Standard Accounts',
    category: 'Open' as 'Permanently Closed' | 'Renovating' | 'Open'
  });
  const [adding, setAdding] = useState(false);

  // Add Client Photo States
  const [newClientPhoto, setNewClientPhoto] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Add COR Photo States
  const [newCorPhoto, setNewCorPhoto] = useState<string | null>(null);
  const corFileInputRef = useRef<HTMLInputElement>(null);

  // Edit COR Photo States
  const [editCorPhoto, setEditCorPhoto] = useState<string | null>(null);
  const editCorFileInputRef = useRef<HTMLInputElement>(null);

  // Edit Client Photo States
  const [editClientPhoto, setEditClientPhoto] = useState<string | null>(null);
  const editClientPhotoInputRef = useRef<HTMLInputElement>(null);

  // Add Client Location States
  const [capturedLocation, setCapturedLocation] = useState<{
    latitude: number;
    longitude: number;
    address: string;
    accuracy: number;
  } | null>(null);
  const [isPrewarmingLocation, setIsPrewarmingLocation] = useState(false);
  const [prewarmPosition, setPrewarmPosition] = useState<GeolocationPosition | null>(null);
  const [agentCities, setAgentCities] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importPreviewOpen, setImportPreviewOpen] = useState(false);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importRows, setImportRows] = useState<Partial<Client>[]>([]);
  const [importSummary, setImportSummary] = useState<{ total: number; valid: number; skipped: number }>({ total: 0, valid: 0, skipped: 0 });

  const { toast } = useToast();
  const importInputRef = useRef<HTMLInputElement>(null);

  // Initialize all agent city tags based on current client assignments
  const initializeAgentCities = async () => {
    try {
      const { data: agents, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'sales_agent')
        .eq('status', 'active');

      if (error) throw error;

      // Update city tags for all agents
      const updatePromises = (agents || []).map(agent =>
        updateAgentCities(agent.id)
      );
      await Promise.all(updatePromises);

      console.log('Initialized city tags for all agents');
    } catch (error) {
      console.error('Error initializing agent cities:', error);
    }
  };

  // Fetch agents with client counts (only roles that can manage clients)
  const fetchAgents = async () => {
    try {
      setLoadingAgents(true);
      const { data: agentsData, error } = await supabase
        .from('profiles')
        .select('id, full_name, city, role')
        .in('role', ['manager', 'team_leader', 'mobile_sales'])
        .eq('company_id', user?.company_id)
        .eq('status', 'active');

      if (error) throw error;

      // Get client counts for each agent
      const agentsWithCounts: Agent[] = await Promise.all(
        (agentsData || []).map(async (agent: any) => {
          const { count } = await supabase
            .from('clients')
            .select('*', { count: 'exact', head: true })
            .eq('agent_id', agent.id);

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
      toast({
        title: 'Error',
        description: 'Failed to load agents',
        variant: 'destructive'
      });
    } finally {
      setLoadingAgents(false);
    }
  };

  // View Dialog States
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingClient, setViewingClient] = useState<Client | null>(null);

  // Transfer Dialog States
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [transferringClient, setTransferringClient] = useState<Client | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [transferring, setTransferring] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);

  // Bulk Transfer States
  const [bulkTransferDialogOpen, setBulkTransferDialogOpen] = useState(false);
  const [bulkTransferring, setBulkTransferring] = useState(false);
  const [bulkTransferAssignments, setBulkTransferAssignments] = useState<Record<string, string>>({});

  // City-based bulk transfer states
  const [cityBulkTransferOpen, setCityBulkTransferOpen] = useState(false);
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedTransferAgent, setSelectedTransferAgent] = useState('');
  const [cityClients, setCityClients] = useState<Client[]>([]);
  const [cityTransferring, setCityTransferring] = useState(false);

  // Export states
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0 });

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Resolve role first
  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      setIsSuperAdmin(false);
      setRoleResolved(true);
      return;
    }

    const userRole = user.role;
    setIsAdmin(userRole === 'admin' || userRole === 'super_admin' || userRole === 'system_administrator');
    setIsSuperAdmin(userRole === 'super_admin' || userRole === 'system_administrator');
    setIsManager(userRole === 'manager');
    setRoleResolved(true);
  }, [user?.role]);

  // Fetch clients and subscribe after role resolution
  useEffect(() => {
    if (!roleResolved) return;
    fetchClients();
    fetchAllClientsRevenue(); // Fetch revenue from all clients (active + inactive)
    // DISABLED: initializeAgentCities() - don't auto-update on page load
    // Cities will be merged automatically when clients are transferred
    // initializeAgentCities(); // Initialize city tags for all agents

    // Pre-warm GPS on page load for seamless location capture when adding clients
    startLocationPrewarm();

    const clientsChannel = subscribeToTable('clients', () => {
      fetchClients();
      fetchAllClientsRevenue(); // Update revenue when clients change
    });
    const ordersChannel = subscribeToTable('client_orders', () => {
      fetchClients();
      fetchAllClientsRevenue(); // Update revenue when orders change
    });
    return () => {
      unsubscribe(clientsChannel);
      unsubscribe(ordersChannel);
    };
  }, [roleResolved, isAdmin, user?.id, user?.company_id]);

  // Fetch agent's cities from profile (only for non-admin users)
  useEffect(() => {
    if (roleResolved && !isAdmin && user?.id) {
      fetchAgentCities();
    } else {
      setAgentCities([]);
    }
  }, [roleResolved, isAdmin, user?.id]);

  const fetchAgentCities = async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('city')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      // Parse comma-separated cities
      const cities = data?.city
        ? data.city.split(',').map(c => c.trim()).filter(c => c.length > 0)
        : [];

      setAgentCities(cities);
    } catch (error) {
      console.error('Error fetching agent cities:', error);
      // Don't show error toast as this is not critical for initial load
    }
  };

  // Helper function to convert photo URL to signed URL if needed
  const getSignedPhotoUrl = async (photoUrl: string | null | undefined): Promise<string | null> => {
    if (!photoUrl) return null;

    // If it's already a signed URL, return as-is
    if (photoUrl.includes('?token=')) {
      return photoUrl;
    }

    // If it's a public URL, extract the path and generate signed URL
    // Public URL format: https://[project].supabase.co/storage/v1/object/public/client-photos/[path]
    const publicUrlMatch = photoUrl.match(/\/storage\/v1\/object\/public\/client-photos\/(.+)$/);
    if (publicUrlMatch) {
      const filePath = publicUrlMatch[1];
      const { data, error } = await supabase.storage
        .from('client-photos')
        .createSignedUrl(filePath, 3600); // 1 hour expiry

      if (!error && data?.signedUrl) {
        return data.signedUrl;
      }
    }

    // Try to extract path from any URL format and generate signed URL
    try {
      const url = new URL(photoUrl);
      const pathParts = url.pathname.split('/client-photos/');
      if (pathParts.length > 1) {
        const filePath = pathParts[1];
        const { data, error } = await supabase.storage
          .from('client-photos')
          .createSignedUrl(filePath, 3600);

        if (!error && data?.signedUrl) {
          return data.signedUrl;
        }
      }
    } catch (e) {
      // URL parsing failed, return original
    }

    // If all else fails, return original URL
    return photoUrl;
  };

  const fetchClients = async () => {
    try {
      setLoading(true);
      const isManager = user?.role === 'manager';
      // Agents see own clients; Managers see team clients; Admins see company clients
      const isAgent = !isAdmin && !isManager && !!user?.id;

      let teamAgentIds: string[] = [];

      if (isManager && user?.id) {
        // Determine team members for Manager
        // Managers see clients of everyone in their team (from leader_teams)
        // Assuming manager is the 'leader_id' in leader_teams
        const { data: teamData, error: teamError } = await supabase
          .from('leader_teams')
          .select('agent_id')
          .eq('leader_id', user.id);

        if (!teamError && teamData) {
          teamAgentIds = teamData.map(t => t.agent_id);
          // Optionally include manager's own clients if they have any? 
          // Usually managers don't have personal clients, but logical to include self.
          teamAgentIds.push(user.id);
        }
      }

      let clientsQuery = supabase
        .from('clients')
        .select(`
          *,
          profiles: agent_id (full_name, email),
          visit_logs (count)
        `)
        .eq('company_id', user?.company_id)
        .neq('status', 'inactive')
        .order('created_at', { ascending: false });

      if (isAgent && user?.id) {
        clientsQuery = clientsQuery.eq('agent_id', user.id);
      } else if (isManager && teamAgentIds.length > 0) {
        clientsQuery = clientsQuery.in('agent_id', teamAgentIds);
      } else if (isManager && teamAgentIds.length === 0) {
        // Manager with no team => see nothing (or just self if allowed)
        clientsQuery = clientsQuery.eq('agent_id', user.id); // Default to self if empty team
      }

      const { data, error } = await clientsQuery;

      if (error) throw error;


      // Prefer aggregated stats from view for accuracy and performance
      let ordersByClient: Record<string, { count: number; total: number; last?: string }> = {};

      // Calculate order stats manually since view is optional/removed
      // Grouped aggregation per client from approved orders

      // Calculate order stats manually
      let ordersQuery = supabase
        .from('client_orders')
        .select('client_id, total_amount, stage, status, order_date, agent_id')
        .or('stage.eq.admin_approved,status.eq.approved');

      if (isAgent && user?.id) {
        ordersQuery = ordersQuery.eq('agent_id', user.id);
      } else if (isManager && teamAgentIds.length > 0) {
        ordersQuery = ordersQuery.in('agent_id', teamAgentIds);
      } else if (isManager) {
        ordersQuery = ordersQuery.eq('agent_id', user.id);
      }

      const { data: approvedOrders } = await ordersQuery;
      ordersByClient = (approvedOrders || []).reduce((acc: any, o: any) => {
        const cid = o.client_id;
        if (!acc[cid]) {
          acc[cid] = { count: 0, total: 0, last: undefined as string | undefined };
        }
        acc[cid].count += 1;
        acc[cid].total += Number(o.total_amount) || 0;
        const d = o.order_date || null;
        if (d) {
          const prev = acc[cid].last ? new Date(acc[cid].last) : undefined;
          if (!prev || new Date(d) > prev) acc[cid].last = d as string;
        }
        return acc;
      }, {} as Record<string, { count: number; total: number; last?: string }>);




      // Convert photo URLs to signed URLs
      const clientsWithSignedPhotos = await Promise.all(
        (data || []).map(async (client: any) => {
          const signedPhotoUrl = await getSignedPhotoUrl(client.photo_url);
          return {
            ...client,
            photo_url: signedPhotoUrl
          };
        })
      );

      const formattedClients: Client[] = clientsWithSignedPhotos.map((client: any) => ({
        id: client.id,
        company_id: client.company_id,
        agent_id: client.agent_id,
        agent_name: client.profiles?.full_name || undefined,
        name: client.name,
        email: client.email,
        phone: client.phone,
        company: client.company,
        address: client.address,
        photo_url: client.photo_url,
        photo_timestamp: client.photo_timestamp,
        location_latitude: client.location_latitude,
        location_longitude: client.location_longitude,
        location_accuracy: client.location_accuracy,
        location_captured_at: client.location_captured_at,
        city: client.city,
        cor_url: client.cor_url,
        contact_person: client.contact_person,
        tin: client.tin,
        total_orders: ordersByClient[client.id]?.count || 0,
        total_spent: ordersByClient[client.id]?.total || 0,
        account_type: client.account_type || 'Standard Accounts',
        category: client.category || 'Open',
        status: client.status || 'active',
        has_forge: client.has_forge || false,
        last_order_date: ordersByClient[client.id]?.last || client.last_order_date,
        created_at: client.created_at,
        updated_at: client.updated_at,
        approval_status: client.approval_status || 'approved',
        approval_notes: client.approval_notes || undefined,
        approval_requested_at: client.approval_requested_at || undefined,
        approved_at: client.approved_at || undefined,
        approved_by: client.approved_by || null,
        visit_count: client.visit_logs?.[0]?.count || 0, // Map count
        tax_status: client.tax_status,
      }));

      setClients(formattedClients);
      // Keep header totals consistent with the table by deriving from per-client totals
      const summedRevenue = formattedClients.reduce((sum, c) => sum + (Number(c.total_spent) || 0), 0);
      setAllClientsRevenue(summedRevenue);
    } catch (error) {
      console.error('Error fetching clients:', error);
      toast({
        title: 'Error',
        description: 'Failed to load clients',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadTemplate = () => {
    const header = 'name,company,email,phone,address,city,account_type,category\n';
    const blob = new Blob([header], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'clients_template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    if (importInputRef.current) {
      importInputRef.current.value = '';
      importInputRef.current.click();
    }
  };

  const handleImportClients = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);

      if (lines.length <= 1) {
        toast({
          title: 'No data',
          description: 'The template file is empty.',
          variant: 'destructive',
        });
        return;
      }

      const [headerLine, ...rows] = lines;
      const headers = headerLine.split(',').map(h => h.trim().toLowerCase());

      const nameIdx = headers.indexOf('name');
      const companyIdx = headers.indexOf('company');
      const emailIdx = headers.indexOf('email');
      const phoneIdx = headers.indexOf('phone');
      const addressIdx = headers.indexOf('address');
      const cityIdx = headers.indexOf('city');
      const accountTypeIdx = headers.indexOf('account_type');
      const categoryIdx = headers.indexOf('category');

      if (nameIdx === -1) {
        toast({
          title: 'Invalid template',
          description: 'The template must include at least a "name" column.',
          variant: 'destructive',
        });
        return;
      }

      const isAdminUser = isAdmin || isSuperAdmin;

      let total = 0;
      let valid = 0;
      let skipped = 0;

      const previewRows = rows.map(row => {
        const cols = row.split(',').map(c => c.trim());
        if (cols.every(c => !c)) {
          return null;
        }
        total += 1;
        if (!cols[nameIdx]) {
          skipped += 1;
          return null;
        }

        const rawAccountType = accountTypeIdx >= 0 ? cols[accountTypeIdx] : '';
        const rawCategory = categoryIdx >= 0 ? cols[categoryIdx] : '';

        const account_type: Client['account_type'] =
          rawAccountType === 'Key Accounts' ? 'Key Accounts' : 'Standard Accounts';
        const category: Client['category'] =
          rawCategory === 'Permanently Closed' || rawCategory === 'Renovating'
            ? (rawCategory as Client['category'])
            : 'Open';

        valid += 1;

        const rowObj: Partial<Client> = {
          name: cols[nameIdx],
          company: companyIdx >= 0 ? cols[companyIdx] || null : null,
          email: emailIdx >= 0 ? cols[emailIdx] || null : null,
          phone: phoneIdx >= 0 ? cols[phoneIdx] || null : null,
          address: addressIdx >= 0 ? cols[addressIdx] || null : null,
          city: cityIdx >= 0 ? cols[cityIdx] || null : null,
          account_type,
          category,
          status: 'active',
          approval_status: isAdminUser ? 'approved' : 'pending',
          agent_id: isAdminUser ? null : user?.id || null,
        };
        return rowObj;
      }).filter(Boolean) as Partial<Client>[];

      if (previewRows.length === 0) {
        toast({
          title: 'No valid rows',
          description: 'No valid client rows were found in the file.',
          variant: 'destructive',
        });
        return;
      }

      setImportHeaders(headers);
      setImportRows(previewRows);
      setImportSummary({ total, valid, skipped });
      setImportPreviewOpen(true);
    } catch (error: any) {
      console.error('Error importing clients:', error);
      toast({
        title: 'Import failed',
        description: error.message || 'An error occurred while importing clients.',
        variant: 'destructive',
      });
    }
  };

  const handleConfirmImportClients = async () => {
    if (importRows.length === 0) {
      toast({
        title: 'Nothing to import',
        description: 'There are no rows to import.',
        variant: 'destructive',
      });
      return;
    }

    try {
      if (!user?.company_id) {
        throw new Error('User company_id not found');
      }

      setImporting(true);

      const nowIso = new Date().toISOString();
      const isAdminUser = isAdmin || isSuperAdmin;

      // Build payload to match normal client creation and RLS expectations
      const insertPayload = importRows.map((row) => {
        const approvalStatus: Client['approval_status'] = isAdminUser ? 'approved' : 'pending';
        const approvalRequestedAt = !isAdminUser ? nowIso : null;
        const approvedAt = approvalStatus === 'approved' ? nowIso : null;

        // For now, imports created by admins/super admins are unassigned (agent_id = null),
        // imports by agents are assigned to themselves
        const agentId = isAdminUser ? null : user.id;

        return {
          company_id: user.company_id,
          name: row.name,
          company: row.company || null,
          email: row.email || null,
          phone: row.phone || null,
          address: row.address || null,
          city: row.city || null,
          account_type: row.account_type || 'Standard Accounts',
          category: row.category || 'Open',
          status: 'active',
          has_forge: false,
          total_orders: 0,
          total_spent: 0,
          photo_url: null,
          photo_timestamp: null,
          location_latitude: null,
          location_longitude: null,
          location_accuracy: null,
          location_captured_at: null,
          approval_status: approvalStatus,
          approval_requested_at: approvalRequestedAt,
          approval_notes: null,
          approved_at: approvedAt,
          approved_by: isAdminUser && approvedAt ? user.id : null,
          agent_id: agentId,
          tax_status: 'Tax Exempt',
        };
      });

      const { error } = await supabase.from('clients').insert(insertPayload);
      if (error) {
        console.error('Import error:', error);
        toast({
          title: 'Import failed',
          description: error.message || 'Failed to import clients from template.',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Import complete',
        description: `${insertPayload.length} client(s) imported successfully.`,
      });

      setImportPreviewOpen(false);
      setImportRows([]);
      setImportHeaders([]);
      setImportSummary({ total: 0, valid: 0, skipped: 0 });
      await fetchClients();
    } catch (error: any) {
      console.error('Error importing clients:', error);
      toast({
        title: 'Import failed',
        description: error.message || 'An error occurred while importing clients.',
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
    }
  };

  // Fetch revenue from ALL clients (active + inactive) for total revenue calculation
  const fetchAllClientsRevenue = async () => {
    try {
      const isAgent = !isAdmin && !!user?.id;

      // Reuse grouped aggregation for total revenue
      let totalAggQuery = supabase
        .from('client_orders')
        .select('sum:total_amount')
        .or('stage.eq.admin_approved,status.eq.approved');
      if (isAgent && user?.id) {
        totalAggQuery = totalAggQuery.eq('agent_id', user.id);
      }
      const { data: totalAgg, error: totalAggError } = await totalAggQuery as any;
      let totalRevenue = 0;
      if (!totalAggError && totalAgg && totalAgg.length > 0) {
        // PostgREST returns an array with one row containing sum
        totalRevenue = Number(totalAgg[0]?.sum) || 0;
      } else {
        // Fallback to row-wise reduce
        let sumQuery = supabase
          .from('client_orders')
          .select('total_amount, stage, status, agent_id')
          .or('stage.eq.admin_approved,status.eq.approved');
        if (isAgent && user?.id) {
          sumQuery = sumQuery.eq('agent_id', user.id);
        }
        const { data: approvedOrdersAll } = await sumQuery;
        totalRevenue = (approvedOrdersAll || []).reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
      }

      setAllClientsRevenue(totalRevenue);
    } catch (error) {
      console.error('Error fetching all clients revenue:', error);
      // Don't show toast for this as it's not critical to the main functionality
    }
  };

  const filteredClients = clients.filter(client => {
    const matchesSearch = client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (client.email && client.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (client.company && client.company.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (client.agent_name && client.agent_name.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCity = !cityFilter || cityFilter === 'all' || client.city === cityFilter;

    return matchesSearch && matchesCity;
  });

  // Pagination calculations
  const totalPages = Math.ceil(filteredClients.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedClients = filteredClients.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, cityFilter]);

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

  const handleOpenEdit = (client: Client) => {
    setEditingClient(client);
    // Strip +63 prefix from phone for editing
    const phoneNumber = client.phone || '';
    const phoneWithoutPrefix = phoneNumber.startsWith('+63 ') ? phoneNumber.slice(4) : phoneNumber;

    setEditForm({
      name: client.name,
      company: client.company || '',
      email: client.email || '',
      phone: phoneWithoutPrefix,
      address: client.address || '',
      city: client.city || '',
      contact_person: client.contact_person || '',
      tin: client.tin || '',
      account_type: client.account_type || 'Standard Accounts',
      category: client.category || 'Open',
      has_forge: client.has_forge || false
    });
    setEditCorPhoto(null); // Reset COR photo state
    setEditClientPhoto(null); // Reset client photo state
    setEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingClient) return;

    if (!editForm.name.trim()) {
      toast({ title: 'Error', description: 'Client name is required', variant: 'destructive' });
      return;
    }

    setUpdateConfirmOpen(true);
  };

  const handleConfirmUpdate = async () => {
    if (!editingClient) return;

    try {
      let corUrl = editingClient.cor_url; // Keep existing COR URL by default
      let photoUrl = editingClient.photo_url; // Keep existing photo URL by default

      // Handle client photo upload if admin/super admin uploaded a new one
      if (editClientPhoto && (isAdmin || isSuperAdmin)) {
        // Convert base64 to blob
        const base64Data = editClientPhoto.split(',')[1];
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'image/jpeg' });

        // Generate unique filename
        const sanitizeName = (str: string) => {
          return str
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
        };

        const clientName = sanitizeName(editForm.name || 'client');
        const clientCompany = sanitizeName(editForm.company || 'company');
        const timestamp = Date.now();

        const fileName = `${user?.id}/${clientName}_${clientCompany}_${timestamp}.jpg`;

        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('client-photos')
          .upload(fileName, blob, {
            contentType: 'image/jpeg',
            upsert: false
          });

        if (uploadError) {
          console.error('Photo upload error:', uploadError);
          throw new Error(`Failed to upload photo: ${uploadError.message}`);
        }

        // Get signed URL (required for private buckets)
        const { data: urlData, error: urlError } = await supabase.storage
          .from('client-photos')
          .createSignedUrl(fileName, 31536000); // 1 year expiry

        if (urlError || !urlData?.signedUrl) {
          throw new Error(`Failed to generate signed URL: ${urlError?.message || 'Unknown error'}`);
        }

        photoUrl = urlData.signedUrl;
      }

      // Handle COR photo upload if admin/super admin uploaded a new one
      if (editCorPhoto && (isAdmin || isSuperAdmin)) {
        // Convert base64 to blob
        const base64Data = editCorPhoto.split(',')[1];
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);

        // Determine content type from base64 prefix
        const isJPG = editCorPhoto.startsWith('data:image/jpeg') || editCorPhoto.startsWith('data:image/jpg');
        const contentType = isJPG ? 'image/jpeg' : 'image/png';
        const fileExtension = isJPG ? 'jpg' : 'png';

        const blob = new Blob([byteArray], { type: contentType });

        // Generate unique filename
        const sanitizeName = (str: string) => {
          return str
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
        };

        const clientName = sanitizeName(editForm.name || 'client');
        const clientCompany = sanitizeName(editForm.company || 'company');
        const timestamp = Date.now();

        const corFileName = `${user?.id}/company_${user?.company_id}_client_${clientName}_${clientCompany}_cor_${timestamp}.${fileExtension}`;

        // Upload to Supabase Storage (client-cor bucket)
        const { data: corUploadData, error: corUploadError } = await supabase.storage
          .from('client-cor')
          .upload(corFileName, blob, {
            contentType: contentType,
            upsert: false
          });

        if (corUploadError) {
          console.error('COR upload error:', corUploadError);
          throw new Error(`Failed to upload COR: ${corUploadError.message}`);
        }

        // Get signed URL (required for private buckets)
        const { data: corUrlData, error: corUrlError } = await supabase.storage
          .from('client-cor')
          .createSignedUrl(corFileName, 31536000); // 1 year expiry

        if (corUrlError || !corUrlData?.signedUrl) {
          throw new Error(`Failed to generate COR signed URL: ${corUrlError?.message || 'Unknown error'}`);
        }

        corUrl = corUrlData.signedUrl;
      }

      // Update client - exclude address and city (read-only fields)
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
        updated_at: new Date().toISOString()
      };

      // Only update photo_url if a new one was uploaded
      if (editClientPhoto && photoUrl) {
        updateData.photo_url = photoUrl;
        updateData.photo_timestamp = new Date().toISOString();
      }

      // Only update cor_url if a new one was uploaded
      if (editCorPhoto && corUrl) {
        updateData.cor_url = corUrl;
      }

      // Update tax_status based on COR presence (new or existing)
      const finalCorUrl = editCorPhoto ? corUrl : editingClient.cor_url;
      updateData.tax_status = finalCorUrl ? 'Tax on Sales' : 'Tax Exempt';

      const { error } = await supabase
        .from('clients')
        .update(updateData)
        .eq('id', editingClient.id);

      if (error) throw error;

      const updates = [];
      if (editClientPhoto) updates.push('photo');
      if (editCorPhoto) updates.push('COR document');
      const updateText = updates.length > 0 ? ` with new ${updates.join(' and ')}` : '';

      toast({
        title: 'Success',
        description: `${editForm.name} has been updated successfully${updateText}`
      });

      setUpdateConfirmOpen(false);
      setEditDialogOpen(false);
      setEditingClient(null);
      setEditCorPhoto(null);
      setEditClientPhoto(null);

      // Real-time will handle updating the list
    } catch (error: any) {
      console.error('Error updating client:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update client. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleOpenDelete = (client: Client) => {
    setClientToDelete(client);
    setDeleteDialogOpen(true);
  };

  const handleOpenView = (client: Client) => {
    setViewingClient(client);
    setViewDialogOpen(true);
  };

  // Get unique cities from all clients
  const getUniqueCities = () => {
    const cities = new Set<string>();
    clients.forEach(client => {
      if (client.city && client.city.trim() !== '') {
        cities.add(client.city);
      }
    });
    return Array.from(cities).sort();
  };

  // Get current holder of a city (agent who has clients in that city)
  const getCurrentCityHolder = (city: string) => {
    const cityClients = clients.filter(client => client.city === city);
    if (cityClients.length === 0) return null;

    // Get the agent who has the most clients in this city
    const agentCounts = cityClients.reduce((acc, client) => {
      acc[client.agent_id] = (acc[client.agent_id] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const topAgent = Object.entries(agentCounts).reduce((a, b) =>
      agentCounts[a[0]] > agentCounts[b[0]] ? a : b
    );

    return agents.find(agent => agent.id === topAgent[0]);
  };

  // Get available agents for transfer (excluding current holder)
  const getAvailableAgents = (city: string) => {
    const currentHolder = getCurrentCityHolder(city);
    return agents.filter(agent => agent.id !== currentHolder?.id);
  };

  // Load clients for selected city
  const loadCityClients = (city: string) => {
    const cityClientsList = clients.filter(client => client.city === city);
    setCityClients(cityClientsList);
  };

  // Helper function to determine if a client is unassigned (assigned to admin)
  const isClientUnassigned = (client: Client) => {
    // A client is considered unassigned if:
    // 1. agent_id is null (created by super admin without assignment)
    // 2. agent_id points to an admin (legacy behavior)
    // 3. agent_id is the current admin user (legacy behavior)
    if (!client.agent_id) return true; // Super admin created unassigned client

    const agent = agents.find(a => a.id === client.agent_id);
    return agent?.role === 'admin' || agent?.role === 'super_admin' || (isAdmin && client.agent_id === user?.id);
  };

  // Update agent cities by MERGING with cities from their client assignments
  // This preserves manually set cities and only ADDS new cities from clients
  const updateAgentCities = async (agentId: string) => {
    try {
      // Get current cities from agent's profile
      const { data: agentProfile, error: profileError } = await supabase
        .from('profiles')
        .select('city')
        .eq('id', agentId)
        .single();

      if (profileError) throw profileError;

      // Parse existing cities from profile (manually set by admin)
      const existingCities = agentProfile?.city
        ? agentProfile.city.split(',').map(c => c.trim()).filter(c => c.length > 0)
        : [];

      // Get all clients assigned to this agent
      const { data: agentClients, error: clientsError } = await supabase
        .from('clients')
        .select('city')
        .eq('agent_id', agentId)
        .not('city', 'is', null);

      if (clientsError) throw clientsError;

      // Extract unique cities from clients
      const clientCities = [...new Set(
        (agentClients || [])
          .map(client => client.city?.trim())
          .filter(city => city && city.length > 0)
      )];

      // MERGE: Combine existing cities with client cities, removing duplicates
      const allCities = [...new Set([...existingCities, ...clientCities])];

      // Only update if there are cities to set (don't clear if empty)
      const cityValue = allCities.length > 0 ? allCities.join(',') : null;

      // Update agent's city field in profiles table with merged cities
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ city: cityValue })
        .eq('id', agentId);

      if (updateError) throw updateError;

      console.log(`Updated agent ${agentId} cities to: ${allCities.join(', ')} (merged existing + client cities)`);
    } catch (error) {
      console.error('Error updating agent cities:', error);
      // Don't throw error here as it's not critical to the transfer operation
    }
  };

  // Transfer Functions
  const handleOpenTransfer = async (client: Client) => {
    setTransferringClient(client);
    setSelectedAgentId('');
    await fetchAgents();
    setTransferDialogOpen(true);
  };

  const handleTransferClient = async () => {
    if (!transferringClient || !selectedAgentId) return;

    setTransferring(true);
    try {
      const oldAgentId = transferringClient.agent_id;

      // Transfer the client
      const { error } = await supabase
        .from('clients')
        .update({ agent_id: selectedAgentId })
        .eq('id', transferringClient.id);

      if (error) throw error;

      // Merge cities for both old and new agents (preserves existing cities, adds new ones)
      await Promise.all([
        updateAgentCities(oldAgentId), // Update old agent's cities (may remove if no clients left)
        updateAgentCities(selectedAgentId) // Merge new cities into new agent's existing cities
      ]);

      toast({
        title: 'Success',
        description: `${transferringClient.name} has been transferred successfully`,
      });

      setTransferDialogOpen(false);
      setTransferringClient(null);
      setSelectedAgentId('');

      // Refresh clients list
      await fetchClients();
    } catch (error) {
      console.error('Error transferring client:', error);
      toast({
        title: 'Error',
        description: 'Failed to transfer client. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setTransferring(false);
    }
  };

  const handleOpenBulkTransfer = async () => {
    await fetchAgents();
    setBulkTransferAssignments({});
    setBulkTransferDialogOpen(true);
  };

  // City-based bulk transfer functions
  const handleOpenCityBulkTransfer = () => {
    setSelectedCity('');
    setSelectedTransferAgent('');
    setCityClients([]);
    setCityBulkTransferOpen(true);
  };

  const handleCityChange = (city: string) => {
    setSelectedCity(city);
    setSelectedTransferAgent('');
    loadCityClients(city);
  };

  const handleCityBulkTransfer = async () => {
    if (!selectedCity || !selectedTransferAgent) return;

    setCityTransferring(true);
    try {
      const currentHolder = getCurrentCityHolder(selectedCity);
      const affectedAgents = new Set<string>();

      // Add current holder and new agent to affected agents
      if (currentHolder) {
        affectedAgents.add(currentHolder.id);
      }
      affectedAgents.add(selectedTransferAgent);

      // Transfer all clients in the city to the selected agent
      const { error } = await supabase
        .from('clients')
        .update({ agent_id: selectedTransferAgent })
        .eq('city', selectedCity);

      if (error) throw error;

      // Merge cities for all affected agents (preserves existing cities, adds new ones)
      const cityUpdatePromises = Array.from(affectedAgents).map(agentId =>
        updateAgentCities(agentId)
      );
      await Promise.all(cityUpdatePromises);

      toast({
        title: 'Success',
        description: `All ${selectedCity} clients have been transferred successfully`,
      });

      setCityBulkTransferOpen(false);
      setSelectedCity('');
      setSelectedTransferAgent('');
      setCityClients([]);

      // Refresh clients list
      await fetchClients();
    } catch (error) {
      console.error('Error in city bulk transfer:', error);
      toast({
        title: 'Error',
        description: 'Failed to transfer clients. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setCityTransferring(false);
    }
  };

  const handleBulkTransfer = async () => {
    setBulkTransferring(true);
    try {
      // Get all affected agents (both old and new)
      const affectedAgents = new Set<string>();

      // Collect all agent IDs that will be affected
      Object.entries(bulkTransferAssignments).forEach(([clientId, newAgentId]) => {
        const client = filteredClients.find(c => c.id === clientId);
        if (client) {
          affectedAgents.add(client.agent_id); // Old agent
          affectedAgents.add(newAgentId); // New agent
        }
      });

      // Perform all transfers
      const transferPromises = Object.entries(bulkTransferAssignments).map(
        ([clientId, agentId]) =>
          supabase
            .from('clients')
            .update({ agent_id: agentId })
            .eq('id', clientId)
      );

      const results = await Promise.all(transferPromises);
      const errors = results.filter(result => result.error);

      if (errors.length > 0) {
        throw new Error(`${errors.length} transfers failed`);
      }

      // Merge cities for all affected agents (preserves existing cities, adds new ones)
      const cityUpdatePromises = Array.from(affectedAgents).map(agentId =>
        updateAgentCities(agentId)
      );
      await Promise.all(cityUpdatePromises);

      toast({
        title: 'Success',
        description: `${Object.keys(bulkTransferAssignments).length} clients have been transferred successfully`,
      });

      setBulkTransferDialogOpen(false);
      setBulkTransferAssignments({});

      // Refresh clients list
      await fetchClients();
    } catch (error) {
      console.error('Error in bulk transfer:', error);
      toast({
        title: 'Error',
        description: 'Failed to transfer some clients. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setBulkTransferring(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!clientToDelete) return;

    try {
      // Soft delete: Update client status to 'inactive' instead of deleting
      const { error } = await supabase
        .from('clients')
        .update({ status: 'inactive' })
        .eq('id', clientToDelete.id);

      if (error) throw error;

      // Update local state - remove from current view since it's now inactive
      setClients(clients.filter(c => c.id !== clientToDelete.id));

      toast({
        title: 'Success',
        description: `${clientToDelete.name} has been voided successfully`
      });

      setDeleteDialogOpen(false);
      setClientToDelete(null);
    } catch (error) {
      console.error('Error deleting client:', error);
      toast({
        title: 'Error',
        description: 'Failed to void client. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleAddClient = () => {
    if (!addForm.name.trim()) {
      toast({ title: 'Error', description: 'Client name is required', variant: 'destructive' });
      return;
    }

    if (!addForm.email.trim()) {
      toast({ title: 'Error', description: 'Email is required', variant: 'destructive' });
      return;
    }

    if (!newClientPhoto) {
      toast({ title: 'Error', description: 'Client photo is required for verification', variant: 'destructive' });
      return;
    }

    if (!newCorPhoto) {
      toast({ title: 'Error', description: 'COR (Certificate of Registration) photo is required', variant: 'destructive' });
      return;
    }

    setAdding(true);
    handleConfirmAdd();
  };

  const handleConfirmAdd = async () => {
    try {
      // Handle photo upload if there's a photo
      let photoUrl = null;

      if (newClientPhoto) {
        // Convert base64 to blob
        const base64Data = newClientPhoto.split(',')[1];
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'image/jpeg' });

        // Generate unique filename
        const sanitizeName = (str: string) => {
          return str
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
        };

        const clientName = sanitizeName(addForm.name || 'client');
        const clientCompany = sanitizeName(addForm.company || 'company');
        const timestamp = Date.now();

        const fileName = `${user?.id}/${clientName}_${clientCompany}_${timestamp}.jpg`;

        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('client-photos')
          .upload(fileName, blob, {
            contentType: 'image/jpeg',
            upsert: false
          });

        if (uploadError) {
          console.error('Upload error:', uploadError);
          throw new Error(`Failed to upload photo: ${uploadError.message}`);
        }

        // Get signed URL (required for private buckets)
        const { data: urlData, error: urlError } = await supabase.storage
          .from('client-photos')
          .createSignedUrl(fileName, 31536000); // 1 year expiry

        if (urlError || !urlData?.signedUrl) {
          throw new Error(`Failed to generate signed URL: ${urlError?.message || 'Unknown error'}`);
        }

        photoUrl = urlData.signedUrl;
      }

      // Handle COR photo upload if there's a COR photo
      let corUrl = null;

      if (newCorPhoto) {
        // Convert base64 to blob
        const base64Data = newCorPhoto.split(',')[1];
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);

        // Determine content type from base64 prefix
        const isJPG = newCorPhoto.startsWith('data:image/jpeg') || newCorPhoto.startsWith('data:image/jpg');
        const contentType = isJPG ? 'image/jpeg' : 'image/png';
        const fileExtension = isJPG ? 'jpg' : 'png';

        const blob = new Blob([byteArray], { type: contentType });

        // Generate unique filename
        const sanitizeName = (str: string) => {
          return str
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
        };

        const clientName = sanitizeName(addForm.name || 'client');
        const clientCompany = sanitizeName(addForm.company || 'company');
        const timestamp = Date.now();

        const corFileName = `${user?.id}/company_${user?.company_id}_client_${clientName}_${clientCompany}_cor_${timestamp}.${fileExtension}`;

        // Upload to Supabase Storage (client-cor bucket)
        const { data: corUploadData, error: corUploadError } = await supabase.storage
          .from('client-cor')
          .upload(corFileName, blob, {
            contentType: contentType,
            upsert: false
          });

        if (corUploadError) {
          console.error('COR upload error:', corUploadError);
          throw new Error(`Failed to upload COR: ${corUploadError.message}`);
        }

        // Get signed URL (required for private buckets)
        const { data: corUrlData, error: corUrlError } = await supabase.storage
          .from('client-cor')
          .createSignedUrl(corFileName, 31536000); // 1 year expiry

        if (corUrlError || !corUrlData?.signedUrl) {
          throw new Error(`Failed to generate COR signed URL: ${corUrlError?.message || 'Unknown error'}`);
        }

        corUrl = corUrlData.signedUrl;
      }

      let cityMatches = true;
      const clientCityValue = addForm.city?.trim() || '';

      // Super admins can add clients without city validation or agent assignment
      if (isSuperAdmin) {
        // Super admins bypass all city and agent validations
        cityMatches = true;
      } else if (!isAdmin) {
        // Regular agents must follow city validation
        if (agentCities.length > 0) {
          if (!clientCityValue) {
            toast({
              title: 'City Required',
              description: `Please enter a city. It must be one of: ${agentCities.join(', ')}`,
              variant: 'destructive'
            });
            setAdding(false);
            return;
          }

          const normalizedClientCity = clientCityValue.toLowerCase();
          const normalizedAgentCities = agentCities
            .map(city => city.toLowerCase().trim())
            .filter(Boolean);

          cityMatches = normalizedAgentCities.includes(normalizedClientCity);

          if (!cityMatches) {
            toast({
              title: 'Client Pending Approval',
              description: `"${clientCityValue}" is outside your assigned cities. The client will require admin approval before being fully active.`,
            });
          }
        } else {
          toast({
            title: 'No Cities Assigned',
            description: 'You cannot add clients until your administrator assigns you to at least one city.',
            variant: 'destructive'
          });
          setAdding(false);
          return;
        }
      }

      // For super admin: no agent assignment (null)
      // For admin-created clients: assign to admin
      // For agent-created clients: assign to the current agent
      const agentId = isSuperAdmin ? null : user?.id;

      const nowIso = new Date().toISOString();
      const approvalStatus = isAdmin || cityMatches ? 'approved' : 'pending';
      const approvalRequestedAt = (!isAdmin && !cityMatches) ? nowIso : null;
      const approvalNotes = (!isAdmin && !cityMatches) ? `City "${clientCityValue || 'N/A'}" outside assigned cities: ${agentCities.join(', ')}` : null;
      const approvedAt = approvalStatus === 'approved' ? nowIso : null;

      // Validate company_id
      if (!user?.company_id) {
        throw new Error('User company_id not found');
      }

      const { error } = await supabase
        .from('clients')
        .insert({
          company_id: user.company_id,
          name: addForm.name,
          company: addForm.company || null,
          email: addForm.email || null,
          phone: addForm.phone ? `+63 ${addForm.phone}` : null,
          address: addForm.address || null,
          city: addForm.city || null,
          contact_person: addForm.contact_person || null,
          tin: addForm.tin || null,
          agent_id: agentId, // Can be null for super admins, or user id for others
          total_orders: 0,
          total_spent: 0,
          account_type: addForm.account_type,
          category: addForm.category,
          status: 'active',
          has_forge: addForm.has_forge,
          photo_url: photoUrl,
          photo_timestamp: photoUrl ? new Date().toISOString() : null,
          cor_url: corUrl,
          location_latitude: capturedLocation?.latitude || null,
          location_longitude: capturedLocation?.longitude || null,
          location_accuracy: capturedLocation?.accuracy || null,
          location_captured_at: capturedLocation ? new Date().toISOString() : null,
          approval_status: approvalStatus,
          approval_requested_at: approvalRequestedAt,
          approval_notes: approvalNotes,
          approved_at: approvedAt,
          approved_by: isAdmin && approvedAt ? user?.id || null : null,
        });

      if (error) throw error;

      toast({
        title: approvalStatus === 'approved' ? 'Client Added' : 'Client Pending Approval',
        description: approvalStatus === 'approved'
          ? (capturedLocation
            ? `${addForm.name} has been added successfully with photo and location verification${isSuperAdmin ? ' (unassigned - no agent)' : isAdmin ? ' (assigned to you)' : ''}`
            : `${addForm.name} has been added successfully with photo verification${isSuperAdmin ? ' (unassigned - no agent)' : isAdmin ? ' (assigned to you)' : ''}`)
          : `${addForm.name} has been added and sent for admin approval. Orders and other actions remain disabled until approval.`
      });

      // Reset form and close dialog
      resetAddForm();
      setAddDialogOpen(false);
      setAdding(false);

      // Real-time will handle updating the list
    } catch (error: any) {
      console.error('Error adding client:', error);

      // Handle RLS policy violation specifically
      if (error.code === '42501') {
        toast({
          title: 'Permission Error',
          description: 'Unable to create unassigned client due to security policies. Please assign to an agent.',
          variant: 'destructive'
        });
      } else {
        toast({
          title: 'Error',
          description: 'Failed to add client. Please try again.',
          variant: 'destructive'
        });
      }
      setAdding(false);
    }
  };

  // Photo and Location Functions
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: 'Error',
          description: 'Image size should be less than 5MB',
          variant: 'destructive'
        });
        return;
      }

      const reader = new FileReader();
      reader.onloadend = async () => {
        setNewClientPhoto(reader.result as string);

        // Use pre-warmed location if available, otherwise get fresh
        try {
          let position: GeolocationPosition;

          if (prewarmPosition) {
            console.log('Using pre-warmed location for upload');
            position = prewarmPosition;
          } else {
            toast({
              title: 'Getting location...',
              description: 'Capturing your current location.'
            });
            position = await getCurrentLocation();
          }

          await processLocationAndAddress(position);
        } catch (error: any) {
          console.error('Location error:', error);

          // Handle specific geolocation errors
          if (error.code === 1) {
            toast({
              title: 'Location Permission Denied',
              description: 'Please allow location access in your browser settings to auto-fill addresses.',
              variant: 'destructive'
            });
          } else if (error.code === 2) {
            toast({
              title: 'Location Unavailable',
              description: 'Unable to determine your location. Please enter address manually.',
              variant: 'destructive'
            });
          } else if (error.code === 3) {
            toast({
              title: 'Location Timeout',
              description: 'Location request timed out. Please enter address manually.',
              variant: 'destructive'
            });
          } else {
            toast({
              title: 'Location Unavailable',
              description: 'Could not get location. Please enter address manually.',
              variant: 'destructive'
            });
          }
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleEditClientPhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file size (5MB max for photos)
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: 'Error',
          description: 'Photo size should be less than 5MB',
          variant: 'destructive'
        });
        return;
      }

      // Validate file type
      if (!file.type.match(/^image\/(png|jpeg|jpg)$/)) {
        toast({
          title: 'Error',
          description: 'Photo must be a PNG or JPG image',
          variant: 'destructive'
        });
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        setEditClientPhoto(reader.result as string);
        toast({
          title: 'Photo Selected',
          description: 'New client photo will be uploaded when you save changes'
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleEditCorFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file size (10MB max for COR documents)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: 'Error',
          description: 'COR image size should be less than 10MB',
          variant: 'destructive'
        });
        return;
      }

      // Validate file type (PNG or JPG only)
      if (!file.type.match(/^image\/(png|jpeg|jpg)$/)) {
        toast({
          title: 'Error',
          description: 'COR must be a PNG or JPG image',
          variant: 'destructive'
        });
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        setEditCorPhoto(reader.result as string);
        toast({
          title: 'COR Uploaded',
          description: 'New COR document will be uploaded when you save changes'
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCorFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file size (10MB max for COR documents)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: 'Error',
          description: 'COR image size should be less than 10MB',
          variant: 'destructive'
        });
        return;
      }

      // Validate file type (PNG or JPG only)
      if (!file.type.match(/^image\/(png|jpeg|jpg)$/)) {
        toast({
          title: 'Error',
          description: 'COR must be a PNG or JPG image',
          variant: 'destructive'
        });
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        setNewCorPhoto(reader.result as string);
        toast({
          title: 'COR Uploaded',
          description: 'Certificate of Registration image has been uploaded successfully'
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const openCamera = async () => {
    setIsCameraLoading(true);
    try {
      let mediaStream: MediaStream | null = null;

      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });
      } catch (err) {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: true
        });
      }

      if (mediaStream) {
        setStream(mediaStream);
        setIsCameraOpen(true);

        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.srcObject = mediaStream;
            videoRef.current.play().catch(err => {
              if (err.name !== 'AbortError') {
                console.error('Error playing video:', err);
              }
            });
          }
          setIsCameraLoading(false);
        }, 100);
      } else {
        setIsCameraLoading(false);
      }
    } catch (error) {
      console.error('Camera error:', error);
      setIsCameraLoading(false);
      toast({
        title: 'Camera Error',
        description: 'Unable to access camera. Please check permissions and ensure your device has a camera.',
        variant: 'destructive'
      });
    }
  };

  const getCurrentLocation = (): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by your browser'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => resolve(position),
        (error) => reject(error),
        {
          enableHighAccuracy: true,
          timeout: 30000,
          maximumAge: 0
        }
      );
    });
  };

  const startLocationPrewarm = async () => {
    setIsPrewarmingLocation(true);
    try {
      const position = await getCurrentLocation();
      setPrewarmPosition(position);
      console.log('Location pre-warmed:', position.coords.accuracy, 'meters accuracy');
    } catch (error: any) {
      console.error('Pre-warm location error:', error);

      // Handle specific geolocation errors
      if (error.code === 1) {
        // User denied geolocation permission
        toast({
          title: 'Location Permission Denied',
          description: 'Please allow location access in your browser settings to auto-fill addresses.',
          variant: 'destructive'
        });
      } else if (error.code === 2) {
        // Position unavailable
        toast({
          title: 'Location Unavailable',
          description: 'Unable to determine your location. You can still add clients manually.',
          variant: 'destructive'
        });
      } else if (error.code === 3) {
        // Timeout
        toast({
          title: 'Location Timeout',
          description: 'Location request timed out. You can still add clients manually.',
          variant: 'destructive'
        });
      } else {
        // Generic error
        toast({
          title: 'Location Error',
          description: 'Unable to access location services. You can still add clients manually.',
          variant: 'destructive'
        });
      }
    } finally {
      setIsPrewarmingLocation(false);
    }
  };

  const getAccuracyBadge = (accuracy: number) => {
    if (accuracy <= 50) {
      return {
        label: 'Excellent',
        color: 'bg-green-50 text-green-700 border-green-200',
        icon: '🎯'
      };
    } else if (accuracy <= 100) {
      return {
        label: 'Good',
        color: 'bg-blue-50 text-blue-700 border-blue-200',
        icon: '✓'
      };
    } else if (accuracy <= 500) {
      return {
        label: 'Fair',
        color: 'bg-yellow-50 text-yellow-700 border-yellow-200',
        icon: '⚠'
      };
    } else {
      return {
        label: 'Poor',
        color: 'bg-red-50 text-red-700 border-red-200',
        icon: '⚠️'
      };
    }
  };

  // Philippine phone number formatter
  const formatPhilippinePhone = (value: string): string => {
    // Remove all non-digit characters
    const digits = value.replace(/\D/g, '');

    // If starts with 63, remove it (we'll add +63 prefix separately)
    let phoneDigits = digits.startsWith('63') ? digits.slice(2) : digits;

    // Limit to 10 digits (after country code)
    phoneDigits = phoneDigits.slice(0, 10);

    // Format: 9XX-XXX-XXXX
    if (phoneDigits.length <= 3) {
      return phoneDigits;
    } else if (phoneDigits.length <= 6) {
      return `${phoneDigits.slice(0, 3)}-${phoneDigits.slice(3)}`;
    } else {
      return `${phoneDigits.slice(0, 3)}-${phoneDigits.slice(3, 6)}-${phoneDigits.slice(6)}`;
    }
  };

  const handlePhoneChange = (value: string, formType: 'add' | 'edit') => {
    const formatted = formatPhilippinePhone(value);
    if (formType === 'add') {
      setAddForm({ ...addForm, phone: formatted });
    } else {
      setEditForm({ ...editForm, phone: formatted });
    }
  };

  const reverseGeocode = async (latitude: number, longitude: number): Promise<{ address: string; city: string }> => {
    try {
      console.log('🌍 Starting reverse geocoding for:', { latitude, longitude });

      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
        {
          headers: {
            'Accept-Language': 'en',
            'User-Agent': 'MultiTenantB2B-ClientApp/1.0'
          }
        }
      );

      if (!response.ok) {
        console.error('❌ Reverse geocoding API error:', response.status, response.statusText);
        throw new Error(`Geocoding API returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('🌍 Reverse geocoding response:', data);

      if (data && data.address) {
        const addr = data.address;
        const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || '';

        const addressParts = [
          addr.house_number,
          addr.road,
          addr.suburb || addr.neighbourhood,
          addr.city || addr.town || addr.village,
          addr.state || addr.region,
          addr.country
        ].filter(Boolean);

        const fullAddress = addressParts.join(', ');
        console.log('✅ Extracted address:', { fullAddress, city });

        return {
          address: fullAddress || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
          city: city
        };
      } else if (data && data.display_name) {
        console.log('⚠️ Using display_name fallback:', data.display_name);
        const displayParts = data.display_name.split(',');
        const possibleCity = displayParts.length > 1 ? displayParts[displayParts.length - 2]?.trim() : '';

        return {
          address: data.display_name,
          city: possibleCity
        };
      }

      console.warn('⚠️ No address data found in response, using coordinates');
      return {
        address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
        city: ''
      };
    } catch (error: any) {
      console.error('❌ Reverse geocoding error:', error);
      return {
        address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
        city: ''
      };
    }
  };

  const processLocationAndAddress = async (position: GeolocationPosition) => {
    const { latitude, longitude, accuracy } = position.coords;

    const { address, city } = await reverseGeocode(latitude, longitude);

    setAddForm(prev => ({ ...prev, address, city }));
    setCapturedLocation({ latitude, longitude, address, accuracy });

    const badge = getAccuracyBadge(accuracy);
    toast({
      title: 'Location Captured',
      description: `${badge.icon} ${badge.label} (±${Math.round(accuracy)}m)`,
    });
  };

  const capturePhoto = async () => {
    if (videoRef.current && videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        const imageData = canvas.toDataURL('image/jpeg', 0.8);
        setNewClientPhoto(imageData);
        closeCamera();

        try {
          let position: GeolocationPosition;

          if (prewarmPosition) {
            console.log('Using pre-warmed location');
            position = prewarmPosition;
          } else {
            toast({
              title: 'Getting location...',
              description: 'Please wait while we capture your current location.'
            });
            position = await getCurrentLocation();
          }

          await processLocationAndAddress(position);
        } catch (error: any) {
          console.error('Location error:', error);

          // Handle specific geolocation errors
          if (error.code === 1) {
            toast({
              title: 'Location Permission Denied',
              description: 'Please allow location access in your browser settings to auto-fill addresses.',
              variant: 'destructive'
            });
          } else if (error.code === 2) {
            toast({
              title: 'Location Unavailable',
              description: 'Unable to determine your location. Please enter address manually.',
              variant: 'destructive'
            });
          } else if (error.code === 3) {
            toast({
              title: 'Location Timeout',
              description: 'Location request timed out. Please enter address manually.',
              variant: 'destructive'
            });
          } else {
            toast({
              title: 'Location Unavailable',
              description: 'Could not get location. Please enter address manually.',
              variant: 'destructive'
            });
          }
        }
      }
    } else {
      toast({
        title: 'Camera Not Ready',
        description: 'Please wait for the camera to fully initialize before capturing.',
        variant: 'destructive'
      });
    }
  };

  const retryLocation = async () => {
    toast({
      title: 'Retrying Location...',
      description: 'Getting a more accurate location.'
    });

    try {
      const position = await getCurrentLocation();
      await processLocationAndAddress(position);
    } catch (error: any) {
      console.error('Retry location error:', error);

      // Handle specific geolocation errors
      if (error.code === 1) {
        toast({
          title: 'Location Permission Denied',
          description: 'Please allow location access in your browser settings to auto-fill addresses.',
          variant: 'destructive'
        });
      } else if (error.code === 2) {
        toast({
          title: 'Location Unavailable',
          description: 'Unable to determine your location. Please enter address manually.',
          variant: 'destructive'
        });
      } else if (error.code === 3) {
        toast({
          title: 'Location Timeout',
          description: 'Location request timed out. Please enter address manually.',
          variant: 'destructive'
        });
      } else {
        toast({
          title: 'Location Error',
          description: 'Still unable to get location. Please enter address manually.',
          variant: 'destructive'
        });
      }
    }
  };

  const closeCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsCameraOpen(false);
    setIsCameraLoading(false);
  };

  const removePhoto = () => {
    setNewClientPhoto(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const resetAddForm = () => {
    setAddForm({
      name: '',
      company: '',
      email: '',
      phone: '',
      address: '',
      has_forge: false,
      city: '',
      contact_person: '',
      tin: '',
      account_type: 'Standard Accounts' as 'Key Accounts' | 'Standard Accounts',
      category: 'Open' as 'Permanently Closed' | 'Renovating' | 'Open'
    });
    setNewClientPhoto(null);
    setNewCorPhoto(null);
    setCapturedLocation(null);
    setPrewarmPosition(null);
    setIsPrewarmingLocation(false);
    closeCamera();
  };

  const handleExportToExcel = async () => {
    if (clients.length === 0) {
      toast({
        title: 'No Data',
        description: 'There are no clients to export.',
        variant: 'destructive'
      });
      return;
    }

    setExporting(true);
    setExportProgress({ current: 0, total: clients.length });

    try {
      // Prepare client data for export
      const exportData = clients.map(client => ({
        id: client.id,
        name: client.name,
        email: client.email || '',
        phone: client.phone || '',
        company: client.company || '',
        address: client.address || '',
        city: client.city || '',
        agent_name: client.agent_name || 'Unassigned',
        photo_url: client.photo_url || '',
        total_orders: client.total_orders || 0,
        total_spent: client.total_spent || 0,
        status: client.status || 'active',
        created_at: client.created_at,
        approval_status: client.approval_status || 'approved',
      }));

      // Export to Excel with progress tracking
      await exportClientsToExcel(exportData, (current, total) => {
        setExportProgress({ current, total });
      });

      toast({
        title: 'Export Successful',
        description: `Successfully exported ${clients.length} client(s) to Excel.`,
      });
    } catch (error: any) {
      console.error('Error exporting clients:', error);
      toast({
        title: 'Export Failed',
        description: error.message || 'Failed to export clients. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
      setExportProgress({ current: 0, total: 0 });
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <div className="text-muted-foreground">Loading clients...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Import Preview Dialog */}
      <Dialog open={importPreviewOpen} onOpenChange={setImportPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import Clients Preview</DialogTitle>
            <DialogDescription>
              Review the rows below. Only rows with a name will be imported.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              Total rows (excluding header): <span className="font-semibold">{importSummary.total}</span> ·{' '}
              Valid: <span className="font-semibold text-green-600">{importSummary.valid}</span> ·{' '}
              Skipped: <span className="font-semibold text-red-600">{importSummary.skipped}</span>
            </div>
            <div className="border rounded-md overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {importHeaders.map((h) => (
                      <TableHead key={h} className="uppercase text-[10px] tracking-wide">
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importRows.map((row, idx) => (
                    <TableRow key={idx}>
                      {importHeaders.map((h) => {
                        const key = h as keyof Client;
                        const value = (row as any)[key] ?? '';
                        return (
                          <TableCell key={h} className="text-xs">
                            {String(value)}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setImportPreviewOpen(false)}
              disabled={importing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmImportClients}
              disabled={importing || importRows.length === 0}
            >
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                'Confirm Import'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Clients Database</h1>
          <p className="text-sm text-muted-foreground">Manage all your business clients</p>
        </div>

        {/* Desktop Actions */}
        <div className="hidden lg:flex gap-2">
          {isAdmin && (
            <Button
              variant="outline"
              onClick={handleExportToExcel}
              disabled={exporting || clients.length === 0}
            >
              {exporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Exporting... ({exportProgress.current}/{exportProgress.total})
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Export to Excel
                </>
              )}
            </Button>
          )}
          {(isAdmin || isSuperAdmin) && (
            <>
              <Button variant="outline" className="gap-2" onClick={handleDownloadTemplate}>
                <Download className="h-4 w-4" />
                Template
              </Button>
              <div className="relative">
                <input
                  type="file"
                  ref={importInputRef}
                  onChange={handleImportClients}
                  accept=".csv,.txt"
                  className="hidden"
                />
                <Button variant="outline" className="gap-2" onClick={handleImportClick} disabled={importing}>
                  {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Import
                </Button>
              </div>
              <Button variant="outline" onClick={handleOpenCityBulkTransfer}>
                <Users className="h-4 w-4 mr-2" />
                City Transfer
              </Button>
              <Button className="gap-2" onClick={() => setAddDialogOpen(true)}>
                <Plus className="h-4 w-4" />
                Add Client
              </Button>
            </>
          )}
        </div>

        {/* Mobile & Tablet Actions */}
        <div className="flex lg:hidden gap-2 items-center">
          {/* Primary Action - Always Visible */}
          {(isAdmin || isSuperAdmin) && (
            <Button className="flex-1 sm:flex-none" onClick={() => setAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Client
            </Button>
          )}

          {/* Dropdown Menu for Other Actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="shrink-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {isAdmin && (
                <DropdownMenuItem
                  onClick={handleExportToExcel}
                  disabled={exporting || clients.length === 0}
                >
                  {exporting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Export to Excel
                    </>
                  )}
                </DropdownMenuItem>
              )}
              {(isAdmin || isSuperAdmin) && (
                <>
                  <DropdownMenuItem onClick={handleDownloadTemplate}>
                    <Download className="h-4 w-4 mr-2" />
                    Download Template
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleImportClick} disabled={importing}>
                    {importing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Import Clients
                      </>
                    )}
                  </DropdownMenuItem>
                  <input
                    type="file"
                    ref={importInputRef}
                    onChange={handleImportClients}
                    accept=".csv,.txt"
                    className="hidden"
                  />
                  <DropdownMenuItem onClick={handleOpenCityBulkTransfer}>
                    <Users className="h-4 w-4 mr-2" />
                    City Bulk Transfer
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Add Client Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={(open) => {
        setAddDialogOpen(open);
        if (open) {
          startLocationPrewarm();
        } else {
          resetAddForm();
        }
      }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Client</DialogTitle>
            <DialogDescription>
              Create a new client in the system. {isAdmin ? 'This client will have no agent assigned until transferred to an agent.' : 'This client will be assigned to you.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Photo Section */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Client Photo / Proof of Identity *</Label>
              <p className="text-xs text-muted-foreground">Required for verification - Take a photo or upload an existing one</p>

              {!newClientPhoto && !isCameraOpen && (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={openCamera}
                    className="flex-1"
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    Open Camera
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Photo
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>
              )}

              {isCameraOpen && (
                <div className="space-y-2">
                  <div className="relative rounded-lg overflow-hidden bg-black">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-64 object-cover"
                      onLoadedMetadata={() => {
                        // Ensure video plays once metadata is loaded
                        if (videoRef.current) {
                          videoRef.current.play().catch(err => {
                            console.error('Error playing video:', err);
                          });
                          setIsCameraLoading(false);
                        }
                      }}
                    />
                    {isCameraLoading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                        <div className="text-center text-white">
                          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-2"></div>
                          <p className="text-sm">Initializing camera...</p>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      onClick={capturePhoto}
                      className="flex-1"
                      disabled={isCameraLoading}
                    >
                      <Camera className="h-4 w-4 mr-2" />
                      Capture Photo
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={closeCamera}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {newClientPhoto && !isCameraOpen && (
                <div className="relative">
                  <img
                    src={newClientPhoto}
                    alt="Client preview"
                    className="w-full h-64 object-cover rounded-lg border"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2"
                    onClick={removePhoto}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <div className="mt-2 text-xs text-green-600 font-medium">
                    ✓ Photo captured: {new Date().toLocaleString()}
                  </div>
                </div>
              )}
            </div>
            {/* COR Upload Section */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">
                COR (Certificate of Registration) *
              </Label>
              <p className="text-xs text-muted-foreground">Upload PNG or JPG image (max 10MB)</p>

              {!newCorPhoto && (
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => corFileInputRef.current?.click()}
                    className="w-full"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload COR Image
                  </Button>
                  <input
                    ref={corFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg"
                    onChange={handleCorFileUpload}
                    className="hidden"
                  />
                </div>
              )}

              {newCorPhoto && (
                <div className="relative">
                  <img
                    src={newCorPhoto}
                    alt="COR preview"
                    className="w-full h-48 object-contain rounded-lg border bg-gray-50"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2"
                    onClick={() => setNewCorPhoto(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <div className="mt-2 text-xs text-green-600 font-medium">
                    ✓ COR uploaded successfully
                  </div>
                </div>
              )}
            </div>
            {/* Client Information Fields */}
            <div className="space-y-2">
              <Label>Trade Name *</Label>
              <Input
                placeholder="Enter client name"
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Shop Name</Label>
              <Input
                placeholder="Shop Name"
                value={addForm.company}
                onChange={(e) => setAddForm({ ...addForm, company: e.target.value })}
              />
            </div>
            {/* Contact Person Field */}
            <div className="space-y-2">
              <Label>Contact Person</Label>
              <Input
                placeholder="Contact person name"
                value={addForm.contact_person}
                onChange={(e) => setAddForm({ ...addForm, contact_person: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">Name of the contact person for this client</p>
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input
                type="email"
                placeholder="client@company.com"
                value={addForm.email}
                onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Phone Number</Label>
              <div className="flex gap-2">
                <div className="w-16">
                  <Input
                    value="+63"
                    disabled
                    className="bg-muted text-center font-semibold"
                  />
                </div>
                <Input
                  placeholder="9XX-XXX-XXXX"
                  value={addForm.phone}
                  onChange={(e) => handlePhoneChange(e.target.value, 'add')}
                  maxLength={12}
                />
              </div>
              <p className="text-xs text-muted-foreground">Format: +63 9XX-XXX-XXXX</p>
            </div>

            {/* TIN Field */}
            <div className="space-y-2">
              <Label>TIN (Tax Identification Number)</Label>
              <Input
                placeholder="XXX-XXX-XXX-XXX"
                value={addForm.tin}
                onChange={(e) => setAddForm({ ...addForm, tin: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">Tax Identification Number</p>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                Address
                {isPrewarmingLocation && (
                  <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                    <div className="animate-pulse">🌍 Pre-warming GPS...</div>
                  </Badge>
                )}
                {capturedLocation && (
                  <Badge
                    variant="outline"
                    className={`text-xs ${getAccuracyBadge(capturedLocation.accuracy).color}`}
                  >
                    <MapPin className="h-3 w-3 mr-1" />
                    {getAccuracyBadge(capturedLocation.accuracy).icon} {getAccuracyBadge(capturedLocation.accuracy).label} (±{Math.round(capturedLocation.accuracy)}m)
                  </Badge>
                )}
              </Label>
              <div className="flex gap-2">
                <Input
                  placeholder={capturedLocation ? "Auto-filled from location" : "Address will be auto-filled when location is captured"}
                  value={addForm.address}
                  disabled
                  readOnly
                  className={`bg-muted cursor-not-allowed ${capturedLocation ? (
                    capturedLocation.accuracy <= 100 ? "border-green-300" :
                      capturedLocation.accuracy <= 500 ? "border-yellow-300" : "border-red-300"
                  ) : ""}`}
                />
                {capturedLocation && capturedLocation.accuracy > 100 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={retryLocation}
                    title="Retry for better accuracy"
                    className="shrink-0"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {capturedLocation && (
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>📍 Lat: {capturedLocation.latitude.toFixed(6)}, Lon: {capturedLocation.longitude.toFixed(6)}</p>
                  {capturedLocation.accuracy > 100 && (
                    <p className="text-yellow-600 font-medium">
                      ⚠ Low accuracy detected. Click retry button for better location.
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>
                City
                <span className="text-xs text-muted-foreground ml-2">(Auto-filled from location)</span>
                {!isAdmin && agentCities.length > 0 && (
                  <span className="text-xs text-muted-foreground ml-2">
                    (Must be: {agentCities.join(', ')})
                  </span>
                )}
              </Label>
              <Input
                placeholder="City will be auto-filled when location is captured"
                value={addForm.city}
                disabled
                readOnly
                className="bg-muted cursor-not-allowed"
              />
              {!capturedLocation && (
                <p className="text-xs text-muted-foreground">
                  📍 Capture location to auto-fill city
                </p>
              )}
              {capturedLocation && addForm.city && !isAdmin && agentCities.length > 0 && (() => {
                const clientCity = addForm.city.trim().toLowerCase();
                const normalizedAgentCities = agentCities.map(c => c.toLowerCase());
                const cityMatches = normalizedAgentCities.includes(clientCity);
                return cityMatches ? (
                  <p className="text-xs text-green-600">✓ City matches your assigned cities</p>
                ) : (
                  <p className="text-xs text-destructive">
                    ⚠ City "{addForm.city}" does not match your assigned cities: {agentCities.join(', ')}
                  </p>
                );
              })()}
            </div>
            <div className="space-y-2">
              <Label>Type Of Account</Label>
              <Select
                value={addForm.account_type}
                onValueChange={(value: 'Key Accounts' | 'Standard Accounts') =>
                  setAddForm({ ...addForm, account_type: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Standard Accounts">Standard Accounts</SelectItem>
                  <SelectItem value="Key Accounts">Key Accounts</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={addForm.category}
                onValueChange={(value: 'Permanently Closed' | 'Renovating' | 'Open') =>
                  setAddForm({ ...addForm, category: value })
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



            {/* Has Forge Field */}
            <div className="space-y-3">
              <Label>Has Forge?</Label>
              <RadioGroup
                value={addForm.has_forge ? 'yes' : 'no'}
                onValueChange={(value) => setAddForm({ ...addForm, has_forge: value === 'yes' })}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="yes" id="has-forge-yes" />
                  <Label htmlFor="has-forge-yes" className="font-normal cursor-pointer">
                    Yes
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="no" id="has-forge-no" />
                  <Label htmlFor="has-forge-no" className="font-normal cursor-pointer">
                    No
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <Button className="w-full" onClick={handleAddClient} disabled={adding}>
              {adding ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Client'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <p className="text-sm font-medium">Total Clients</p>
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
              ₱{allClientsRevenue.toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search clients by name, email, shop name, or agent..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={cityFilter} onValueChange={setCityFilter}>
                  <SelectTrigger className="w-[200px]">
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
              </div>
            </div>
            {(searchQuery || (cityFilter && cityFilter !== 'all')) && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Showing {filteredClients.length} of {clients.length} clients</span>
                {cityFilter && cityFilter !== 'all' && (
                  <Badge variant="secondary" className="text-xs">
                    City: {cityFilter}
                  </Badge>
                )}
                {searchQuery && (
                  <Badge variant="secondary" className="text-xs">
                    Search: "{searchQuery}"
                  </Badge>
                )}
              </div>
            )}
            {/* Pagination Info */}
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
          {/* Mobile: card list */}
          <div className="md:hidden space-y-3">
            {paginatedClients.length === 0 ? (
              <div className="text-center text-muted-foreground py-6">No clients found</div>
            ) : (
              paginatedClients.map((client) => (
                <div key={client.id} className="rounded-lg border bg-background overflow-hidden shadow-sm">
                  {/* Header with Photo and Name */}
                  <div className="p-3 bg-muted/30 border-b">
                    <div className="flex items-center gap-3">
                      {client.photo_url ? (
                        <img src={client.photo_url} alt={client.name} className="w-14 h-14 rounded-full object-cover border-2 border-primary/20" />
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center border-2 border-primary/20">
                          <Building className="w-7 h-7 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-base truncate">{client.name}</div>
                        {client.company && (
                          <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                            <Building className="w-3 h-3" />
                            {client.company}
                          </div>
                        )}
                        <div className="flex items-center gap-1 mt-1">
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getApprovalStatusBadge(client.approval_status).className}`}>
                            {getApprovalStatusBadge(client.approval_status).label.replace('Pending Approval', 'Pending')}
                          </Badge>
                          {client.city && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {client.city}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Stats Row */}
                  <div className="grid grid-cols-3 divide-x border-b">
                    <div className="p-2.5 text-center">
                      <div className="text-lg font-bold text-primary">{client.total_orders}</div>
                      <div className="text-[10px] text-muted-foreground uppercase">Orders</div>
                    </div>
                    <div className="p-2.5 text-center">
                      <div className="text-lg font-bold text-green-600">₱{(client.total_spent / 1000).toFixed(1)}K</div>
                      <div className="text-[10px] text-muted-foreground uppercase">Revenue</div>
                    </div>
                    <div className="p-2.5 text-center">
                      <div className="text-lg font-bold text-purple-600 flex items-center justify-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {client.visit_count}
                      </div>
                      <div className="text-[10px] text-muted-foreground uppercase">Visits</div>
                    </div>
                  </div>

                  {/* Contact Info - Compact */}
                  <div className="p-3 space-y-1.5 text-xs">
                    {client.email && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span className="font-medium min-w-[60px]">Email:</span>
                        <span className="truncate">{client.email}</span>
                      </div>
                    )}
                    {client.phone && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span className="font-medium min-w-[60px]">Phone:</span>
                        <span className="truncate">{client.phone}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span className="font-medium min-w-[60px]">Agent:</span>
                      <span className="truncate">{isClientUnassigned(client) ? 'No Agent' : (client.agent_name || 'Unassigned')}</span>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground">Forge:</span>
                        {client.has_forge ? (
                          <Badge variant="default" className="bg-green-600 text-[10px] px-1.5 py-0 h-4">Yes</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">No</Badge>
                        )}
                      </div>
                      <Badge variant={client.account_type === 'Key Accounts' ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0 h-4">
                        {client.account_type.replace(' Accounts', '')}
                      </Badge>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="border-t bg-muted/20 p-2 flex gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 h-8 text-xs"
                      onClick={() => handleOpenView(client)}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" />
                      View
                    </Button>
                    {!isManager && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex-1 h-8 text-xs"
                          onClick={() => handleOpenEdit(client)}
                        >
                          <Edit className="h-3.5 w-3.5 mr-1" />
                          Edit
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleOpenTransfer(client)}>
                              <ArrowRightLeft className="h-4 w-4 mr-2" />
                              Transfer
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleOpenDelete(client)} className="text-destructive">
                              <Trash2 className="h-4 w-4 mr-2" />
                              Void Client
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </>
                    )}
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
                  <TableHead className="text-center">Shop Name</TableHead>
                  <TableHead className="text-center">Email</TableHead>
                  <TableHead className="text-center">Phone</TableHead>
                  <TableHead className="text-center">Agent</TableHead>
                  <TableHead className="text-center">City</TableHead>
                  <TableHead className="text-center">Account Type</TableHead>
                  <TableHead className="text-center">Category</TableHead>
                  <TableHead className="text-center">Forge</TableHead>
                  <TableHead className="text-center">Orders</TableHead>
                  <TableHead>Total Spent</TableHead>
                  <TableHead>Visits</TableHead>
                  <TableHead className="text-center">Approval</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedClients.map((client) => (
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
                                  <head><title>${client.name} - Photo</title></head>
                                  <body style="margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#000;">
                                    <img src="${client.photo_url}" style="max-width:100%;max-height:100vh;object-fit:contain;" />
                                  </body>
                                </html>
                              `);
                              }
                            }}
                          />
                          <Camera className="w-4 h-4 absolute bottom-0 right-0 bg-primary text-white rounded-full p-0.5" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
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
                        <span className="text-muted-foreground text-xs">No city</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={client.account_type === 'Key Accounts' ? 'default' : 'secondary'} className="text-xs">
                        {client.account_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant="outline"
                        className={`text-xs ${client.category === 'Open' ? 'border-green-500 text-green-700' :
                          client.category === 'Renovating' ? 'border-yellow-500 text-yellow-700' :
                            'border-red-500 text-red-700'
                          }`}
                      >
                        {client.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {client.has_forge ? (
                        <Badge variant="default" className="bg-green-600 hover:bg-green-700 text-xs">
                          Yes
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          No
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">{client.total_orders}</TableCell>
                    <TableCell className="font-medium text-green-600">
                      ₱{client.total_spent.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 font-medium text-purple-600">
                        <MapPin className="h-3 w-3" />
                        {client.visit_count}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={`border ${getApprovalStatusBadge(client.approval_status).className}`}>
                        {getApprovalStatusBadge(client.approval_status).label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleOpenView(client)}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          {!isManager && (
                            <>
                              <DropdownMenuItem onClick={() => handleOpenTransfer(client)}>
                                <ArrowRightLeft className="h-4 w-4 mr-2" />
                                Transfer Client
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleOpenEdit(client)}>
                                <Edit className="h-4 w-4 mr-2" />
                                Edit Client
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleOpenDelete(client)} className="text-destructive focus:text-destructive">
                                <Trash2 className="h-4 w-4 mr-2" />
                                Void Client
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          {filteredClients.length > itemsPerPage && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                Showing {startIndex + 1}-{Math.min(endIndex, filteredClients.length)} of {filteredClients.length} clients
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(page => {
                      // Show first page, last page, current page, and pages around current
                      return (
                        page === 1 ||
                        page === totalPages ||
                        (page >= currentPage - 1 && page <= currentPage + 1)
                      );
                    })
                    .map((page, index, array) => {
                      // Add ellipsis if there's a gap
                      const prevPage = array[index - 1];
                      const showEllipsis = prevPage && page - prevPage > 1;

                      return (
                        <div key={page} className="flex items-center gap-1">
                          {showEllipsis && (
                            <span className="px-2 text-muted-foreground">...</span>
                          )}
                          <Button
                            variant={currentPage === page ? "default" : "outline"}
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
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* View Client Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="w-[92vw] max-w-md sm:max-w-lg md:max-w-2xl lg:max-w-3xl max-h-[85vh] overflow-y-auto md:max-h-none md:overflow-visible">
          <DialogHeader>
            <DialogTitle>Client Details</DialogTitle>
            <DialogDescription>
              View detailed information about this client including contact details, orders, and assignment status.
            </DialogDescription>
          </DialogHeader>
          {viewingClient && (
            <div className="space-y-6 py-2">
              <div className="flex items-center gap-4">
                {viewingClient.photo_url ? (
                  <img src={viewingClient.photo_url} alt={viewingClient.name} className="w-16 h-16 rounded-full object-cover border" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                    <Building className="w-7 h-7 text-muted-foreground" />
                  </div>
                )}
                <div>
                  <p className="text-xl font-semibold">{viewingClient.name}</p>
                  <p className="text-sm text-muted-foreground">{viewingClient.company || '—'}</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <Badge variant="outline" className={`w-fit border ${getApprovalStatusBadge(viewingClient.approval_status).className}`}>
                  {getApprovalStatusBadge(viewingClient.approval_status).label}
                </Badge>
                <div className="text-xs text-muted-foreground space-y-1 sm:text-right">
                  {viewingClient.approval_status === 'pending' && viewingClient.approval_requested_at && (
                    <p>Approval requested on {new Date(viewingClient.approval_requested_at).toLocaleString()}</p>
                  )}
                  {viewingClient.approval_status === 'approved' && viewingClient.approved_at && (
                    <p>Approved on {new Date(viewingClient.approved_at).toLocaleString()}</p>
                  )}
                  {viewingClient.approval_status === 'rejected' && viewingClient.approval_notes && (
                    <p className="text-destructive">Reason: {viewingClient.approval_notes}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-muted/40 rounded-lg border">
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="font-medium break-all">{viewingClient.email || '—'}</p>
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
                    {isClientUnassigned(viewingClient) ? 'No Agent' : (viewingClient.agent_name || 'Unassigned')}
                  </p>
                </div>
                <div className="p-4 bg-muted/40 rounded-lg border">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge variant="outline">{viewingClient.status}</Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-background rounded-lg border">
                  <p className="text-xs text-muted-foreground">Orders</p>
                  <p className="text-2xl font-bold">{viewingClient.total_orders}</p>
                </div>
                <div className="p-4 bg-background rounded-lg border">
                  <p className="text-xs text-muted-foreground">Total Spent</p>
                  <p className="text-1xl font-bold">₱{viewingClient.total_spent.toLocaleString()}</p>
                </div>
                <div className="p-4 bg-background rounded-lg border">
                  <p className="text-xs text-muted-foreground">Total Visits</p>
                  <div className="flex items-center gap-1 text-purple-600">
                    <MapPin className="h-5 w-5" />
                    <p className="text-2xl font-bold">{viewingClient.visit_count}</p>
                  </div>
                </div>
                <div className="p-4 bg-background rounded-lg border">
                  <p className="text-xs text-muted-foreground">Last Order</p>
                  <p className="text-sm font-medium">{viewingClient.last_order_date ? new Date(viewingClient.last_order_date).toLocaleDateString() : '—'}</p>
                </div>
              </div>

              {/* Compliance Checklist */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm text-gray-900">Compliance Status</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* COR Check */}
                  <div className={`flex items-center justify-between p-4 rounded-lg border ${viewingClient.cor_url ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${viewingClient.cor_url ? 'bg-green-100' : 'bg-red-100'}`}>
                        {viewingClient.cor_url ? <CheckCircle className="h-5 w-5 text-green-600" /> : <X className="h-5 w-5 text-red-600" />}
                      </div>
                      <div>
                        <p className={`font-medium ${viewingClient.cor_url ? 'text-green-900' : 'text-red-900'}`}>COR (Certificate of Registration)</p>
                        <p className="text-xs text-muted-foreground">{viewingClient.cor_url ? 'Uploaded & Verified' : 'Missing Document'}</p>
                      </div>
                    </div>
                    {viewingClient.cor_url && (
                      <Button variant="ghost" size="sm" onClick={() => window.open(viewingClient.cor_url, '_blank')}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  {/* TIN Check */}
                  <div className={`flex items-center justify-between p-4 rounded-lg border ${viewingClient.tin ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${viewingClient.tin ? 'bg-green-100' : 'bg-red-100'}`}>
                        {viewingClient.tin ? <CheckCircle className="h-5 w-5 text-green-600" /> : <X className="h-5 w-5 text-red-600" />}
                      </div>
                      <div>
                        <p className={`font-medium ${viewingClient.tin ? 'text-green-900' : 'text-red-900'}`}>TIN (Tax ID Number)</p>
                        <p className="text-xs text-muted-foreground">{viewingClient.tin ? viewingClient.tin : 'Missing TIN'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
                <div>
                  <span>Created:</span>
                  <span className="ml-2 font-medium text-foreground">{new Date(viewingClient.created_at).toLocaleString()}</span>
                </div>
                <div>
                  <span>Updated:</span>
                  <span className="ml-2 font-medium text-foreground">{new Date(viewingClient.updated_at).toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Client Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="text-xl">Edit Client Information</DialogTitle>
            <DialogDescription>
              Update client details, contact information, and business classification.
            </DialogDescription>
          </DialogHeader>
          {editingClient && (
            <div className="flex-1 overflow-y-auto px-1">
              <div className="space-y-6 py-4">
                {/* Client Photo Section for Admin/Super Admin */}
                {(isAdmin || isSuperAdmin) && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-primary border-b pb-2">
                      Client Photo
                      <Badge variant="secondary" className="ml-2 text-xs">Admin Only</Badge>
                    </h3>

                    {/* Current Photo Display */}
                    <div className="space-y-3">
                      <Label className="text-sm">Current Photo</Label>
                      <div className="flex flex-col items-center">
                        {/* Photo Display */}
                        {editClientPhoto ? (
                          <div className="relative w-full max-w-md border-2 border-blue-300 rounded-lg overflow-hidden">
                            <img
                              src={editClientPhoto}
                              alt="New photo preview"
                              className="w-full h-64 object-cover"
                            />
                            <div className="absolute top-2 right-2">
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                onClick={() => setEditClientPhoto(null)}
                              >
                                <X className="h-4 w-4 mr-1" />
                                Remove New Photo
                              </Button>
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 bg-blue-600/95 p-2">
                              <p className="text-xs text-white font-medium text-center">
                                ✓ New photo ready to upload - will replace current photo
                              </p>
                            </div>
                          </div>
                        ) : editingClient.photo_url ? (
                          <div className="relative w-full max-w-md border rounded-lg overflow-hidden">
                            <img
                              src={editingClient.photo_url}
                              alt={editingClient.name}
                              className="w-full h-64 object-cover"
                            />
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                              <p className="text-xs text-white">
                                {editingClient.photo_timestamp
                                  ? `Captured: ${new Date(editingClient.photo_timestamp).toLocaleDateString()}`
                                  : 'Photo on file'
                                }
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="w-full max-w-md border-2 border-dashed rounded-lg h-64 flex items-center justify-center bg-muted/30">
                            <div className="text-center text-muted-foreground">
                              <Camera className="h-16 w-16 mx-auto mb-3 opacity-40" />
                              <p className="text-sm font-medium">No photo available</p>
                              <p className="text-xs mt-1">Upload a photo below</p>
                            </div>
                          </div>
                        )}

                        {/* Upload Button */}
                        <div className="mt-4 w-full max-w-md">
                          <Button
                            type="button"
                            variant={editClientPhoto ? "secondary" : "outline"}
                            onClick={() => editClientPhotoInputRef.current?.click()}
                            className="w-full h-12"
                          >
                            <Upload className="h-5 w-5 mr-2" />
                            {editClientPhoto ? 'Choose Different Photo' : 'Upload New Photo'}
                          </Button>
                          <input
                            ref={editClientPhotoInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/jpg"
                            onChange={handleEditClientPhotoUpload}
                            className="hidden"
                          />
                          <p className="text-xs text-muted-foreground text-center mt-2">
                            PNG or JPG format • Maximum 5MB
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Warning Note */}
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <div className="flex gap-2">
                        <span className="text-amber-600 text-lg flex-shrink-0">⚠️</span>
                        <div className="text-xs text-amber-900">
                          <p className="font-medium">Note about location:</p>
                          <p>Photos uploaded from the edit dialog do not capture GPS location. Location data is only recorded during initial client registration at the physical location.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Basic Information Section */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-primary border-b pb-2">Basic Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Trade Name *</Label>
                      <Input
                        placeholder="Enter client name"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Shop Name</Label>
                      <Input
                        placeholder="Shop name"
                        value={editForm.company}
                        onChange={(e) => setEditForm({ ...editForm, company: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* Contact Information Section */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-primary border-b pb-2">Contact Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input
                        type="email"
                        placeholder="client@company.com"
                        value={editForm.email}
                        onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone Number</Label>
                      <div className="flex gap-2">
                        <div className="w-16">
                          <Input
                            value="+63"
                            disabled
                            className="bg-muted text-center font-semibold"
                          />
                        </div>
                        <Input
                          placeholder="9XX-XXX-XXXX"
                          value={editForm.phone}
                          onChange={(e) => handlePhoneChange(e.target.value, 'edit')}
                          maxLength={12}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">Format: +63 9XX-XXX-XXXX</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Contact Person</Label>
                      <Input
                        placeholder="Contact person name"
                        value={editForm.contact_person}
                        onChange={(e) => setEditForm({ ...editForm, contact_person: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>TIN (Tax Identification Number)</Label>
                      <Input
                        placeholder="XXX-XXX-XXX-XXX"
                        value={editForm.tin}
                        onChange={(e) => setEditForm({ ...editForm, tin: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* Location Information Section */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-primary border-b pb-2">
                    Location Information
                    <span className="text-xs text-muted-foreground font-normal ml-2">(Read-only)</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>
                        Address
                        <Badge variant="secondary" className="ml-2 text-xs">Read-only</Badge>
                      </Label>
                      <Input
                        placeholder="Business address"
                        value={editForm.address}
                        disabled
                        readOnly
                        className="bg-muted/50 cursor-not-allowed"
                      />
                      <p className="text-xs text-muted-foreground">
                        📍 Captured during client registration
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>
                        City
                        <Badge variant="secondary" className="ml-2 text-xs">Read-only</Badge>
                      </Label>
                      <Input
                        placeholder="City"
                        value={editForm.city}
                        disabled
                        readOnly
                        className="bg-muted/50 cursor-not-allowed"
                      />
                      <p className="text-xs text-muted-foreground">
                        🌍 Auto-detected from location
                      </p>
                    </div>
                  </div>
                </div>

                {/* Business Classification Section */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-primary border-b pb-2">Business Classification</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Type Of Account</Label>
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
                          <SelectItem value="Standard Accounts">Standard Accounts</SelectItem>
                          <SelectItem value="Key Accounts">Key Accounts</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Select
                        value={editForm.category}
                        onValueChange={(value: 'Permanently Closed' | 'Renovating' | 'Open') =>
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
                    <div className="space-y-2">
                      <Label>Has Forge?</Label>
                      <RadioGroup
                        value={editForm.has_forge ? 'yes' : 'no'}
                        onValueChange={(value) => setEditForm({ ...editForm, has_forge: value === 'yes' })}
                        className="flex gap-6 pt-2"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="yes" id="edit-has-forge-yes" />
                          <Label htmlFor="edit-has-forge-yes" className="font-normal cursor-pointer">
                            Yes
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="no" id="edit-has-forge-no" />
                          <Label htmlFor="edit-has-forge-no" className="font-normal cursor-pointer">
                            No
                          </Label>
                        </div>
                      </RadioGroup>
                    </div>
                  </div>
                </div>

                {/* COR Upload Section for Admin/Super Admin */}
                {(isAdmin || isSuperAdmin) && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-primary border-b pb-2">
                      Compliance Documents
                      <Badge variant="secondary" className="ml-2 text-xs">Admin Only</Badge>
                    </h3>

                    {/* COR Display */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">COR (Certificate of Registration)</Label>
                        {!editingClient?.cor_url && !editCorPhoto && (
                          <Badge variant="destructive" className="text-xs">Missing</Badge>
                        )}
                        {editingClient?.cor_url && !editCorPhoto && (
                          <Badge variant="default" className="text-xs bg-green-600">Available</Badge>
                        )}
                        {editCorPhoto && (
                          <Badge variant="default" className="text-xs bg-blue-600">New Document Ready</Badge>
                        )}
                      </div>

                      <div className="flex flex-col items-center">
                        {/* Document Display */}
                        {editCorPhoto ? (
                          <div className="relative w-full max-w-md border-2 border-blue-300 rounded-lg overflow-hidden bg-blue-50">
                            <img
                              src={editCorPhoto}
                              alt="New COR preview"
                              className="w-full h-64 object-contain bg-white"
                            />
                            <div className="absolute top-2 right-2">
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                onClick={() => setEditCorPhoto(null)}
                              >
                                <X className="h-4 w-4 mr-1" />
                                Remove
                              </Button>
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 bg-blue-600/95 p-2">
                              <p className="text-xs text-white font-medium text-center">
                                ✓ New COR document ready - will replace current document
                              </p>
                            </div>
                          </div>
                        ) : editingClient?.cor_url ? (
                          <div className="w-full max-w-md">
                            <div className="flex items-center gap-3 p-4 bg-green-50 border-2 border-green-200 rounded-lg">
                              <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                                <CheckCircle className="h-6 w-6 text-green-600" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-green-900">COR Document Available</p>
                                <p className="text-xs text-green-700 mt-0.5">Certificate of Registration is on file</p>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => window.open(editingClient.cor_url, '_blank')}
                                className="flex-shrink-0 h-9 bg-white hover:bg-green-100"
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                View
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="w-full max-w-md border-2 border-dashed rounded-lg h-48 flex items-center justify-center bg-muted/30">
                            <div className="text-center text-muted-foreground">
                              <Upload className="h-16 w-16 mx-auto mb-3 opacity-40" />
                              <p className="text-sm font-medium">No COR document</p>
                              <p className="text-xs mt-1">Upload certificate below</p>
                            </div>
                          </div>
                        )}

                        {/* Upload Button */}
                        <div className="mt-4 w-full max-w-md">
                          <Button
                            type="button"
                            variant={editCorPhoto ? "secondary" : "outline"}
                            onClick={() => editCorFileInputRef.current?.click()}
                            className="w-full h-12"
                          >
                            <Upload className="h-5 w-5 mr-2" />
                            {editCorPhoto
                              ? 'Choose Different Document'
                              : editingClient?.cor_url
                                ? 'Replace COR Document'
                                : 'Upload COR Document'
                            }
                          </Button>
                          <input
                            ref={editCorFileInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/jpg"
                            onChange={handleEditCorFileUpload}
                            className="hidden"
                          />
                          <p className="text-xs text-muted-foreground text-center mt-2">
                            PNG or JPG format • Maximum 10MB
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Information Note */}
                <div className="bg-blue-50/50 border border-blue-200 rounded-lg p-4">
                  <div className="flex gap-3">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                        <span className="text-blue-600 text-lg">ℹ️</span>
                      </div>
                    </div>
                    <div className="text-sm text-blue-900">
                      <p className="font-medium mb-1">Important Notes:</p>
                      <ul className="space-y-1 text-xs text-blue-800">
                        <li>• Address and city cannot be edited (set during registration with GPS)</li>
                        <li>• Client photos can only be updated by visiting the client location</li>
                        {(isAdmin || isSuperAdmin) && (
                          <li>• As an admin, you can upload or replace compliance documents</li>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Fixed Footer with Actions */}
          <div className="flex-shrink-0 border-t pt-4 mt-2 flex justify-between items-center gap-3">
            <div className="text-xs text-muted-foreground">
              Last updated: {editingClient && new Date(editingClient.updated_at).toLocaleString()}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setEditDialogOpen(false);
                  setEditCorPhoto(null);
                  setEditClientPhoto(null);
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
              Are you sure you want to update {editingClient?.name}'s information?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmUpdate}>
              Confirm Update
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void Client</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to void <strong>{clientToDelete?.name}</strong>?
              This will mark the client as voided and remove them from the active client list. The client data will be preserved but hidden from normal operations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Void Client
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Individual Transfer Dialog */}
      <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Transfer Client</DialogTitle>
            <DialogDescription>
              Transfer this client to a different sales agent. The client's city tags will be updated automatically.
            </DialogDescription>
          </DialogHeader>
          {transferringClient && (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-muted/50 rounded-lg">
                <h4 className="font-semibold">{transferringClient.name}</h4>
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Current Agent:</span>
                    <Badge variant="secondary" className="font-medium">
                      {isClientUnassigned(transferringClient) ? 'No Agent' : (transferringClient.agent_name || 'Unassigned')}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">City:</span>
                    <Badge variant="outline">
                      {transferringClient.city || 'Not specified'}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Select New Agent</Label>
                {loadingAgents ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Loading agents...
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {agents
                      .filter(agent => {
                        // For unassigned clients, show all agents
                        if (isClientUnassigned(transferringClient)) {
                          return true;
                        }
                        // For regular clients, exclude current agent
                        return agent.id !== transferringClient.agent_id;
                      })
                      .map((agent) => (
                        <div
                          key={agent.id}
                          className={`p-3 border rounded-lg cursor-pointer transition-colors ${selectedAgentId === agent.id
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:bg-muted/50'
                            }`}
                          onClick={() => setSelectedAgentId(agent.id)}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">{agent.name}</p>
                              <p className="text-sm text-muted-foreground">
                                Cities: {agent.cities.join(', ') || 'None'}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-medium">{agent.clientCount} clients</p>
                              <div className="flex gap-1 mt-1">
                                {agent.cities.slice(0, 2).map((city, index) => (
                                  <Badge key={index} variant="outline" className="text-xs">
                                    {city}
                                  </Badge>
                                ))}
                                {agent.cities.length > 2 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{agent.cities.length - 2}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    {!isClientUnassigned(transferringClient) && transferringClient.agent_id && agents.filter(agent => agent.id === transferringClient.agent_id).length > 0 && (
                      <div className="p-3 border rounded-lg bg-muted/30 border-muted">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-muted-foreground">
                              {agents.find(a => a.id === transferringClient.agent_id)?.name}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Current Agent (Cannot transfer to same agent)
                            </p>
                          </div>
                          <Badge variant="secondary">Current</Badge>
                        </div>
                      </div>
                    )}
                    {isClientUnassigned(transferringClient) && (
                      <div className="p-3 border rounded-lg bg-blue-50 border-blue-200">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-blue-700">
                              Unassigned Client
                            </p>
                            <p className="text-sm text-blue-600">
                              This client has no agent assigned
                            </p>
                          </div>
                          <Badge variant="outline" className="text-blue-700 border-blue-300">No Agent</Badge>
                        </div>
                      </div>
                    )}
                    {!isClientUnassigned(transferringClient) && !transferringClient.agent_id && (
                      <div className="p-3 border rounded-lg bg-blue-50 border-blue-200">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-blue-700">
                              Unassigned Client
                            </p>
                            <p className="text-sm text-blue-600">
                              This client is currently floating (no agent assigned)
                            </p>
                          </div>
                          <Badge variant="outline" className="text-blue-700 border-blue-300">Floating</Badge>
                        </div>
                      </div>
                    )}
                    {agents.length === 0 && (
                      <p className="text-center text-muted-foreground py-4">
                        No agents available
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setTransferDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleTransferClient}
                  disabled={!selectedAgentId || transferring}
                >
                  {transferring ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Transferring...
                    </>
                  ) : (
                    'Transfer Client'
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk Transfer Dialog */}
      <Dialog open={bulkTransferDialogOpen} onOpenChange={setBulkTransferDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk Transfer Clients</DialogTitle>
            <DialogDescription>
              Assign multiple clients to different agents at once. Clients are grouped by city for easier management.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {loadingAgents ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                Loading agents...
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(
                  filteredClients
                    .reduce((groups, client) => {
                      const city = client.city || 'No City';
                      if (!groups[city]) groups[city] = [];
                      groups[city].push(client);
                      return groups;
                    }, {} as Record<string, Client[]>)
                ).map(([city, cityClients]) => (
                  <div key={city} className="border rounded-lg p-4">
                    <h4 className="font-semibold mb-3">{city} ({cityClients.length} clients)</h4>
                    <div className="space-y-2">
                      {cityClients.map((client) => (
                        <div key={client.id} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                          <div>
                            <p className="font-medium">{client.name}</p>
                            <p className="text-sm text-muted-foreground">
                              Current: {isClientUnassigned(client) ? 'No Agent' : (client.agent_name || 'Unassigned')}
                            </p>
                          </div>
                          <Select
                            value={bulkTransferAssignments[client.id] || ''}
                            onValueChange={(value) =>
                              setBulkTransferAssignments(prev => ({
                                ...prev,
                                [client.id]: value
                              }))
                            }
                          >
                            <SelectTrigger className="w-48">
                              <SelectValue placeholder="Select agent" />
                            </SelectTrigger>
                            <SelectContent>
                              {agents.map((agent) => (
                                <SelectItem key={agent.id} value={agent.id}>
                                  <div className="flex items-center justify-between w-full">
                                    <span>{agent.name}</span>
                                    <span className="text-muted-foreground ml-2">
                                      ({agent.clientCount} clients)
                                    </span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setBulkTransferDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleBulkTransfer}
                disabled={Object.keys(bulkTransferAssignments).length === 0 || bulkTransferring}
              >
                {bulkTransferring ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Transferring...
                  </>
                ) : (
                  `Transfer ${Object.keys(bulkTransferAssignments).length} Clients`
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* City-based Bulk Transfer Dialog */}
      <Dialog open={cityBulkTransferOpen} onOpenChange={setCityBulkTransferOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>City-based Bulk Transfer</DialogTitle>
            <DialogDescription>
              Transfer all clients from a city to a specific agent
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* City Selection */}
            <div className="space-y-2">
              <Label>City</Label>
              <Select value={selectedCity} onValueChange={handleCityChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a city" />
                </SelectTrigger>
                <SelectContent>
                  {getUniqueCities().map((city) => (
                    <SelectItem key={city} value={city}>
                      {city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Current Holder and Transfer Options */}
            {selectedCity && (
              <div className="space-y-4">
                {/* Current Holder */}
                <div className="p-4 border rounded-lg bg-muted/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium">Current Holder</h4>
                      {getCurrentCityHolder(selectedCity) ? (
                        <p className="text-sm text-muted-foreground">
                          {getCurrentCityHolder(selectedCity)?.name}
                          ({cityClients.length} clients)
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">No current holder</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Transfer To */}
                <div className="space-y-2">
                  <Label>Transfer to</Label>
                  <Select
                    value={selectedTransferAgent}
                    onValueChange={setSelectedTransferAgent}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select agent" />
                    </SelectTrigger>
                    <SelectContent>
                      {getAvailableAgents(selectedCity).map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          <div className="flex items-center justify-between w-full">
                            <span>{agent.name}</span>
                            <span className="text-muted-foreground ml-2">
                              ({agent.clientCount} clients)
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Clients List */}
                <div className="space-y-2">
                  <Label>Clients in {selectedCity} ({cityClients.length})</Label>
                  <div className="max-h-60 overflow-y-auto border rounded-lg">
                    {cityClients.length > 0 ? (
                      <div className="divide-y">
                        {cityClients.map((client) => (
                          <div key={client.id} className="p-3 flex items-center justify-between">
                            <div>
                              <p className="font-medium">{client.name}</p>
                              <p className="text-sm text-muted-foreground">
                                Current Agent: {agents.find(a => a.id === client.agent_id)?.name || 'Unknown'}
                              </p>
                            </div>
                            <Badge variant="outline">{client.city}</Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 text-center text-muted-foreground">
                        No clients found in this city
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setCityBulkTransferOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCityBulkTransfer}
              disabled={!selectedCity || !selectedTransferAgent || cityTransferring}
            >
              {cityTransferring ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Transferring...
                </>
              ) : (
                `Transfer All ${cityClients.length} Clients`
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

