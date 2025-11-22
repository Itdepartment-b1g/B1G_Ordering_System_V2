# 📦 Remittance Tracking - Events & Notifications

## ✅ What Was Added

### **Before:**
- ❌ Remittances happened silently
- ❌ No event logs for remittances
- ❌ Leaders weren't notified
- ❌ No audit trail in system history

### **After:**
- ✅ **Event logs created** for every remittance
- ✅ **Leaders get notified** when agents remit
- ✅ **Full audit trail** in system history
- ✅ **Visible in agent/leader history pages**

---

## 🔄 How It Works

### **When an Agent Remits Stock:**

```
1. Agent completes remittance form
   ├─ Unsold inventory items
   ├─ Today's sold orders
   └─ Signature

2. Backend processes remittance
   ├─ Clears agent inventory (stock = 0)
   ├─ Marks orders as "remitted"
   ├─ Saves signature to bucket
   └─ Creates remittances_log record

3. 🆕 Creates event log
   ├─ Type: "stock_remitted"
   ├─ Actor: Agent ID
   └─ Details: Full remittance info

4. 🆕 Creates notification for leader
   ├─ Type: "stock_alert"
   ├─ Title: "Stock Remittance from [Agent Name]"
   └─ Message: Summary with numbers

5. Leader receives notification
   ├─ Shows in notification bell
   ├─ Can click to view details
   └─ Appears in Leader History
```

---

## 📊 Event Details Structure

### **What's Logged:**

```json
{
  "event_type": "stock_remitted",
  "actor_id": "agent-uuid",
  "details": {
    "remittance_id": "uuid",
    "agent_id": "uuid",
    "agent_name": "John Smith",
    "leader_id": "uuid",
    "leader_name": "Sarah Jones",
    "items_count": 5,
    "total_units": 120,
    "orders_count": 12,
    "total_revenue": 45000,
    "product_list": "VUSE B1G Purple (30), IQOS Classic (25), ...",
    "signature_provided": true,
    "remittance_date": "2025-11-11"
  },
  "occurred_at": "2025-11-11T14:30:00Z"
}
```

### **Key Information:**
- ✅ Who remitted (agent name)
- ✅ Who received (leader name)
- ✅ How many items/units
- ✅ How many orders + revenue
- ✅ List of products remitted
- ✅ Whether signature was provided
- ✅ Exact timestamp

---

## 🔔 Notification Details

### **What Leaders See:**

**Notification Title:**
```
"Stock Remittance from John Smith"
```

**Notification Message:**
```
"John Smith remitted 5 items (120 units) and 12 orders (₱45,000 revenue)"
```

**Notification Properties:**
- **Type:** `stock_alert`
- **Reference Type:** `remittance`
- **Reference ID:** Links to remittance_log record
- **Is Read:** `false` (unread by default)

### **Where Notifications Appear:**

1. **Notification Bell** (Top-right corner)
   - Shows count of unread
   - Click to see all notifications
   - Can mark as read

2. **Leader History Page**
   - Appears in event timeline
   - Shows full details
   - Color-coded for remittances

3. **System History** (Admin view)
   - All remittances logged
   - Searchable and filterable
   - Full audit trail

---

## 📍 Where to See Remittance Events

### **1. Leader's View (Team Remittance Page)**
```
Navigate: Leader Sidebar → Inventory → Team Remittances

See:
- List of all remittances from team agents
- Date, agent name, items, orders, revenue
- Click "View Details" to see:
  ├─ Summary (units, revenue)
  ├─ Sold Orders (all order details)
  └─ Signature (agent's signature)
```

### **2. Leader History Page**
```
Navigate: Leader Sidebar → My History

See:
- Timeline of all inventory events
- Remittances show as "stock_remitted"
- Click to expand details:
  ├─ Agent who remitted
  ├─ Number of items/units
  ├─ Orders and revenue
  └─ Product list
```

### **3. Agent History Page**
```
Navigate: Agent Sidebar → My History

See:
- Your own remittance history
- Shows when you remitted to your leader
- Full details of each remittance
```

