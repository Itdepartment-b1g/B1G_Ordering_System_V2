export type SupplierSortKey =
  | 'companyName'
  | 'contactPerson'
  | 'email'
  | 'phone'
  | 'status';

export type SupplierSortDirection = 'asc' | 'desc';

export const DEFAULT_SUPPLIER_SORT_KEY: SupplierSortKey = 'companyName';
export const DEFAULT_SUPPLIER_SORT_DIRECTION: SupplierSortDirection = 'asc';

export type SupplierSortable = {
  id: string;
  company_name: string;
  contact_person: string;
  email: string;
  phone: string;
  status: 'active' | 'inactive';
};

export function sortSuppliers<T extends SupplierSortable>(
  suppliers: T[],
  sortKey: SupplierSortKey,
  sortDirection: SupplierSortDirection
): T[] {
  const direction = sortDirection === 'asc' ? 1 : -1;

  return [...suppliers].sort((a, b) => {
    let result = 0;

    switch (sortKey) {
      case 'companyName':
        result = a.company_name.localeCompare(b.company_name);
        break;
      case 'contactPerson':
        result = a.contact_person.localeCompare(b.contact_person);
        break;
      case 'email':
        result = a.email.localeCompare(b.email);
        break;
      case 'phone':
        result = a.phone.localeCompare(b.phone);
        break;
      case 'status':
        result = a.status.localeCompare(b.status);
        break;
      default:
        result = 0;
    }

    if (result !== 0) return result * direction;
    return a.company_name.localeCompare(b.company_name);
  });
}
