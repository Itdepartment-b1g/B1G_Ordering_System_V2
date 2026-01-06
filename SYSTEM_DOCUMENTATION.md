# B1G Ordering System (Multi-Tenant B2B) - System Documentation

## 1. System Overview

B1G Ordering System is a **Multi-Tenant B2B Ordering & Inventory Management Platform** designed to streamline sales operations for companies with distributed sales teams. 

**Key Capabilities:**
- **Multi-Tenancy**: Single instance serves multiple companies (`companies` table) with strict data isolation via Row Level Security (RLS).
- **Role-Based Access Control (RBAC)**: Hierarchical roles (`Super Admin` > `Admin` > `Team Leader` > `Sales Agent`).
- **Inventory Management**: Full lifecycle tracking from Supplier Purchase Orders -> Main Warehouse -> Team Leader Allocation -> Agent Stock -> Sales.
- **Sales & CRM**: Mobile-first interface for sales agents to manage clients, take orders (with offline capabilities), and track commissions.
- **Real-Time Analytics**: Dashboards for every role level to monitor performance, stock levels, and revenue.

---

## 2. Technology Stack

### Frontend Application
- **Framework**: [React 18](https://reactjs.org/) with [Vite](https://vitejs.dev/) (Build tool)
- **Language**: [TypeScript](https://www.typescriptlang.org/) (Strict mode enabled)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) with `sales-theme` configuration.
- **UI Components**: [Shadcn UI](https://ui.shadcn.com/) (built on Radix UI).
- **State Management**: [TanStack Query (React Query)](https://tanstack.com/query/latest) for server state & caching.
- **Routing**: [React Router v6](https://reactrouter.com/).
- **Maps**: [React Leaflet](https://react-leaflet.js.org/) for geolocation features.
- **Forms**: `react-hook-form` with `zod` schema validation.

### Backend Infrastructure
- **Platform**: [Supabase](https://supabase.com/) (Backend-as-a-Service).
- **Database**: PostgreSQL with Row Level Security (RLS).
- **Authentication**: Supabase Auth (Email/Password).
- **Serverless Logic**: Supabase Edge Functions (for complex business logic like specialized notifications or aggregations).

---

## 3. Architecture & Design Patterns

### 3.1 Multi-Tenancy Strategy
The system uses **Discriminator Column Multi-Tenancy**.
- Every major table (`profiles`, `orders`, `inventory`, `clients`) has a `company_id` column.
- **Row Level Security (RLS)** policies on PostgreSQL enforce isolation. A user from Company A cannot query rows belonging to Company B.
- **App-Level Verification**: The frontend also ensures `company_id` is passed correctly in mutation payloads, although the backend is the ultimate enforcer.

### 3.2 Feature-Based Directory Structure
The codebase follows a domain-driven structure under `src/features/`. Each feature module contains its own pages, components, hooks, and context.

| Feature Directory | Purpose | Key Components |
| :--- | :--- | :--- |
| `auth` | Login & User Session Management | `LoginPage`, `AuthProvider` |
| `dashboard` | landing stats per role | `AdminDashboard`, `AgentDashboard`, `LeaderDashboard` |
| `inventory` | Stock management hierarchy | `MainInventoryPage`, `StockAllocationsPage` (Leader), `MyInventoryPage` (Agent), `RequestInventoryPage` |
| `orders` | Sales transactions | `PurchaseOrdersPage` (Inbound), `MyOrdersPage` (Outbound), `Cart` |
| `sales-agents` | Team management | `MyTeamPage`, `SalesAgentsTab` |
| `clients` | CRM / Customer Database | `ClientsPage`, `ClientDetails` |
| `finance` | Monetary tracking | `TransactionLogs`, `Remittance` |

### 3.3 State Management & Data Fetching
- **Server State**: Handled by `TanStack Query`. Custom hooks (e.g., `useInventory`, `useOrders`) wrap Supabase queries to provide data + loading/error states.
- **Local State**: React `useState` / `useReducer` for UI interactions (modals, form inputs).
- **Global UI State**: React Context is used sparingly for global app concerns like `AuthContext` (User Session) and `ThemeContext`.

---

## 4. Data Model (Database Schema)

Use `src/types/database.types.ts` as the source of truth. Below are the core entities:

### Users & Hierarchy
- **`companies`**: Tenant root entity.
- **`profiles`**: Extends Supabase `auth.users`. Contains `role` (`super_admin`, `admin`, `team_leader`, `sales_agent`) and `company_id`.
- **`leader_teams`**: Mapping table defining which agents report to which leaders.

### Product Catalog
- **`brands`**: e.g., "VapeBrand X".
- **`variants`**: Specific SKUs (e.g., "Strawberry 5%"). Contains `variant_type` (flavor, device, etc.).

### Inventory (Dual-Layer)
- **`main_inventory`**: Warehouse stock. Owned by Admin.
- **`agent_inventory`**: Stock physically currently held by an agent/leader.
- **`inventory_transactions`**: Audit log of all stock movements (Allocations, Sales, Returns).

### Operations
- **`clients`**: Customers visited by agents. Includes geolocation data.
- **`client_orders`**: Sales made to clients. Linked to `agent_inventory` (decrements stock upon approval/delivery).
- **`purchase_orders`**: Inbound stock from external suppliers to `main_inventory`.
- **`stock_requests`**: Internal workflow: Agent requests stock -> Leader approves -> Inventory moves.

---

## 5. Key Feature Workflows

### 5.1 Stock Allocation Flow
1. **Purchase Order**: Admin creates PO -> Approves it -> Stock added to `main_inventory`.
2. **Allocation**: Admin/Leader uses **Stock Allocations Page** to transfer units from their inventory to a subordinate's `agent_inventory`.
3. **Transaction Log**: An entry is created in `inventory_transactions` recording the movement source and destination.

### 5.2 Sales Process
1. **Client Visit**: Agent selects a Client (or creates one).
2. **Order Creation**: Agent adds items to cart from their `agent_inventory`.
3. **Validation**: System checks if Agent has sufficient `agent_inventory`.
4. **Submission**: Order is created with status `pending` (or `approved` depending on config).
5. **Inventory Update**: Stock is deducted from `agent_inventory`.

### 5.3 Remittance
- Agents mark orders as "Paid".
- Agents submit a "Remittance Report" to their leader.
- Leader verifies cash/bank transfer and marks orders as "Remitted".


## 7. Role Purpose & Guides

The system is designed around a strict hierarchy to model real-world sales operations.

### 7.1 System Administrator (Platform Owner)
**Purpose**: Manages the entire SaaS platform across all tenants.
**Guide**:
- **Tenant Management**: Creating new companies and setting up their initial environments.
- **Platform Oversight**: access to all companies for debugging and support ("Live View" / Impersonation).
- **Global Configuration**: Managing feature flags or system-wide settings.

### 7.2 Administrator (Super Admin / Admin)
**Purpose**: The "God View" of the company. Responsible for the overall health of the business, inventory levels, and user management.
**Guide**:
- **Onboarding**: You are responsible for creating accounts for *Team Leaders* and *Sales Agents*.
- **Procurement**: Only you can create **Purchase Orders** to bring stock from external suppliers into the **Main Inventory**.
- **Stock Control**: You act as the central warehouse. You allocate stock to *Team Leaders* (who then distribute to agents).
- **Approvals**: You have the final say on overriding prices, approving complex stock requests, or resolving disputes.

### 7.3 Team Leader
**Purpose**: Middle management. Bridging the gap between the warehouse (Admin) and the field (Agents).
**Guide**:
- **Team Management**: You supervise a specific group of Sales Agents. You can view their live locations and sales performance.
- **Inventory Distribution**: You request bulk stock from the Admin. Once received, you use the **Allocations Page** to distribute small batches to your agents as they need it.
- **Remittance Collection**: Agents turn over their cash/collections to you. You verify their "Remittance Reports" and mark them as received.

### 7.4 Sales Agent (Field Sales)
**Purpose**: The mobile workforce. usage is optimized for tablets/phones.
**Guide**:
- **My Inventory**: You start your day with stock allocated by your Leader. You are responsible for these units.
- **Sales Visits**: You visit **Clients**. If a client is new, you register them (capturing GPS and photo).
- **Taking Orders**: You create orders for clients. Stock is deducted from your *personal* inventory immediately (or upon approval).
- **End of Day**: You remit CASH sales proceeds to your Leader. **Your unsold inventory stays with you** and carries over to the next day. Stock accumulates over time - you receive new allocations from your leader as needed.

### 7.5 Finance
**Purpose**: Audit and Reporting.
**Guide**:
- **Read-Only Oversight**: Typically has access to Transaction Logs, Remittance histories, and Revenue Dashboards but does not alter inventory or operation settings.
- **Commission Tracking**: Verifying that agents are paid correct commissions based on their sales tiers.
