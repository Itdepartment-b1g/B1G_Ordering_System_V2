// B1G Ordering System - Real-time Subscription Helpers
// Provides easy-to-use real-time subscriptions for live updates

import { supabase } from './supabase';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

// ============================================================================
// TYPES
// ============================================================================

type TableName =
  | 'profiles'
  | 'brands'
  | 'variants'
  | 'main_inventory'
  | 'agent_inventory'
  | 'suppliers'
  | 'purchase_orders'
  | 'purchase_order_items'
  | 'clients'
  | 'client_orders'
  | 'client_order_items'
  | 'inventory_transactions'
  | 'financial_transactions'
  | 'notifications'
  | 'remittances_log'
  | 'inventory_requests'
  | 'leader_teams';

type ChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

type SubscriptionCallback<T = any> = (payload: RealtimePostgresChangesPayload<T>) => void;

// ============================================================================
// SUBSCRIPTION HELPERS
// ============================================================================

/**
 * Subscribe to changes on a specific table
 */
export function subscribeToTable<T = any>(
  table: TableName,
  callback: SubscriptionCallback<T>,
  event: ChangeEvent = '*',
  filter?: { column: string; value: string | number }
): RealtimeChannel {
  let channel = supabase
    .channel(`${table}-changes`)
    .on(
      'postgres_changes' as any,
      {
        event,
        schema: 'public',
        table,
        ...(filter && { filter: `${filter.column}=eq.${filter.value}` }),
      },
      callback
    );

  channel.subscribe();

  return channel;
}

/**
 * Subscribe to inventory updates (main inventory)
 */
export function subscribeToInventory(callback: SubscriptionCallback) {
  return subscribeToTable('main_inventory', callback);
}

/**
 * Subscribe to agent inventory updates for a specific agent
 */
export function subscribeToAgentInventory(
  agentId: string,
  callback: SubscriptionCallback
) {
  return subscribeToTable('agent_inventory', callback, '*', {
    column: 'agent_id',
    value: agentId,
  });
}

/**
 * Subscribe to client order updates
 */
export function subscribeToClientOrders(callback: SubscriptionCallback) {
  return subscribeToTable('client_orders', callback);
}

/**
 * Subscribe to pending client orders (for admin)
 */
export function subscribeToPendingOrders(callback: SubscriptionCallback) {
  return subscribeToTable('client_orders', callback, '*', {
    column: 'status',
    value: 'pending',
  });
}

/**
 * Subscribe to orders for a specific agent
 */
export function subscribeToAgentOrders(
  agentId: string,
  callback: SubscriptionCallback
) {
  return subscribeToTable('client_orders', callback, '*', {
    column: 'agent_id',
    value: agentId,
  });
}

/**
 * Subscribe to purchase orders
 */
export function subscribeToPurchaseOrders(callback: SubscriptionCallback) {
  return subscribeToTable('purchase_orders', callback);
}

/**
 * Subscribe to notifications for a specific user
 */
export function subscribeToNotifications(
  userId: string,
  callback: SubscriptionCallback
) {
  return subscribeToTable('notifications', callback, 'INSERT', {
    column: 'user_id',
    value: userId,
  });
}

/**
 * Subscribe to clients (for admin) or specific agent's clients
 */
export function subscribeToClients(
  callback: SubscriptionCallback,
  agentId?: string
) {
  if (agentId) {
    return subscribeToTable('clients', callback, '*', {
      column: 'agent_id',
      value: agentId,
    });
  }
  return subscribeToTable('clients', callback);
}

/**
 * Subscribe to financial transactions
 */
export function subscribeToFinancialTransactions(callback: SubscriptionCallback) {
  return subscribeToTable('financial_transactions', callback);
}

/**
 * Unsubscribe from a channel
 */
export function unsubscribe(channel: RealtimeChannel) {
  if (channel) {
    supabase.removeChannel(channel);
  }
}

/**
 * Unsubscribe from multiple channels
 */
export function unsubscribeAll(channels: RealtimeChannel[]) {
  channels.forEach((channel) => unsubscribe(channel));
}

