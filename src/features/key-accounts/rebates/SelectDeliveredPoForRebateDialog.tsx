import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { formatRebateCurrency, isRebateDerivedPurchaseOrder } from './keyAccountRebateShared';

export type DeliveredPoOption = {
  id: string;
  po_number: string;
  order_date: string;
  total_amount: number;
  po_order_kind?: string | null;
  source_rebate_id?: string | null;
  client?: { client_name: string } | null;
};

/** PostgREST may return embedded FK rows as an object or a one-element array. */
function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

type DeliveredPoQueryRow = Omit<DeliveredPoOption, 'client'> & {
  client?: { client_name: string } | { client_name: string }[] | null;
};

function mapDeliveredPoOption(row: DeliveredPoQueryRow): DeliveredPoOption {
  return { ...row, client: unwrapRelation(row.client) };
}

interface SelectDeliveredPoForRebateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SelectDeliveredPoForRebateDialog({ open, onOpenChange }: SelectDeliveredPoForRebateDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<DeliveredPoOption[]>([]);
  const [search, setSearch] = useState('');

  const loadDeliveredPos = useCallback(async () => {
    if (!user?.company_id) return;
    setLoading(true);
    try {
      let query = supabase
        .from('purchase_orders')
        .select(
          'id, po_number, order_date, total_amount, po_order_kind, source_rebate_id, client:key_account_clients(client_name)'
        )
        .eq('company_id', user.company_id)
        .eq('company_account_type', 'Key Accounts')
        .eq('status', 'fulfilled')
        .eq('workflow_status', 'delivered')
        .order('order_date', { ascending: false })
        .limit(200);

      if (user.role === 'key_account_manager') {
        query = query.eq('created_by', user.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? [])
        .map((row) => mapDeliveredPoOption(row as DeliveredPoQueryRow))
        .filter((po) => !isRebateDerivedPurchaseOrder(po));
      setOptions(rows);
    } catch (e: unknown) {
      const message =
        e && typeof e === 'object' && 'message' in e
          ? String((e as { message: unknown }).message)
          : 'Failed to load purchase orders';
      toast({ variant: 'destructive', title: 'Error', description: message });
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, [user?.company_id, user?.id, user?.role, toast]);

  useEffect(() => {
    if (open) {
      setSearch('');
      void loadDeliveredPos();
    }
  }, [open, loadDeliveredPos]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return options;
    return options.filter((po) => {
      const client = po.client?.client_name?.toLowerCase() || '';
      return po.po_number.toLowerCase().includes(term) || client.includes(term);
    });
  }, [options, search]);

  const pickPo = (poId: string) => {
    onOpenChange(false);
    navigate(`/key-accounts/rebates/new?poId=${poId}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Select delivered PO</DialogTitle>
          <DialogDescription>
            Rebates can only be created for original delivered POs. Rebate replacement and top-up POs
            are not listed.
          </DialogDescription>
        </DialogHeader>

        <Input
          placeholder="Search PO number or client…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="max-h-[min(50vh,360px)] overflow-y-auto space-y-2 pr-1">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {options.length === 0
                ? 'No delivered purchase orders found.'
                : 'No POs match your search.'}
            </p>
          ) : (
            filtered.map((po) => (
              <button
                key={po.id}
                type="button"
                className="w-full text-left rounded-md border px-3 py-2.5 hover:bg-muted/60 transition-colors"
                onClick={() => pickPo(po.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-semibold">{po.po_number}</span>
                  <span className="text-sm font-medium">{formatRebateCurrency(po.total_amount)}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-2">
                  <span>{po.client?.client_name || '—'}</span>
                  <span>·</span>
                  <span>{new Date(po.order_date).toLocaleDateString()}</span>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
