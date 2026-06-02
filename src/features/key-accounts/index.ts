// Key Accounts Feature Module
// Phase 1 & 2: Data Model, Roles, and Client Management

export * from './keyAccountRoles';

// Components
export { KeyAccountTeamManagement } from './components/KeyAccountTeamManagement';
export { ClientHierarchyManager } from './components/ClientHierarchyManager';
export { ClientAssignmentManager } from './components/ClientAssignmentManager';

// Dashboards (Role-specific)
export { SalesAdminDashboard } from './dashboard/SalesAdminDashboard';
export { SalesDirectorDashboard } from './dashboard/SalesDirectorDashboard';
export { KAMDashboard } from './dashboard/KAMDashboard';
export { KeyAccountsDashboardWrapper } from './pages/KeyAccountsDashboardWrapper';

// Individual pages (for sidebar navigation)
export { ClientHierarchyPage } from './pages/ClientHierarchyPage';
export { ClientAssignmentPage } from './pages/ClientAssignmentPage';
export { KeyAccountTeamPage } from './pages/KeyAccountTeamPage';
export { KeyAccountPurchaseOrderPage } from './pages/KeyAccountCreatePurchaseOrderPage';
export { KeyAccountPurchaseOrdersPage } from './pages/KeyAccountPurchaseOrdersPage';
export { KeyAccountAnalyticsPage, KeyAccountClientAnalyticsPage } from './key-accounts-analytics';
export { KeyAccountRebatesPage, KeyAccountCreateRebatePage } from './rebates';

// Future exports (Phase 3+):
// - KAMOrderPage: Create purchase orders
// - DirectorApprovalPage: Review and approve orders
