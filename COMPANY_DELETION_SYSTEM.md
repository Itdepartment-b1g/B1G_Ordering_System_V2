# Company Deletion System - Complete Cascade Delete Implementation

## Overview

This document describes the comprehensive system for deleting companies and all related data across all tables in the multi-tenant B2B system. When a system administrator deletes a company, **everything** connected to that `company_id` is automatically deleted without affecting other companies.

## Architecture

### Database-Level Cascade Deletes

All tables with `company_id` foreign keys are configured with `ON DELETE CASCADE`, ensuring that when a company is deleted, all related records are automatically removed by PostgreSQL.

### Application-Level Function

A PostgreSQL function `delete_company_cascade()` handles special cases and ensures proper deletion order to avoid foreign key constraint violations.

## Tables Affected by Company Deletion

When a company is deleted, the following tables are automatically cleaned up via CASCADE:

### Core Tables
- ✅ `profiles` - All users belonging to the company
- ✅ `brands` - All product brands
- ✅ `variants` - All product variants
- ✅ `main_inventory` - All main warehouse inventory
- ✅ `agent_inventory` - All agent-allocated inventory
- ✅ `suppliers` - All supplier records

### Orders & Transactions
- ✅ `purchase_orders` - All purchase orders
- ✅ `purchase_order_items` - All purchase order line items
- ✅ `clients` - All client records
- ✅ `client_orders` - All client orders
- ✅ `client_order_items` - All client order line items
- ✅ `remittances_log` - All remittance records
- ✅ `financial_transactions` - All financial transactions
- ✅ `inventory_transactions` - All inventory transaction history

### Teams & Requests
- ✅ `leader_teams` - All team assignments (leader-agent relationships)
- ✅ `stock_requests` - All stock requests
- ✅ `stock_request_items` - All stock request line items

### Returns & Deposits
- ✅ `inventory_returns` - All inventory return records
- ✅ `inventory_return_items` - All inventory return line items
- ✅ `cash_deposits` - All cash deposit records

### System Tables
- ✅ `notifications` - All user notifications
- ✅ `events` - All event logs
- ✅ `system_audit_log` - All audit log entries
- ✅ `executive_company_assignments` - All executive assignments to the company

## Special Handling

### Executive Company Assignments

Executives have `company_id = NULL` and use the `executive_company_assignments` junction table to access multiple companies. The deletion function:

1. **Removes assignments** - Deletes all `executive_company_assignments` where `company_id` matches the company being deleted
2. **Cleans up references** - Sets `assigned_by` to NULL for any assignments where the assigner profile belongs to the company being deleted
3. **Removes executive profiles** - If an executive profile belongs to the company (edge case), removes all their assignments

### Nullable Foreign Keys

The function sets nullable foreign key fields to NULL before deletion to prevent constraint violations:

- `stock_requests.leader_approved_by`
- `stock_requests.admin_approved_by`
- `stock_requests.fulfilled_by`
- `stock_requests.rejected_by`
- `client_orders.approved_by`
- `purchase_orders.approved_by`
- `financial_transactions.agent_id`
- `executive_company_assignments.assigned_by`

## Migration Files

### 1. `ensure_company_cascade_delete.sql`
Ensures all `company_id` foreign keys have `ON DELETE CASCADE` configured. Fixes any tables that might be missing this constraint.

### 2. `fix_executive_assignments_cascade.sql`
Fixes foreign key constraints on `executive_company_assignments`:
- `executive_id` → `profiles(id)` with `ON DELETE CASCADE`
- `company_id` → `companies(id)` with `ON DELETE CASCADE`
- `assigned_by` → `profiles(id)` with `ON DELETE SET NULL`

### 3. `delete_company_cascade.sql`
Creates the main deletion function that:
- Verifies the user is a system administrator
- Cleans up executive assignments
- Handles nullable foreign keys
- Deletes the company (which cascades to all related tables)

## Usage

### From Application Code

```typescript
const { error } = await supabase.rpc('delete_company_cascade', {
  p_company_id: companyId,
});
```

### From SQL

```sql
SELECT delete_company_cascade('company-uuid-here');
```

## Security

- ✅ Only system administrators can delete companies
- ✅ Function uses `SECURITY DEFINER` to bypass RLS during deletion
- ✅ All operations are transactional (all-or-nothing)
- ✅ Company existence is verified before deletion

## Data Integrity

- ✅ **Multi-tenant isolation** - Only data belonging to the deleted company is removed
- ✅ **No orphaned records** - All related data is properly cleaned up
- ✅ **No cross-company contamination** - Other companies' data remains untouched
- ✅ **Referential integrity** - All foreign key constraints are respected

## Deletion Order

The function ensures proper deletion order:

1. **Pre-deletion cleanup**:
   - Set nullable foreign keys to NULL
   - Remove executive assignments
   - Clean up cross-references

2. **Company deletion** (triggers CASCADE):
   - Company record deleted
   - All related records automatically deleted via CASCADE
   - Profiles deleted (which triggers auth.users deletion via CASCADE)

3. **Post-deletion**:
   - Function completes successfully
   - All data related to the company is removed

## Testing Checklist

Before deploying, verify:

- [ ] All `company_id` foreign keys have `ON DELETE CASCADE`
- [ ] Executive assignments are properly removed
- [ ] Nullable foreign keys are set to NULL
- [ ] Other companies' data is not affected
- [ ] System administrators can delete companies
- [ ] Non-administrators cannot delete companies
- [ ] Deletion is atomic (all-or-nothing)

## Rollback

If a company is deleted accidentally:

1. **No automatic rollback** - Deletion is permanent
2. **Database backup** - Restore from backup if needed
3. **Manual recreation** - Recreate company and data manually

## Notes

- Executives with `company_id = NULL` are **not** deleted when a company is deleted
- Their assignments to the deleted company are removed, but they remain in the system
- All other users belonging to the company are deleted along with the company
- Auth users are automatically deleted via CASCADE when profiles are deleted
