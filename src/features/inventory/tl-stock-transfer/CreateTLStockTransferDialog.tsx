import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Package, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { exportTlStockTransferRequestPdf } from './exportTlTransferPdfs';

type TeamLeaderOption = {
  id: string;
  full_name: string;
  region: string | null;
};

type SourceStockRow = {
  variant_id: string;
  variant_name: string;
  variant_type: string;
  brand_name: string;
  stock: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitted?: () => void;
};

export function CreateTLStockTransferDialog({ open, onOpenChange, onSubmitted }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [sourceTlId, setSourceTlId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [qtyByVariant, setQtyByVariant] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: teamLeaders = [], isLoading: leadersLoading } = useQuery({
    queryKey: ['tl-transfer-leaders', user?.company_id, user?.id],
    enabled: open && !!user?.company_id && !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, region')
        .eq('company_id', user!.company_id)
        .eq('role', 'team_leader')
        .eq('status', 'active')
        .neq('id', user!.id)
        .order('full_name');
      if (error) throw error;
      return (data || []) as TeamLeaderOption[];
    },
  });

  const { data: sourceStock = [], isLoading: stockLoading } = useQuery({
    queryKey: ['tl-transfer-source-stock', sourceTlId],
    enabled: open && !!sourceTlId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_inventory')
        .select(
          `
          stock,
          variant_id,
          variant:variants(
            id,
            name,
            variant_type,
            brand:brands(name)
          )
        `
        )
        .eq('agent_id', sourceTlId)
        .gt('stock', 0);
      if (error) throw error;
      return (data || []).map((row: any) => ({
        variant_id: row.variant_id,
        variant_name: row.variant?.name || '',
        variant_type: row.variant?.variant_type || '',
        brand_name: row.variant?.brand?.name || '',
        stock: Number(row.stock || 0),
      })) as SourceStockRow[];
    },
  });

  const filteredStock = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sourceStock;
    return sourceStock.filter(
      (item) =>
        item.brand_name.toLowerCase().includes(q) ||
        item.variant_name.toLowerCase().includes(q) ||
        item.variant_type.toLowerCase().includes(q)
    );
  }, [sourceStock, searchQuery]);

  const selectedLines = useMemo(
    () =>
      sourceStock
        .map((item) => ({
          ...item,
          qty: Math.max(0, Math.floor(qtyByVariant[item.variant_id] || 0)),
        }))
        .filter((item) => item.qty > 0),
    [sourceStock, qtyByVariant]
  );

  const reset = () => {
    setSourceTlId('');
    setSearchQuery('');
    setQtyByVariant({});
    setNotes('');
    setConfirmOpen(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const openConfirm = () => {
    if (!user?.company_id || !sourceTlId) return;
    if (selectedLines.length === 0) {
      toast({
        title: 'No items',
        description: 'Enter a quantity for at least one item.',
        variant: 'destructive',
      });
      return;
    }
    for (const line of selectedLines) {
      if (line.qty > line.stock) {
        toast({
          title: 'Quantity too high',
          description: `${line.brand_name} ${line.variant_name} only has ${line.stock} available.`,
          variant: 'destructive',
        });
        return;
      }
    }
    setConfirmOpen(true);
  };

  const handleSubmit = async () => {
    if (!user?.company_id || !sourceTlId || selectedLines.length === 0) return;

    setSubmitting(true);
    try {
        const { data, error } = await supabase.rpc('submit_tl_stock_request', {
          p_company_id: user.company_id,
          p_source_leader_id: sourceTlId,
          p_items: selectedLines.map((line) => ({
            variant_id: line.variant_id,
            quantity: line.qty,
          })),
          p_notes: notes.trim() || null,
        });
        if (error) throw error;
        if (!data?.success) {
          throw new Error(data?.error || 'Failed to submit transfer');
        }

      const requestNumber = String(data.request_number || '');
      const printOptions = requestNumber
        ? {
            requestNumber,
            statusLabel: 'Pending admin approval',
            createdAt: new Date().toISOString(),
            requesterName: user.full_name || '—',
            requesterRegion: user.region,
            sourceName: selectedTl?.full_name || '—',
            sourceRegion: selectedTl?.region,
            notes: notes.trim() || null,
            lines: selectedLines.map((line) => ({
              label: `${line.brand_name} · ${line.variant_name}`,
              requested: line.qty,
            })),
          }
        : null;
      toast({
        title: 'Transfer submitted',
        description: requestNumber
          ? `${requestNumber} · ${selectedLines.length} item(s) sent to Super Admin for approval.`
          : `${selectedLines.length} item(s) sent to Super Admin for approval.`,
      });
      queryClient.invalidateQueries({ queryKey: ['my-tl-requests'] });
      onSubmitted?.();
      handleOpenChange(false);
      if (printOptions) {
        try {
          await exportTlStockTransferRequestPdf(printOptions);
        } catch (printError: any) {
          toast({
            title: 'Transfer saved, print failed',
            description: printError?.message || 'Open the transfer from My transfers to print it.',
            variant: 'destructive',
          });
        }
      }
    } catch (error: any) {
      toast({
        title: 'Could not submit',
        description: error.message || 'Failed to submit transfer',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const selectedTl = teamLeaders.find((tl) => tl.id === sourceTlId);

  return (
    <>
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New stock transfer</DialogTitle>
          <DialogDescription>
            Choose a team leader, then request items from their stock. Super Admin must approve
            before they can dispatch.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Team leader</Label>
            <Select
              value={sourceTlId}
              onValueChange={(value) => {
                setSourceTlId(value);
                setQtyByVariant({});
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a team leader" />
              </SelectTrigger>
              <SelectContent>
                {leadersLoading ? (
                  <SelectItem value="loading" disabled>
                    Loading...
                  </SelectItem>
                ) : teamLeaders.length === 0 ? (
                  <SelectItem value="none" disabled>
                    No other team leaders in this company
                  </SelectItem>
                ) : (
                  teamLeaders.map((tl) => (
                    <SelectItem key={tl.id} value={tl.id}>
                      {tl.full_name}
                      {tl.region ? ` (${tl.region})` : ''}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {sourceTlId ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label>Stock held by {selectedTl?.full_name}</Label>
                <div className="relative w-56">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search items..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>

              {stockLoading ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Loading stock...
                </div>
              ) : filteredStock.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Package className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p>No stock available</p>
                </div>
              ) : (
                <div className="border rounded-lg max-h-80 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Brand</TableHead>
                        <TableHead>Variant</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Available</TableHead>
                        <TableHead className="w-28">Request qty</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredStock.map((item) => (
                        <TableRow key={item.variant_id}>
                          <TableCell className="font-medium">{item.brand_name}</TableCell>
                          <TableCell>{item.variant_name}</TableCell>
                          <TableCell>{item.variant_type}</TableCell>
                          <TableCell className="text-right tabular-nums">{item.stock}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              max={item.stock}
                              className="h-8"
                              value={qtyByVariant[item.variant_id] ?? ''}
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (raw === '') {
                                  setQtyByVariant((prev) => {
                                    const next = { ...prev };
                                    delete next[item.variant_id];
                                    return next;
                                  });
                                  return;
                                }
                                const qty = Math.max(0, Math.floor(Number(raw) || 0));
                                setQtyByVariant((prev) => ({ ...prev, [item.variant_id]: qty }));
                              }}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {selectedLines.length > 0 ? (
                <p className="text-sm text-muted-foreground">
                  {selectedLines.length} item{selectedLines.length === 1 ? '' : 's'} ·{' '}
                  {selectedLines.reduce((sum, line) => sum + line.qty, 0)} units
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="tl-transfer-notes">Notes (optional)</Label>
            <Textarea
              id="tl-transfer-notes"
              placeholder="Reason for the request or special instructions..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={openConfirm} disabled={submitting || selectedLines.length === 0}>
            Submit for approval
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure you want to request this transfer?</AlertDialogTitle>
          <AlertDialogDescription>
            Super Admin must approve it before {selectedTl?.full_name || 'the other team leader'} can
            dispatch.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-muted-foreground">Request from</p>
            <p className="font-medium">
              {selectedTl?.full_name}
              {selectedTl?.region ? ` (${selectedTl.region})` : ''}
            </p>
          </div>
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedLines.map((line) => (
                  <TableRow key={line.variant_id}>
                    <TableCell>
                      <p className="font-medium">
                        {line.brand_name} · {line.variant_name}
                      </p>
                      <p className="text-muted-foreground">{line.variant_type}</p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{line.qty}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-muted-foreground">
            {selectedLines.length} item{selectedLines.length === 1 ? '' : 's'} ·{' '}
            {selectedLines.reduce((sum, line) => sum + line.qty, 0)} units total
          </p>
          {notes.trim() ? (
            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-muted-foreground">Notes</p>
              <p className="whitespace-pre-wrap font-medium">{notes.trim()}</p>
            </div>
          ) : null}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Go back</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              'Yes, submit request'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
