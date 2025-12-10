# Comprehensive CRUD Audit Logging Plan

## 🎯 Goal
Ensure **every CRUD operation** (Create, Read, Update, Delete) is automatically tracked in the system history (`events` table) for complete audit trail and compliance.

---

## 📋 Current State Analysis

### What's Already Tracked ✅
Based on your system history pages:
- ✅ Stock remittances (via database function)
- ✅ Some order operations
- ✅ Some allocation operations
- ✅ Some task operations

### What's Likely Missing ❌
- ❌ Client CRUD operations
- ❌ Inventory price updates
- ❌ User/profile changes
- ❌ Brand/variant CRUD
- ❌ Supplier CRUD
- ❌ Purchase order operations
- ❌ Company settings changes
- ❌ Team assignment changes
- ❌ Many other operations

### Current Logging Method
- **Manual**: Database functions manually insert into `events` table
- **Inconsistent**: Some operations log, others don't
- **Error-Prone**: Easy to forget to add logging

---

## 🎯 Recommended Approach: **3-Layer Strategy**

### Layer 1: **Database Triggers** (Automatic, Foolproof)
- ✅ Automatically logs ALL table changes
- ✅ Can't be bypassed
- ✅ Works for RPC functions too
- ✅ No frontend changes needed
- ⚠️ Performance overhead (minimal)

### Layer 2: **Centralized Logging Utility** (Frontend)
- ✅ Standardized logging API
- ✅ Rich context (user actions, UI state)
- ✅ Business logic logging
- ✅ Custom event types
- ⚠️ Requires discipline to use

### Layer 3: **Database Functions Enhancement** (Backend)
- ✅ Log complex operations
- ✅ Aggregate multiple actions
- ✅ Transaction-safe
- ⚠️ Must update each function

---

## 🏗️ Implementation Plan

### Phase 1: Database Infrastructure (Highest Priority)

#### 1.1: Events Table Enhancement
```sql
-- Ensure events table has all necessary fields
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  
  -- What happened
  event_type TEXT NOT NULL,  -- 'client_created', 'order_updated', etc.
  action TEXT NOT NULL,       -- 'CREATE', 'UPDATE', 'DELETE', 'READ'
  
  -- Who did it
  actor_id UUID REFERENCES profiles(id),
  actor_role TEXT,            -- Cache role at time of action
  actor_name TEXT,            -- Cache name for faster queries
  
  -- What was affected
  target_type TEXT NOT NULL,  -- 'client', 'order', 'inventory', etc.
  target_id UUID,             -- ID of the affected record
  target_label TEXT,          -- Human-readable label
  
  -- Context
  details JSONB,              -- Full change details
  before_state JSONB,         -- Record state before change (UPDATE/DELETE)
  after_state JSONB,          -- Record state after change (CREATE/UPDATE)
  
  -- Metadata
  ip_address TEXT,            -- Optional: track IP
  user_agent TEXT,            -- Optional: track browser/device
  occurred_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Indexes for fast queries
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_events_company_occurred ON events(company_id, occurred_at DESC);
CREATE INDEX idx_events_actor ON events(actor_id, occurred_at DESC);
CREATE INDEX idx_events_type ON events(event_type, occurred_at DESC);
CREATE INDEX idx_events_target ON events(target_type, target_id);
```

