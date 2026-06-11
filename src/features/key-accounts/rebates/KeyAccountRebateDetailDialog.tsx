import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Check, Loader2, X } from 'lucide-react';
import {
  formatRebateCurrency,
  rebateReasonLabel,
  rebateResolutionLabel,
  rebateStatusBadgeClass,
  rebateStatusLabel,
  type KeyAccountRebateStatus,
} from './keyAccountRebateShared';
import {
  isKeyAccountAccounting,
  isKeyAccountDirector,
  isKeyAccountSalesAdmin,
  isKeyAccountSalesHead,
} from '@/features/key-accounts/keyAccountRoles';

export type KeyAccountRebateDetail = {
  id: string;
  rebate_number: string;
  purchase_order_id: string;
  status: KeyAccountRebateStatus;
  resolution_type: string;
  reason_code: string;
  disputed_total: number;
  credit_amount: number;
  replacement_total: number;
  notes: string | null;
  rejection_reason: string | null;
  fulfillment_purchase_order_id: string | null;
  top_up_purchase_order_id?: string | null;
  created_at: string;
  purchase_order?: { po_number: string; total_amount: number } | null;
  client?: { client_name: string } | null;
  fulfillment_po?: { po_number: string } | null;
  top_up_po?: { po_number: string } | null;
};

type RebateLine = {
  id: string;
  disputed_quantity: number;
  line_total: number;
  variant?: { name: string; brand?: { name: string } | null } | null;
};

type RebateReplacement = {
  id: string;
  quantity: number;
  total_price: number;
  variant?: { name: string; brand?: { name: string } | null } | null;
};

type VariantQueryEmbed =
  | { name: string; brand?: { name: string } | { name: string }[] | null }
  | { name: string; brand?: { name: string } | { name: string }[] | null }[]
  | null
  | undefined;

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function mapVariantEmbed(raw: VariantQueryEmbed): RebateLine['variant'] {
  const variant = unwrapRelation(raw);
  if (!variant) return null;
  return { name: variant.name, brand: unwrapRelation(variant.brand) };
}

function mapRebateLine(row: {
  id: string;
  disputed_quantity: number;
  line_total: number;
  variant?: VariantQueryEmbed;
}): RebateLine {
  return {
    id: row.id,
    disputed_quantity: row.disputed_quantity,
    line_total: row.line_total,
    variant: mapVariantEmbed(row.variant),
  };
}

function mapRebateReplacement(row: {
  id: string;
  quantity: number;
  total_price: number;
  variant?: VariantQueryEmbed;
}): RebateReplacement {
  return {
    id: row.id,
    quantity: row.quantity,
    total_price: row.total_price,
    variant: mapVariantEmbed(row.variant),
  };
}

type RebateQueryRow = Omit<
  KeyAccountRebateDetail,
  'purchase_order' | 'client' | 'fulfillment_po' | 'top_up_po'
> & {
  purchase_order?: { po_number: string; total_amount: number } | { po_number: string; total_amount: number }[] | null;
  client?: { client_name: string } | { client_name: string }[] | null;
  fulfillment_po?: { po_number: string } | { po_number: string }[] | null;
  top_up_po?: { po_number: string } | { po_number: string }[] | null;
};

function mapRebateRow(row: RebateQueryRow): KeyAccountRebateDetail {
  return {
    ...row,
    purchase_order: unwrapRelation(row.purchase_order),
    client: unwrapRelation(row.client),
    fulfillment_po: unwrapRelation(row.fulfillment_po),
    top_up_po: unwrapRelation(row.top_up_po),
  };
}

function variantLabel(v?: RebateLine['variant']) {
  if (!v) return '—';
  const brand = v.brand?.name;
  return brand ? `${brand} — ${v.name}` : v.name;
}

