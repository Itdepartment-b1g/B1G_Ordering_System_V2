import type { SortDirection } from '@/features/shared/components/SortableTableHead';
import type {
  KeyAccountClient,
  KeyAccountDeliveryAddress,
  KeyAccountShop,
} from '@/types/database.types';

export type ClientHierarchyClientSortKey =
  | 'clientName'
  | 'code'
  | 'category'
  | 'contact'
  | 'email'
  | 'phone'
  | 'paymentTerms'
  | 'notes'
  | 'createdAt';

export type ClientHierarchyShopSortKey =
  | 'shopName'
  | 'code'
  | 'location'
  | 'region'
  | 'contact'
  | 'phone'
  | 'email'
  | 'operatingHours'
  | 'notes'
  | 'cor'
  | 'createdAt';

export type ClientHierarchyAddressSortKey =
  | 'label'
  | 'address'
  | 'location'
  | 'contact'
  | 'phone'
  | 'instructions'
  | 'createdAt';

export const DEFAULT_CLIENT_HIERARCHY_CLIENT_SORT_KEY: ClientHierarchyClientSortKey = 'createdAt';
export const DEFAULT_CLIENT_HIERARCHY_CLIENT_SORT_DIRECTION: SortDirection = 'desc';

export const DEFAULT_CLIENT_HIERARCHY_SHOP_SORT_KEY: ClientHierarchyShopSortKey = 'createdAt';
export const DEFAULT_CLIENT_HIERARCHY_SHOP_SORT_DIRECTION: SortDirection = 'desc';

export const DEFAULT_CLIENT_HIERARCHY_ADDRESS_SORT_KEY: ClientHierarchyAddressSortKey = 'createdAt';
export const DEFAULT_CLIENT_HIERARCHY_ADDRESS_SORT_DIRECTION: SortDirection = 'desc';

function compareStrings(a: string | undefined | null, b: string | undefined | null): number {
  return (a ?? '').localeCompare(b ?? '', undefined, { sensitivity: 'base' });
}

function compareCreatedAt(a: string | undefined, b: string | undefined): number {
  const aTime = a ? new Date(a).getTime() : 0;
  const bTime = b ? new Date(b).getTime() : 0;
  return aTime - bTime;
}

function formatShopLocation(shop: KeyAccountShop): string {
  return [shop.city, shop.province].filter(Boolean).join(', ');
}

function formatAddressLocation(address: KeyAccountDeliveryAddress): string {
  return [address.city, address.province, address.region, address.zip_code].filter(Boolean).join(', ');
}

function sortByDirection<T>(items: T[], compare: (a: T, b: T) => number, direction: SortDirection): T[] {
  const multiplier = direction === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => compare(a, b) * multiplier);
}

export function sortClientHierarchyClients(
  clients: KeyAccountClient[],
  sortKey: ClientHierarchyClientSortKey,
  sortDirection: SortDirection
): KeyAccountClient[] {
  return sortByDirection(clients, (a, b) => {
    switch (sortKey) {
      case 'clientName':
        return compareStrings(a.client_name, b.client_name);
      case 'code':
        return compareStrings(a.client_code, b.client_code);
      case 'category':
        return compareStrings(a.client_category, b.client_category);
      case 'contact':
        return compareStrings(a.contact_person, b.contact_person);
      case 'email':
        return compareStrings(a.contact_email, b.contact_email);
      case 'phone':
        return compareStrings(a.contact_phone, b.contact_phone);
      case 'paymentTerms':
        return compareStrings(a.payment_terms, b.payment_terms);
      case 'notes':
        return compareStrings(a.notes, b.notes);
      case 'createdAt':
        return compareCreatedAt(a.created_at, b.created_at);
      default:
        return 0;
    }
  }, sortDirection);
}

export function sortClientHierarchyShops(
  shops: KeyAccountShop[],
  sortKey: ClientHierarchyShopSortKey,
  sortDirection: SortDirection
): KeyAccountShop[] {
  return sortByDirection(shops, (a, b) => {
    switch (sortKey) {
      case 'shopName':
        return compareStrings(a.shop_name, b.shop_name);
      case 'code':
        return compareStrings(a.shop_code, b.shop_code);
      case 'location':
        return compareStrings(formatShopLocation(a), formatShopLocation(b));
      case 'region':
        return compareStrings(a.region, b.region);
      case 'contact':
        return compareStrings(a.contact_person, b.contact_person);
      case 'phone':
        return compareStrings(a.contact_phone, b.contact_phone);
      case 'email':
        return compareStrings(a.contact_email, b.contact_email);
      case 'operatingHours':
        return compareStrings(a.operating_hours, b.operating_hours);
      case 'notes':
        return compareStrings(a.notes, b.notes);
      case 'cor':
        return Number(Boolean(b.cor_pdf_path)) - Number(Boolean(a.cor_pdf_path));
      case 'createdAt':
        return compareCreatedAt(a.created_at, b.created_at);
      default:
        return 0;
    }
  }, sortDirection);
}

export function sortClientHierarchyAddresses(
  addresses: KeyAccountDeliveryAddress[],
  sortKey: ClientHierarchyAddressSortKey,
  sortDirection: SortDirection
): KeyAccountDeliveryAddress[] {
  return sortByDirection(addresses, (a, b) => {
    switch (sortKey) {
      case 'label':
        return compareStrings(a.address_label, b.address_label);
      case 'address':
        return compareStrings(a.full_address, b.full_address);
      case 'location':
        return compareStrings(formatAddressLocation(a), formatAddressLocation(b));
      case 'contact':
        return compareStrings(a.contact_name, b.contact_name);
      case 'phone':
        return compareStrings(a.contact_phone, b.contact_phone);
      case 'instructions':
        return compareStrings(a.delivery_instructions, b.delivery_instructions);
      case 'createdAt':
        return compareCreatedAt(a.created_at, b.created_at);
      default:
        return 0;
    }
  }, sortDirection);
}
