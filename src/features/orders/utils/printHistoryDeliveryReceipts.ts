import { supabase } from '@/lib/supabase';
import { formatShortfallReasonLabel, type ShortfallReason } from '@/features/orders/deliveryDiscrepancyShared';
import type { PurchaseOrder } from '../types';
import { generateAndOpenDrPdf } from '../dr/generateDrPdf';
import { generateAndOpenReceiveReceiptPdf } from '../dr/generateReceiveReceiptPdf';

function resolveWarehouseName(
  loc: { name: string } | { name: string }[] | null | undefined
): string {
  if (!loc) return 'Warehouse';
  const row = Array.isArray(loc) ? loc[0] : loc;
  return row?.name?.trim() || 'Warehouse';
}

async function loadDeliveryForReceipt(deliveryId: string) {
  const { data: row, error } = await supabase
    .from('purchase_order_deliveries')
    .select(
      'id,dr_number,warehouse_location_id,status,buyer_notes,buyer_signature_url,delivered_at,warehouse_locations:warehouse_location_id(name)'
    )
    .eq('id', deliveryId)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error('Delivery not found');
  if (!row.dr_number) throw new Error('This delivery has no DR number yet');
  if (!row.warehouse_location_id) throw new Error('Warehouse location missing for this delivery');

  return {
    id: String(row.id),
    drNumber: String(row.dr_number),
    warehouseLocationId: String(row.warehouse_location_id),
    warehouseLocationName: resolveWarehouseName(
      row.warehouse_locations as { name: string } | { name: string }[] | null
    ),
    status: String(row.status || ''),
    buyerNotes: (row.buyer_notes as string | null) ?? null,
    buyerSignatureUrl: (row.buyer_signature_url as string | null) ?? null,
    deliveredAt: (row.delivered_at as string | null) ?? null,
  };
}

/** Open Delivery Receipt PDF for a history dispatch event's delivery. */
export async function printDrReceiptForDelivery(
  purchaseOrder: PurchaseOrder,
  deliveryId: string
): Promise<void> {
  const delivery = await loadDeliveryForReceipt(deliveryId);

  const { data: itemData, error: itemErr } = await supabase
    .from('purchase_order_delivery_items')
    .select(
      'variant_id,quantity_dispatched,variants:variant_id(name,brands:brand_id(name))'
    )
    .eq('delivery_id', deliveryId);
  if (itemErr) throw itemErr;

  const dispatchLines = ((itemData || []) as Array<{
    variant_id: string;
    quantity_dispatched: number;
    variants?:
      | { name: string | null; brands?: { name: string | null } | { name: string | null }[] | null }
      | Array<{
          name: string | null;
          brands?: { name: string | null } | { name: string | null }[] | null;
        }>
      | null;
  }>)
    .filter((item) => Number(item.quantity_dispatched) > 0)
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
        quantity: Number(item.quantity_dispatched) || 0,
      };
    });

  if (dispatchLines.length === 0) throw new Error('No dispatched items on this DR');

  await generateAndOpenDrPdf(purchaseOrder, {
    drNumber: delivery.drNumber,
    warehouseLocationId: delivery.warehouseLocationId,
    warehouseLocationName: delivery.warehouseLocationName,
    dispatchLines,
    cancelled: delivery.status === 'cancelled',
  });
}

/** Open Received Receipt PDF for a history receive event's delivery. */
export async function printReceiveReceiptForDelivery(
  purchaseOrder: PurchaseOrder,
  deliveryId: string
): Promise<void> {
  const delivery = await loadDeliveryForReceipt(deliveryId);

  const [{ data: itemData, error: itemErr }, { data: discData }] = await Promise.all([
    supabase
      .from('purchase_order_delivery_items')
      .select(
        'variant_id,quantity_dispatched,quantity_received,variants:variant_id(name,brands:brand_id(name))'
      )
      .eq('delivery_id', deliveryId),
    supabase
      .from('purchase_order_delivery_discrepancies')
      .select('variant_id,reason,buyer_notes')
      .eq('delivery_id', deliveryId),
  ]);
  if (itemErr) throw itemErr;

  const discs = (discData || []) as Array<{
    variant_id: string;
    reason: string;
    buyer_notes: string | null;
  }>;

  const lines = ((itemData || []) as Array<{
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
  }>)
    .filter(
      (item) =>
        Number(item.quantity_received) > 0 || Number(item.quantity_dispatched) > 0
    )
    .map((item) => {
      const variant = Array.isArray(item.variants) ? item.variants[0] : item.variants;
      const brand = variant?.brands
        ? Array.isArray(variant.brands)
          ? variant.brands[0]
          : variant.brands
        : null;
      const disc = discs.find((d) => String(d.variant_id) === String(item.variant_id));
      const shortfallReason = disc?.reason
        ? formatShortfallReasonLabel(disc.reason as ShortfallReason, disc.buyer_notes)
        : null;
      return {
        brand_name: brand?.name ?? null,
        variant_name: variant?.name ?? null,
        quantity_dispatched: Number(item.quantity_dispatched) || 0,
        quantity_received: Number(item.quantity_received) || 0,
        shortfall_reason: shortfallReason,
      };
    });

  if (lines.length === 0) throw new Error('No received items on this DR');

  await generateAndOpenReceiveReceiptPdf(purchaseOrder, {
    drNumber: delivery.drNumber,
    warehouseLocationId: delivery.warehouseLocationId,
    warehouseLocationName: delivery.warehouseLocationName,
    lines,
    receivedAt: delivery.deliveredAt,
    buyerNotes: delivery.buyerNotes,
    buyerSignatureUrl: delivery.buyerSignatureUrl,
  });
}
