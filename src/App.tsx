import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, ProtectedRoute, LoginPage } from "@/features/auth";
import { DashboardPage, AdminHistoryPage, SysAdDashboardPage, SuperAdminDashboardPage } from "@/features/dashboard";
import { ProfilePage } from "@/features/profile";
import { OrdersPage, PurchaseOrdersPage, MyOrdersPage, OrderProvider, PurchaseOrderProvider } from "@/features/orders";
import { MainInventoryPage, StockAllocationsPage, LeaderInventoryPage, MyInventoryPage, RemittedStocksPage, LeaderRemittancePage, RequestInventoryPage, PendingRequestsPage, AdminRequestsPage, InventoryProvider, AgentInventoryProvider } from "@/features/inventory";
import { ClientsPage, MyClientsPage, PendingClientsPage } from "@/features/clients";
import { AnalyticsPage } from "@/features/analytics";
import VoidedClientsPage from "@/features/clients/VoidedClientsPage";
import { CalendarPage } from "@/features/calendar";
import { SalesAgentsPage, TasksPage, ArchiveTasksPage, AgentHistoryPage } from "@/features/sales-agents";
import SalesAgentsOnlyPage from "@/features/sales-agents/SalesAgentsOnlyPage";
import TeamManagementPage from "@/features/sales-agents/TeamManagementPage";
import MyTeamPage from "@/features/sales-agents/MyTeamPage";
import { FinancePage } from "@/features/finance";
import SystemAdminPage from "@/features/system-admin/SystemAdminPage";
import NotFound from "@/features/shared/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <OrderProvider>
        <PurchaseOrderProvider>
          <InventoryProvider>
            <AgentInventoryProvider>
              <TooltipProvider>
                <Toaster />
                <Sonner />
                <BrowserRouter>
                  <Routes>
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
                    <Route path="/member-management" element={<ProtectedRoute><SalesAgentsPage /></ProtectedRoute>} />
                    <Route path="/sales-agents" element={<ProtectedRoute><SalesAgentsOnlyPage /></ProtectedRoute>} />
                    <Route path="/team-management" element={<ProtectedRoute><TeamManagementPage /></ProtectedRoute>} />
                    <Route path="/inventory" element={<ProtectedRoute><MainInventoryPage /></ProtectedRoute>} />
                    <Route path="/inventory/main" element={<ProtectedRoute><MainInventoryPage /></ProtectedRoute>} />
                    <Route path="/inventory/allocations" element={<ProtectedRoute><StockAllocationsPage /></ProtectedRoute>} />
                    <Route path="/inventory/remitted-stocks" element={<ProtectedRoute><RemittedStocksPage /></ProtectedRoute>} />
                    <Route path="/inventory/team-remittances" element={<ProtectedRoute><LeaderRemittancePage /></ProtectedRoute>} />
                    <Route path="/inventory/request" element={<ProtectedRoute><RequestInventoryPage /></ProtectedRoute>} />
                    <Route path="/inventory/pending-requests" element={<ProtectedRoute><PendingRequestsPage /></ProtectedRoute>} />
                    <Route path="/inventory/admin-requests" element={<ProtectedRoute><AdminRequestsPage /></ProtectedRoute>} />
                    <Route path="/inventory/leaders" element={<ProtectedRoute><LeaderInventoryPage /></ProtectedRoute>} />
                    <Route path="/leader-inventory" element={<ProtectedRoute><LeaderInventoryPage /></ProtectedRoute>} />
                    <Route path="/team-members" element={<ProtectedRoute><LeaderInventoryPage /></ProtectedRoute>} />
                    <Route path="/my-team" element={<ProtectedRoute><MyTeamPage /></ProtectedRoute>} />
                    <Route path="/tasks" element={<ProtectedRoute><TasksPage /></ProtectedRoute>} />
                    <Route path="/tasks/archive" element={<ProtectedRoute><ArchiveTasksPage /></ProtectedRoute>} />
                    <Route path="/clients" element={<ProtectedRoute><ClientsPage /></ProtectedRoute>} />
                    <Route path="/clients/pending" element={<ProtectedRoute><PendingClientsPage /></ProtectedRoute>} />
                    <Route path="/voided-clients" element={<ProtectedRoute><VoidedClientsPage /></ProtectedRoute>} />
                    <Route path="/orders" element={<ProtectedRoute><OrdersPage /></ProtectedRoute>} />
                    <Route path="/finance" element={<ProtectedRoute><FinancePage /></ProtectedRoute>} />
                    <Route path="/my-inventory" element={<ProtectedRoute><MyInventoryPage /></ProtectedRoute>} />
                    <Route path="/my-clients" element={<ProtectedRoute><MyClientsPage /></ProtectedRoute>} />
                    <Route path="/my-orders" element={<ProtectedRoute><MyOrdersPage /></ProtectedRoute>} />
                    <Route path="/my-history" element={<ProtectedRoute><AgentHistoryPage /></ProtectedRoute>} />
                    <Route path="/system-history" element={<ProtectedRoute><AdminHistoryPage /></ProtectedRoute>} />
                    <Route path="/analytics" element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
                    <Route path="/calendar" element={<ProtectedRoute><CalendarPage /></ProtectedRoute>} />
                    <Route path="/purchase-orders" element={<ProtectedRoute><PurchaseOrdersPage /></ProtectedRoute>} />
                    <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
                    <Route path="/system-admin" element={<ProtectedRoute><SystemAdminPage /></ProtectedRoute>} />
                    <Route path="/sys-admin-dashboard" element={<ProtectedRoute><SysAdDashboardPage /></ProtectedRoute>} />
                    <Route path="/super-admin-dashboard" element={<ProtectedRoute><SuperAdminDashboardPage /></ProtectedRoute>} />
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
  </QueryClientProvider>
);

export default App;
