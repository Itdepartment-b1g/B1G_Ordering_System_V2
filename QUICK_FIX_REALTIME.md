# ⚡ QUICK FIX: Enable Real-Time Updates

## 🚨 The Problem
Stock allocations and order creation require manual page refresh to see updates.

## ✅ The Solution (3 Steps)

### Step 1: Open Supabase Dashboard
👉 https://supabase.com/dashboard → Your Project → **Database** → **Replication**

### Step 2: Enable These Tables
Toggle **ON** for:
- ✅ `agent_inventory` ← **MOST IMPORTANT**
- ✅ `client_orders`
- ✅ `client_order_items`
- ✅ `main_inventory`
- ✅ `leader_teams`

Click **Save** or **Apply**

### Step 3: Test It!
1. Open two browser windows
2. Window 1: Allocate stock (as leader)
3. Window 2: Watch inventory update **instantly** (as agent)
4. ✨ No refresh needed!

---

## 🔧 Alternative: Run SQL

Copy and paste this into **Supabase SQL Editor**:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE agent_inventory;
ALTER PUBLICATION supabase_realtime ADD TABLE client_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE client_order_items;
ALTER PUBLICATION supabase_realtime ADD TABLE main_inventory;
ALTER PUBLICATION supabase_realtime ADD TABLE leader_teams;
```

---

## 📊 How to Verify

Open browser console (F12), you should see:

```
✅ Subscribed to agent_inventory updates for user: [id]
✅ Real-time subscription active for agent_inventory
🔔 Agent inventory change detected: UPDATE
```

---

## 📚 Full Documentation
- `ENABLE_REALTIME.md` - Detailed guide
- `REALTIME_FIX_SUMMARY.md` - Complete overview
- `supabase/enable_realtime_for_tables.sql` - Full SQL script

---

⏱️ **Time to fix**: 2-3 minutes

