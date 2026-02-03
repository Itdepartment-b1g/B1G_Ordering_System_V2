// Helper to get menu items based on user role
// This matches the logic from AppSidebar.tsx

interface MenuItem {
  title: string;
  url: string;
  icon?: string;
  hasSubmenu?: boolean;
  submenu?: MenuItem[];
}

const adminMenuItems: MenuItem[] = [
  { title: 'Dashboard', url: '/dashboard' },
  { title: 'Member Management', url: '/member-management', hasSubmenu: true, submenu: [
    { title: 'User Management', url: '/sales-agents' },
    { title: 'Team Management', url: '/team-management' },
  ]},
  { title: 'Inventory', url: '/inventory', hasSubmenu: true, submenu: [
    { title: 'Main Inventory', url: '/inventory/main' },
    { title: 'Stock Allocations', url: '/inventory/allocations' },
    { title: 'Inventory Requests', url: '/inventory/admin-requests' },
    { title: 'Team Remittances', url: '/inventory/admin-team-remittances' },
  ]},
  { title: 'Clients', url: '/clients', hasSubmenu: true, submenu: [
    { title: 'Clients Database', url: '/clients' },
    { title: 'Pending Clients', url: '/clients/pending' },
    { title: 'Voided Clients', url: '/voided-clients' },
  ]},
  { title: 'Finance', url: '/finance-section', hasSubmenu: true, submenu: [
    { title: 'Finance Page', url: '/finance' },
    { title: 'Order List', url: '/orders' },
    { title: 'Cash Deposits', url: '/inventory/cash-deposits' },
  ]},
  { title: 'Procurement', url: '/purchase-order-management', hasSubmenu: true, submenu: [
    { title: 'Purchase Orders', url: '/purchase-orders' },
    { title: 'Brands & Variants', url: '/brands' },
    { title: 'Variant Types', url: '/variant-types' },
    { title: 'Suppliers', url: '/suppliers' },
  ]},
  { title: 'AI Analytics', url: '/analytics' },
  { title: 'War Room', url: '/war-room' },
  { title: 'System History', url: '/system-history' },
  { title: 'Profile', url: '/profile' },
];

const agentMenuItems: MenuItem[] = [
  { title: 'Dashboard', url: '/dashboard' },
  { title: 'My Inventory', url: '/my-inventory' },
  { title: 'Request Inventory', url: '/inventory/request' },
  { title: 'My Clients', url: '/my-clients' },
  { title: 'My Orders', url: '/my-orders' },
  { title: 'My Activity', url: '/system-history' },
  { title: 'Calendar', url: '/calendar' },
  { title: 'Profile', url: '/profile' },
];

const leaderMenuItems: MenuItem[] = [
  { title: 'Dashboard', url: '/dashboard' },
  { title: 'My Team', url: '/my-team' },
  { title: 'Analytics', url: '/analytics' },
  { title: 'Inventory', url: '/inventory', hasSubmenu: true, submenu: [
    { title: 'My Inventory', url: '/my-inventory' },
    { title: 'Teams Inventory', url: '/leader-inventory' },
    { title: 'Pending Requests', url: '/inventory/pending-requests' },
    { title: 'Team Remittances', url: '/inventory/team-remittances' },
    { title: 'Cash Deposits', url: '/inventory/cash-deposits' },
  ]},
  { title: 'Tasks', url: '/tasks', hasSubmenu: true, submenu: [
    { title: "Today's Tasks", url: '/tasks' },
    { title: 'Archive Tasks', url: '/tasks/archive' },
  ]},
  { title: 'My Clients', url: '/my-clients' },
  { title: 'My Orders', url: '/my-orders' },
  { title: 'Team Activity', url: '/system-history' },
  { title: 'Calendar', url: '/calendar' },
  { title: 'Profile', url: '/profile' },
];

const systemAdminMenuItems: MenuItem[] = [
  { title: 'Dashboard', url: '/sys-admin-dashboard' },
  { title: 'Management Portal', url: '/system-management' },
  { title: 'System History', url: '/system-history' },
  { title: 'Profile', url: '/profile' },
];

