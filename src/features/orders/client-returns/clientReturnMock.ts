/**
 * Client-order return UI mock. Flip to false before wiring the real RPC/migration.
 * Dummy data only — nothing is written to the database.
 */
export const SHOW_CLIENT_RETURN_MOCK = true;

export const CLIENT_RETURN_REASON_OPTIONS = [
  { value: 'defect', label: 'Defect' },
  { value: 'duplicate_order', label: 'Duplicate order' },
  { value: 'missing_parts', label: 'Missing parts' },
  { value: 'other', label: 'Other' },
] as const;

export type ClientReturnReasonOption = (typeof CLIENT_RETURN_REASON_OPTIONS)[number]['value'];

export type MockClientReturnLine = {
  variantName: string;
  brandName: string;
  variantType: string;
  quantity: number;
};

export type MockClientReturn = {
  id: string;
  returnNumber: string;
  orderNumber: string;
  clientName: string;
  returnedByName: string;
  returnDate: string;
  createdAt: string;
  reason: string;
  notes: string | null;
  lines: MockClientReturnLine[];
  proofLabels: string[];
  status: 'posted' | 'cancelled';
};

export const MOCK_CLIENT_RETURNS: MockClientReturn[] = [
  {
    id: 'mock-cr-1',
    returnNumber: 'CR-MTS-202609-000001',
    orderNumber: 'ORD-2026-MTS-0042',
    clientName: "Juan's Sari-Sari",
    returnedByName: 'Maria Santos',
    returnDate: '2026-09-08',
    createdAt: '2026-09-08T14:22:00+08:00',
    reason: 'defect',
    notes: 'Leak on 3 pods. Client opened the box yesterday.',
    lines: [
      { variantName: 'Flavor A', brandName: 'Demo Brand', variantType: 'flavor', quantity: 3 },
      { variantName: 'Flavor B', brandName: 'Demo Brand', variantType: 'flavor', quantity: 2 },
      { variantName: 'Flavor C', brandName: 'Demo Brand', variantType: 'flavor', quantity: 1 },
      { variantName: 'Flavor D', brandName: 'Demo Brand', variantType: 'flavor', quantity: 2 },
      { variantName: 'Flavor E', brandName: 'Demo Brand', variantType: 'flavor', quantity: 1 },
      { variantName: 'Flavor F', brandName: 'Demo Brand', variantType: 'flavor', quantity: 4 },
      { variantName: 'Ice Mint', brandName: 'Relx', variantType: 'flavor', quantity: 2 },
      { variantName: 'Berry Blast', brandName: 'Relx', variantType: 'flavor', quantity: 1 },
      { variantName: 'Classic', brandName: 'Relx', variantType: 'flavor', quantity: 4 },
      { variantName: 'Battery X', brandName: 'Vaporesso', variantType: 'battery', quantity: 1 },
      { variantName: 'Battery Y', brandName: 'Vaporesso', variantType: 'battery', quantity: 2 },
      { variantName: 'Coil Pack', brandName: 'Vaporesso', variantType: 'posm', quantity: 3 },
    ],
    proofLabels: ['capture-box.jpg', 'capture-leak.jpg'],
    status: 'posted',
  },
  {
    id: 'mock-cr-2',
    returnNumber: 'CR-MTS-202609-000002',
    orderNumber: 'ORD-2026-MTS-0042',
    clientName: "Juan's Sari-Sari",
    returnedByName: 'Maria Santos',
    returnDate: '2026-09-09',
    createdAt: '2026-09-09T10:05:00+08:00',
    reason: 'duplicate_order',
    notes: 'Accidental double order last Friday.',
    lines: [
      { variantName: 'Flavor A', brandName: 'Demo Brand', variantType: 'flavor', quantity: 2 },
      { variantName: 'Ice Mint', brandName: 'Relx', variantType: 'flavor', quantity: 1 },
    ],
    proofLabels: ['upload-receipt.jpg'],
    status: 'posted',
  },
  {
    id: 'mock-cr-3',
    returnNumber: 'CR-MTS-202609-000003',
    orderNumber: 'ORD-2026-MTS-0058',
    clientName: 'Pedro Mart',
    returnedByName: 'Maria Santos',
    returnDate: '2026-09-09',
    createdAt: '2026-09-09T16:40:00+08:00',
    reason: 'missing_parts',
    notes: 'Charger missing from the box.',
    lines: [
      { variantName: 'Battery X', brandName: 'Vaporesso', variantType: 'battery', quantity: 1 },
      { variantName: 'Battery Y', brandName: 'Vaporesso', variantType: 'battery', quantity: 1 },
      { variantName: 'Coil Pack', brandName: 'Vaporesso', variantType: 'posm', quantity: 2 },
    ],
    proofLabels: ['capture-open-box.jpg'],
    status: 'posted',
  },
  {
    id: 'mock-cr-4',
    returnNumber: 'CR-MTS-202609-000004',
    orderNumber: 'ORD-2026-MTS-0061',
    clientName: 'Aling Nena Store',
    returnedByName: 'Jose Cruz',
    returnDate: '2026-09-10',
    createdAt: '2026-09-10T09:15:00+08:00',
    reason: 'defect',
    notes: 'Seal broken on arrival.',
    lines: [
      { variantName: 'Classic', brandName: 'Relx', variantType: 'flavor', quantity: 2 },
      { variantName: 'Berry Blast', brandName: 'Relx', variantType: 'flavor', quantity: 1 },
    ],
    proofLabels: ['capture-seal.jpg'],
    status: 'posted',
  },
  {
    id: 'mock-cr-5',
    returnNumber: 'CR-MTS-202609-000005',
    orderNumber: 'ORD-2026-MTS-0064',
    clientName: 'Kuya Ben Mart',
    returnedByName: 'Maria Santos',
    returnDate: '2026-09-10',
    createdAt: '2026-09-10T13:40:00+08:00',
    reason: 'duplicate_order',
    notes: null,
    lines: [
      { variantName: 'Flavor D', brandName: 'Demo Brand', variantType: 'flavor', quantity: 3 },
    ],
    proofLabels: ['upload-receipt-2.jpg'],
    status: 'posted',
  },
  {
    id: 'mock-cr-6',
    returnNumber: 'CR-MTS-202609-000006',
    orderNumber: 'ORD-2026-MTS-0070',
    clientName: 'Central Sari-Sari',
    returnedByName: 'Jose Cruz',
    returnDate: '2026-09-11',
    createdAt: '2026-09-11T11:05:00+08:00',
    reason: 'other',
    notes: 'Client changed order mix.',
    lines: [
      { variantName: 'Battery X', brandName: 'Vaporesso', variantType: 'battery', quantity: 2 },
      { variantName: 'Flavor A', brandName: 'Demo Brand', variantType: 'flavor', quantity: 1 },
    ],
    proofLabels: [],
    status: 'posted',
  },
];

