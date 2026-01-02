import { QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // Data remains "fresh" for 5 seconds
            staleTime: 1000 * 5,
            // Data is kept in cache for 24 hours
            gcTime: 1000 * 60 * 60 * 24,
            // Retain data across sessions
            retry: 1,
            refetchOnWindowFocus: true,
        },
    },
});

export const persister = createSyncStoragePersister({
    storage: window.localStorage,
    key: 'VITE_APP_QUERY_CACHE',
});
