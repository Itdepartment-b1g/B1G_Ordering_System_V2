import { createClient } from '@supabase/supabase-js';
import { createTimeoutFetch, NETWORK_TIMEOUT } from './networkUtils';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Create Supabase client with optimized settings and timeout handling
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: window.localStorage, // Explicitly use localStorage
    storageKey: 'supabase.auth.token', // Custom storage key
    flowType: 'pkce' // Use PKCE flow for better security
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  },
  global: {
    headers: {
      'x-client-info': 'b1g-ordering@1.0.0'
    },
    // Add timeout to all fetch requests to prevent hanging when server is offline
    fetch: createTimeoutFetch(NETWORK_TIMEOUT)
  }
});