export function formatClientReturnReason(reason: string): string {
  const option = CLIENT_RETURN_REASON_OPTIONS.find((o) => o.value === reason);
  if (option && option.value !== 'other') return option.label;
  if (reason === 'other') return 'Other';
  return reason;
}

/** Dummy preview URL for mock proof photos. */
export function getMockProofPhotoUrl(fileName: string): string {
  const seed = fileName.replace(/\.[^.]+$/, '').replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'proof';
  return `https://picsum.photos/seed/${seed}/800/600`;
}

export function getMockReturnedQtyForName(variantName: string): number {
  const needle = variantName.trim().toLowerCase();
  return MOCK_CLIENT_RETURNS.reduce((sum, cr) => {
    return (
      sum +
      cr.lines
        .filter((line) => line.variantName.trim().toLowerCase() === needle)
        .reduce((lineSum, line) => lineSum + line.quantity, 0)
    );
  }, 0);
}

export type MockReturnedStock = {
  qty: number;
  returns: MockClientReturn[];
};

function addMockReturnedStock(
  map: Map<string, MockReturnedStock>,
  variantId: string,
  qty: number,
  cr: MockClientReturn
) {
  const current = map.get(variantId) || { qty: 0, returns: [] };
  current.qty += qty;
  if (!current.returns.some((row) => row.id === cr.id)) {
    current.returns.push(cr);
  }
  map.set(variantId, current);
}

