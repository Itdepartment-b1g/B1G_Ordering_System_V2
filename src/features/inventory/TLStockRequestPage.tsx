import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { SignatureCanvas } from '@/components/ui/signature-canvas';
import {
  Package,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Plus,
  Search,
  Users,
  ShoppingCart,
  Trash2,
  FileText,
  Eye,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import type { TLStockRequest, TLRequestWithDetails, RequestCartItem } from '@/types/tlStockRequests.types';

interface Manager {
  id: string;
  full_name: string;
}

interface TeamLeader {
  id: string;
  full_name: string;
  region: string | null;
}

interface SourceInventoryItem {
  variant_id: string;
  variant_name: string;
  variant_type: string;
  brand_name: string;
  brand_id: string;
}

export default function TLStockRequestPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Selection states
  const [selectedManagerId, setSelectedManagerId] = useState<string>('');
  const [selectedSourceTLId, setSelectedSourceTLId] = useState<string>('');
  const [selectedSourceTL, setSelectedSourceTL] = useState<TeamLeader | null>(null);
  
  // Search and cart
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<RequestCartItem[]>([]);
  
  // Dialogs
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<TLRequestWithDetails | null>(null);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [requestToReceive, setRequestToReceive] = useState<TLRequestWithDetails | null>(null);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  
  // Loading states
  const [submitting, setSubmitting] = useState(false);
  const [receiving, setReceiving] = useState(false);
  
  // Signature
  const [signatureDataUrl, setSignatureDataUrl] = useState<string>('');
  
  // Fetch managers
  const { data: managers = [], isLoading: managersLoading } = useQuery({
    queryKey: ['managers', user?.company_id],
    queryFn: async () => {
      if (!user?.company_id) return [];
      
      const { data, error } = await supabase
        .from('sub_teams')
        .select(`
          manager_id,
          manager:profiles!sub_teams_manager_id_fkey(id, full_name)
        `)
        .eq('company_id', user.company_id);
      
      if (error) throw error;
      
      // Get unique managers
      const uniqueManagers = new Map<string, Manager>();
      data?.forEach((item: any) => {
        if (item.manager) {
          uniqueManagers.set(item.manager.id, item.manager);
        }
      });
      
      const managerList = Array.from(uniqueManagers.values());
      console.log('📋 Available Manager Teams:', managerList.length, managerList);
      return managerList;
    },
    enabled: !!user?.company_id,
  });
  
  // Fetch team leaders under selected manager
  const { data: teamLeaders = [], isLoading: teamLeadersLoading } = useQuery({
    queryKey: ['team-leaders', selectedManagerId, user?.company_id],
    queryFn: async () => {
      if (!selectedManagerId || !user?.company_id) return [];
      
      const { data, error } = await supabase
        .from('sub_teams')
        .select(`
          leader_id,
          leader:profiles!sub_teams_leader_id_fkey(id, full_name, region)
        `)
        .eq('manager_id', selectedManagerId)
        .eq('company_id', user.company_id);
      
      if (error) throw error;
      
      // Filter out current user
      const leaders = (data?.map((item: any) => item.leader).filter((tl: TeamLeader) => tl && tl.id !== user.id) || []) as TeamLeader[];
      console.log('👥 Team Leaders in selected manager team:', leaders.length, leaders);
      return leaders;
    },
    enabled: !!selectedManagerId && !!user?.company_id,
  });
  
  // Fetch source TL inventory (without quantities)
  const { data: sourceInventory = [], isLoading: sourceInventoryLoading } = useQuery({
    queryKey: ['source-tl-inventory', selectedSourceTLId],
    queryFn: async () => {
      if (!selectedSourceTLId) return [];
      
      const { data, error } = await supabase
        .from('agent_inventory')
        .select(`
          variant_id,
          variant:variants(
            id,
            name,
            variant_type,
            brand_id,
            brand:brands(name)
          )
        `)
        .eq('agent_id', selectedSourceTLId)
        .gt('stock', 0);
      
      if (error) throw error;
      
      return (data?.map((item: any) => ({
        variant_id: item.variant.id,
        variant_name: item.variant.name,
        variant_type: item.variant.variant_type,
        brand_name: item.variant.brand.name,
        brand_id: item.variant.brand_id,
      })) || []) as SourceInventoryItem[];
    },
    enabled: !!selectedSourceTLId,
  });
  
  // Fetch my outgoing requests
  const { data: myRequests = [], isLoading: requestsLoading } = useQuery({
    queryKey: ['my-tl-requests', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
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
        .eq('requester_leader_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('❌ Error fetching TL requests:', error);
        throw error;
      }
      
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
    enabled: !!user?.id,
  });
  
  // Real-time subscription
  useEffect(() => {
    if (!user?.company_id) return;
    
    const channel = supabase
      .channel('tl_stock_requests_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tl_stock_requests',
          filter: `company_id=eq.${user.company_id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['my-tl-requests'] });
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.company_id, queryClient]);
  
  // Filter inventory based on search
  const filteredInventory = useMemo(() => {
    if (!searchQuery) return sourceInventory;
    
    const query = searchQuery.toLowerCase();
    return sourceInventory.filter(
      (item) =>
        item.brand_name.toLowerCase().includes(query) ||
        item.variant_name.toLowerCase().includes(query) ||
        item.variant_type.toLowerCase().includes(query)
    );
  }, [sourceInventory, searchQuery]);
  
  // Add item to cart
  const addToCart = (item: SourceInventoryItem, quantity: number) => {
    if (quantity <= 0) {
      toast({
        title: 'Invalid Quantity',
        description: 'Quantity must be greater than 0',
        variant: 'destructive',
      });
      return;
    }
    
    // Check if item already in cart
    const existingIndex = cart.findIndex((c) => c.variant_id === item.variant_id);
    
    if (existingIndex >= 0) {
      const newCart = [...cart];
      newCart[existingIndex].requested_quantity = quantity;
      setCart(newCart);
    } else {
      setCart([
        ...cart,
        {
          variant_id: item.variant_id,
          variant_name: item.variant_name,
          variant_type: item.variant_type,
          brand_name: item.brand_name,
          requested_quantity: quantity,
        },
      ]);
    }
    
    toast({
      title: 'Added to Cart',
      description: `${item.brand_name} ${item.variant_name} ${item.variant_type}`,
    });
  };
  
  // Remove item from cart
  const removeFromCart = (variantId: string) => {
    setCart(cart.filter((item) => item.variant_id !== variantId));
  };
  
  // Submit requests
  const handleSubmitRequests = async () => {
    if (!user?.company_id || !selectedSourceTLId || !selectedManagerId) return;
    if (cart.length === 0) {
      toast({
        title: 'Empty Cart',
        description: 'Please add items to your cart before submitting',
        variant: 'destructive',
      });
      return;
    }
    
    setSubmitting(true);
    try {
      // Submit each item as a separate request
      const promises = cart.map((item) =>
        supabase.rpc('submit_tl_stock_request', {
          p_company_id: user.company_id,
          p_source_leader_id: selectedSourceTLId,
          p_variant_id: item.variant_id,
          p_requested_quantity: item.requested_quantity,
        })
      );
      
      const results = await Promise.all(promises);
      
      // Check for errors
      const failed = results.filter((r) => !r.data?.success);
      
      if (failed.length > 0) {
        throw new Error(failed[0].data?.error || 'Failed to submit requests');
      }
      
      toast({
        title: 'Requests Submitted',
        description: `${cart.length} request(s) submitted successfully`,
      });
      
      // Clear cart and reset selections
      setCart([]);
      setSubmitConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ['my-tl-requests'] });
    } catch (error: any) {
      console.error('Error submitting requests:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to submit requests',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };
  
  // Handle receipt
  const handleReceiveStock = async () => {
    if (!requestToReceive || !signatureDataUrl) {
      toast({
        title: 'Signature Required',
        description: 'Please provide your signature',
        variant: 'destructive',
      });
      return;
    }
    
    setReceiving(true);
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
      const fileName = `${user?.company_id}/${requestToReceive.request_number}/${timestamp}_receipt.png`;
      
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
      const { data: result, error: rpcError } = await supabase.rpc('requester_tl_receive_stock', {
        p_request_id: requestToReceive.id,
        p_signature_url: urlData.signedUrl,
        p_signature_path: fileName,
      });
      
      if (rpcError) throw rpcError;
      if (!result.success) throw new Error(result.error || 'Failed to receive stock');
      
      toast({
        title: 'Stock Received',
        description: `${result.transferred_quantity} units transferred successfully`,
      });
      
      setReceiptDialogOpen(false);
      setRequestToReceive(null);
      queryClient.invalidateQueries({ queryKey: ['my-tl-requests'] });
    } catch (error: any) {
      console.error('Error receiving stock:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to receive stock',
        variant: 'destructive',
      });
    } finally {
      setReceiving(false);
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
      case 'admin_approved':
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
            Ready for Receipt
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
  
  // Stats
  const stats = useMemo(() => {
    return {
      total: myRequests.length,
      pending: myRequests.filter((r) => r.status === 'pending_admin' || r.status === 'pending_source_tl').length,
      readyForReceipt: myRequests.filter((r) => r.status === 'pending_receipt').length,
      completed: myRequests.filter((r) => r.status === 'completed').length,
      rejected: myRequests.filter((r) => r.status === 'admin_rejected' || r.status === 'source_tl_rejected').length,
    };
  }, [myRequests]);
  
  if (!user || user.role !== 'team_leader') {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>Only team leaders can access this page</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Stock Requests from Team Leaders</h1>
        <p className="text-muted-foreground">Request stock from another team leader in your company</p>
      </div>
      
      {/* Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Total Requests</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
            <p className="text-xs text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-purple-600">{stats.readyForReceipt}</div>
            <p className="text-xs text-muted-foreground">Ready for Receipt</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
            <p className="text-xs text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600">{stats.rejected}</div>
            <p className="text-xs text-muted-foreground">Rejected</p>
          </CardContent>
        </Card>
      </div>
      
      {/* Create New Request Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Create New Request
          </CardTitle>
          <CardDescription>Select a team leader and request stock from their inventory</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Manager Selection */}
          <div className="space-y-2">
            <Label htmlFor="manager">Select Manager Team</Label>
            <Select
              value={selectedManagerId}
              onValueChange={(value) => {
                setSelectedManagerId(value);
                setSelectedSourceTLId('');
                setSelectedSourceTL(null);
                setCart([]);
              }}
            >
              <SelectTrigger id="manager">
                <SelectValue placeholder="Select any manager team in your company" />
              </SelectTrigger>
              <SelectContent>
                {managersLoading ? (
                  <SelectItem value="loading" disabled>
                    Loading...
                  </SelectItem>
                ) : managers.length === 0 ? (
                  <SelectItem value="none" disabled>
                    No manager teams found
                  </SelectItem>
                ) : (
                  managers.map((manager) => (
                    <SelectItem key={manager.id} value={manager.id}>
                      {manager.full_name}'s Team
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Choose from any manager team in your company ({managers.length} available)
            </p>
          </div>
          
          {/* Team Leader Selection */}
          {selectedManagerId && (
            <div className="space-y-2">
              <Label htmlFor="source-tl">Select Source Team Leader</Label>
              <Select
                value={selectedSourceTLId}
                onValueChange={(value) => {
                  setSelectedSourceTLId(value);
                  const tl = teamLeaders.find((t) => t.id === value);
                  setSelectedSourceTL(tl || null);
                  setCart([]);
                }}
              >
                <SelectTrigger id="source-tl">
                  <SelectValue placeholder="Choose a team leader to request from" />
                </SelectTrigger>
                <SelectContent>
                  {teamLeadersLoading ? (
                    <SelectItem value="loading" disabled>
                      Loading...
                    </SelectItem>
                  ) : teamLeaders.length === 0 ? (
                    <SelectItem value="none" disabled>
                      No team leaders found
                    </SelectItem>
                  ) : (
                    teamLeaders.map((tl) => (
                      <SelectItem key={tl.id} value={tl.id}>
                        {tl.full_name} {tl.region ? `(${tl.region})` : ''}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {teamLeaders.length === 0 
                  ? 'No other team leaders in this manager team'
                  : `${teamLeaders.length} team leader(s) available (excluding yourself)`
                }
              </p>
            </div>
          )}
          
          {/* Source TL Inventory */}
          {selectedSourceTLId && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Available Items from {selectedSourceTL?.full_name}</Label>
                <div className="relative w-64">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search items..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
              
              {sourceInventoryLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredInventory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No items available</p>
                </div>
              ) : (
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Brand</TableHead>
                        <TableHead>Variant</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredInventory.map((item) => {
                        const cartItem = cart.find((c) => c.variant_id === item.variant_id);
                        return (
                          <TableRow key={item.variant_id}>
                            <TableCell className="font-medium">{item.brand_name}</TableCell>
                            <TableCell>{item.variant_name}</TableCell>
                            <TableCell>{item.variant_type}</TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min="1"
                                placeholder="Qty"
                                className="w-20"
                                defaultValue={cartItem?.requested_quantity || ''}
                                onChange={(e) => {
                                  const qty = parseInt(e.target.value);
                                  if (qty > 0) {
                                    addToCart(item, qty);
                                  }
                                }}
                              />
                            </TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant={cartItem ? 'secondary' : 'default'}
                                onClick={() => {
                                  const input = document.querySelector(
                                    `input[type="number"][placeholder="Qty"]`
                                  ) as HTMLInputElement;
                                  const qty = input ? parseInt(input.value) : 1;
                                  addToCart(item, qty || 1);
                                }}
                              >
                                {cartItem ? 'Update' : 'Add'}
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
          
          {/* Cart */}
          {cart.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4" />
                  Request Cart ({cart.length} items)
                </Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCart([])}
                >
                  Clear All
                </Button>
              </div>
              
              <div className="border rounded-lg p-4 space-y-2 max-h-64 overflow-y-auto">
                {cart.map((item) => (
                  <div
                    key={item.variant_id}
                    className="flex items-center justify-between p-2 bg-secondary rounded"
                  >
                    <div className="flex-1">
                      <p className="font-medium">
                        {item.brand_name} - {item.variant_name} {item.variant_type}
                      </p>
                      <p className="text-sm text-muted-foreground">Quantity: {item.requested_quantity}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFromCart(item.variant_id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
              
              <Button
                className="w-full"
                size="lg"
                onClick={() => setSubmitConfirmOpen(true)}
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <FileText className="mr-2 h-4 w-4" />
                    Submit {cart.length} Request{cart.length > 1 ? 's' : ''}
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* My Outgoing Requests */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            My Outgoing Requests
          </CardTitle>
          <CardDescription>Track the status of your stock requests</CardDescription>
        </CardHeader>
        <CardContent>
          {requestsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : myRequests.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No requests yet</p>
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Request #</TableHead>
                    <TableHead>Source TL</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Requested Qty</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myRequests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell className="font-medium">{request.request_number}</TableCell>
                      <TableCell>{request.source.full_name}</TableCell>
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
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedRequest(request);
                              setViewDialogOpen(true);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {request.status === 'pending_receipt' && (
                            <Button
                              size="sm"
                              onClick={() => {
                                setRequestToReceive(request);
                                setSignatureDataUrl('');
                                setReceiptDialogOpen(true);
                              }}
                            >
                              Receive
                            </Button>
                          )}
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
      
      {/* View Request Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Request Details</DialogTitle>
            <DialogDescription>View request information and status</DialogDescription>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Request Number</Label>
                  <p className="font-medium">{selectedRequest.request_number}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <div className="mt-1">{getStatusBadge(selectedRequest.status)}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Source Team Leader</Label>
                  <p className="font-medium">{selectedRequest.source.full_name}</p>
                  {selectedRequest.source.region && (
                    <p className="text-sm text-muted-foreground">{selectedRequest.source.region}</p>
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
                  <Label className="text-muted-foreground">Requested Quantity</Label>
                  <p className="font-medium">{selectedRequest.requested_quantity}</p>
                </div>
                {selectedRequest.admin_approved_quantity && (
                  <div>
                    <Label className="text-muted-foreground">Approved Quantity</Label>
                    <p className="font-medium">{selectedRequest.admin_approved_quantity}</p>
                  </div>
                )}
                <div>
                  <Label className="text-muted-foreground">Created</Label>
                  <p className="font-medium">
                    {new Date(selectedRequest.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
              
              {selectedRequest.admin_notes && (
                <div>
                  <Label className="text-muted-foreground">Admin Notes</Label>
                  <p className="text-sm mt-1">{selectedRequest.admin_notes}</p>
                </div>
              )}
              
              {selectedRequest.source_tl_notes && (
                <div>
                  <Label className="text-muted-foreground">Source TL Notes</Label>
                  <p className="text-sm mt-1">{selectedRequest.source_tl_notes}</p>
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
      
      {/* Receipt Dialog */}
      <Dialog open={receiptDialogOpen} onOpenChange={setReceiptDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Receive Stock</DialogTitle>
            <DialogDescription>Sign to confirm receipt of stock</DialogDescription>
          </DialogHeader>
          {requestToReceive && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Request Number</Label>
                  <p className="font-medium">{requestToReceive.request_number}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Source Team Leader</Label>
                  <p className="font-medium">{requestToReceive.source.full_name}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Product</Label>
                  <p className="font-medium">{requestToReceive.variant.brand_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {requestToReceive.variant.name} {requestToReceive.variant.type}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Quantity to Receive</Label>
                  <p className="font-medium text-2xl text-green-600">
                    {requestToReceive.admin_approved_quantity}
                  </p>
                </div>
              </div>
              
              {!signatureDataUrl ? (
                <div className="flex justify-end">
                  <Button
                    onClick={() => setShowSignatureModal(true)}
                    disabled={receiving}
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
                    By signing, you confirm receipt of the stock and agree that the quantity has been transferred to your inventory
                  </p>
                </div>
              )}
              
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setReceiptDialogOpen(false);
                    setRequestToReceive(null);
                    setSignatureDataUrl('');
                  }}
                  disabled={receiving}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleReceiveStock}
                  disabled={receiving || !signatureDataUrl}
                >
                  {receiving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    'Confirm Receipt'
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Submit Confirmation Dialog */}
      <AlertDialog open={submitConfirmOpen} onOpenChange={setSubmitConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Submission</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to submit {cart.length} stock request{cart.length > 1 ? 's' : ''} to{' '}
              {selectedSourceTL?.full_name}. The requests will be sent to admin for approval.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSubmitRequests} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Requests'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Signature Modal */}
      <Dialog open={showSignatureModal} onOpenChange={setShowSignatureModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Sign for Receipt</DialogTitle>
            <DialogDescription>
              Please sign below to confirm receipt of stock
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
    </div>
  );
}
