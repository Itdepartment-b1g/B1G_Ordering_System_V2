## Realtime Data Checklist

This file tracks which pages should listen to Supabase Realtime for live updates (no manual refresh, minimal loading states).

### General Pattern

- **React Query pages/hooks**  
  - Use `subscribeToTable('<table_name>', ...)` from `src/lib/realtime.helpers.ts`.  
  - On change, call `queryClient.invalidateQueries({ queryKey: ['<query_key>', ...] })`.  
- **Context / local state pages**  
  - Use `subscribeToTable('<table_name>', ...)`.  
  - On change, call your `fetchData()` (optionally debounced) to refresh state.  
  - Clean up with `unsubscribe(channel)` or `supabase.removeChannel(channel)` in `useEffect` cleanup.

---

### Orders (tables: `client_orders`, `client_order_items`, `cash_deposits`)

- **Pages / contexts that should be realtime**
  - `features/orders/OrderContext.tsx` ✅ (subscribes to `client_orders`, `client_order_items`, `cash_deposits`)
  - `features/orders/OrdersPage.tsx` ✅ (uses `useOrders` from `OrderContext`)
  - `features/orders/MyOrdersPage.tsx` ✅ (uses `useOrders` from `OrderContext`)
  - Order-details dialogs in:
    - `features/orders/OrdersPage.tsx` ✅ (fed by `OrderContext`)
    - `features/inventory/MyInventoryPage.tsx` ✅ (remittance flow uses realtime orders)
  - Dashboard stats in `features/dashboard/dashboardHooks.ts` ✅ (subscribes to `client_orders`)

---

### Clients (tables: `clients`, `client_orders`)

- **Pages / hooks that should be realtime**
  - `features/clients/hooks.ts` (`useMyClients`) ✅ (subscribes to `clients`, `client_orders`)
  - `features/clients/ClientsPage.tsx` ✅ (subscribes to `clients`, `client_orders`)
  - `features/clients/PendingClientsPage.tsx` ✅ (subscribes to `clients`)
  - `features/clients/VoidedClientsPage.tsx` ✅ (subscribes to `clients`)
  - `features/clients/MyClientsPage.tsx` ✅ (uses `useMyClients`)
  - Dashboard stats in `features/dashboard/dashboardHooks.ts` ✅ (subscribes to `clients`, `client_orders`)

---

### Inventory & Requests

- **Core tables**
  - `main_inventory`
  - `agent_inventory`
  - `variants`, `brands`
  - `inventory_transactions`
  - `stock_requests`
  - `inventory_requests`
  - `remittances_log`

- **Pages / contexts that should be realtime**
  - `features/inventory/AgentInventoryContext.tsx` ✅ (subscribes to `agent_inventory`)
  - `features/inventory/MyInventoryPage.tsx` ✅ (subscribes to `client_orders` for remittance view; agent inventory via context)
  - `features/inventory/AdminRequestsPage.tsx` ✅ (subscribes to `stock_requests`, `main_inventory`)
  - `features/inventory/requestHooks.ts` ✅ (subscribes to `stock_requests`)
  - `features/inventory/RemittedStocksPage.tsx` ✅ (subscribes to `remittances_log`, `client_orders`)
  - `features/inventory/StockAllocationsPage.tsx` ✅ (uses realtime helpers if present; verify usage when editing)
  - Dashboard stats in `features/dashboard/dashboardHooks.ts` ✅ (subscribes to `main_inventory`, `stock_requests`, `remittances_log`)

> When adding new inventory-related pages, ensure they subscribe to the relevant table(s) above.

---

### Finance (tables: `financial_transactions`, `cash_deposits`, `client_orders`)

- **Pages / contexts that should be realtime**
  - `features/finance/FinancePage.tsx` ✅ (subscribes to `financial_transactions`)
  - `features/orders/OrdersPage.tsx` ✅ (finance approvals via `OrderContext` realtime)
  - `features/inventory/RemittedStocksPage.tsx` ✅ (cash remittance + orders)
  - Any dedicated "Cash Deposits" page under inventory/finance (should subscribe to `cash_deposits`)
  - Finance stats in `features/dashboard/dashboardHooks.ts` ✅ (subscribes to `client_orders`, `cash_deposits`, `financial_transactions`)

---

### Teams / Users / Profiles / Companies

- **Core tables**
  - `profiles`
  - `leader_teams`
  - `companies`
  - `events` (if surfaced as history/audit)

- **Pages / components that should be realtime**
  - `features/sales-agents/SalesAgentsPage.tsx` ✅ (subscribes to `profiles`, `client_orders`)
  - `features/sales-agents/components/SalesAgentsTab.tsx` ✅ (uses realtime helpers)
  - `features/sales-agents/components/TeamManagementTab.tsx` ✅ (subscribes to `profiles`, `leader_teams`)
  - `features/sales-agents/AgentHistoryPage.tsx` ✅ (uses realtime helpers if present)
  - Member / user management screens under settings (should subscribe to `profiles`, `companies`)
  - Stats in `features/dashboard/dashboardHooks.ts` ✅ (subscribes to `profiles`, `leader_teams`, `companies`)

---

### Notifications & Activity

- **Core tables**
  - `notifications`
  - `events` (optional for raw audit)

- **Pages / components that should be realtime**
  - Global notifications panel/dropdown (should use `subscribeToNotifications(userId, ...)`)
  - Recent activity widgets in `features/dashboard/dashboardHooks.ts` ✅ (subscribes to `notifications`)
  - Any notifications center page (should subscribe to `notifications` for current user)

---

### Procurement & Suppliers

- **Core tables**
  - `purchase_orders`
  - `purchase_order_items`
  - `suppliers`

- **Pages that should be realtime**
  - Purchase order listing / management pages (should subscribe to `purchase_orders`)
  - Supplier management page (should subscribe to `suppliers`)

---

### Auth / Profile Basics

- **Core tables**
  - `profiles`
  - `companies`

- **Where used**
  - `features/auth/AuthContext.tsx` ✅ (subscribes to `profiles`, `companies` to keep user/company state fresh)

---

### Tables Supported by `realtime.helpers.ts`

From `TableName` in `src/lib/realtime.helpers.ts`:

- `profiles`
- `companies`
- `brands`
- `variants`
- `main_inventory`
- `agent_inventory`
- `suppliers`
- `purchase_orders`
- `purchase_order_items`
- `clients`
- `client_orders`
- `client_order_items`
- `inventory_transactions`
- `financial_transactions`
- `notifications`
- `events`
- `remittances_log`
- `inventory_requests`
- `stock_requests`
- `leader_teams`
- `cash_deposits`

For **any new page** that reads one of these tables, ensure:

- It uses a **data hook or context** that:
  - Fetches the initial data, and
  - Sets up `subscribeToTable` for the corresponding table(s) to keep the UI live.

