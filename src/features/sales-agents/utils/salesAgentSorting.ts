import type { UserRole } from '@/types/database.types';

export type SalesAgentSortKey =
  | 'name'
  | 'email'
  | 'phone'
  | 'role'
  | 'region'
  | 'cities'
  | 'status';

export type SalesAgentSortDirection = 'asc' | 'desc';

export const DEFAULT_SALES_AGENT_SORT_KEY: SalesAgentSortKey = 'name';
export const DEFAULT_SALES_AGENT_SORT_DIRECTION: SalesAgentSortDirection = 'asc';

export type SalesAgentSortable = {
  name: string;
  email: string;
  phone: string;
  region: string;
  cities: string[];
  status: 'active' | 'inactive';
  role?: UserRole;
};

export function getSalesAgentRoleLabel(role?: UserRole | ''): string {
  switch (role) {
    case 'admin':
      return 'Admin';
    case 'finance':
      return 'Finance';
    case 'accounting':
      return 'Accounting';
    case 'manager':
      return 'Manager';
    case 'team_leader':
      return 'Team Leader';
    case 'mobile_sales':
      return 'Mobile Sales';
    case 'key_account_manager':
      return 'Key Account Manager';
    case 'sales_director':
      return 'Sales Director';
    case 'sales_head':
      return 'Sales Head';
    case 'sales_admin':
      return 'Sales Admin';
    case 'key_account_accounting':
      return 'Key Account Accounting';
    default:
      return '';
  }
}

function getCitiesLabel(cities: string[]): string {
  if (cities.length === 0) return '';
  return [...cities].sort((a, b) => a.localeCompare(b)).join(', ');
}

export function sortSalesAgents<T extends SalesAgentSortable>(
  agents: T[],
  sortKey: SalesAgentSortKey,
  sortDirection: SalesAgentSortDirection
): T[] {
  const direction = sortDirection === 'asc' ? 1 : -1;

  return [...agents].sort((a, b) => {
    let result = 0;

    switch (sortKey) {
      case 'name':
        result = a.name.localeCompare(b.name);
        break;
      case 'email':
        result = a.email.localeCompare(b.email);
        break;
      case 'phone':
        result = a.phone.localeCompare(b.phone, undefined, { numeric: true });
        break;
      case 'role':
        result = getSalesAgentRoleLabel(a.role).localeCompare(getSalesAgentRoleLabel(b.role));
        break;
      case 'region':
        result = a.region.localeCompare(b.region);
        break;
      case 'cities':
        result = getCitiesLabel(a.cities).localeCompare(getCitiesLabel(b.cities));
        break;
      case 'status':
        result = a.status.localeCompare(b.status);
        break;
      default:
        result = 0;
    }

    if (result !== 0) return result * direction;
    return a.name.localeCompare(b.name);
  });
}
