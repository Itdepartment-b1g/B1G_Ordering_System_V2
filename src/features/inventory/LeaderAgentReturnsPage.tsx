import { Fragment, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  MoreVertical,
  Printer,
  RotateCcw,
  ThumbsDown,
  ThumbsUp,
  Users,
} from 'lucide-react';
import { useAuth } from '@/features/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
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
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { exportMainInventoryReturnPdf } from './utils/exportMainInventoryReturnPdf';

type ReturnStatus = 'pending' | 'approved' | 'rejected';
type StatusFilter = 'all' | ReturnStatus;

type ReturnItem = {
  variantId: string;
  quantity: number;
  variantName: string;
  variantType: string | null;
  brandName: string;
};

type AgentReturn = {
  id: string;
  returnedBy: string;
  returnedAt: string;
  status: ReturnStatus;
  reason: string;
  rejectionReason: string | null;
  variantCount: number;
  totalQuantity: number;
  items: ReturnItem[];
};

const RETURNS_QUERY_KEY = 'leader-agent-returns';

function variantTypeLabel(type: string | null | undefined): string | null {
  if (!type?.trim()) return null;
  const key = type.trim().toLowerCase();
  if (key === 'flavor') return 'Flavor';
  if (key === 'battery') return 'Battery';
  if (key === 'foc') return 'FOC';
  if (key === 'posm') return 'POSM';
  if (key === 'ncv') return 'NCV';
  return type;
}

function variantTypeBadgeClass(type: string | null | undefined): string {
  const key = type?.trim().toLowerCase();
  if (key === 'flavor') return 'border-purple-300 bg-purple-100 text-purple-800';
  if (key === 'battery') return 'border-green-300 bg-green-100 text-green-800';
  if (key === 'foc') return 'border-orange-300 bg-orange-100 text-orange-800';
  return '';
}

function statusBadge(status: ReturnStatus) {
  if (status === 'approved') return <Badge>Approved</Badge>;
  if (status === 'rejected') return <Badge variant="destructive">Rejected</Badge>;
  return <Badge variant="secondary">Pending</Badge>;
}

function reasonText(reason: string | null, notes: string | null): string {
  const parts = [reason?.trim(), notes?.trim()].filter(Boolean);
  return parts.join(' — ');
}

