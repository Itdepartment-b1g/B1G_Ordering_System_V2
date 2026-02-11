// Helper to get menu items based on user role
// This matches the logic from AppSidebar.tsx

interface MenuItem {
  title: string;
  url: string;
  description?: string; // Human-friendly description of what the page does
  icon?: string;
  hasSubmenu?: boolean;
  submenu?: MenuItem[];
}

const adminMenuItems: MenuItem[] = [
  { title: 'Dashboard', url: '/dashboard', description: 'High-level overview of company performance, orders, inventory, and team activity.' },
  { title: 'Member Management', url: '/member-management', description: 'Manage all users and teams in the company.', hasSubmenu: true, submenu: [
    { title: 'User Management', url: '/sales-agents', description: 'Create, edit, and manage user accounts and roles.' },
    { title: 'Team Management', url: '/team-management', description: 'Assign mobile sales agents to team leaders and manage team structures.' },
  ]},
  { title: 'Inventory', url: '/inventory', description: 'Admin view of company-wide stock and movements.', hasSubmenu: true, submenu: [
    { title: 'Main Inventory', url: '/inventory/main', description: 'View and manage all company stock levels and pricing.' },
    { title: 'Stock Allocations', url: '/inventory/allocations', description: 'Allocate stock from main inventory to team leaders.' },
    { title: 'Inventory Requests', url: '/inventory/admin-requests', description: 'Approve or reject stock requests escalated to admin.' },
    { title: 'Team Remittances', url: '/inventory/admin-team-remittances', description: 'Review remitted stocks and reconcile team inventory.' },
  ]},
  { title: 'Clients', url: '/clients', description: 'Admin-level management of all customer records.', hasSubmenu: true, submenu: [
    { title: 'Clients Database', url: '/clients', description: 'Search, filter, and manage all active clients.' },
    { title: 'Pending Clients', url: '/clients/pending', description: 'Approve or reject client registrations from mobile sales agents.' },
    { title: 'Voided Clients', url: '/voided-clients', description: 'View and optionally restore clients that have been voided/inactivated.' },
  ]},
  { title: 'Finance', url: '/finance-section', description: 'Finance overview and tools for cash flow and revenue.', hasSubmenu: true, submenu: [
    { title: 'Finance Page', url: '/finance', description: 'Dashboard of revenue, expenses, and key financial metrics.' },
    { title: 'Order List', url: '/orders', description: 'Review and approve customer orders and monitor their status.' },
    { title: 'Cash Deposits', url: '/inventory/cash-deposits', description: 'Track and verify cash and cheque deposits from team leaders.' },
  ]},
  { title: 'Procurement', url: '/purchase-order-management', description: 'Manage purchasing of goods from suppliers.', hasSubmenu: true, submenu: [
    { title: 'Purchase Orders', url: '/purchase-orders', description: 'Create and manage purchase orders to replenish stock.' },
    { title: 'Brands & Variants', url: '/brands', description: 'Maintain the list of product brands and variant definitions.' },
    { title: 'Variant Types', url: '/variant-types', description: 'Configure variant categories such as flavors, batteries, and POSM.' },
    { title: 'Suppliers', url: '/suppliers', description: 'Manage supplier records and relationships.' },
  ]},
  { title: 'AI Analytics', url: '/analytics', description: 'Use AI-powered analytics to understand sales, clients, and agent performance.' },
  { title: 'War Room', url: '/war-room', description: 'Strategic view of territories, teams, and performance for decision-making.' },
  { title: 'System History', url: '/system-history', description: 'Audit trail of important actions taken across the system.' },
  { title: 'Profile', url: '/profile', description: 'View and update your personal account details and settings.' },
];

const agentMenuItems: MenuItem[] = [
  { title: 'Dashboard', url: '/dashboard', description: 'Personal snapshot of today’s targets, orders, and performance.' },
  { title: 'My Inventory', url: '/my-inventory', description: 'View stock currently assigned to you and its status.' },
  { title: 'Request Inventory', url: '/inventory/request', description: 'Submit stock requests to your team leader for approval.' },
  { title: 'Mobile Sales Stock', url: '/inventory/mobile-request', description: 'Request stock specifically for mobile sales inventory.' },
  { title: 'My Clients', url: '/my-clients', description: 'Manage your assigned clients, visit history, and details.' },
  { title: 'My Orders', url: '/my-orders', description: 'Create and track orders you have placed for clients.' },
  { title: 'My Activity', url: '/system-history', description: 'See a history of your own actions and changes in the system.' },
  { title: 'Calendar', url: '/calendar', description: 'Plan and track your field tasks, visits, and follow-ups.' },
  { title: 'Profile', url: '/profile', description: 'Manage your user profile and password.' },
];

