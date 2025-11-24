import { useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { AuthContext } from './hooks';
import type { User, LoginResult } from './types';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  // Load user session on mount
  useEffect(() => {
    console.log('🚀 [AuthContext] Initializing auth...');
    initializeAuth(); // Call the new initialization function

    // Set up the auth state change listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log(`🔔 [AuthContext] Auth event: ${event}`, session ? `User: ${session.user.id}` : 'No session');

      if (session?.user) {
        // If we have a session, load the profile
        // We pass the session user ID to ensure we load the correct profile
        await loadUserProfile(session);
      } else if (event === 'SIGNED_OUT') {
        // When a user signs out, clear the user and set loading to false
        console.log('👋 [AuthContext] User signed out, clearing user');
        setUser(null);
        setIsLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const initializeAuth = async () => {
    try {
      setIsLoading(true);

      // Get current session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.error('❌ [AuthContext] Error getting session:', sessionError);
        setUser(null);
        setIsLoading(false);
        return;
      }

      if (!session?.user) {
        // No session is normal for unauthenticated users
        setUser(null);
        setIsLoading(false);
        return;
      }

      // Only load profile if we actually have a session
      await loadUserProfile(session);
    } catch (error) {
      console.error('❌ [AuthContext] Auth initialization error:', error);
      setUser(null);
      setIsLoading(false);
    }
  };

  const loadUserProfile = async (session: any) => {
    const userId = session.user.id;
    const metadata = session.user.user_metadata;

    // 1. OPTIMISTIC UPDATE: Set user immediately from session metadata
    // This ensures the UI renders INSTANTLY without waiting for the DB
    const optimisticUser: User = {
      id: userId,
      email: session.user.email || '',
      role: metadata?.role || 'mobile_sales', // Default fallback
      status: 'active', // Assume active initially to allow access
      full_name: metadata?.full_name || 'User',
      company_id: metadata?.company_id || '', // Try to get from metadata if available
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    console.log('⚡ [AuthContext] Optimistic login for:', optimisticUser.email);
    setUser(optimisticUser);
    setIsLoading(false); // <--- CRITICAL: Unblock UI immediately

    // 2. BACKGROUND VERIFICATION: Fetch fresh data from DB
    try {
      console.log('🔍 [AuthContext] Verifying profile in background...');

      // Fetch user profile from profiles table with timeout
      const profileQuery = supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      // Create a timeout promise (shorter timeout for background sync)
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Background profile fetch timeout')), 10000)
      );

      const startTime = Date.now();

      // Race between the query and timeout
      const result = await Promise.race([
        profileQuery,
        timeoutPromise
      ]) as { data: any; error: any };

      const elapsed = Date.now() - startTime;
      console.log(`⏱️ [AuthContext] Background sync completed in ${elapsed}ms`);

      if (result.error) {
        console.warn('⚠️ [AuthContext] Background profile sync failed:', result.error);
        // We don't show an error to the user because they are already logged in optimistically
        // and we don't want to disrupt their flow.
        return;
      }

      const profile = result.data;

      if (!profile) {
        console.warn('⚠️ [AuthContext] Profile not found in DB (using optimistic data)');
        return;
      }

      if (profile.status !== 'active') {
        console.warn('❌ [AuthContext] User account is not active (revoking access)');
        setUser(null); // Revoke access if DB says inactive
        toast({
          title: "Access Denied",
          description: "Your account is not active.",
          variant: "destructive",
        });
        return;
      }

      // Update with fresh data from DB
      console.log('✅ [AuthContext] Profile verified and updated from DB');
      setUser(profile as User);

    } catch (error: any) {
      console.warn('⚠️ [AuthContext] Background sync exception:', error);
      // Ignore errors to keep the session alive
    }
  };

  const login = async (email: string, password: string): Promise<LoginResult> => {
    try {
      setIsLoading(true);
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('Login error:', error);
        return { success: false, error: 'invalid_credentials' };
      }

      // Profile loading is handled by onAuthStateChange
      return { success: true };
    } catch (error) {
      console.error('Login exception:', error);
      return { success: false, error: 'invalid_credentials' };
    } finally {
      // Don't set isLoading(false) here, let loadUserProfile handle it
      // unless there was an error
    }
  };

  const logout = async () => {
    try {
      setIsLoading(true);
      await supabase.auth.signOut();
      setUser(null);
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}
