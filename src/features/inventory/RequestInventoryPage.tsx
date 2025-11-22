import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Package, Send, Clock, CheckCircle2, XCircle, ArrowUp, X, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import { subscribeToTable, unsubscribe } from '@/lib/realtime.helpers';

interface Brand {
  id: string;
  name: string;
}

interface Variant {
  id: string;
  brand_id: string;
  name: string;
  variant_type: string;
  brand?: Brand;
}

interface Request {
  id: string;
  variant_id: string;
  requested_quantity: number;
  status: string;
  requested_at: string;
  requester_notes: string | null;
  approver_notes: string | null;
  denial_reason: string | null;
  variants?: Variant;
}

interface GroupedRequest {
  id: string;
  requested_at: string;
  status: string;
  productCount: number;
  totalQuantity: number;
  requests: Request[];
  requester_notes: string | null;
}

export default function RequestInventoryPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [brands, setBrands] = useState<Brand[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [groupedRequests, setGroupedRequests] = useState<GroupedRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [selectedBrand, setSelectedBrand] = useState('');
  const [productQuantities, setProductQuantities] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [selectedGroupedRequest, setSelectedGroupedRequest] = useState<GroupedRequest | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'forwarded' | 'approved' | 'denied'>('all');

  // Confirmation dialogs
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showCancelBatchConfirm, setShowCancelBatchConfirm] = useState(false);
  const [pendingCancelId, setPendingCancelId] = useState<string | null>(null);
  const [pendingCancelBatch, setPendingCancelBatch] = useState<GroupedRequest | null>(null);

  // Fetch brands and variants on mount
  useEffect(() => {
    fetchBrandsAndVariants();
    if (user?.id) {
      fetchMyRequests();
    }

    // Real-time subscriptions for inventory requests
    const channel = subscribeToTable('inventory_requests', (payload) => {
      console.log('🔄 Real-time: Inventory request updated', payload);
      if (user?.id) {
        fetchMyRequests();
      }
    });

    return () => unsubscribe(channel);
  }, [user?.id]);

  const fetchBrandsAndVariants = async () => {
    try {
      // Fetch all brands
      const { data: brandsData, error: brandsError } = await supabase
        .from('brands')
        .select('*')
        .order('name');

      if (brandsError) throw brandsError;

      // Fetch all variants (agent can request ANY product)
      const { data: variantsData, error: variantsError } = await supabase
        .from('variants')
        .select(`
          *,
          brand:brands(id, name)
        `)
        .order('name');

      if (variantsError) throw variantsError;

      setBrands(brandsData || []);
      setVariants(variantsData || []);
    } catch (error: any) {
      console.error('Error fetching brands/variants:', error);
      toast({
        title: 'Error',
        description: 'Failed to load products',
        variant: 'destructive'
      });
    }
  };

  const fetchMyRequests = async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('inventory_requests')
        .select(`
          *,
          variants(
            id,
            name,
            variant_type,
            brand:brands(name)
          )
        `)
        .eq('requester_id', user.id)
        .eq('request_level', 'agent_to_leader')
        .order('requested_at', { ascending: false });

      if (error) throw error;

      setRequests(data || []);

      // Group requests by timestamp (rounded to nearest 5 seconds) and notes
      const grouped = groupRequestsByBatch(data || []);
      setGroupedRequests(grouped);
    } catch (error: any) {
      console.error('Error fetching requests:', error);
      toast({
        title: 'Error',
        description: 'Failed to load your requests',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const groupRequestsByBatch = (requests: Request[]): GroupedRequest[] => {
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
      };
    }).sort((a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime());
  };

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
      let successCount = 0;
      let errorCount = 0;

      // Submit each request
      for (const request of requestsToSubmit) {
        const { data, error } = await supabase.rpc('request_inventory_from_leader', {
          p_agent_id: user.id,
          p_variant_id: request.variantId,
          p_quantity: request.quantity,
          p_notes: notes || null
        });

        if (error || !data.success) {
          errorCount++;
        } else {
          successCount++;
        }
      }

      if (successCount > 0) {
        toast({
          title: 'Success',
          description: `${successCount} product request(s) submitted successfully${errorCount > 0 ? `, ${errorCount} failed` : ''}`
        });

        // Reset form
        setSelectedBrand('');
        setProductQuantities({});
        setNotes('');

        // Refresh requests
        fetchMyRequests();
      } else {
        toast({
          title: 'Error',
          description: 'Failed to submit requests',
          variant: 'destructive'
        });
      }
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
      const { data, error } = await supabase.rpc('cancel_request', {
        p_request_id: pendingCancelId,
        p_agent_id: user.id
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: 'Success',
          description: data.message
        });
        fetchMyRequests();
      } else {
        toast({
          title: 'Error',
          description: data.message,
          variant: 'destructive'
        });
      }
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
        const { data, error } = await supabase.rpc('cancel_request', {
          p_request_id: request.id,
          p_agent_id: user.id
        });

        if (error || !data.success) {
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
        fetchMyRequests();
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
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'forwarded':
        return <Badge variant="secondary" className="bg-blue-100 text-blue-800"><ArrowUp className="h-3 w-3 mr-1" />With Admin</Badge>;
      case 'approved':
        return <Badge variant="secondary" className="bg-green-100 text-green-800"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'denied':
        return <Badge variant="secondary" className="bg-red-100 text-red-800"><XCircle className="h-3 w-3 mr-1" />Denied</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const filterByStatus = (status?: string) => {
    if (!status) return groupedRequests;
    return groupedRequests.filter(g => g.status === status);
  };

  const formatProductName = (request: Request) => {
    if (request.variants?.brand) {
      return `${request.variants.brand.name} - ${request.variants.name}`;
    }
    return request.variants?.name || 'Unknown Product';
  };

  const getBrandName = (groupedRequest: GroupedRequest): string => {
    const firstRequest = groupedRequest.requests[0];
    return firstRequest.variants?.brand?.name || 'Unknown Brand';
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Request Inventory</h1>
        <p className="text-muted-foreground mt-1">
          Request products from your team leader
        </p>
      </div>

      {/* Request Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            New Request
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Brand Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Select Brand</label>
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
              <label className="text-sm font-medium">Select Products & Enter Quantities</label>
              <div className="border rounded-lg divide-y max-h-96 overflow-y-auto">
                {filteredVariants.map(variant => (
                  <div key={variant.id} className="flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{variant.name}</p>
                      <p className="text-xs text-muted-foreground">{variant.variant_type}</p>
                    </div>
                    <div className="flex-shrink-0 w-24">
                      <Input
                        type="number"
                        placeholder="Qty"
                        value={productQuantities[variant.id] || ''}
                        onChange={(e) => handleQuantityChange(variant.id, e.target.value)}
                        min="0"
                        className="text-center"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Enter quantities for the products you want to request
              </p>
            </div>
          )}

          {selectedBrand && filteredVariants.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No products available for this brand</p>
            </div>
          )}

          {/* Notes */}
          {selectedBrand && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Additional Notes (Optional)</label>
                <Textarea
                  placeholder="e.g., I have 3 urgent client orders..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>

              {/* Submit Button */}
              <Button
                onClick={handleSubmitRequest}
                disabled={submitting || Object.values(productQuantities).every(q => !q || parseInt(q) <= 0)}
                className="w-full"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting Requests...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Submit Request
                  </>
                )}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* My Requests */}
      <Card>
        <CardHeader>
          <CardTitle>My Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Mobile Dropdown */}
          <div className="md:hidden mb-4">
            <Select value={activeTab} onValueChange={(value: any) => setActiveTab(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ({groupedRequests.length})</SelectItem>
                <SelectItem value="pending">Pending ({filterByStatus('pending').length})</SelectItem>
                <SelectItem value="forwarded">With Admin ({filterByStatus('forwarded').length})</SelectItem>
                <SelectItem value="approved">Approved ({filterByStatus('approved').length})</SelectItem>
                <SelectItem value="denied">Denied ({filterByStatus('denied').length})</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Desktop Tabs */}
          <Tabs value={activeTab} onValueChange={(value: any) => setActiveTab(value)} className="hidden md:block">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="all">All ({groupedRequests.length})</TabsTrigger>
              <TabsTrigger value="pending">Pending ({filterByStatus('pending').length})</TabsTrigger>
              <TabsTrigger value="forwarded">With Admin ({filterByStatus('forwarded').length})</TabsTrigger>
              <TabsTrigger value="approved">Approved ({filterByStatus('approved').length})</TabsTrigger>
              <TabsTrigger value="denied">Denied ({filterByStatus('denied').length})</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-3 mt-4">
            {filterByStatus(activeTab === 'all' ? undefined : activeTab).map(groupedRequest => (
              <Card key={groupedRequest.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="space-y-3">
                    {/* Brand & Status */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{getBrandName(groupedRequest)}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(groupedRequest.requested_at), 'MMM dd, yyyy hh:mm a')}
                        </p>
                      </div>
                      <div className="flex-shrink-0">
                        {getStatusBadge(groupedRequest.status)}
                      </div>
                    </div>

                    {/* Products & Quantity */}
                    <div className="grid grid-cols-2 gap-2 py-2 border-t">
                      <div>
                        <span className="text-xs text-muted-foreground">Products</span>
                        <p className="font-medium text-sm">{groupedRequest.productCount} items</p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">Total Qty</span>
                        <p className="font-medium text-sm">{groupedRequest.totalQuantity} units</p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedGroupedRequest(groupedRequest);
                          setDetailsOpen(true);
                        }}
                        className="flex-1"
                      >
                        View Details
                      </Button>
                      {groupedRequest.status === 'pending' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCancelBatch(groupedRequest)}
                          className="flex-shrink-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {filterByStatus(activeTab === 'all' ? undefined : activeTab).length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No {activeTab === 'all' ? '' : activeTab} requests</p>
              </div>
            )}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block">
            <div className="border rounded-lg overflow-x-auto mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Brand</TableHead>
                    <TableHead className="text-center">Products</TableHead>
                    <TableHead className="text-center">Total Quantity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filterByStatus(activeTab === 'all' ? undefined : activeTab).map(groupedRequest => (
                    <TableRow key={groupedRequest.id}>
                      <TableCell className="font-medium">{getBrandName(groupedRequest)}</TableCell>
                      <TableCell className="text-center">{groupedRequest.productCount} items</TableCell>
                      <TableCell className="text-center">{groupedRequest.totalQuantity} units</TableCell>
                      <TableCell>{getStatusBadge(groupedRequest.status)}</TableCell>
                      <TableCell>{format(new Date(groupedRequest.requested_at), 'MMM dd, yyyy hh:mm a')}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedGroupedRequest(groupedRequest);
                              setDetailsOpen(true);
                            }}
                          >
                            View Details
                          </Button>
                          {groupedRequest.status === 'pending' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCancelBatch(groupedRequest)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filterByStatus(activeTab === 'all' ? undefined : activeTab).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>No {activeTab === 'all' ? '' : activeTab} requests</p>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Request Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Request Details</DialogTitle>
          </DialogHeader>

          {selectedGroupedRequest && (
            <div className="space-y-4">
              {/* Status & Date */}
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <div className="mt-1">{getStatusBadge(selectedGroupedRequest.status)}</div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Requested</p>
                  <p className="font-medium">{format(new Date(selectedGroupedRequest.requested_at), 'MMM dd, yyyy hh:mm a')}</p>
                </div>
              </div>

              {/* Summary */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Brand</p>
                  <p className="font-semibold">{getBrandName(selectedGroupedRequest)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Products</p>
                  <p className="font-semibold">{selectedGroupedRequest.productCount} items</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Quantity</p>
                  <p className="font-semibold">{selectedGroupedRequest.totalQuantity} units</p>
                </div>
              </div>

              {/* Products List */}
              <div>
                <p className="text-sm font-medium mb-2">Products Requested</p>
                <div className="border rounded-lg divide-y">
                  {selectedGroupedRequest.requests.map((request, index) => (
                    <div key={request.id} className="p-3 flex items-center justify-between hover:bg-muted/50">
                      <div className="flex-1">
                        <p className="font-medium text-sm">{request.variants?.name}</p>
                        <p className="text-xs text-muted-foreground">{request.variants?.variant_type}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-sm font-medium">{request.requested_quantity} units</p>
                        </div>
                        <div className="w-24 flex items-center justify-center">
                          {getStatusBadge(request.status)}
                        </div>
                        {request.status === 'pending' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCancelRequest(request.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 w-8 p-0"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Your Notes */}
              {selectedGroupedRequest.requester_notes && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Your Notes</p>
                  <div className="border rounded-lg p-3 bg-muted/30">
                    <p className="text-sm">{selectedGroupedRequest.requester_notes}</p>
                  </div>
                </div>
              )}

              {/* Leader's Response (if any) */}
              {selectedGroupedRequest.requests.some(r => r.approver_notes) && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Leader's Responses</p>
                  <div className="space-y-2">
                    {selectedGroupedRequest.requests
                      .filter(r => r.approver_notes)
                      .map(request => (
                        <div key={request.id} className="border rounded-lg p-3 bg-blue-50">
                          <p className="font-medium text-xs text-blue-900 mb-1">
                            {request.variants?.name}
                          </p>
                          <p className="text-sm">{request.approver_notes}</p>
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}

              {/* Denial Reasons (if any) */}
              {selectedGroupedRequest.requests.some(r => r.denial_reason) && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Denial Reasons</p>
                  <div className="space-y-2">
                    {selectedGroupedRequest.requests
                      .filter(r => r.denial_reason)
                      .map(request => (
                        <div key={request.id} className="border rounded-lg p-3 bg-red-50 border-red-200">
                          <p className="font-medium text-xs text-red-900 mb-1">
                            {request.variants?.name}
                          </p>
                          <p className="text-sm text-red-800">{request.denial_reason}</p>
                        </div>
                      ))
                    }
                  </div>
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
              Yes, Submit Request
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
              Yes, Cancel All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

