# 🔄 How Real-Time Database Listening Works

## 📚 Overview

Your app uses **Supabase Realtime** to automatically listen for database changes (INSERT, UPDATE, DELETE) and update the UI instantly without manual refresh.

## 🏗️ Architecture

```
Database Change (INSERT/UPDATE/DELETE)
           ↓
   Supabase Realtime
           ↓
    WebSocket Push
           ↓
  Frontend Subscription
           ↓
   Debounce (300ms)
           ↓
  Refresh Data from DB
           ↓
    UI Updates ✨
```

## ✅ Pages Already Configured (Working Now!)

### 1. **Agent Inventory (Global Context)** ✨
**File**: `src/features/inventory/AgentInventoryContext.tsx`

```typescript
// Listens to: agent_inventory table
// When: Stock changes for the current user
// Effect: Auto-refreshes all inventory displays

useEffect(() => {
  channel = subscribeToTable(
    'agent_inventory',
    (payload) => {
      console.log('🔔 Agent inventory change detected:', payload.eventType);
      debouncedRefresh(); // Waits 300ms then refreshes
    },
    '*', // Listen to all events (INSERT, UPDATE, DELETE)
    { column: 'agent_id', value: user.id } // Only for this user
  );
}, [user]);
```

**Affects These Pages**:
- ✅ My Inventory Page (mobile sales agents)
- ✅ Leader Inventory Page
- ✅ Stock Allocations Page

---

### 2. **My Inventory Page** ✨
**File**: `src/features/inventory/MyInventoryPage.tsx`

```typescript
// Listens to: agent_inventory + client_orders
// When: Stock changes OR orders created/updated
// Effect: Updates inventory + remittance dialog

const channels = [
  subscribeToTable('agent_inventory', (payload) => {
    console.log('🔔 Real-time: Agent inventory change detected');
    // Auto-refreshed by AgentInventoryContext
  }),
  subscribeToTable('client_orders', (payload) => {
    console.log('🔔 Real-time: Order change detected');
    debouncedOrderRefresh();
  })
];
```

---

### 3. **Leader Inventory Page** ✨
**File**: `src/features/inventory/LeaderInventoryPage.tsx`

```typescript
// Listens to: agent_inventory + leader_teams
// When: Team members' stock changes OR team assignments change
// Effect: Updates leader's view of team inventory

const inventoryChannel = supabase
  .channel(`leader-inventory-changes-${user.id}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'agent_inventory',
  }, (payload) => {
    console.log('🔄 Real-time event received:', payload.eventType);
    debouncedInventoryRefresh();
  });
```

---

### 4. **Orders Context (Global)** ✨
**File**: `src/features/orders/OrderContext.tsx`

```typescript
// Listens to: client_orders + client_order_items
// When: Orders created/updated/deleted
// Effect: Updates all order displays globally

const channel = supabase
  .channel('client_orders_changes')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'client_orders',
  }, (payload) => {
    console.log('📬 Order change detected:', payload.eventType);
    setTimeout(() => fetchOrders(), 100);
  });
```

**Affects These Pages**:
- ✅ My Orders Page (agents)
- ✅ Orders Page (finance/admin)
- ✅ All order displays

---

### 5. **Pending Requests Page** ✨
**File**: `src/features/inventory/PendingRequestsPage.tsx`

```typescript
// Listens to: stock_requests + agent_inventory
// When: New stock requests OR inventory changes
// Effect: Updates pending requests list

const requestsChannel = supabase
  .channel(`stock-requests-changes-${user.id}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'stock_requests',
  }, (payload) => {
    console.log('🔔 Stock request change detected');
    debouncedRefresh();
  });
```

---

### 6. **Leader Remittance Page** ✨
**File**: `src/features/inventory/LeaderRemittancePage.tsx`

```typescript
// Listens to: remittances_log + client_orders
// When: New remittances OR order updates
// Effect: Updates remittance history

const remittanceChannel = supabase
  .channel(`remittances-changes-${user.id}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'remittances_log',
  }, (payload) => {
    console.log('🔔 Remittance change detected');
    debouncedRefresh();
  });
```

---

### 7. **Leader Cash Deposits Page** ✨
**File**: `src/features/inventory/LeaderCashDepositsPage.tsx`

```typescript
// Listens to: cash_deposits + client_orders
// When: Deposits created/updated OR orders updated
// Effect: Updates deposit lists

