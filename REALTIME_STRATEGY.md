# Real-Time Data Strategy 🔄

## Overview
This document outlines the real-time data synchronization strategy for the MultiTenant B2B application using Supabase Realtime.

## Architecture

### Pattern: Debounced Real-Time Subscriptions
```typescript
useEffect(() => {
  if (!user) return;

  let updateTimer: NodeJS.Timeout | null = null;

  const debouncedRefresh = () => {
    if (updateTimer) clearTimeout(updateTimer);
    updateTimer = setTimeout(() => {
      console.log('🔄 Real-time update: Refreshing data...');
      fetchData(false); // false = skip loading state
    }, 300); // 300ms debounce
  };

  const channel = supabase
    .channel('unique-channel-name')
    .on(
      'postgres_changes' as any,
      {
        event: '*', // or 'INSERT' | 'UPDATE' | 'DELETE'
        schema: 'public',
        table: 'your_table_name',
      },
      (payload) => {
        console.log('🔔 Real-time event:', payload.eventType, payload);
        debouncedRefresh();
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('✅ Real-time subscription active for your_table_name');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('❌ Real-time subscription error');
      }
    });

  return () => {
    if (updateTimer) clearTimeout(updateTimer);
    supabase.removeChannel(channel);
  };
}, [user?.id]);
```

## Table-to-Page Mapping

### Core Tables
| Table | Pages Affected | Status |
|-------|---------------|--------|
| `agent_inventory` | MyInventoryPage, LeaderInventoryPage, StockAllocationsPage | ✅ Implemented |
| `client_orders` | OrdersPage, MyOrdersPage, OrderContext | ✅ Implemented |
| `client_order_items` | OrdersPage, MyOrdersPage, OrderContext | ✅ Implemented |
| `cash_deposits` | LeaderCashDepositsPage, FinancePage | ⚠️ Needs Implementation |
| `remittances_log` | LeaderRemittancePage, RemittedStocksPage | ⚠️ Needs Implementation |
| `stock_requests` | PendingRequestsPage | ⚠️ Needs Implementation |
| `leader_teams` | TeamManagementTab, LeaderInventoryPage | ✅ Implemented |
| `main_inventory` | MainInventoryPage, StockAllocationsPage | ✅ Implemented |
| `profiles` | SalesAgentsPage, TeamManagementTab | ⚠️ Needs Implementation |
| `financial_transactions` | FinancePage | ⚠️ Needs Implementation |
| `notifications` | NotificationsDropdown | ✅ Implemented |
| `tasks` | CalendarPage | ✅ Implemented |
| `events` | AgentHistoryPage, AdminHistoryPage | ✅ Implemented |
| `clients` | ClientsPage | ✅ Implemented |

## Best Practices

### 1. **Debouncing** (Required)
Always debounce real-time updates to prevent UI thrashing:
```typescript
let updateTimer: NodeJS.Timeout | null = null;
const debouncedRefresh = () => {
  if (updateTimer) clearTimeout(updateTimer);
  updateTimer = setTimeout(() => fetchData(false), 300);
};
```

### 2. **Skip Loading States on Real-Time Updates**
```typescript
fetchData(false); // Don't show loading spinner for real-time updates
```

### 3. **Unique Channel Names**
Use unique channel names per component to avoid conflicts:
```typescript
.channel(`${tableName}-changes-${user.id}`)
```

### 4. **Cleanup**
Always clean up subscriptions:
```typescript
return () => {
  if (updateTimer) clearTimeout(updateTimer);
  supabase.removeChannel(channel);
};
```

### 5. **Filter Events (Optional)**
For performance, filter events to only relevant records:
```typescript
.on('postgres_changes', {
  event: '*',
  schema: 'public',
  table: 'agent_inventory',
  filter: `agent_id=eq.${user.id}` // Only listen to user's own data
}, ...)
```

