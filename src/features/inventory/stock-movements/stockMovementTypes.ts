/**
 * Normalize inventory_transactions rows into display categories / signed deltas.
 * Quantities in the DB are positive magnitudes; direction comes from type (+ notes/locations).
 * Display labels are UI-only — DB transaction_type values stay unchanged.
 */

export type StockMovementCategory =
  | 'inbound'
  | 'outbound'
  | 'order'
  | 'transfer'
  | 'return'
  | 'disposal'
  | 'adjustment'
  | 'reserve'
  | 'other';

export type StockMovementDirection = 'in' | 'out' | 'transfer' | 'neutral';

export const STOCK_MOVEMENT_CATEGORY_LABELS: Record<StockMovementCategory, string> = {
  inbound: 'Stock in',
  outbound: 'Stock out',
  order: 'Order',
  transfer: 'Transfer',
  return: 'Return',
  disposal: 'Disposal',
  adjustment: 'Adjustment',
  reserve: 'Reserved',
  other: 'Other',
};

/** Default human labels for DB transaction_type values (no business context). */
export const STOCK_MOVEMENT_TYPE_LABELS: Record<string, string> = {
  purchase_order_received: 'Supplier PO received',
  allocated_to_agent: 'Stock allocated',
  order_fulfilled: 'Client order (sale)',
  adjustment: 'Stock adjustment',
  return: 'Order rejected by finance — stock returned to inventory',
  return_to_main: 'Returned to Super Admin',
  warehouse_transfer_out: 'Sent to client warehouse',
  warehouse_transfer_in: 'Received from warehouse transfer',
  warehouse_allocate_to_sub: 'Main allocated to sub-warehouse',
  warehouse_return_from_sub: 'Sub-warehouse returned to main',
  rebate_return_in: 'Rebate return restocked',
  rebate_return_disposed: 'Rebate return disposed',
  warehouse_stock_receive: 'Warehouse stock request received',
  warehouse_return_in: 'Warehouse return restocked',
  warehouse_return_disposed: 'Warehouse return disposed',
  internal_stock_request_reserve: 'Sub-stock request reserved',
  internal_stock_request_receive: 'Sub-stock request received',
  internal_stock_request_short_release: 'Sub-stock shortage released',
  client_return_out: 'Standard Account return submitted',
  client_return_cancel_in: 'Standard Account return cancelled',
  client_return_in: 'Standard Account return restocked',
  client_return_disposed: 'Standard Account return disposed',
  client_order_return: 'Client return',
  tl_stock_transfer_out: 'TL transfer dispatched',
  tl_stock_transfer_in: 'TL transfer received',
};

const TYPE_CATEGORY: Record<string, StockMovementCategory> = {
  purchase_order_received: 'inbound',
  warehouse_stock_receive: 'inbound',
  warehouse_transfer_in: 'inbound',
  rebate_return_in: 'inbound',
  warehouse_return_in: 'inbound',
  client_return_in: 'inbound',
  client_return_cancel_in: 'inbound',
  internal_stock_request_receive: 'inbound',
  tl_stock_transfer_in: 'inbound',
  return: 'inbound',

  warehouse_transfer_out: 'outbound',
  client_return_out: 'outbound',
  tl_stock_transfer_out: 'outbound',

  order_fulfilled: 'order',

  allocated_to_agent: 'transfer',
  warehouse_allocate_to_sub: 'transfer',

  return_to_main: 'return',
  warehouse_return_from_sub: 'return',
  client_order_return: 'return',

  rebate_return_disposed: 'disposal',
  warehouse_return_disposed: 'disposal',
  client_return_disposed: 'disposal',

  adjustment: 'adjustment',

  internal_stock_request_reserve: 'reserve',
  internal_stock_request_short_release: 'reserve',
};

export function getStockMovementCategory(transactionType: string): StockMovementCategory {
  return TYPE_CATEGORY[transactionType] ?? 'other';
}

export type StockMovementLabelContext = {
  fromLocation?: string | null;
  toLocation?: string | null;
  notes?: string | null;
};

export type ClientOrderReturnKind = 'restock' | 'disposal' | 'exchange' | 'other';

export function clientOrderReturnKind(
  context?: StockMovementLabelContext
): ClientOrderReturnKind {
  const notes = (context?.notes ?? '').toLowerCase();
  const to = (context?.toLocation ?? '').toLowerCase();
  if (notes.includes('change item') || to === 'client_exchange' || to.includes('client_exchange')) {
    return 'exchange';
  }
  if (notes.includes('disposal') || notes.includes('disposed')) return 'disposal';
  if (notes.includes('restock')) return 'restock';
  return 'other';
}

