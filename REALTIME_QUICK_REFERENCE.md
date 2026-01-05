# ⚡ Real-Time Quick Reference

## 🎯 Already Working (After Running SQL Script)

| Page | Listens To | Auto-Updates When |
|------|------------|-------------------|
| My Inventory | `agent_inventory`, `client_orders` | Stock allocated, orders created |
| Leader Inventory | `agent_inventory`, `leader_teams` | Team members' stock changes |
| Orders (All) | `client_orders`, `client_order_items` | Orders created/updated |
| Pending Requests | `stock_requests`, `agent_inventory` | New requests, inventory changes |
| Remittance | `remittances_log`, `client_orders` | New remittances, order updates |
| Cash Deposits | `cash_deposits`, `client_orders` | Deposits recorded, orders updated |
| Stock Allocations | `agent_inventory`, `main_inventory` | Allocations made, stock changes |

## 🔍 Check If It's Working

Open browser console (F12) and look for:

```
✅ Subscribed to agent_inventory updates for user: [id]
✅ Real-time subscription active
🔔 Agent inventory change detected: UPDATE
🔄 Real-time update: Refreshing...
```

## 🆕 Add Real-Time to New Page (Copy-Paste)

```typescript
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function MyPage() {
  const [data, setData] = useState([]);

  const fetchData = async () => {
    const { data } = await supabase.from('my_table').select('*');
    setData(data);
  };

  useEffect(() => {
    fetchData();

    let timer: NodeJS.Timeout | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fetchData(), 300);
    };

    const channel = supabase
      .channel('my-table-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'my_table',
      }, refresh)
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, []);

  return <div>{/* Your UI */}</div>;
}
```

## 🧪 Quick Test

1. Open two browser windows
2. Make a change in window 1 (e.g., allocate stock)
3. Window 2 should update in **0-500ms** ✨

## 🐛 Not Working?

1. Check SQL script ran successfully
2. Hard refresh browser (Cmd/Ctrl + Shift + R)
3. Check console for `CHANNEL_ERROR`
4. Verify table is in: `SELECT * FROM pg_publication_tables WHERE pubname='supabase_realtime'`

---

**Full docs**: See `HOW_REALTIME_WORKS.md`