### 6. **Optimistic Updates**
For immediate feedback, update UI optimistically, then let real-time sync:
```typescript
// 1. Update UI immediately
setData(prev => [...prev, newItem]);

// 2. Call API
await supabase.from('table').insert(newItem);

// 3. Real-time subscription will sync the full data
```

## Supabase Realtime Configuration

### Enable Realtime for Tables
In Supabase Dashboard → Database → Replication:
- ✅ agent_inventory
- ✅ client_orders
- ✅ client_order_items
- ✅ cash_deposits
- ✅ remittances_log
- ✅ stock_requests
- ✅ leader_teams
- ✅ main_inventory
- ✅ profiles
- ✅ financial_transactions
- ✅ notifications

### Row Level Security (RLS)
Real-time subscriptions respect RLS policies. Ensure:
1. SELECT policies allow users to read their own data
2. Real-time filters match RLS policies for consistency

## Implementation Checklist

### High Priority (User-Facing Features)
- [x] Orders (OrderContext)
- [x] My Inventory (AgentInventoryContext)
- [x] Leader Inventory (LeaderInventoryPage)
- [x] Stock Allocations (StockAllocationsPage)
- [ ] Cash Deposits (LeaderCashDepositsPage)
- [ ] Remittances (LeaderRemittancePage)
- [ ] Stock Requests (PendingRequestsPage)

### Medium Priority (Admin Features)
- [ ] Finance Dashboard (FinancePage)
- [ ] Remitted Stocks (RemittedStocksPage)
- [ ] Sales Agents (SalesAgentsPage)

### Low Priority (Analytics/Reporting)
- [x] Events (AgentHistoryPage)
- [x] Dashboard (AdminHistoryPage)

## Troubleshooting

### Events Not Firing
1. Check Supabase Dashboard → Database → Replication
2. Verify table has realtime enabled
3. Check RLS policies allow SELECT
4. Check browser console for subscription status

### UI Not Updating
1. Verify `fetchData(false)` is called in subscription handler
2. Check debounce isn't too long (should be 300ms)
3. Ensure state is updated correctly

### Performance Issues
1. Add filters to subscriptions
2. Increase debounce time (500ms+)
3. Use `useCallback` for fetch functions
4. Memoize expensive computations with `useMemo`

## Example: Adding Real-Time to a Page

```typescript
// 1. Import useState, useEffect, useCallback
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/AuthContext';

export default function YourPage() {
  const { user } = useAuth();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  // 2. Wrap fetch function in useCallback
  const fetchData = useCallback(async (showLoading = true) => {
    if (!user) return;
    
    try {
      if (showLoading) setLoading(true);
      
      const { data: results, error } = await supabase
        .from('your_table')
        .select('*')
        .eq('user_id', user.id);
      
      if (error) throw error;
      setData(results || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [user?.id]);

  // 3. Set up real-time subscription
  useEffect(() => {
    if (!user) return;

    // Initial fetch
    fetchData();

    // Debounced refresh
    let updateTimer: NodeJS.Timeout | null = null;
    const debouncedRefresh = () => {
      if (updateTimer) clearTimeout(updateTimer);
      updateTimer = setTimeout(() => {
        console.log('🔄 Refreshing data...');
        fetchData(false);
      }, 300);
    };

    // Real-time subscription
    const channel = supabase
      .channel(`your-table-changes-${user.id}`)
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'your_table',
        },
        (payload) => {
          console.log('🔔 Real-time update:', payload);
          debouncedRefresh();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Real-time active');
        }
      });

    // Cleanup
    return () => {
      if (updateTimer) clearTimeout(updateTimer);
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchData]);

  // 4. Render your component
  return (
    // Your UI here
  );
}
```

## Future Enhancements

1. **Presence**: Show which users are online
2. **Broadcast**: Send messages between users in real-time
3. **Conflict Resolution**: Handle concurrent edits
4. **Offline Support**: Queue changes when offline
5. **Connection Status**: Show indicator when disconnected