function clientOrderReturnFateLabel(kind: ClientOrderReturnKind): string {
  switch (kind) {
    case 'restock':
      return 'restocked';
    case 'disposal':
      return 'disposed';
    case 'exchange':
      return 'exchange issued';
    default:
      return 'client return';
  }
}

function joinNoteParts(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join(' · ');
}

/** Manila-local allocation date for Notes (matches clickable deep-link label). */
function formatAllocationNoteDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Pull RT-… from ledger notes when the lookup map misses. */
function extractStandardAccountReturnNumber(raw: string | null | undefined): string {
  const text = (raw || '').trim();
  if (!text) return '';
  const match = text.match(/\b(RT-[A-Z0-9]+(?:-[A-Z0-9]+)*)\b/i);
  return match?.[1]?.toUpperCase() ?? '';
}

/**
 * Notes line for client returns: fate + CR + ORD + client.
 * Example: "Restocked to sellable inventory · CR-2026-… · ORD-2026-… · Client Name"
 */
export function formatClientOrderReturnNotes(opts: {
  returnNumber?: string | null;
  orderNumber?: string | null;
  clientName?: string | null;
  quantity?: number | null;
  transactionType: string;
  fromLocation?: string | null;
  toLocation?: string | null;
  fallbackNotes?: string | null;
}): string {
  const kind = clientOrderReturnKind({
    fromLocation: opts.fromLocation,
    toLocation: opts.toLocation,
    notes: opts.fallbackNotes,
  });
  const qty =
    typeof opts.quantity === 'number' && Number.isFinite(opts.quantity)
      ? opts.quantity
      : null;

  let action: string;
  switch (kind) {
    case 'restock':
      action =
        qty != null
          ? `Restocked ${qty} unit${qty === 1 ? '' : 's'} to sellable inventory`
          : 'Restocked to sellable inventory';
      break;
    case 'disposal':
      action =
        qty != null
          ? `Disposed ${qty} unit${qty === 1 ? '' : 's'} from client return`
          : 'Disposed from client return';
      break;
    case 'exchange':
      action =
        qty != null
          ? `Issued ${qty} exchange unit${qty === 1 ? '' : 's'} to client`
          : 'Issued exchange items to client';
      break;
    default:
      action =
        qty != null
          ? `Client return · ${qty} unit${qty === 1 ? '' : 's'}`
          : 'Client return';
  }

  const cr = (opts.returnNumber ?? '').trim();
  const ord = (opts.orderNumber ?? '').trim();
  const client = (opts.clientName ?? '').trim();

  const composed = joinNoteParts([
    action,
    cr || null,
    ord || null,
    client || null,
  ]);
  if (composed) return composed;

  const fallback = (opts.fallbackNotes ?? '').trim();
  return fallback || `Client return — ${clientOrderReturnFateLabel(kind)}`;
}

export type StockMovementDisplayNotesInput = {
  transactionType: string;
  quantity: number;
  fromLabel: string;
  toLabel: string;
  fromLocationRaw?: string | null;
  toLocationRaw?: string | null;
  referenceType?: string | null;
  orderNumber?: string | null;
  returnNumber?: string | null;
  requestNumber?: string | null;
  /** Standard Account warehouse return number (RT-…). */
  standardReturnNumber?: string | null;
  clientName?: string | null;
  rawNotes?: string | null;
  /** Transaction timestamp — used for allocation date in notes. */
  createdAt?: string | null;
};

/**
 * User-facing Notes cell: specific action + people/docs, not raw ledger jargon.
 */
