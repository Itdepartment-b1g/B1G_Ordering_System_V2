import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { SignatureCanvas } from '@/components/ui/signature-canvas';
import {
  Clock,
  Loader2,
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
  Package,
  CheckCircle2,
  User,
} from 'lucide-react';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import type { TLRequestWithDetails } from '@/types/tlStockRequests.types';

export default function IncomingTLRequestsSection() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<TLRequestWithDetails | null>(null);
  const [sourceNotes, setSourceNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [sourceAvailableQty, setSourceAvailableQty] = useState<number>(0);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string>('');
  
  // Fetch incoming requests
  const { data: incomingRequests = [], isLoading: requestsLoading } = useQuery({
    queryKey: ['incoming-tl-requests', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error} = await supabase
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
        .eq('source_leader_id', user.id)
        .eq('status', 'pending_source_tl')
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
    enabled: !!user?.id && user?.role === 'team_leader',
  });
  
  // Real-time subscription
  useEffect(() => {
    if (!user?.id) return;
    
    const channel = supabase
      .channel('incoming_tl_requests_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tl_stock_requests',
          filter: `source_leader_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['incoming-tl-requests'] });
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);
  
  // Open approve dialog
  const handleOpenApprove = async (request: TLRequestWithDetails) => {
    // Fetch current available quantity
    const { data, error } = await supabase
      .from('agent_inventory')
      .select('stock')
      .eq('agent_id', user?.id)
      .eq('variant_id', request.variant_id)
      .maybeSingle();
    
    const availableQty = data?.stock || 0;
    setSourceAvailableQty(availableQty);
    setSelectedRequest(request);
    setSourceNotes('');
    setSignatureDataUrl('');
    setApproveDialogOpen(true);
  };
  
  // Open reject dialog
  const handleOpenReject = (request: TLRequestWithDetails) => {
    setSelectedRequest(request);
    setRejectionReason('');
    setRejectDialogOpen(true);
  };
  
  // Approve request
  const handleApprove = async () => {
    if (!selectedRequest || !signatureDataUrl) {
      toast({
        title: 'Signature Required',
        description: 'Please provide your signature',
        variant: 'destructive',
      });
      return;
    }
    
    // Check if we still have sufficient stock
    if (sourceAvailableQty < (selectedRequest.admin_approved_quantity || 0)) {
      toast({
        title: 'Insufficient Stock',
        description: `You only have ${sourceAvailableQty} units available, but ${selectedRequest.admin_approved_quantity} were approved`,
        variant: 'destructive',
      });
      return;
    }
    
    setProcessing(true);
    try {
      // Convert base64 to blob
      const base64Data = signatureDataUrl.split(',')[1];
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/png' });
      
      // Upload signature
      const timestamp = Date.now();
      const fileName = `${user?.company_id}/${selectedRequest.request_number}/${timestamp}_source_approval.png`;
      
      const { error: uploadError } = await supabase.storage
        .from('tl-stock-request-signatures')
        .upload(fileName, blob, {
          contentType: 'image/png',
          upsert: false,
        });
      
      if (uploadError) throw uploadError;
      
      // Get signed URL
      const { data: urlData, error: urlError } = await supabase.storage
        .from('tl-stock-request-signatures')
        .createSignedUrl(fileName, 31536000); // 1 year
      
      if (urlError || !urlData?.signedUrl) throw new Error('Failed to generate signed URL');
      
      // Call RPC function
      const { data: result, error: rpcError } = await supabase.rpc('source_tl_approve_request', {
        p_request_id: selectedRequest.id,
        p_signature_url: urlData.signedUrl,
        p_signature_path: fileName,
        p_notes: sourceNotes || null,
      });
      
      if (rpcError) throw rpcError;
      if (!result.success) throw new Error(result.error || 'Failed to approve request');
      
      toast({
        title: 'Request Approved',
        description: 'Request approved and sent to requester for receipt',
      });
      
      setApproveDialogOpen(false);
      setSelectedRequest(null);
      queryClient.invalidateQueries({ queryKey: ['incoming-tl-requests'] });
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
      const { data: result, error } = await supabase.rpc('source_tl_reject_request', {
        p_request_id: selectedRequest.id,
        p_reason: rejectionReason,
      });
      
      if (error) throw error;
      if (!result.success) throw new Error(result.error || 'Failed to reject request');
      
      toast({
        title: 'Request Rejected',
        description: 'Request rejected and notifications sent',
      });
      
      setRejectDialogOpen(false);
      setSelectedRequest(null);
      queryClient.invalidateQueries({ queryKey: ['incoming-tl-requests'] });
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
  
  if (user?.role !== 'team_leader') {
    return null;
  }
  
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Incoming Stock Requests
          </CardTitle>
          <CardDescription>
            Review and approve stock requests from other team leaders
          </CardDescription>
        </CardHeader>
        <CardContent>
          {requestsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : incomingRequests.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No pending requests</p>
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Request #</TableHead>
                    <TableHead>Requester</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Admin Approved Qty</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incomingRequests.map((request) => (
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
                          <p className="font-medium">{request.variant.brand_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {request.variant.name} {request.variant.type}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-lg font-semibold">
                          {request.admin_approved_quantity}
                        </Badge>
                      </TableCell>
                      <TableCell>{new Date(request.created_at).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleOpenApprove(request)}>
                            <ThumbsUp className="h-4 w-4 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleOpenReject(request)}
                          >
                            <ThumbsDown className="h-4 w-4 mr-1" />
                            Reject
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Approve Dialog */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Approve Stock Request</DialogTitle>
            <DialogDescription>Review and sign to approve this request</DialogDescription>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 p-4 bg-secondary rounded-lg">
                <div>
                  <Label className="text-muted-foreground">Request Number</Label>
                  <p className="font-medium">{selectedRequest.request_number}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Requester</Label>
                  <p className="font-medium">{selectedRequest.requester.full_name}</p>
                  {selectedRequest.requester.region && (
                    <p className="text-sm text-muted-foreground">{selectedRequest.requester.region}</p>
                  )}
                </div>
                <div>
                  <Label className="text-muted-foreground">Product</Label>
                  <p className="font-medium">{selectedRequest.variant.brand_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedRequest.variant.name} {selectedRequest.variant.type}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Admin Approved Quantity</Label>
                  <p className="text-3xl font-bold text-blue-600">{selectedRequest.admin_approved_quantity}</p>
                </div>
              </div>
              
              {/* Stock Availability Check */}
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <Label className="text-muted-foreground">Your Available Stock</Label>
                    <p
                      className={`text-3xl font-bold ${
                        sourceAvailableQty >= (selectedRequest.admin_approved_quantity || 0)
                          ? 'text-green-600'
                          : 'text-red-600'
                      }`}
                    >
                      {sourceAvailableQty}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <Label className="text-muted-foreground">Status</Label>
                    {sourceAvailableQty >= (selectedRequest.admin_approved_quantity || 0) ? (
                      <div className="flex items-center gap-2 text-green-600">
                        <CheckCircle2 className="h-5 w-5" />
                        <span className="font-medium">Sufficient Stock</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-red-600">
                        <AlertCircle className="h-5 w-5" />
                        <span className="font-medium">Insufficient Stock</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
              
              {sourceAvailableQty < (selectedRequest.admin_approved_quantity || 0) && (
                <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-red-900">Insufficient Stock</p>
                    <p className="text-sm text-red-700">
                      You have only {sourceAvailableQty} units, but {selectedRequest.admin_approved_quantity} units are needed. You cannot approve this request.
                    </p>
                  </div>
                </div>
              )}
              
              {selectedRequest.admin_notes && (
                <div>
                  <Label className="text-muted-foreground">Admin Notes</Label>
                  <p className="text-sm mt-1 p-3 bg-secondary rounded-lg">{selectedRequest.admin_notes}</p>
                </div>
              )}
              
              <div className="space-y-2">
                <Label>Your Notes (Optional)</Label>
                <Textarea
                  placeholder="Add any notes for the requester..."
                  value={sourceNotes}
                  onChange={(e) => setSourceNotes(e.target.value)}
                  rows={3}
                />
              </div>
              
              {!signatureDataUrl ? (
                <div className="flex justify-end">
                  <Button
                    onClick={() => setShowSignatureModal(true)}
                    disabled={processing || sourceAvailableQty < (selectedRequest.admin_approved_quantity || 0)}
                  >
                    Add Signature
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Your Signature</Label>
                  <div className="border rounded-lg p-4 bg-secondary">
                    <img src={signatureDataUrl} alt="Signature" className="max-h-32 mx-auto" />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSignatureDataUrl('')}
                  >
                    Clear Signature
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    By signing, you confirm that you approve this request and the stock will be reserved for transfer
                  </p>
                </div>
              )}
              
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setApproveDialogOpen(false);
                    setSelectedRequest(null);
                    setSignatureDataUrl('');
                  }}
                  disabled={processing}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleApprove}
                  disabled={processing || !signatureDataUrl || sourceAvailableQty < (selectedRequest.admin_approved_quantity || 0)}
                >
                  {processing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    'Approve Request'
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Reject Dialog */}
      <AlertDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Stock Request</AlertDialogTitle>
            <AlertDialogDescription>
              Provide a reason for rejecting this request. The requester and admin will be notified.
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
      
      {/* Signature Modal */}
      <Dialog open={showSignatureModal} onOpenChange={setShowSignatureModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Sign Approval</DialogTitle>
            <DialogDescription>
              Please sign below to confirm your approval
            </DialogDescription>
          </DialogHeader>
          <SignatureCanvas
            onSave={(dataUrl) => {
              setSignatureDataUrl(dataUrl);
              setShowSignatureModal(false);
              toast({
                title: 'Signature Saved',
                description: 'Your signature has been captured',
              });
            }}
            onCancel={() => setShowSignatureModal(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
