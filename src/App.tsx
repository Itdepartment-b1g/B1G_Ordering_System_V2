import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryClient, persister } from "@/lib/queryClient";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, ProtectedRoute, LoginPage, RoleBasedRedirect } from "@/features/auth";
import { DashboardPage, SysAdDashboardPage, SuperAdminDashboardPage } from "@/features/dashboard";
import ExecutiveDashboardPage from "@/features/dashboard/ExecutiveDashboardPage";
import { SystemHistoryPage } from "@/features/system-history";
import { ProfilePage } from "@/features/profile";
import { SystemSettingsPage } from "@/features/settings";
import { OrdersPage, PurchaseOrdersPage, MyOrdersPage, OrderProvider, PurchaseOrderProvider } from "@/features/orders";
import BrandsPage from "@/features/orders/BrandsPage";
import VariantTypesPage from "@/features/orders/VariantTypesPage";
import SuppliersPage from "@/features/orders/SuppliersPage";
import { MainInventoryPage, WarehouseInventoryDashboardPage, SubWarehousesPage, StockAllocationsPage, LeaderInventoryPage, MyInventoryPage, RemittedStocksPage, AdminTeamRemittancesPage, LeaderRemittancePage, LeaderCashDepositsPage, PendingRequestsPage, AdminRequestsPage, LeaderStockRequestPage, MobileSalesStockRequestPage, InventoryProvider, AgentInventoryProvider } from "@/features/inventory";
import TLStockRequestPage from "@/features/inventory/TLStockRequestPage";
import AdminTLRequestsPage from "@/features/inventory/AdminTLRequestsPage";
import { ClientsPage, MyClientsPage, MyTeamsPage, PendingClientsPage } from "@/features/clients";
import { AnalyticsPage, ClientAnalyticsPage } from "@/features/analytics";
import VoidedClientsPage from "@/features/clients/VoidedClientsPage";
import { CalendarPage } from "@/features/calendar";
import { SalesAgentsPage, TasksPage, ArchiveTasksPage, AgentHistoryPage } from "@/features/sales-agents";
import SalesAgentsOnlyPage from "@/features/sales-agents/SalesAgentsOnlyPage";
import TeamManagementPage from "@/features/sales-agents/TeamManagementPage";
import MyTeamPage from "@/features/sales-agents/MyTeamPage";
import ManagerTeamsPage from "@/features/manager/ManagerTeamsPage";
import ManagerTeamInventoryPage from "@/features/manager/ManagerTeamInventoryPage";
import ManagerTeamRemittancesPage from "@/features/manager/ManagerTeamRemittancesPage";
import ManagerRequestsPage from "@/features/manager/ManagerRequestsPage";
import ManagerClientsPage from "@/features/manager/ManagerClientsPage";
import ManagerDashboardPage from "@/features/manager/ManagerDashboardPage";
import { FinancePage } from "@/features/finance";
import PaymentSettingsPage from "@/features/finance/PaymentSettingsPage";
import SystemAdminPage from "@/features/system-admin/SystemAdminPage";
import ManagementPortal from "@/features/system-admin/ManagementPortal";
import { WarRoomPage } from "@/features/war-room";
import NotFound from "@/features/shared/NotFound";
import { AgentRemittanceReminder } from "@/features/shared/components";
import { SupportWidget } from "@/components/SupportWidget";

import { PrefetchController } from "@/features/core/PrefetchController";