#### 1.2: Generic Audit Trigger Function
```sql
CREATE OR REPLACE FUNCTION log_table_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_actor_id UUID;
  v_actor_name TEXT;
  v_actor_role TEXT;
  v_company_id UUID;
  v_action TEXT;
  v_event_type TEXT;
  v_target_label TEXT;
BEGIN
  -- Get current user from session
  v_actor_id := auth.uid();
  
  -- Get actor details
  SELECT full_name, role, company_id 
  INTO v_actor_name, v_actor_role, v_company_id
  FROM profiles 
  WHERE id = v_actor_id;
  
  -- Determine action type
  IF TG_OP = 'INSERT' THEN
    v_action := 'CREATE';
    v_company_id := COALESCE(v_company_id, NEW.company_id);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'UPDATE';
    v_company_id := COALESCE(v_company_id, NEW.company_id, OLD.company_id);
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'DELETE';
    v_company_id := COALESCE(v_company_id, OLD.company_id);
  END IF;
  
  -- Build event type (e.g., 'client_created', 'order_updated')
  v_event_type := TG_TABLE_NAME || '_' || LOWER(v_action);
  
  -- Build target label (try common name fields)
  IF TG_OP = 'DELETE' THEN
    v_target_label := COALESCE(OLD.name, OLD.title, OLD.order_number, OLD.id::TEXT);
  ELSE
    v_target_label := COALESCE(NEW.name, NEW.title, NEW.order_number, NEW.id::TEXT);
  END IF;
  
  -- Insert audit log
  INSERT INTO events (
    company_id,
    event_type,
    action,
    actor_id,
    actor_role,
    actor_name,
    target_type,
    target_id,
    target_label,
    before_state,
    after_state,
    details,
    occurred_at
  ) VALUES (
    v_company_id,
    v_event_type,
    v_action,
    v_actor_id,
    v_actor_role,
    v_actor_name,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    v_target_label,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
    jsonb_build_object(
      'table', TG_TABLE_NAME,
      'operation', TG_OP,
      'changed_fields', CASE 
        WHEN TG_OP = 'UPDATE' THEN (
          SELECT jsonb_object_agg(key, value)
          FROM jsonb_each(to_jsonb(NEW))
          WHERE to_jsonb(NEW)->>key IS DISTINCT FROM to_jsonb(OLD)->>key
        )
        ELSE NULL
      END
    ),
    NOW()
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

#### 1.3: Apply Triggers to Critical Tables
```sql
-- Clients table
CREATE TRIGGER audit_clients_changes
  AFTER INSERT OR UPDATE OR DELETE ON clients
  FOR EACH ROW EXECUTE FUNCTION log_table_changes();

-- Orders table  
CREATE TRIGGER audit_client_orders_changes
  AFTER INSERT OR UPDATE OR DELETE ON client_orders
  FOR EACH ROW EXECUTE FUNCTION log_table_changes();

-- Inventory table
CREATE TRIGGER audit_main_inventory_changes
  AFTER INSERT OR UPDATE OR DELETE ON main_inventory
  FOR EACH ROW EXECUTE FUNCTION log_table_changes();

-- Agent inventory
CREATE TRIGGER audit_agent_inventory_changes
  AFTER INSERT OR UPDATE OR DELETE ON agent_inventory
  FOR EACH ROW EXECUTE FUNCTION log_table_changes();

-- Purchase orders
CREATE TRIGGER audit_purchase_orders_changes
  AFTER INSERT OR UPDATE OR DELETE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION log_table_changes();

-- Brands
CREATE TRIGGER audit_brands_changes
  AFTER INSERT OR UPDATE OR DELETE ON brands
  FOR EACH ROW EXECUTE FUNCTION log_table_changes();

-- Variants
CREATE TRIGGER audit_variants_changes
  AFTER INSERT OR UPDATE OR DELETE ON variants
  FOR EACH ROW EXECUTE FUNCTION log_table_changes();

-- Suppliers
CREATE TRIGGER audit_suppliers_changes
  AFTER INSERT OR UPDATE OR DELETE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION log_table_changes();

-- Profiles (user changes)
CREATE TRIGGER audit_profiles_changes
  AFTER INSERT OR UPDATE OR DELETE ON profiles
  FOR EACH ROW EXECUTE FUNCTION log_table_changes();

-- Leader teams
CREATE TRIGGER audit_leader_teams_changes
  AFTER INSERT OR UPDATE OR DELETE ON leader_teams
  FOR EACH ROW EXECUTE FUNCTION log_table_changes();

-- Companies (admin changes)
CREATE TRIGGER audit_companies_changes
  AFTER INSERT OR UPDATE OR DELETE ON companies
  FOR EACH ROW EXECUTE FUNCTION log_table_changes();

-- Tasks
CREATE TRIGGER audit_tasks_changes
  AFTER INSERT OR UPDATE OR DELETE ON tasks
  FOR EACH ROW EXECUTE FUNCTION log_table_changes();
```

---

### Phase 2: Frontend Logging Utility

#### 2.1: Create Centralized Logger
```typescript
// src/lib/auditLogger.ts

interface AuditLogParams {
  eventType: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'READ' | 'APPROVE' | 'REJECT';
  targetType: string;
  targetId?: string;
  targetLabel?: string;
  details?: Record<string, any>;
  beforeState?: any;
  afterState?: any;
}

