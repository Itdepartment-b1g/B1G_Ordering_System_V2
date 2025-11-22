# B1G Ordering System - Project Overview

## 🎯 Executive Summary

The **B1G Ordering System** is a comprehensive, full-stack web application designed for B1G Corporation to manage sales operations, inventory tracking, order processing, and team management. The system supports a hierarchical organizational structure with three distinct user roles: **Admin**, **Team Leader**, and **Sales Agent**, each with role-specific capabilities and access controls.

---

## 🏗️ System Architecture

### **Technology Stack**

#### Frontend
- **React 18** with TypeScript
- **Vite** - Build tool and dev server
- **React Router** - Client-side routing
- **TanStack Query** - Data fetching and caching
- **Tailwind CSS** - Utility-first styling
- **shadcn/ui** - Component library (Radix UI primitives)
- **Recharts** - Data visualization

#### Backend & Infrastructure
- **Supabase** (PostgreSQL Database)
  - Row Level Security (RLS) for data access control
  - Real-time subscriptions for live updates
  - Storage buckets for file uploads (signatures, payment proofs)
  - Edge Functions for serverless operations
  - Authentication & Authorization

#### Third-Party Services
- **Resend API** - Email delivery service
- **Nodemailer** - SMTP fallback for emails

---

## 👥 User Roles & Permissions

### 🔴 **Admin**
**Full System Access**
- ✅ View all orders, clients, inventory, and agents
- ✅ Approve/reject orders at final stage
- ✅ Manage main inventory (brands, variants, prices)
- ✅ Create and manage sales agents
- ✅ View system-wide analytics and reports
- ✅ Access financial dashboards
- ✅ Manage purchase orders
- ✅ View complete system history
- ✅ Set agent targets (view-only, cannot set)
- ✅ Reset agent passwords
- ✅ Approve/reject client creation requests
- ✅ View all remitted stocks

**Restrictions:**
- ❌ Cannot set agent targets (leaders only)
- ❌ Cannot see pricing details in orders (tax/discount hidden for non-admins)

### 🟡 **Team Leader**
**Team Management & Oversight**
- ✅ View and manage team members' inventory
- ✅ Allocate stock to team members
- ✅ View and approve orders from their team
- ✅ Remit inventory to main inventory
- ✅ View team history and statistics
- ✅ Set monthly targets for agents (Clients, Revenue, Quantity)
- ✅ View agent KPIs and performance metrics
- ✅ Access analytics page (team-only view)
- ✅ View team remittances
- ✅ Approve/reject inventory requests from agents

**Restrictions:**
- ❌ Cannot approve orders at admin level
- ❌ Cannot access main inventory management
- ❌ Cannot create/manage agents
- ❌ Cannot see pricing details (tax/discount)
- ❌ Cannot see sales revenue on dashboard

### 🟢 **Sales Agent**
**Sales Operations**
- ✅ Create client orders
- ✅ View own allocated inventory
- ✅ Manage own clients
- ✅ View personal order history
- ✅ Remit inventory to leader
- ✅ Request inventory from leader
- ✅ View personal dashboard
- ✅ Create and manage daily tasks
- ✅ Update own profile

**Restrictions:**
- ❌ Cannot approve orders
- ❌ Cannot allocate inventory
- ❌ Cannot view other agents' data
- ❌ Cannot see pricing details (tax/discount)
- ❌ Cannot see sales revenue on dashboard
- ❌ Cannot set targets

---

## 📦 Core Features

### 1. **Inventory Management System**

#### Main Inventory (Admin)
- **Brand & Variant Management**
  - Create and manage brands
  - Add flavors and batteries per brand
  - Set selling prices (bulk price updates for flavors/batteries)
  - Track total stock, allocated stock, and available stock
  - Visual indicators for items without prices
  - Low stock warnings

#### Leader Inventory
- View inventory allocated to leaders
- Allocate stock to team members
- Track allocations and remittances
- View team member inventory levels

#### Agent Inventory
- View allocated inventory
- Request additional inventory from leader
- Remit inventory back to leader
- Track inventory transactions

#### Inventory Remittance System
- Agents can remit inventory to leaders
- Leaders can remit to main inventory
- Signature capture for remittances
- Real-time tracking of remitted stocks

#### Inventory Request System
- Agents can request inventory from leaders
- Leaders approve/reject requests
- Admin can view all requests
- Request status tracking

### 2. **Order Management System**