/** Map catalog variants → dummy returned qty and the CRs that make up that qty. */
export function buildMockReturnedStockByVariantId(
  variants: Array<{ id: string; name: string }>
): Map<string, MockReturnedStock> {
  const map = new Map<string, MockReturnedStock>();
  if (variants.length === 0) return map;

  const catalogByName = new Map<string, string>();
  for (const variant of variants) {
    catalogByName.set(variant.name.trim().toLowerCase(), variant.id);
  }

  const unmatched: Array<{ cr: MockClientReturn; line: MockClientReturnLine }> = [];
  for (const cr of MOCK_CLIENT_RETURNS) {
    for (const line of cr.lines) {
      const id = catalogByName.get(line.variantName.trim().toLowerCase());
      if (id) {
        addMockReturnedStock(map, id, line.quantity, cr);
      } else {
        unmatched.push({ cr, line });
      }
    }
  }

  unmatched.forEach((item, index) => {
    const variant = variants[index % variants.length];
    addMockReturnedStock(map, variant.id, item.line.quantity, item.cr);
  });

  return map;
}

/** Map catalog variants → dummy returned qty. Unmatched mock lines round-robin across variants. */
export function buildMockReturnedQtyByVariantId(
  variants: Array<{ id: string; name: string }>
): Map<string, number> {
  const qtyMap = new Map<string, number>();
  for (const [id, stock] of buildMockReturnedStockByVariantId(variants)) {
    qtyMap.set(id, stock.qty);
  }
  return qtyMap;
}

export function getMockReturnsForVariant(variantName: string): MockClientReturn[] {
  const needle = variantName.trim().toLowerCase();
  const matched = MOCK_CLIENT_RETURNS.filter((cr) =>
    cr.lines.some((line) => line.variantName.trim().toLowerCase() === needle)
  );
  return matched.length > 0 ? matched : MOCK_CLIENT_RETURNS;
}

export function getMockReturnLineQty(row: MockClientReturn): number {
  return row.lines.reduce((sum, line) => sum + line.quantity, 0);
}

export function getMockReturnsForOrder(orderNumber: string): MockClientReturn[] {
  const needle = orderNumber.trim().toLowerCase();
  const matched = MOCK_CLIENT_RETURNS.filter((cr) => cr.orderNumber.trim().toLowerCase() === needle);
  return matched.length > 0 ? matched : MOCK_CLIENT_RETURNS;
}

export function getMockAlreadyReturnedQty(orderNumber: string, variantName: string): number {
  const orderNeedle = orderNumber.trim().toLowerCase();
  const variantNeedle = variantName.trim().toLowerCase();
  return MOCK_CLIENT_RETURNS.filter((cr) => cr.orderNumber.trim().toLowerCase() === orderNeedle).reduce(
    (sum, cr) =>
      sum +
      cr.lines
        .filter((line) => line.variantName.trim().toLowerCase() === variantNeedle)
        .reduce((lineSum, line) => lineSum + line.quantity, 0),
    0
  );
}

export type MockChangeItemSku = {
  id: string;
  brandName: string;
  variantName: string;
  variantType: string;
  sellableQty: number;
};

/** Dummy sellable SKUs for the change-item step, scoped to brands on the order. */
export function buildMockChangeItemCatalog(
  orderItems: Array<{ brandName: string; variantName: string; variantType?: string }>
): MockChangeItemSku[] {
  const byBrand = new Map<string, MockChangeItemSku[]>();

  for (const item of orderItems) {
    const brand = item.brandName?.trim() || 'Unknown';
    const list = byBrand.get(brand) || [];
    const already = list.some(
      (sku) => sku.variantName.trim().toLowerCase() === item.variantName.trim().toLowerCase()
    );
    if (!already) {
      list.push({
        id: `chg-${brand}-${item.variantName}`.toLowerCase().replace(/\s+/g, '-'),
        brandName: brand,
        variantName: item.variantName,
        variantType: item.variantType || 'flavor',
        sellableQty: 6,
      });
    }
    byBrand.set(brand, list);
  }

  for (const [brand, list] of byBrand) {
    list.push({
      id: `chg-${brand}-alt`.toLowerCase().replace(/\s+/g, '-'),
      brandName: brand,
      variantName: 'Replacement Mix',
      variantType: list[0]?.variantType || 'flavor',
      sellableQty: 4,
    });
  }

  return Array.from(byBrand.values()).flat();
}
