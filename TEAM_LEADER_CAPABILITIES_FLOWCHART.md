# Team Leader Capabilities Flowchart
## B1G Ordering System - Team Leader Role Permissions

---

## 📊 Overview

This document outlines all capabilities and restrictions for **Team Leader** users in the B1G Ordering System.

---

## 🎯 Team Leader Access Matrix

### ✅ **FULL ACCESS** - Team Leaders CAN:

#### 1. **Dashboard & Overview**
- ✅ View personal dashboard
- ✅ See notifications for team activities
- ✅ View recent activity
- ✅ Monitor team updates

#### 2. **Team Management**
- ✅ View all agents assigned to their team
- ✅ See agent information (name, email, status, cities)
- ✅ Monitor team performance
- ✅ View team statistics

#### 3. **Order Management**
- ✅ View all orders from team agents
- ✅ **Approve orders** (first approval - before admin)
- ✅ **Reject orders** from team agents
- ✅ View order details (without tax/discount - admin only)
- ✅ View payment proofs and signatures
- ✅ Filter orders by status
- ✅ View personal orders (if leader also acts as agent)

#### 4. **Inventory Management**
- ✅ View own inventory (allocated to leader)
- ✅ View available stock (stock minus allocated to team)
- ✅ **Approve inventory requests** from team agents
- ✅ **Reject inventory requests** from team agents
- ✅ Forward requests to admin
- ✅ View team remittances (inventory returns from agents)
- ✅ View remittance signatures
- ✅ Request inventory from admin
- ✅ View teams inventory (all leaders)

#### 5. **Client Management**
- ✅ View own clients (if leader also acts as agent)
- ✅ View client order history
- ✅ See client statistics

