import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PackageMinus, Loader2, ThumbsUp, ThumbsDown, Clock, User } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { canLeadTeam } from '@/lib/roleUtils';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';

interface ReturnRequestItem {
  variant_id: string;
  quantity: number;
  variant?: { id: string; name: string; variant_type?: string; brand?: { name: string } };
}

interface ReturnRequest {
  id: string;
  agent_id: string;
  receiver_id: string;
  return_type: string;
  return_reason: string;
  reason_notes: string | null;
  return_date: string;
  created_at: string;
  status: string;
  agent?: { full_name: string };
  items: ReturnRequestItem[];
}

export default function ReturnRequestsSection() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [pendingReturns, setPendingReturns] = useState<ReturnRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState<ReturnRequest | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processing, setProcessing] = useState(false);

  const fetchPendingReturns = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      const { data: returnsData, error: returnsError } = await supabase
        .from('inventory_returns')
        .select(
          `
          id,
          agent_id,
          receiver_id,
          return_type,
          return_reason,
          reason_notes,
          return_date,
          created_at,
          status,
          agent:profiles!inventory_returns_agent_id_fkey(full_name)
        `
        )
        .eq('receiver_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (returnsError) throw returnsError;

      if (!returnsData?.length) {
        setPendingReturns([]);
        return;
      }

      const { data: itemsData, error: itemsError } = await supabase
        .from('inventory_return_items')
        .select(
          `
          return_id,
          variant_id,
          quantity,
          variant:variants(id, name, variant_type, brand:brands(name))
        `
        )
        .in('return_id', returnsData.map((r: any) => r.id));

      if (itemsError) throw itemsError;

      const itemsByReturn = (itemsData || []).reduce<Record<string, ReturnRequestItem[]>>(
        (acc, row: any) => {
          const id = row.return_id;
          if (!acc[id]) acc[id] = [];
          acc[id].push({
            variant_id: row.variant_id,
            quantity: row.quantity,
            variant: row.variant,
          });
          return acc;
        },
        {}
      );

      const enriched: ReturnRequest[] = (returnsData || []).map((r: any) => ({
        ...r,
        items: itemsByReturn[r.id] || [],
      }));

      setPendingReturns(enriched);
    } catch (err: any) {
      console.error('Error fetching pending returns:', err);
      toast({
        title: 'Error',
        description: err.message || 'Failed to load return requests',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingReturns();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('inventory_returns_pending_changes')
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'inventory_returns',
          filter: `receiver_id=eq.${user.id}`,
        },
        () => fetchPendingReturns()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const handleApprove = async () => {
    if (!selectedReturn || !acknowledged) {
      toast({
        title: 'Validation',
        description: 'You must check "I acknowledge" to approve',
        variant: 'destructive',
      });
      return;
    }

    setProcessing(true);
    try {
      const { data, error } = await supabase.rpc('approve_return_inventory_request', {
        p_return_id: selectedReturn.id,
        p_acknowledged: true,
      });

      if (error) throw error;
      if (data && !data.success) throw new Error(data.message);

      toast({ title: 'Approved', description: 'Return request approved. Inventory transferred.' });
      setApproveDialogOpen(false);
      setSelectedReturn(null);
      setAcknowledged(false);
      fetchPendingReturns();
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to approve',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedReturn) return;

    setProcessing(true);
    try {
      const { data, error } = await supabase.rpc('reject_return_inventory_request', {
        p_return_id: selectedReturn.id,
        p_reason: rejectionReason || null,
      });

      if (error) throw error;
      if (data && !data.success) throw new Error(data.message);

      toast({ title: 'Rejected', description: 'Return request rejected.' });
      setRejectDialogOpen(false);
      setSelectedReturn(null);
      setRejectionReason('');
      fetchPendingReturns();
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to reject',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  if (!user || !canLeadTeam(user.role)) {
    return null;
  }

  return (
    <>
      <Card>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="flex items-center gap-2 text-base md:text-lg">
            <PackageMinus className="h-4 w-4 md:h-5 md:w-5 text-amber-600 flex-shrink-0" />
            <span>Pending Return Requests</span>
            <Badge variant="secondary" className="ml-1">
              {pendingReturns.length}
            </Badge>
          </CardTitle>
          <CardDescription>
            Mobile sales requesting to return inventory to you. Approve to transfer or reject to keep inventory with them.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 md:p-6">
          {loading ? (
            <div className="flex items-center justify-center gap-2 text-muted-foreground py-8">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading return requests...</span>
            </div>
          ) : pendingReturns.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <PackageMinus className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No pending return requests</p>
            </div>
          ) : (
          <div className="space-y-3">
            {pendingReturns.map((req) => (
              <div
                key={req.id}
                className="border rounded-lg p-4 space-y-3 hover:bg-accent/50 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{req.agent?.full_name || 'Unknown'}</span>
                    <Badge variant="outline">{req.return_type}</Badge>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {format(new Date(req.created_at), 'MMM d, yyyy')} at{' '}
                    {format(new Date(req.created_at), 'h:mm a')}
                  </div>
                </div>

                <p className="text-sm text-muted-foreground">
                  Reason: <span className="font-medium capitalize">{req.return_reason}</span>
                  {req.reason_notes && ` — ${req.reason_notes}`}
                </p>

                <div>
                  <Label className="text-xs font-medium text-muted-foreground uppercase">
                    Stocks being returned
                  </Label>
                  <div className="border rounded-md overflow-hidden mt-2">
                    {(() => {
                      const byBrand = (req.items || []).reduce<Record<string, { total: number; items: ReturnRequestItem[] }>>(
                        (acc, item) => {
                          const brandName = item.variant?.brand?.name || 'Other';
                          if (!acc[brandName]) acc[brandName] = { total: 0, items: [] };
                          acc[brandName].items.push(item);
                          acc[brandName].total += item.quantity;
                          return acc;
                        },
                        {}
                      );
                      return (
                        <>
                          {Object.entries(byBrand).map(([brandName, { total, items }]) => (
                            <div key={brandName} className="border-b last:border-b-0">
                              <div className="px-3 py-2 bg-muted/50 font-medium text-sm flex justify-between items-center">
                                <span>{brandName}</span>
                                <span className="font-mono">Total: {total}</span>
                              </div>
                              <div className="divide-y">
                                {items.map((item) => (
                                  <div key={item.variant_id} className="flex justify-between items-center px-4 py-1.5 text-sm">
                                    <span className="text-muted-foreground">{item.variant?.name || 'Unknown'}</span>
                                    <span className="font-medium">{item.quantity}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </>
                      );
                    })()}
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      setSelectedReturn(req);
                      setAcknowledged(false);
                      setApproveDialogOpen(true);
                    }}
                    className="gap-2"
                  >
                    <ThumbsUp className="h-3 w-3" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      setSelectedReturn(req);
                      setRejectionReason('');
                      setRejectDialogOpen(true);
                    }}
                    className="gap-2"
                  >
                    <ThumbsDown className="h-3 w-3" />
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
          )}
        </CardContent>
      </Card>

      {/* Approve Dialog */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Return Request</DialogTitle>
            <DialogDescription>
              Approving will transfer the inventory from {selectedReturn?.agent?.full_name} to you.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-start gap-3">
              <Checkbox
                id="acknowledge"
                checked={acknowledged}
                onCheckedChange={(v) => setAcknowledged(!!v)}
              />
              <Label htmlFor="acknowledge" className="text-sm leading-relaxed cursor-pointer">
                I acknowledge that I have verified the items and accept this return. The inventory will be transferred to my stock.
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveDialogOpen(false)} disabled={processing}>
              Cancel
            </Button>
            <Button onClick={handleApprove} disabled={!acknowledged || processing}>
              {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Approve Return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <AlertDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Return Request</AlertDialogTitle>
            <AlertDialogDescription>
              Rejecting will keep the inventory with {selectedReturn?.agent?.full_name}. You can optionally provide a reason.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="rejection-reason" className="text-sm">
              Reason (optional)
            </Label>
            <Textarea
              id="rejection-reason"
              placeholder="e.g. Please keep the stock for now..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="mt-2"
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReject}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={processing}
            >
              {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