export function buildStockMovementDisplayNotes(
  input: StockMovementDisplayNotesInput
): string {
  const qty = Number(input.quantity) || 0;
  const unitLabel = `${qty} unit${qty === 1 ? '' : 's'}`;
  const from = (input.fromLabel || '').trim();
  const to = (input.toLabel || '').trim();
  const client = (input.clientName || '').trim();
  const ord = (input.orderNumber || '').trim();
  const cr = (input.returnNumber || '').trim();
  const tlreq = (input.requestNumber || '').trim();
  const rt =
    (input.standardReturnNumber || '').trim() ||
    extractStandardAccountReturnNumber(input.rawNotes);
  const raw = (input.rawNotes || '').trim();
  const type = input.transactionType;

  if (type === 'client_order_return' || input.referenceType === 'client_order_return') {
    return formatClientOrderReturnNotes({
      returnNumber: cr,
      orderNumber: ord,
      clientName: client,
      quantity: qty,
      transactionType: type,
      fromLocation: input.fromLocationRaw,
      toLocation: input.toLocationRaw,
      fallbackNotes: raw,
    });
  }

  if (type === 'order_fulfilled') {
    return joinNoteParts([
      `Sold ${unitLabel}${client ? ` to ${client}` : ' to client'}`,
      ord || null,
    ]);
  }

  if (type === 'allocated_to_agent') {
    const fromParsed = parseInventoryLocation(input.fromLocationRaw);
    const toParsed = parseInventoryLocation(input.toLocationRaw);
    const allocatedOn = formatAllocationNoteDate(input.createdAt);
    let action: string;
    if (fromParsed?.kind === 'main' && toParsed?.kind === 'agent') {
      action = `Allocated ${unitLabel} from Main inventory to ${to || 'Team Leader'}`;
    } else if (fromParsed?.kind === 'agent' && toParsed?.kind === 'agent') {
      action = `Allocated ${unitLabel} from ${from || 'Team Leader'} to ${to || 'agent'}`;
    } else if (from && to && from !== '—') {
      action = `Allocated ${unitLabel} from ${from} to ${to}`;
    } else {
      action = `Allocated ${unitLabel}`;
    }
    return joinNoteParts([action, allocatedOn || null]);
  }

  if (type === 'tl_stock_transfer_out') {
    return joinNoteParts([
      `Dispatched ${unitLabel} on TL transfer (on the way)`,
      tlreq || null,
    ]);
  }
  if (type === 'tl_stock_transfer_in') {
    return joinNoteParts([
      `Received ${unitLabel} from TL transfer into inventory`,
      tlreq || null,
    ]);
  }

  if (type === 'return') {
    const lower = raw.toLowerCase();
    if (lower.includes('cancel')) {
      return joinNoteParts([`Restored ${unitLabel} after order was cancelled`, ord || null]);
    }
    return joinNoteParts([
      `Restored ${unitLabel} after finance rejected the order`,
      ord || null,
    ]);
  }

  if (type === 'return_to_main') {
    return `Returned ${unitLabel} from ${from || 'field inventory'} to Main inventory`;
  }

  if (type === 'purchase_order_received') {
    return `Received ${unitLabel} from supplier PO`;
  }
  if (type === 'warehouse_stock_receive') {
    return `Received ${unitLabel} from warehouse stock request`;
  }
  if (type === 'warehouse_transfer_out') {
    return `Sent ${unitLabel} out on warehouse transfer`;
  }
  if (type === 'warehouse_transfer_in') {
    return `Received ${unitLabel} from warehouse transfer`;
  }
  if (type === 'warehouse_allocate_to_sub') {
    return `Allocated ${unitLabel} from Main to sub-warehouse${to && to !== '—' ? ` (${to})` : ''}`;
  }
  if (type === 'warehouse_return_from_sub') {
    return `Returned ${unitLabel} from sub-warehouse to Main`;
  }

  if (type === 'client_return_out') {
    return joinNoteParts([
      `Submitted Standard Account return · ${unitLabel} left inventory`,
      rt || null,
    ]);
  }
  if (type === 'client_return_cancel_in') {
    return joinNoteParts([
      `Cancelled Standard Account return · ${unitLabel} restored to inventory`,
      rt || null,
    ]);
  }
  if (type === 'client_return_in' || type === 'rebate_return_in' || type === 'warehouse_return_in') {
    return joinNoteParts([`Restocked ${unitLabel} from return`, rt || null]);
  }
  if (
    type === 'client_return_disposed' ||
    type === 'rebate_return_disposed' ||
    type === 'warehouse_return_disposed'
  ) {
    return joinNoteParts([`Disposed ${unitLabel} from return`, rt || null]);
  }

  if (type === 'adjustment') {
    const adj = inferAdjustmentDirection(raw);
    if (adj === 'in') return raw || `Increased inventory by ${unitLabel}`;
    if (adj === 'out') return raw || `Decreased inventory by ${unitLabel}`;
    return raw || `Adjusted inventory by ${unitLabel}`;
  }

  if (type === 'internal_stock_request_reserve') {
    return `Reserved ${unitLabel} for sub-stock request`;
  }
  if (type === 'internal_stock_request_receive') {
    return `Received ${unitLabel} from sub-stock request`;
  }
  if (type === 'internal_stock_request_short_release') {
    return `Released ${unitLabel} reserved for short sub-stock receive`;
  }

  // Keep meaningful free-text notes when we don't have a stronger template.
  if (raw) return raw;
  if (from && to && from !== '—' && to !== '—') {
    return `Moved ${unitLabel} from ${from} to ${to}`;
  }
  return `Recorded ${unitLabel}`;
}