const leaderMenuItems: MenuItem[] = [
  { title: 'Dashboard', url: '/dashboard', description: 'Leader overview of team performance, orders, and coverage.' },
  { title: 'My Team', url: '/my-team', description: 'View your assigned mobile sales agents and their key stats.' },
  { title: 'Analytics', url: '/analytics', description: 'Analyze team performance, visits, and order trends.' },
  { title: 'Inventory', url: '/inventory', description: 'Leader-level inventory and stock controls.', hasSubmenu: true, submenu: [
    { title: 'My Inventory', url: '/my-inventory', description: 'View stock allocated directly to you as a leader.' },
    { title: 'Teams Inventory', url: '/leader-inventory', description: 'See and manage inventory held by your team members.' },
    { title: 'Pending Requests', url: '/inventory/pending-requests', description: 'Approve or reject inventory requests from your agents.' },
    { title: 'Team Remittances', url: '/inventory/team-remittances', description: 'Review stock and cash remittances submitted by your team.' },
    { title: 'Cash Deposits', url: '/inventory/cash-deposits', description: 'Record and review cash/cheque deposits for your team.' },
  ]},
  { title: 'Tasks', url: '/tasks', description: 'Assign and monitor daily tasks for your team.', hasSubmenu: true, submenu: [
    { title: "Today's Tasks", url: '/tasks', description: 'View and manage tasks scheduled for today.' },
    { title: 'Archive Tasks', url: '/tasks/archive', description: 'Review completed and historical tasks.' },
  ]},
  { title: 'My Clients', url: '/my-clients', description: 'View clients associated with you as a leader.' },
  { title: 'My Orders', url: '/my-orders', description: 'View orders you have created or are responsible for.' },
  { title: 'Team Activity', url: '/system-history', description: 'Audit view of your team’s important actions.' },
  { title: 'Calendar', url: '/calendar', description: 'See team tasks and schedules in a shared calendar.' },
  { title: 'Profile', url: '/profile', description: 'Manage your leader profile and account settings.' },
];

const systemAdminMenuItems: MenuItem[] = [
  { title: 'Dashboard', url: '/sys-admin-dashboard', description: 'System-wide overview for the system administrator.' },
  { title: 'Management Portal', url: '/system-management', description: 'Configure companies, tenants, and system-wide settings.' },
  { title: 'System History', url: '/system-history', description: 'Full audit log of important system changes.' },
  { title: 'Profile', url: '/profile', description: 'Manage your system administrator profile.' },
];

const managerMenuItems: MenuItem[] = [
  { title: 'Manager Dashboard', url: '/manager-dashboard', description: 'Manager view of leaders, teams, and territories.' },
  { title: 'My Team', url: '/manager-teams', description: 'See all leaders and agents reporting to you.' },
  { title: 'Inventory', url: '/inventory', description: 'Manager-level overview of team inventory and flows.', hasSubmenu: true, submenu: [
    { title: 'Team Inventory', url: '/manager-inventory', description: 'Monitor inventory across all your teams.' },
    { title: 'Team Requests', url: '/manager-requests', description: 'Review and manage stock requests at the manager level.' },
    { title: 'Team Remittances', url: '/manager-remittances', description: 'Oversee stock and cash remittances from teams.' },
    { title: 'Cash Deposits', url: '/inventory/cash-deposits', description: 'Track deposits impacting your teams and orders.' },
  ]},
  { title: 'Team Clients', url: '/manager-clients', description: 'View and review client coverage across your teams.' },
  { title: 'Team Activity', url: '/system-history', description: 'Audit of your teams’ system actions.' },
  { title: 'Calendar', url: '/calendar', description: 'High-level schedule of tasks and activities across teams.' },
  { title: 'Profile', url: '/profile', description: 'Manage your manager profile.' },
];