export async function logAuditEvent(params: AuditLogParams): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get user profile for company_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id, full_name, role')
      .eq('id', user.id)
      .single();

    if (!profile) return;

    await supabase.from('events').insert({
      company_id: profile.company_id,
      event_type: params.eventType,
      action: params.action,
      actor_id: user.id,
      actor_name: profile.full_name,
      actor_role: profile.role,
      target_type: params.targetType,
      target_id: params.targetId,
      target_label: params.targetLabel,
      before_state: params.beforeState,
      after_state: params.afterState,
      details: params.details,
      occurred_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to log audit event:', error);
    // Don't throw - logging shouldn't break app functionality
  }
}

// Convenience functions for common operations
export const auditLog = {
  clientCreated: (clientId: string, clientName: string, details?: any) =>
    logAuditEvent({
      eventType: 'client_created',
      action: 'CREATE',
      targetType: 'client',
      targetId: clientId,
      targetLabel: clientName,
      details
    }),

  clientUpdated: (clientId: string, clientName: string, before: any, after: any) =>
    logAuditEvent({
      eventType: 'client_updated',
      action: 'UPDATE',
      targetType: 'client',
      targetId: clientId,
      targetLabel: clientName,
      beforeState: before,
      afterState: after
    }),

  clientDeleted: (clientId: string, clientName: string, clientData: any) =>
    logAuditEvent({
      eventType: 'client_deleted',
      action: 'DELETE',
      targetType: 'client',
      targetId: clientId,
      targetLabel: clientName,
      beforeState: clientData
    }),

  inventoryPriceUpdated: (variantId: string, variantName: string, oldPrices: any, newPrices: any) =>
    logAuditEvent({
      eventType: 'inventory_price_updated',
      action: 'UPDATE',
      targetType: 'inventory',
      targetId: variantId,
      targetLabel: variantName,
      beforeState: oldPrices,
      afterState: newPrices
    }),

  purchaseOrderApproved: (poId: string, poNumber: string, details?: any) =>
    logAuditEvent({
      eventType: 'purchase_order_approved',
      action: 'APPROVE',
      targetType: 'purchase_order',
      targetId: poId,
      targetLabel: poNumber,
      details
    }),

  brandCreated: (brandId: string, brandName: string) =>
    logAuditEvent({
      eventType: 'brand_created',
      action: 'CREATE',
      targetType: 'brand',
      targetId: brandId,
      targetLabel: brandName
    }),

  agentAssigned: (agentId: string, leaderId: string, details: any) =>
    logAuditEvent({
      eventType: 'agent_assigned_to_leader',
      action: 'UPDATE',
      targetType: 'leader_team',
      targetId: agentId,
      details
    }),
  
  // Add more as needed...
};
```

#### 2.2: Use in Frontend
```typescript
// Example: ClientsPage.tsx
import { auditLog } from '@/lib/auditLogger';