### **4. System History (Admin)**
```
Navigate: Admin Sidebar → System History

See:
- ALL remittances across all agents/leaders
- Filterable by:
  ├─ Date range
  ├─ Event type (stock_remitted)
  ├─ Agent
  └─ Leader
```

---

## 🎯 Business Benefits

### **For Leaders:**
✅ **Real-time awareness** - Know immediately when agents remit  
✅ **Better oversight** - Track team activity automatically  
✅ **Quick validation** - Can review remittances right away  
✅ **Audit trail** - Historical record of all remittances  

### **For Admins:**
✅ **System-wide visibility** - See all remittances across organization  
✅ **Compliance** - Full audit trail for accountability  
✅ **Performance tracking** - Monitor remittance patterns  
✅ **Issue detection** - Spot irregularities or problems  

### **For Agents:**
✅ **Confirmation** - Know remittance was recorded  
✅ **History** - Review past remittances  
✅ **Transparency** - Clear record of what was remitted  

---

## 🔍 Example Scenarios

### **Scenario 1: Normal Remittance**

**Agent Action:**
```
Agent John completes end-of-day remittance:
- 5 unsold items (120 units)
- 12 completed orders (₱45,000 revenue)
- Signs digitally
```

**System Response:**
```
✅ Inventory cleared
✅ Orders marked as remitted
✅ Signature saved
✅ Event created: "stock_remitted"
✅ Notification sent to Leader Sarah
```

**Leader Sarah Sees:**
```
🔔 New notification:
"Stock Remittance from John Smith"
"John Smith remitted 5 items (120 units) and 12 orders (₱45,000 revenue)"

[Click to view full details]
```

**In History:**
```
📅 Nov 11, 2025 - 2:30 PM
🔄 Stock Remitted
👤 John Smith → Sarah Jones (Leader)
📦 5 items, 120 units
💰 12 orders, ₱45,000 revenue
✍️ Signature provided
```

---

### **Scenario 2: Multiple Agents Remitting**

**Timeline:**
```
2:30 PM - Agent John remits → Leader Sarah notified
3:15 PM - Agent Maria remits → Leader Sarah notified
4:00 PM - Agent Carlos remits → Leader Sarah notified
```

**Leader Sarah's Notifications:**
```
🔔 3 unread notifications

1. "Stock Remittance from John Smith"
2. "Stock Remittance from Maria Garcia"
3. "Stock Remittance from Carlos Lopez"
```

**Leader can:**
- View each remittance separately
- See full details for each
- Mark as read after review
- Cross-reference in Team Remittances page

---

### **Scenario 3: Admin Oversight**

**Admin View (System History):**
```
Filter: Event Type = "stock_remitted"
Date Range: This Week

Results:
📅 Nov 11 - John → Sarah: 5 items, ₱45K
📅 Nov 11 - Maria → Sarah: 8 items, ₱62K
📅 Nov 11 - Carlos → Sarah: 3 items, ₱28K
📅 Nov 10 - Lisa → Mike: 6 items, ₱51K
📅 Nov 10 - Tom → Mike: 4 items, ₱35K

Total: 5 remittances, 26 items, ₱221K revenue
```

**Admin can:**
- See organization-wide remittance activity
- Identify patterns (who remits regularly)
- Spot anomalies (unusual amounts/timing)
- Export for reporting

---

## 🛠️ Technical Implementation

### **Database Changes:**

#### **1. Updated Function:**
```sql
CREATE OR REPLACE FUNCTION remit_inventory_to_leader(...)
  -- Added:
  - Event creation (INSERT INTO events)
  - Notification creation (INSERT INTO notifications)
  - Product list building for details
  - Enhanced return object with event_id
```

#### **2. Event Log Entry:**
```sql
INSERT INTO events (
  event_type = 'stock_remitted',
  actor_id = agent_id,
  details = {full remittance info},
  occurred_at = NOW()
)
```

#### **3. Notification Entry:**
```sql
INSERT INTO notifications (
  user_id = leader_id,
  notification_type = 'stock_alert',
  title = 'Stock Remittance from [Agent]',
  message = '[Summary with numbers]',
  reference_type = 'remittance',
  reference_id = remittance_log_id,
  is_read = false
)
```

---

## 📊 Event Type Registry

