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
    loadUserProfile();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        await loadUserProfile();
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const loadUserProfile = async () => {
    try {
      setIsLoading(true);
      console.log('🔍 [AuthContext] Starting profile load...');

      // Get current session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.error('❌ [AuthContext] Error getting session:', sessionError);
        setUser(null);
        setIsLoading(false);
        return;
      }

      if (!session?.user) {
        console.log('ℹ️ [AuthContext] No session found');
        setUser(null);
        setIsLoading(false);
        return;
      }

      console.log('✅ [AuthContext] Session found, user ID:', session.user.id);

      // Fetch user profile from profiles table with timeout
      // Wrap Supabase query in a promise that can actually timeout
      const profileQuery = supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle(); // Use maybeSingle() instead of single() to handle 0 rows gracefully

      // Create a timeout promise
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Profile fetch timeout after 10 seconds')), 10000)
      );

      console.log('⏳ [AuthContext] Fetching profile (10s timeout)...');
      const startTime = Date.now();

      // Race between the query and timeout
      // If timeout wins, it will reject and be caught in the catch block
      const result = await Promise.race([
        profileQuery,
        timeoutPromise
      ]) as { data: any; error: any };

      const elapsed = Date.now() - startTime;
      console.log(`⏱️ [AuthContext] Profile query completed in ${elapsed}ms`);

      // If we get here, the query completed (timeout didn't win)
      // Check for errors from the query
      if (result.error) {
        console.error('❌ [AuthContext] Error fetching profile:', result.error);
        console.error('   Error code:', result.error.code);
        console.error('   Error message:', result.error.message);
        // If it's a recursion error, log it clearly
        if (result.error.code === '42P17' || result.error.message?.includes('recursion')) {
          console.error('⚠️ [AuthContext] INFINITE RECURSION DETECTED!');
          console.error('   Please run fix_client_orders_and_profiles_policies.sql in Supabase SQL Editor');

          toast({
            title: "Database Error: Infinite Recursion",
            description: "Please run the fix_client_orders_and_profiles_policies.sql script in Supabase.",
            variant: "destructive",
            duration: 10000,
          });
        }
        setUser(null);
        setIsLoading(false);
        return;
      }

      const profile = result.data;
      console.log('✅ [AuthContext] Profile fetched successfully:', profile?.email || 'N/A');

      if (!profile) {
        console.warn('Profile not found for user:', session.user.id);
        setUser(null);
        setIsLoading(false);
        return;
      }

      // Check if account is active
      if (profile.status !== 'active') {
        setUser(null);
        setIsLoading(false);
        return;
      }

      setUser(profile as User);
      console.log('✅ [AuthContext] User profile loaded successfully');
    } catch (error: any) {
      console.error('❌ [AuthContext] Exception caught:', error);
      // Handle timeout specifically
      if (error?.message?.includes('timeout')) {
        console.error('⚠️ [AuthContext] PROFILE FETCH TIMED OUT AFTER 10 SECONDS');
        console.error('   This usually indicates:');
        console.error('   1. RLS policy infinite recursion - Run fix_client_orders_and_profiles_policies.sql');
        console.error('   2. Network connectivity issues');
        console.error('   3. Database performance issues');
        console.error('   Error details:', error);

        toast({
          title: "Profile Load Timeout",
          description: "Loading took too long. This might be due to database policies. Please run the fix script.",
          variant: "destructive",
          duration: 10000,
        });
      } else if (error?.code === '42P17' || error?.message?.includes('recursion')) {
        console.error('⚠️ [AuthContext] INFINITE RECURSION DETECTED!');
        console.error('   Please run fix_client_orders_and_profiles_policies.sql in Supabase SQL Editor');

        toast({
          title: "Database Error: Infinite Recursion",
          description: "Please run the fix_client_orders_and_profiles_policies.sql script in Supabase.",
          variant: "destructive",
          duration: 10000,
        });
      } else {
        console.error('   Profile fetch error:', error);
      }
      setUser(null);
    } finally {
      setIsLoading(false);
      console.log('🏁 [AuthContext] Profile load finished, isLoading set to false');
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
