# Admin Capabilities Flowchart
## B1G Ordering System - Admin Role Permissions

---

## 📊 Overview

This document outlines all capabilities and restrictions for **Admin** users in the B1G Ordering System.

---

## 🎯 Admin Access Matrix

### ✅ **FULL ACCESS** - Admins CAN:

#### 1. **Dashboard & Analytics**
- ✅ View comprehensive dashboard with:
  - Total revenue (all approved orders)
  - Total orders count
  - Active orders
  - Sales agents count
  - Products count
  - Low stock alerts
- ✅ View revenue charts (6-month overview)
- ✅ View top performing agents (all agents)
- ✅ View top flavors/products
- ✅ Access AI Analytics page
- ✅ View all analytics data (not filtered by team)

#### 2. **Member Management**
- ✅ **Sales Agents Management:**
  - Create new sales agents
  - Edit agent information (name, email, phone, region, cities, position)
  - Delete/deactivate agents
  - Reset agent passwords (to `tempPassword123!`)
  - View all agents (active and inactive)
  - Filter agents by status
  - Search agents
- ✅ **Team Management:**
  - View all teams
  - Assign agents to leaders
  - Unassign agents from leaders
  - Promote agents to leaders
  - Unpromote leaders to agents
  - View all team structures

#### 3. **Inventory Management**
- ✅ **Main Inventory:**
  - View all inventory (all brands, variants, stock levels)
  - Add/edit/delete brands
  - Add/edit/delete variants
  - Update stock quantities
  - Set selling prices
  - View all inventory transactions
- ✅ **Stock Allocations:**
  - View all stock allocations (across all leaders and agents)
  - See allocation history
  - Track allocated quantities
- ✅ **Inventory Requests:**
  - View all inventory requests (agent-to-leader, leader-to-admin)
  - Approve/reject inventory requests
  - Forward requests
  - View request history
- ✅ **Remitted Stocks:**
  - View all remitted stocks (from all agents)
  - See remittance history
  - View remittance details and signatures

#### 4. **Client Management**
- ✅ **Clients Database:**
  - View all clients (from all agents)
  - Create clients (without agent assignment - can be assigned later)
  - Edit client information
  - Delete/void clients
  - Search and filter clients
  - View client order history
  - View client statistics (total orders, total spent)
- ✅ **Pending Clients:**
  - View all pending client approvals
  - Approve/reject pending clients
  - See pending client requests from all agents
- ✅ **Voided Clients:**
  - View all voided clients
  - Restore voided clients

#### 5. **Order Management**
- ✅ **Order List:**
  - View ALL orders (from all agents)
  - Filter orders by status:
    - All orders
    - Pending (Agent Pending)
    - Pending (Leader Review)
    - Pending (Admin Review)
    - Approved
    - Rejected
  - View order details (full access)
  - **Approve orders** (final approval after leader approval)
  - **Reject orders** (can reject at any stage)
  - View order history
  - See pricing details (tax, discount) - **ONLY admins can see this**
  - View payment proofs
  - View client signatures
- ✅ **Purchase Orders:**
  - Create purchase orders
  - View all purchase orders
  - Edit purchase orders
  - Add suppliers
  - Manage purchase order items

#### 6. **Finance**
- ✅ View financial dashboard
- ✅ View all financial transactions
- ✅ View revenue reports
- ✅ Track payments and receipts
- ✅ View payment proofs

#### 7. **System History & Audit**
- ✅ **System History:**
  - View ALL system events (not filtered)
  - Filter by action type:
    - Orders
    - Clients
    - Allocations
    - Tasks
    - Financial
    - Teams
    - Inventory
  - Filter by date range (From Date / To Date)
  - View detailed event information
  - See all actor actions (admins, leaders, agents)
  - Export history data

#### 8. **Profile Management**
- ✅ Edit own profile information
- ✅ Update own password
- ✅ View own profile details
- ✅ Update contact information

#### 9. **Notifications**
- ✅ Receive all notifications
- ✅ View notifications from all users
- ✅ Mark notifications as read
- ✅ See notification history

---

### ❌ **RESTRICTIONS** - Admins CANNOT:

#### 1. **Target Setting**
- ❌ **Cannot set monthly targets for agents** (only Leaders can set targets)
- ❌ Cannot access "Set Targets" button in Analytics page (hidden for admins)

#### 2. **Direct Inventory Operations**
- ❌ Cannot directly allocate inventory to agents (must go through leaders)
- ❌ Cannot remit inventory (only agents can remit to leaders)
- ❌ Cannot request inventory (only agents/leaders can request)

#### 3. **Order Creation**
- ❌ Cannot create client orders (only agents can create orders)
- ❌ Cannot create orders on behalf of agents