### **New Event Type:**

```typescript
Event Type: "stock_remitted"
Category: Inventory
Severity: Info
Visibility: Agent (own), Leader (team), Admin (all)

Details Schema:
{
  remittance_id: UUID,
  agent_id: UUID,
  agent_name: string,
  leader_id: UUID,
  leader_name: string,
  items_count: number,
  total_units: number,
  orders_count: number,
  total_revenue: number,
  product_list: string,
  signature_provided: boolean,
  remittance_date: date
}
```

---

## 🔐 Security & Privacy

### **Who Can See What:**

**Agent:**
- ✅ Their own remittance events
- ❌ Other agents' remittances
- ❌ Leader's view of remittances

**Leader:**
- ✅ Remittances from their team agents
- ✅ Notifications for their team
- ❌ Other leaders' team remittances

**Admin:**
- ✅ All remittances system-wide
- ✅ All events and notifications
- ✅ Full audit trail access

### **RLS Policies:**
```sql
-- Events table
Agents can view: WHERE actor_id = auth.uid()
Leaders can view: WHERE actor_id IN (their_team_agents)
Admins can view: ALL

-- Notifications table
Users can view: WHERE user_id = auth.uid()
```

---

## 🎓 Best Practices

### **For Agents:**
1. ✅ Remit daily to maintain clean records
2. ✅ Include all orders from the day
3. ✅ Always provide signature
4. ✅ Review remittance summary before confirming

### **For Leaders:**
1. ✅ Check notifications daily
2. ✅ Review remittances promptly
3. ✅ Validate orders match your records
4. ✅ Contact agent if discrepancies found

### **For Admins:**
1. ✅ Monitor system history weekly
2. ✅ Look for patterns (timing, amounts)
3. ✅ Investigate unusual activity
4. ✅ Export reports for management

---

## 🚀 Testing Checklist

### **Test as Agent:**
- [ ] Complete a remittance
- [ ] Check My History - remittance event appears
- [ ] Verify signature was saved
- [ ] Confirm inventory cleared

### **Test as Leader:**
- [ ] Receive notification when agent remits
- [ ] Click notification → see details
- [ ] Check Team Remittances page
- [ ] Verify all data is accurate
- [ ] Check My History - event appears

### **Test as Admin:**
- [ ] View System History
- [ ] Filter by "stock_remitted" events
- [ ] See all remittances across organization
- [ ] Verify event details are complete

---

## ✅ Summary

### **What This Achieves:**

✅ **Full Traceability** - Every remittance is logged  
✅ **Real-time Alerts** - Leaders notified immediately  
✅ **Audit Compliance** - Complete history for accountability  
✅ **Better Communication** - No surprises, clear records  
✅ **Performance Tracking** - Monitor remittance patterns  

### **Impact:**

**Before:**
- Remittances were "dark" - no visibility
- Leaders didn't know when agents remitted
- No system history of remittances
- Hard to audit or track

**After:**
- Every remittance creates an event
- Leaders get instant notifications
- Full audit trail in system history
- Easy to review and validate

---

## 📝 Migration Instructions

### **To Deploy:**

```bash
# Run the migration
psql -d your_database -f supabase/migrations/20251111_add_remit_events_and_notifications.sql
```

### **What Happens:**
1. Drops old `remit_inventory_to_leader` function
2. Creates new version with events + notifications
3. Grants permissions to authenticated users
4. Shows success message

### **Verification:**
```sql
-- Check function exists
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_name = 'remit_inventory_to_leader';

-- Test a remittance (as agent)
SELECT remit_inventory_to_leader(
  'agent-uuid',
  'leader-uuid',
  'agent-uuid',
  ARRAY['order-uuid-1', 'order-uuid-2'],
  'signature-url',
  'signature-path'
);

-- Check event was created
SELECT * FROM events 
WHERE event_type = 'stock_remitted' 
ORDER BY occurred_at DESC 
LIMIT 1;

-- Check notification was created
SELECT * FROM notifications 
WHERE notification_type = 'stock_alert' 
ORDER BY created_at DESC 
LIMIT 1;
```

---

**Your remittance system now has full tracking, notifications, and audit trails! 🎉**

