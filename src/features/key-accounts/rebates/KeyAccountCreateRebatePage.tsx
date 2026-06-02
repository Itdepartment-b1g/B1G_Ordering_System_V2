import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { SelectDeliveredPoForRebateDialog } from './SelectDeliveredPoForRebateDialog';
import {
  firstRelation,
  isDeliveredKeyAccountOrder,
} from '@/features/key-accounts/key-accounts-analytics/keyAccountAnalyticsShared';
import {
  REBATE_REASON_OPTIONS,
  REBATE_RESOLUTION_OPTIONS,
  formatRebateCurrency,
  isRebateDerivedPurchaseOrder,
  type KeyAccountRebateReasonCode,
  type KeyAccountRebateResolutionType,
} from './keyAccountRebateShared';

type PoRow = {
  id: string;
  po_number: string;
  total_amount: number;
  status: string | null;
  workflow_status: string | null;
  po_order_kind?: string | null;
  source_rebate_id?: string | null;
  warehouse_location_id: string | null;
  key_account_client_id: string | null;
  client?: { client_name: string } | null;
};

type PoItemRow = {
  id: string;
  variant_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  variant?: { name: string; brand?: { name: string } | null } | null;
};

type BrandRow = { id: string; name: string };
type VariantRow = { id: string; name: string; brand_id: string };

type DisputedLine = {
  purchase_order_item_id: string;
  label: string;
  maxQty: number;
  unitPrice: number;
  disputedQty: number;
};

type ReplacementLine = {
  variantId: string;
  label: string;
  quantity: number;
  unitPrice: number;
};

type SupabaseClientEmbed = { client_name: string };
type SupabaseVariantEmbed = {
  name: string;
  brand?: { name: string } | { name: string }[] | null;
};
type SupabasePoItemRaw = {
  id: string;
  variant_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  variant?: SupabaseVariantEmbed | SupabaseVariantEmbed[] | null;
};

function normalizePoRow(poData: {
  id: string;
  po_number: string;
  total_amount: number;
  status: string | null;
  workflow_status: string | null;
  po_order_kind?: string | null;
  source_rebate_id?: string | null;
  warehouse_location_id: string | null;
  key_account_client_id: string | null;
  client?: SupabaseClientEmbed | SupabaseClientEmbed[] | null;
}): PoRow {
  return {
    id: poData.id,
    po_number: poData.po_number,
    total_amount: poData.total_amount,
    status: poData.status,
    workflow_status: poData.workflow_status,
    po_order_kind: poData.po_order_kind,
    source_rebate_id: poData.source_rebate_id,
    warehouse_location_id: poData.warehouse_location_id,
    key_account_client_id: poData.key_account_client_id,
    client: firstRelation(poData.client),
  };
}

function normalizePoItemRow(it: SupabasePoItemRaw): PoItemRow {
  const variantRaw = firstRelation(it.variant);
  const brand = variantRaw ? firstRelation(variantRaw.brand) : null;
  return {
    id: it.id,
    variant_id: it.variant_id,
    quantity: it.quantity,
    unit_price: it.unit_price,
    total_price: it.total_price,
    variant: variantRaw ? { name: variantRaw.name, brand } : null,
  };
}

export function KeyAccountCreateRebatePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const poId = searchParams.get('poId') || '';

  const [pickPoOpen, setPickPoOpen] = useState(!poId);
  const [loading, setLoading] = useState(!!poId);
  const [submitting, setSubmitting] = useState(false);
  const [po, setPo] = useState<PoRow | null>(null);
  const [lines, setLines] = useState<DisputedLine[]>([]);
  const [reasonCode, setReasonCode] = useState<KeyAccountRebateReasonCode>('slow_moving');
  const [notes, setNotes] = useState('');
  const [resolutionType, setResolutionType] = useState<KeyAccountRebateResolutionType>('credit');
  const [creditAmount, setCreditAmount] = useState('');
  const [remainingCap, setRemainingCap] = useState<number | null>(null);

  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [repQty, setRepQty] = useState('1');
  const [repUnitPrice, setRepUnitPrice] = useState('');
  const [replacements, setReplacements] = useState<ReplacementLine[]>([]);
  const [warehouseLocationId, setWarehouseLocationId] = useState<string | null>(null);

  const disputedTotal = useMemo(
    () => lines.reduce((sum, l) => sum + l.disputedQty * l.unitPrice, 0),
    [lines]
  );

  const replacementTotal = useMemo(
    () => replacements.reduce((sum, r) => sum + r.quantity * r.unitPrice, 0),
    [replacements]
  );

  const creditNum = useMemo(() => {
    const raw = parseFloat(String(creditAmount).replace(/,/g, ''));
    return Number.isFinite(raw) ? raw : 0;
  }, [creditAmount]);

  const settlementTotal = useMemo(() => {
    if (resolutionType === 'credit') return creditNum;
    if (resolutionType === 'replacement') return replacementTotal;
    return creditNum + replacementTotal;
  }, [resolutionType, creditNum, replacementTotal]);

  const loadPo = useCallback(async () => {
    if (!poId || !user?.company_id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: poData, error: poErr } = await supabase
        .from('purchase_orders')
        .select(
          'id, po_number, total_amount, status, workflow_status, po_order_kind, source_rebate_id, warehouse_location_id, key_account_client_id, client:key_account_clients(client_name)'
        )
        .eq('id', poId)
        .eq('company_id', user.company_id)
        .eq('company_account_type', 'Key Accounts')
        .maybeSingle();
      if (poErr) throw poErr;
      if (!poData) {
        toast({ variant: 'destructive', title: 'PO not found' });
        navigate('/key-accounts/rebates');
        return;
      }
      const row = normalizePoRow(poData);
      if (isRebateDerivedPurchaseOrder(row)) {
        toast({
          variant: 'destructive',
          title: 'Not eligible',
          description:
            'Rebates cannot be created from rebate replacement or top-up purchase orders. Choose the original delivered PO.',
        });
        navigate('/key-accounts/rebates');
        return;
      }
      if (!isDeliveredKeyAccountOrder(row)) {
        toast({
          variant: 'destructive',
          title: 'Not delivered',
          description: 'Rebates can only be created for delivered POs.',
        });
        navigate('/key-accounts/purchase-orders');
        return;
      }
      setPo(row);
      setWarehouseLocationId(row.warehouse_location_id);

      const { data: itemData, error: itemErr } = await supabase
        .from('purchase_order_items')
        .select('id, variant_id, quantity, unit_price, total_price, variant:variants(name, brand:brands(name))')
        .eq('purchase_order_id', poId);
      if (itemErr) throw itemErr;

      const itemRows = (itemData || []).map(normalizePoItemRow);
      const nextLines: DisputedLine[] = [];
      for (const it of itemRows) {
        const { data: rebatedQty } = await supabase.rpc('key_account_rebated_qty_for_po_item', {
          p_po_item_id: it.id,
        });
        const already = Number(rebatedQty) || 0;
        const remaining = Math.max(0, it.quantity - already);
        if (remaining <= 0) continue;
        const brandName = it.variant?.brand?.name || '';
        const variantName = it.variant?.name || 'Item';
        nextLines.push({
          purchase_order_item_id: it.id,
          label: brandName ? `${brandName} — ${variantName}` : variantName,
          maxQty: remaining,
          unitPrice: Number(it.unit_price) || 0,
          disputedQty: remaining,
        });
      }
      setLines(nextLines);

      const { data: committed } = await supabase.rpc('key_account_rebate_committed_total', { p_po_id: poId });
      const committedNum = Number(committed) || 0;
      setRemainingCap(Math.max(0, Number(row.total_amount) - committedNum));

      const { data: hubId } = await supabase.rpc('get_linked_warehouse_company_id', {});
      if (hubId) {
        const [{ data: brandsData }, { data: variantsData }] = await Promise.all([
          supabase.from('brands').select('id, name').eq('company_id', hubId).eq('is_active', true).order('name'),
          supabase.from('variants').select('id, name, brand_id').eq('company_id', hubId).eq('is_active', true).order('name'),
        ]);
        setBrands((brandsData as BrandRow[]) || []);
        setVariants((variantsData as VariantRow[]) || []);
      }
    } catch (e: unknown) {
      toast({
        variant: 'destructive',
        title: 'Error loading PO',
        description: e instanceof Error ? e.message : 'Failed to load purchase order',
      });
    } finally {
      setLoading(false);
    }
  }, [poId, user?.company_id, toast, navigate]);

  useEffect(() => {
    void loadPo();
  }, [loadPo]);

  useEffect(() => {
    if (resolutionType === 'credit' && disputedTotal > 0 && !creditAmount) {
      setCreditAmount(disputedTotal.toFixed(2));
    }
  }, [resolutionType, disputedTotal, creditAmount]);

  const filteredVariants = useMemo(
    () => variants.filter((v) => !selectedBrandId || v.brand_id === selectedBrandId),
    [variants, selectedBrandId]
  );

  const addReplacement = () => {
    const variant = variants.find((v) => v.id === selectedVariantId);
    if (!variant || !warehouseLocationId) {
      toast({ variant: 'destructive', title: 'Select a replacement SKU' });
      return;
    }
    const qty = parseInt(repQty, 10);
    const price = parseFloat(String(repUnitPrice).replace(/,/g, ''));
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price < 0) {
      toast({ variant: 'destructive', title: 'Enter valid quantity and unit price' });
      return;
    }
    const brandName = brands.find((b) => b.id === variant.brand_id)?.name || '';
    setReplacements((prev) => [
      ...prev,
      {
        variantId: variant.id,
        label: brandName ? `${brandName} — ${variant.name}` : variant.name,
        quantity: qty,
        unitPrice: price,
      },
    ]);
    setSelectedVariantId('');
    setRepQty('1');
    setRepUnitPrice('');
  };

  const submit = async () => {
    if (!po) return;
    const activeLines = lines.filter((l) => l.disputedQty > 0);
    if (activeLines.length === 0) {
      toast({ variant: 'destructive', title: 'Select at least one line with quantity' });
      return;
    }
    if (disputedTotal <= 0) {
      toast({ variant: 'destructive', title: 'Disputed total must be greater than zero' });
      return;
    }
    if (remainingCap !== null && disputedTotal > remainingCap + 0.0001) {
      toast({
        variant: 'destructive',
        title: 'Exceeds PO cap',
        description: `Remaining rebate cap: ${formatRebateCurrency(remainingCap)}`,
      });
      return;
    }
    if (settlementTotal + 0.0001 < disputedTotal) {
      toast({
        variant: 'destructive',
        title: 'Settlement too low',
        description: 'Credit and/or replacement value must be at least the disputed line total.',
      });
      return;
    }
    if (resolutionType !== 'credit' && replacements.length === 0) {
      toast({ variant: 'destructive', title: 'Add replacement items' });
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('create_key_account_rebate', {
        p_po_id: po.id,
        p_reason_code: reasonCode,
        p_notes: notes.trim() || null,
        p_resolution_type: resolutionType,
        p_lines: activeLines.map((l) => ({
          purchase_order_item_id: l.purchase_order_item_id,
          disputed_quantity: l.disputedQty,
        })),
        p_replacements: replacements.map((r) => ({
          variant_id: r.variantId,
          warehouse_location_id: warehouseLocationId,
          quantity: r.quantity,
          unit_price: r.unitPrice,
          total_price: Math.round(r.quantity * r.unitPrice * 100) / 100,
        })),
        p_credit_amount: resolutionType === 'replacement' ? 0 : creditNum,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to create rebate');

      toast({
        title: 'Rebate submitted',
        description: `${data.rebate_number} is pending approval.`,
      });
      navigate('/key-accounts/rebates');
    } catch (e: unknown) {
      toast({
        variant: 'destructive',
        title: 'Submit failed',
        description: e instanceof Error ? e.message : 'Could not create rebate',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!poId || !po) {
    return (
      <div className="p-4 md:p-6 max-w-lg mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/key-accounts/rebates')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Create Rebate</h1>
            <p className="text-sm text-muted-foreground">Choose a delivered purchase order to continue.</p>
          </div>
        </div>
        <Button className="w-full sm:w-auto" onClick={() => setPickPoOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Select delivered PO
        </Button>
        <SelectDeliveredPoForRebateDialog open={pickPoOpen} onOpenChange={setPickPoOpen} />
        {!poId && loading ? null : poId && !po && !loading ? (
          <p className="text-sm text-destructive">This purchase order was not found or is not eligible for a rebate.</p>
        ) : null}
      </div>
    );
  }

  const clientName = po.client?.client_name || 'Client';

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/key-accounts/rebates')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Create rebate</h1>
          <p className="text-sm text-muted-foreground">
            {po.po_number} · {clientName}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">PO summary</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">PO total: </span>
            <span className="font-medium">{formatRebateCurrency(po.total_amount)}</span>
          </div>
          {remainingCap !== null && (
            <div>
              <span className="text-muted-foreground">Remaining rebate cap: </span>
              <span className="font-medium">{formatRebateCurrency(remainingCap)}</span>
            </div>
          )}
          {warehouseLocationId && (
            <div>
              <span className="text-muted-foreground">Warehouse: </span>
              <span className="font-medium">Same as source PO (inherited)</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Disputed lines</CardTitle>
        </CardHeader>
        <CardContent>
          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">All line items on this PO are fully rebated.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Max qty</TableHead>
                  <TableHead className="text-right">Unit price</TableHead>
                  <TableHead className="text-right w-28">Dispute qty</TableHead>
                  <TableHead className="text-right">Line total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => (
                  <TableRow key={line.purchase_order_item_id}>
                    <TableCell>{line.label}</TableCell>
                    <TableCell className="text-right">{line.maxQty}</TableCell>
                    <TableCell className="text-right">{formatRebateCurrency(line.unitPrice)}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={0}
                        max={line.maxQty}
                        className="ml-auto w-24 text-right"
                        value={line.disputedQty}
                        onChange={(e) => {
                          const v = Math.min(line.maxQty, Math.max(0, parseInt(e.target.value, 10) || 0));
                          setLines((prev) =>
                            prev.map((l) =>
                              l.purchase_order_item_id === line.purchase_order_item_id
                                ? { ...l, disputedQty: v }
                                : l
                            )
                          );
                        }}
                      />
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatRebateCurrency(line.disputedQty * line.unitPrice)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <div className="mt-4 text-right font-semibold">
            Disputed total: {formatRebateCurrency(disputedTotal)}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reason & resolution</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Reason</Label>
              <Select value={reasonCode} onValueChange={(v) => setReasonCode(v as KeyAccountRebateReasonCode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REBATE_REASON_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Resolution</Label>
              <Select
                value={resolutionType}
                onValueChange={(v) => setResolutionType(v as KeyAccountRebateResolutionType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REBATE_RESOLUTION_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Client complaint details…" />
          </div>

          {(resolutionType === 'credit' || resolutionType === 'mixed') && (
            <div className="space-y-2 max-w-xs">
              <Label>Credit amount (₱)</Label>
              <Input
                value={creditAmount}
                onChange={(e) => setCreditAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
          )}

          {(resolutionType === 'replacement' || resolutionType === 'mixed') && (
            <div className="space-y-4 border-t pt-4">
              <Label className="text-base">Replacement items</Label>
              <p className="text-xs text-muted-foreground">
                Items ship from the same warehouse as the original PO.
              </p>
              <div className="grid gap-3 md:grid-cols-4 items-end">
                <div className="space-y-2">
                  <Label>Brand</Label>
                  <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Brand" />
                    </SelectTrigger>
                    <SelectContent>
                      {brands.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Variant</Label>
                  <Select value={selectedVariantId} onValueChange={setSelectedVariantId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select SKU" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredVariants.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Qty</Label>
                  <Input type="number" min={1} value={repQty} onChange={(e) => setRepQty(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Unit price</Label>
                  <Input value={repUnitPrice} onChange={(e) => setRepUnitPrice(e.target.value)} placeholder="0.00" />
                </div>
                <Button type="button" variant="secondary" onClick={addReplacement}>
                  <Plus className="h-4 w-4 mr-1" /> Add
                </Button>
              </div>
              {replacements.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {replacements.map((r, idx) => (
                      <TableRow key={`${r.variantId}-${idx}`}>
                        <TableCell>{r.label}</TableCell>
                        <TableCell className="text-right">{r.quantity}</TableCell>
                        <TableCell className="text-right">{formatRebateCurrency(r.unitPrice)}</TableCell>
                        <TableCell className="text-right">
                          {formatRebateCurrency(r.quantity * r.unitPrice)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setReplacements((prev) => prev.filter((_, i) => i !== idx))}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <div className="text-right text-sm">
                Replacement total: <span className="font-semibold">{formatRebateCurrency(replacementTotal)}</span>
              </div>
            </div>
          )}

          <div className="rounded-md bg-muted/50 p-3 text-sm flex flex-wrap justify-between gap-2">
            <span>Settlement (credit + replacement)</span>
            <span className="font-bold">{formatRebateCurrency(settlementTotal)}</span>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate('/key-accounts/rebates')}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={submitting || lines.length === 0}>
          {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Submit for approval
        </Button>
      </div>
    </div>
  );
}