#### Order Creation Flow
1. **Agent creates order**
   - Select client (with search)
   - Add items (flavors/batteries) with quantities
   - Set payment method (GCash, Bank Transfer, Cash)
   - Upload payment proof (if applicable)
   - Capture client signature
   - Submit for approval

#### Multi-Stage Approval Workflow
1. **Agent Pending** → Agent submits order
2. **Leader Review** → Leader approves/rejects
3. **Admin Review** → Admin final approval
4. **Approved** → Order is finalized

#### Order Features
- Real-time status updates
- Payment proof upload
- Client signature capture
- Email notifications (client + IT department)
- Order history tracking
- Role-based filtering (Pending Leader Review / Pending Admin Review)
- Pagination (10 orders per page)

### 3. **Client Management**

#### Client Features
- **Client Profiles**
  - Name, email, phone, company
  - Address and city
  - Photo upload with GPS verification
  - Client approval workflow (for agents)
  
- **Client Operations**
  - Create, edit, view, void clients
  - Transfer clients between agents
  - Bulk transfer by city
  - Client search and filtering
  - Client statistics (order count, total spent)
  
- **City Management**
  - Agents have assigned cities (comma-separated tags)
  - Cities automatically merge when clients are transferred
  - Admin can manually set cities for agents
  - City-based client filtering

### 4. **Analytics & Reporting**

#### Admin Analytics
- System-wide KPIs
- Top performing agents
- Revenue charts
- Order statistics
- Client growth metrics

#### Leader Analytics
- Team agent KPIs only
- Target vs Actual performance
- Achievement percentages
- Monthly target setting

#### Agent KPIs Tracked
- **Target Metrics** (set by leader)
  - Target Clients (monthly)
  - Target Revenue (monthly)
  - Target Quantity (monthly)
  
- **Actual Metrics** (calculated automatically)
  - Actual Clients (created this month)
  - Actual Revenue (from approved orders this month)
  - Actual Quantity (from approved orders this month)
  
- **Achievement Percentages**
  - Clients Achievement %
  - Revenue Achievement %
  - Quantity Achievement %

### 5. **Dashboard System**

#### Admin Dashboard
- Total revenue
- Total orders
- Top performing agents
- Top flavors
- Revenue charts
- Order statistics

#### Leader/Agent Dashboard
- Personal order count
- Personal client count
- Recent orders
- Task management
- **Note:** Sales revenue card hidden for non-admins

### 6. **System History & Audit Trail**

#### Comprehensive Event Logging
- All system actions are logged
- Event categories:
  - Orders
  - Clients
  - Allocations
  - Tasks
  - Financial
  - Teams
  - Inventory
  - Profiles

#### Role-Based History Views
- **Admin:** All system events
- **Leader:** Team events only
- **Agent:** Personal events only

#### Real-time Updates
- Live history updates without page refresh
- Filter by action type, date range, actor

### 7. **Notifications System**

#### Real-time Notifications
- Bell icon with unread count
- Role-based notification filtering
- Notification types:
  - Order approvals/rejections
  - Inventory allocations
  - Team assignments
  - Client approvals
  - Inventory requests

### 8. **Calendar & Task Management**

#### Task Features
- Create daily tasks
- Mark tasks as complete
- Archive completed tasks
- Calendar views (Today, All, Day view)
- Task filtering and search

### 9. **Purchase Order Management**

#### Purchase Order Features
- Create purchase orders
- Add items with quantities
- Track PO status
- Link to main inventory
- Brand and variant management

### 10. **User Management**

#### Agent Management (Admin)
- Create new agents
- Edit agent details (name, email, phone, region, cities, position)
- Reset passwords (to `tempPassword123!`)
- Activate/deactivate agents
- View agent statistics

#### Profile Management
- Update personal profile
- Change password (with confirmation)
- View assigned cities (agents/leaders)

---

## 🔐 Security Features

### Authentication & Authorization
- **Supabase Auth** integration
- **Row Level Security (RLS)** policies on all tables
- **Role-based access control** (frontend + backend)
- **Protected routes** with authentication checks
- **Session management** with secure logout

### Data Security
- **Secure file uploads** via Supabase Storage
- **RLS policies** prevent unauthorized data access
- **Edge Functions** for sensitive operations (user creation, password reset)
- **Service role key** used only in Edge Functions

