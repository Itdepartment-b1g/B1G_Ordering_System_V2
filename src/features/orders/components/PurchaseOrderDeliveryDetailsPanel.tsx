import { useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { keyAccountDispatchWorkflowActive } from '@/features/key-accounts/keyAccountDispatchWorkflow';
import { useAuth } from '@/features/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ChevronsUpDown, Expand, FileText, Loader2, PackageCheck, Receipt, Truck, XCircle } from 'lucide-react';
import type { PurchaseOrder } from '../types';
import { generateAndOpenDrPdf } from '../dr/generateDrPdf';
import { generateAndOpenReceiveReceiptPdf } from '../dr/generateReceiveReceiptPdf';
import { PoBuyerReceiveDialog, type PoReceiveLine } from './PoBuyerReceiveDialog';
import { PoBuyerCancelDialog } from './PoBuyerCancelDialog';
import {
  SHORTFALL_REASON_LABELS,
  type ShortfallReason,
} from '@/features/orders/deliveryDiscrepancyShared';

function resolveWarehouseLocationName(
  loc: { name: string } | { name: string }[] | null | undefined
): string | null {
  if (!loc) return null;
  const row = Array.isArray(loc) ? loc[0] : loc;
  return row?.name?.trim() || null;
}

export type PurchaseOrderDeliveryRow = {
  id: string;
  warehouse_location_id?: string | null;
  warehouse_locations?: { name: string } | { name: string }[] | null;
  created_by_profile:
    | {
        full_name: string | null;
        email: string | null;
      }
    | Array<{
        full_name: string | null;
        email: string | null;
      }>
    | null;
  rider_name: string | null;
  rider_plate_number: string | null;
  rider_photo_url: string | null;
  warehouse_signature_url: string | null;
  status: string | null;
  dr_number?: string | null;
  notes?: string | null;
  buyer_notes?: string | null;
  buyer_proof_url?: string | null;
  buyer_signature_url?: string | null;
  proof_of_delivery_url?: string | null;
  cancel_proof_url?: string | null;
  cancel_signature_url?: string | null;
  cancel_notes?: string | null;
  cancelled_at?: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
};

type DeliveryItemRow = {
  delivery_id: string;
  variant_id: string;
  quantity_dispatched: number;
  quantity_received: number;
  variants?:
    | { name: string | null; brands?: { name: string | null } | { name: string | null }[] | null }
    | Array<{
        name: string | null;
        brands?: { name: string | null } | { name: string | null }[] | null;
      }>
    | null;
};

/** Warehouse transfer POs with dispatch / receive activity. */
export function purchaseOrderDeliveryDetailsEnabled(order: {
  fulfillment_type?: string | null;
  workflow_status?: string | null;
  status?: string | null;
}): boolean {
  if (order.fulfillment_type !== 'warehouse_transfer') return false;
  if (keyAccountDispatchWorkflowActive(order.workflow_status)) return true;
  const status = String(order.status || '');
  return (
    status === 'fulfilled' ||
    status === 'partially_fulfilled' ||
    status === 'delivered'
  );
}

export function keyAccountDeliveryDetailsEnabled(order: {
  workflow_status?: string | null;
  status?: string | null;
  key_account_client_id?: string | null;
  fulfillment_type?: string | null;
}): boolean {
  if (!order.key_account_client_id) return false;
  return purchaseOrderDeliveryDetailsEnabled(order);
}

interface PurchaseOrderDeliveryDetailsPanelProps {
  purchaseOrderId: string;
  enabled: boolean;
  warehouseNamesById?: Record<string, string>;
  purchaseOrder?: PurchaseOrder | null;
  filterWarehouseLocationId?: string | null;
  /** Buying company users can receive dispatched DRs. */
  allowBuyerReceive?: boolean;
  onReceiveSuccess?: () => void;
}

export function PurchaseOrderDeliveryDetailsPanel({
  purchaseOrderId,
  enabled,
  warehouseNamesById = {},
  purchaseOrder = null,
  filterWarehouseLocationId = null,
  allowBuyerReceive = false,
  onReceiveSuccess,
}: PurchaseOrderDeliveryDetailsPanelProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [printingDrId, setPrintingDrId] = useState<string | null>(null);
  const [printingRrId, setPrintingRrId] = useState<string | null>(null);
  const [rows, setRows] = useState<PurchaseOrderDeliveryRow[]>([]);
  const [itemsByDelivery, setItemsByDelivery] = useState<Record<string, DeliveryItemRow[]>>({});
  const [discrepanciesByDelivery, setDiscrepanciesByDelivery] = useState<
    Record<
      string,
      Array<{
        variant_id: string;
        quantity: number;
        reason: string;
        status: string;
      }>
    >
  >({});
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveDelivery, setReceiveDelivery] = useState<PurchaseOrderDeliveryRow | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelDelivery, setCancelDelivery] = useState<PurchaseOrderDeliveryRow | null>(null);
  const [fullImage, setFullImage] = useState<{ url: string; title: string } | null>(null);

  const isBuyerCompany =
    !!user?.company_id &&
    !!purchaseOrder?.company_id &&
    String(user.company_id) === String(purchaseOrder.company_id) &&
    user.role !== 'warehouse';

  const printDrForRow = async (row: PurchaseOrderDeliveryRow, warehouseName: string) => {
    if (!purchaseOrder || !row.dr_number || !row.warehouse_location_id) return;
    setPrintingDrId(row.id);
    try {
      const dispatchLines = (itemsByDelivery[row.id] || [])
        .filter((l) => Number(l.quantity_dispatched) > 0)
        .map((item) => {
          const variant = Array.isArray(item.variants) ? item.variants[0] : item.variants;
          const brand = variant?.brands
            ? Array.isArray(variant.brands)
              ? variant.brands[0]
              : variant.brands
            : null;
          return {
            variant_id: item.variant_id,
            brand_name: brand?.name ?? null,
            variant_name: variant?.name ?? null,
            quantity: item.quantity_dispatched,
          };
        });
      await generateAndOpenDrPdf(purchaseOrder, {
        drNumber: row.dr_number,
        warehouseLocationId: row.warehouse_location_id,
        warehouseLocationName: warehouseName,
        dispatchLines,
        cancelled: row.status === 'cancelled',
      });
    } catch (e) {
      console.warn('[DR] print failed', e);
    } finally {
      setPrintingDrId(null);
    }
  };

  const receiveLinesDetailed = (deliveryId: string) => {
    const discs = discrepanciesByDelivery[deliveryId] || [];
    return (itemsByDelivery[deliveryId] || []).map((item) => {
      const variant = Array.isArray(item.variants) ? item.variants[0] : item.variants;
      const brand = variant?.brands
        ? Array.isArray(variant.brands)
          ? variant.brands[0]
          : variant.brands
        : null;
      const disc = discs.find((d) => d.variant_id === item.variant_id);
      const shortfallReason =
        disc?.reason && disc.reason in SHORTFALL_REASON_LABELS
          ? SHORTFALL_REASON_LABELS[disc.reason as ShortfallReason]
          : disc?.reason || null;
      return {
        brand_name: brand?.name ?? null,
        variant_name: variant?.name ?? null,
        quantity_dispatched: item.quantity_dispatched,
        quantity_received: item.quantity_received,
        shortfall_reason: shortfallReason,
      };
    });
  };

  const printReceiveReceiptForRow = async (row: PurchaseOrderDeliveryRow, warehouseName: string) => {
    if (!purchaseOrder || !row.dr_number || !row.warehouse_location_id) return;
    const lines = receiveLinesDetailed(row.id).filter(
      (l) => Number(l.quantity_received) > 0 || Number(l.quantity_dispatched) > 0
    );
    if (lines.length === 0) return;
    setPrintingRrId(row.id);
    try {
      await generateAndOpenReceiveReceiptPdf(purchaseOrder, {
        drNumber: row.dr_number,
        warehouseLocationId: row.warehouse_location_id,
        warehouseLocationName: warehouseName,
        lines,
        receivedAt: row.delivered_at,
        buyerNotes: row.buyer_notes,
        buyerSignatureUrl: row.buyer_signature_url,
      });
    } catch (e) {
      console.warn('[RR] print failed', e);
    } finally {
      setPrintingRrId(null);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: qErr } = await supabase
        .from('purchase_order_deliveries')
        .select(
          'id,warehouse_location_id,warehouse_locations:warehouse_location_id(name),created_by_profile:profiles!purchase_order_deliveries_created_by_fkey(full_name,email),rider_name,rider_plate_number,rider_photo_url,warehouse_signature_url,status,dr_number,notes,buyer_notes,buyer_proof_url,buyer_signature_url,proof_of_delivery_url,cancel_proof_url,cancel_signature_url,cancel_notes,cancelled_at,dispatched_at,delivered_at'
        )
        .eq('purchase_order_id', purchaseOrderId)
        .order('dispatched_at', { ascending: false });
      if (qErr) throw qErr;
      const deliveryRows = (data as PurchaseOrderDeliveryRow[]) || [];
      setRows(deliveryRows);

      const deliveryIds = deliveryRows.map((r) => r.id);
      if (deliveryIds.length > 0) {
        const { data: itemData, error: itemErr } = await supabase
          .from('purchase_order_delivery_items')
          .select(
            'delivery_id,variant_id,quantity_dispatched,quantity_received,variants:variant_id(name,brands:brand_id(name))'
          )
          .in('delivery_id', deliveryIds);
        if (itemErr) {
          // Table may not exist until migration is applied
          console.warn('[PO delivery items]', itemErr);
          setItemsByDelivery({});
        } else {
          const map: Record<string, DeliveryItemRow[]> = {};
          for (const row of (itemData || []) as DeliveryItemRow[]) {
            (map[row.delivery_id] ||= []).push(row);
          }
          setItemsByDelivery(map);
        }

        const { data: discData, error: discErr } = await supabase
          .from('purchase_order_delivery_discrepancies')
          .select('delivery_id,variant_id,quantity,reason,status')
          .in('delivery_id', deliveryIds);
        if (discErr) {
          // Table may not exist until migration is applied
          console.warn('[PO delivery discrepancies]', discErr);
          setDiscrepanciesByDelivery({});
        } else {
          const dMap: typeof discrepanciesByDelivery = {};
          for (const row of (discData || []) as Array<{
            delivery_id: string;
            variant_id: string;
            quantity: number;
            reason: string;
            status: string;
          }>) {
            (dMap[row.delivery_id] ||= []).push(row);
          }
          setDiscrepanciesByDelivery(dMap);
        }
      } else {
        setItemsByDelivery({});
        setDiscrepanciesByDelivery({});
      }
      setLoaded(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load delivery details');
    } finally {
      setLoading(false);
    }
  }, [purchaseOrderId]);

  const openReceive = (row: PurchaseOrderDeliveryRow) => {
    setReceiveDelivery(row);
    setReceiveOpen(true);
  };

  const openCancel = (row: PurchaseOrderDeliveryRow) => {
    setCancelDelivery(row);
    setCancelOpen(true);
  };

  const receiveLinesFor = (deliveryId: string): PoReceiveLine[] => {
    return (itemsByDelivery[deliveryId] || []).map((item) => {
      const variant = Array.isArray(item.variants) ? item.variants[0] : item.variants;
      const brand = variant?.brands
        ? Array.isArray(variant.brands)
          ? variant.brands[0]
          : variant.brands
        : null;
      return {
        variant_id: item.variant_id,
        quantity_dispatched: item.quantity_dispatched,
        brand_name: brand?.name ?? null,
        variant_name: variant?.name ?? null,
      };
    });
  };

  if (!enabled) return null;

  return (
    <>
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Truck className="h-4 w-4" />
            Dispatch & delivery
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Collapsible
            open={open}
            onOpenChange={(next) => {
              setOpen(next);
              if (next) void load();
            }}
          >
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="w-full justify-between gap-2">
                <span>View dispatch record</span>
                <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-60" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3 space-y-3 data-[state=closed]:animate-none">
              {loading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading…
                </div>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
              {!loading && loaded && rows.length === 0 && (
                <p className="text-sm text-muted-foreground">No dispatch record found for this PO.</p>
              )}
              {rows.map((row) => {
                const profile = Array.isArray(row.created_by_profile)
                  ? row.created_by_profile[0]
                  : row.created_by_profile;
                const actorName = profile?.full_name || profile?.email || '—';
                const fulfillingWarehouse =
                  resolveWarehouseLocationName(row.warehouse_locations) ||
                  (row.warehouse_location_id
                    ? warehouseNamesById[row.warehouse_location_id]
                    : null) ||
                  '—';
                const showPrintDr =
                  !!purchaseOrder &&
                  !!row.dr_number &&
                  !!row.warehouse_location_id &&
                  (!filterWarehouseLocationId ||
                    String(filterWarehouseLocationId) === String(row.warehouse_location_id));
                const itemLines = itemsByDelivery[row.id] || [];
                const isKeyAccount =
                  String(purchaseOrder?.company_account_type || '') === 'Key Accounts' ||
                  !!purchaseOrder?.key_account_client_id;
                const canReceive =
                  !isKeyAccount &&
                  allowBuyerReceive &&
                  isBuyerCompany &&
                  row.status === 'dispatched' &&
                  itemLines.length > 0;
                const canCancel = canReceive;
                const showPrintRr =
                  !isKeyAccount &&
                  showPrintDr &&
                  (row.status === 'received' || row.status === 'delivered') &&
                  itemLines.some((l) => Number(l.quantity_received) > 0);
                const proofUrl = row.buyer_proof_url || row.proof_of_delivery_url;
                const isCancelled = row.status === 'cancelled';
                const cancelProofUrl = row.cancel_proof_url || null;

                return (
                  <div key={row.id} className="rounded-md border bg-muted/20 p-3 space-y-3 text-sm">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Fulfilled / signed by</Label>
                          <p className="font-medium">{actorName}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Rider</Label>
                          <p className="font-medium">{row.rider_name || '—'}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Status</Label>
                          <p className="font-medium capitalize">{row.status || '—'}</p>
                        </div>
                        {row.dr_number ? (
                          <div>
                            <Label className="text-xs text-muted-foreground">DR number</Label>
                            <p className="font-medium font-mono">{row.dr_number}</p>
                          </div>
                        ) : null}
                      </div>
                      <div className="space-y-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Warehouse</Label>
                          <p className="font-medium">{fulfillingWarehouse}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Plate</Label>
                          <p className="font-medium">{row.rider_plate_number || '—'}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Dispatched</Label>
                          <p className="font-medium">
                            {row.dispatched_at ? new Date(row.dispatched_at).toLocaleString() : '—'}
                          </p>
                        </div>
                        {!isKeyAccount && row.delivered_at ? (
                          <div>
                            <Label className="text-xs text-muted-foreground">Received</Label>
                            <p className="font-medium">
                              {new Date(row.delivered_at).toLocaleString()}
                            </p>
                          </div>
                        ) : null}
                        {!isKeyAccount && isCancelled && row.cancelled_at ? (
                          <div>
                            <Label className="text-xs text-muted-foreground">Cancelled</Label>
                            <p className="font-medium">
                              {new Date(row.cancelled_at).toLocaleString()}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {!isKeyAccount && itemLines.length > 0 ? (
                      <div className="rounded border bg-background p-2 space-y-1">
                        <Label className="text-xs text-muted-foreground">Items quantities dispatched / received</Label>
                        {itemLines.map((item) => {
                          const variant = Array.isArray(item.variants)
                            ? item.variants[0]
                            : item.variants;
                          const brand = variant?.brands
                            ? Array.isArray(variant.brands)
                              ? variant.brands[0]
                              : variant.brands
                            : null;
                          const label =
                            [brand?.name, variant?.name].filter(Boolean).join(' · ') ||
                            item.variant_id.slice(0, 8);
                          const pending = item.quantity_dispatched - item.quantity_received;
                          const openDisc = (discrepanciesByDelivery[row.id] || []).find(
                            (d) => d.variant_id === item.variant_id && d.status === 'open'
                          );
                          const resolvedRedeliver = (discrepanciesByDelivery[row.id] || []).find(
                            (d) =>
                              d.variant_id === item.variant_id && d.status === 'resolved_redeliver'
                          );
                          const resolvedWriteOffReplace = (discrepanciesByDelivery[row.id] || []).find(
                            (d) =>
                              d.variant_id === item.variant_id &&
                              d.status === 'resolved_write_off_replace'
                          );
                          const resolvedWriteOff = (discrepanciesByDelivery[row.id] || []).find(
                            (d) =>
                              d.variant_id === item.variant_id && d.status === 'resolved_write_off'
                          );
                          let pendingLabel = '';
                          if (row.status === 'received' && pending > 0) {
                            if (openDisc) pendingLabel = ` · ${pending} investigating`;
                            else if (resolvedWriteOff) pendingLabel = ` · ${pending} written off`;
                            else if (resolvedWriteOffReplace)
                              pendingLabel = ` · ${pending} replace opened`;
                            else if (resolvedRedeliver) pendingLabel = ` · ${pending} reopened`;
                            else pendingLabel = ` · ${pending} short`;
                          }
                          return (
                            <div
                              key={`${item.delivery_id}-${item.variant_id}`}
                              className="flex justify-between gap-2 text-xs"
                            >
                              <span className="truncate">{label}</span>
                              <span className="shrink-0 font-medium">
                                recv {item.quantity_received}/{item.quantity_dispatched}
                                {pendingLabel}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}

                    {(() => {
                      const hasWarehouseProof =
                        !!row.rider_photo_url ||
                        !!row.warehouse_signature_url ||
                        !!row.notes?.trim();
                      const hasBuyerProof = isCancelled
                        ? !!cancelProofUrl ||
                          !!row.cancel_signature_url ||
                          !!row.cancel_notes?.trim()
                        : !!proofUrl || !!row.buyer_signature_url || !!row.buyer_notes?.trim();
                      if (!hasWarehouseProof && (isKeyAccount || !hasBuyerProof)) return null;

                      const warehouseCol = (
                        <div className="rounded border bg-background p-2.5 space-y-3">
                          <Label className="text-xs font-semibold text-foreground">Warehouse</Label>
                          {row.rider_photo_url ? (
                            <div>
                              <div className="flex items-center justify-between gap-2">
                                <Label className="text-xs text-muted-foreground">Rider photo</Label>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() =>
                                    setFullImage({ url: row.rider_photo_url!, title: 'Rider photo' })
                                  }
                                >
                                  <Expand className="h-3.5 w-3.5 mr-1" />
                                  View full
                                </Button>
                              </div>
                              <button
                                type="button"
                                className="mt-1 block w-full rounded border overflow-hidden bg-muted/20 cursor-pointer hover:opacity-90 transition-opacity"
                                onClick={() =>
                                  setFullImage({ url: row.rider_photo_url!, title: 'Rider photo' })
                                }
                                title="View full size"
                              >
                                <img
                                  src={row.rider_photo_url}
                                  alt="Rider"
                                  className="max-h-36 w-full object-contain"
                                />
                              </button>
                            </div>
                          ) : null}
                          {row.warehouse_signature_url ? (
                            <div>
                              <Label className="text-xs text-muted-foreground">Warehouse signature</Label>
                              <div className="mt-1 rounded border overflow-hidden bg-muted/20">
                                <img
                                  src={row.warehouse_signature_url}
                                  alt="Warehouse signature"
                                  className="max-h-28 w-full object-contain"
                                />
                              </div>
                            </div>
                          ) : null}
                          {row.notes?.trim() ? (
                            <div>
                              <Label className="text-xs text-muted-foreground">Dispatch notes</Label>
                              <p className="text-sm mt-0.5 whitespace-pre-wrap">{row.notes}</p>
                            </div>
                          ) : null}
                          {!hasWarehouseProof ? (
                            <p className="text-xs text-muted-foreground">No warehouse proof yet.</p>
                          ) : null}
                        </div>
                      );

                      if (isKeyAccount) {
                        return <div className="space-y-3">{warehouseCol}</div>;
                      }

                      return (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {warehouseCol}
                          <div className="rounded border bg-background p-2.5 space-y-3">
                            <Label className="text-xs font-semibold text-foreground">
                              {isCancelled ? 'Buyer cancel' : 'Buyer'}
                            </Label>
                            {isCancelled ? (
                              <>
                                {cancelProofUrl ? (
                                  <div>
                                    <div className="flex items-center justify-between gap-2">
                                      <Label className="text-xs text-muted-foreground">Cancel proof</Label>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2 text-xs"
                                        onClick={() =>
                                          setFullImage({ url: cancelProofUrl, title: 'Cancel proof' })
                                        }
                                      >
                                        <Expand className="h-3.5 w-3.5 mr-1" />
                                        View full
                                      </Button>
                                    </div>
                                    <button
                                      type="button"
                                      className="mt-1 block w-full rounded border overflow-hidden bg-muted/20 cursor-pointer hover:opacity-90 transition-opacity"
                                      onClick={() =>
                                        setFullImage({ url: cancelProofUrl, title: 'Cancel proof' })
                                      }
                                      title="View full size"
                                    >
                                      <img
                                        src={cancelProofUrl}
                                        alt="Cancel proof"
                                        className="max-h-36 w-full object-contain"
                                      />
                                    </button>
                                  </div>
                                ) : null}
                                {row.cancel_signature_url ? (
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Cancel signature</Label>
                                    <div className="mt-1 rounded border overflow-hidden bg-muted/20">
                                      <img
                                        src={row.cancel_signature_url}
                                        alt="Cancel signature"
                                        className="max-h-28 w-full object-contain"
                                      />
                                    </div>
                                  </div>
                                ) : null}
                                {row.cancel_notes?.trim() ? (
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Cancel notes</Label>
                                    <p className="text-sm mt-0.5 whitespace-pre-wrap">{row.cancel_notes}</p>
                                  </div>
                                ) : null}
                                {!hasBuyerProof ? (
                                  <p className="text-xs text-muted-foreground">No cancel proof on file.</p>
                                ) : null}
                              </>
                            ) : (
                              <>
                                {proofUrl ? (
                                  <div>
                                    <div className="flex items-center justify-between gap-2">
                                      <Label className="text-xs text-muted-foreground">Receive proof</Label>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2 text-xs"
                                        onClick={() =>
                                          setFullImage({ url: proofUrl, title: 'Receive proof' })
                                        }
                                      >
                                        <Expand className="h-3.5 w-3.5 mr-1" />
                                        View full
                                      </Button>
                                    </div>
                                    <button
                                      type="button"
                                      className="mt-1 block w-full rounded border overflow-hidden bg-muted/20 cursor-pointer hover:opacity-90 transition-opacity"
                                      onClick={() =>
                                        setFullImage({ url: proofUrl, title: 'Receive proof' })
                                      }
                                      title="View full size"
                                    >
                                      <img
                                        src={proofUrl}
                                        alt="Buyer proof"
                                        className="max-h-36 w-full object-contain"
                                      />
                                    </button>
                                  </div>
                                ) : null}
                                {row.buyer_signature_url ? (
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Buyer signature</Label>
                                    <div className="mt-1 rounded border overflow-hidden bg-muted/20">
                                      <img
                                        src={row.buyer_signature_url}
                                        alt="Buyer signature"
                                        className="max-h-28 w-full object-contain"
                                      />
                                    </div>
                                  </div>
                                ) : null}
                                {row.buyer_notes?.trim() ? (
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Buyer notes</Label>
                                    <p className="text-sm mt-0.5 whitespace-pre-wrap">{row.buyer_notes}</p>
                                  </div>
                                ) : null}
                                {!hasBuyerProof ? (
                                  <p className="text-xs text-muted-foreground">Awaiting buyer receive.</p>
                                ) : null}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                    <div className="flex flex-wrap gap-2">
                      {showPrintDr ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={printingDrId === row.id}
                          onClick={() => void printDrForRow(row, fulfillingWarehouse)}
                        >
                          {printingDrId === row.id ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <Receipt className="h-4 w-4 mr-1" />
                          )}
                          Print DR
                        </Button>
                      ) : null}
                      {showPrintRr ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={printingRrId === row.id}
                          onClick={() => void printReceiveReceiptForRow(row, fulfillingWarehouse)}
                        >
                          {printingRrId === row.id ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <FileText className="h-4 w-4 mr-1" />
                          )}
                          Print received receipt
                        </Button>
                      ) : null}
                      {canReceive ? (
                        <Button size="sm" onClick={() => openReceive(row)}>
                          <PackageCheck className="h-4 w-4 mr-1" />
                          Receive
                        </Button>
                      ) : null}
                      {canCancel ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => openCancel(row)}
                          title="Refuse this DR and return stock to warehouse"
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Cancel DR
                        </Button>
                      ) : null}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Proof images use signed URLs; if they fail to load later, links may have expired and
                      need refresh from storage.
                    </p>
                  </div>
                );
              })}
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      {receiveDelivery && purchaseOrder?.company_id ? (
        <PoBuyerReceiveDialog
          open={receiveOpen}
          onOpenChange={setReceiveOpen}
          deliveryId={receiveDelivery.id}
          purchaseOrderId={purchaseOrderId}
          companyId={String(purchaseOrder.company_id)}
          drNumber={receiveDelivery.dr_number}
          lines={receiveLinesFor(receiveDelivery.id)}
          purchaseOrder={purchaseOrder}
          warehouseLocationId={receiveDelivery.warehouse_location_id}
          warehouseLocationName={
            resolveWarehouseLocationName(receiveDelivery.warehouse_locations) ||
            (receiveDelivery.warehouse_location_id
              ? warehouseNamesById[receiveDelivery.warehouse_location_id]
              : null) ||
            'Warehouse'
          }
          onSuccess={() => {
            setLoaded(false);
            void load();
            onReceiveSuccess?.();
          }}
        />
      ) : null}

      {cancelDelivery && purchaseOrder?.company_id ? (
        <PoBuyerCancelDialog
          open={cancelOpen}
          onOpenChange={setCancelOpen}
          deliveryId={cancelDelivery.id}
          purchaseOrderId={purchaseOrderId}
          companyId={String(purchaseOrder.company_id)}
          drNumber={cancelDelivery.dr_number}
          lines={receiveLinesFor(cancelDelivery.id)}
          warehouseLocationName={
            resolveWarehouseLocationName(cancelDelivery.warehouse_locations) ||
            (cancelDelivery.warehouse_location_id
              ? warehouseNamesById[cancelDelivery.warehouse_location_id]
              : null) ||
            'Warehouse'
          }
          onSuccess={() => {
            setLoaded(false);
            void load();
            onReceiveSuccess?.();
          }}
        />
      ) : null}

      <Dialog
        open={!!fullImage}
        onOpenChange={(next) => {
          if (!next) setFullImage(null);
        }}
      >
        <DialogContent className="max-w-4xl w-[95vw] p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle>{fullImage?.title || 'Image'}</DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-6">
            {fullImage?.url ? (
              <div className="rounded-md border bg-muted/20 overflow-auto max-h-[80vh] flex items-center justify-center p-2">
                <img
                  src={fullImage.url}
                  alt={fullImage.title}
                  className="max-w-full max-h-[75vh] w-auto h-auto object-contain"
                />
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
