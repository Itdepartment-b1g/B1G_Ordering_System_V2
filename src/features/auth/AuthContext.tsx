import { useState, useEffect, ReactNode, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { subscribeToTable, unsubscribe } from '@/lib/realtime.helpers';
import { getCachedProfile, setCachedProfile, clearProfileCache } from '@/lib/profileCache';
import { startTokenMonitoring, stopTokenMonitoring, cleanupLocalStorage, logSecurityEvent } from '@/lib/security';
import { AuthContext } from './hooks';
import type { User, LoginResult } from './types';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [impersonatedCompany, setImpersonatedCompany] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Handle global read-only mode for impersonation
  useEffect(() => {
    if (impersonatedCompany) {
      document.body.classList.add('read-only-mode');
    } else {
      document.body.classList.remove('read-only-mode');
    }
  }, [impersonatedCompany]);
  const { toast } = useToast();
  const userRef = useRef<User | null>(null); // Keep ref in sync with state

  // Load user session on mount
  useEffect(() => {
    console.log('🚀 [AuthContext] Initializing auth...');

    // Clean up deprecated localStorage items
    cleanupLocalStorage();

    // Start security monitoring
    startTokenMonitoring(() => {
      logSecurityEvent('Token tampering detected');
      toast({
        title: 'Security Alert',
        description: 'Suspicious activity detected. Please log in again.',
        variant: 'destructive'
      });
      logout();
    });

    // Load impersonation from sessionStorage
    const savedImpersonation = sessionStorage.getItem('impersonated_company');
    if (savedImpersonation) {
      try {
        setImpersonatedCompany(JSON.parse(savedImpersonation));
      } catch (e) {
        console.error('Failed to parse saved impersonation', e);
      }
    }

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log(`🔔 [AuthContext] Auth event: ${event}`, session ? `User: ${session.user.id}` : 'No session');

      // Check if we just logged out - ignore auth state changes if so
      const justLoggedOut = localStorage.getItem('just_logged_out');
      if (justLoggedOut === 'true' && event !== 'SIGNED_OUT') {
        console.log('🚫 [AuthContext] Ignoring auth event after logout:', event);
        return;
      }

      if (session?.user) {

        if (event === 'TOKEN_REFRESHED' && userRef.current?.id === session.user.id) {
          console.log('🔄 [AuthContext] Token refreshed, checking company status...');
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

        await loadUserProfile(session);
      } else if (event === 'SIGNED_OUT') {
        console.log('👋 [AuthContext] User signed out, clearing user');
        if ((window as any).companyStatusChannel) {
          unsubscribe((window as any).companyStatusChannel);
          (window as any).companyStatusChannel = null;
        }
        setUser(null);
        userRef.current = null;
        setIsLoading(false);
        // Set flag to prevent session restoration
        localStorage.setItem('just_logged_out', 'true');
      }
    });

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
    }, 60000);

    return () => {
      subscription.unsubscribe();
      clearInterval(companyStatusCheckInterval);
      stopTokenMonitoring();
    };
  }, [toast]);

  const initializeAuth = async () => {
    try {
      setIsLoading(true);

      // Check if we just logged out - if so, skip session restoration
      const justLoggedOut = localStorage.getItem('just_logged_out');
      if (justLoggedOut === 'true') {
        console.log('🚫 [AuthContext] Just logged out, skipping session restoration');
        setUser(null);
        userRef.current = null;
        setIsLoading(false);
        localStorage.removeItem('just_logged_out');
        return;
      }

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.error('❌ [AuthContext] Error getting session:', sessionError);
        setUser(null);
        userRef.current = null;
        setIsLoading(false);
        return;
      }

      if (!session?.user) {
        setUser(null);
        userRef.current = null;
        setIsLoading(false);
        return;
      }

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

    // 1. CACHE-FIRST: Try to load from cache for instant rendering
    const cachedProfile = getCachedProfile();
    if (cachedProfile && cachedProfile.id === userId) {
      console.log('⚡ [AuthContext] Cache hit - loading instantly');
      setUser(cachedProfile);
      userRef.current = cachedProfile;
      setIsLoading(false); // Unblock UI immediately
      // Continue to fetch fresh data in background
    } else {
      // 2. FALLBACK: Use session metadata or existing user
      const metadata = session.user.user_metadata;
      const currentUser = userRef.current;

      if (currentUser?.id === userId && currentUser?.role && currentUser.role !== 'mobile_sales') {
        console.log('🛡️ [AuthContext] Preserving existing user from memory');
        setIsLoading(false);
      } else {
        const basicUser: User = {
          id: userId,
          email: session.user.email || '',
          role: metadata?.role || 'mobile_sales',
          status: 'active',
          full_name: metadata?.full_name || 'User',
          company_id: metadata?.company_id || undefined,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        console.log('⚡ [AuthContext] Using session metadata');
        setUser(basicUser);
        userRef.current = basicUser;
        setIsLoading(false);
      }
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
          setCachedProfile(updatedUser); // Cache for next time
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
      setCachedProfile(updatedUser); // Cache for faster subsequent loads

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
    console.group('🚪 [AuthContext] Logout initiated');
    console.trace('Logout caller trace');
    console.groupEnd();
    try {
      // Set flag FIRST to prevent any auth state changes from restoring session
      localStorage.setItem('just_logged_out', 'true');

      // Clean up real-time subscriptions immediately
      if ((window as any).companyStatusChannel) {
        unsubscribe((window as any).companyStatusChannel);
        (window as any).companyStatusChannel = null;
      }

      // Clear cached profile on logout
      clearProfileCache();

      // Stop security monitoring
      stopTokenMonitoring();

      // Clear state immediately (before signOut to prevent race conditions)
      setUser(null);
      userRef.current = null;
      setIsLoading(false);

      // Perform signOut to clear Supabase session
      await supabase.auth.signOut();

      // Clear Supabase auth storage explicitly
      try {
        // Clear all Supabase-related localStorage items
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('sb-') || key.includes('supabase'))) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
      } catch (e) {
        console.warn('Could not clear Supabase storage:', e);
      }

      // Redirect to login
      window.location.href = '/login';

      console.log('👋 [AuthContext] Logged out and cleared cache');
    } catch (error) {
      console.error('Logout error:', error);
      // Even on error, ensure we clear state and redirect
      setUser(null);
      userRef.current = null;
      setIsLoading(false);
      localStorage.setItem('just_logged_out', 'true');
      window.location.href = '/login';
    }
  };

  const startImpersonation = (company: any) => {
    setImpersonatedCompany(company);
    sessionStorage.setItem('impersonated_company', JSON.stringify(company));
    toast({
      title: "Live View Active",
      description: `Now viewing as ${company.company_name}`,
    });
  };

  const stopImpersonation = () => {
    setImpersonatedCompany(null);
    sessionStorage.removeItem('impersonated_company');
    toast({
      title: "Live View Deactivated",
      description: "Returned to system administrator view",
    });
  };

  const effectiveUser = useMemo(() => {
    if (impersonatedCompany && user) {
      return {
        ...user,
        role: 'super_admin' as any,
        company_id: impersonatedCompany.id
      };
    }
    return user;
  }, [user, impersonatedCompany]);

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
    <AuthContext.Provider value={{
      user: effectiveUser,
      impersonatedCompany,
      login,
      logout,
      refreshProfile,
      startImpersonation,
      stopImpersonation,
      isAuthenticated: !!user,
      isLoading
    }}>
      {children}
    </AuthContext.Provider>
  );
}
