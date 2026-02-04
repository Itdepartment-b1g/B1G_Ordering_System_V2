# 🔴 Executive Live Tracking Setup Guide

## Overview
This guide will enable **real-time live tracking** for the Executive Dashboard. Once set up, the dashboard will automatically update when:
- ✅ New orders are placed
- ✅ Sales transactions occur
- ✅ Financial transactions are recorded
- ✅ Client activity happens
- ✅ Company assignments change

**No page refresh needed!** The data updates automatically.

---

## Step 1: Apply Database Migration

You need to enable Realtime on the database tables.

### Option A: Using Supabase CLI (Recommended)

1. **Open your terminal** (PowerShell or Command Prompt)

2. **Navigate to your project** (if not already there):
   ```powershell
   cd "C:\Users\Arbie\Desktop\Work B1G\B1G_Ordering_System_V2"
   ```

3. **Deploy the migration**:
   ```powershell
   npx supabase db push
   ```

4. **Expected output**:
   ```
   Applying migration 20260203000000_enable_executive_realtime.sql...
   ✓ Migration applied successfully
   ```

### Option B: Using Supabase Dashboard

If you prefer the UI:

1. **Go to your Supabase dashboard**:
   - URL: `https://supabase.com/dashboard/project/esczjigrxpwjyqlsbkrk`

2. **Navigate to SQL Editor**:
   - Click "SQL Editor" in the left sidebar

3. **Create a new query**:
   - Click "+ New query"

4. **Copy and paste this SQL**:
   ```sql
   -- Enable Real-time for Executive Dashboard (Idempotent)
   DO $$ 
   DECLARE
       tables_to_add text[] := ARRAY[
           'client_orders',
           'client_order_items', 
           'financial_transactions',
           'clients',
           'executive_company_assignments'
       ];
       table_name text;
   BEGIN
       FOREACH table_name IN ARRAY tables_to_add
       LOOP
           IF NOT EXISTS (
               SELECT 1 FROM pg_publication_tables 
               WHERE pubname = 'supabase_realtime' 
               AND tablename = table_name
           ) THEN
               EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', table_name);
               RAISE NOTICE 'Added table % to publication', table_name;
           ELSE
               RAISE NOTICE 'Table % already in publication', table_name;
           END IF;
       END LOOP;
   END $$;
   ```

5. **Click "RUN"** at the bottom right

6. **Expected output**:
   ```
   Success. No rows returned
   ```

---

## Step 2: Test the Live Tracking

### Test Scenario 1: Real-time Order Tracking

1. **Open the Executive Dashboard** in one browser tab:
   - Go to: `http://localhost:8081/executive-dashboard`
   - Log in with an executive account

2. **Open the console** (F12 → Console tab)

3. **Look for these messages**:
   ```
   🔴 [Executive Realtime] Live tracking enabled for X companies
   ✅ [Executive Realtime] Orders live tracking active
   ✅ [Executive Realtime] Transactions live tracking active
   ✅ [Executive Realtime] Clients live tracking active
   ✅ [Executive Realtime] Access tracking active
   🎯 [Executive Realtime] All live tracking channels active!
   ```

4. **In another tab/device, create a new order** in one of the assigned companies

5. **Watch the Executive Dashboard**:
   - You should see in console:
     ```
     🔴 [LIVE] New order/sale detected! { event: 'INSERT', company: '...', ... }
     ```
   - The dashboard stats should update automatically **without refreshing**!

### Test Scenario 2: Financial Transaction Tracking

1. **Add a financial transaction** in one of the assigned companies

2. **Watch the Executive Dashboard console**:
   ```
   🔴 [LIVE] Financial transaction detected! { event: 'INSERT', company: '...' }
   ```

3. **Dashboard should auto-refresh** revenue and financial stats

---

## Step 3: Verify Everything is Working

### ✅ Checklist:

- [ ] Migration applied successfully (no errors)
- [ ] Executive Dashboard loads without errors
- [ ] Console shows "Live tracking enabled" messages
- [ ] Console shows all 4 "✅ active" messages
- [ ] Creating an order in a company triggers live update
- [ ] Dashboard stats update without page refresh
- [ ] Console shows "🔴 [LIVE]" messages when actions occur

---

## Troubleshooting

### Problem: No console messages appear

**Solution:**
1. Make sure you're logged in as an **executive** user (not admin/super_admin)
2. Make sure the executive has at least **1 company assigned**
3. Hard refresh the page: `Ctrl + Shift + R`

### Problem: "Live tracking enabled for 0 companies"

**Solution:**
1. Go to System Admin → Executive Account
2. Edit the executive
3. Make sure at least 1 company is checked/assigned
4. Save and refresh the dashboard

### Problem: Live updates not appearing

**Solution:**
1. Check if the migration was applied:
   ```sql
   -- Run this in Supabase SQL Editor:
   SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
   ```
   
   You should see these tables:
   - `client_orders`
   - `client_order_items`
   - `financial_transactions`
   - `clients`
   - `executive_company_assignments`

2. If tables are missing, run the migration again (Step 1, Option B)

### Problem: Console shows errors

**Common errors and fixes:**

1. **"Channel subscription failed"**
   - Check your internet connection
   - Verify Supabase project is online
   - Check Supabase dashboard for any service issues

2. **"Invalid company_id"**
   - Make sure the executive has companies assigned
   - Verify company IDs exist in the `companies` table

---

## How It Works (Technical)

### Architecture:
```
┌─────────────────────┐
│  Database Action    │ (New order created)
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Supabase Realtime   │ (Detects INSERT event)
│ Publication         │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ useExecutiveRealtime│ (Receives event via WebSocket)
│ Hook                │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ React Query Cache   │ (Invalidates queries)
│ Invalidation        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Dashboard Auto-     │ (Refetches data)
│ Refresh             │
└─────────────────────┘
```

### Key Components:

1. **`useExecutiveRealtime` Hook** (`src/features/dashboard/useExecutiveRealtime.ts`):
   - Sets up WebSocket connections to Supabase Realtime
   - Listens for changes in assigned companies only
   - Invalidates React Query cache when events occur

2. **Database Publication** (`supabase_realtime`):
   - PostgreSQL publication that broadcasts table changes
   - Only includes tables executives need to monitor

3. **React Query**:
   - Handles automatic refetching when cache is invalidated
   - Manages loading states and error handling

---

## Performance Notes

- **Minimal overhead**: Only subscribes to relevant tables
- **Efficient filtering**: Only processes events from assigned companies
- **Smart updates**: Only refetches affected queries
- **Auto-cleanup**: Unsubscribes when dashboard is closed

---

## Next Steps

Once live tracking is working:

1. **Test with multiple companies**: Assign 2+ companies to an executive
2. **Test with multiple executives**: Ensure each only sees their assigned companies
3. **Production deployment**: Apply the same migration to your production database

---

## Need Help?

If you encounter issues:

1. **Check the browser console** for error messages
2. **Check Supabase logs**: Dashboard → Logs → Realtime logs
3. **Verify RLS policies**: Make sure executives have read access to tables
4. **Test with System Admin**: Ensure basic data fetching works first

---

**🎯 Goal**: Executive Dashboard updates automatically, providing real-time insights without manual refreshing!