const REBATE_DETAIL_SELECT = `
  id,
  rebate_number,
  purchase_order_id,
  status,
  resolution_type,
  reason_code,
  disputed_total,
  credit_amount,
  replacement_total,
  notes,
  rejection_reason,
  fulfillment_purchase_order_id,
  top_up_purchase_order_id,
  created_at,
  purchase_order:purchase_orders!key_account_po_rebates_purchase_order_id_fkey(po_number, total_amount),
  client:key_account_clients(client_name),
  fulfillment_po:purchase_orders!key_account_po_rebates_fulfillment_purchase_order_id_fkey(po_number),
  top_up_po:purchase_orders!key_account_po_rebates_top_up_purchase_order_id_fkey(po_number)
`;

interface KeyAccountRebateDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rebateId: string | null;
  showApprovalActions?: boolean;
  onRebateUpdated?: () => void;
}

export function KeyAccountRebateDetailDialog({
  open,
  onOpenChange,
  rebateId,
  showApprovalActions = false,
  onRebateUpdated,
}: KeyAccountRebateDetailDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rebate, setRebate] = useState<KeyAccountRebateDetail | null>(null);
  const [lines, setLines] = useState<RebateLine[]>([]);
  const [replacements, setReplacements] = useState<RebateReplacement[]>([]);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);

  const canApprove =
    showApprovalActions &&
    (isKeyAccountSalesAdmin(user?.role) ||
      isKeyAccountSalesHead(user?.role) ||
      isKeyAccountDirector(user?.role));

  const loadDetails = useCallback(
    async (id: string) => {
      setLoading(true);
      setLines([]);
      setReplacements([]);
      try {
        const [rebateRes, linesRes, repRes] = await Promise.all([
          supabase.from('key_account_po_rebates').select(REBATE_DETAIL_SELECT).eq('id', id).maybeSingle(),
          supabase
            .from('key_account_po_rebate_lines')
            .select('id, disputed_quantity, line_total, variant:variants(name, brand:brands(name))')
            .eq('rebate_id', id),
          supabase
            .from('key_account_po_rebate_replacements')
            .select('id, quantity, total_price, variant:variants(name, brand:brands(name))')
            .eq('rebate_id', id),
        ]);
        if (rebateRes.error) throw rebateRes.error;
        if (linesRes.error) throw linesRes.error;
        if (repRes.error) throw repRes.error;
        if (!rebateRes.data) throw new Error('Rebate not found');
        setRebate(mapRebateRow(rebateRes.data as RebateQueryRow));
        setLines((linesRes.data ?? []).map(mapRebateLine));
        setReplacements((repRes.data ?? []).map(mapRebateReplacement));
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Failed to load rebate details';
        toast({
          variant: 'destructive',
          title: 'Error loading rebate',
          description: message,
        });
        onOpenChange(false);
      } finally {
        setLoading(false);
      }
    },
    [onOpenChange, toast]
  );

  useEffect(() => {
    if (!open || !rebateId) {
      if (!open) {
        setRebate(null);
        setLines([]);
        setReplacements([]);
      }
      return;
    }
    void loadDetails(rebateId);
  }, [open, rebateId, loadDetails]);

  const approveRebate = async () => {
    if (!rebate) return;
    setActing(true);
    try {
      const { data, error } = await supabase.rpc('approve_and_execute_key_account_rebate', {
        p_rebate_id: rebate.id,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Approval failed');
      toast({
        title: 'Rebate executed',
        description: data.fulfillment_po_number
          ? `${data.rebate_number} — fulfillment PO ${data.fulfillment_po_number} sent to warehouse.`
          : `${data.rebate_number} — credit recorded.`,
      });
      onOpenChange(false);
      onRebateUpdated?.();
    } catch (e: unknown) {
      toast({
        variant: 'destructive',
        title: 'Approval failed',
        description: e instanceof Error ? e.message : 'Failed',
      });
    } finally {
      setActing(false);
    }
  };

  const rejectRebate = async () => {
    if (!rebate) return;
    setActing(true);
    try {
      const { data, error } = await supabase.rpc('reject_key_account_rebate', {
        p_rebate_id: rebate.id,
        p_reason: 'Rejected from rebate detail',
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Reject failed');
      toast({ title: 'Rebate rejected', description: data.rebate_number });
      onOpenChange(false);
      onRebateUpdated?.();
    } catch (e: unknown) {
      toast({
        variant: 'destructive',
        title: 'Reject failed',
        description: e instanceof Error ? e.message : 'Failed',
      });
    } finally {
      setActing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rebate?.rebate_number ?? 'Rebate details'}</DialogTitle>
        </DialogHeader>
        {loading && !rebate ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : rebate ? (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className={rebateStatusBadgeClass(rebate.status)}>
                {rebateStatusLabel(rebate.status)}
              </Badge>
              <Badge variant="secondary">{rebateReasonLabel(rebate.reason_code)}</Badge>
              <Badge variant="secondary">{rebateResolutionLabel(rebate.resolution_type)}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-muted-foreground">Source PO: </span>
                {rebate.purchase_order?.po_number ?? '—'}
              </div>
              <div>
                <span className="text-muted-foreground">Client: </span>
                {rebate.client?.client_name ?? '—'}
              </div>
              <div>
                <span className="text-muted-foreground">Disputed: </span>
                {formatRebateCurrency(rebate.disputed_total)}
              </div>
              <div>
                <span className="text-muted-foreground">Credit: </span>
                {formatRebateCurrency(rebate.credit_amount)}
              </div>
              <div>
                <span className="text-muted-foreground">Replacement: </span>
                {formatRebateCurrency(rebate.replacement_total)}
              </div>
              {rebate.fulfillment_po?.po_number && (
                <div>
                  <span className="text-muted-foreground">Fulfillment PO: </span>
                  {rebate.fulfillment_po.po_number}
                </div>
              )}
              {rebate.top_up_po?.po_number && (
                <div>
                  <span className="text-muted-foreground">Top-up PO: </span>
                  {rebate.top_up_po.po_number}
                </div>
              )}
              {rebate.created_at && (
                <div>
                  <span className="text-muted-foreground">Created: </span>
                  {new Date(rebate.created_at).toLocaleDateString()}
                </div>
              )}
            </div>
            {rebate.notes && <p className="text-muted-foreground border-l-2 pl-3">{rebate.notes}</p>}
            {rebate.rejection_reason && (
              <p className="text-destructive text-sm">Rejected: {rebate.rejection_reason}</p>
            )}

            {loading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <>
                <div>
                  <h4 className="font-medium mb-2">Disputed lines</h4>
                  {lines.length === 0 ? (
                    <p className="text-muted-foreground">No disputed lines.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lines.map((line) => (
                          <TableRow key={line.id}>
                            <TableCell>{variantLabel(line.variant)}</TableCell>
                            <TableCell className="text-right">{line.disputed_quantity}</TableCell>
                            <TableCell className="text-right">
                              {formatRebateCurrency(line.line_total)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
                {replacements.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Replacement items</h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {replacements.map((replacement) => (
                          <TableRow key={replacement.id}>
                            <TableCell>{variantLabel(replacement.variant)}</TableCell>
                            <TableCell className="text-right">{replacement.quantity}</TableCell>
                            <TableCell className="text-right">
                              {formatRebateCurrency(replacement.total_price)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </>
            )}

            {canApprove && rebate.status === 'submitted' && !isKeyAccountAccounting(user?.role) && (
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="outline" disabled={acting} onClick={() => void rejectRebate()}>
                  <X className="h-4 w-4 mr-1" /> Reject
                </Button>
                <Button disabled={acting} onClick={() => void approveRebate()}>
                  {acting ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4 mr-1" />
                  )}
                  Approve & execute
                </Button>
              </div>
            )}

            {rebate.status === 'executed' && rebate.fulfillment_purchase_order_id && (
              <p className="text-xs text-muted-foreground">
                Warehouse can fulfill the replacement PO from Purchase Orders → Key Accounts tab.
              </p>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
