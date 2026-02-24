import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  History,
  Clock,
  ChevronLeft,
  ChevronRight,
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

  // Pagination
  const PAGE_SIZE = 10;
  const [pendingPage, setPendingPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);

  // History status filter: all | approved_by_admin | fulfilled | rejected
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>('all');

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

  const filteredPending = getFilteredGroups(groupedPending);
  const filteredHistory = getFilteredGroups(groupedHistory);

  // History filtered by status (after search) — hooks must run before any early return
  const historyFilteredByStatus = useMemo(() => {
    if (historyStatusFilter === 'all') return filteredHistory;
    return filteredHistory.filter((g) => g.status === historyStatusFilter);
  }, [filteredHistory, historyStatusFilter]);

  const totalPendingPages = Math.max(1, Math.ceil(filteredPending.length / PAGE_SIZE));
  const totalHistoryPages = Math.max(1, Math.ceil(historyFilteredByStatus.length / PAGE_SIZE));
  const paginatedPending = useMemo(
    () => filteredPending.slice((pendingPage - 1) * PAGE_SIZE, pendingPage * PAGE_SIZE),
    [filteredPending, pendingPage]
  );
  const paginatedHistory = useMemo(
    () => historyFilteredByStatus.slice((historyPage - 1) * PAGE_SIZE, historyPage * PAGE_SIZE),
    [historyFilteredByStatus, historyPage]
  );

  useEffect(() => {
    setPendingPage(1);
  }, [searchQuery]);
  useEffect(() => {
    setHistoryPage(1);
  }, [searchQuery, historyStatusFilter]);

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

  const PaginationBar = ({
    currentPage,
    totalPages,
    totalItems,
    onPrev,
    onNext,
    pageSize,
  }: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    onPrev: () => void;
    onNext: () => void;
    pageSize: number;
  }) => {
    const start = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const end = Math.min(currentPage * pageSize, totalItems);
    return (
      <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20 text-sm text-muted-foreground">
        <span>
          Showing {start}–{end} of {totalItems}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onPrev}
            disabled={currentPage <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <span className="min-w-[100px] text-center">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={onNext}
            disabled={currentPage >= totalPages}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Stock Requests</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage inventory allocation requests from your team leaders. Review stock availability and approve requests.
        </p>
      </div>

      <Tabs defaultValue="pending" className="w-full space-y-4">
        {/* Search + Tab triggers */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by request # or requester name..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <TabsList className="bg-muted/30 p-1 border h-auto w-full sm:w-auto">
            <TabsTrigger value="pending" className="px-4 py-2 gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm flex-1 sm:flex-none">
              <Clock className="w-4 h-4" /> Pending
              {groupedPending.length > 0 && (
                <span className="ml-1.5 bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-[10px] font-bold border border-amber-200">
                  {groupedPending.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="px-4 py-2 gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm flex-1 sm:flex-none">
              <History className="w-4 h-4" /> History
            </TabsTrigger>
          </TabsList>
        </div>
        {/* PENDING - TABLE VIEW */}
        <TabsContent value="pending" className="mt-0">
          <Card className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="pl-6">Request</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Items / Stocks</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right pr-6">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedPending.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-40 text-center text-muted-foreground">
                      <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-green-500 opacity-70" />
                      <p className="font-medium">All caught up</p>
                      <p className="text-sm">No pending stock requests right now.</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedPending.map((group) => (
                    <TableRow key={group.group_id} className="hover:bg-muted/5">
                      <TableCell className="pl-6">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                            {group.requester_name.charAt(0)}
                          </div>
                          <div>
                            <div className="font-medium">{group.requester_name}</div>
                            <div className="text-xs text-muted-foreground font-mono">{group.request_number}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {format(new Date(group.requested_at), 'MMM dd, yyyy HH:mm')}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{group.total_items}</span> items · <span className="font-medium">{group.total_quantity}</span> units
                      </TableCell>
                      <TableCell>
                        {group.is_fully_stocked ? (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">In stock</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                            {group.missing_stock_count} short
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell><StatusBadge status={group.status} /></TableCell>
                      <TableCell className="text-right pr-6">
                        <Button size="sm" onClick={() => handleOpenDetail(group, false)}>
                          Review <ArrowRight className="w-3 h-3 ml-1" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <PaginationBar
              currentPage={pendingPage}
              totalPages={totalPendingPages}
              totalItems={filteredPending.length}
              onPrev={() => setPendingPage((p) => Math.max(1, p - 1))}
              onNext={() => setPendingPage((p) => Math.min(totalPendingPages, p + 1))}
              pageSize={PAGE_SIZE}
            />
          </Card>
        </TabsContent>

        {/* HISTORY - TABLE VIEW */}
        <TabsContent value="history" className="mt-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <span className="text-sm text-muted-foreground">Filter by status:</span>
            <Select value={historyStatusFilter} onValueChange={setHistoryStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="approved_by_admin">Approved</SelectItem>
                <SelectItem value="fulfilled">Fulfilled</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Card className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="pl-6">Request</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Items / Units</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right pr-6">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedHistory.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                      No history records found.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedHistory.map((group) => (
                    <TableRow key={group.group_id} className="hover:bg-muted/5">
                      <TableCell className="pl-6">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-muted-foreground">
                            {group.requester_name.charAt(0)}
                          </div>
                          <div>
                            <div className="font-medium">{group.requester_name}</div>
                            <div className="text-xs text-muted-foreground font-mono">{group.request_number}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {format(new Date(group.requested_at), 'MMM dd, yyyy')}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{group.total_items}</span> items · <span className="font-medium">{group.total_quantity}</span> Stocks
                      </TableCell>
                      <TableCell><StatusBadge status={group.status} /></TableCell>
                      <TableCell className="text-right pr-6">
                        <Button variant="ghost" size="sm" onClick={() => handleOpenDetail(group, true)}>
                          View Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <PaginationBar
              currentPage={historyPage}
              totalPages={totalHistoryPages}
              totalItems={historyFilteredByStatus.length}
              onPrev={() => setHistoryPage((p) => Math.max(1, p - 1))}
              onNext={() => setHistoryPage((p) => Math.min(totalHistoryPages, p + 1))}
              pageSize={PAGE_SIZE}
            />
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