function BrandReturnTables({ items }: { items: ReturnItem[] }) {
  const brands = useMemo(() => {
    const map = new Map<string, ReturnItem[]>();
    items.forEach((item) => {
      const name = item.brandName?.trim() || 'Unknown brand';
      const list = map.get(name) ?? [];
      list.push(item);
      map.set(name, list);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  return (
    <div className="space-y-4">
      {brands.map(([brandName, brandItems]) => (
        <div key={brandName} className="overflow-hidden rounded-md border bg-white">
          <div className="border-b bg-muted/40 px-4 py-2.5 font-semibold">{brandName}</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Variant</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Qty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {brandItems.map((item) => {
                const label = variantTypeLabel(item.variantType);
                return (
                  <TableRow key={item.variantId}>
                    <TableCell>{item.variantName}</TableCell>
                    <TableCell>
                      {label ? (
                        <Badge variant="outline" className={`text-[10px] ${variantTypeBadgeClass(item.variantType)}`}>
                          {label}
                        </Badge>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{item.quantity.toLocaleString()}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ))}
    </div>
  );
}

function ReturnDetails({ row }: { row: AgentReturn }) {
  return (
    <div>
      <p className="mb-3 text-sm">
        <span className="font-medium">Reason of returned:</span>{' '}
        <span className="text-muted-foreground">{row.reason || '—'}</span>
      </p>
      {row.status === 'rejected' && row.rejectionReason && (
        <p className="mb-3 text-sm">
          <span className="font-medium">Rejection reason:</span>{' '}
          <span className="text-muted-foreground">{row.rejectionReason}</span>
        </p>
      )}
      <BrandReturnTables items={row.items} />
    </div>
  );
}

function returnStatusLabel(status: AgentReturn['status']): string {
  if (status === 'approved') return 'Approved';
  if (status === 'rejected') return 'Rejected';
  return 'Pending';
}

function ReturnRowActions({
  row,
  onApprove,
  onReject,
}: {
  row: AgentReturn;
  onApprove: (row: AgentReturn) => void;
  onReject: (row: AgentReturn) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2" onClick={(event) => event.stopPropagation()}>
      {row.status === 'pending' && (
        <>
          <Button type="button" size="sm" onClick={() => onApprove(row)}>
            <ThumbsUp className="h-4 w-4" />
            Accept
          </Button>
          <Button type="button" size="sm" variant="destructive" onClick={() => onReject(row)}>
            <ThumbsDown className="h-4 w-4" />
            Reject
          </Button>
        </>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Return actions">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={() => printReturn(row)}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function printReturn(row: AgentReturn) {
  exportMainInventoryReturnPdf({
    returnedBy: row.returnedBy,
    returnedAt: row.returnedAt,
    status: returnStatusLabel(row.status),
    reason: row.reason,
    lines: row.items.map((item) => ({
      brandName: item.brandName,
      variantName: item.variantName,
      variantType: item.variantType,
      quantity: item.quantity,
    })),
  });
}

async function fetchLeaderReturns(userId: string): Promise<AgentReturn[]> {
  const { data, error } = await supabase
    .from('inventory_returns')
    .select(`
      id,
      return_reason,
      reason_notes,
      rejection_reason,
      created_at,
      status,
      agent:profiles!inventory_returns_agent_id_fkey(full_name)
    `)
    .eq('receiver_id', userId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) throw error;
  if (!data?.length) return [];

  const { data: itemsData, error: itemsError } = await supabase
    .from('inventory_return_items')
    .select(`
      return_id,
      variant_id,
      quantity,
      variant:variants(name, variant_type, brand:brands(name))
    `)
    .in('return_id', data.map((row) => row.id));

  if (itemsError) throw itemsError;

  const itemsByReturn = new Map<string, ReturnItem[]>();
  (itemsData || []).forEach((row) => {
    const variant = Array.isArray(row.variant) ? row.variant[0] : row.variant;
    const brand = variant?.brand
      ? Array.isArray(variant.brand) ? variant.brand[0] : variant.brand
      : null;
    const list = itemsByReturn.get(row.return_id) ?? [];
    list.push({
      variantId: row.variant_id,
      quantity: Number(row.quantity) || 0,
      variantName: variant?.name || 'Unknown',
      variantType: variant?.variant_type || null,
      brandName: brand?.name || 'Unknown',
    });
    itemsByReturn.set(row.return_id, list);
  });

  return data.map((row) => {
    const agent = Array.isArray(row.agent) ? row.agent[0] : row.agent;
    const items = itemsByReturn.get(row.id) ?? [];
    const status: ReturnStatus =
      row.status === 'approved' || row.status === 'rejected' ? row.status : 'pending';
    return {
      id: row.id,
      returnedBy: agent?.full_name || 'Unknown',
      returnedAt: row.created_at,
      status,
      reason: reasonText(row.return_reason, row.reason_notes),
      rejectionReason: row.rejection_reason,
      variantCount: items.length,
      totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
      items,
    };
  });
}

export function LeaderAgentReturnsLink() {
  const { user } = useAuth();
  const { data: pendingCount = 0 } = useQuery({
    queryKey: [RETURNS_QUERY_KEY, 'pending-count', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('inventory_returns')
        .select('id', { count: 'exact', head: true })
        .eq('receiver_id', user!.id)
        .eq('status', 'pending');
      if (error) throw error;
      return count ?? 0;
    },
  });

  return (
    <Card>
      <CardHeader className="p-4 md:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <RotateCcw className="h-4 w-4 md:h-5 md:w-5 text-amber-600" />
              Team returns
              <Badge variant="secondary">{pendingCount}</Badge>
            </CardTitle>
            <CardDescription className="mt-1">
              Mobile sales requesting to return stock to you.
            </CardDescription>
          </div>
          <Button variant="outline" asChild>
            <Link to="/inventory/leader/returns">View returns</Link>
          </Button>
        </div>
      </CardHeader>
    </Card>
  );
}

export default function LeaderAgentReturnsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<AgentReturn | null>(null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processing, setProcessing] = useState(false);

  const backTo = user?.role === 'manager' ? '/manager-inventory' : '/leader-inventory';

  const { data: returns = [], isLoading } = useQuery({
    queryKey: [RETURNS_QUERY_KEY, user?.id],
    enabled: !!user?.id,
    queryFn: () => fetchLeaderReturns(user!.id),
  });

  const visible = statusFilter === 'all' ? returns : returns.filter((row) => row.status === statusFilter);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: [RETURNS_QUERY_KEY] });
  };

  const handleApprove = async () => {
    if (!selected || !acknowledged) {
      toast({ title: 'Validation', description: 'You must check "I acknowledge" to approve', variant: 'destructive' });
      return;
    }
    setProcessing(true);
    try {
      const { data, error } = await supabase.rpc('approve_return_inventory_request', {
        p_return_id: selected.id,
        p_acknowledged: true,
      });
      if (error) throw error;
      if (data && !data.success) throw new Error(data.message);
      toast({ title: 'Approved', description: 'Return request approved. Inventory transferred.' });
      setApproveOpen(false);
      setSelected(null);
      setAcknowledged(false);
      await refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to approve';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selected) return;
    setProcessing(true);
    try {
      const { data, error } = await supabase.rpc('reject_return_inventory_request', {
        p_return_id: selected.id,
        p_reason: rejectionReason || null,
      });
      if (error) throw error;
      if (data && !data.success) throw new Error(data.message);
      toast({ title: 'Rejected', description: 'Return request rejected.' });
      setRejectOpen(false);
      setSelected(null);
      setRejectionReason('');
      await refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to reject';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const openApprove = (row: AgentReturn) => {
    setSelected(row);
    setAcknowledged(false);
    setApproveOpen(true);
  };

  const openReject = (row: AgentReturn) => {
    setSelected(row);
    setRejectionReason('');
    setRejectOpen(true);
  };

  return (
    <div className="w-full p-4 md:p-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Team Returns</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Stock returned from mobile sales to you
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to={backTo}>Back</Link>
        </Button>
      </div>

      <Tabs value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Return history
          </CardTitle>
          <CardDescription>Each request is one return from a mobile sales agent.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <RotateCcw className="h-10 w-10 mb-3 opacity-40" />
              <p className="font-medium text-foreground">No returns found</p>
            </div>
          ) : (
            <>
              <div className="hidden md:block overflow-hidden rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      <TableHead>Returned by</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Variant Qty</TableHead>
                      <TableHead className="text-right">Total Qty</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((row) => {
                      const open = openId === row.id;
                      return (
                        <Fragment key={row.id}>
                          <TableRow
                            className="cursor-pointer hover:bg-muted/40"
                            onClick={() => setOpenId(open ? null : row.id)}
                          >
                            <TableCell>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label={open ? 'Collapse return' : 'Expand return'}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setOpenId(open ? null : row.id);
                                }}
                              >
                                {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </Button>
                            </TableCell>
                            <TableCell className="font-medium">{row.returnedBy}</TableCell>
                            <TableCell className="whitespace-nowrap text-sm">
                              {format(new Date(row.returnedAt), 'MMM d, yyyy h:mm a')}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{row.variantCount}</TableCell>
                            <TableCell className="text-right font-medium tabular-nums">
                              {row.totalQuantity.toLocaleString()}
                            </TableCell>
                            <TableCell>{statusBadge(row.status)}</TableCell>
                            <TableCell className="text-right">
                              <ReturnRowActions row={row} onApprove={openApprove} onReject={openReject} />
                            </TableCell>
                          </TableRow>
                          {open && (
                            <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                              <TableCell colSpan={7} className="p-4">
                                <ReturnDetails row={row} />
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="md:hidden space-y-3">
                {visible.map((row) => {
                  const open = openId === row.id;
                  return (
                    <div key={row.id} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-sm">{row.returnedBy}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(new Date(row.returnedAt), 'MMM d, yyyy h:mm a')}
                          </p>
                          <p className="text-xs mt-1">
                            {row.variantCount} variants · {row.totalQuantity.toLocaleString()} qty
                          </p>
                        </div>
                        {statusBadge(row.status)}
                      </div>
                      <ReturnRowActions row={row} onApprove={openApprove} onReject={openReject} />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full justify-between"
                        onClick={() => setOpenId(open ? null : row.id)}
                      >
                        {open ? 'Hide items' : 'View items'}
                        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </Button>
                      {open && <ReturnDetails row={row} />}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Return Request</DialogTitle>
            <DialogDescription>
              Approving will transfer the inventory from {selected?.returnedBy} to you.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-3 py-4">
            <Checkbox
              id="acknowledge-return"
              checked={acknowledged}
              onCheckedChange={(value) => setAcknowledged(!!value)}
            />
            <Label htmlFor="acknowledge-return" className="text-sm leading-relaxed cursor-pointer">
              I acknowledge that I have verified the items and accept this return. The inventory will be transferred to my stock.
            </Label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)} disabled={processing}>
              Cancel
            </Button>
            <Button onClick={handleApprove} disabled={!acknowledged || processing}>
              {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Approve Return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Return Request</AlertDialogTitle>
            <AlertDialogDescription>
              Rejecting will keep the inventory with {selected?.returnedBy}. You can optionally provide a reason.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="rejection-reason" className="text-sm">Reason (optional)</Label>
            <Textarea
              id="rejection-reason"
              placeholder="e.g. Please keep the stock for now..."
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
              className="mt-2"
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleReject();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={processing}
            >
              {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