### Audit & Compliance
- **Complete audit trail** via events table
- **Action logging** for all system operations
- **User activity tracking**
- **Profile change history**

---

## 📊 Database Schema Highlights

### Core Tables
- **profiles** - User accounts (admin, leader, agent)
- **clients** - Client information
- **client_orders** - Order records with approval workflow
- **client_order_items** - Order line items
- **main_inventory** - Central inventory
- **agent_inventory** - Agent-allocated inventory
- **variants** - Product variants (flavors, batteries)
- **brands** - Product brands
- **events** - System audit trail
- **notifications** - User notifications
- **leader_teams** - Team assignments
- **agent_monthly_targets** - Monthly KPI targets
- **inventory_requests** - Inventory request system
- **remittances_log** - Inventory remittance tracking

### Key Relationships
- Agents belong to Leaders (via `leader_teams`)
- Orders belong to Agents and Clients
- Inventory flows: Main → Leader → Agent
- Events track all system actions
- Notifications generated from events

---

## 🚀 Key Workflows

### Order Creation & Approval
```
1. Agent creates order → Status: "agent_pending"
2. Leader reviews → Approve → Status: "leader_approved"
3. Admin reviews → Approve → Status: "admin_approved" (final)
4. Email sent to client and IT department
```

### Inventory Allocation
```
1. Admin manages main inventory
2. Leader allocates stock to agents
3. Agent receives allocated inventory
4. Agent can remit back to leader
5. Leader can remit to main inventory
```

### Client Management
```
1. Agent creates client (with photo/GPS)
2. If city matches assigned cities → Auto-approved
3. If city doesn't match → Pending admin approval
4. Admin approves/rejects client
5. Client can be transferred between agents
```

### Target Setting (Leader)
```
1. Leader navigates to Analytics page
2. Clicks "Set Targets" button
3. Sets monthly targets for:
   - Number of Clients
   - Revenue (₱)
   - Quantity
4. System calculates actuals automatically
5. Achievement percentages displayed
```

---

## 📱 User Interface

### Design Principles
- **Mobile-first** responsive design
- **Real-time updates** without page refresh
- **Intuitive navigation** with sidebar menu
- **Clear status indicators** (badges, colors)
- **Accessible** with proper ARIA labels

### Key UI Components
- **Sidebar Navigation** - Role-based menu items
- **Data Tables** - Sortable, filterable, paginated
- **Dialogs & Modals** - For forms and confirmations
- **Toast Notifications** - User feedback
- **Charts & Graphs** - Data visualization
- **Search & Filters** - Quick data access

---

## 🔄 Real-time Features

### Real-time Subscriptions
- **Inventory updates** - Live stock changes
- **Order status** - Instant approval notifications
- **Notifications** - Real-time bell updates
- **System history** - Live event streaming
- **Client updates** - Instant client changes

### Implementation
- Supabase real-time channels
- Automatic reconnection
- Optimized subscription management
- Batched state updates to prevent flickering

---

## 📧 Email System

### Email Features
- **Order Confirmations** - Sent to clients
- **IT Notifications** - Order receipts to IT department
- **Email Content**:
  - Order details
  - Client signature
  - Payment proof
  - Agent contact info
  - Leader details

### Email Service
- **Primary:** Resend API
- **Fallback:** Nodemailer (SMTP)

---

## 🎨 Recent Enhancements

### Password Management
- ✅ Password reset for agents (admin only)
- ✅ Password update on profile page (with confirmation)
- ✅ Standardized reset password: `tempPassword123!`
- ✅ Auth/Profile sync when editing agent details

### City Management
- ✅ Cities stored in profiles table (comma-separated)
- ✅ Automatic city merging when clients transferred
- ✅ Manual city assignment by admin
- ✅ City-based client filtering

### Pricing & Inventory
- ✅ Bulk price updates for flavors/batteries
- ✅ Visual indicators for missing prices
- ✅ Price validation on inventory pages

### Analytics & Targets
- ✅ Agent KPI tracking (Target vs Actual)
- ✅ Achievement percentage calculations
- ✅ Monthly target setting (leaders only)
- ✅ Analytics page access for leaders

### UI/UX Improvements
- ✅ Hidden pricing details for non-admins
- ✅ Hidden sales revenue card for agents/leaders
- ✅ Centered KPI table alignment
- ✅ Comma formatting for numbers
- ✅ No decimals in target inputs

---

## 📁 Project Structure