/**
 * UI-only label for a transaction. DB values are unchanged.
 * Uses from/to when helpful (e.g. Super Admin → TL vs TL → agent).
 */
export function getStockMovementTypeLabel(
  transactionType: string,
  context?: StockMovementLabelContext
): string {
  if (transactionType === 'allocated_to_agent') {
    const from = parseInventoryLocation(context?.fromLocation);
    const to = parseInventoryLocation(context?.toLocation);
    if (from?.kind === 'main' && to?.kind === 'agent') {
      return 'Super Admin allocated to Team Leader';
    }
    if (from?.kind === 'agent' && to?.kind === 'agent') {
      return 'Team Leader allocated to agent';
    }
    return STOCK_MOVEMENT_TYPE_LABELS.allocated_to_agent;
  }

  if (transactionType === 'adjustment') {
    const adj = inferAdjustmentDirection(context?.notes);
    if (adj === 'in') return 'Stock adjustment (increase)';
    if (adj === 'out') return 'Stock adjustment (decrease)';
  }

  if (transactionType === 'return') {
    const notes = (context?.notes ?? '').toLowerCase();
    const from = (context?.fromLocation ?? '').toLowerCase();
    if (
      notes.includes('cancelled') ||
      notes.includes('canceled') ||
      from.includes('order_cancel')
    ) {
      return 'Order cancelled — stock returned to inventory';
    }
    if (
      notes.includes('rejected order') ||
      notes.includes('order rejection') ||
      from.includes('order_rejection') ||
      notes.includes('rejected')
    ) {
      return 'Order rejected by finance — stock returned to inventory';
    }
    return STOCK_MOVEMENT_TYPE_LABELS.return;
  }

  if (transactionType === 'client_order_return') {
    const kind = clientOrderReturnKind(context);
    if (kind === 'restock') return 'Client return — restocked';
    if (kind === 'disposal') return 'Client return — disposed';
    if (kind === 'exchange') return 'Client return — exchange issued';
    return 'Client return';
  }

  return STOCK_MOVEMENT_TYPE_LABELS[transactionType] ?? transactionType.replace(/_/g, ' ');
}

/**
 * Short “why this happened” line under the type title.
 * Prefer notes when they already explain the reason.
 */
export function getStockMovementTypeDescription(
  transactionType: string,
  context?: StockMovementLabelContext
): string {
  const notes = (context?.notes ?? '').trim();

  if (transactionType === 'allocated_to_agent') {
    const from = parseInventoryLocation(context?.fromLocation);
    const to = parseInventoryLocation(context?.toLocation);
    if (from?.kind === 'main' && to?.kind === 'agent') {
      return 'Stock left Main inventory and was added to the Team Leader inventory.';
    }
    if (from?.kind === 'agent' && to?.kind === 'agent') {
      return 'Stock left the Team Leader inventory and was added to the agent inventory.';
    }
    return 'Stock was allocated from one inventory to another.';
  }

  if (transactionType === 'tl_stock_transfer_out') {
    return 'Stock left this inventory and is on the way to another Team Leader.';
  }
  if (transactionType === 'tl_stock_transfer_in') {
    return 'Stock from a TL transfer arrived and was added to this inventory.';
  }

  if (transactionType === 'order_fulfilled') {
    return 'Stock was sold to a client and removed from the agent inventory.';
  }

  if (transactionType === 'client_order_return') {
    const kind = clientOrderReturnKind(context);
    if (kind === 'restock') {
      return 'Returned client stock was added back to sellable inventory.';
    }
    if (kind === 'disposal') {
      return 'Returned client stock was recorded as disposal / returned stock.';
    }
    if (kind === 'exchange') {
      return 'Exchange items were issued to the client from the agent inventory.';
    }
    return 'Client return stock movement.';
  }

  if (transactionType === 'client_return_in' || transactionType === 'rebate_return_in') {
    return notes || 'Returned stock was restocked into inventory.';
  }
  if (
    transactionType === 'client_return_disposed' ||
    transactionType === 'rebate_return_disposed' ||
    transactionType === 'warehouse_return_disposed'
  ) {
    return notes || 'Returned stock was disposed and removed from sellable inventory.';
  }
  if (transactionType === 'client_return_out') {
    return notes || 'Standard Account return was submitted and stock left the inventory.';
  }
  if (transactionType === 'client_return_cancel_in') {
    return notes || 'Standard Account return was cancelled and stock came back to the inventory.';
  }

  if (transactionType === 'return') {
    return notes || 'Stock was restored to inventory after an order reject or cancel.';
  }
  if (transactionType === 'return_to_main') {
    return notes || 'Stock was returned from field inventory back to Super Admin / Main.';
  }

  if (transactionType === 'purchase_order_received') {
    return notes || 'Supplier delivery was received into inventory.';
  }
  if (transactionType === 'warehouse_stock_receive') {
    return notes || 'Warehouse stock request was received into this location.';
  }
  if (transactionType === 'warehouse_transfer_out') {
    return notes || 'Stock was sent out as a warehouse transfer.';
  }
  if (transactionType === 'warehouse_transfer_in') {
    return notes || 'Stock was received from a warehouse transfer.';
  }
  if (transactionType === 'warehouse_allocate_to_sub') {
    return notes || 'Main allocated stock to a sub-warehouse.';
  }
  if (transactionType === 'warehouse_return_from_sub') {
    return notes || 'Sub-warehouse returned stock to main.';
  }

  if (transactionType === 'adjustment') {
    const adj = inferAdjustmentDirection(context?.notes);
    if (adj === 'in') return notes || 'Manual stock increase.';
    if (adj === 'out') return notes || 'Manual stock decrease.';
    return notes || 'Manual stock adjustment.';
  }

  if (transactionType === 'internal_stock_request_reserve') {
    return notes || 'Stock was reserved for a sub-warehouse stock request.';
  }
  if (transactionType === 'internal_stock_request_receive') {
    return notes || 'Reserved sub-stock request was received.';
  }
  if (transactionType === 'internal_stock_request_short_release') {
    return notes || 'Unused reserved stock was released after a short receive.';
  }

  return notes || 'Inventory movement recorded in the ledger.';
}

