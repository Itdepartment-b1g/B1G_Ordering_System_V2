import { useState, useEffect } from 'react';
import { useAuth } from '@/features/auth/hooks';
import { supabase } from '@/lib/supabase';
import { SystemAuditLog } from '@/types/database.types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, History, Download, RefreshCw, Filter } from 'lucide-react';
import { AuditLogCard } from './components/AuditLogCard';
import { useToast } from '@/hooks/use-toast';
import { groupAuditLogs, GroupedAuditLog } from '@/lib/auditGrouping.helpers';

export default function SystemHistoryPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [auditLogs, setAuditLogs] = useState<SystemAuditLog[]>([]);
  const [groupedLogs, setGroupedLogs] = useState<GroupedAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [tableFilter, setTableFilter] = useState('all');
  const [operationFilter, setOperationFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  // Role-based page title
  const getPageTitle = () => {
    switch (user?.role) {
      case 'super_admin':
      case 'admin':
      case 'system_administrator':
        return 'System History';
      case 'finance':
        return 'Transaction History';
      case 'manager':
      case 'team_leader':
        return 'Team Activity History';
      default:
        return 'My Activity History';
    }
  };

  const getPageDescription = () => {
    switch (user?.role) {
      case 'super_admin':
      case 'admin':
      case 'system_administrator':
        return 'Comprehensive audit trail of all system activities';
      case 'finance':
        return 'Track all financial transactions and order activities';
      case 'manager':
      case 'team_leader':
        return 'Monitor your team\'s activities and changes';
      default:
        return 'View your activity history in the system';
    }
  };

  // Enrich audit logs with additional context (agent names, variant names)
  const enrichAuditLogs = async (logs: SystemAuditLog[]): Promise<SystemAuditLog[]> => {
    try {
      // Extract all unique agent IDs and variant IDs from the logs
      const agentIds = new Set<string>();
      const variantIds = new Set<string>();
      
      // Also extract client IDs for orders
      const clientIds = new Set<string>();
      
      logs.forEach(log => {
        if (log.table_name === 'agent_inventory') {
          const data = log.new_data as any;
          if (data?.agent_id) agentIds.add(data.agent_id);
          if (data?.variant_id) variantIds.add(data.variant_id);
        }
        if (log.table_name === 'inventory_transactions') {
          const data = log.new_data as any;
          if (data?.variant_id) variantIds.add(data.variant_id);
          // Try to extract agent ID from notes
          const notes = data?.notes || '';
          const agentIdMatch = notes.match(/agent\s+([a-f0-9-]{36})/);
          if (agentIdMatch) agentIds.add(agentIdMatch[1]);
        }
        if (log.table_name === 'client_orders') {
          const data = log.new_data as any;
          if (data?.client_id) clientIds.add(data.client_id);
        }
      });

      // Fetch profile names for agents
      const profilesMap = new Map<string, string>();
      if (agentIds.size > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', Array.from(agentIds));
        
        profiles?.forEach(p => profilesMap.set(p.id, p.full_name));
      }

      // Fetch variant names
      const variantsMap = new Map<string, string>();
      if (variantIds.size > 0) {
        const { data: variants } = await supabase
          .from('variants')
          .select('id, name')
          .in('id', Array.from(variantIds));
        
        variants?.forEach(v => variantsMap.set(v.id, v.name));
      }

      // Fetch client names
      const clientsMap = new Map<string, string>();
      if (clientIds.size > 0) {
        const { data: clients } = await supabase
          .from('clients')
          .select('id, name')
          .in('id', Array.from(clientIds));
        
        clients?.forEach(c => clientsMap.set(c.id, c.name));
      }

      // Enrich the logs
      return logs.map(log => {
        const enrichedLog = { ...log };
        if (log.table_name === 'agent_inventory' && enrichedLog.new_data) {
          const data = { ...enrichedLog.new_data } as any;
          if (data?.agent_id && profilesMap.has(data.agent_id)) {
            data.agent_name = profilesMap.get(data.agent_id);
          }
          if (data?.variant_id && variantsMap.has(data.variant_id)) {
            data.variant_name = variantsMap.get(data.variant_id);
          }
          enrichedLog.new_data = data;
        }
        if (log.table_name === 'inventory_transactions' && enrichedLog.new_data) {
          const data = { ...enrichedLog.new_data } as any;
          if (data?.variant_id && variantsMap.has(data.variant_id)) {
            data.variant_name = variantsMap.get(data.variant_id);
          }
          // Enrich with agent name
          const notes = data?.notes || '';
          const agentIdMatch = notes.match(/agent\s+([a-f0-9-]{36})/);
          if (agentIdMatch && profilesMap.has(agentIdMatch[1])) {
            data.target_agent_name = profilesMap.get(agentIdMatch[1]);
          }
          enrichedLog.new_data = data;
        }
        if (log.table_name === 'client_orders' && enrichedLog.new_data) {
          const data = { ...enrichedLog.new_data } as any;
          if (data?.client_id && clientsMap.has(data.client_id)) {
            data.client_name = clientsMap.get(data.client_id);
          }
          enrichedLog.new_data = data;
        }
        return enrichedLog;
      });
    } catch (error) {
      console.error('Error enriching audit logs:', error);
      return logs; // Return original logs if enrichment fails
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, [tableFilter, operationFilter, userFilter]);

  const fetchAuditLogs = async () => {
    try {
      setLoading(true);

      let query = supabase
        .from('system_audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500); // Fetch more for client-side filtering

      if (tableFilter !== 'all') {
        query = query.eq('table_name', tableFilter);
      }

      if (operationFilter !== 'all') {
        query = query.eq('operation', operationFilter);
      }

      if (userFilter) {
        query = query.or(`user_name.ilike.%${userFilter}%,user_email.ilike.%${userFilter}%`);
      }

      const { data, error } = await query;

      if (error) throw error;

      let logs = data || [];
      
      // Enrich logs with additional context (agent names, variant names, etc.)
      logs = await enrichAuditLogs(logs);
      
      setAuditLogs(logs);
      
      // Group related audit logs into consolidated entries
      const grouped = groupAuditLogs(logs);
      setGroupedLogs(grouped);
    } catch (error: any) {
      console.error('Error fetching audit logs:', error);
      toast({
        title: 'Error Loading History',
        description: error.message || 'Failed to load audit history',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAuditLogs();
  };

  const handleClearFilters = () => {
    setTableFilter('all');
    setOperationFilter('all');
    setUserFilter('');
    setCurrentPage(1);
  };

  // Pagination (use grouped logs)
  const indexOfLastLog = currentPage * itemsPerPage;
  const indexOfFirstLog = indexOfLastLog - itemsPerPage;
  const currentLogs = groupedLogs.slice(indexOfFirstLog, indexOfLastLog);
  const totalPages = Math.ceil(groupedLogs.length / itemsPerPage);

  // Available tables based on role - using business-friendly names
  const getAvailableTables = () => {
    const commonTables = [
      { value: 'all', label: 'All Items' },
      { value: 'clients', label: 'Clients' },
      { value: 'client_orders', label: 'Orders' },
    ];

    if (user?.role === 'finance') {
      return [
        { value: 'all', label: 'All Transactions' },
        { value: 'client_orders', label: 'Orders' },
        { value: 'cash_deposits', label: 'Cash Deposits' },
        { value: 'financial_transactions', label: 'Financial Transactions' },
        { value: 'purchase_orders', label: 'Purchase Orders' },
        { value: 'remittances_log', label: 'Remittances' },
      ];
    }

    if (user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'system_administrator') {
      return [
        { value: 'all', label: 'All Items' },
        { value: 'clients', label: 'Clients' },
        { value: 'client_orders', label: 'Orders' },
        { value: 'profiles', label: 'User Profiles' },
        { value: 'main_inventory', label: 'Main Inventory' },
        { value: 'agent_inventory', label: 'Agent Inventory' },
        { value: 'purchase_orders', label: 'Purchase Orders' },
        { value: 'cash_deposits', label: 'Cash Deposits' },
        { value: 'stock_requests', label: 'Stock Requests' },
        { value: 'remittances_log', label: 'Remittances' },
        { value: 'financial_transactions', label: 'Financial Transactions' },
        { value: 'brands', label: 'Brands' },
        { value: 'variants', label: 'Product Variants' },
        { value: 'leader_teams', label: 'Team Assignments' },
        { value: 'companies', label: 'Companies' },
      ];
    }

    return commonTables;
  };

  if (loading && auditLogs.length === 0) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <div className="text-muted-foreground">Loading audit history...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <History className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">{getPageTitle()}</h1>
          </div>
          <p className="text-muted-foreground mt-1">{getPageDescription()}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Refreshing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Activities</CardDescription>
            <CardTitle className="text-2xl">{groupedLogs.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Created</CardDescription>
            <CardTitle className="text-2xl text-green-600">
              {groupedLogs.filter(g => g.logs.some(l => l.operation === 'INSERT')).length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Updated</CardDescription>
            <CardTitle className="text-2xl text-blue-600">
              {groupedLogs.filter(g => g.logs.some(l => l.operation === 'UPDATE')).length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Deleted</CardDescription>
            <CardTitle className="text-2xl text-red-600">
              {groupedLogs.filter(g => g.logs.some(l => l.operation === 'DELETE')).length}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              <CardTitle className="text-lg">Filters</CardTitle>
            </div>
            <Button variant="ghost" size="sm" onClick={handleClearFilters}>
              Clear All
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Affected Item Filter */}
            <div className="space-y-2">
              <Label>Affected Item</Label>
              <Select value={tableFilter} onValueChange={setTableFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getAvailableTables().map((table) => (
                    <SelectItem key={table.value} value={table.value}>
                      {table.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Action Filter */}
            <div className="space-y-2">
              <Label>Action Type</Label>
              <Select value={operationFilter} onValueChange={setOperationFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="INSERT">Created</SelectItem>
                  <SelectItem value="UPDATE">Updated</SelectItem>
                  <SelectItem value="DELETE">Deleted</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Performed By Filter */}
            <div className="space-y-2">
              <Label>Performed By</Label>
              <Input
                placeholder="Search by name or email..."
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit Log Timeline */}
      <div className="space-y-4">
        {currentLogs.length === 0 ? (
          <Card className="p-12">
            <div className="text-center text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No activity found</p>
              <p className="text-sm">Try adjusting your filters or check back later</p>
            </div>
          </Card>
        ) : (
          currentLogs.map((groupedLog) => <AuditLogCard key={groupedLog.id} groupedLog={groupedLog} />)
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-6">
          <Button
            variant="outline"
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
