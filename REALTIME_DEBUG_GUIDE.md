# 🐛 Real-Time Subscription Debug Guide

## 🚨 Issue: Subscription Status Shows "CLOSED"

If you see this in the console:
```
🔄 Real-time subscription status: CLOSED
```

This means the real-time connection is **NOT active**. Follow this guide to fix it.

---

## ✅ Step 1: Enable Realtime in Supabase

### Option A: Using SQL Script (Recommended)

1. **Open Supabase SQL Editor**:
   - Go to your Supabase dashboard
   - Click "SQL Editor" in the left sidebar

2. **Run the enable script**:
   ```bash
   # Copy the contents of this file:
   supabase/enable_realtime_for_tables.sql
   ```

3. **Paste and execute** in the SQL Editor

4. **Verify success**:
   Look for these messages:
   ```sql
   NOTICE:  Added table agent_inventory to realtime publication.
   NOTICE:  Added table client_orders to realtime publication.
   NOTICE:  Added table cash_deposits to realtime publication.
   ...
   ```

### Option B: Using Dashboard (Manual)

1. **Go to Database → Replication**
2. **Find "supabase_realtime" publication**
3. **Add these tables** (click "+ Add table"):
   - ✅ `agent_inventory`
   - ✅ `client_orders`
   - ✅ `cash_deposits`
   - ✅ `leader_teams`
   - ✅ `remittances_log`
   - ✅ `stock_requests`
   - ✅ (See full list in `enable_realtime_for_tables.sql`)

4. **Click "Save"**

---

## ✅ Step 2: Verify Realtime is Enabled

### Check in Supabase Dashboard

1. **Go to Database → Replication**
2. **Click on "supabase_realtime" publication**
3. **Verify** these tables are listed:
   ```
   ✅ agent_inventory
   ✅ client_orders
   ✅ cash_deposits
   ✅ leader_teams
   ✅ remittances_log
   ```

### Check in SQL Editor

Run this query:
```sql
SELECT tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;
```

**Expected output**:
```
tablename
-------------------
agent_inventory
brands
cash_deposits
client_order_items
client_orders
...
```

If you see **0 rows** or your tables are missing → Realtime is **NOT enabled**.

---

## ✅ Step 3: Hard Refresh Your Browser

After enabling Realtime:

1. **Clear cache and reload**:
   - **Mac**: `Cmd + Shift + R`
   - **Windows/Linux**: `Ctrl + Shift + R`

2. **Or close and reopen** the browser tab

3. **Login again** to your app

---

## ✅ Step 4: Check Console Logs

After refreshing, open the browser console (F12) and look for these messages:

### ✅ Good Signs (Working):

```
📦 AgentInventoryContext: Fetching inventory for user abc-123 (mobile_sales)
🎧 Setting up real-time subscription for agent_inventory (user: abc-123)
✅ Subscription initiated for agent_inventory (user: abc-123)
🔄 Real-time subscription status for agent_inventory: SUBSCRIBED
✅ Successfully subscribed to agent_inventory (agent_id=abc-123)

🎧 MyInventoryPage: Setting up real-time subscriptions
🔄 Real-time subscription status for client_orders: SUBSCRIBED
✅ Successfully subscribed to client_orders (agent_id=abc-123)
```

### ❌ Bad Signs (Not Working):

```
🔄 Real-time subscription status for agent_inventory: CHANNEL_ERROR
❌ Failed to subscribe to agent_inventory. Make sure Realtime is enabled in Supabase.

🔄 Real-time subscription status for agent_inventory: CLOSED
🔌 Subscription to agent_inventory was closed.

🔄 Real-time subscription status for agent_inventory: TIMED_OUT
⏱️ Subscription to agent_inventory timed out. Check your connection.
```

---

## 🔍 Status Meanings

| Status | Meaning | Action |
|--------|---------|--------|
| **SUBSCRIBED** | ✅ Working perfectly | No action needed |
| **CLOSED** | ❌ Connection was closed | Enable Realtime + Hard refresh |
| **CHANNEL_ERROR** | ❌ Server rejected subscription | Enable Realtime in Supabase |
| **TIMED_OUT** | ⚠️ Network/connection issue | Check internet, refresh |
| **JOINING** | ⏳ Connecting... | Wait a moment |

---

## 🧪 Step 5: Test Real-Time Updates

### Test Stock Allocation:

