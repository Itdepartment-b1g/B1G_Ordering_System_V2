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
  return: 'Order rejected by finance — stock returned to bag',
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
      return 'Order cancelled — stock returned to bag';
    }
    if (
      notes.includes('rejected order') ||
      notes.includes('order rejection') ||
      from.includes('order_rejection') ||
      notes.includes('rejected')
    ) {
      return 'Order rejected by finance — stock returned to bag';
    }
    return STOCK_MOVEMENT_TYPE_LABELS.return;
  }

  return STOCK_MOVEMENT_TYPE_LABELS[transactionType] ?? transactionType.replace(/_/g, ' ');
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