```
src/
├── features/              # Feature-based modules
│   ├── auth/             # Authentication & authorization
│   ├── dashboard/        # Dashboard & system history
│   ├── sales-agents/     # Agent management & team management
│   ├── inventory/        # All inventory-related pages
│   ├── orders/           # Order management
│   ├── clients/          # Client management
│   ├── analytics/        # Analytics & KPIs
│   ├── finance/          # Financial dashboard
│   ├── calendar/         # Calendar & tasks
│   └── profile/          # User profile
├── components/           # Shared UI components (shadcn/ui)
├── lib/                  # Utilities & Supabase client
│   ├── supabase.ts      # Supabase client configuration
│   ├── database.helpers.ts
│   ├── email.helpers.ts
│   └── realtime.helpers.ts
├── hooks/                # Custom React hooks
└── types/                # TypeScript type definitions

supabase/
├── functions/            # Edge Functions
│   ├── create-agent/    # User creation & password reset
│   └── update-agent-auth/ # Auth user updates
└── migrations/           # Database migrations
```

---

## 🔧 Development & Deployment

### Development
- **Local Development:** `npm run dev`
- **Build:** `npm run build`
- **Preview:** `npm run preview`

### Deployment
- **Frontend:** Vercel (or similar)
- **Backend:** Supabase Cloud
- **Environment Variables:**
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - Email service credentials

### Database Migrations
- Managed via Supabase migrations
- Version-controlled SQL files
- Idempotent migration scripts

---

## 📈 Performance Optimizations

### Frontend
- **Code splitting** via React Router
- **Lazy loading** for routes
- **Batched state updates** to prevent flickering
- **Optimized queries** with TanStack Query
- **Real-time subscription management**

### Backend
- **Database indexes** on frequently queried columns
- **RLS policies** for efficient data filtering
- **Database views** for aggregated data
- **Edge Functions** for heavy operations

---

## 🐛 Known Issues & Limitations

### Current Limitations
- No bulk operations for inventory (planned)
- No export functionality for reports (planned)
- No offline mode support
- No mobile app (web-only)

### Recent Fixes
- ✅ Cities disappearing issue (fixed - no auto-overwrite)
- ✅ Admin logout on password reset (fixed - improved auth state handling)
- ✅ Flickering in history page (fixed - batched updates)
- ✅ Session management improvements

---

## 📚 Documentation

### Available Documentation
- **README.md** - Getting started guide
- **ADMIN_USER_MANUAL.md** - Admin user guide
- **TEAM_LEADER_USER_MANUAL.md** - Leader user guide
- **ADMIN_CAPABILITIES_FLOWCHART.md** - Admin capabilities
- **TEAM_LEADER_CAPABILITIES_FLOWCHART.md** - Leader capabilities
- **CITIES_DISAPPEARING_ISSUE_ANALYSIS.md** - Technical analysis

---

## 🎯 Business Value

### Efficiency Gains
- **Streamlined Order Processing** - Multi-stage approval workflow
- **Real-time Inventory Tracking** - No manual stock counting
- **Automated Notifications** - Reduced communication overhead
- **Performance Tracking** - KPI monitoring and target setting

### Data Insights
- **Analytics Dashboard** - Business intelligence at a glance
- **Audit Trail** - Complete system history
- **Financial Tracking** - Revenue and order statistics
- **Agent Performance** - Target vs actual metrics

### User Experience
- **Mobile-Responsive** - Access from any device
- **Real-time Updates** - No page refreshes needed
- **Intuitive Interface** - Easy navigation and clear status indicators
- **Role-based Access** - Users see only what they need

---

## 🔮 Future Enhancements

### Planned Features
- [ ] Advanced reporting and analytics
- [ ] Bulk operations for inventory
- [ ] Export functionality (PDF, Excel)
- [ ] Advanced search and filtering
- [ ] Mobile app (React Native)
- [ ] Offline mode support
- [ ] Multi-language support
- [ ] Advanced pricing tiers (DSP, RSP, Special Price)

---

## 📞 Support & Maintenance

### System Monitoring
- Supabase dashboard for database monitoring
- Vercel analytics for frontend performance
- Error logging via console and Supabase logs

### Maintenance Tasks
- Regular database backups (Supabase automatic)
- Edge Function deployment via Supabase CLI
- Migration management via version control

---

**Last Updated:** January 2025  
**Version:** 1.0  
**Maintained by:** B1G Corporation Development Team

