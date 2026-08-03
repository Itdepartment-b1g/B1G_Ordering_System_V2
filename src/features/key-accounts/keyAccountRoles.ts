import type { UserRole } from '@/types/database.types';

/** Company bootstrap / operational lead (same UI access as sales admin except warehouse release). */
export function isKeyAccountSalesHead(role?: string | null): boolean {
  return role === 'sales_head';
}

/** Final PO release to warehouse + RFPF after warehouse_reserved. */
export function isKeyAccountSalesAdmin(role?: string | null): boolean {
  return role === 'sales_admin';
}

/** sales_admin + sales_head — manage clients, team, assignments, analytics. */
export function isKeyAccountSalesLead(role?: string | null): boolean {
  return role === 'sales_admin' || role === 'sales_head';
}

/** View-only Key Account PO and transaction details. */
export function isKeyAccountAccounting(role?: string | null): boolean {
  return role === 'key_account_accounting';
}

export function isKeyAccountDirector(role?: string | null): boolean {
  return role === 'sales_director';
}

export function isKeyAccountManager(role?: string | null): boolean {
  return role === 'key_account_manager';
}

/** Any role that uses the Key Accounts module (not standard B2B menus). */
export function isKeyAccountModuleRole(role?: string | null): boolean {
  return (
    isKeyAccountSalesLead(role) ||
    isKeyAccountDirector(role) ||
    isKeyAccountManager(role) ||
    isKeyAccountAccounting(role)
  );
}

/** Roles Sales Head / Sales Admin may create via User Management. */
export const KEY_ACCOUNT_CREATABLE_ROLES: UserRole[] = [
  'sales_admin',
  'sales_director',
  'key_account_manager',
  'key_account_accounting',
];

export function isKeyAccountCreatableRole(role: string): role is UserRole {
  return (KEY_ACCOUNT_CREATABLE_ROLES as string[]).includes(role);
}

export function getKeyAccountRoleLabel(role?: string | null): string {
  switch (role) {
    case 'sales_head':
      return 'Sales Head';
    case 'sales_admin':
      return 'Sales Admin';
    case 'sales_director':
      return 'Sales Director';
    case 'key_account_manager':
      return 'Key Account Manager';
    case 'key_account_accounting':
      return 'Key Account Accounting';
    default:
      return role?.replace(/_/g, ' ') ?? 'User';
  }
}

/** Editable until warehouse approves fulfillment (status leaves pending). */
export type KeyAccountPoEditGateInput = {
  status?: string | null;
  workflow_status?: string | null;
  kam_id?: string | null;
  po_order_kind?: string | null;
};

export function canEditKeyAccountPo(
  po: KeyAccountPoEditGateInput | null | undefined,
  user?: { id?: string | null; role?: string | null } | null
): boolean {
  if (!po || !user?.id || !user.role) return false;
  if (isKeyAccountAccounting(user.role)) return false;

  const status = String(po.status || '').toLowerCase();
  const workflow = String(po.workflow_status || '').toLowerCase();
  if (status !== 'pending') return false;
  if (workflow === 'rejected' || status === 'rejected' || status === 'cancelled') return false;

  const kind = String(po.po_order_kind || '');
  if (kind === 'rebate_fulfillment' || kind === 'rebate_topup') return false;

  const isPrivilegedEditor =
    isKeyAccountSalesAdmin(user.role) ||
    isKeyAccountSalesHead(user.role) ||
    isKeyAccountDirector(user.role);
  const isOwner = !!po.kam_id && po.kam_id === user.id;

  return isPrivilegedEditor || isOwner;
}
