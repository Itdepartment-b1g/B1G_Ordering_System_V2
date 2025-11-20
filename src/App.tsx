import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Companies from "./pages/Companies";
import Orders from "./pages/Orders";
import Inventory from "./pages/Inventory";
import Clients from "./pages/Clients";
import UsersPage from "./pages/Users";
import Analytics from "./pages/Analytics";
import Reports from "./pages/Reports";
import Team from "./pages/Team";
import Permissions from "./pages/Permissions";
import Unauthorized from "./pages/Unauthorized";
import NotFound from "./pages/NotFound";
import TeamManagement from "./pages/TeamManagement";
import StockAllocations from "./pages/StockAllocations";
import InventoryRequests from "./pages/InventoryRequests";
import RemittedStocks from "./pages/RemittedStocks";
import PendingClients from "./pages/PendingClients";
import VoidedClients from "./pages/VoidedClients";
import PurchaseOrders from "./pages/PurchaseOrders";
import Finance from "./pages/Finance";
import History from "./pages/History";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/unauthorized" element={<Unauthorized />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/companies"
              element={
                <ProtectedRoute allowedRoles={['system_admin']}>
                  <Companies />
                </ProtectedRoute>
              }
            />
            <Route
              path="/orders"
              element={
                <ProtectedRoute>
                  <Orders />
                </ProtectedRoute>
              }
            />
            <Route
              path="/inventory"
              element={
                <ProtectedRoute>
                  <Inventory />
                </ProtectedRoute>
              }
            />
            <Route
              path="/clients"
              element={
                <ProtectedRoute>
                  <Clients />
                </ProtectedRoute>
              }
            />
            <Route
              path="/users"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
                  <UsersPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/team-management"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
                  <TeamManagement />
                </ProtectedRoute>
              }
            />
            <Route
              path="/stock-allocations"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'manager', 'team_leader']}>
                  <StockAllocations />
                </ProtectedRoute>
              }
            />
            <Route
              path="/inventory-requests"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'manager', 'team_leader']}>
                  <InventoryRequests />
                </ProtectedRoute>
              }
            />
            <Route
              path="/remitted-stocks"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'manager', 'team_leader']}>
                  <RemittedStocks />
                </ProtectedRoute>
              }
            />
            <Route
              path="/pending-clients"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'manager', 'team_leader']}>
                  <PendingClients />
                </ProtectedRoute>
              }
            />
            <Route
              path="/voided-clients"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'manager', 'team_leader']}>
                  <VoidedClients />
                </ProtectedRoute>
              }
            />
            <Route
              path="/purchase-orders"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
                  <PurchaseOrders />
                </ProtectedRoute>
              }
            />
            <Route
              path="/finance"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
                  <Finance />
                </ProtectedRoute>
              }
            />
            <Route
              path="/analytics"
              element={
                <ProtectedRoute>
                  <Analytics />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports"
              element={
                <ProtectedRoute>
                  <Reports />
                </ProtectedRoute>
              }
            />
            <Route
              path="/history"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
                  <History />
                </ProtectedRoute>
              }
            />
            <Route
              path="/team"
              element={
                <ProtectedRoute allowedRoles={['manager', 'team_leader']}>
                  <Team />
                </ProtectedRoute>
              }
            />
            <Route
              path="/permissions"
              element={
                <ProtectedRoute allowedRoles={['super_admin']}>
                  <Permissions />
                </ProtectedRoute>
              }
            />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
