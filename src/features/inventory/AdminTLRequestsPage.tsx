import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import {
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Eye,
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
  Edit3,
  Users,
  Package,
} from 'lucide-react';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import type { TLRequestWithDetails } from '@/types/tlStockRequests.types';

interface ReviewDialogData extends TLRequestWithDetails {
  source_available_quantity: number;
}

export default function AdminTLRequestsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [activeTab, setActiveTab] = useState('pending');
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ReviewDialogData | null>(null);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [modifyDialogOpen, setModifyDialogOpen] = useState(false);
  
  const [approvedQuantity, setApprovedQuantity] = useState<number>(0);
  const [modifiedQuantity, setModifiedQuantity] = useState<number>(0);
  const [adminNotes, setAdminNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  
  const [processing, setProcessing] = useState(false);
  
  // Fetch TL requests
  const { data: requests = [], isLoading: requestsLoading } = useQuery({
    queryKey: ['admin-tl-requests', user?.company_id],
    queryFn: async () => {
      if (!user?.company_id) return [];
      
      const { data, error } = await supabase
        .from('tl_stock_requests')
        .select(`
          *,
          requester:profiles!requester_leader_id(id, full_name, region, email),
          source:profiles!source_leader_id(id, full_name, region, email),
          variant:variants(
            id,
            name,
            variant_type,
            brand_id,
            brand:brands(name)
          )
        `)
        .eq('company_id', user.company_id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      return (data?.map((req: any) => ({
        ...req,
        variant: {
          id: req.variant.id,
          name: req.variant.name,
          type: req.variant.variant_type,
          brand_id: req.variant.brand_id,
          brand_name: req.variant.brand.name,
        },
      })) || []) as TLRequestWithDetails[];
    },
    enabled: !!user?.company_id && (user?.role === 'admin' || user?.role === 'super_admin'),
  });
  
  // Real-time subscription
  useEffect(() => {
    if (!user?.company_id) return;
    
    const channel = supabase
      .channel('admin_tl_stock_requests_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tl_stock_requests',
          filter: `company_id=eq.${user.company_id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['admin-tl-requests'] });
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.company_id, queryClient]);
  
  // Filter requests by tab
  const filteredRequests = useMemo(() => {
    switch (activeTab) {
      case 'pending':
        return requests.filter((r) => r.status === 'pending_admin');
      case 'approved':
        return requests.filter((r) => r.status === 'pending_source_tl' || r.status === 'pending_receipt' || r.status === 'completed');
      case 'rejected':
        return requests.filter((r) => r.status === 'admin_rejected' || r.status === 'source_tl_rejected');
      default:
        return requests;
    }
  }, [requests, activeTab]);
  
  // Stats
  const stats = useMemo(() => {
    return {
      total: requests.length,
      pending: requests.filter((r) => r.status === 'pending_admin').length,
      approved: requests.filter((r) => r.status === 'pending_source_tl' || r.status === 'pending_receipt' || r.status === 'completed').length,
      rejected: requests.filter((r) => r.status === 'admin_rejected' || r.status === 'source_tl_rejected').length,
    };
  }, [requests]);
  
  // Open review dialog
  const handleReview = async (request: TLRequestWithDetails) => {
    // Fetch source TL's available quantity
    const { data, error } = await supabase
      .from('agent_inventory')
      .select('stock')
      .eq('agent_id', request.source_leader_id)
      .eq('variant_id', request.variant_id)
      .maybeSingle();
    
    const availableQty = data?.stock || 0;
    
    setSelectedRequest({
      ...request,
      source_available_quantity: availableQty,
    });
    setApprovedQuantity(request.requested_quantity);
    setModifiedQuantity(Math.min(request.requested_quantity, availableQty));
    setAdminNotes('');
    setRejectionReason('');
    setReviewDialogOpen(true);
  };
  
  // Approve full request
  const handleApproveFull = async () => {
    if (!selectedRequest) return;
    
    setProcessing(true);
    try {
      const { data, error } = await supabase.rpc('admin_approve_tl_request', {
        p_request_id: selectedRequest.id,
        p_approved_quantity: selectedRequest.requested_quantity,
        p_notes: adminNotes || null,
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to approve request');
      
      toast({
        title: 'Request Approved',
        description: `Approved ${selectedRequest.requested_quantity} units`,
      });
      
      setApproveDialogOpen(false);
      setReviewDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['admin-tl-requests'] });
    } catch (error: any) {
      console.error('Error approving request:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to approve request',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };
  
  // Approve modified quantity
  const handleApproveModified = async () => {
    if (!selectedRequest || modifiedQuantity <= 0) return;
    
    if (modifiedQuantity > selectedRequest.source_available_quantity) {
      toast({
        title: 'Invalid Quantity',
        description: 'Approved quantity exceeds available stock',
        variant: 'destructive',
      });
      return;
    }
    
    setProcessing(true);
    try {
      const { data, error } = await supabase.rpc('admin_approve_tl_request', {
        p_request_id: selectedRequest.id,
        p_approved_quantity: modifiedQuantity,
        p_notes: adminNotes || null,
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to approve request');
      
      toast({
        title: 'Request Approved',
        description: `Approved ${modifiedQuantity} units (modified from ${selectedRequest.requested_quantity})`,
      });
      
      setModifyDialogOpen(false);
      setReviewDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['admin-tl-requests'] });
    } catch (error: any) {
      console.error('Error approving request:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to approve request',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };
  
  // Reject request
  const handleReject = async () => {
    if (!selectedRequest || !rejectionReason.trim()) {
      toast({
        title: 'Rejection Reason Required',
        description: 'Please provide a reason for rejection',
        variant: 'destructive',
      });
      return;
    }
    
    setProcessing(true);
    try {
      const { data, error } = await supabase.rpc('admin_reject_tl_request', {
        p_request_id: selectedRequest.id,
        p_reason: rejectionReason,
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to reject request');
      
      toast({
        title: 'Request Rejected',
        description: 'Request has been rejected and requester notified',
      });
      
      setRejectDialogOpen(false);
      setReviewDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['admin-tl-requests'] });
    } catch (error: any) {
      console.error('Error rejecting request:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to reject request',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };
  
  // Status badge helper
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending_admin':
        return (
          <Badge variant="secondary" className="bg-yellow-50 text-yellow-700 border-yellow-200">
            <Clock className="h-3 w-3 mr-1" />
            Pending Admin
          </Badge>
        );
      case 'pending_source_tl':
        return (
          <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">
            <Clock className="h-3 w-3 mr-1" />
            Awaiting Source TL
          </Badge>
        );
      case 'pending_receipt':
        return (
          <Badge variant="secondary" className="bg-purple-50 text-purple-700 border-purple-200">
            <AlertCircle className="h-3 w-3 mr-1" />
            Pending Receipt
          </Badge>
        );
      case 'completed':
        return (
          <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Completed
          </Badge>
        );
      case 'admin_rejected':
      case 'source_tl_rejected':
        return (
          <Badge variant="secondary" className="bg-red-50 text-red-700 border-red-200">
            <XCircle className="h-3 w-3 mr-1" />
            Rejected
          </Badge>
        );
      default:
        return <Badge>{status}</Badge>;
    }
  };
  
  if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>Only admins can access this page</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Team Leader Stock Requests</h1>
        <p className="text-muted-foreground">Review and approve stock requests between team leaders</p>
      </div>
      
      {/* Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Total Requests</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
            <p className="text-xs text-muted-foreground">Pending Review</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
            <p className="text-xs text-muted-foreground">Approved</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600">{stats.rejected}</div>
            <p className="text-xs text-muted-foreground">Rejected</p>
          </CardContent>
        </Card>
      </div>
      
      {/* Requests Table */}
      <Card>
        <CardHeader>
          <CardTitle>Stock Requests</CardTitle>
          <CardDescription>Review and manage TL stock requests</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="pending">
                Pending ({stats.pending})
              </TabsTrigger>
              <TabsTrigger value="approved">Approved</TabsTrigger>
              <TabsTrigger value="rejected">Rejected</TabsTrigger>
            </TabsList>
            
            <TabsContent value={activeTab}>
              {requestsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredRequests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No requests found</p>
                </div>
              ) : (
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Request #</TableHead>
                        <TableHead>Requester TL</TableHead>
                        <TableHead>Source TL</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Requested Qty</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRequests.map((request) => (
                        <TableRow key={request.id}>
                          <TableCell className="font-medium">{request.request_number}</TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{request.requester.full_name}</p>
                              {request.requester.region && (
                                <p className="text-sm text-muted-foreground">{request.requester.region}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{request.source.full_name}</p>
                              {request.source.region && (
                                <p className="text-sm text-muted-foreground">{request.source.region}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{request.variant.brand_name}</p>
                              <p className="text-sm text-muted-foreground">
                                {request.variant.name} {request.variant.type}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>{request.requested_quantity}</TableCell>
                          <TableCell>{getStatusBadge(request.status)}</TableCell>
                          <TableCell>{new Date(request.created_at).toLocaleDateString()}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleReview(request)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      
      {/* Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Review Stock Request</DialogTitle>
            <DialogDescription>Compare and approve stock request</DialogDescription>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-6">
              {/* Request Info */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-secondary rounded-lg">
                <div>
                  <Label className="text-muted-foreground">Request Number</Label>
                  <p className="font-medium">{selectedRequest.request_number}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <div className="mt-1">{getStatusBadge(selectedRequest.status)}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Product</Label>
                  <p className="font-medium">{selectedRequest.variant.brand_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedRequest.variant.name} {selectedRequest.variant.type}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Date</Label>
                  <p className="font-medium">{new Date(selectedRequest.created_at).toLocaleString()}</p>
                </div>
              </div>
              
              {/* Side-by-Side Comparison */}
              <div className="grid grid-cols-2 gap-4">
                {/* Requester TL */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Requester: {selectedRequest.requester.full_name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div>
                      <Label className="text-muted-foreground">Region</Label>
                      <p className="font-medium">{selectedRequest.requester.region || 'N/A'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Email</Label>
                      <p className="text-sm">{selectedRequest.requester.email}</p>
                    </div>
                    <div className="pt-4 border-t">
                      <Label className="text-muted-foreground">Requested Quantity</Label>
                      <p className="text-3xl font-bold text-blue-600">{selectedRequest.requested_quantity}</p>
                    </div>
                  </CardContent>
                </Card>
                
                {/* Source TL */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Package className="h-5 w-5" />
                      Source: {selectedRequest.source.full_name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div>
                      <Label className="text-muted-foreground">Region</Label>
                      <p className="font-medium">{selectedRequest.source.region || 'N/A'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Email</Label>
                      <p className="text-sm">{selectedRequest.source.email}</p>
                    </div>
                    <div className="pt-4 border-t">
                      <Label className="text-muted-foreground">Available Quantity</Label>
                      <p
                        className={`text-3xl font-bold ${
                          selectedRequest.source_available_quantity >= selectedRequest.requested_quantity
                            ? 'text-green-600'
                            : 'text-red-600'
                        }`}
                      >
                        {selectedRequest.source_available_quantity}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              {/* Validation Alert */}
              {selectedRequest.source_available_quantity < selectedRequest.requested_quantity && (
                <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-red-900">Insufficient Stock</p>
                    <p className="text-sm text-red-700">
                      Cannot approve full request: Source TL has only {selectedRequest.source_available_quantity}{' '}
                      units available, but {selectedRequest.requested_quantity} units were requested.
                    </p>
                  </div>
                </div>
              )}
              
              {/* Actions */}
              {selectedRequest.status === 'pending_admin' && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    disabled={selectedRequest.source_available_quantity < selectedRequest.requested_quantity}
                    onClick={() => setApproveDialogOpen(true)}
                  >
                    <ThumbsUp className="mr-2 h-4 w-4" />
                    Approve Full
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    disabled={selectedRequest.source_available_quantity === 0}
                    onClick={() => setModifyDialogOpen(true)}
                  >
                    <Edit3 className="mr-2 h-4 w-4" />
                    Approve Modified
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() => setRejectDialogOpen(true)}
                  >
                    <ThumbsDown className="mr-2 h-4 w-4" />
                    Reject
                  </Button>
                </div>
              )}
              
              {/* Additional Info */}
              {selectedRequest.admin_notes && (
                <div>
                  <Label className="text-muted-foreground">Admin Notes</Label>
                  <p className="text-sm mt-1">{selectedRequest.admin_notes}</p>
                </div>
              )}
              
              {selectedRequest.rejection_reason && (
                <div>
                  <Label className="text-muted-foreground text-destructive">Rejection Reason</Label>
                  <p className="text-sm mt-1 text-destructive">{selectedRequest.rejection_reason}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Approve Full Dialog */}
      <AlertDialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve Full Request</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedRequest && (
                <>
                  Approve {selectedRequest.requested_quantity} units for {selectedRequest.requester.full_name}?
                  The request will be forwarded to {selectedRequest.source.full_name} for final approval.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label>Notes (Optional)</Label>
            <Textarea
              placeholder="Add any notes for the source team leader..."
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleApproveFull} disabled={processing}>
              {processing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Approving...
                </>
              ) : (
                'Approve'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Approve Modified Dialog */}
      <AlertDialog open={modifyDialogOpen} onOpenChange={setModifyDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve Modified Quantity</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedRequest && (
                <>
                  Modify the approved quantity (max: {selectedRequest.source_available_quantity} available)
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Approved Quantity</Label>
              <Input
                type="number"
                min="1"
                max={selectedRequest?.source_available_quantity || 0}
                value={modifiedQuantity}
                onChange={(e) => setModifiedQuantity(parseInt(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">
                Original request: {selectedRequest?.requested_quantity} units
              </p>
            </div>
            <div className="space-y-2">
              <Label>Notes (Optional)</Label>
              <Textarea
                placeholder="Explain why the quantity was modified..."
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleApproveModified} disabled={processing}>
              {processing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Approving...
                </>
              ) : (
                'Approve'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Reject Dialog */}
      <AlertDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Request</AlertDialogTitle>
            <AlertDialogDescription>
              Provide a reason for rejecting this stock request. The requester will be notified.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label>Rejection Reason</Label>
            <Textarea
              placeholder="Enter reason for rejection..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={4}
              required
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReject}
              disabled={processing || !rejectionReason.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {processing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Rejecting...
                </>
              ) : (
                'Reject'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