// ============================================================================
// PRESENCE (for showing online users)
// ============================================================================

export interface UserPresence {
  userId: string;
  userName: string;
  role: string;
  onlineAt: string;
}

/**
 * Track user presence (online status)
 */
export function trackPresence(userId: string, userName: string, role: string) {
  const channel = supabase.channel('online-users', {
    config: {
      presence: {
        key: userId,
      },
    },
  });

  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      console.log('Online users:', state);
    })
    .on('presence', { event: 'join' }, ({ key, newPresences }) => {
      console.log('User joined:', key, newPresences);
    })
    .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
      console.log('User left:', key, leftPresences);
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          userId,
          userName,
          role,
          onlineAt: new Date().toISOString(),
        });
      }
    });

  return channel;
}

/**
 * Get list of online users
 */
export function getOnlineUsers(channel: RealtimeChannel): UserPresence[] {
  const state = channel.presenceState<UserPresence>();
  const users: UserPresence[] = [];

  Object.values(state).forEach((presences) => {
    presences.forEach((presence) => {
      users.push(presence);
    });
  });

  return users;
}

// ============================================================================
// BROADCAST (for real-time events)
// ============================================================================

export interface BroadcastEvent {
  type: string;
  payload: any;
}

/**
 * Send a broadcast message
 */
export async function broadcast(channel: RealtimeChannel, event: BroadcastEvent) {
  await channel.send({
    type: 'broadcast',
    event: event.type,
    payload: event.payload,
  });
}

/**
 * Listen to broadcast messages
 */
export function listenToBroadcast(
  channel: RealtimeChannel,
  eventType: string,
  callback: (payload: any) => void
) {
  channel.on('broadcast', { event: eventType }, ({ payload }) => {
    callback(payload);
  });
}

// ============================================================================
// COMBINED SUBSCRIPTIONS (for complex scenarios)
// ============================================================================

/**
 * Subscribe to all dashboard-related data (for admin)
 */
export function subscribeToAdminDashboard(callbacks: {
  onInventoryChange?: SubscriptionCallback;
  onOrderChange?: SubscriptionCallback;
  onNewNotification?: SubscriptionCallback;
}) {
  const channels: RealtimeChannel[] = [];

  if (callbacks.onInventoryChange) {
    channels.push(subscribeToInventory(callbacks.onInventoryChange));
  }

  if (callbacks.onOrderChange) {
    channels.push(subscribeToClientOrders(callbacks.onOrderChange));
  }

  if (callbacks.onNewNotification) {
    // Note: Need userId - this is just a placeholder
    // In real usage, pass the userId
  }

  return channels;
}

/**
 * Subscribe to all agent-related data
 */
export function subscribeToAgentData(
  agentId: string,
  callbacks: {
    onInventoryChange?: SubscriptionCallback;
    onOrderChange?: SubscriptionCallback;
    onNewNotification?: SubscriptionCallback;
    onClientChange?: SubscriptionCallback;
  }
) {
  const channels: RealtimeChannel[] = [];

  if (callbacks.onInventoryChange) {
    channels.push(subscribeToAgentInventory(agentId, callbacks.onInventoryChange));
  }

  if (callbacks.onOrderChange) {
    channels.push(subscribeToAgentOrders(agentId, callbacks.onOrderChange));
  }

  if (callbacks.onNewNotification) {
    channels.push(subscribeToNotifications(agentId, callbacks.onNewNotification));
  }

  if (callbacks.onClientChange) {
    channels.push(subscribeToClients(callbacks.onClientChange, agentId));
  }

  return channels;
}

// ============================================================================
// REACT HOOKS (for easy React integration)
// ============================================================================

/**
 * Custom hook for real-time subscriptions
 * Usage in components:
 * 
 * useRealtimeSubscription('main_inventory', (payload) => {
 *   console.log('Inventory changed:', payload);
 *   // Update your state here
 * });
 */
export { subscribeToTable as useRealtimeSubscription };

