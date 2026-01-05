import { QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // ⚡ OPTIMIZED: Data remains "fresh" for 2 minutes (was 5 seconds)
            // This prevents unnecessary refetches on every window focus/mount
            staleTime: 1000 * 60 * 2, // 2 minutes
            
            // Data is kept in cache for 24 hours
            gcTime: 1000 * 60 * 60 * 24,
            
            // Retry once on failure
            retry: 1,
            
            // ⚡ OPTIMIZED: Disable automatic refetch on window focus
            // Reduces server load and speeds up tab switching
            refetchOnWindowFocus: false, // Changed from true
            
            // ⚡ OPTIMIZED: Don't refetch on mount if data is already fresh
            // Uses cached data if available and within staleTime
            refetchOnMount: false, // New
        },
    },
});

// ⚡ OPTIMIZED: Throttle localStorage writes to once per second
// Reduces main thread blocking from frequent cache updates
export const persister = createSyncStoragePersister({
    storage: window.localStorage,
    key: 'VITE_APP_QUERY_CACHE',
    throttleTime: 1000, // Only persist once per second
});