const handleAddClient = async () => {
  const { data, error } = await supabase
    .from('clients')
    .insert({ ... });
  
  if (!error && data) {
    // Log the action
    await auditLog.clientCreated(data.id, data.name, {
      account_type: data.account_type,
      has_forge: data.has_forge,
      city: data.city
    });
  }
};
```

---

## 📊 Tables to Track

### High Priority (Critical Business Data)
1. **clients** - All client CRUD
2. **client_orders** - Order creation, status changes
3. **main_inventory** - Stock changes, price updates
4. **agent_inventory** - Allocations, remittances
5. **purchase_orders** - PO creation, approval, rejection
6. **profiles** - User changes, role updates
7. **leader_teams** - Team assignments

### Medium Priority (Operational Data)
8. **brands** - Brand creation, updates
9. **variants** - Variant creation, updates
10. **suppliers** - Supplier management
11. **tasks** - Task creation, completion
12. **companies** - Company settings changes

### Low Priority (Reference Data)
13. **notifications** - Usually don't need to audit notifications themselves
14. **financial_transactions** - Already has audit via transactions table
15. **inventory_transactions** - Already logged

---

## 🔐 Security & Compliance Benefits

### Audit Trail
- ✅ **Who** did what (actor_id, actor_name)
- ✅ **What** changed (before/after state)
- ✅ **When** it happened (occurred_at)
- ✅ **Why** (details field for context)
- ✅ **Where** (company_id for multi-tenant)

### Compliance
- ✅ **SOC 2** - Complete audit logs
- ✅ **GDPR** - Data access tracking
- ✅ **ISO 27001** - Change management
- ✅ **Forensics** - Incident investigation
- ✅ **Dispute Resolution** - Proof of actions

### Business Intelligence
- ✅ **User Behavior** - What features are used
- ✅ **Anomaly Detection** - Unusual patterns
- ✅ **Performance Metrics** - Action frequency
- ✅ **Training Needs** - Common errors/mistakes

---

## 📈 Event Type Taxonomy

### Naming Convention
Format: `{table}_{action}` (e.g., `client_created`, `order_updated`)

### Standard Actions
- `CREATE` - New record inserted
- `UPDATE` - Record modified
- `DELETE` - Record deleted
- `READ` - Sensitive data accessed (optional)
- `APPROVE` - Approval granted
- `REJECT` - Approval denied
- `ASSIGN` - Assignment/relationship created
- `TRANSFER` - Ownership transferred

### Examples

#### Clients
- `client_created` - New client added
- `client_updated` - Client info modified
- `client_deleted` - Client removed
- `client_approved` - Client approval granted
- `client_rejected` - Client approval denied
- `client_transferred` - Client moved to new agent

#### Orders
- `order_created` - New order placed
- `order_updated` - Order modified
- `order_approved` - Order approved by leader/admin
- `order_rejected` - Order rejected
- `order_voided` - Order cancelled

#### Inventory
- `inventory_created` - New inventory item
- `inventory_price_updated` - Prices changed
- `inventory_stock_updated` - Stock quantity changed
- `inventory_allocated` - Stock allocated to agent
- `inventory_remitted` - Stock returned

#### Purchase Orders
- `purchase_order_created` - PO created
- `purchase_order_approved` - PO approved
- `purchase_order_received` - Items received

#### Users & Teams
- `profile_updated` - User profile modified
- `profile_role_changed` - Role changed
- `agent_assigned_to_leader` - Team assignment
- `agent_removed_from_team` - Team unassignment

---

## 🛠️ Implementation Steps

### Step 1: Create Core Infrastructure
1. Run `create_audit_logging_infrastructure.sql`
   - Updates events table schema
   - Creates trigger function
   - Adds indexes

### Step 2: Apply Triggers to Tables
1. Run `apply_audit_triggers.sql`
   - Adds triggers to all critical tables
   - One trigger per table

### Step 3: Create Frontend Utility
1. Create `src/lib/auditLogger.ts`
   - Centralized logging API
   - Convenience functions
   - Error handling

### Step 4: Integrate into Existing Code
1. Update major CRUD operations:
   - ClientsPage.tsx
   - PurchaseOrderContext.tsx
   - InventoryContext.tsx
   - TeamManagementTab.tsx
2. Add logging after successful operations

### Step 5: Update Database Functions
1. Enhance existing RPC functions:
   - approve_purchase_order
   - allocate_to_leader
   - assign_agent_to_leader
   - remit_inventory_to_leader
2. Ensure they log to events table

### Step 6: Testing & Verification
1. Test each CRUD operation
2. Verify events appear in System History
3. Check performance impact
4. Validate data completeness

---

## ⚡ Performance Considerations

### Database Triggers (Minimal Impact)
- **Write Overhead**: ~5-10ms per operation
- **Storage Growth**: ~1KB per event
- **Monthly Growth**: Depends on activity (estimate: 10K-100K events)

### Optimization Strategies
1. **Partition events table** by month
2. **Archive old events** (> 1 year) to separate table
3. **Index optimization** for common queries
4. **Async logging** where possible (frontend)
5. **Batch operations** for bulk changes

### Storage Estimates
```
Average event size: 1 KB
Daily operations: 1,000
Monthly storage: ~30 MB
Yearly storage: ~365 MB
```

Very manageable for most databases!

---

## 🎨 UI Enhancements

### System History Page Improvements
1. **Advanced Filters**:
   - By event type
   - By actor (user who performed action)
   - By target type (table affected)
   - By date range
   - By action (CREATE/UPDATE/DELETE)

2. **Change Visualization**:
   - Diff view for UPDATE events
   - Show before/after values
   - Highlight changed fields

3. **Export Options**:
   - CSV export for compliance
   - PDF reports
   - Date range selection

4. **Search**:
   - Full-text search in details
   - Search by client name, order number, etc.

---

## 🚨 Exclusions (Don't Log Everything!)

### Skip Logging For:
- ❌ **Read operations** (too many, not useful)
- ❌ **Session refreshes** (automated)
- ❌ **Heartbeat/ping** (noise)
- ❌ **Temporary data** (drafts, cache)
- ❌ **System-generated updates** (updated_at changes only)

### Log Selectively:
- ✅ **Sensitive data access** (admin viewing financial reports)
- ✅ **Bulk operations** (one event for batch, not per row)
- ✅ **Critical actions** (delete, role change, approval)

---

## 📋 Event Retention Policy

### Recommended Retention
- **Recent Events** (0-3 months): Keep in main table, full detail
- **Archived Events** (3-12 months): Move to archive table, full detail
- **Historical Events** (1-7 years): Compress/summarize, keep metadata
- **Very Old Events** (7+ years): Purge or cold storage

### Implementation
```sql
-- Monthly archival job
CREATE OR REPLACE FUNCTION archive_old_events()
RETURNS void AS $$
BEGIN
  -- Move events older than 3 months to archive
  INSERT INTO events_archive
  SELECT * FROM events
  WHERE occurred_at < NOW() - INTERVAL '3 months';
  
  DELETE FROM events
  WHERE occurred_at < NOW() - INTERVAL '3 months';
