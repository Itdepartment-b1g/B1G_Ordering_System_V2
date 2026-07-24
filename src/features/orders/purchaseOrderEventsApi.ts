import { supabase } from '@/lib/supabase';
import type {
  PurchaseOrderHistoryEvent,
  PurchaseOrderHistoryEventType,
  PurchaseOrderHistoryItem,
  PurchaseOrderHistoryLine,
  PurchaseOrderHistoryPayload,
} from './purchaseOrderHistoryTypes';
import { isPurchaseOrderHistoryEventType } from './purchaseOrderHistoryTypes';

export type LogPurchaseOrderEventInput = {
  purchaseOrderId: string;
  eventType: PurchaseOrderHistoryEventType;
  note?: string | null;
  lines?: Array<{
    variant_id: string;
    quantity: number;
    variant_name?: string | null;
    brand_name?: string | null;
    reason?: string | null;
  }>;
  shortQuantity?: number | null;
  proofImageUrl?: string | null;
  proofImagePath?: string | null;
  signatureUrl?: string | null;
  signaturePath?: string | null;
  deliveryId?: string | null;
  discrepancyId?: string | null;
  createdBy?: string | null;
  createdAt?: string | null;
};

type RawEventLine = {
  variant_id?: string;
  variantId?: string;
  quantity?: number;
  variant_name?: string;
  variantName?: string;
  brand_name?: string;
  brandName?: string;
  reason?: string;
};

type PoEventRow = {
  id: string;
  purchase_order_id: string;
  delivery_id: string | null;
  discrepancy_id?: string | null;
  event_type: string;
  note: string | null;
  lines: unknown;
  short_quantity: number | null;
  proof_image_url: string | null;
  signature_url: string | null;
  created_by: string | null;
  created_at: string;
  created_by_user?: { full_name: string | null } | null;
};

function mapLines(raw: unknown): PurchaseOrderHistoryLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const line = entry as RawEventLine;
    const variantId = String(line.variant_id || line.variantId || '');
    return {
      variantId,
      variantName: line.variant_name || line.variantName || variantId,
      brandName: line.brand_name || line.brandName || undefined,
      quantity: Number(line.quantity) || 0,
      reason: line.reason?.trim() || undefined,
    };
  });
}