#### 4. **Task Management**
- ❌ Cannot create tasks for agents (only leaders can create tasks)
- ❌ Cannot view individual agent tasks (unless through system history)

#### 5. **Calendar**
- ❌ Cannot access calendar/task management features
- ❌ Cannot create calendar events

#### 6. **My Inventory / My Orders**
- ❌ Cannot access "My Inventory" page (admins don't have personal inventory)
- ❌ Cannot access "My Orders" page (admins don't create orders)
- ❌ Cannot access "My Clients" page (admins manage all clients, not personal)

---

## 🔄 Complete Admin Capabilities Flowchart

```
                                    ┌─────────────────────────────┐
                                    │       ADMIN USER            │
                                    │   (Full System Access)      │
                                    └──────────────┬──────────────┘
                                                   │
                    ┌──────────────────────────────┼──────────────────────────────┐
                    │                              │                              │
                    ↓                              ↓                              ↓
        ┌───────────────────────┐    ┌───────────────────────┐    ┌───────────────────────┐
        │    DASHBOARD &        │    │   MEMBER MANAGEMENT   │    │   INVENTORY           │
        │    ANALYTICS          │    │                       │    │   MANAGEMENT          │
        └───────────┬───────────┘    └───────────┬───────────┘    └───────────┬───────────┘
                    │                            │                            │
        ┌───────────┴───────────┐    ┌───────────┴───────────┐    ┌───────────┴───────────┐
        │                       │    │                       │    │                       │
        ├─ View Revenue         │    ├─ Sales Agents         │    ├─ Main Inventory       │
        ├─ View Orders Count    │    │  • Create Agent       │    │  • View All Stock     │
        ├─ View Agents Count    │    │  • Edit Agent         │    │  • Add/Edit Brands    │
        ├─ View Products Count  │    │  • Delete Agent       │    │  • Add/Edit Variants  │
        ├─ Revenue Charts       │    │  • Reset Password     │    │  • Update Stock Qty   │
        ├─ Top Agents           │    │    (tempPassword123!) │    │  • Set Prices         │
        ├─ Top Products         │    │                       │    │                       │
        └─ AI Analytics         │    ├─ Team Management      │    ├─ Stock Allocations    │
                                │    │  • Assign to Leader   │    │  • View All Allocs    │
                                    │  • Unassign            │    │  • View History       │
                                    │  • Promote to Leader   │    │                       │
                                    │  • Unpromote Leader    │    ├─ Inventory Requests   │
                                    └───────────────────────┘    │  • View All Requests   │
                                                                 │  • Approve/Reject      │
                                                                 │  • Forward Request     │
                                                                 │                       │
                                                                 ├─ Remitted Stocks      │
                                                                 │  • View All Remits    │
                                                                 │  • View Signatures    │
                                                                 └───────────────────────┘

                    ┌───────────────────────┐    ┌───────────────────────┐    ┌───────────────────────┐
                    │   CLIENT MANAGEMENT   │    │   ORDER MANAGEMENT    │    │   SYSTEM & AUDIT      │
                    └───────────┬───────────┘    └───────────┬───────────┘    └───────────┬───────────┘
                                │                            │                            │
                ┌───────────────┴───────────────┐    ┌───────┴────────┐          ┌───────┴────────┐
                │                               │    │                │          │                │
                ├─ Clients Database             │    ├─ Order List    │          ├─ System History│
                │  • View All Clients           │    │  • View ALL    │          │  • View ALL    │
                │  • Create Client              │    │    Orders      │          │    Events      │
                │    (No Agent Assignment)      │    │  • Filter by   │          │  • Filter by   │
                │  • Edit Client                │    │    Status      │          │    Action Type │
                │  • Delete/Void Client         │    │  • View Details│          │  • Filter by   │
                │  • Search/Filter              │    │  • View Pricing│          │    Date Range  │
                │                               │    │    (Tax/Disc)  │          │                │
                ├─ Pending Clients              │    │                │          ├─ Finance       │
                │  • View All Pending           │    │  • Approve     │          │  • View All    │
                │  • Approve/Reject             │    │    (Final Auth)│          │    Transactions│
                │                               │    │  • Reject      │          │  • View Reports│
                ├─ Voided Clients               │    │    (Any Stage) │          │                │
                │  • View All Voided            │    │                │          ├─ Notifications │
                │  • Restore Client             │    ├─ Purchase Orders│         │  • View ALL    │
                └───────────────────────────────┘    │  • Create PO    │          │    Notifications│
                                                     │  • View All PO  │          │                │
                                                     │  • Edit PO      │          ├─ Profile       │
                                                     │  • Manage       │          │  • Edit Own    │
                                                     │    Suppliers    │          │  • Update Pwd  │
                                                     └─────────────────┘          └────────────────┘

                                    ┌─────────────────────────────────────────────┐
                                    │         ORDER APPROVAL WORKFLOW             │
                                    └─────────────────────────────────────────────┘
                                    
                                    Agent Creates Order
                                              │
                                              ↓
                                    Leader Approves (First)
                                              │
                                              ↓
                                    [Admin Sees Order]
                                    Status: Leader Approved
                                              │
                                              ↓
                                    Admin Reviews Order
                                    (Final Authority)
                                              │
                                    ┌─────────┴─────────┐
                                    │                   │
                                    ↓                   ↓
                            ┌───────────┐       ┌───────────┐
                            │  Approve  │       │  Reject   │
                            └─────┬─────┘       └─────┬─────┘
                                  │                   │
                                  ↓                   ↓
                            ┌───────────┐       ┌───────────┐
                            │   Order   │       │   Order   │
                            │  Status:  │       │  Status:  │
                            │   Admin   │       │  Rejected │
                            │ Approved  │       │           │
                            └───────────┘       └───────────┘

                                    ┌─────────────────────────────────────────────┐
                                    │         ADMIN RESTRICTIONS                  │
                                    │         (What Admin CANNOT Do)              │
                                    └─────────────────────────────────────────────┘
                                    
                                    ❌ Set Agent Targets (Leaders Only)
                                    ❌ Create Orders (Agents Only)
                                    ❌ Request Inventory (Agents/Leaders Only)
                                    ❌ Remit Inventory (Agents Only)
                                    ❌ Create Tasks (Leaders Only)
                                    ❌ Access "My Inventory" Page
                                    ❌ Access "My Orders" Page
                                    ❌ Access "My Clients" Page
                                    ❌ Access Calendar/Tasks
```

---

## 📋 Quick Reference: Admin vs Other Roles

| Feature | Admin | Leader | Agent |
|---------|-------|--------|-------|
| **View All Orders** | ✅ | ❌ (Team only) | ❌ (Own only) |
| **Approve Orders** | ✅ (Final) | ✅ (First) | ❌ |
| **View Pricing (Tax/Discount)** | ✅ | ❌ | ❌ |
| **Create Agents** | ✅ | ❌ | ❌ |
| **Reset Passwords** | ✅ | ❌ | ❌ |
| **View All Clients** | ✅ | ❌ (Team only) | ❌ (Own only) |
| **Create Clients (No Agent)** | ✅ | ❌ | ❌ |
| **View All Inventory** | ✅ | ❌ (Own + Team) | ❌ (Own only) |
| **Set Agent Targets** | ❌ | ✅ | ❌ |
| **Create Tasks** | ❌ | ✅ | ❌ |
| **View System History** | ✅ (All) | ❌ (Team only) | ❌ (Own only) |
| **View All Remittances** | ✅ | ❌ (Team only) | ❌ (Own only) |
| **Create Orders** | ❌ | ❌ | ✅ |
| **Request Inventory** | ❌ | ✅ | ✅ |
| **Remit Inventory** | ❌ | ❌ | ✅ |

---

## 🔐 Security & Permissions

### **Data Visibility:**
- ✅ Admins can see **ALL** data across the entire system
- ✅ No filtering by team or agent (except when viewing specific agent details)
- ✅ Full audit trail access

### **Actions:**
- ✅ Admins can perform **most** administrative actions
- ✅ Admins have **final approval** authority for orders
- ✅ Admins can **override** most restrictions
- ❌ Admins **cannot** perform agent-specific actions (create orders, remit inventory)

---

## 📝 Notes

1. **Password Reset:** All agent passwords are reset to `tempPassword123!`
2. **Order Approval:** Admins provide the final approval after leader approval
3. **Client Creation:** Admins can create clients without assigning them to agents initially
4. **Target Setting:** Only leaders can set monthly targets for their agents (admins cannot)
5. **Pricing Visibility:** Only admins can see tax and discount fields in orders
6. **System History:** Admins see all events, not filtered by team or agent

---

## 🎯 Summary

**Admin Role = Full System Oversight + Final Approval Authority**

Admins have comprehensive access to view and manage all aspects of the system, with the ability to:
- Oversee all operations
- Approve/reject orders (final authority)
- Manage all users (agents and leaders)
- View all data and reports
- Set system-wide configurations

However, admins are restricted from:
- Performing agent-specific operations (creating orders, remitting inventory)
- Setting agent targets (leader responsibility)
- Creating tasks for agents (leader responsibility)

---

*Last Updated: Based on current codebase analysis*
*Version: 1.0*

