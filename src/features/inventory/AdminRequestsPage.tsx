import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { 
  Package, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  ArrowRight, 
  Loader2, 
  Search, 
  CalendarDays, 
  User, 
  History,
  Clock,
  Briefcase,
  Layers,
  Box,
  Hash
} from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import { subscribeToTable, unsubscribe } from '@/lib/realtime.helpers';
import { sendNotification } from '@/features/shared/lib/notification.helpers';

// --- Interfaces ---

interface StockRequestItem {
  id: string;
  request_number?: string;
  agent_id: string;
  leader_id: string;
  variant_id: string;
  requested_quantity: number;
  leader_additional_quantity: number;
  is_combined_request: boolean;
  requested_at: string;
  status: string;
  leader_notes: string | null;
  admin_notes: string | null;
  rejection_reason: string | null;
  // Timeline dates
  leader_approved_at?: string;
  admin_approved_at?: string;
  fulfilled_at?: string;
  rejected_at?: string;

  agent?: { id: string; full_name: string };
  leader?: { id: string; full_name: string };
  fulfilled_by_user?: { full_name: string };
  admin_approved_by_user?: { full_name: string };

  variant?: {
    id: string;
    name: string;
    variant_type: string;
    brand?: { name: string };
  };
  // Enriched Data
  admin_stock?: number;
  available_stock?: number;
}

interface GroupedRequest {
  group_id: string;
  request_number: string;
  requester_name: string;
  requester_id: string;
  requested_at: string;
  status: string;
  total_items: number;
  total_quantity: number;
  items: StockRequestItem[];
  notes: string | null;
  // Computed Availability
  is_fully_stocked: boolean;
  missing_stock_count: number;
  // Timeline info (taken from first item)
  timeline: {
    requested: string;
    leader_approved?: string;
    admin_action?: string;
    admin_name?: string;
  };
}

type ReviewAction = 'approve' | 'deny' | null;