/** Single-line product display: "BRAND VARIANT". */
export function formatStockMovementProductName(
  brandName: string | null | undefined,
  variantName: string | null | undefined
): string {
  const brand = (brandName ?? '').trim();
  const variant = (variantName ?? '').trim();
  if (brand && variant && brand !== '—' && variant !== '—') {
    if (brand.toLowerCase() === variant.toLowerCase()) return brand;
    return `${brand} ${variant}`;
  }
  if (variant && variant !== '—') return variant;
  if (brand && brand !== '—') return brand;
  return '—';
}

/** Infer in/out for adjustments from notes when from/to are absent. */
export function inferAdjustmentDirection(notes: string | null | undefined): 'in' | 'out' | null {
  const text = (notes ?? '').toLowerCase();
  if (text.includes('adjustment in')) return 'in';
  if (text.includes('adjustment out')) return 'out';
  return null;
}

export function getStockMovementDirection(
  transactionType: string,
  notes?: string | null
): StockMovementDirection {
  const category = getStockMovementCategory(transactionType);

  if (category === 'inbound' || category === 'return') return 'in';
  if (category === 'outbound' || category === 'disposal' || category === 'order') return 'out';
  if (category === 'transfer') return 'transfer';
  if (category === 'reserve') return 'neutral';

  if (category === 'adjustment') {
    const adj = inferAdjustmentDirection(notes);
    if (adj === 'in') return 'in';
    if (adj === 'out') return 'out';
    return 'neutral';
  }

  return 'neutral';
}

/**
 * Signed quantity for summary chips.
 * Transfers and reserves contribute 0 to net; inbound/return positive; outbound/disposal negative.
 */
export function getSignedQuantity(
  transactionType: string,
  quantity: number,
  notes?: string | null
): number {
  const qty = Math.abs(quantity);
  const direction = getStockMovementDirection(transactionType, notes);
  if (direction === 'in') return qty;
  if (direction === 'out') return -qty;
  return 0;
}