const financeMenuItems: MenuItem[] = [
  { title: 'Dashboard', url: '/dashboard', description: 'Finance snapshot of revenue, margins, and key metrics.' },
  { title: 'Finance', url: '/finance-section', description: 'Access to all finance tools and reports.', hasSubmenu: true, submenu: [
    { title: 'Finance Page', url: '/finance', description: 'Main finance dashboard including charts and KPIs.' },
    { title: 'Order List', url: '/orders', description: 'List of all customer orders for reconciliation and review.' },
    { title: 'Cash Deposits', url: '/inventory/cash-deposits', description: 'Verify and track deposits against orders and remittances.' },
  ]},
  { title: 'System History', url: '/system-history', description: 'See finance-related actions in the audit log.' },
  { title: 'Profile', url: '/profile', description: 'Update your finance user profile.' },
];

const superAdminMenuItems: MenuItem[] = [
  { title: 'Dashboard', url: '/super-admin-dashboard', description: 'Super admin overview across all companies and tenants.' },
  { title: 'Member Management', url: '/member-management', description: 'Global control of users and teams.', hasSubmenu: true, submenu: [
    { title: 'User Management', url: '/sales-agents', description: 'Manage all users across the tenant.' },
    { title: 'Team Management', url: '/team-management', description: 'Design and maintain global team hierarchies.' },
  ]},
  { title: 'Inventory', url: '/inventory', description: 'Tenant-wide inventory oversight and control.', hasSubmenu: true, submenu: [
    { title: 'Main Inventory', url: '/inventory/main', description: 'Manage central warehouse stock and costs.' },
    { title: 'Stock Allocations', url: '/inventory/allocations', description: 'Allocate stock down to companies or teams.' },
    { title: 'Inventory Requests', url: '/inventory/admin-requests', description: 'Approve or reject high-level stock requests.' },
    { title: 'Team Remittances', url: '/inventory/admin-team-remittances', description: 'Audit remittances from teams for compliance.' },
  ]},
  { title: 'Clients', url: '/clients', description: 'High-level client management and quality control.', hasSubmenu: true, submenu: [
    { title: 'Clients Database', url: '/clients', description: 'View all clients registered under this tenant.' },
    { title: 'Pending Clients', url: '/clients/pending', description: 'Approve new client accounts across companies.' },
    { title: 'Voided Clients', url: '/voided-clients', description: 'Monitor and restore voided/inactive client accounts.' },
  ]},
  { title: 'Finance', url: '/finance-section', description: 'Finance hub for the entire tenant.', hasSubmenu: true, submenu: [
    { title: 'Finance Page', url: '/finance', description: 'Top-level financial performance overview.' },
    { title: 'Order List', url: '/orders', description: 'Review all orders processed across the tenant.' },
    { title: 'Cash Deposits', url: '/inventory/cash-deposits', description: 'Oversee deposit reconciliation across teams and companies.' },
  ]},
  { title: 'Procurement', url: '/purchase-order-management', description: 'Central procurement controls for brands and suppliers.', hasSubmenu: true, submenu: [
    { title: 'Purchase Orders', url: '/purchase-orders', description: 'Create and manage purchase orders globally.' },
    { title: 'Brands & Variants', url: '/brands', description: 'Maintain catalog of brands and SKUs for all companies.' },
    { title: 'Variant Types', url: '/variant-types', description: 'Configure global variant types (flavor, battery, POSM, etc.).' },
    { title: 'Suppliers', url: '/suppliers', description: 'Manage the list of suppliers providing goods to the tenant.' },
  ]},
  { title: 'AI Analytics', url: '/analytics', description: 'AI-driven analytics across tenants, teams, and products.' },
  { title: 'War Room', url: '/war-room', description: 'Strategic command center for monitoring critical KPIs and maps.' },
  { title: 'System History', url: '/system-history', description: 'Global audit trail of system operations.' },
  { title: 'Settings', url: '/settings', description: 'Global configuration and account settings.', hasSubmenu: true, submenu: [
    { title: 'Profile', url: '/profile', description: 'Super admin profile and credentials.' },
    { title: 'System Settings', url: '/system-settings', description: 'Advanced configuration for the entire tenant/system.' },
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

// Returns a human-readable knowledge base for pages the role can access.
export function getPageKnowledgeBaseForRole(role: string | undefined): string {
  const menuItems = getMenuItemsForRole(role);
  const lines: string[] = [];

  const walk = (items: MenuItem[], depth: number) => {
    items.forEach(item => {
      const indent = '  '.repeat(depth);
      const description = item.description || 'No description available yet.';
      lines.push(`${indent}- ${item.title}: ${description}`);
      if (item.hasSubmenu && item.submenu?.length) {
        walk(item.submenu, depth + 1);
      }
    });
  };

  walk(menuItems, 0);
  return lines.join('\n');
}