END;
$$ LANGUAGE plpgsql;

-- Schedule with pg_cron (if available) or run manually monthly
```

---

## 🎯 Quick Start (Minimum Viable Audit)

If you want to start small and expand later:

### Priority 1: Critical Operations Only
```sql
-- Just add triggers to these 3 tables
CREATE TRIGGER audit_clients_changes ...
CREATE TRIGGER audit_client_orders_changes ...
CREATE TRIGGER audit_main_inventory_changes ...
```

### Priority 2: Add Frontend Logging for Special Cases
```typescript
// Only log business-critical actions manually
await auditLog.clientApproved(...);
await auditLog.orderVoided(...);
await auditLog.inventoryPriceChanged(...);
```

### Priority 3: Expand Gradually
- Add more triggers as needed
- Expand event types
- Enhance UI filters

---

## 🔄 Migration Strategy

### For Existing System
1. **Phase 1**: Deploy infrastructure (tables, triggers, functions)
2. **Phase 2**: Test with non-critical tables first
3. **Phase 3**: Monitor performance for 1 week
4. **Phase 4**: Roll out to all tables
5. **Phase 5**: Enhance UI and reports

### Rollback Plan
```sql
-- If needed, remove triggers
DROP TRIGGER IF EXISTS audit_clients_changes ON clients;
DROP TRIGGER IF EXISTS audit_client_orders_changes ON client_orders;
-- ... etc

-- Keep events table - historical data is valuable!
```

---

## ✅ Success Criteria

### Functional Requirements
- [ ] All CRUD operations logged automatically
- [ ] Events appear in System History immediately
- [ ] Before/after states captured for updates
- [ ] Actor information always present
- [ ] Company isolation maintained

### Performance Requirements
- [ ] Page load times unchanged (< 5ms overhead)
- [ ] Database writes < 10ms slower
- [ ] System History page loads < 2s

### Security Requirements
- [ ] Events table protected by RLS
- [ ] Only admins can view full history
- [ ] Agents see only their own events
- [ ] Events cannot be deleted/modified

---

## 📚 Next Steps

1. **Review this plan** - Does it meet your needs?
2. **Choose approach** - Database triggers vs Frontend logging vs Both
3. **Prioritize tables** - Which tables are most critical?
4. **Set timeline** - Phased rollout or all at once?
5. **Implement** - I can create all the SQL scripts and utility code

---

**Recommendation**: Start with **Database Triggers** for automatic coverage, then add **Frontend Logging** for rich context on critical operations.

Would you like me to implement this? I can start with:
1. ✅ SQL scripts for triggers
2. ✅ Frontend audit logger utility
3. ✅ Integration examples

Let me know which approach you prefer! 🚀