const App = () => (
  <PersistQueryClientProvider
    client={queryClient}
    persistOptions={{ persister }}
  >
    <AuthProvider>
      <PrefetchController />
      <OrderProvider>
        <PurchaseOrderProvider>
          <InventoryProvider>
            <AgentInventoryProvider>
              <TooltipProvider>
                <Toaster />
                <Sonner />
                <AgentRemittanceReminder />
                <SupportWidget />
                <BrowserRouter>
                  <Routes>
                    <Route path="/" element={<RoleBasedRedirect />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
                    <Route path="/member-management" element={<ProtectedRoute><SalesAgentsPage /></ProtectedRoute>} />
                    <Route path="/sales-agents" element={<ProtectedRoute><SalesAgentsOnlyPage /></ProtectedRoute>} />
                    <Route path="/team-management" element={<ProtectedRoute><TeamManagementPage /></ProtectedRoute>} />
                    <Route path="/inventory" element={<ProtectedRoute><MainInventoryPage /></ProtectedRoute>} />
                    <Route path="/inventory/main" element={<ProtectedRoute><MainInventoryPage /></ProtectedRoute>} />
                    <Route
                      path="/inventory/board"
                      element={
                        <ProtectedRoute allowedRoles={["warehouse"]}>
                          <WarehouseInventoryDashboardPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/inventory/sub-warehouses"
                      element={
                        <ProtectedRoute allowedRoles={["warehouse"]}>
                          <SubWarehousesPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route path="/inventory/allocations" element={<ProtectedRoute><StockAllocationsPage /></ProtectedRoute>} />
                    <Route path="/inventory/remitted-stocks" element={<ProtectedRoute><RemittedStocksPage /></ProtectedRoute>} />
                    <Route path="/inventory/admin-team-remittances" element={<ProtectedRoute><AdminTeamRemittancesPage /></ProtectedRoute>} />
                    <Route path="/inventory/team-remittances" element={<ProtectedRoute><LeaderRemittancePage /></ProtectedRoute>} />
                    <Route path="/inventory/cash-deposits" element={<ProtectedRoute><LeaderCashDepositsPage /></ProtectedRoute>} />
                    <Route path="/inventory/request" element={<ProtectedRoute><LeaderStockRequestPage /></ProtectedRoute>} />
                    <Route path="/inventory/mobile-request" element={<ProtectedRoute><MobileSalesStockRequestPage /></ProtectedRoute>} />
                    <Route path="/inventory/pending-requests" element={<ProtectedRoute><PendingRequestsPage /></ProtectedRoute>} />
                    <Route path="/inventory/admin-requests" element={<ProtectedRoute><AdminRequestsPage /></ProtectedRoute>} />
                    <Route path="/inventory/tl-stock-requests" element={<ProtectedRoute allowedRoles={['team_leader']}><TLStockRequestPage /></ProtectedRoute>} />
                    <Route path="/inventory/admin-tl-requests" element={<ProtectedRoute allowedRoles={['admin', 'super_admin']}><AdminTLRequestsPage /></ProtectedRoute>} />
                    <Route path="/inventory/leaders" element={<ProtectedRoute><LeaderInventoryPage /></ProtectedRoute>} />
                    <Route path="/leader-inventory" element={<ProtectedRoute><LeaderInventoryPage /></ProtectedRoute>} />
                    <Route path="/team-members" element={<ProtectedRoute><LeaderInventoryPage /></ProtectedRoute>} />
                    <Route path="/leader-inventory/request" element={<ProtectedRoute><LeaderStockRequestPage /></ProtectedRoute>} />
                    <Route path="/my-team" element={<ProtectedRoute><MyTeamPage /></ProtectedRoute>} />
                    <Route path="/manager-teams" element={<ProtectedRoute><ManagerTeamsPage /></ProtectedRoute>} />
                    <Route path="/manager-inventory" element={<ProtectedRoute><ManagerTeamInventoryPage /></ProtectedRoute>} />
                    <Route path="/manager-remittances" element={<ProtectedRoute><ManagerTeamRemittancesPage /></ProtectedRoute>} />
                    <Route path="/manager-requests" element={<ProtectedRoute><ManagerRequestsPage /></ProtectedRoute>} />
                    <Route path="/manager-clients" element={<ProtectedRoute><ManagerClientsPage /></ProtectedRoute>} />
                    <Route path="/manager-dashboard" element={<ProtectedRoute><ManagerDashboardPage /></ProtectedRoute>} />
                    <Route path="/tasks" element={<ProtectedRoute><TasksPage /></ProtectedRoute>} />
                    <Route path="/tasks/archive" element={<ProtectedRoute><ArchiveTasksPage /></ProtectedRoute>} />
                    <Route path="/clients" element={<ProtectedRoute><ClientsPage /></ProtectedRoute>} />
                    <Route path="/clients/pending" element={<ProtectedRoute><PendingClientsPage /></ProtectedRoute>} />
                    <Route path="/voided-clients" element={<ProtectedRoute><VoidedClientsPage /></ProtectedRoute>} />
                    <Route path="/orders" element={<ProtectedRoute><OrdersPage /></ProtectedRoute>} />
                    <Route path="/leader-orders" element={<ProtectedRoute allowedRoles={['team_leader']}><OrdersPage /></ProtectedRoute>} />
                    <Route path="/finance" element={<ProtectedRoute><FinancePage /></ProtectedRoute>} />
                    <Route path="/finance/payment-settings" element={<ProtectedRoute allowedRoles={['super_admin', 'finance']}><PaymentSettingsPage /></ProtectedRoute>} />
                    <Route path="/my-inventory" element={<ProtectedRoute><MyInventoryPage /></ProtectedRoute>} />
                    <Route path="/my-clients" element={<ProtectedRoute><MyClientsPage /></ProtectedRoute>} />
                    <Route path="/my-teams" element={<ProtectedRoute allowedRoles={['team_leader']}><MyTeamsPage /></ProtectedRoute>} />
                    <Route path="/my-orders" element={<ProtectedRoute><MyOrdersPage /></ProtectedRoute>} />
                    <Route path="/my-history" element={<ProtectedRoute><AgentHistoryPage /></ProtectedRoute>} />
                    <Route path="/system-history" element={<ProtectedRoute><SystemHistoryPage /></ProtectedRoute>} />
                    <Route path="/analytics" element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
                    <Route path="/analytics/client/:clientId" element={<ProtectedRoute><ClientAnalyticsPage /></ProtectedRoute>} />
                    <Route path="/calendar" element={<ProtectedRoute><CalendarPage /></ProtectedRoute>} />
                    <Route path="/purchase-orders" element={<ProtectedRoute><PurchaseOrdersPage /></ProtectedRoute>} />
                    <Route path="/brands" element={<ProtectedRoute><BrandsPage /></ProtectedRoute>} />
                    <Route path="/variant-types" element={<ProtectedRoute><VariantTypesPage /></ProtectedRoute>} />
                    <Route path="/suppliers" element={<ProtectedRoute><SuppliersPage /></ProtectedRoute>} />
                    <Route path="/war-room" element={<ProtectedRoute><WarRoomPage /></ProtectedRoute>} />
                    <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
                    <Route path="/system-settings" element={<ProtectedRoute><SystemSettingsPage /></ProtectedRoute>} />
                    <Route path="/system-admin" element={<ProtectedRoute><SystemAdminPage /></ProtectedRoute>} />
                    <Route path="/system-management" element={<ProtectedRoute><ManagementPortal /></ProtectedRoute>} />
                    <Route path="/sys-admin-dashboard" element={<ProtectedRoute><SysAdDashboardPage /></ProtectedRoute>} />
                    <Route path="/super-admin-dashboard" element={<ProtectedRoute><SuperAdminDashboardPage /></ProtectedRoute>} />
                    <Route path="/executive-dashboard" element={<ProtectedRoute><ExecutiveDashboardPage /></ProtectedRoute>} />
                    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </BrowserRouter>
              </TooltipProvider>
            </AgentInventoryProvider>
          </InventoryProvider>
        </PurchaseOrderProvider>
      </OrderProvider>
    </AuthProvider>
  </PersistQueryClientProvider>
);

export default App;
