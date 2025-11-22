# Admin User Manual
## B1G Ordering System - Complete Guide for Administrators

---

## 📋 Table of Contents

1. [Getting Started](#getting-started)
2. [Dashboard Overview](#dashboard-overview)
3. [Member Management](#member-management)
4. [Inventory Management](#inventory-management)
5. [Client Management](#client-management)
6. [Order Management](#order-management)
7. [Purchase Orders](#purchase-orders)
8. [Finance & Analytics](#finance--analytics)
9. [System History & Audit](#system-history--audit)
10. [Profile Management](#profile-management)
11. [Common Tasks](#common-tasks)
12. [Troubleshooting](#troubleshooting)

---

## 🚀 Getting Started

### Logging In
1. Navigate to the B1G Ordering System login page
2. Enter your admin email and password
3. Click "Login"
4. You will be redirected to your Dashboard

### Navigation
- Use the **sidebar menu** on the left to navigate between sections
- The sidebar is collapsible - click the menu icon to expand/collapse
- Your current page is highlighted in the sidebar
- Click your name/email at the bottom to access Profile or Logout

---

## 📊 Dashboard Overview

### What You'll See
The Admin Dashboard provides a comprehensive overview of your entire system:

**Key Metrics:**
- **Total Revenue**: Sum of all approved orders
- **Active Orders**: Total number of orders in the system
- **Sales Agents**: Total count of agents (active and inactive)
- **Products**: Total number of product variants in inventory

**Charts & Analytics:**
- **Revenue Overview**: 6-month revenue trend chart
- **Top Performing Agents**: List of agents ranked by revenue
- **Top Flavors**: Most popular products by quantity sold

### How to Use
- Review metrics daily to monitor system health
- Click on any metric card for more details
- Use charts to identify trends and patterns
- Monitor top performers to recognize achievements

---

## 👥 Member Management

### Sales Agents Management

#### Creating a New Agent
1. Navigate to **Member Management** → **Sales Agents**
2. Click the **"Add Agent"** or **"Create Sales Agent"** button
3. Fill in the required information:
   - **Full Name**: Agent's complete name
   - **Email**: Unique email address (used for login)
   - **Phone**: Contact number (optional)
   - **Region**: Geographic region (optional)
   - **Cities**: Comma-separated list of assigned cities
   - **Position**: Select from dropdown (Mobile Sales, Leader, Hermanos Sales Agent)
4. Click **"Create Agent"**
5. The system will automatically:
   - Create an auth account with password: `tempPassword123!`
   - Create a profile record
   - Send confirmation

**Note**: The agent will receive their login credentials. They should change their password on first login.

#### Editing an Agent
1. Go to **Sales Agents** page
2. Find the agent in the list (use search if needed)
3. Click the **"Edit"** button (pencil icon) or **"View/Edit"** option
4. Modify any fields you need to update:
   - Name, email, phone, region, cities, position
5. Click **"Save Changes"**
6. Confirm the update in the dialog

#### Resetting an Agent's Password
1. Go to **Sales Agents** page
2. Find the agent
3. Click **"Reset Password"** button
4. Confirm in the dialog
5. The password will be reset to: `tempPassword123!`
6. Notify the agent of the new password

#### Deactivating an Agent
1. Go to **Sales Agents** page
2. Find the agent
3. Click **"Delete"** or **"Deactivate"** button
4. Confirm in the dialog
5. The agent will be marked as inactive and cannot log in

#### Viewing Agent Details
- Click on any agent's name or **"View"** button
- See complete profile information
- View agent's inventory, orders, and history

### Team Management

#### Assigning Agents to Leaders
1. Navigate to **Member Management** → **Team Management**
2. Find the leader you want to assign agents to
3. Click **"Assign Agents"** or **"Manage Team"**
4. Select agents from the available list
5. Click **"Assign"** or **"Save"**
6. Agents are now part of the leader's team

#### Unassigning Agents
1. Go to **Team Management**
2. Find the leader
3. View their team members
4. Click **"Unassign"** next to the agent
5. Confirm the action

#### Promoting an Agent to Leader
1. Go to **Team Management**
2. Find the agent
3. Click **"Promote to Leader"**
4. Confirm in the dialog
5. The agent's position will change to "Leader"
6. They will now have leader-level access

#### Unpromoting a Leader
1. Go to **Team Management**
2. Find the leader
3. Click **"Unpromote"** or **"Remove Leader Status"**
4. Confirm in the dialog
5. They will revert to regular agent status

---

## 📦 Inventory Management

### Main Inventory

#### Viewing Inventory
1. Navigate to **Inventory** → **Main Inventory**
2. You'll see all products organized by brand
3. View stock levels, prices, and product details
4. Use filters to find specific products

#### Adding a Brand
1. Go to **Main Inventory**
2. Click **"Add Brand"** button
3. Enter brand name and description (optional)
4. Click **"Save"**
5. The brand appears in your inventory list

#### Adding a Variant
1. Go to **Main Inventory**
2. Select a brand (or create one first)
3. Click **"Add Variant"** or **"Add Product"**
4. Fill in:
   - **Name**: Product name (e.g., "Chocolate", "Vanilla")
   - **Type**: Select "Flavor" or "Battery"
   - **Brand**: Select from existing brands
5. Click **"Save"**
6. The variant is created and appears in inventory

#### Setting Stock Levels
1. Go to **Main Inventory**
2. Find the product variant
3. Click **"Update Stock"** or edit the stock field
4. Enter the new quantity
5. Click **"Save"**
6. Stock level is updated

#### Setting Prices
1. Go to **Main Inventory**
2. Find the product variant
3. Click **"Set Price"** or edit the price field
4. Enter the selling price
5. Click **"Save"**
6. Price is updated for all future allocations

### Stock Allocations

#### Viewing Allocations
1. Navigate to **Inventory** → **Stock Allocations**
2. See all stock allocations across the system
3. View:
   - Who allocated stock to whom
   - When allocations occurred
   - Quantities allocated
   - Prices used

#### Understanding Allocation History
- Allocations show the flow of inventory from main → leaders → agents
- Each allocation is logged with timestamp and details
- Use this to track inventory movement

### Inventory Requests

#### Viewing Requests
1. Navigate to **Inventory** → **Inventory Requests**
2. See all pending requests from agents and leaders
3. Requests are grouped by requester and timestamp

#### Approving a Request
1. Go to **Inventory Requests**
2. Find the request you want to approve
3. Click **"Review Request"** or **"Approve"**
4. Review the requested items and quantities
5. Adjust approved quantities if needed
6. Add notes (optional)
7. Click **"Approve"**
8. Inventory is allocated to the requester

#### Rejecting a Request
1. Go to **Inventory Requests**
2. Find the request
3. Click **"Review Request"**
4. Click **"Deny"** or **"Reject"**
5. Enter a reason for rejection (optional)
6. Click **"Confirm Rejection"**
7. The requester is notified

#### Forwarding a Request
1. Go to **Inventory Requests**
2. Find the request
3. Click **"Forward"**
4. Select where to forward it
5. Add notes
6. Click **"Forward"**

### Remitted Stocks

#### Viewing Remittances
1. Navigate to **Inventory** → **Remitted Stocks**
2. See all inventory remittances from agents to leaders
3. View:
   - Agent who remitted
   - Leader who received
   - Items and quantities
   - Remittance date
   - Digital signatures

#### Understanding Remittances
- Agents remit inventory back to leaders after sales
- Each remittance includes orders fulfilled
- Signatures confirm receipt
- Use this to track inventory returns

---

## 🛍️ Client Management

### Clients Database

#### Viewing All Clients
1. Navigate to **Clients** → **Clients Database**
2. See all clients in the system
3. Use search to find specific clients
4. Filter by agent, status, or other criteria

#### Creating a Client
1. Go to **Clients Database**
2. Click **"Add Client"** or **"Create Client"** button
3. Fill in client information:
   - **Name**: Client's full name
   - **Email**: Contact email (optional)
   - **Phone**: Contact number
   - **Address**: Physical address
   - **City**: City location
   - **Country**: Country (default: Philippines)
   - **Photo**: Upload client photo (optional)
   - **Location**: Capture GPS location (optional)
4. **Note**: As admin, you can create clients without assigning them to an agent
5. Click **"Create Client"**
6. Client is added to the database

#### Editing a Client
1. Go to **Clients Database**
2. Find the client
3. Click **"Edit"** button
4. Modify any information
5. Click **"Save Changes"**
6. Confirm the update

#### Transferring a Client to an Agent
1. Go to **Clients Database**
2. Find the client
3. Click **"Edit"** or **"Transfer"**
4. Select an agent from the dropdown
5. Click **"Save"**
6. Client is now assigned to that agent

#### Voiding a Client
1. Go to **Clients Database**
2. Find the client
3. Click **"Void"** or **"Delete"** button
4. Confirm in the dialog
5. Client is moved to voided clients list

### Pending Clients

#### Viewing Pending Approvals
1. Navigate to **Clients** → **Pending Clients**
2. See all clients waiting for approval
3. These are clients created by agents that need approval

#### Approving a Pending Client
1. Go to **Pending Clients**
2. Find the client
3. Review the information
4. Click **"Approve"**
5. Client is activated and assigned to the agent

#### Rejecting a Pending Client
1. Go to **Pending Clients**
2. Find the client
3. Click **"Reject"**
4. Enter a reason (optional)
5. Click **"Confirm Rejection"**
6. Client creation is rejected

### Voided Clients

#### Viewing Voided Clients
1. Navigate to **Clients** → **Voided Clients**
2. See all deactivated clients
3. View when and why they were voided

#### Restoring a Voided Client
1. Go to **Voided Clients**
2. Find the client
3. Click **"Restore"** button
4. Confirm the action
5. Client is reactivated

---

## 🛒 Order Management

### Order List

#### Viewing Orders
1. Navigate to **Order List**
2. See all orders in the system
3. Use filters to view:
   - All orders
   - Pending (Agent Pending)
   - Pending (Leader Review)
   - Pending (Admin Review) ← **Your approval needed**
   - Approved
   - Rejected

#### Understanding Order Status
- **Agent Pending**: Order created, waiting for leader approval
- **Leader Approved**: Leader approved, waiting for your final approval
- **Admin Approved**: You approved, order is complete
- **Rejected**: Order was rejected at any stage

#### Approving an Order (Final Approval)
1. Go to **Order List**
2. Filter by **"Pending (Admin Review)"**
3. Find the order you want to approve
4. Click on the order to view details
5. Review:
   - Client information
   - Order items and quantities
   - Pricing (you can see tax and discount - others cannot)
   - Payment information
   - Client signature
6. Click **"Approve"** button
7. Confirm in the dialog
8. Order status changes to "Admin Approved"
9. Email notifications are sent to client and IT department

#### Rejecting an Order
1. Go to **Order List**
2. Find the order (can reject at any stage)
3. Click on the order
4. Click **"Reject"** button
5. **Enter rejection reason** (required for admin rejection)
6. Click **"Confirm Rejection"**
7. Order status changes to "Rejected"
8. Agent and leader are notified

#### Viewing Order Details
- Click on any order to see full details
- View all items, quantities, prices
- See payment proof (if uploaded)
- View client signature
- See order history and status changes

**Important**: Only admins can see tax and discount fields in orders. Leaders and agents cannot see these pricing details.

---

## 📋 Purchase Orders

### Creating a Purchase Order
1. Navigate to **Purchase Orders**
2. Click **"Create Purchase Order"** or **"New PO"**
3. Fill in:
   - **Supplier**: Select or add new supplier
   - **Order Date**: Date of order
   - **Expected Delivery**: Expected delivery date
   - **Items**: Add products and quantities
   - **Tax Rate**: Tax percentage (optional)
   - **Discount**: Discount amount (optional)
   - **Notes**: Additional notes
4. Click **"Create Purchase Order"**
5. PO is created and saved

### Managing Purchase Orders
- **View All POs**: See all purchase orders
- **Edit PO**: Modify existing purchase orders
- **View Details**: See complete PO information
- **Track Delivery**: Monitor expected delivery dates

### Managing Suppliers
1. Go to **Purchase Orders**
2. Click **"Manage Suppliers"** or add supplier when creating PO
3. Enter supplier information:
   - Name, contact, address
4. Save supplier
5. Supplier is available for future POs

---

## 💰 Finance & Analytics

### Finance Dashboard
1. Navigate to **Finance**
2. View financial overview:
   - Total revenue
   - Payment breakdowns
   - Financial transactions
   - Payment proofs

### AI Analytics
1. Navigate to **AI Analytics**
2. Access comprehensive analytics:
   - **City Performance**: Sales by city
   - **Product Performance**: Sales by product
   - **Agent KPI**: Agent performance metrics
   - **Revenue Growth**: Revenue trends
   - **Total Revenue**: Overall revenue statistics

**Note**: As admin, you can view all analytics data (not filtered by team). However, you **cannot set agent targets** - only leaders can set targets for their agents.

---

## 📜 System History & Audit

### Viewing System History
1. Navigate to **System History**
2. See all system events and activities
3. View actions from all users (admins, leaders, agents)

### Filtering History
- **By Action Type**: Filter by Orders, Clients, Allocations, Tasks, Financial, Teams, Inventory
- **By Date Range**: 
  - Click **"From Date"** to set start date
  - Click **"To Date"** to set end date
  - If only one date is selected, shows events from that specific day only
  - Click **"Clear"** to remove filters
- **By User**: See actions by specific users

### Understanding Events
- Each event shows:
  - Who performed the action
  - What action was performed
  - When it occurred
  - Target of the action
  - Details and context

### Exporting History
- Use filters to narrow down events
- Copy or export data as needed
- Use for audits and reporting

---

## 👤 Profile Management

### Updating Your Profile
1. Navigate to **Profile**
2. Edit your information:
   - Full name
   - Phone number
   - Address
   - Country
   - Region
3. Click **"Save Changes"**
4. Your profile is updated

### Changing Your Password
1. Go to **Profile**
2. Scroll to **"Change Password"** section
3. Enter:
   - **Current Password**: Your current password
   - **New Password**: Your new password (min 6 characters)
   - **Confirm New Password**: Re-enter new password
4. Click **"Update Password"**
5. Confirm in the dialog
6. Password is updated
7. You will be logged out and need to log in again with new password

---

## 🔧 Common Tasks

### Daily Tasks
1. **Check Dashboard**: Review key metrics
2. **Review Pending Orders**: Approve/reject orders waiting for your approval
3. **Check Inventory Requests**: Process inventory requests
4. **Monitor System**: Review system history for unusual activity

### Weekly Tasks
1. **Review Analytics**: Check performance trends
2. **Audit Orders**: Review approved orders
3. **Check Remittances**: Monitor inventory returns
4. **Review Agents**: Check agent status and activity

### Monthly Tasks
1. **Financial Review**: Review revenue and transactions
2. **Agent Performance**: Analyze agent KPIs
3. **Inventory Audit**: Review stock levels and allocations
4. **System Maintenance**: Review and clean up data

---

## ⚠️ Troubleshooting

### Agent Cannot Log In
1. Check if agent is active (not deactivated)
2. Reset their password to `tempPassword123!`
3. Verify email is correct
4. Check system status

### Order Stuck in Pending
1. Check order status
2. Verify leader has approved (if needed)
3. Approve or reject the order
4. Check for error messages

### Inventory Request Not Showing
1. Check if request was already processed
2. Verify you're looking at the correct page
3. Check filters
4. Refresh the page

### Cannot See Pricing Details
- **This is normal**: Only admins can see tax and discount fields
- Leaders and agents cannot see these details by design

### Agent Target Setting Not Available
- **This is by design**: Only leaders can set targets for their agents
- Admins can view agent KPIs but cannot set targets

---

## 📞 Support & Resources

### Getting Help
- Review this manual for common tasks
- Check system history for audit trails
- Contact system administrator for technical issues

### Best Practices
1. **Regular Reviews**: Check dashboard and pending items daily
2. **Documentation**: Use notes fields when approving/rejecting
3. **Security**: Keep your password secure and change it regularly
4. **Audit Trail**: All actions are logged in system history
5. **Communication**: Notify agents/leaders of important changes

---

## 🔐 Security Notes

### Password Management
- Use strong passwords
- Change password regularly
- Never share your password
- Use the password reset feature if needed

### Data Access
- As admin, you have access to ALL data
- Be mindful of privacy when viewing agent/client information
- All your actions are logged in system history

### Approval Authority
- You have final approval authority for orders
- Your rejections require a reason
- All approvals/rejections are logged

---

*Last Updated: Based on current system version*
*Version: 1.0*

