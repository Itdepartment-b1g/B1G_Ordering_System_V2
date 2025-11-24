import { useState, useEffect, ReactNode, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { subscribeToTable, unsubscribe } from '@/lib/realtime.helpers';
import { AuthContext } from './hooks';
import type { User, LoginResult } from './types';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const userRef = useRef<User | null>(null); // Keep ref in sync with state

  // Load user session on mount
  useEffect(() => {
    console.log('🚀 [AuthContext] Initializing auth...');
    initializeAuth(); // Call the new initialization function

    // Set up the auth state change listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log(`🔔 [AuthContext] Auth event: ${event}`, session ? `User: ${session.user.id}` : 'No session');

      if (session?.user) {
        // Skip optimistic update for token refresh events if we already have a user
        // This prevents overwriting the correct role from DB with wrong metadata
        if (event === 'TOKEN_REFRESHED' && userRef.current?.id === session.user.id) {
          console.log('🔄 [AuthContext] Token refreshed, checking company status...');
          // Still check company status on token refresh
          const currentUser = userRef.current;
          if (currentUser?.company_id && currentUser.role !== 'system_administrator') {
            const { data: company } = await supabase
              .from('companies')
              .select('status')
              .eq('id', currentUser.company_id)
              .single();
            
            if (company && company.status === 'inactive') {
              console.warn('❌ [AuthContext] Company became inactive, logging out');
              await supabase.auth.signOut();
              setUser(null);
              userRef.current = null;
              toast({
                title: "Access Denied",
                description: "Your company account has been deactivated. Please contact your system administrator.",
                variant: "destructive",
              });
              return;
            }
          }
          return;
        }
        
        // If we have a session, load the profile
        // We pass the session user ID to ensure we load the correct profile
        await loadUserProfile(session);
      } else if (event === 'SIGNED_OUT') {
        // When a user signs out, clear the user and set loading to false
        console.log('👋 [AuthContext] User signed out, clearing user');
        // Clean up company status subscription
        if ((window as any).companyStatusChannel) {
          unsubscribe((window as any).companyStatusChannel);
          (window as any).companyStatusChannel = null;
        }
        setUser(null);
        userRef.current = null; // Clear ref too
        setIsLoading(false);
      }
    });

    // Set up periodic company status check as backup (every 60 seconds)
    const companyStatusCheckInterval = setInterval(async () => {
      const currentUser = userRef.current;
      if (currentUser?.company_id && currentUser.role !== 'system_administrator') {
        const { data: company } = await supabase
          .from('companies')
          .select('status')
          .eq('id', currentUser.company_id)
          .single();
        
        if (company && company.status === 'inactive') {
          console.warn('❌ [AuthContext] Company status check: Company is inactive, logging out');
          await supabase.auth.signOut();
          setUser(null);
          userRef.current = null;
          toast({
            title: "Access Denied",
            description: "Your company account has been deactivated. Please contact your system administrator.",
            variant: "destructive",
          });
        }
      }
    }, 60000); // Check every 60 seconds

    return () => {
      subscription.unsubscribe();
      clearInterval(companyStatusCheckInterval);
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
        userRef.current = null;
        setIsLoading(false);
        return;
      }

      if (!session?.user) {
        // No session is normal for unauthenticated users
        setUser(null);
        userRef.current = null;
        setIsLoading(false);
        return;
      }

      // Only load profile if we actually have a session
      await loadUserProfile(session);
    } catch (error) {
      console.error('❌ [AuthContext] Auth initialization error:', error);
      setUser(null);
      userRef.current = null;
      setIsLoading(false);
    }
  };

  const loadUserProfile = async (session: any) => {
    const userId = session.user.id;
    const metadata = session.user.user_metadata;

    // 1. OPTIMISTIC UPDATE: Set user immediately from session metadata
    // This ensures the UI renders INSTANTLY without waiting for the DB
    // BUT: Only do optimistic update if we don't already have a user with a role from DB
    // This prevents overwriting correct roles with wrong metadata on token refresh
    const currentUser = userRef.current;
    
    // If we already have a user with a role from DB, don't overwrite with optimistic data
    if (currentUser?.id === userId && currentUser?.role && currentUser.role !== 'mobile_sales') {
      console.log('🛡️ [AuthContext] Preserving existing role from DB:', currentUser.role);
      setIsLoading(false);
      // Still fetch from DB in background to ensure we have latest data, but don't overwrite yet
    } else {
      // Otherwise, create optimistic user
      const optimisticUser: User = {
        id: userId,
        email: session.user.email || '',
        role: metadata?.role || 'mobile_sales', // Default fallback (will be updated from DB)
        status: 'active', // Assume active initially to allow access
        full_name: metadata?.full_name || 'User',
        company_id: metadata?.company_id || undefined, // Will be updated from DB
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      console.log('⚡ [AuthContext] Optimistic login for:', optimisticUser.email);
      setUser(optimisticUser);
      userRef.current = optimisticUser;
      setIsLoading(false); // <--- CRITICAL: Unblock UI immediately
    }

    // 2. BACKGROUND VERIFICATION: Fetch fresh data from DB
    try {
      console.log('🔍 [AuthContext] Verifying profile in background...');

      // Fetch user profile from profiles table with explicit fields including company_id
      const profileQuery = supabase
        .from('profiles')
        .select('id, email, full_name, role, status, company_id, phone, region, city, address, country, avatar_url, created_at, updated_at')
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
        console.error('⚠️ [AuthContext] Background profile sync failed:', result.error);
        console.error('⚠️ [AuthContext] Error details:', {
          message: result.error.message,
          code: result.error.code,
          details: result.error.details,
          hint: result.error.hint
        });
        
        // If there's an error, try to retry once after a short delay
        console.log('🔄 [AuthContext] Retrying profile fetch...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const retryResult = await supabase
          .from('profiles')
          .select('id, email, full_name, role, status, company_id, phone, region, city, address, country, avatar_url, created_at, updated_at')
          .eq('id', userId)
          .maybeSingle();
        
        if (retryResult.error || !retryResult.data) {
          console.error('⚠️ [AuthContext] Retry also failed, using optimistic data');
          return;
        }
        
        // Use retry result
        const profile = retryResult.data;
        if (profile.status === 'active') {
          console.log('✅ [AuthContext] Profile fetched on retry');
          console.log('✅ [AuthContext] Role:', profile.role);
          console.log('✅ [AuthContext] Company ID:', profile.company_id);
          const updatedUser = profile as User;
          setUser(updatedUser);
          userRef.current = updatedUser; // Keep ref in sync
        }
        return;
      }

      const profile = result.data;

      if (!profile) {
        console.warn('⚠️ [AuthContext] Profile not found in DB (using optimistic data)');
        console.warn('⚠️ [AuthContext] User ID:', userId);
        return;
      }

      console.log('📊 [AuthContext] Profile fetched from DB:', profile);

      if (profile.status !== 'active') {
        console.warn('❌ [AuthContext] User account is not active (revoking access)');
        setUser(null); // Revoke access if DB says inactive
        userRef.current = null;
        toast({
          title: "Access Denied",
          description: "Your account is not active.",
          variant: "destructive",
        });
        return;
      }

      // Check if company_id is missing and warn
      if (!profile.company_id) {
        console.error('❌ [AuthContext] Profile is missing company_id!');
        console.error('❌ [AuthContext] Profile data:', profile);
        toast({
          title: "Profile Issue",
          description: "Your profile is missing company information. Please contact support.",
          variant: "destructive",
        });
      }

      // Check company status (skip for system_administrator as they don't belong to a company)
      if (profile.company_id && profile.role !== 'system_administrator') {
        const { data: company, error: companyError } = await supabase
          .from('companies')
          .select('status')
          .eq('id', profile.company_id)
          .single();

        if (companyError) {
          console.error('❌ [AuthContext] Error checking company status:', companyError);
        } else if (company && company.status === 'inactive') {
          console.warn('❌ [AuthContext] Company is inactive (logging out user)');
          // Log out the user
          await supabase.auth.signOut();
          setUser(null);
          userRef.current = null;
          toast({
            title: "Access Denied",
            description: "Your company account has been deactivated. Please contact your system administrator.",
            variant: "destructive",
          });
          return;
        }
      }

      // Update with fresh data from DB
      console.log('✅ [AuthContext] Profile verified and updated from DB');
      console.log('✅ [AuthContext] Role:', profile.role);
      console.log('✅ [AuthContext] Company ID:', profile.company_id);
      const updatedUser = profile as User;
      setUser(updatedUser);
      userRef.current = updatedUser; // Keep ref in sync

      // Set up real-time subscription to monitor company status changes (only for non-system-admins with company_id)
      if (updatedUser.company_id && updatedUser.role !== 'system_administrator') {
        // Clean up any existing subscription first
        if ((window as any).companyStatusChannel) {
          unsubscribe((window as any).companyStatusChannel);
        }
        
        // Subscribe to changes in the company table
        const companyChannel = subscribeToTable('companies', async (payload: any) => {
          // Check if the changed company is the user's company
          if (payload.new?.id === updatedUser.company_id || payload.old?.id === updatedUser.company_id) {
            if (payload.new?.status === 'inactive') {
              console.warn('❌ [AuthContext] Company status changed to inactive via real-time, logging out');
              await supabase.auth.signOut();
              setUser(null);
              userRef.current = null;
              toast({
                title: "Access Denied",
                description: "Your company account has been deactivated. Please contact your system administrator.",
                variant: "destructive",
              });
            }
          }
        });
        
        // Store channel reference for cleanup
        (window as any).companyStatusChannel = companyChannel;
      }

    } catch (error: any) {
      console.warn('⚠️ [AuthContext] Background sync exception:', error);
      // Ignore errors to keep the session alive
    }
  };

  const login = async (email: string, password: string): Promise<LoginResult> => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('Login error:', error);
        return { success: false, error: 'invalid_credentials' };
      }

      // After successful auth, check company status before allowing login
      if (data?.user?.id) {
        // Fetch profile to get company_id
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('company_id, role, status')
          .eq('id', data.user.id)
          .single();

        if (profileError) {
          console.error('Error fetching profile during login:', profileError);
          // Continue with login, will be checked in loadUserProfile
        } else if (profile) {
          // Check user status
          if (profile.status !== 'active') {
            await supabase.auth.signOut();
            return { success: false, error: 'account_restricted' };
          }

          // Check company status (skip for system_administrator)
          if (profile.company_id && profile.role !== 'system_administrator') {
            const { data: company, error: companyError } = await supabase
              .from('companies')
              .select('status')
              .eq('id', profile.company_id)
              .single();

            if (companyError) {
              console.error('Error checking company status during login:', companyError);
              // Continue with login, will be checked in loadUserProfile
            } else if (company && company.status === 'inactive') {
              await supabase.auth.signOut();
              return { success: false, error: 'company_inactive' };
            }
          }
        }
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
      userRef.current = null;
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshProfile = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await loadUserProfile(session);
      }
    } catch (error) {
      console.error('Refresh profile error:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, refreshProfile, isAuthenticated: !!user, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}