export default function AdminRequestsPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [groupedPending, setGroupedPending] = useState<GroupedRequest[]>([]);
  const [groupedHistory, setGroupedHistory] = useState<GroupedRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Dialog State
  const [selectedGroup, setSelectedGroup] = useState<GroupedRequest | null>(null);
  const [isHistoryView, setIsHistoryView] = useState(false); // Distinguish betwen reviewing pending vs viewing history
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  
  // Review Action State
  const [reviewAction, setReviewAction] = useState<ReviewAction>(null);
  const [notes, setNotes] = useState('');
  const [denialReason, setDenialReason] = useState('');

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (user?.id) {
      fetchRequests();
    }

    const channels = [
      subscribeToTable('stock_requests', () => { if (user?.id) fetchRequests(); }),
      subscribeToTable('main_inventory', () => { if (user?.id) fetchRequests(); })
    ];

    return () => channels.forEach(unsubscribe);
  }, [user?.id]);

  const fetchRequests = async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      // 1. Fetch Pending (approved_by_leader)
      const { data: pendingData, error: pendingError } = await supabase
        .from('stock_requests')
        .select(`
          *,
          agent:profiles!stock_requests_agent_id_fkey(id, full_name),
          leader:profiles!stock_requests_leader_id_fkey(id, full_name),
          variant:variants(
            id, name, variant_type,
            brand:brands(name)
          )
        `)
        .eq('status', 'approved_by_leader')
        .order('requested_at', { ascending: false });

      if (pendingError) throw pendingError;

      // 2. Fetch History (approved_by_admin, fulfilled, rejected)
      const { data: historyData, error: historyError } = await supabase
        .from('stock_requests')
        .select(`
          *,
          agent:profiles!stock_requests_agent_id_fkey(id, full_name),
          leader:profiles!stock_requests_leader_id_fkey(id, full_name),
          admin_approved_by_user:profiles!stock_requests_admin_approved_by_fkey(full_name),
          fulfilled_by_user:profiles!stock_requests_fulfilled_by_fkey(full_name),
          variant:variants(
            id, name, variant_type,
            brand:brands(name)
          )
        `)
        .in('status', ['approved_by_admin', 'fulfilled', 'rejected'])
        .order('requested_at', { ascending: false })
        .limit(200);

      if (historyError) throw historyError;

      // Helper to process and group requests
      const processRequests = async (rows: any[]): Promise<GroupedRequest[]> => {
        // Fetch stock for Pending items
        const enrichedRows = await Promise.all(rows.map(async (row) => {
          let req = { ...row } as StockRequestItem;
          
          if (Array.isArray(req.agent)) req.agent = req.agent[0];
          if (Array.isArray(req.leader)) req.leader = req.leader[0];
          if (Array.isArray(req.admin_approved_by_user)) req.admin_approved_by_user = req.admin_approved_by_user[0];
          if (Array.isArray(req.fulfilled_by_user)) req.fulfilled_by_user = req.fulfilled_by_user[0];

          if (req.status === 'approved_by_leader') {
             const { data: inv } = await supabase
               .from('main_inventory')
               .select('stock, allocated_stock')
               .eq('variant_id', req.variant_id)
               .single();
             req.admin_stock = inv?.stock || 0;
             req.available_stock = (inv?.stock || 0) - (inv?.allocated_stock || 0);
          }
          return req;
        }));

        // Grouping
        const groups: Record<string, StockRequestItem[]> = {};
        enrichedRows.forEach(req => {
            const key = req.request_number || `${req.requested_at}-${req.leader_id}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(req);
        });

        // Map to GroupedRequest
        return Object.entries(groups).map(([key, items]) => {
            const first = items[0];
            const requesterName = first.leader?.full_name || first.agent?.full_name || 'Unknown';
            
            let missingCount = 0;
            items.forEach(i => {
                const required = i.requested_quantity + (i.leader_additional_quantity || 0);
                if ((i.available_stock || 0) < required && i.status === 'approved_by_leader') {
                    missingCount++;
                }
            });

            return {
                group_id: key,
                request_number: first.request_number || 'N/A',
                requester_name: requesterName,
                requester_id: first.leader_id,
                requested_at: first.requested_at,
                status: first.status,
                total_items: items.length,
                total_quantity: items.reduce((s, i) => s + i.requested_quantity + (i.leader_additional_quantity || 0), 0),
                items: items,
                notes: first.leader_notes,
                is_fully_stocked: missingCount === 0,
                missing_stock_count: missingCount,
                timeline: {
                  requested: first.requested_at,
                  leader_approved: first.leader_approved_at,
                  admin_action: first.admin_approved_at || first.rejected_at || first.fulfilled_at,
                  admin_name: first.admin_approved_by_user?.full_name || 'Admin',
                }
            };
        }).sort((a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime());
      };

      setGroupedPending(await processRequests(pendingData || []));
      setGroupedHistory(await processRequests(historyData || []));

    } catch (err: any) {
      console.error(err);
      toast({ title: 'Error', description: 'Failed to fetch requests', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDetail = (group: GroupedRequest, isHistory: boolean) => {
     setSelectedGroup(group);
     setIsHistoryView(isHistory);
     setNotes('');
     setDenialReason('');
     setReviewAction(null);
     setDetailDialogOpen(true);
  };

  const handleConfirmAction = async () => {
    if (!selectedGroup || !reviewAction || !user?.id) return;
    setProcessing(true);
    try {
        let successCount = 0;
        for (const item of selectedGroup.items) {
           if (reviewAction === 'approve') {
               const { error } = await supabase.rpc('admin_approve_stock_request', {
                   p_request_id: item.id,
                   p_admin_id: user.id,
                   p_notes: notes || null
               });
               if (error) throw error;
               successCount++;
           } else if (reviewAction === 'deny') {
               const { error } = await supabase.rpc('admin_reject_stock_request', {
                  p_request_id: item.id,
                  p_admin_id: user.id,
                  p_reason: denialReason
               });
               if (error) throw error;
               successCount++;
           }
        }
        toast({ title: 'Success', description: `Processed ${successCount} items.` });
        setDetailDialogOpen(false);
        fetchRequests();
    } catch (err: any) {
        toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
        setProcessing(false);
    }
  };

  const getFilteredGroups = (groups: GroupedRequest[]) => {
      if (!searchQuery) return groups;
      const lower = searchQuery.toLowerCase();
      return groups.filter(g => 
          g.requester_name.toLowerCase().includes(lower) || 
          g.request_number.toLowerCase().includes(lower)
      );
  };

  // UI Components
  const StatusBadge = ({ status }: { status: string }) => {
    switch (status) {
      case 'approved_by_leader': return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 px-2 py-0.5"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>;
      case 'approved_by_admin': return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 px-2 py-0.5"><CheckCircle2 className="w-3 h-3 mr-1" /> Approved</Badge>;
      case 'fulfilled': return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 px-2 py-0.5"><Package className="w-3 h-3 mr-1" /> Fulfilled</Badge>;
      case 'rejected': return <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 px-2 py-0.5"><XCircle className="w-3 h-3 mr-1" /> Rejected</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading && groupedPending.length === 0) {
      return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary/30" /></div>;
  }

  return (
    <div className="container mx-auto max-w-7xl p-6 md:p-8 space-y-8 animate-in fade-in duration-500">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b pb-6">
        <div className="space-y-1">
           <h1 className="text-3xl font-bold tracking-tight text-foreground">Stock Requests</h1>
           <p className="text-muted-foreground text-sm max-w-lg">
             Manage inventory allocation requests from your team leaders. 
             Review stock availability and approve bulk requests efficiently.
           </p>
        </div>
        <div className="relative w-full md:w-80">
           <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
           <Input 
              placeholder="Search by request #, name..." 
              className="pl-9 h-10 bg-background/50 border-muted-foreground/20 focus:border-primary/50 transition-all" 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
           />
        </div>
      </div>

      <Tabs defaultValue="pending" className="w-full space-y-6">
        <div className="flex items-center justify-between">
          <TabsList className="bg-muted/30 p-1 border h-auto">
            <TabsTrigger value="pending" className="px-6 py-2 gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <Clock className="w-4 h-4" /> Pending
              {groupedPending.length > 0 && (
                <span className="ml-1.5 bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-[10px] font-bold border border-amber-200">
                  {groupedPending.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="px-6 py-2 gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <History className="w-4 h-4" /> Request History
            </TabsTrigger>
          </TabsList>
        </div>

        {/* PENDING REQUESTS - CARD VIEW */}
        <TabsContent value="pending" className="mt-0">
            {getFilteredGroups(groupedPending).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed rounded-xl bg-muted/5">
                    <div className="bg-background p-4 rounded-full shadow-sm mb-4">
                      <CheckCircle2 className="h-8 w-8 text-green-500" />
                    </div>
                    <h3 className="text-lg font-semibold">All Caught Up!</h3>
                    <p className="text-muted-foreground text-sm max-w-xs text-center mt-2">
                        There are no pending stock requests requiring your attention right now.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {getFilteredGroups(groupedPending).map(group => (
                        <Card 
                          key={group.group_id} 
                          className="group relative overflow-hidden border-muted/60 hover:border-primary/20 hover:shadow-lg transition-all duration-300"
                        >
                            {/* Status Stripe */}
                            <div className={`absolute top-0 left-0 w-1 h-full ${
                              group.is_fully_stocked ? 'bg-emerald-500' : 'bg-amber-500' 
                            }`} />

                            <CardHeader className="pl-6 pb-4">
                                <div className="flex justify-between items-start mb-2">
                                  <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground bg-muted/50 px-2 py-1 rounded">
                                    <Hash className="w-3 h-3" />
                                    {group.request_number}
                                  </div>
                                  <StatusBadge status={group.status} />
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                                    {group.requester_name.charAt(0)}
                                  </div>
                                  <div>
                                    <CardTitle className="text-base font-bold text-foreground leading-tight">
                                      {group.requester_name}
                                    </CardTitle>
                                    <CardDescription className="text-xs mt-0.5 flex items-center gap-1">
                                      <CalendarDays className="w-3 h-3" />
                                      {format(new Date(group.requested_at), 'MMM dd, h:mm a')}
                                    </CardDescription>
                                  </div>
                                </div>
                            </CardHeader>
                            
                            <CardContent className="pl-6 py-2 space-y-4">
                                {/* Stats Grid */}
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="bg-muted/30 p-3 rounded-lg border border-muted/50">
                                    <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                                      <Layers className="w-3 h-3" /> Products
                                    </p>
                                    <p className="text-lg font-bold text-foreground">{group.total_items}</p>
                                  </div>
                                  <div className="bg-muted/30 p-3 rounded-lg border border-muted/50">
                                    <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                                      <Box className="w-3 h-3" /> Units
                                    </p>
                                    <p className="text-lg font-bold text-foreground">{group.total_quantity}</p>
                                  </div>
                                </div>

                                {/* Stock Status */}
                                <div className={`p-3 rounded-lg border text-sm flex items-start gap-3 ${
                                  group.is_fully_stocked 
                                    ? 'bg-emerald-50/50 border-emerald-100 text-emerald-800' 
                                    : 'bg-amber-50/50 border-amber-100 text-amber-800'
                                }`}>
                                   {group.is_fully_stocked ? (
                                     <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
                                   ) : (
                                     <AlertCircle className="w-5 h-5 shrink-0 text-amber-600" />
                                   )}
                                   <div>
                                     <p className="font-semibold">
                                       {group.is_fully_stocked ? 'Stock Available' : 'Stock Shortage'}
                                     </p>
                                     <p className="text-xs opacity-90 mt-0.5">
                                       {group.is_fully_stocked 
                                         ? 'All items can be fulfilled immediately.' 
                                         : `${group.missing_stock_count} item(s) have insufficient stock.`}
                                     </p>
                                   </div>
                                </div>

                                {group.notes && (
                                    <div className="text-xs text-muted-foreground italic pl-3 border-l-2 border-muted">
                                        "{group.notes}"
                                    </div>
                                )}
                            </CardContent>

                            <CardFooter className="pl-6 pt-4 pb-6 bg-muted/5 border-t">
                                <Button className="w-full group-hover:translate-x-1 transition-transform" onClick={() => handleOpenDetail(group, false)}>
                                   Review Request <ArrowRight className="w-4 h-4 ml-2" />
                                </Button>
                            </CardFooter>
                        </Card>
                    ))}
                </div>
            )}
        </TabsContent>

        {/* HISTORY - LIST VIEW (Kept Clean) */}
        <TabsContent value="history" className="mt-0">
            <Card className="border-muted/60 shadow-sm">
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-muted/20">
                            <TableRow>
                                <TableHead className="pl-6">Request Details</TableHead>
                                <TableHead>Timeline</TableHead>
                                <TableHead>Quantities</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right pr-6">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {getFilteredGroups(groupedHistory).length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                                      No history records found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                getFilteredGroups(groupedHistory).map(group => (
                                    <TableRow key={group.group_id} className="hover:bg-muted/5">
                                        <TableCell className="pl-6">
                                            <div className="flex items-center gap-3">
                                              <div className="h-8 w-8 rounded bg-muted/50 flex items-center justify-center text-xs font-bold text-muted-foreground">
                                                {group.requester_name.charAt(0)}
                                              </div>
                                              <div>
                                                <div className="font-medium text-sm">{group.requester_name}</div>
                                                <div className="text-xs text-muted-foreground font-mono">{group.request_number}</div>
                                              </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col text-xs">
                                              <span className="text-muted-foreground">Requested</span>
                                              <span className="font-medium">{format(new Date(group.requested_at), 'MMM dd, yyyy')}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            <div className="flex items-center gap-2">
                                              <Badge variant="secondary" className="font-normal">{group.total_items} Items</Badge>
                                              <span className="text-muted-foreground text-xs">{group.total_quantity} Units</span>
                                            </div>
                                        </TableCell>
                                        <TableCell><StatusBadge status={group.status} /></TableCell>
                                        <TableCell className="text-right pr-6">
                                            <Button variant="ghost" size="sm" onClick={() => handleOpenDetail(group, true)} className="hover:bg-muted">
                                                View Details
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </TabsContent>
      </Tabs>

      {/* DETAIL DIALOG - Reused with enhanced styling */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto flex flex-col gap-0 p-0">
            <DialogHeader className="p-6 border-b bg-muted/10">
                <div className="flex items-center justify-between">
                    <div className="space-y-1">
                        <DialogTitle className="text-xl flex items-center gap-2">
                           Request Details 
                           <span className="text-muted-foreground font-normal text-base text-xs font-mono px-2 py-0.5 bg-muted rounded">
                             {selectedGroup?.request_number}
                           </span>
                        </DialogTitle>
                        <DialogDescription className="flex items-center gap-2">
                            Requested by <span className="font-semibold text-foreground underline decoration-dotted">{selectedGroup?.requester_name}</span>
                        </DialogDescription>
                    </div>
                    {selectedGroup && <StatusBadge status={selectedGroup.status} />}
                </div>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
                {selectedGroup && (
                    <>
                        {/* 1. Timeline Section */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                                <History className="h-4 w-4 text-primary" /> Request Timeline
                            </h3>
                            <div className="relative pl-4 border-l-2 border-muted space-y-8 ml-1">
                                {/* Requested */}
                                <div className="relative">
                                    <div className="absolute -left-[21px] top-1 h-3 w-3 rounded-full bg-blue-500 border-2 border-background ring-2 ring-blue-100" />
                                    <div className="text-sm font-medium">Request Submitted</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">
                                        <span className="font-mono">{format(new Date(selectedGroup.timeline.requested), 'PPP p')}</span>
                                        <span className="mx-1">•</span> 
                                        by {selectedGroup.requester_name}
                                    </div>
                                </div>
                                {/* Admin Action */}
                                {selectedGroup.timeline.admin_action && (
                                    <div className="relative">
                                        <div className={`absolute -left-[21px] top-1 h-3 w-3 rounded-full border-2 border-background ring-2 ${
                                            selectedGroup.status === 'rejected' ? 'bg-red-500 ring-red-100' : 'bg-green-500 ring-green-100'
                                        }`} />
                                        <div className="text-sm font-medium">
                                            {selectedGroup.status === 'rejected' ? 'Rejected' : 'Approved'} by Admin
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-0.5">
                                            <span className="font-mono">{format(new Date(selectedGroup.timeline.admin_action), 'PPP p')}</span>
                                            {selectedGroup.timeline.admin_name && (
                                              <>
                                                <span className="mx-1">•</span>
                                                by {selectedGroup.timeline.admin_name}
                                              </>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 2. Items Table */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                                <Package className="h-4 w-4 text-primary" /> Requested Items
                            </h3>
                            <div className="border rounded-lg overflow-hidden shadow-sm">
                                <Table>
                                    <TableHeader className="bg-muted/30">
                                        <TableRow>
                                            <TableHead>Product Information</TableHead>
                                            <TableHead className="text-right">Requested</TableHead>
                                            {!isHistoryView && <TableHead className="text-right">Stock Level</TableHead>}
                                            <TableHead className="text-right">Allocation</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {selectedGroup.items.map(item => {
                                            const totalReq = item.requested_quantity + (item.leader_additional_quantity || 0);
                                            const available = item.available_stock || 0;
                                            const isStocked = available >= totalReq;

                                            return (
                                                <TableRow key={item.id} className="hover:bg-muted/5 transition-colors">
                                                    <TableCell>
                                                        <div className="font-medium text-foreground">{item.variant?.brand?.name}</div>
                                                        <div className="text-xs text-muted-foreground">{item.variant?.name}</div>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                      <span className="font-medium">{item.requested_quantity}</span>
                                                    </TableCell>
                                                    
                                                    {!isHistoryView && (
                                                        <TableCell className="text-right">
                                                            <div className="flex justify-end">
                                                              <Badge variant="outline" className={`${isStocked ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                                                {isStocked ? 'In Stock' : 'Low Stock'} ({available})
                                                              </Badge>
                                                            </div>
                                                        </TableCell>
                                                    )}

                                                    <TableCell className="text-right font-semibold">
                                                        {totalReq}
                                                        {item.leader_additional_quantity > 0 && (
                                                            <div className="text-[10px] text-blue-600 font-normal">
                                                                (+{item.leader_additional_quantity} for leader)
                                                            </div>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>

                        {/* 3. Action Section */}
                        {!isHistoryView && (
                            <div className="bg-muted/10 p-5 rounded-lg border border-dashed border-muted-foreground/30 space-y-4">
                                {!reviewAction ? (
                                    <div className="flex gap-4">
                                        <Button 
                                            variant="outline" 
                                            className="flex-1 h-12 border-red-200 hover:bg-red-50 hover:text-red-700 hover:border-red-300 transition-all font-medium"
                                            onClick={() => setReviewAction('deny')}
                                        >
                                            Reject Request
                                        </Button>
                                        <Button 
                                            className="flex-1 h-12 bg-green-600 hover:bg-green-700 hover:shadow-md transition-all font-medium"
                                            onClick={() => setReviewAction('approve')}
                                            disabled={!selectedGroup.is_fully_stocked}
                                        >
                                            Approve & Allocate
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
                                        <div className="flex items-center justify-between">
                                            <h4 className="font-semibold text-sm">
                                                {reviewAction === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
                                            </h4>
                                            <Button variant="ghost" size="sm" onClick={() => setReviewAction(null)} className="h-8">Cancel</Button>
                                        </div>
                                        
                                        {reviewAction === 'approve' ? (
                                            <div className="space-y-2">
                                              <p className="text-xs text-muted-foreground">Add optional notes for the requester:</p>
                                              <Textarea 
                                                  placeholder="E.g. Approved, will be shipped tomorrow." 
                                                  value={notes} 
                                                  onChange={e => setNotes(e.target.value)} 
                                                  className="bg-background"
                                              />
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                              <p className="text-xs text-red-600 font-medium">Please provide a reason for rejection:</p>
                                              <Textarea 
                                                  placeholder="Reason for rejection (required)..." 
                                                  value={denialReason} 
                                                  onChange={e => setDenialReason(e.target.value)} 
                                                  className="border-red-200 bg-red-50/10 focus:border-red-300"
                                              />
                                            </div>
                                        )}
                                        
                                        <div className="flex justify-end pt-2">
                                            <Button 
                                                className="w-full sm:w-auto min-w-[120px]"
                                                disabled={processing || (reviewAction === 'deny' && !denialReason)}
                                                onClick={handleConfirmAction}
                                                variant={reviewAction === 'deny' ? 'destructive' : 'default'}
                                            >
                                                {processing && <Loader2 className="h-3 w-3 animate-spin mr-2" />}
                                                Confirm {reviewAction === 'approve' ? 'Approval' : 'Rejection'}
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
