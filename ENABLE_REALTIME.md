# 🔴 CRITICAL: Enable Real-time for agent_inventory Table

## ❌ Current Problem

You're experiencing issues where:
1. **Stock Allocation**: When allocating stock to agents, you need to manually refresh to see updates
2. **Order Creation**: When creating orders, inventory doesn't update in real-time

## 🎯 Root Cause

The `agent_inventory` table does NOT have Supabase Realtime enabled in your database. This means the real-time subscriptions in your code are **silently failing** to receive updates.

## ✅ Solution: Enable Realtime in Supabase Dashboard

### Step 1: Go to Supabase Dashboard
1. Open your Supabase project: https://supabase.com/dashboard
2. Select your project
3. Go to **Database** → **Replication**

### Step 2: Enable Replication for agent_inventory
1. Scroll down to find the `agent_inventory` table in the list
2. Toggle the switch to **ON** (enable replication)
3. Click **Save** or **Apply**

### Step 3: Verify Other Critical Tables

Make sure these tables ALSO have Realtime enabled:
- ✅ `agent_inventory` ← **CRITICAL**
- ✅ `client_orders`
- ✅ `client_order_items`
- ✅ `main_inventory`
- ✅ `leader_teams`
- ✅ `stock_requests`
- ✅ `remittances_log`
- ✅ `cash_deposits`
- ✅ `inventory_transactions`
- ✅ `financial_transactions`

## 🔍 How to Check if Realtime is Working

After enabling, check your browser console (F12):

### ✅ Good Signs (Working):
```
✅ Real-time subscription active for agent_inventory
🔔 Agent inventory updated, refreshing...
🔄 Real-time event received: UPDATE
```

### ❌ Bad Signs (Not Working):
```
❌ Real-time subscription error - check Supabase Realtime settings
CHANNEL_ERROR
```

## 📊 What Happens After Enabling

### Before (Current State):
```
Agent 1 allocates stock → Database updates
Agent 2 (viewing page) → NO UPDATE (must refresh)
```

### After (With Realtime):
```
Agent 1 allocates stock → Database updates
Agent 2 (viewing page) → INSTANT UPDATE ✨
```

## 🚀 Alternative: Run This SQL in Supabase SQL Editor

If the dashboard method doesn't work, run this SQL:

```sql
-- Enable realtime for agent_inventory
ALTER PUBLICATION supabase_realtime ADD TABLE agent_inventory;

-- Verify it's enabled
SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
AND tablename = 'agent_inventory';
```

## 🐛 Troubleshooting

### Issue: Still not working after enabling
**Solution**: 
1. Wait 1-2 minutes for Supabase to propagate changes
2. Clear your browser cache
3. Hard refresh (Cmd/Ctrl + Shift + R)
4. Check browser console for errors

### Issue: "CHANNEL_ERROR" in console
**Solution**:
1. Check your Supabase project is on a paid plan (Free tier has limits)
2. Verify your database is not paused
3. Check Supabase status page: https://status.supabase.com/

### Issue: Works sometimes, not always
**Solution**: This is likely a **debouncing** issue (too many rapid updates). The code already has debouncing implemented.

## 📱 Expected Behavior After Fix

### Stock Allocation:
1. Leader allocates 100 units to Agent A
2. Leader's inventory immediately shows -100 (optimistic update)
3. Agent A's inventory **instantly shows +100** (real-time update)
4. No refresh needed! ✨

### Order Creation:
1. Agent creates order with 50 units
2. Agent's inventory **instantly shows -50** (real-time update)
3. Order appears in leader's view **instantly**
4. No refresh needed! ✨

## 🔗 Official Supabase Docs

https://supabase.com/docs/guides/realtime/postgres-changes

---

**⚠️ IMPORTANT**: Without enabling Realtime, all the real-time subscription code in your application is essentially **non-functional**. This is why you need manual refreshes.

