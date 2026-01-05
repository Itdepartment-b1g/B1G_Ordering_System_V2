// ============================================================================
// ROLE UTILITIES
// ============================================================================
// Centralized role checking functions for consistent access control

export type UserRole = 
  | 'mobile_sales' 
  | 'team_leader' 
  | 'manager' 
  | 'admin' 
  | 'super_admin' 
  | 'finance' 
  | 'system_administrator';

/**
 * Check if a user can lead a team (has team members)
 * Managers and Team Leaders can both lead teams
 */
export function canLeadTeam(role?: UserRole | string): boolean {
  return role === 'team_leader' || role === 'manager';
}

/**
 * Check if a user can manage inventory
 * Mobile sales, Team Leaders, and Managers have inventory
 */
export function hasInventory(role?: UserRole | string): boolean {
  return role === 'mobile_sales' || role === 'team_leader' || role === 'manager';
}

/**
 * Check if a user has admin privileges
 * Admins and Super Admins have full access
 */
export function isAdmin(role?: UserRole | string): boolean {
  return role === 'admin' || role === 'super_admin' || role === 'system_administrator';
}

/**
 * Check if a user can approve orders (Finance team)
 */
export function canApproveFinance(role?: UserRole | string): boolean {
  return role === 'finance' || role === 'super_admin' || role === 'system_administrator';
}

/**
 * Check if a user can allocate stock from main inventory
 * Admins, Super Admins, and System Administrators can allocate
 */
export function canAllocateFromMain(role?: UserRole | string): boolean {
  return isAdmin(role);
}

/**
 * Check if a user can view all orders (not just their own)
 */
export function canViewAllOrders(role?: UserRole | string): boolean {
  return isAdmin(role) || role === 'finance';
}

/**
 * Check if a user can manage companies (System Admin only)
 */
export function canManageCompanies(role?: UserRole | string): boolean {
  return role === 'system_administrator';
}

/**
 * Check if a user can view cash deposits
 * Team Leaders, Managers, Admins, Super Admins can view deposits
 */
export function canViewCashDeposits(role?: UserRole | string): boolean {
  return canLeadTeam(role) || isAdmin(role);
}

/**
 * Check if a user can view remittances
 * Team Leaders, Managers, Admins, Super Admins can view remittances
 */
export function canViewRemittances(role?: UserRole | string): boolean {
  return canLeadTeam(role) || isAdmin(role);
}

/**
 * Get user-friendly role display name
 */
export function getRoleDisplayName(role?: UserRole | string): string {
  switch (role) {
    case 'mobile_sales':
      return 'Mobile Sales Agent';
    case 'team_leader':
      return 'Team Leader';
    case 'manager':
      return 'Manager';
    case 'admin':
      return 'Admin';
    case 'super_admin':
      return 'Super Admin';
    case 'finance':
      return 'Finance';
    case 'system_administrator':
      return 'System Administrator';
    default:
      return 'User';
  }
}

/**
 * Get role hierarchy level (higher = more permissions)
 */
export function getRoleLevel(role?: UserRole | string): number {
  switch (role) {
    case 'system_administrator':
      return 100;
    case 'super_admin':
      return 90;
    case 'admin':
      return 80;
    case 'finance':
      return 70;
    case 'manager':
      return 60;
    case 'team_leader':
      return 50;
    case 'mobile_sales':
      return 40;
    default:
      return 0;
  }
}

/**
 * Check if roleA has higher permissions than roleB
 */
export function hasHigherPermissions(roleA?: UserRole | string, roleB?: UserRole | string): boolean {
  return getRoleLevel(roleA) > getRoleLevel(roleB);
}