function looksLikeUuid(value: string | undefined): boolean {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Fill missing brand/variant labels on event lines from current PO items. */
function enrichHistoryLinesFromItems(
  history: PurchaseOrderHistoryEvent[],
  items: PurchaseOrderHistoryItem[]
): PurchaseOrderHistoryEvent[] {
  if (items.length === 0) return history;
  const byId = new Map(items.map((item) => [item.variantId, item]));

  return history.map((event) => {
    if (!event.lines?.length) return event;
    return {
      ...event,
      lines: event.lines.map((line) => {
        const fromItem = byId.get(line.variantId);
        if (!fromItem) return line;
        const nameMissing = !line.variantName?.trim() || looksLikeUuid(line.variantName);
        const brandMissing = !line.brandName?.trim();
        if (!nameMissing && !brandMissing) return line;
        return {
          ...line,
          variantName: nameMissing ? fromItem.variantName : line.variantName,
          brandName: brandMissing ? fromItem.brandName : line.brandName,
        };
      }),
    };
  });
}

async function enrichLogLinesWithVariantNames(
  lines: LogPurchaseOrderEventInput['lines']
): Promise<LogPurchaseOrderEventInput['lines']> {
  if (!lines?.length) return lines;
  const missingIds = [
    ...new Set(
      lines
        .filter((line) => !line.variant_name?.trim() || !line.brand_name?.trim())
        .map((line) => line.variant_id)
        .filter(Boolean)
    ),
  ];
  if (missingIds.length === 0) return lines;

  const { data, error } = await supabase
    .from('variants')
    .select('id, name, brand:brands ( name )')
    .in('id', missingIds);
  if (error || !data?.length) return lines;

  const byId = new Map<string, { name: string; brandName?: string }>();
  for (const row of data) {
    const brandRaw = row.brand as { name?: string } | { name?: string }[] | null;
    const brand = Array.isArray(brandRaw) ? brandRaw[0] : brandRaw;
    byId.set(String(row.id), {
      name: row.name || String(row.id),
      brandName: brand?.name || undefined,
    });
  }

  return lines.map((line) => {
    const info = byId.get(line.variant_id);
    if (!info) return line;
    return {
      ...line,
      variant_name: line.variant_name?.trim() || info.name,
      brand_name: line.brand_name?.trim() || info.brandName || null,
    };
  });
}

function mapEvent(row: PoEventRow): PurchaseOrderHistoryEvent | null {
  if (!isPurchaseOrderHistoryEventType(row.event_type)) {
    return null;
  }

  return {
    id: row.id,
    type: row.event_type,
    at: row.created_at,
    note: row.note || undefined,
    byName: row.created_by_user?.full_name || undefined,
    lines: mapLines(row.lines),
    shortQuantity: row.short_quantity ?? undefined,
    proofImageDataUrl: row.proof_image_url || undefined,
    signatureDataUrl: row.signature_url || undefined,
    deliveryId: row.delivery_id || undefined,
    discrepancyId: row.discrepancy_id || undefined,
  };
}

/**
 * History "Dispatched" should mean unique PO fulfillment units, not raw trip total.
 * - Found & redeliver: stock restored, redispatch is the same units → do not inflate.
 * - Write off & replace: new units shipped → keep the extra dispatch qty.
 *
 * Formula: subtract min(found_resolved_qty, max(0, gross_dispatched - ordered))
 * so we only credit found qty after a redispatch actually happened.
 */
function adjustDispatchedForFoundRedeliver(
  items: PurchaseOrderHistoryItem[],
  history: PurchaseOrderHistoryEvent[]
): PurchaseOrderHistoryItem[] {
  const foundByVariant = new Map<string, number>();
  for (const event of history) {
    if (event.type !== 'shortage_resolved_redeliver') continue;
    for (const line of event.lines ?? []) {
      const variantId = String(line.variantId || '');
      if (!variantId) continue;
      foundByVariant.set(
        variantId,
        (foundByVariant.get(variantId) || 0) + Math.max(0, line.quantity)
      );
    }
  }

  if (foundByVariant.size === 0) return items;

  return items.map((item) => {
    const foundQty = foundByVariant.get(item.variantId) || 0;
    if (foundQty <= 0) return item;
    const gross = Math.max(0, item.dispatchedQuantity);
    const ordered = Math.max(0, item.orderedQuantity);
    const extraBeyondOrdered = Math.max(0, gross - ordered);
    const foundCredit = Math.min(foundQty, extraBeyondOrdered);
    return {
      ...item,
      dispatchedQuantity: Math.max(0, gross - foundCredit),
    };
  });
}

/** Fire-and-forget safe: never throws to callers; logs failures. */
export async function logPurchaseOrderEvent(input: LogPurchaseOrderEventInput): Promise<void> {
  try {
    const lines = await enrichLogLinesWithVariantNames(input.lines);
    const { error } = await supabase.rpc('log_purchase_order_event', {
      p_purchase_order_id: input.purchaseOrderId,
      p_event_type: input.eventType,
      p_note: input.note ?? null,
      p_lines: lines ?? null,
      p_short_quantity: input.shortQuantity ?? null,
      p_proof_image_url: input.proofImageUrl ?? null,
      p_proof_image_path: input.proofImagePath ?? null,
      p_signature_url: input.signatureUrl ?? null,
      p_signature_path: input.signaturePath ?? null,
      p_delivery_id: input.deliveryId ?? null,
      p_created_by: input.createdBy ?? null,
      p_created_at: input.createdAt ?? null,
      p_discrepancy_id: input.discrepancyId ?? null,
    });
    if (error) {
      console.warn('[PO history] log_purchase_order_event failed', error);
    }
  } catch (e) {
    console.warn('[PO history] log_purchase_order_event exception', e);
  }
}

export async function fetchPurchaseOrderHistory(
  purchaseOrderId: string
): Promise<PurchaseOrderHistoryPayload> {
  const { data: po, error: poErr } = await supabase
    .from('purchase_orders')
    .select(
      'id, po_number, status, workflow_status, notes, created_at, company_account_type, key_account_client_id'
    )
    .eq('id', purchaseOrderId)
    .single();
  if (poErr) throw poErr;
  if (!po) throw new Error('Purchase order not found');

  const isKeyAccount =
    String(po.company_account_type || '') === 'Key Accounts' || !!po.key_account_client_id;

  const { data: itemRows, error: itemsErr } = await supabase
    .from('purchase_order_items')
    .select(
      `
      variant_id,
      quantity,
      variant:variants (
        name,
        brand:brands ( name )
      )
    `
    )
    .eq('purchase_order_id', purchaseOrderId);
  if (itemsErr) throw itemsErr;

  const { data: deliveryRows, error: delErr } = await supabase
    .from('purchase_order_deliveries')
    .select(
      'id, status, warehouse_location_id, warehouse_locations:warehouse_location_id(name, is_main)'
    )
    .eq('purchase_order_id', purchaseOrderId);
  if (delErr) throw delErr;

  const warehouseNameByDeliveryId = new Map<string, string>();
  for (const row of deliveryRows || []) {
    const locRaw = (row as { warehouse_locations?: unknown }).warehouse_locations;
    const loc = Array.isArray(locRaw) ? locRaw[0] : locRaw;
    const name =
      loc && typeof loc === 'object' && 'name' in loc
        ? String((loc as { name?: string | null }).name || '').trim()
        : '';
    if (!name) continue;
    const isMain =
      loc && typeof loc === 'object' && 'is_main' in loc
        ? !!(loc as { is_main?: boolean | null }).is_main
        : false;
    warehouseNameByDeliveryId.set(
      String((row as { id: string }).id),
      isMain ? `${name} (Main)` : name
    );
  }

  const deliveryIds = (deliveryRows || []).map((d) => d.id);
  const cancelledDeliveryIds = new Set(
    (deliveryRows || []).filter((d) => String(d.status || '') === 'cancelled').map((d) => d.id)
  );
  const awaitingReceiveDeliveryIds = new Set(
    isKeyAccount
      ? []
      : (deliveryRows || [])
          .filter((d) => String(d.status || '') === 'dispatched')
          .map((d) => d.id)
  );

  let deliveryItemRows: Array<{
    delivery_id: string;
    variant_id: string;
    quantity_dispatched: number;
    quantity_received: number;
  }> = [];

  if (deliveryIds.length > 0) {
    const { data: diRows, error: diErr } = await supabase
      .from('purchase_order_delivery_items')
      .select('delivery_id, variant_id, quantity_dispatched, quantity_received')
      .in('delivery_id', deliveryIds);
    if (diErr) throw diErr;
    deliveryItemRows = diRows || [];
  }

  const dispatchedByVariant = new Map<string, number>();
  const receivedByVariant = new Map<string, number>();
  for (const row of deliveryItemRows) {
    if (cancelledDeliveryIds.has(row.delivery_id)) continue;
    const vid = String(row.variant_id);
    dispatchedByVariant.set(
      vid,
      (dispatchedByVariant.get(vid) || 0) + (Number(row.quantity_dispatched) || 0)
    );
    receivedByVariant.set(
      vid,
      (receivedByVariant.get(vid) || 0) + (Number(row.quantity_received) || 0)
    );
  }

  const itemsMap = new Map<string, PurchaseOrderHistoryItem>();
  for (const row of itemRows || []) {
    const variant = Array.isArray(row.variant) ? row.variant[0] : row.variant;
    const brandRaw = variant?.brand;
    const brand = Array.isArray(brandRaw) ? brandRaw[0] : brandRaw;
    const variantId = String(row.variant_id);
    const existing = itemsMap.get(variantId);
    const ordered = (existing?.orderedQuantity || 0) + (Number(row.quantity) || 0);
    itemsMap.set(variantId, {
      variantId,
      variantName: variant?.name || variantId,
      brandName: brand?.name || undefined,
      orderedQuantity: ordered,
      dispatchedQuantity: dispatchedByVariant.get(variantId) || 0,
      receivedQuantity: receivedByVariant.get(variantId) || 0,
    });
  }

  // Include variants that only appear on deliveries.
  for (const [variantId, qty] of dispatchedByVariant) {
    if (itemsMap.has(variantId)) continue;
    itemsMap.set(variantId, {
      variantId,
      variantName: variantId,
      orderedQuantity: 0,
      dispatchedQuantity: qty,
      receivedQuantity: receivedByVariant.get(variantId) || 0,
    });
  }

  const { data: eventRows, error: evErr } = await supabase
    .from('purchase_order_events')
    .select(
      `
      id,
      purchase_order_id,
      delivery_id,
      discrepancy_id,
      event_type,
      note,
      lines,
      short_quantity,
      proof_image_url,
      signature_url,
      created_by,
      created_at,
      created_by_user:profiles!purchase_order_events_created_by_fkey ( full_name )
    `
    )
    .eq('purchase_order_id', purchaseOrderId)
    .order('created_at', { ascending: true });
  if (evErr) throw evErr;

  const mappedHistory = (eventRows || [])
    .map((row) => {
      const createdByUserRaw = row.created_by_user as
        | { full_name: string | null }
        | { full_name: string | null }[]
        | null
        | undefined;
      const createdByUser = Array.isArray(createdByUserRaw)
        ? createdByUserRaw[0]
        : createdByUserRaw;
      const mapped: PoEventRow = {
        id: String(row.id),
        purchase_order_id: String(row.purchase_order_id),
        delivery_id: row.delivery_id ? String(row.delivery_id) : null,
        discrepancy_id: row.discrepancy_id ? String(row.discrepancy_id) : null,
        event_type: String(row.event_type),
        note: row.note ?? null,
        lines: row.lines,
        short_quantity: row.short_quantity ?? null,
        proof_image_url: row.proof_image_url ?? null,
        signature_url: row.signature_url ?? null,
        created_by: row.created_by ? String(row.created_by) : null,
        created_at: String(row.created_at),
        created_by_user: createdByUser ?? null,
      };
      return mapEvent(mapped);
    })
    .filter((e): e is PurchaseOrderHistoryEvent => e != null);

  const rawItems = Array.from(itemsMap.values());
  const historyWithNames = enrichHistoryLinesFromItems(mappedHistory, rawItems);
  const history = historyWithNames.map((event) => {
    const warehouseLocationName = event.deliveryId
      ? warehouseNameByDeliveryId.get(event.deliveryId)
      : undefined;
    const withWarehouse =
      warehouseLocationName &&
      (event.type === 'dispatched' ||
        event.type === 'receive_confirmed' ||
        event.type === 'cancelled' ||
        event.type === 'shortage_opened')
        ? { ...event, warehouseLocationName }
        : event;

    if (withWarehouse.type !== 'dispatched' || !withWarehouse.deliveryId) {
      return withWarehouse;
    }
    return {
      ...withWarehouse,
      awaitingReceive: awaitingReceiveDeliveryIds.has(withWarehouse.deliveryId),
    };
  });
  const items = adjustDispatchedForFoundRedeliver(rawItems, history);

  return {
    purchaseOrderId: po.id,
    poNumber: po.po_number,
    status: po.status,
    workflowStatus: po.workflow_status,
    notes: po.notes,
    createdAt: po.created_at,
    items,
    history,
  };
}