1. **Open TWO browser windows**
2. **Window 1**: Login as **Team Leader**
3. **Window 2**: Login as **Mobile Agent** (member of leader's team)

4. **Window 2 (Agent)**:
   - Go to "My Inventory"
   - **Open console (F12)**
   - Note current stock (e.g., 111 units of Forge)

5. **Window 1 (Leader)**:
   - Go to "Team Inventory"
   - Find the agent
   - Click "Allocate Stock"
   - Allocate 50 units of Forge
   - Click "Confirm"

6. **Window 2 (Agent)** - Expected console output:
   ```
   🔔 Agent inventory change detected: UPDATE
   🔄 Real-time update: Refreshing agent inventory...
   ```

7. **Window 2 (Agent)** - Expected UI:
   - Stock count **updates INSTANTLY** to 161 (111 + 50)
   - Total stock card updates
   - No manual refresh needed! ✨

---

## 🚨 Common Issues & Fixes

### Issue 1: "CLOSED" Status

**Cause**: Realtime not enabled in Supabase

**Fix**:
1. Run `supabase/enable_realtime_for_tables.sql`
2. Hard refresh browser (Cmd/Ctrl + Shift + R)
3. Check console for "SUBSCRIBED" status

---

### Issue 2: "CHANNEL_ERROR" Status

**Cause**: Supabase rejected the subscription

**Possible reasons**:
- Table not in `supabase_realtime` publication
- Row Level Security (RLS) blocking access
- Invalid filter (e.g., wrong column name)

**Fix**:
1. Verify table is in publication:
   ```sql
   SELECT * FROM pg_publication_tables 
   WHERE pubname = 'supabase_realtime' 
   AND tablename = 'agent_inventory';
   ```
2. Check RLS policies allow SELECT for authenticated users
3. Verify filter syntax in code

---

### Issue 3: Subscription Works but UI Doesn't Update

**Cause**: Data fetching or state management issue

**Debug**:
1. Check console for:
   ```
   🔔 Agent inventory change detected: UPDATE
   🔄 Real-time update: Refreshing agent inventory...
   ```

2. If you see these logs → subscription is working
3. Issue is in `fetchAgentInventory()` function
4. Check network tab for API errors

---

### Issue 4: Multiple Subscriptions to Same Table

**Symptoms**: 
- You see duplicate console logs
- Multiple "SUBSCRIBED" messages for same table

**Impact**: 
- Not harmful, just inefficient
- Supabase multiplexes them into one WebSocket

**Fix** (Optional):
- Remove redundant subscriptions
- Use centralized context (like `AgentInventoryContext`)

---

### Issue 5: "TIMED_OUT" Status

**Cause**: Network connection issue

**Fix**:
1. Check your internet connection
2. Check if Supabase is down: https://status.supabase.com
3. Try refreshing the page
4. Check for firewall blocking WebSocket connections

---

## 📊 Enhanced Logging

We've added comprehensive logging to help debug:

### In `realtime.helpers.ts`:
```typescript
.subscribe((status) => {
  console.log(`🔄 Real-time subscription status for ${table}:`, status);
  
  if (status === 'SUBSCRIBED') {
    console.log(`✅ Successfully subscribed to ${table}`);
  } else if (status === 'CHANNEL_ERROR') {
    console.error(`❌ Failed to subscribe to ${table}`);
  } else if (status === 'TIMED_OUT') {
    console.error(`⏱️ Subscription to ${table} timed out`);
  } else if (status === 'CLOSED') {
    console.warn(`🔌 Subscription to ${table} was closed`);
  }
});
```

### In `AgentInventoryContext.tsx`:
```typescript
console.log(`📦 AgentInventoryContext: Fetching inventory for user ${user.id}`);
console.log(`🎧 Setting up real-time subscription for agent_inventory`);
console.log(`✅ Subscription initiated for agent_inventory`);
```

### In `MyInventoryPage.tsx`:
```typescript
console.log('🎧 MyInventoryPage: Setting up real-time subscriptions');
console.log('🔔 Real-time: Order change detected:', payload.eventType);
console.log('🔌 MyInventoryPage: Cleaned up subscriptions');
```

---

## 🎯 Quick Checklist

Before testing, make sure:

- [ ] Ran `enable_realtime_for_tables.sql` script
- [ ] Verified tables in "Database → Replication" dashboard
- [ ] Hard refreshed browser (Cmd/Ctrl + Shift + R)
- [ ] Logged in again
- [ ] Opened browser console (F12)
- [ ] Looking for "SUBSCRIBED" status messages
- [ ] No "CHANNEL_ERROR" or "CLOSED" messages

---

## 🆘 Still Not Working?

If you've followed all steps and it's still showing "CLOSED":

1. **Check Supabase project status**: https://status.supabase.com
2. **Verify API keys**: Make sure `.env` has correct Supabase URL and keys
3. **Check browser console** for other errors (not just realtime)
4. **Try a different browser** (Chrome, Firefox, Safari)
5. **Check network tab** for WebSocket connection failures
6. **Restart Supabase project** (in Supabase dashboard)

---

## 📝 Expected Full Console Output

When everything is working, you should see:

```
📦 AgentInventoryContext: Fetching inventory for user 3e900f81... (mobile_sales)
🎧 Setting up real-time subscription for agent_inventory (user: 3e900f81...)
✅ Subscription initiated for agent_inventory (user: 3e900f81...)
🔄 Real-time subscription status for agent_inventory: SUBSCRIBED
✅ Successfully subscribed to agent_inventory (agent_id=3e900f81...)

🎧 MyInventoryPage: Setting up real-time subscriptions
🔄 Real-time subscription status for client_orders: SUBSCRIBED
✅ Successfully subscribed to client_orders (agent_id=3e900f81...)

[When leader allocates 50 units]
🔔 Agent inventory change detected: UPDATE { eventType: 'UPDATE', ... }
🔄 Real-time update: Refreshing agent inventory...

[300ms later]
[Fetching agent inventory from database...]
[UI updates with new stock count! ✨]
```

---

## 🚀 Summary

The issue you're seeing ("CLOSED" status) is because:

1. ❌ **Realtime is not enabled** for `agent_inventory` table in Supabase
2. 🔧 **Fix**: Run the SQL script to enable it
3. 🔄 **Refresh**: Hard refresh browser after enabling
4. ✅ **Verify**: Look for "SUBSCRIBED" status in console

**After these steps, your My Inventory page will update in real-time when stock is allocated!** 🎉

