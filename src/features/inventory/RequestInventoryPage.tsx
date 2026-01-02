import { useState, useEffect, useMemo } from 'react';
import { sendNotification } from '@/features/shared/lib/notification.helpers';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import {
  Package,
  Send,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowUp,
  X,
  Loader2,
  Plus,
  Search,
  Calendar,
  FileText,
  ChevronRight
} from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import { useMyRequests, useInventoryBaseData, Request, GroupedRequest } from './requestHooks';
import { useQueryClient } from '@tanstack/react-query';



export default function RequestInventoryPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: inventoryData, isLoading: inventoryLoading } = useInventoryBaseData();
  const { data: requests = [], isLoading: requestsLoading } = useMyRequests();

  const brands = inventoryData?.brands || [];
  const variants = inventoryData?.variants || [];
  const loading = inventoryLoading || requestsLoading;

  const [submitting, setSubmitting] = useState(false);

  const [selectedBrand, setSelectedBrand] = useState('');
  const [productQuantities, setProductQuantities] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [selectedGroupedRequest, setSelectedGroupedRequest] = useState<GroupedRequest | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'forwarded' | 'approved' | 'denied'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);

  // Confirmation dialogs
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showCancelBatchConfirm, setShowCancelBatchConfirm] = useState(false);
  const [pendingCancelId, setPendingCancelId] = useState<string | null>(null);
  const [pendingCancelBatch, setPendingCancelBatch] = useState<GroupedRequest | null>(null);



  const groupedRequests = useMemo(() => {
    const groups: { [key: string]: Request[] } = {};

    requests.forEach(request => {
      // Round timestamp to nearest 5 seconds to group simultaneous requests
      const timestamp = new Date(request.requested_at);
      const roundedTime = new Date(Math.floor(timestamp.getTime() / 5000) * 5000).toISOString();
      const key = `${roundedTime}-${request.requester_notes || 'no-notes'}`;

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(request);
    });

    // Convert groups to array
    return Object.entries(groups).map(([key, requests]) => {
      const firstRequest = requests[0];
      const allSameStatus = requests.every(r => r.status === firstRequest.status);

      return {
        id: key,
        requested_at: firstRequest.requested_at,
        status: allSameStatus ? firstRequest.status : 'mixed',
        productCount: requests.length,
        totalQuantity: requests.reduce((sum, r) => sum + r.requested_quantity, 0),
        requests: requests,
        requester_notes: firstRequest.requester_notes
      } as GroupedRequest;
    }).sort((a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime());
  }, [requests]);

  const filteredVariants = selectedBrand
    ? variants.filter(v => v.brand_id === selectedBrand)
    : [];

  const handleBrandChange = (brandId: string) => {
    setSelectedBrand(brandId);
    setProductQuantities({});
  };

  const handleQuantityChange = (variantId: string, quantity: string) => {
    setProductQuantities(prev => ({
      ...prev,
      [variantId]: quantity
    }));
  };

  const handleSubmitRequest = () => {
    if (!user?.id || !selectedBrand) return;

    // Get all products with quantities > 0
    const requestsToSubmit = Object.entries(productQuantities)
      .filter(([_, qty]) => qty && parseInt(qty) > 0)
      .map(([variantId, qty]) => ({ variantId, quantity: parseInt(qty) }));

    if (requestsToSubmit.length === 0) {
      toast({
        title: 'No products selected',
        description: 'Please enter quantities for at least one product',
        variant: 'destructive'
      });
      return;
    }

    // Show confirmation dialog
    setShowSubmitConfirm(true);
  };

  const confirmSubmitRequest = async () => {
    if (!user?.id || !selectedBrand) return;

    // Get all products with quantities > 0
    const requestsToSubmit = Object.entries(productQuantities)
      .filter(([_, qty]) => qty && parseInt(qty) > 0)
      .map(([variantId, qty]) => ({ variantId, quantity: parseInt(qty) }));

    if (requestsToSubmit.length === 0) return;

    setSubmitting(true);
    setShowSubmitConfirm(false);

    try {
      // Find this agent's leader
      const { data: leaderRow, error: leaderError } = await supabase
        .from('leader_teams')
        .select('leader_id')
        .eq('agent_id', user.id)
        .maybeSingle();

      if (leaderError) throw leaderError;
      if (!leaderRow?.leader_id) {
        toast({
          title: 'No leader assigned',
          description: 'You must be assigned to a team leader before you can request inventory.',
          variant: 'destructive',
        });
        return;
      }

      // Build stock_requests rows
      const rows = requestsToSubmit.map((request) => ({
        company_id: (user as any).company_id,
        request_number: `SR-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, // client-side unique-ish
        agent_id: user.id,
        leader_id: leaderRow.leader_id,
        variant_id: request.variantId,
        requested_quantity: request.quantity,
        status: 'pending',
        leader_notes: notes || null,
      }));

      const { error: insertError } = await supabase
        .from('stock_requests')
        .insert(rows);

      if (insertError) throw insertError;

      toast({
        title: 'Success',
        description: `${rows.length} product request(s) submitted successfully`,
      });

      // Notify Leader
      if (user?.company_id && leaderRow?.leader_id) {
        const totalQty = requestsToSubmit.reduce((sum, r) => sum + r.quantity, 0);
        await sendNotification({
          userId: leaderRow.leader_id,
          companyId: (user as any).company_id,
          type: 'stock_request_created',
          title: 'New Stock Request',
          message: `${user.full_name} has requested ${totalQty} units across ${requestsToSubmit.length} products.`,
          referenceType: 'stock_request',
          referenceId: rows[0].request_number // Using first request number as reference
        });
      }

      // Reset form
      setSelectedBrand('');
      setProductQuantities({});
      setNotes('');
      setFormOpen(false);

      // Invalidate requests to trigger refresh
      queryClient.invalidateQueries({ queryKey: ['my_requests', user?.id] });
    } catch (error: any) {
      console.error('Error submitting request:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to submit request',
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelRequest = (requestId: string) => {
    setPendingCancelId(requestId);
    setShowCancelConfirm(true);
  };

  const confirmCancelRequest = async () => {
    if (!user?.id || !pendingCancelId) return;

    try {
      const { error } = await supabase
        .from('stock_requests')
        .update({
          status: 'rejected',
          rejection_reason: 'Cancelled by agent',
          rejected_at: new Date().toISOString(),
          rejected_by: user.id,
        } as any)
        .eq('id', pendingCancelId)
        .eq('agent_id', user.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Request cancelled successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['my_requests', user?.id] });
    } catch (error: any) {
      console.error('Error cancelling request:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to cancel request',
        variant: 'destructive'
      });
    } finally {
      setShowCancelConfirm(false);
      setPendingCancelId(null);
    }
  };

  const handleCancelBatch = (groupedRequest: GroupedRequest) => {
    const pendingRequests = groupedRequest.requests.filter(r => r.status === 'pending');

    if (pendingRequests.length === 0) {
      toast({
        title: 'No pending requests',
        description: 'There are no pending requests to cancel in this batch',
        variant: 'destructive'
      });
      return;
    }

    setPendingCancelBatch(groupedRequest);
    setShowCancelBatchConfirm(true);
  };

  const confirmCancelBatch = async () => {
    if (!user?.id || !pendingCancelBatch) return;

    const pendingRequests = pendingCancelBatch.requests.filter(r => r.status === 'pending');

    try {
      let successCount = 0;
      let errorCount = 0;

      for (const request of pendingRequests) {
        const { error } = await supabase
          .from('stock_requests')
          .update({
            status: 'rejected',
            rejection_reason: 'Cancelled by agent',
            rejected_at: new Date().toISOString(),
            rejected_by: user.id,
          } as any)
          .eq('id', request.id)
          .eq('agent_id', user.id);

        if (error) {
          errorCount++;
        } else {
          successCount++;
        }
      }

      if (successCount > 0) {
        toast({
          title: 'Success',
          description: `${successCount} request(s) cancelled${errorCount > 0 ? `, ${errorCount} failed` : ''}`
        });
        queryClient.invalidateQueries({ queryKey: ['my_requests', user?.id] });
        setDetailsOpen(false);
      } else {
        toast({
          title: 'Error',
          description: 'Failed to cancel requests',
          variant: 'destructive'
        });
      }
    } catch (error: any) {
      console.error('Error cancelling batch:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to cancel requests',
        variant: 'destructive'
      });
    } finally {
      setShowCancelBatchConfirm(false);
      setPendingCancelBatch(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary" className="bg-amber-50 text-amber-700 border-amber-200"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'approved_by_leader':
        return (
          <Badge
            variant="secondary"
            className="bg-blue-50 text-blue-700 border-blue-200"
          >
            <ArrowUp className="h-3 w-3 mr-1" />
            Approved by Leader
          </Badge>
        );
      case 'approved_by_admin':
        return (
          <Badge
            variant="secondary"
            className="bg-emerald-50 text-emerald-700 border-emerald-200"
          >
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Approved by Admin
          </Badge>
        );
      case 'fulfilled':
        return (
          <Badge
            variant="secondary"
            className="bg-green-50 text-green-700 border-green-200"
          >
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Fulfilled
          </Badge>
        );
      case 'rejected':
        return <Badge variant="secondary" className="bg-red-50 text-red-700 border-red-200"><XCircle className="h-3 w-3 mr-1" />Denied</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  // Accent color helpers for request cards
  const getStatusAccentClasses = (status: string) => {
    switch (status) {
      case 'pending':
        return 'border-l-4 border-l-amber-400';
      case 'approved_by_leader':
        return 'border-l-4 border-l-blue-400';
      case 'approved_by_admin':
      case 'fulfilled':
        return 'border-l-4 border-l-green-500';
      case 'rejected':
        return 'border-l-4 border-l-red-500';
      default:
        return 'border-l border-l-border';
    }
  };

  const filterByStatus = (status?: string) => {
    if (!status) return groupedRequests;

    return groupedRequests.filter(g => {
      switch (status) {
        case 'pending':
          return g.status === 'pending';
        case 'forwarded':
          return g.status === 'approved_by_leader';
        case 'approved':
          return g.status === 'approved_by_admin' || g.status === 'fulfilled';
        case 'denied':
          return g.status === 'rejected';
        default:
          return true;
      }
    });
  };

  const formatProductName = (request: Request) => {
    if (request.variant?.brand) {
      return `${request.variant.brand.name} - ${request.variant.name}`;
    }
    return request.variant?.name || 'Unknown Product';
  };

  const getBrandName = (groupedRequest: GroupedRequest): string => {
    const firstRequest = groupedRequest.requests[0];
    return firstRequest.variant?.brand?.name || 'Unknown Brand';
  };

  // Filter requests by search query
  const filteredRequests = useMemo(() => {
    let filtered = filterByStatus(activeTab === 'all' ? undefined : activeTab);

    if (searchQuery) {
      filtered = filtered.filter(group => {
        const brandName = getBrandName(group).toLowerCase();
        const searchLower = searchQuery.toLowerCase();
        return brandName.includes(searchLower) ||
          group.requests.some(r => formatProductName(r).toLowerCase().includes(searchLower));
      });
    }

    return filtered;
  }, [groupedRequests, activeTab, searchQuery]);

  // Calculate stats
  const stats = useMemo(() => {
    return {
      total: groupedRequests.length,
      pending: filterByStatus('pending').length,
      forwarded: filterByStatus('forwarded').length,
      approved: filterByStatus('approved').length,
      denied: filterByStatus('denied').length,
    };
  }, [groupedRequests]);

  if (loading && requests.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-muted-foreground">Loading requests...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inventory Requests</h1>
          <p className="text-muted-foreground mt-1">
            Create new stock requests and track their status with your leader and admin.
          </p>
        </div>
        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogTrigger asChild>
            <Button size="lg" className="shadow-sm gap-2">
              <Plus className="h-4 w-4" />
              New Inventory Request
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Request</DialogTitle>
              <DialogDescription>
                Select products and quantities to request from your team leader
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
              {/* Brand Selection */}
              <div className="space-y-2">
                <label className="text-sm font-semibold">Select Brand</label>
                <Select value={selectedBrand} onValueChange={handleBrandChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a brand..." />
                  </SelectTrigger>
                  <SelectContent>
                    {brands.map(brand => (
                      <SelectItem key={brand.id} value={brand.id}>
                        {brand.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Products List with Quantities */}
              {selectedBrand && filteredVariants.length > 0 && (
                <div className="space-y-3">
                  <label className="text-sm font-semibold">Select Products & Enter Quantities</label>
                  <div className="border rounded-lg divide-y max-h-80 overflow-y-auto">
                    {filteredVariants.map(variant => (
                      <div key={variant.id} className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{variant.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{variant.variant_type}</p>
                        </div>
                        <div className="flex-shrink-0 w-28">
                          <Input
                            type="number"
                            placeholder="0"
                            value={productQuantities[variant.id] || ''}
                            onChange={(e) => handleQuantityChange(variant.id, e.target.value)}
                            min="0"
                            className="text-center"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedBrand && filteredVariants.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No products available for this brand</p>
                </div>
              )}

              {/* Notes */}
              {selectedBrand && (
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Additional Notes (Optional)</label>
                  <Textarea
                    placeholder="e.g., I have 3 urgent client orders..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="resize-none"
                  />
                </div>
              )}

              {/* Submit Button */}
              {selectedBrand && (
                <Button
                  onClick={handleSubmitRequest}
                  disabled={submitting || Object.values(productQuantities).every(q => !q || parseInt(q) <= 0)}
                  className="w-full"
                  size="lg"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Submit Request
                    </>
                  )}
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow bg-gradient-to-br from-slate-50 to-white">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                <Package className="h-4 w-4 text-slate-600" />
              </div>
              <div>
                <p className="text-xl font-semibold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-50 border border-amber-100">
                <Clock className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-xl font-semibold">{stats.pending}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50 border border-blue-100">
                <ArrowUp className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-xl font-semibold">{stats.forwarded}</p>
                <p className="text-xs text-muted-foreground">With Admin</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-50 border border-green-100">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-xl font-semibold">{stats.approved}</p>
                <p className="text-xs text-muted-foreground">Approved</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-50 border border-red-100">
                <XCircle className="h-4 w-4 text-red-600" />
              </div>
              <div>
                <p className="text-xl font-semibold">{stats.denied}</p>
                <p className="text-xs text-muted-foreground">Denied</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Requests List */}
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle>My Requests</CardTitle>
              <CardDescription className="mt-1">
                View and manage your inventory requests
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:flex-initial sm:w-64">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search requests..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(value: any) => setActiveTab(value)} className="w-full">
            <TabsList className="grid w-full grid-cols-5 bg-muted/50 rounded-lg">
              <TabsTrigger value="all" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
                All
                {stats.total > 0 && (
                  <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                    {stats.total}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="pending" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
                Pending
                {stats.pending > 0 && (
                  <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs bg-amber-100 text-amber-700">
                    {stats.pending}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="forwarded" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
                With Admin
                {stats.forwarded > 0 && (
                  <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs bg-blue-100 text-blue-700">
                    {stats.forwarded}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="approved" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
                Approved
                {stats.approved > 0 && (
                  <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs bg-green-100 text-green-700">
                    {stats.approved}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="denied" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
                Denied
                {stats.denied > 0 && (
                  <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs bg-red-100 text-red-700">
                    {stats.denied}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="mt-6 space-y-3">
              {filteredRequests.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-16">
                    <div className="text-center max-w-sm mx-auto">
                      <Package className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                      <h3 className="text-lg font-semibold mb-2">
                        {activeTab === 'all' ? 'No Requests Yet' : `No ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Requests`}
                      </h3>
                      <p className="text-sm text-muted-foreground mb-6">
                        {activeTab === 'all'
                          ? 'Create your first inventory request to get started'
                          : `You don't have any ${activeTab} requests at the moment`
                        }
                      </p>
                      {activeTab === 'all' && (
                        <Button onClick={() => setFormOpen(true)}>
                          <Plus className="h-4 w-4 mr-2" />
                          Create First Request
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                filteredRequests.map(groupedRequest => (
                  <Card
                    key={groupedRequest.id}
                    className={`hover:shadow-md transition-all duration-200 border-border/50 cursor-pointer ${getStatusAccentClasses(
                      groupedRequest.status
                    )}`}
                    onClick={() => {
                      setSelectedGroupedRequest(groupedRequest);
                      setDetailsOpen(true);
                    }}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4 flex-1 min-w-0">
                          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center flex-shrink-0 shadow-sm">
                            <Package className="h-5 w-5 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-3 mb-1">
                              <h3 className="font-semibold text-base truncate">
                                {getBrandName(groupedRequest)}
                              </h3>
                              <span className="hidden sm:inline-flex">{getStatusBadge(groupedRequest.status)}</span>
                            </div>
                            <div className="flex items-center flex-wrap gap-3 text-xs sm:text-sm text-muted-foreground mb-1.5">
                              <div className="flex items-center gap-1.5">
                                <Package className="h-3.5 w-3.5" />
                                <span>
                                  {groupedRequest.productCount}{' '}
                                  {groupedRequest.productCount === 1 ? 'product' : 'products'}
                                </span>
                              </div>
                              <span className="hidden sm:inline">•</span>
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium">{groupedRequest.totalQuantity} units</span>
                              </div>
                              <span className="hidden sm:inline">•</span>
                              <div className="flex items-center gap-1.5">
                                <Calendar className="h-3.5 w-3.5" />
                                <span>{format(new Date(groupedRequest.requested_at), 'MMM dd, yyyy')}</span>
                              </div>
                            </div>
                            <div className="sm:hidden mb-1">{getStatusBadge(groupedRequest.status)}</div>
                            {groupedRequest.requester_notes && (
                              <div className="flex items-start gap-2 mt-2 p-2 bg-muted/50 rounded text-xs sm:text-sm">
                                <FileText className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                                <p className="text-muted-foreground line-clamp-2">
                                  {groupedRequest.requester_notes}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2 flex-shrink-0">
                          {groupedRequest.status === 'pending' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCancelBatch(groupedRequest);
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Request Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Request Details</DialogTitle>
            <DialogDescription>
              View complete information about this inventory request
            </DialogDescription>
          </DialogHeader>

          {selectedGroupedRequest && (
            <div className="space-y-6 py-4">
              {/* Status & Date Header */}
              <div className="flex items-center justify-between p-4 bg-gradient-to-r from-muted/30 to-muted/10 rounded-lg border">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                    <Package className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold">{getBrandName(selectedGroupedRequest)}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {getStatusBadge(selectedGroupedRequest.status)}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Requested</p>
                  <p className="font-medium text-sm">
                    {format(new Date(selectedGroupedRequest.requested_at), 'MMM dd, yyyy hh:mm a')}
                  </p>
                </div>
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-4">
                <Card className="border-border/50">
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-semibold text-blue-600">{selectedGroupedRequest.productCount}</p>
                    <p className="text-xs text-muted-foreground mt-1">Products</p>
                  </CardContent>
                </Card>
                <Card className="border-border/50">
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-semibold text-green-600">{selectedGroupedRequest.totalQuantity}</p>
                    <p className="text-xs text-muted-foreground mt-1">Total Stocks</p>
                  </CardContent>
                </Card>
                <Card className="border-border/50">
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-semibold text-purple-600">
                      {selectedGroupedRequest.requests.filter(r => r.status === 'approved').length}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Approved</p>
                  </CardContent>
                </Card>
              </div>

              {/* Products List */}
              <div>
                <h4 className="text-sm font-semibold mb-3">Products Requested</h4>
                <div className="space-y-2">
                  {selectedGroupedRequest.requests.map((request) => (
                    <Card key={request.id} className="border-border/50">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{formatProductName(request)}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{request.variant?.variant_type}</p>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="text-sm font-semibold">{request.requested_quantity} Stocks</p>
                            </div>
                            <div className="w-28 flex justify-end">
                              {getStatusBadge(request.status)}
                            </div>
                            {request.status === 'pending' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => handleCancelRequest(request.id)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                        {request.approver_notes && (
                          <div className="mt-3 pt-3 border-t">
                            <p className="text-xs font-medium text-blue-900 mb-1">Leader's Response</p>
                            <p className="text-sm text-blue-800">{request.approver_notes}</p>
                          </div>
                        )}
                        {request.denial_reason && (
                          <div className="mt-3 pt-3 border-t">
                            <p className="text-xs font-medium text-red-900 mb-1">Denial Reason</p>
                            <p className="text-sm text-red-800">{request.denial_reason}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {/* Your Notes */}
              {selectedGroupedRequest.requester_notes && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Your Notes
                  </h4>
                  <Card className="border-border/50 bg-muted/30">
                    <CardContent className="p-4">
                      <p className="text-sm">{selectedGroupedRequest.requester_notes}</p>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            {selectedGroupedRequest && selectedGroupedRequest.requests.some(r => r.status === 'pending') && (
              <Button
                variant="destructive"
                onClick={() => handleCancelBatch(selectedGroupedRequest)}
                className="sm:mr-auto"
              >
                <X className="h-4 w-4 mr-2" />
                Cancel All Pending
              </Button>
            )}
            <Button variant="outline" onClick={() => setDetailsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Submit Request Confirmation */}
      <AlertDialog open={showSubmitConfirm} onOpenChange={setShowSubmitConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit Request?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to submit this request? Your team leader will be notified and will review your request.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSubmitRequest}>
              <Send className="h-4 w-4 mr-2" />
              Submit Request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Single Request Confirmation */}
      <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Request?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this request? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, Keep Request</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancelRequest} className="bg-red-600 hover:bg-red-700">
              <X className="h-4 w-4 mr-2" />
              Yes, Cancel Request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Batch Confirmation */}
      <AlertDialog open={showCancelBatchConfirm} onOpenChange={setShowCancelBatchConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel All Pending Requests?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel all pending requests in this batch?
              {pendingCancelBatch && ` This will cancel ${pendingCancelBatch.requests.filter(r => r.status === 'pending').length} pending request(s).`}
              {' '}This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, Keep Requests</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancelBatch} className="bg-red-600 hover:bg-red-700">
              <X className="h-4 w-4 mr-2" />
              Yes, Cancel All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
