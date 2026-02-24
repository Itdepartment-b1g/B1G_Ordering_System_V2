/**
 * Centralized Query Key Factory
 * 
 * This file defines all React Query keys used throughout the application.
 * Benefits:
 * - Type-safe query keys
 * - Prevents typos
 * - Easy to track all queries
 * - Consistent cache invalidation
 */

export const queryKeys = {
    // Inventory queries
    inventory: {
        all: ['inventory'] as const,
        lists: () => [...queryKeys.inventory.all, 'list'] as const,
        list: (filters?: string) => [...queryKeys.inventory.lists(), { filters }] as const,
        details: () => [...queryKeys.inventory.all, 'detail'] as const,
        detail: (id: string) => [...queryKeys.inventory.details(), id] as const,
        brands: (companyId: string) => [...queryKeys.inventory.all, 'brands', companyId] as const,
        allocations: (companyId: string) => [...queryKeys.inventory.all, 'allocations', companyId] as const,
    },

    // Team queries
    teams: {
        all: ['teams'] as const,
        lists: () => [...queryKeys.teams.all, 'list'] as const,
        hierarchy: (managerId: string) => [...queryKeys.teams.all, 'hierarchy', managerId] as const,
        members: (leaderId: string) => [...queryKeys.teams.all, 'members', leaderId] as const,
        relationships: (companyId: string) => [...queryKeys.teams.all, 'relationships', companyId] as const,
    },

    // Remittance queries
    remittances: {
        all: ['remittances'] as const,
        lists: () => [...queryKeys.remittances.all, 'list'] as const,
        list: (filters?: object) => [...queryKeys.remittances.lists(), filters] as const,
        team: (managerId: string) => [...queryKeys.remittances.all, 'team', managerId] as const,
        details: () => [...queryKeys.remittances.all, 'detail'] as const,
        detail: (id: string) => [...queryKeys.remittances.details(), id] as const,
    },

    // Client queries
    clients: {
        all: ['clients'] as const,
        lists: () => [...queryKeys.clients.all, 'list'] as const,
        list: (filters?: object) => [...queryKeys.clients.lists(), filters] as const,
        team: (managerId: string) => [...queryKeys.clients.all, 'team', managerId] as const,
        details: () => [...queryKeys.clients.all, 'detail'] as const,
        detail: (id: string) => [...queryKeys.clients.details(), id] as const,
    },

    // Order queries
    orders: {
        all: ['orders'] as const,
        lists: () => [...queryKeys.orders.all, 'list'] as const,
        list: (filters?: object) => [...queryKeys.orders.lists(), filters] as const,
        details: () => [...queryKeys.orders.all, 'detail'] as const,
        detail: (id: string) => [...queryKeys.orders.details(), id] as const,
    },

    // Deposit queries
    deposits: {
        all: ['deposits'] as const,
        lists: () => [...queryKeys.deposits.all, 'list'] as const,
        list: (filters?: object) => [...queryKeys.deposits.lists(), filters] as const,
        pending: (managerId?: string) => [...queryKeys.deposits.all, 'pending', managerId] as const,
        details: () => [...queryKeys.deposits.all, 'detail'] as const,
        detail: (id: string) => [...queryKeys.deposits.details(), id] as const,
    },

    // Profile queries
    profiles: {
        all: ['profiles'] as const,
        lists: () => [...queryKeys.profiles.all, 'list'] as const,
        list: (filters?: object) => [...queryKeys.profiles.lists(), filters] as const,
        details: () => [...queryKeys.profiles.all, 'detail'] as const,
        detail: (id: string) => [...queryKeys.profiles.details(), id] as const,
        current: () => [...queryKeys.profiles.all, 'current'] as const,
    },

    // Manager Dashboard
    dashboard: {
        all: ['dashboard'] as const,
        manager: (managerId: string) => [...queryKeys.dashboard.all, 'manager', managerId] as const,
        stats: (userId: string) => [...queryKeys.dashboard.all, 'stats', userId] as const,
    },
} as const;