const managerMenuItems: MenuItem[] = [
  { title: 'Manager Dashboard', url: '/manager-dashboard' },
  { title: 'My Team', url: '/manager-teams' },
  { title: 'Inventory', url: '/inventory', hasSubmenu: true, submenu: [
    { title: 'Team Inventory', url: '/manager-inventory' },
    { title: 'Team Requests', url: '/manager-requests' },
    { title: 'Team Remittances', url: '/manager-remittances' },
    { title: 'Cash Deposits', url: '/inventory/cash-deposits' },
  ]},
  { title: 'Team Clients', url: '/manager-clients' },
  { title: 'Team Activity', url: '/system-history' },
  { title: 'Profile', url: '/profile' },
];

const financeMenuItems: MenuItem[] = [
  { title: 'Dashboard', url: '/dashboard' },
  { title: 'Finance', url: '/finance-section', hasSubmenu: true, submenu: [
    { title: 'Finance Page', url: '/finance' },
    { title: 'Order List', url: '/orders' },
    { title: 'Cash Deposits', url: '/inventory/cash-deposits' },
  ]},
  { title: 'System History', url: '/system-history' },
  { title: 'Profile', url: '/profile' },
];

const superAdminMenuItems: MenuItem[] = [
  { title: 'Dashboard', url: '/super-admin-dashboard' },
  { title: 'Member Management', url: '/member-management', hasSubmenu: true, submenu: [
    { title: 'User Management', url: '/sales-agents' },
    { title: 'Team Management', url: '/team-management' },
  ]},
  { title: 'Inventory', url: '/inventory', hasSubmenu: true, submenu: [
    { title: 'Main Inventory', url: '/inventory/main' },
    { title: 'Stock Allocations', url: '/inventory/allocations' },
    { title: 'Inventory Requests', url: '/inventory/admin-requests' },
    { title: 'Team Remittances', url: '/inventory/admin-team-remittances' },
  ]},
  { title: 'Clients', url: '/clients', hasSubmenu: true, submenu: [
    { title: 'Clients Database', url: '/clients' },
    { title: 'Pending Clients', url: '/clients/pending' },
    { title: 'Voided Clients', url: '/voided-clients' },
  ]},
  { title: 'Finance', url: '/finance-section', hasSubmenu: true, submenu: [
    { title: 'Finance Page', url: '/finance' },
    { title: 'Order List', url: '/orders' },
    { title: 'Cash Deposits', url: '/inventory/cash-deposits' },
  ]},
  { title: 'Procurement', url: '/purchase-order-management', hasSubmenu: true, submenu: [
    { title: 'Purchase Orders', url: '/purchase-orders' },
    { title: 'Brands & Variants', url: '/brands' },
    { title: 'Variant Types', url: '/variant-types' },
    { title: 'Suppliers', url: '/suppliers' },
  ]},
  { title: 'AI Analytics', url: '/analytics' },
  { title: 'War Room', url: '/war-room' },
  { title: 'System History', url: '/system-history' },
  { title: 'Settings', url: '/settings', hasSubmenu: true, submenu: [
    { title: 'Profile', url: '/profile' },
    { title: 'System Settings', url: '/system-settings' },
  ]},
];

export function getMenuItemsForRole(role: string | undefined): MenuItem[] {
  if (!role) return agentMenuItems; // Default fallback

  switch (role) {
    case 'system_administrator':
      return systemAdminMenuItems;
    case 'super_admin':
      return superAdminMenuItems;
    case 'admin':
      return adminMenuItems;
    case 'manager':
      return managerMenuItems;
    case 'team_leader':
      return leaderMenuItems;
    case 'finance':
      return financeMenuItems;
    case 'mobile_sales':
      return agentMenuItems;
    default:
      return agentMenuItems;
  }
}

export function flattenMenuItems(items: MenuItem[]): MenuItem[] {
  const flattened: MenuItem[] = [];
  
  items.forEach(item => {
    flattened.push(item);
    if (item.hasSubmenu && item.submenu) {
      flattened.push(...flattenMenuItems(item.submenu));
    }
  });
  
  return flattened;
}

export function getPagesListForRole(role: string | undefined): string {
  const menuItems = getMenuItemsForRole(role);

  // Create a readable list of pages WITHOUT exposing routes/URLs (security)
  const lines: string[] = [];

  const walk = (items: MenuItem[], depth: number) => {
    items.forEach(item => {
      const indent = '  '.repeat(depth);
      lines.push(`${indent}- ${item.title}`);
      if (item.hasSubmenu && item.submenu?.length) {
        walk(item.submenu, depth + 1);
      }
    });
  };

  walk(menuItems, 0);
  return lines.join('\n');
}