export type StockMovementQtyBalance = {
  before: number;
  after: number;
  side: 'from' | 'to';
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Pick which location's before/after to show in the Qty cell.
 * Prefer scoped bag when filtering; else inbound→to, outbound→from, transfer→from.
 */
export function resolveStockMovementQtyBalance(input: {
  direction: StockMovementDirection;
  fromLocationRaw?: string | null;
  toLocationRaw?: string | null;
  fromQtyBefore?: number | null;
  fromQtyAfter?: number | null;
  toQtyBefore?: number | null;
  toQtyAfter?: number | null;
  scopeAgentId?: string | null;
  scopeWarehouseLocationId?: string | null;
}): StockMovementQtyBalance | null {
  const fromOk =
    isFiniteNumber(input.fromQtyBefore) && isFiniteNumber(input.fromQtyAfter);
  const toOk = isFiniteNumber(input.toQtyBefore) && isFiniteNumber(input.toQtyAfter);

  const agentNeedle = input.scopeAgentId
    ? `agent_inventory:${input.scopeAgentId}`
    : null;
  const warehouseNeedle = input.scopeWarehouseLocationId
    ? `warehouse_location:${input.scopeWarehouseLocationId}`
    : null;

  if (agentNeedle || warehouseNeedle) {
    if (
      fromOk &&
      (input.fromLocationRaw === agentNeedle || input.fromLocationRaw === warehouseNeedle)
    ) {
      return { before: input.fromQtyBefore!, after: input.fromQtyAfter!, side: 'from' };
    }
    if (
      toOk &&
      (input.toLocationRaw === agentNeedle || input.toLocationRaw === warehouseNeedle)
    ) {
      return { before: input.toQtyBefore!, after: input.toQtyAfter!, side: 'to' };
    }
  }

  if (input.direction === 'in' && toOk) {
    return { before: input.toQtyBefore!, after: input.toQtyAfter!, side: 'to' };
  }
  if (input.direction === 'out' && fromOk) {
    return { before: input.fromQtyBefore!, after: input.fromQtyAfter!, side: 'from' };
  }
  if (fromOk) {
    return { before: input.fromQtyBefore!, after: input.fromQtyAfter!, side: 'from' };
  }
  if (toOk) {
    return { before: input.toQtyBefore!, after: input.toQtyAfter!, side: 'to' };
  }
  return null;
}

function formatQtyNumber(n: number): string {
  return Number.isInteger(n)
    ? String(n)
    : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** e.g. "200 → 210 (+10)" or fallback "+10" / "−10". */
export function formatStockMovementQtyDisplay(input: {
  quantity: number;
  direction: StockMovementDirection;
  fromLocationRaw?: string | null;
  toLocationRaw?: string | null;
  fromQtyBefore?: number | null;
  fromQtyAfter?: number | null;
  toQtyBefore?: number | null;
  toQtyAfter?: number | null;
  scopeAgentId?: string | null;
  scopeWarehouseLocationId?: string | null;
}): string {
  const qty = Math.abs(Number(input.quantity) || 0);
  const balance = resolveStockMovementQtyBalance(input);
  if (!balance) {
    if (input.direction === 'in') return `+${formatQtyNumber(qty)}`;
    if (input.direction === 'out') return `−${formatQtyNumber(qty)}`;
    return formatQtyNumber(qty);
  }

  const delta = balance.after - balance.before;
  const deltaText =
    delta > 0
      ? `+${formatQtyNumber(delta)}`
      : delta < 0
        ? `−${formatQtyNumber(Math.abs(delta))}`
        : formatQtyNumber(0);

  return `${formatQtyNumber(balance.before)} → ${formatQtyNumber(balance.after)} (${deltaText})`;
}

export type ParsedLocationKind =
  | 'main'
  | 'warehouse'
  | 'agent'
  | 'in_transit'
  | 'return_hold'
  | 'order_rejection'
  | 'client_exchange'
  | 'client_sale'
  | 'technical'
  | 'unknown';

export type ParsedLocation = {
  raw: string;
  kind: ParsedLocationKind;
  id: string | null;
  /** Prefix before ':' for technical keys like return_hold / client_return_stock_holds. */
  technicalPrefix?: string | null;
};

/** User-facing labels for technical location prefixes — never show the UUID. */
const TECHNICAL_LOCATION_LABELS: Record<string, string> = {
  in_transit: 'TL transfer (on the way)',
  return_hold: 'Held for return',
  order_rejection: 'Rejected / cancelled order',
  client_return_stock_holds: 'Returned stock (with agent)',
  client_return: 'Client return',
  client_exchange: 'Client (exchange)',
  client_sale: 'Client',
};

const UUID_SUFFIX_RE =
  /:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const UUID_IN_TEXT_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export function parseInventoryLocation(raw: string | null | undefined): ParsedLocation | null {
  if (!raw?.trim()) return null;
  const value = raw.trim();

  if (value === 'main_inventory') {
    return { raw: value, kind: 'main', id: null };
  }

  if (value.startsWith('warehouse_location:')) {
    return { raw: value, kind: 'warehouse', id: value.slice('warehouse_location:'.length) || null };
  }

  if (value.startsWith('agent_inventory:')) {
    return { raw: value, kind: 'agent', id: value.slice('agent_inventory:'.length) || null };
  }

  if (value.startsWith('in_transit:')) {
    return { raw: value, kind: 'in_transit', id: value.slice('in_transit:'.length) || null };
  }

  if (value.startsWith('return_hold:')) {
    return { raw: value, kind: 'return_hold', id: value.slice('return_hold:'.length) || null };
  }

  if (value === 'order_rejection' || value.startsWith('order_rejection')) {
    return { raw: value, kind: 'order_rejection', id: null };
  }

  if (value === 'client_exchange') {
    return { raw: value, kind: 'client_exchange', id: null };
  }

  if (value === 'client_sale') {
    return { raw: value, kind: 'client_sale', id: null };
  }

  // Any other prefix:uuid technical key — keep prefix only for display.
  if (value.includes(':')) {
    const prefix = value.split(':')[0]?.trim() || '';
    if (prefix) {
      return {
        raw: value,
        kind: 'technical',
        id: value.slice(prefix.length + 1) || null,
        technicalPrefix: prefix,
      };
    }
  }

  return { raw: value, kind: 'unknown', id: null };
}

export function locationTouchesWarehouseId(
  fromLocation: string | null | undefined,
  toLocation: string | null | undefined,
  warehouseLocationId: string
): boolean {
  const needle = `warehouse_location:${warehouseLocationId}`;
  return fromLocation === needle || toLocation === needle;
}

export function locationTouchesAgentId(
  fromLocation: string | null | undefined,
  toLocation: string | null | undefined,
  agentId: string
): boolean {
  const needle = `agent_inventory:${agentId}`;
  return fromLocation === needle || toLocation === needle;
}

export function formatLocationLabel(
  parsed: ParsedLocation | null,
  opts: {
    locationNameById: Map<string, string>;
    profileNameById: Map<string, string>;
    mainLocationId?: string | null;
    /** When location is client_exchange, show this client name. */
    clientName?: string | null;
  }
): string {
  if (!parsed) return '—';

  if (parsed.kind === 'main') {
    const mainName = opts.mainLocationId
      ? opts.locationNameById.get(opts.mainLocationId)
      : undefined;
    return mainName ? `Main: ${mainName}` : 'Main inventory';
  }

  if (parsed.kind === 'warehouse' && parsed.id) {
    const name = opts.locationNameById.get(parsed.id);
    if (!name) return 'Warehouse location';
    if (opts.mainLocationId && parsed.id === opts.mainLocationId) {
      return `Main: ${name}`;
    }
    return name;
  }

  if (parsed.kind === 'agent' && parsed.id) {
    return opts.profileNameById.get(parsed.id) ?? 'Agent / TL';
  }

  if (parsed.kind === 'in_transit') {
    return TECHNICAL_LOCATION_LABELS.in_transit;
  }

  if (parsed.kind === 'return_hold') {
    return TECHNICAL_LOCATION_LABELS.return_hold;
  }

  if (parsed.kind === 'order_rejection') {
    return TECHNICAL_LOCATION_LABELS.order_rejection;
  }

  if (parsed.kind === 'client_exchange' || parsed.kind === 'client_sale') {
    const clientName = opts.clientName?.trim();
    // Role tag shows "Client"; name alone is enough here.
    if (clientName) return clientName;
    return parsed.kind === 'client_sale'
      ? TECHNICAL_LOCATION_LABELS.client_sale
      : TECHNICAL_LOCATION_LABELS.client_exchange;
  }

  if (parsed.kind === 'technical' && parsed.technicalPrefix) {
    const mapped = TECHNICAL_LOCATION_LABELS[parsed.technicalPrefix];
    if (mapped) return mapped;
    const friendly = parsed.technicalPrefix.replace(/_/g, ' ').trim();
    return friendly ? friendly.charAt(0).toUpperCase() + friendly.slice(1) : '—';
  }

  // Never leak raw UUIDs into the UI.
  if (UUID_SUFFIX_RE.test(parsed.raw)) {
    return friendlyTechnicalLocationLabel(parsed.raw);
  }

  return parsed.raw.replace(/_/g, ' ');
}

/** Short role/party tags for From / To / Done by cells. */
export function getStockMovementRoleTag(role?: string | null): string | null {
  switch (role) {
    case 'super_admin':
      return 'Super Admin';
    case 'admin':
      return 'Admin';
    case 'system_administrator':
      return 'System Admin';
    case 'team_leader':
      return 'TL';
    case 'manager':
      return 'Manager';
    case 'mobile_sales':
    case 'sales_agent':
      return 'Mobile Sales';
    case 'warehouse':
      return 'Warehouse';
    case 'finance':
      return 'Finance';
    case 'accounting':
      return 'Accounting';
    case 'executive':
      return 'Executive';
    default:
      return null;
  }
}

/**
 * Party tag for a From/To location (Client, TL, Mobile Sales, Super Admin, …).
 */
export function getLocationPartyTag(
  parsed: ParsedLocation | null,
  opts?: {
    profileRoleById?: Map<string, string>;
    mainLocationId?: string | null;
  }
): string | null {
  if (!parsed) return null;

  if (parsed.kind === 'client_exchange' || parsed.kind === 'client_sale') return 'Client';
  if (parsed.kind === 'in_transit') return 'In transit';
  if (parsed.kind === 'return_hold') {
    if (parsed.id && opts?.profileRoleById?.has(parsed.id)) {
      return getStockMovementRoleTag(opts.profileRoleById.get(parsed.id)) ?? 'Return hold';
    }
    return 'Return hold';
  }
  if (parsed.kind === 'order_rejection') return 'Order';
  if (parsed.kind === 'main') return 'Super Admin';
  if (parsed.kind === 'warehouse') {
    if (opts?.mainLocationId && parsed.id === opts.mainLocationId) return 'Super Admin';
    return 'Warehouse';
  }
  if (parsed.kind === 'agent' && parsed.id) {
    return getStockMovementRoleTag(opts?.profileRoleById?.get(parsed.id)) ?? 'Agent';
  }
  if (parsed.kind === 'technical' && parsed.technicalPrefix === 'client_return_stock_holds') {
    return 'Client return';
  }
  return null;
}

/** Collect profile UUIDs embedded in free-text notes (e.g. allocation messages). */
export function collectUuidsFromText(value: string | null | undefined): string[] {
  if (!value?.trim()) return [];
  const ids = new Set<string>();
  for (const match of value.matchAll(UUID_IN_TEXT_RE)) {
    if (match[0]) ids.add(match[0].toLowerCase());
  }
  return Array.from(ids);
}

/**
 * Replace bare UUIDs in notes with profile names when known.
 * Keeps historical ledger notes readable without rewriting DB rows.
 */
export function formatStockMovementNotes(
  notes: string | null | undefined,
  profileNameById: Map<string, string>
): string | null {
  if (!notes?.trim()) return notes ?? null;

  return notes.replace(UUID_IN_TEXT_RE, (uuid) => {
    const name =
      profileNameById.get(uuid) ??
      profileNameById.get(uuid.toLowerCase()) ??
      null;
    return name || uuid;
  });
}

/**
 * Last-line defence for From/To cells: if a raw `prefix:uuid` string ever reaches
 * the UI (stale cache, missed parse), replace it with a plain label.
 */
export function friendlyTechnicalLocationLabel(value: string | null | undefined): string {
  const text = (value ?? '').trim();
  if (!text) return '—';

  if (text.startsWith('in_transit:')) return TECHNICAL_LOCATION_LABELS.in_transit;
  if (text.startsWith('return_hold:')) return TECHNICAL_LOCATION_LABELS.return_hold;
  if (text === 'order_rejection' || text.startsWith('order_rejection')) {
    return TECHNICAL_LOCATION_LABELS.order_rejection;
  }
  if (text === 'client_exchange' || text === 'client exchange') {
    return TECHNICAL_LOCATION_LABELS.client_exchange;
  }
  if (text === 'client_sale' || text === 'client sale') {
    return TECHNICAL_LOCATION_LABELS.client_sale;
  }
  if (text.startsWith('client_return_stock_holds:')) {
    return TECHNICAL_LOCATION_LABELS.client_return_stock_holds;
  }

  if (UUID_SUFFIX_RE.test(text)) {
    const prefix = text.split(':')[0] ?? '';
    const mapped = TECHNICAL_LOCATION_LABELS[prefix];
    if (mapped) return mapped;
    const friendly = prefix.replace(/_/g, ' ').trim();
    return friendly ? friendly.charAt(0).toUpperCase() + friendly.slice(1) : '—';
  }

  return text;
}

export const STOCK_MOVEMENT_CATEGORY_FILTER_OPTIONS: {
  value: StockMovementCategory | 'all';
  label: string;
}[] = [
  { value: 'all', label: 'All categories' },
  { value: 'inbound', label: 'Stock in' },
  { value: 'outbound', label: 'Stock out' },
  { value: 'order', label: 'Order' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'return', label: 'Return' },
  { value: 'disposal', label: 'Disposal' },
  { value: 'adjustment', label: 'Adjustment' },
  { value: 'reserve', label: 'Reserved' },
  { value: 'other', label: 'Other' },
];
