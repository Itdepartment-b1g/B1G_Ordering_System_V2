import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Search, CheckCircle, XCircle, Eye, Package, ChevronLeft, ChevronRight, CheckSquare, FileText } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useOrders, type Order } from './OrderContext';
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

export default function OrdersPage() {
  const { getAllOrders, updateOrderStatus } = useOrders();
  const orders = getAllOrders();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [orderToApprove, setOrderToApprove] = useState<Order | null>(null);
  const [orderToReject, setOrderToReject] = useState<Order | null>(null);
  const { toast } = useToast();

  // Client details for View dialog
  const [clientDetails, setClientDetails] = useState<any | null>(null);
  const [loadingClient, setLoadingClient] = useState(false);

  // Rejection reason dialog
  const [reasonDialogOpen, setReasonDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectingForRole, setRejectingForRole] = useState<'leader' | 'admin' | null>(null);

  // Role flags and leader team state
  const isAdmin = user?.role === 'admin';
  const isLeader = user?.position === 'Leader';
  const [teamAgentIds, setTeamAgentIds] = useState<string[]>([]);
  const [teamAgents, setTeamAgents] = useState<{ id: string; name: string }[]>([]);

  // Bulk approval states
  const [bulkApproveDialogOpen, setBulkApproveDialogOpen] = useState(false);
  const [selectedAgentForBulk, setSelectedAgentForBulk] = useState<string>('');
  const [agentOrders, setAgentOrders] = useState<Order[]>([]);
  const [viewingOrderInBulk, setViewingOrderInBulk] = useState<Order | null>(null);
  const [bulkViewDialogOpen, setBulkViewDialogOpen] = useState(false);
  const [bulkClientDetails, setBulkClientDetails] = useState<any | null>(null);
  const [loadingBulkClient, setLoadingBulkClient] = useState(false);
  const [processingBulkApproval, setProcessingBulkApproval] = useState(false);

  // Load leader team agents when user is a leader
  useEffect(() => {
    const loadTeam = async () => {
      try {
        if (!isLeader || !user?.id) {
          setTeamAgentIds([]);
          return;
        }
        const { data, error } = await supabase
          .from('leader_teams')
          .select('agent_id')
          .eq('leader_id', user.id);
        if (error) throw error;
        const ids = (data || []).map((r: any) => r.agent_id);
        setTeamAgentIds(ids);
        if (ids.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', ids);
          setTeamAgents((profiles || []).map((p: any) => ({ id: p.id, name: p.full_name || 'Unknown Agent' })));
        } else {
          setTeamAgents([]);
        }
      } catch (e) {
        console.error('Error loading leader team:', e);
        setTeamAgentIds([]);
      }
    };
    loadTeam();
  }, [isLeader, user?.id]);

  // Restrict visible orders based on role
  const visibleOrders = useMemo(() => {
    if (isAdmin) return orders;
    if (isLeader) return orders.filter(o => teamAgentIds.includes(o.agentId));
    return [] as Order[];
  }, [orders, isAdmin, isLeader, teamAgentIds]);

  // Build team agent list (leaders only) from visible orders
  const teamAgentsSummary = useMemo(() => {
    if (!isLeader) return [] as { agentId: string; agentName: string; orders: number }[];
    const countByAgent: Record<string, number> = {};
    for (const o of visibleOrders) {
      countByAgent[o.agentId] = (countByAgent[o.agentId] || 0) + 1;
    }
    const list = teamAgents.map(a => ({ agentId: a.id, agentName: a.name, orders: countByAgent[a.id] || 0 }));
    return list.sort((a, b) => a.agentName.localeCompare(b.agentName));
  }, [visibleOrders, isLeader, teamAgents]);

  // Pending orders count (role-based) - matches the filterOrders logic
  const pendingOrdersCount = useMemo(() => {
    if (isAdmin) {
      return visibleOrders.filter(o => o.stage === 'leader_approved').length;
    } else if (isLeader) {
      return visibleOrders.filter(o => (o.stage === 'agent_pending' || !o.stage)).length;
    }
    return visibleOrders.filter(o => o.status === 'pending').length;
  }, [visibleOrders, isAdmin, isLeader]);

  // Approved orders (role-based) without search filters
  const approvedOrdersAll = useMemo(() => {
    if (isAdmin) return visibleOrders.filter(o => o.stage === 'admin_approved');
    if (isLeader) return visibleOrders.filter(o => o.stage === 'leader_approved');
    return visibleOrders.filter(o => o.status === 'approved');
  }, [visibleOrders, isAdmin, isLeader]);

  // Approved this month count based on system date
  const approvedThisMonthCount = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return approvedOrdersAll.filter(o => {
      const d = new Date(o.date);
      return d >= start && d < end;
    }).length;
  }, [approvedOrdersAll]);

  // Map legacy status + stage to a clearer label for display
  const getStatusLabel = (order: Order) => {
    // For admin view, ensure we always show "Pending (Admin Review)" for leader_approved orders
    if (order.stage === 'leader_approved') return 'Pending (Admin Review)';
    // Orders pending leader review should show "Pending (Leader Review)"
    if (order.stage === 'agent_pending' || !order.stage) return 'Pending (Leader Review)';
    if (order.stage === 'admin_approved') return 'Approved';
    if (order.stage === 'leader_rejected') return 'Rejected (Leader)';
    if (order.stage === 'admin_rejected') return 'Rejected (Admin)';
    // Fallback: if status is pending but no stage, return Pending (Leader Review)
    // This should only happen for orders that haven't been processed yet
    return order.status === 'pending' ? 'Pending (Leader Review)' : order.status;
  };

  const getStatusVariant = (order: Order) => {
    const label = getStatusLabel(order);
    if (label.startsWith('Approved')) return 'default';
    if (label.startsWith('Pending')) return 'secondary';
    return 'destructive';
  };

  const handleViewOrder = async (order: Order) => {
    setViewingOrder(order);
    setViewDialogOpen(true);
    // Fetch full client details using clientId
    if (!order.clientId) {
      setClientDetails(null);
      return;
    }
    try {
      setLoadingClient(true);
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, email, phone, company, address')
        .eq('id', order.clientId)
        .maybeSingle();
      if (error) throw error;
      setClientDetails(data || null);
    } catch (e) {
      console.error('Error loading client details:', e);
      setClientDetails(null);
    } finally {
      setLoadingClient(false);
    }
  };

  const handleOpenApprove = (order: Order) => {
    setOrderToApprove(order);
    setApproveDialogOpen(true);
  };

  const handleConfirmApprove = async () => {
    if (!orderToApprove) return;

    try {
      if (isLeader) {
        const { data, error } = await supabase.rpc('leader_approve_client_order', {
          p_order_id: orderToApprove.id,
          p_leader_id: user?.id
        });
        if (error || !data?.success) throw new Error(error?.message || data?.message || 'Leader approve failed');
        toast({ title: 'Approved', description: 'Leader approval complete. Deducted from leader inventory.' });
      } else if (isAdmin) {
        const { data, error } = await supabase.rpc('admin_approve_client_order', {
          p_order_id: orderToApprove.id,
          p_admin_id: user?.id
        });
        if (error || !data?.success) throw new Error(error?.message || data?.message || 'Admin approve failed');
        toast({ title: 'Approved', description: 'Admin approval complete. Deducted from main inventory.' });
      } else {
        throw new Error('Not authorized to approve');
      }
      setApproveDialogOpen(false);
      setOrderToApprove(null);
    } catch (error: any) {
      console.error('Error approving order:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to approve order.',
        variant: 'destructive',
        duration: 7000
      });
    }
  };

  const handleOpenReject = (order: Order) => {
    setOrderToReject(order);
    setRejectionReason('');
    setRejectingForRole(isAdmin ? 'admin' : (isLeader ? 'leader' : null));
    setReasonDialogOpen(true);
  };

  const handleConfirmRejectWithReason = async () => {
    if (!orderToReject || !rejectingForRole) return;
    try {
      if (rejectingForRole === 'leader' && isLeader) {
        const { data, error } = await supabase.rpc('leader_reject_client_order', {
          p_order_id: orderToReject.id,
          p_leader_id: user?.id,
          p_reason: rejectionReason || null
        });
        if (error || !data?.success) throw new Error(error?.message || data?.message || 'Leader reject failed');
        toast({ title: 'Rejected', description: 'Order rejected by leader. Stock returned to agent.' });
      } else if (rejectingForRole === 'admin' && isAdmin) {
        const { data, error } = await supabase.rpc('admin_reject_client_order', {
          p_order_id: orderToReject.id,
          p_admin_id: user?.id,
          p_reason: rejectionReason || ''
        });
        if (error || !data?.success) throw new Error(error?.message || data?.message || 'Admin reject failed');
        toast({ title: 'Rejected', description: 'Order sent back to leader with reason.' });
      }
      setReasonDialogOpen(false);
      setOrderToReject(null);
      setRejectingForRole(null);
    } catch (error: any) {
      console.error('Reject error:', error);
      toast({ title: 'Error', description: error.message || 'Failed to reject', variant: 'destructive' });
    }
  };

  const filterOrders = (status?: Order['status']) => {
    let filtered = visibleOrders;
    if (status) {
      if (isAdmin) {
        // Admin view tabs - only show orders that need admin action
        if (status === 'pending') {
          // STRICTLY only show orders that are pending admin review (leader_approved stage)
          // Exclude any orders with agent_pending, null stage, undefined stage, or other stages
          // STRICTLY filter: only show orders with stage === 'leader_approved'
          // This excludes agent_pending, null, undefined, and all other stages
          filtered = filtered.filter(o => o.stage === 'leader_approved');
        } else if (status === 'approved') {
          // Only show orders that are admin approved
          filtered = filtered.filter(o => o.stage === 'admin_approved');
        } else if (status === 'rejected') {
          // Only show orders that are admin rejected
          filtered = filtered.filter(o => o.stage === 'admin_rejected');
        }
      } else if (isLeader) {
        // Leader view tabs
        if (status === 'pending') {
          // Only show orders that are pending leader review
          filtered = filtered.filter(o => (o.stage === 'agent_pending' || !o.stage));
        } else if (status === 'approved') {
          // Show orders that leader approved (now pending admin review)
          filtered = filtered.filter(o => o.stage === 'leader_approved');
        } else if (status === 'rejected') {
          // Show orders that leader rejected
          filtered = filtered.filter(o => o.stage === 'leader_rejected');
        }
      } else {
        filtered = filtered.filter(o => o.status === status);
      }
    } else {
      // "All Orders" tab - apply role-based filtering
      if (isAdmin) {
        // For admin: exclude orders pending leader review (agent_pending or no stage)
        // Only show orders that are relevant to admin (pending admin review, approved, rejected, or admin_approved)
        filtered = filtered.filter(o => {
          // Exclude orders with stage === 'agent_pending' or !stage (these are pending leader review)
          // Include all other orders (leader_approved, admin_approved, admin_rejected, leader_rejected)
          return o.stage !== 'agent_pending' && o.stage !== null && o.stage !== undefined;
        });
      }
      // For leaders and others, show all orders without filtering
    }
    if (searchQuery) {
      filtered = filtered.filter(o =>
        o.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.agentName.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return filtered;
  };

  // Bulk approval handlers
  const handleOpenBulkApprove = () => {
    setSelectedAgentForBulk('');
    setAgentOrders([]);
    setBulkApproveDialogOpen(true);
  };

  const handleSelectAgentForBulk = (agentId: string) => {
    setSelectedAgentForBulk(agentId);
    // Filter orders for this agent that are pending admin approval
    const filtered = orders.filter(
      (o) => o.agentId === agentId &&
        (o.stage === 'leader_approved' || (o.stage === 'agent_pending' && isAdmin))
    );
    setAgentOrders(filtered);
  };

  const handleViewOrderInBulk = async (order: Order) => {
    setViewingOrderInBulk(order);
    setBulkViewDialogOpen(true);

    // Fetch client details
    setLoadingBulkClient(true);
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', order.clientId)
        .single();

      if (error) throw error;
      setBulkClientDetails(data);
    } catch (error) {
      console.error('Error fetching client details:', error);
      setBulkClientDetails(null);
    } finally {
      setLoadingBulkClient(false);
    }
  };

  const handleBulkApprove = async () => {
    if (agentOrders.length === 0) return;

    setProcessingBulkApproval(true);
    try {
      let successCount = 0;
      let failCount = 0;

      for (const order of agentOrders) {
        try {
          const newStage = isAdmin ? 'admin_approved' : 'leader_approved';
          const { error } = await supabase
            .from('client_orders')
            .update({
              stage: newStage,
              updated_at: new Date().toISOString()
            })
            .eq('id', order.id);

          if (error) throw error;

          await updateOrderStatus(order.id, newStage as any);
          successCount++;
        } catch (error) {
          console.error(`Failed to approve order ${order.orderNumber}:`, error);
          failCount++;
        }
      }

      toast({
        title: 'Bulk Approval Complete',
        description: `Successfully approved ${successCount} order(s).${failCount > 0 ? ` Failed: ${failCount}` : ''}`,
      });

      setBulkApproveDialogOpen(false);
      setSelectedAgentForBulk('');
      setAgentOrders([]);
    } catch (error) {
      console.error('Bulk approval error:', error);
      toast({
        title: 'Error',
        description: 'Failed to process bulk approval',
        variant: 'destructive',
      });
    } finally {
      setProcessingBulkApproval(false);
    }
  };

  const OrderTable = ({ orderList }: { orderList: Order[] }) => {
    const [currentPage, setCurrentPage] = useState(1);
    const ordersPerPage = 10;

    // Reset to page 1 when order list changes
    useEffect(() => {
      setCurrentPage(1);
    }, [orderList.length]);

    const totalPages = Math.ceil(orderList.length / ordersPerPage);
    const startIndex = (currentPage - 1) * ordersPerPage;
    const endIndex = startIndex + ordersPerPage;
    const paginatedOrders = orderList.slice(startIndex, endIndex);

    return (
      <>
        {orderList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center border rounded-lg bg-muted/20">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <Package className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-medium">No orders found</p>
            <p className="text-sm text-muted-foreground">Orders will appear here once created by your sales agents.</p>
          </div>
        ) : (
          <>
            {/* Mobile: card list */}
            <div className="md:hidden space-y-3">
              {paginatedOrders.map((order) => (
                <div key={order.id} className="rounded-lg border bg-background p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-muted-foreground">Order #</div>
                      <div className="font-mono font-semibold">{order.orderNumber}</div>
                    </div>
                    <Badge variant={getStatusVariant(order) as any}>
                      {getStatusLabel(order)}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground">Client</div>
                      <div className="truncate">{order.clientName}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Agent</div>
                      <div className="truncate">{order.agentName}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Date</div>
                      <div>{new Date(order.date).toLocaleDateString()}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Items</div>
                      <div>{order.items.length}</div>
                    </div>
                    <div className="col-span-2 flex justify-between border-t pt-2 font-medium">
                      <span>Amount</span>
                      <span>₱{order.total.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Button variant="ghost" size="sm" onClick={() => handleViewOrder(order)}>
                      <Eye className="h-4 w-4 mr-1" /> View
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order #</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Sales Agent</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-mono font-medium">{order.orderNumber}</TableCell>
                      <TableCell>{order.clientName}</TableCell>
                      <TableCell>{order.agentName}</TableCell>
                      <TableCell>{new Date(order.date).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">{order.items.length}</TableCell>
                      <TableCell className="text-right font-semibold">
                        ₱{order.total.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(order) as any}>{getStatusLabel(order)}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleViewOrder(order)}
                          title="View Order Details"
                          className="hover:bg-gray-100"
                        >
                          <Eye className="h-4 w-4 text-gray-600" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  Showing {startIndex + 1} to {Math.min(endIndex, orderList.length)} of {orderList.length} orders
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
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? "default" : "outline"}
                          size="sm"
                          onClick={() => setCurrentPage(pageNum)}
                          className="min-w-[40px]"
                        >
                          {pageNum}
                        </Button>
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
          </>
        )}
      </>
    );
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">Order Management</h1>
          <p className="text-muted-foreground">Review and approve purchase orders from sales agents</p>
        </div>
        {isAdmin && (
          <Button onClick={handleOpenBulkApprove} className="gap-2">
            <CheckSquare className="h-4 w-4" />
            Bulk Approve Orders
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <p className="text-sm font-medium">Pending Orders</p>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {pendingOrdersCount}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <p className="text-sm font-medium">Approved This Month</p>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{approvedThisMonthCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <p className="text-sm font-medium">Total Value</p>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ₱{visibleOrders.reduce((sum, o) => sum + o.total, 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Leader: Team Agents panel */}
      {isLeader && teamAgentsSummary.length > 0 && (
        <Card>
          <CardHeader>
            <div>
              <h2 className="text-xl font-semibold">My Team Agents</h2>
              <p className="text-sm text-muted-foreground">Agents under you with order counts</p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              {teamAgentsSummary.map(a => (
                <div key={a.agentId} className="p-3 border rounded-lg">
                  <div className="font-medium">{a.agentName}</div>
                  <div className="text-sm mt-1">Orders: <span className="font-semibold">{a.orders}</span></div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search orders by number, client, or agent..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="pending" className="w-full">
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto p-1 bg-muted">
              <TabsTrigger value="pending" className="data-[state=active]:bg-background">
                <div className="flex flex-col items-center gap-1 py-1">
                  <span className="font-semibold text-sm">
                    {isAdmin ? 'Pending (Admin Review)' : isLeader ? 'Pending (Leader Review)' : 'Pending'}
                  </span>
                  <span className="text-xs text-muted-foreground">({filterOrders('pending').length})</span>
                </div>
              </TabsTrigger>
              <TabsTrigger value="approved" className="data-[state=active]:bg-background">
                <div className="flex flex-col items-center gap-1 py-1">
                  <span className="font-semibold text-sm">
                    {isLeader ? 'Pending (Admin Review)' : 'Approved'}
                  </span>
                  <span className="text-xs text-muted-foreground">({filterOrders('approved').length})</span>
                </div>
              </TabsTrigger>
              <TabsTrigger value="rejected" className="data-[state=active]:bg-background">
                <div className="flex flex-col items-center gap-1 py-1">
                  <span className="font-semibold text-sm">Rejected</span>
                  <span className="text-xs text-muted-foreground">({filterOrders('rejected').length})</span>
                </div>
              </TabsTrigger>
              <TabsTrigger value="all" className="data-[state=active]:bg-background">
                <div className="flex flex-col items-center gap-1 py-1">
                  <span className="font-semibold text-sm">All Orders</span>
                  <span className="text-xs text-muted-foreground">({filterOrders().length})</span>
                </div>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="pending" className="mt-4">
              <OrderTable orderList={filterOrders('pending')} />
            </TabsContent>
            <TabsContent value="approved" className="mt-4">
              <OrderTable orderList={filterOrders('approved')} />
            </TabsContent>
            <TabsContent value="rejected" className="mt-4">
              <OrderTable orderList={filterOrders('rejected')} />
            </TabsContent>
            <TabsContent value="all" className="mt-4">
              <OrderTable orderList={filterOrders()} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* View Order Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
            <DialogDescription>Review details and take action on this order.</DialogDescription>
          </DialogHeader>
          {viewingOrder && (
            <div className="space-y-6 py-4">
              {/* Order Header */}
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div>
                  <Label className="text-muted-foreground">Order Number</Label>
                  <p className="text-2xl font-mono font-bold">{viewingOrder.orderNumber}</p>
                </div>
                <Badge
                  variant={getStatusVariant(viewingOrder) as any}
                  className="text-lg px-4 py-2"
                >
                  {getStatusLabel(viewingOrder)}
                </Badge>
              </div>

              {/* Client & Agent Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Client</Label>
                  <p className="font-semibold text-lg">{clientDetails?.name || viewingOrder.clientName}</p>
                  <div className="text-sm text-muted-foreground">
                    {loadingClient ? 'Loading client details…' : (
                      <>
                        <div>Email: {clientDetails?.email || '—'}</div>
                        <div>Phone: {clientDetails?.phone || '—'}</div>
                        <div>Company: {clientDetails?.company || '—'}</div>
                        <div>Address: {clientDetails?.address || '—'}</div>
                      </>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Sales Agent</Label>
                  <p className="font-semibold text-lg">{viewingOrder.agentName}</p>
                  <div className="grid grid-cols-2 gap-2 text-sm mt-2">
                    <div>
                      <Label className="text-muted-foreground">Order Date</Label>
                      <p className="font-medium">{new Date(viewingOrder.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Total Items</Label>
                      <p className="font-medium">{viewingOrder.items.length} item(s)</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Order Items */}
              <div className="space-y-3">
                <Label className="text-lg font-semibold">Order Items</Label>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {viewingOrder.items.map((item, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Package className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <p className="font-medium">{item.brandName}</p>
                                <p className="text-sm text-muted-foreground">{item.variantName}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{item.quantity}</TableCell>
                          <TableCell className="text-right">₱{item.unitPrice.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-semibold">
                            ₱{item.total.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Order Total */}
              <div className="space-y-3 p-4 bg-primary/5 rounded-lg border-2 border-primary/20">
                <div className="flex justify-between items-center text-xl">
                  <Label className="font-semibold">Order Total:</Label>
                  <p className="font-bold text-primary">₱{viewingOrder.total.toLocaleString()}</p>
                </div>
              </div>

              {/* Payment Information */}
              {viewingOrder.paymentMethod && (
                <div className="space-y-3 p-4 bg-muted rounded-lg border">
                  <Label className="text-lg font-semibold">Payment Information</Label>
                  <div className="space-y-2">
                    <div>
                      <Label className="text-muted-foreground">Payment Method</Label>
                      <p className="font-medium">
                        {viewingOrder.paymentMethod === 'GCASH' ? 'GCash' :
                          viewingOrder.paymentMethod === 'BANK_TRANSFER' ? 'Bank Transfer' :
                            'Cash'}
                      </p>
                    </div>
                    {viewingOrder.paymentProofUrl && (
                      <div>
                        <Label className="text-muted-foreground">Payment Proof</Label>
                        <div className="mt-2 border rounded-lg overflow-hidden bg-white">
                          <img
                            src={viewingOrder.paymentProofUrl}
                            alt="Payment Proof"
                            className="w-full h-auto max-h-96 object-contain"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2YzZjRmNiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM2YjcyODAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5JbWFnZSBub3QgZm91bmQ8L3RleHQ+PC9zdmc+';
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Role-based Actions using stage */}
              {isLeader && (viewingOrder.stage === 'agent_pending' || !viewingOrder.stage) && (
                <div className="flex gap-3 pt-4 border-t">
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => {
                      setViewDialogOpen(false);
                      handleOpenApprove(viewingOrder);
                    }}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Leader Approve
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1 bg-red-600 hover:bg-red-700"
                    onClick={() => {
                      setViewDialogOpen(false);
                      handleOpenReject(viewingOrder);
                    }}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Leader Reject
                  </Button>
                </div>
              )}
              {isAdmin && viewingOrder.stage === 'leader_approved' && (
                <div className="flex gap-3 pt-4 border-t">
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => {
                      setViewDialogOpen(false);
                      handleOpenApprove(viewingOrder);
                    }}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Admin Approve
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1 bg-red-600 hover:bg-red-700"
                    onClick={() => {
                      setViewDialogOpen(false);
                      handleOpenReject(viewingOrder);
                    }}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Admin Reject
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Approve Confirmation Dialog */}
      <AlertDialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to approve order <strong>{orderToApprove?.orderNumber}</strong> from{' '}
              <strong>{orderToApprove?.clientName}</strong>?
              <br /><br />
              Order total: <strong>₱{orderToApprove?.total.toLocaleString()}</strong>
              <br />
              <br />
              ⚠️ This action will:
              <br />
              • Deduct stock quantities from main inventory
              <br />
              • Create inventory transaction records
              <br />
              • Mark the order as approved
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmApprove}>
              Approve Order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Reason Dialog */}
      <AlertDialog open={reasonDialogOpen} onOpenChange={setReasonDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Order</AlertDialogTitle>
            <AlertDialogDescription>
              {rejectingForRole === 'admin' ? (
                <>Please provide a reason. The order will return to the leader for review.</>
              ) : (
                <>You can optionally provide a reason for rejection.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label>Rejection Reason</Label>
            <Textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder={rejectingForRole === 'admin' ? 'Required for admin rejection' : 'Optional'} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRejectWithReason} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Reject Order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Approve Dialog */}
      <Dialog open={bulkApproveDialogOpen} onOpenChange={setBulkApproveDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk Approve Orders by Agent</DialogTitle>
            <DialogDescription>
              Select an agent to view and approve all their pending orders at once
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Agent Selector */}
            <div className="space-y-2">
              <Label htmlFor="agent-select">Select Agent</Label>
              <Select value={selectedAgentForBulk} onValueChange={handleSelectAgentForBulk}>
                <SelectTrigger id="agent-select">
                  <SelectValue placeholder="Choose an agent..." />
                </SelectTrigger>
                <SelectContent>
                  {Array.from(new Set(orders
                    .filter(o => o.stage === 'leader_approved' || (o.stage === 'agent_pending' && isAdmin))
                    .map(o => o.agentId)))
                    .map(agentId => {
                      const order = orders.find(o => o.agentId === agentId);
                      return (
                        <SelectItem key={agentId} value={agentId}>
                          {order?.agentName || 'Unknown Agent'}
                        </SelectItem>
                      );
                    })}
                </SelectContent>
              </Select>
            </div>

            {/* Orders List */}
            {selectedAgentForBulk && agentOrders.length > 0 && (
              <>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order Number</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {agentOrders.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell className="font-mono font-medium">{order.orderNumber}</TableCell>
                          <TableCell>{order.clientName}</TableCell>
                          <TableCell>{new Date(order.date).toLocaleDateString()}</TableCell>
                          <TableCell className="text-right font-semibold">
                            ₱{order.total.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewOrderInBulk(order)}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Summary */}
                <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Orders</p>
                    <p className="text-2xl font-bold">{agentOrders.length}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Amount</p>
                    <p className="text-2xl font-bold">
                      ₱{agentOrders.reduce((sum, o) => sum + o.total, 0).toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Approve All Button */}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setBulkApproveDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleBulkApprove}
                    disabled={processingBulkApproval}
                    className="gap-2"
                  >
                    {processingBulkApproval ? (
                      <>Processing...</>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4" />
                        Approve All {agentOrders.length} Orders
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}

            {selectedAgentForBulk && agentOrders.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No pending orders found for this agent</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Order View Dialog */}
      <Dialog open={bulkViewDialogOpen} onOpenChange={setBulkViewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Order Details - {viewingOrderInBulk?.orderNumber}</DialogTitle>
          </DialogHeader>

          {viewingOrderInBulk && (
            <div className="space-y-6">
              {/* Order Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Client Name</Label>
                  <p className="text-sm font-medium">{viewingOrderInBulk.clientName}</p>
                </div>
                <div>
                  <Label>Agent Name</Label>
                  <p className="text-sm font-medium">{viewingOrderInBulk.agentName}</p>
                </div>
                <div>
                  <Label>Order Date</Label>
                  <p className="text-sm">{new Date(viewingOrderInBulk.date).toLocaleDateString()}</p>
                </div>
                <div>
                  <Label>Status</Label>
                  <Badge variant={viewingOrderInBulk.stage === 'admin_approved' ? 'default' : 'secondary'}>
                    {viewingOrderInBulk.stage}
                  </Badge>
                </div>
              </div>

              {/* Client Details */}
              {bulkClientDetails && (
                <div className="border rounded-lg p-4 space-y-2">
                  <h3 className="font-semibold">Client Information</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {bulkClientDetails.email && (
                      <div>
                        <span className="text-muted-foreground">Email:</span>{' '}
                        {bulkClientDetails.email}
                      </div>
                    )}
                    {bulkClientDetails.phone && (
                      <div>
                        <span className="text-muted-foreground">Phone:</span>{' '}
                        {bulkClientDetails.phone}
                      </div>
                    )}
                    {bulkClientDetails.company && (
                      <div>
                        <span className="text-muted-foreground">Company:</span>{' '}
                        {bulkClientDetails.company}
                      </div>
                    )}
                    {bulkClientDetails.city && (
                      <div>
                        <span className="text-muted-foreground">City:</span>{' '}
                        {bulkClientDetails.city}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Order Items */}
              <div>
                <h3 className="font-semibold mb-2">Order Items</h3>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {viewingOrderInBulk.items.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{item.brandName}</p>
                              <p className="text-sm text-muted-foreground">
                                {item.variantName} ({item.variantType})
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{item.quantity}</TableCell>
                          <TableCell className="text-right">₱{item.unitPrice.toFixed(2)}</TableCell>
                          <TableCell className="text-right font-semibold">
                            ₱{item.total.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Payment Details */}
              {viewingOrderInBulk.paymentMethod && (
                <div className="border rounded-lg p-4 space-y-3">
                  <h3 className="font-semibold">Payment Information</h3>
                  <div>
                    <Label>Payment Method</Label>
                    <p className="text-sm font-medium">{viewingOrderInBulk.paymentMethod}</p>
                  </div>
                  {viewingOrderInBulk.paymentProofUrl && (
                    <div>
                      <Label>Payment Proof</Label>
                      <img
                        src={viewingOrderInBulk.paymentProofUrl}
                        alt="Payment Proof"
                        className="mt-2 max-w-full h-auto rounded border"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Signature */}
              {viewingOrderInBulk.signatureUrl && (
                <div className="border rounded-lg p-4 space-y-3">
                  <h3 className="font-semibold">Client Signature</h3>
                  <img
                    src={viewingOrderInBulk.signatureUrl}
                    alt="Client Signature"
                    className="max-w-md h-auto border rounded bg-white p-2"
                  />
                </div>
              )}

              {/* Total Summary */}
              <div className="border-t pt-4">
                <div className="flex justify-between items-center text-lg font-semibold">
                  <span>Total Amount:</span>
                  <span>₱{viewingOrderInBulk.total.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

