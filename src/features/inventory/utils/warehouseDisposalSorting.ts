export type WarehouseDisposalSortKey =
  | 'createdAt'
  | 'locationName'
  | 'brandName'
  | 'variantName'
  | 'variantType'
  | 'quantity'
  | 'sourceType'
  | 'reference'
  | 'disposedBy'
  | 'notes';

export type WarehouseDisposalSortDirection = 'asc' | 'desc';

export const DEFAULT_WAREHOUSE_DISPOSAL_SORT_KEY: WarehouseDisposalSortKey = 'createdAt';
export const DEFAULT_WAREHOUSE_DISPOSAL_SORT_DIRECTION: WarehouseDisposalSortDirection = 'desc';

export type WarehouseDisposalSortable = {
  quantity: number;
  source_type: string;
  notes: string | null;
  created_at: string;
  warehouse_location: { name: string; is_main: boolean } | null;
  variant: {
    name: string;
    variant_type: string;
    brand: { name: string } | { name: string }[] | null;
  } | null;
  disposed_by_user: { full_name: string } | null;
  fulfillment_po: { po_number: string } | null;
  rebate: { rebate_number: string } | null;
};

function getBrandLabel(row: WarehouseDisposalSortable): string {
  const brand = row.variant?.brand;
  if (!brand) return '';
  if (Array.isArray(brand)) return brand[0]?.name ?? '';
  return brand.name ?? '';
}

function getLocationLabel(row: WarehouseDisposalSortable): string {
  const loc = row.warehouse_location;
  if (!loc) return '';
  return loc.is_main ? `Main: ${loc.name}` : loc.name;
}

function getReferenceLabel(row: WarehouseDisposalSortable): string {
  return row.fulfillment_po?.po_number ?? row.rebate?.rebate_number ?? '';
}

function getSourceLabel(row: WarehouseDisposalSortable): string {
  return row.source_type;
}

export function sortWarehouseDisposals<T extends WarehouseDisposalSortable>(
  disposals: T[],
  sortKey: WarehouseDisposalSortKey,
  sortDirection: WarehouseDisposalSortDirection
): T[] {
  const direction = sortDirection === 'asc' ? 1 : -1;

  return [...disposals].sort((a, b) => {
    let result = 0;

    switch (sortKey) {
      case 'createdAt':
        result = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        break;
      case 'locationName':
        result = getLocationLabel(a).localeCompare(getLocationLabel(b));
        break;
      case 'brandName':
        result = getBrandLabel(a).localeCompare(getBrandLabel(b));
        break;
      case 'variantName':
        result = (a.variant?.name ?? '').localeCompare(b.variant?.name ?? '');
        break;
      case 'variantType':
        result = (a.variant?.variant_type ?? '').localeCompare(b.variant?.variant_type ?? '');
        break;
      case 'quantity':
        result = a.quantity - b.quantity;
        break;
      case 'sourceType':
        result = getSourceLabel(a).localeCompare(getSourceLabel(b));
        break;
      case 'reference':
        result = getReferenceLabel(a).localeCompare(getReferenceLabel(b), undefined, {
          numeric: true,
        });
        break;
      case 'disposedBy':
        result = (a.disposed_by_user?.full_name ?? '').localeCompare(
          b.disposed_by_user?.full_name ?? ''
        );
        break;
      case 'notes':
        result = (a.notes ?? '').localeCompare(b.notes ?? '');
        break;
      default:
        result = 0;
    }

    if (result !== 0) return result * direction;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}