const depositsChannel = supabase
  .channel(`cash-deposits-changes-${user.id}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'cash_deposits',
  }, (payload) => {
    console.log('🔔 Cash deposit change detected');
    debouncedRefresh();
  });
```

---

### 8. **Stock Allocations Page** ✨
**File**: `src/features/inventory/StockAllocationsPage.tsx`

```typescript
// Listens to: agent_inventory + leader_teams + main_inventory
// When: Allocations made OR team changes OR main inventory updates
// Effect: Updates allocation views

const inventoryChannel = supabase
  .channel('stock-allocations-inventory-changes')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'agent_inventory',
  }, (payload) => {
    console.log('🔄 Real-time event received');
    debouncedInventoryRefresh();
  });
```

---

## 🆕 How to Add Real-Time to a NEW Page

### Template Pattern

```typescript
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';

export default function MyNewPage() {
  const { user } = useAuth();
  const [data, setData] = useState([]);

  // Fetch function
  const fetchData = async () => {
    const { data } = await supabase
      .from('your_table')
      .select('*');
    setData(data);
  };

  useEffect(() => {
    // Initial fetch
    fetchData();

    // Debounce timer
    let debounceTimer: NodeJS.Timeout | null = null;
    const debouncedRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        console.log('🔄 Real-time update: Refreshing data...');
        fetchData();
      }, 300); // 300ms debounce
    };

    // Subscribe to table changes
    const channel = supabase
      .channel(`your-table-changes-${user?.id || 'global'}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'your_table', // Replace with your table name
          // Optional: filter by column
          // filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('🔔 Table change detected:', payload.eventType, payload);
          debouncedRefresh();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Real-time subscription active for your_table');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Real-time subscription error');
        }
      });

    // Cleanup
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [user?.id]); // Add dependencies as needed

  return (
    <div>
      {/* Your UI */}
    </div>
  );
}
```

---

## 🎯 Using the Helper Functions

You can also use the pre-built helpers from `src/lib/realtime.helpers.ts`:

```typescript
import { subscribeToTable, unsubscribe } from '@/lib/realtime.helpers';

useEffect(() => {
  // Simple subscription
  const channel = subscribeToTable(
    'agent_inventory',
    (payload) => {
      console.log('Change detected:', payload);
      fetchData();
    },
    '*', // Event type: '*' | 'INSERT' | 'UPDATE' | 'DELETE'
    { column: 'agent_id', value: user.id } // Optional filter
  );

  return () => unsubscribe(channel);
}, [user?.id]);
```

---

## 🐛 Debugging Real-Time Subscriptions

### Check Browser Console

**Look for these messages** (F12):

✅ **Good (Working)**:
```
✅ Subscribed to agent_inventory updates for user: abc123
✅ Real-time subscription active for agent_inventory
🔔 Agent inventory change detected: UPDATE
🔄 Real-time update: Refreshing agent inventory...
```

❌ **Bad (Not Working)**:
```
❌ Real-time subscription error - check Supabase Realtime settings
CHANNEL_ERROR
```

### Common Issues

**Issue 1: No subscription messages**
- Solution: Table not enabled in database (run SQL script)
- Check: `SELECT * FROM pg_publication_tables WHERE pubname='supabase_realtime'`

**Issue 2: CHANNEL_ERROR**
- Solution: Check Supabase plan limits
- Solution: Verify database not paused
- Solution: Check network tab for WebSocket connection

**Issue 3: Subscription active but no updates**
- Solution: Filter might be too restrictive
- Solution: Check RLS policies on the table
- Solution: Verify changes are actually happening in DB

---

## 📊 Best Practices

### 1. Always Use Debouncing
```typescript
// ✅ Good - prevents rapid successive refreshes
const debouncedRefresh = () => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => fetchData(), 300);
};
```

```typescript
// ❌ Bad - could cause performance issues
channel.on('postgres_changes', {}, () => {
  fetchData(); // No debounce!
});
```

### 2. Clean Up Subscriptions
```typescript
// ✅ Good - prevents memory leaks
useEffect(() => {
  const channel = subscribeToTable(...);
  return () => unsubscribe(channel);
}, []);
```

### 3. Use Optimistic Updates When Possible
```typescript
// Update UI immediately
setData(prev => [...prev, newItem]);

// Then sync with database in background
await supabase.from('table').insert(newItem);
```

### 4. Filter Subscriptions
```typescript
// ✅ Good - only listen to relevant changes
subscribeToTable('agent_inventory', callback, '*', {
  column: 'agent_id',
  value: user.id
});

// ❌ Less efficient - gets all changes
subscribeToTable('agent_inventory', callback);
```

---

## 🧪 Testing Real-Time

### Test 1: Stock Allocation
1. Open two browser windows
2. Window 1: Login as Leader
3. Window 2: Login as Agent
4. Window 1: Allocate 100 units to agent
5. Window 2: **Should update instantly** ✨

### Test 2: Order Creation
1. Open browser as Agent
2. Open console (F12)
3. Create an order
4. Watch console for: `🔔 Order change detected: INSERT`
5. Inventory should decrease **instantly**

### Test 3: Multi-User Collaboration
1. Open 3 windows (Leader, Agent 1, Agent 2)
2. Make changes in any window
3. All windows should update **within 300-500ms**

---

## 📈 Performance Considerations

- **Debouncing**: 300ms delay prevents rapid successive updates
- **Filtering**: Only subscribe to relevant data (e.g., user's own inventory)
- **Selective Subscriptions**: Don't subscribe to tables you don't display
- **Channel Cleanup**: Always unsubscribe on component unmount

---

## 🎉 Summary

✅ **8+ pages already have real-time** - No action needed!
✅ **All critical tables enabled** - Stock, orders, deposits, etc.
✅ **Debouncing implemented** - Optimized performance
✅ **Console logging added** - Easy debugging

**Your app is now fully real-time!** Users will see changes instantly across all connected devices. 🚀

