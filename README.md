# B1G Ordering System

A comprehensive inventory management and ordering system for B1G Corporation, designed to streamline sales operations, inventory tracking, and order management for sales agents, team leaders, and administrators.

## 📋 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [User Roles](#user-roles)
- [Recent Improvements](#recent-improvements)
- [Technical Stack](#technical-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)

## 🎯 Overview

The B1G Ordering System is a full-stack web application that enables efficient management of inventory, orders, clients, and team operations. The system supports a hierarchical role structure (Admin, Leader, Sales Agent) with role-based access control and real-time updates.

## ✨ Key Features

### 📦 Inventory Management
- **Main Inventory**: Central inventory management with brand and variant tracking
- **Leader Inventory**: Leaders can view and manage their own inventory
- **Agent Inventory**: Sales agents view their allocated inventory
- **Stock Allocation**: Leaders can allocate stock to their team members
- **Inventory Remittance**: Agents can remit inventory back to their leaders
- **Price Management**: Selling price validation and visual indicators for items without prices
- **Real-time Updates**: Seamless inventory updates without page refreshes

### 🛒 Order Management
- **Order Creation**: Multi-step order creation with client signature capture
- **Payment Processing**: Support for GCash, Bank Transfer, and Cash with payment proof upload
- **Order Approval Workflow**: 
  - Sales Agent → Leader → Admin approval chain
  - Role-based filtering (Pending Leader Review / Pending Admin Review)
- **Order Tracking**: Real-time order status updates and history
- **Email Notifications**: Automated order confirmation emails to clients and IT department

### 👥 Client Management
- **Client Profiles**: Comprehensive client information management
- **Client History**: Track client orders and total spending
- **Client Search**: Advanced search and filtering capabilities
- **Client Statistics**: Order counts and revenue tracking per client

### 📊 Dashboard & Analytics
- **Admin Dashboard**: 
  - Total revenue tracking
  - Top performing agents
  - Top flavors analysis
  - Revenue overview charts
- **Finance Dashboard**: Financial overview with revenue tracking
- **Order Statistics**: Real-time order counts and approval metrics

### 📝 System History & Audit Trail
- **System History**: Comprehensive event logging for all system actions
- **Team History**: Leaders can view their team's activity history
- **Role-based Filtering**: 
  - Admins see all events
  - Leaders see their team's events
  - Agents see only their own events
- **Action Categories**: Filter by Orders, Clients, Allocations, Tasks, Financial, Teams, Inventory
- **Real-time Updates**: Live history updates without page refreshes

### 🔔 Notifications System
- **Real-time Notifications**: Bell icon with unread notification count
- **Role-based Notifications**: 
  - Admins receive all notifications
  - Leaders receive notifications for their team
  - Agents receive only their own notifications
- **Notification Types**: Order approvals/rejections, inventory allocations, team assignments, and more

### 📅 Calendar & Task Management
- **Daily Task Management**: Create and track daily tasks
- **Calendar Views**: Today, All tasks, and Day view
- **Task Completion**: Mark tasks as complete with timestamps
- **Responsive Design**: Optimized for mobile and desktop viewing

### 👤 User Management
- **Profile Management**: User profiles with role and position tracking
- **Team Management**: Leaders can view and manage their team members
- **Role-based Access Control**: Secure access based on user roles

## 👥 User Roles

### 🔴 Admin
- Full system access
- View all orders, clients, and inventory
- Approve/reject orders at the final stage
- Manage main inventory
- View system-wide history and analytics
- Access to all financial reports

### 🟡 Leader
- Manage team members' inventory allocation
- View and approve orders from their team
- View team history and statistics
- Remit inventory functionality
- Track team performance

### 🟢 Sales Agent
- Create client orders
- View own inventory
- Manage own clients
- View personal order history
- Remit inventory to leader
 
## 🚀 Recent Improvements

### Order Management Enhancements
- ✅ **Status Clarity**: Implemented "Pending (Leader Review)" and "Pending (Admin Review)" status labels
- ✅ **Role-based Filtering**: Admin "All Orders" tab now excludes orders pending leader review
- ✅ **Tab Labels**: Dynamic tab labels showing appropriate status based on user role
- ✅ **Pagination**: Added pagination (10 orders per page) for better performance

### History Page Optimizations
- ✅ **Flickering Fix**: Resolved flickering issues by batching state updates
- ✅ **Performance**: Optimized data fetching to load events and positions together
- ✅ **Real-time Updates**: Seamless real-time event subscriptions without UI disruption
- ✅ **Leader-specific Fixes**: Fixed flickering for leader role by batching all state updates

### Email System
- ✅ **Resend Integration**: Integrated Resend API for reliable email delivery
- ✅ **Order Receipts**: Automated order confirmation emails to clients
- ✅ **IT Notifications**: Order receipts sent to IT department for confirmation
- ✅ **Email Content**: Includes client signature, payment proof, agent contact info, and leader details

### Mobile Responsiveness
- ✅ **Responsive Design**: All pages optimized for mobile devices
- ✅ **Order Creation Flow**: Multi-step order creation dialogs are mobile-friendly
- ✅ **Calendar Views**: Optimized calendar day view for mobile devices
- ✅ **History Tables**: Horizontal scroll with sticky first column for mobile

### Inventory Features
- ✅ **Price Validation**: Visual indicators for items without selling prices
- ✅ **Allocation UI**: Redesigned allocation interface with full variant lists
- ✅ **Real-time Updates**: Seamless inventory updates without loading indicators
- ✅ **Remittance Tracking**: Admin page to track daily remitted stocks

### UI/UX Improvements
- ✅ **Compact Calendar Cards**: Optimized card design for list view
- ✅ **Sticky Time Indicator**: Current time indicator stays visible in calendar day view
- ✅ **Responsive Modals**: All dialogs and modals are mobile-responsive
- ✅ **Improved Pagination**: Better pagination controls across all tables

## 🛠 Technical Stack

### Frontend
- **React 18**: Modern React with hooks and functional components
- **TypeScript**: Type-safe development
- **Vite**: Fast build tool and dev server
- **Tailwind CSS**: Utility-first CSS framework
- **shadcn/ui**: High-quality React components
- **React Router**: Client-side routing
- **TanStack Query**: Data fetching and caching

### Backend & Database
- **Supabase**: 
  - PostgreSQL database
  - Real-time subscriptions
  - Row Level Security (RLS)
  - Storage buckets for files
  - Edge Functions for serverless functions
- **Database Functions**: RPC functions for complex operations

### Third-party Services
- **Resend**: Email delivery service
- **Nodemailer**: SMTP email sending (fallback)

### Development Tools
- **ESLint**: Code linting
- **TypeScript**: Type checking
- **Vite Plugin Remove Console**: Production console log removal

## 📁 Project Structure

```
src/
├── features/
│   ├── auth/           # Authentication and authorization
│   ├── dashboard/      # Admin dashboard and system history
│   ├── sales-agents/   # Agent history and team management
│   ├── inventory/      # Inventory management pages
│   ├── orders/         # Order management and creation
│   ├── clients/        # Client management
│   ├── finance/        # Financial dashboard
│   ├── calendar/       # Calendar and task management
│   └── profile/        # User profile management
├── components/          # Shared UI components
├── lib/                # Utility functions and Supabase client
└── hooks/              # Custom React hooks
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Supabase account and project

### Installation

1. Clone the repository
```bash
git clone <repository-url>
cd b1g-ordering-system
```

2. Install dependencies
```bash
npm install
```

3. Set up environment variables
```bash
cp .env.example .env
# Fill in your Supabase credentials
```

4. Run development server
```bash
npm run dev
```

5. Build for production
```bash
npm run build
```


## 🔐 Security Features

- **Row Level Security (RLS)**: Database-level security policies
- **Role-based Access Control**: Frontend and backend role validation
- **Secure File Uploads**: Supabase Storage with RLS policies
- **Authentication**: Supabase Auth integration

## 📊 Database Schema Highlights

- **Events Table**: Comprehensive audit trail for all system actions
- **Client Orders**: Multi-stage approval workflow (agent_pending → leader_approved → admin_approved)
- **Inventory Tables**: Main inventory, leader inventory, and agent inventory
- **Notifications**: Real-time notification system
- **Leader Teams**: Team management structure

## 🎨 Design Principles

- **Mobile-First**: Responsive design prioritizing mobile experience
- **Real-time Updates**: Seamless data synchronization without page refreshes
- **User Experience**: Intuitive navigation and clear status indicators
- **Performance**: Optimized queries and batched state updates
- **Accessibility**: Proper ARIA labels and keyboard navigation

## 📈 Future Enhancements

- [ ] Advanced reporting and analytics
- [ ] Bulk operations for inventory
- [ ] Export functionality for reports
- [ ] Advanced search and filtering
- [ ] Mobile app (React Native)
- [ ] Offline mode support

## 👥 Team

Developed for B1G Corporation

## 📄 License

Proprietary - B1G Corporation

---

**Last Updated**: January 2025