#### 6. **Task Management**
- ✅ **Create tasks** for team agents
- ✅ View all tasks (today's, all, archive)
- ✅ View task completion status
- ✅ Archive completed tasks
- ✅ Assign tasks to specific agents

#### 7. **Analytics & Targets**
- ✅ Access Analytics page
- ✅ View Agent KPI section (filtered to own team only)
- ✅ **Set monthly targets** for team agents:
  - Target Clients
  - Target Revenue
  - Target Quantity
- ✅ View achievement percentages
- ✅ Monitor agent performance

#### 8. **Team History**
- ✅ View all activities from team agents
- ✅ Filter by action type
- ✅ Filter by agent
- ✅ Filter by date range
- ✅ Track team activity

#### 9. **Calendar**
- ✅ View calendar with tasks
- ✅ See task schedules
- ✅ Plan team activities

#### 10. **Profile Management**
- ✅ Edit own profile information
- ✅ Update own password
- ✅ View own profile details

#### 11. **Notifications**
- ✅ Receive notifications for team activities
- ✅ View notifications from team agents
- ✅ Mark notifications as read

---

### ❌ **RESTRICTIONS** - Team Leaders CANNOT:

#### 1. **User Management**
- ❌ Cannot create agents (admin only)
- ❌ Cannot edit agent information (admin only)
- ❌ Cannot delete/deactivate agents (admin only)
- ❌ Cannot reset agent passwords (admin only)
- ❌ Cannot promote agents to leaders (admin only)
- ❌ Cannot assign agents to other leaders (admin only)

#### 2. **Order Management**
- ❌ Cannot see tax and discount fields (admin only)
- ❌ Cannot provide final approval (admin has final authority)
- ❌ Cannot view orders from other teams
- ❌ Cannot approve orders from other leaders' teams

#### 3. **Inventory Management**
- ❌ Cannot manage main inventory (admin only)
- ❌ Cannot add/edit/delete brands (admin only)
- ❌ Cannot add/edit/delete variants (admin only)
- ❌ Cannot set selling prices (admin only)
- ❌ Cannot view all inventory requests (only team requests)
- ❌ Cannot view all remittances (only team remittances)

#### 4. **Client Management**
- ❌ Cannot create clients without agent assignment (admin only)
- ❌ Cannot view all clients (only own clients)
- ❌ Cannot approve pending clients (admin only)
- ❌ Cannot void/restore clients (admin only)

#### 5. **System-Wide Access**
- ❌ Cannot view system history (only team history)
- ❌ Cannot view all analytics (only team analytics)
- ❌ Cannot access finance dashboard (admin only)
- ❌ Cannot view purchase orders (admin only)

---

## 🔄 Complete Team Leader Capabilities Flowchart

```
                                    ┌─────────────────────────────┐
                                    │      TEAM LEADER USER       │
                                    │   (Team Management Access)  │
                                    └──────────────┬──────────────┘
                                                   │
                    ┌──────────────────────────────┼──────────────────────────────┐
                    │                              │                              │
                    ↓                              ↓                              ↓
        ┌───────────────────────┐    ┌───────────────────────┐    ┌───────────────────────┐
        │    DASHBOARD &        │    │   MY TEAM             │    │   ORDER MANAGEMENT    │
        │    OVERVIEW           │    │   MANAGEMENT          │    │                       │
        └───────────┬───────────┘    └───────────┬───────────┘    └───────────┬───────────┘
                    │                            │                            │
        ┌───────────┴───────────┐    ┌───────────┴───────────┐    ┌───────────┴───────────┐
        │                       │    │                       │    │                       │
        ├─ View Dashboard      │    ├─ View Team Agents    │    ├─ View Team Orders    │
        ├─ View Notifications  │    │  • Agent Info        │    │  • Filter by Status   │
        ├─ Recent Activity     │    │  • Agent Status      │    │  • View Details       │
        └─ Team Updates        │    │  • Assigned Cities   │    │  • View Payment Proof │
                                │    │  • Performance       │    │  • View Signatures    │
                                │    └───────────────────────┘    │                       │
                                │                                ├─ Approve Orders       │
                                │                                │  (First Approval)     │
                                │                                │                       │
                                │                                ├─ Reject Orders        │
                                │                                │  (With Reason)        │
                                │                                │                       │
                                │                                ├─ View My Orders       │
                                │                                │  (If also agent)      │
                                │                                └───────────────────────┘

        ┌───────────────────────┐    ┌───────────────────────┐    ┌───────────────────────┐
        │   INVENTORY           │    │   TASK MANAGEMENT     │    │   ANALYTICS &         │
        │   MANAGEMENT          │    │                       │    │   TARGETS             │
        └───────────┬───────────┘    └───────────┬───────────┘    └───────────┬───────────┘
                    │                            │                            │
        ┌───────────┴───────────┐    ┌───────────┴───────────┐    ┌───────────┴───────────┐
        │                       │    │                       │    │                       │
        ├─ My Inventory        │    ├─ Create Tasks        │    ├─ View Agent KPI      │
        │  • View Stock        │    │  • Assign to Agent   │    │  (Team Only)          │
        │  • View Available    │    │  • Set Due Date      │    │                       │
        │  • View Prices       │    │  • Set Priority      │    │  • Orders (T vs A)    │
        │                       │    │                       │    │  • Clients (T vs A)   │
        ├─ Teams Inventory     │    ├─ View Tasks          │    │  • Revenue (T vs A)   │
        │  • All Leaders       │    │  • Today's Tasks     │    │  • Quantity (T vs A)  │
        │                       │    │  • All Tasks         │    │  • Achievement %      │
        ├─ Pending Requests    │    │  • Archive Tasks     │    │                       │
        │  • From Team Agents  │    │                       │    ├─ Set Targets         │
        │  • Grouped by Agent  │    ├─ Track Completion    │    │  • Target Clients     │
        │  • Review Request    │    │  • View History      │    │  • Target Revenue     │
        │                       │    └───────────────────────┘    │  • Target Quantity    │
        ├─ Approve Requests    │                                │  • Monthly Targets    │
        │  • Adjust Quantities │                                │                       │
        │  • Add Notes         │                                ├─ Monitor Performance  │
        │                       │                                │  • Track Achievement  │
        ├─ Reject Requests     │                                │  • Identify Issues    │
        │  • With Reason       │                                │  • Recognize Top      │
        │                       │                                └───────────────────────┘
        ├─ Forward Requests    │
        │  • To Admin          │
        │                       │
        ├─ Request Inventory   │
        │  • From Admin        │
        │                       │
        ├─ Team Remittances    │
        │  • View Returns      │
        │  • View Signatures   │
        │  • Track Orders      │
        └───────────────────────┘

        ┌───────────────────────┐    ┌───────────────────────┐    ┌───────────────────────┐
        │   CLIENT MANAGEMENT   │    │   TEAM HISTORY        │    │   PROFILE &           │
        │                       │    │                       │    │   SETTINGS            │
        └───────────┬───────────┘    └───────────┬───────────┘    └───────────┬───────────┘
                    │                            │                            │
        ┌───────────┴───────────┐    ┌───────────┴───────────┐    ┌───────────┴───────────┐
        │                       │    │                       │    │                       │
        ├─ My Clients          │    ├─ View Team Events    │    ├─ Edit Profile         │
        │  • View Own Clients  │    │  • All Team Actions  │    │  • Name, Phone        │
        │  • View Order History│    │  • Filter by Type    │    │  • Address, Region    │
        │  • View Statistics   │    │  • Filter by Agent   │    │  • (Cities Read-Only) │
        └───────────────────────┘    │  • Filter by Date    │    │                       │
                                     │  • Track Activity    │    ├─ Change Password     │
                                     └───────────────────────┘    │  • Current Password   │
                                                                  │  • New Password       │
                                                                  │  • Confirm Password   │
                                                                  └───────────────────────┘

                                    ┌─────────────────────────────────────────────┐
                                    │         ORDER APPROVAL WORKFLOW             │
                                    │         (Team Leader - First Approval)      │
                                    └─────────────────────────────────────────────┘
                                    
                                    Agent Creates Order
                                              │
                                              ↓
                                    [Leader Sees Order]
                                    Status: Agent Pending
                                              │
                                              ↓
                                    Leader Reviews Order
                                    (First Approval Authority)
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
                            │  Leader   │       │  Rejected │
                            │ Approved  │       │           │
                            └─────┬─────┘       └───────────┘
                                  │
                                  ↓
                            [Admin Sees Order]
                            Status: Leader Approved
                                  │
                                  ↓
                            Admin Reviews
                            (Final Approval)
                                  │
                            ┌─────┴─────┐
                            │           │
                            ↓           ↓
                    ┌───────────┐ ┌───────────┐
                    │  Approve  │ │  Reject   │
                    └─────┬─────┘ └─────┬─────┘
                          │             │
                          ↓             ↓
                    ┌───────────┐ ┌───────────┐
                    │   Order   │ │   Order   │
                    │  Status:  │ │  Status:  │
                    │   Admin   │ │  Rejected │
                    │ Approved  │ │           │
                    └───────────┘ └───────────┘

                                    ┌─────────────────────────────────────────────┐
                                    │      INVENTORY REQUEST WORKFLOW             │
                                    │      (Team Leader Approval)                 │
                                    └─────────────────────────────────────────────┘
                                    
                                    Agent Requests Inventory
                                              │
                                              ↓
                                    Request Appears in
                                    Pending Requests
                                    (Grouped by Agent)
                                              │
                                              ↓
                                    Leader Reviews Request
                                    (Sees Available Stock)
                                              │
                                    ┌─────────┴─────────┬──────────┐
                                    │                   │          │
                                    ↓                   ↓          ↓
                            ┌───────────┐       ┌───────────┐ ┌───────────┐
                            │  Approve  │       │  Reject   │ │  Forward  │
                            │  (Adjust  │       │  (Reason) │ │  to Admin │
                            │  Qty if   │       │           │ │           │
                            │  needed)  │       │           │ │           │
                            └─────┬─────┘       └─────┬─────┘ └─────┬─────┘
                                  │                   │          │
                                  ↓                   ↓          ↓
                            ┌───────────┐       ┌───────────┐ ┌───────────┐
                            │ Inventory │       │  Request  │ │  Request  │
                            │ Allocated │       │  Denied   │ │ Forwarded │
                            │ to Agent  │       │           │ │           │
                            │           │       │           │ │           │
                            │ Available │       │ Agent     │ │ Admin     │
                            │ Stock     │       │ Notified  │ │ Reviews   │
                            │ Reduced   │       │           │ │           │
                            └───────────┘       └───────────┘ └───────────┘

                                    ┌─────────────────────────────────────────────┐
                                    │      TARGET SETTING WORKFLOW                │
                                    │      (Team Leader Only)                     │
                                    └─────────────────────────────────────────────┘
                                    
                                    Navigate to Analytics
                                              │
                                              ↓
                                    View Agent KPI Section
                                    (Filtered to Team Only)
                                              │
                                              ↓
                                    Click "Set Targets" Button
                                              │
                                              ↓
                                    Target Dialog Opens
                                    (Shows All Team Agents)
                                              │
                                    ┌─────────┴─────────┐
                                    │                   │
                                    ↓                   ↓
                            ┌───────────┐       ┌───────────┐
                            │ Set for   │       │ Set for   │
                            │ Individual│       │ All Agents│
                            │ Agent     │       │ at Once   │
                            └─────┬─────┘       └─────┬─────┘
                                  │                   │
                                  ↓                   ↓
                            Enter Targets:      Enter Targets:
                            • Clients           • Clients
                            • Revenue (₱)       • Revenue (₱)
                            • Quantity          • Quantity
                                  │                   │
                                  ↓                   ↓
                            ┌───────────┐       ┌───────────┐
                            │   Save    │       │ Save All  │
                            │ (Single)  │       │ (Bulk)    │
                            └─────┬─────┘       └─────┬─────┘
                                  │                   │
                                  └─────────┬─────────┘
                                            │
                                            ↓
                                    Targets Saved
                                    (For Current Month)
                                            │
                                            ↓
                                    System Calculates:
                                    • Actual Clients
                                    • Actual Revenue
                                    • Actual Quantity
                                            │
                                            ↓
                                    Achievement % Displayed
                                    (Actual / Target × 100%)

                                    ┌─────────────────────────────────────────────┐
                                    │         TEAM LEADER RESTRICTIONS            │
                                    │         (What Leader CANNOT Do)             │
                                    └─────────────────────────────────────────────┘
                                    
                                    ❌ Create/Edit/Delete Agents (Admin Only)
                                    ❌ Reset Agent Passwords (Admin Only)
                                    ❌ Promote Agents to Leaders (Admin Only)
                                    ❌ Assign Agents to Other Leaders (Admin Only)
                                    ❌ View Tax/Discount in Orders (Admin Only)
                                    ❌ Final Order Approval (Admin Has Final Authority)
                                    ❌ View Orders from Other Teams
                                    ❌ Manage Main Inventory (Admin Only)
                                    ❌ Add/Edit Brands/Variants (Admin Only)
                                    ❌ Set Selling Prices (Admin Only)
                                    ❌ View All Inventory Requests (Only Team)
                                    ❌ View All Remittances (Only Team)
                                    ❌ Create Clients Without Agent (Admin Only)
                                    ❌ View All Clients (Only Own Clients)
                                    ❌ Approve Pending Clients (Admin Only)
                                    ❌ View System History (Only Team History)
                                    ❌ View All Analytics (Only Team Analytics)
                                    ❌ Access Finance Dashboard (Admin Only)
                                    ❌ View Purchase Orders (Admin Only)
```

---

## 📋 Quick Reference: Team Leader vs Other Roles

| Feature | Team Leader | Admin | Agent |
|---------|-------------|-------|-------|
| **View Team Orders** | ✅ (Own Team) | ✅ (All) | ❌ (Own Only) |
| **Approve Orders** | ✅ (First) | ✅ (Final) | ❌ |
| **View Pricing (Tax/Discount)** | ❌ | ✅ | ❌ |
| **Set Agent Targets** | ✅ | ❌ | ❌ |
| **Create Tasks** | ✅ | ❌ | ❌ |
| **View Team Inventory Requests** | ✅ | ✅ (All) | ❌ (Own Only) |
| **Approve Inventory Requests** | ✅ (Team) | ✅ (All) | ❌ |
| **View Team Remittances** | ✅ | ✅ (All) | ❌ (Own Only) |
| **View Team History** | ✅ | ✅ (All) | ❌ (Own Only) |
| **Create Agents** | ❌ | ✅ | ❌ |
| **Manage Main Inventory** | ❌ | ✅ | ❌ |
| **Final Order Approval** | ❌ | ✅ | ❌ |
| **View All Clients** | ❌ | ✅ | ❌ (Own Only) |
| **Create Orders** | ✅ (If also agent) | ❌ | ✅ |
| **Request Inventory** | ✅ | ❌ | ✅ |
| **Remit Inventory** | ❌ | ❌ | ✅ |

---

## 🔐 Security & Permissions

### **Data Visibility:**
- ✅ Team Leaders can see data for **their team only**
- ✅ Cannot access other leaders' teams
- ✅ Cannot view system-wide data
- ✅ Full audit trail for team activities

### **Actions:**
- ✅ Team Leaders can perform **team management actions**
- ✅ Have **first approval** authority for team orders
- ✅ Can **set targets** for team agents
- ✅ Can **create tasks** for team agents
- ❌ Cannot perform **system-wide administrative actions**

---

## 📝 Notes

1. **Order Approval**: Leaders provide first approval, then admin provides final approval
2. **Target Setting**: Only leaders can set monthly targets for their agents (admins cannot)
3. **Inventory Requests**: Leaders approve requests from their team agents only
4. **Team Visibility**: Leaders can only see and manage their assigned team
5. **Pricing Visibility**: Leaders cannot see tax and discount fields (admin-only)
6. **Task Management**: Leaders can create and assign tasks to team agents

---

## 🎯 Summary

**Team Leader Role = Team Oversight + First Approval Authority + Target Setting**

Team Leaders have comprehensive access to manage their team, with the ability to:
- Oversee team operations
- Approve/reject team orders (first approval)
- Manage team inventory requests
- Set monthly targets for agents
- Create and track tasks
- Monitor team performance

However, team leaders are restricted from:
- System-wide administrative functions
- Creating/managing agents
- Final order approval (admin responsibility)
- Viewing other teams' data
- Managing main inventory

---

*Last Updated: Based on current codebase analysis*
*Version: 1.0*

