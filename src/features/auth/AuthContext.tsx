import { useState, useEffect, ReactNode, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { subscribeToTable, unsubscribe } from '@/lib/realtime.helpers';
import { getCachedProfile, setCachedProfile, clearProfileCache, isCacheStale } from '@/lib/profileCache';
import { startTokenMonitoring, stopTokenMonitoring, cleanupLocalStorage, logSecurityEvent } from '@/lib/security';
import { AuthContext } from './hooks';
import type { User, LoginResult } from './types';
import { Loader2 } from 'lucide-react';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [impersonatedCompany, setImpersonatedCompany] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);

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
        // Optimization: If we already have the user loaded, don't re-fetch on every event
        // unless it's a different user
        if (userRef.current?.id === session.user.id) {
          console.log('🔄 [AuthContext] Session refreshed for same user, skipping profile reload');
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

        // Even if logged out, we are "initialized"
        setIsInitialized(true);
        return;
      }

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.error('❌ [AuthContext] Error getting session:', sessionError);
        setUser(null);
        userRef.current = null;
        setIsLoading(false);
        setIsInitialized(true);
        return;
      }

      if (!session?.user) {
        setUser(null);
        userRef.current = null;
        setIsLoading(false);
        setIsInitialized(true);
        return;
      }

      await loadUserProfile(session);

      // Start security monitoring ONLY after we have a valid session/initialization
      // This prevents the "No auth token" warning during initial load
      startTokenMonitoring(() => {
        logSecurityEvent('Token tampering detected');
        toast({
          title: 'Security Alert',
          description: 'Suspicious activity detected. Please log in again.',
          variant: 'destructive'
        });
        logout();
      });

    } catch (error) {
      console.error('❌ [AuthContext] Auth initialization error:', error);
      setUser(null);
      userRef.current = null;
      setIsLoading(false);
    } finally {
      setIsInitialized(true);
    }
  };

  const loadUserProfile = async (session: any, forceRefresh = false) => {
    const userId = session.user.id;
    const { isCacheStale } = await import('@/lib/profileCache'); // Dynamic import to avoid circular dep issues slightly, though static is fine

    // 1. MEMORY CACHE CHECK
    if (!forceRefresh && userRef.current?.id === userId) {
      console.log('✅ [AuthContext] User already in memory');
      setIsLoading(false);
      return;
    }

    // 2. PERSISTENT CACHE CHECK (Stale-While-Revalidate)
    const cached = getCachedProfile();
    const shouldFetch = forceRefresh || !cached || isCacheStale();

    if (cached && cached.id === userId) {
      console.log('✅ [AuthContext] Using cached profile (Instant Load)');
      setUser(cached);
      userRef.current = cached;
      setIsLoading(false);

      // If cache is fresh and no forced refresh, we are done!
      if (!shouldFetch) {
        return;
      }

      console.log('🔄 [AuthContext] Cache is stale, refreshing in background...');
    } else {
      // No cache found - we must show loading
      console.log('🔍 [AuthContext] No cache found, fetching from DB...');
      setIsLoading(true); // Ensure loading is shown for initial fetch
    }

    // 3. DB FETCH (Background if cached, Blocking if not)
    try {
      // Standard fetch with joined company data
      const { data: profileData, error } = await supabase
        .from('profiles')
        .select(`
          id, email, full_name, role, status, company_id, phone, region, city, address, country, avatar_url, created_at, updated_at,
          companies (status)
        `)
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('⚠️ [AuthContext] Profile fetch failed:', error);
        // If we failed and didn't have a cache, try to construct a fallback
        if (!userRef.current) {
          // ... existing fallback logic ...
          const metadata = session.user.user_metadata;
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
          setUser(basicUser);
          userRef.current = basicUser;
        }
        return;
      }

      if (!profileData) {
        // ... existing not found logic ...
        if (!userRef.current) {
          const metadata = session.user.user_metadata;
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
          setUser(basicUser);
          userRef.current = basicUser;
        }
        return;
      }

      // Check user status
      if (profileData.status !== 'active') {
        console.warn('❌ [AuthContext] User account is not active');
        setUser(null);
        userRef.current = null;
        await supabase.auth.signOut();
        toast({ title: "Access Denied", description: "Your account is not active.", variant: "destructive" });
        return;
      }

      // Check company status
      if (profileData.company_id && profileData.role !== 'system_administrator') {
        const companyStatus = (profileData.companies as any)?.status;
        if (companyStatus === 'inactive') {
          console.warn('❌ [AuthContext] Company is inactive');
          await supabase.auth.signOut();
          setUser(null);
          userRef.current = null;
          toast({ title: "Access Denied", description: "Company account deactivated.", variant: "destructive" });
          return;
        }
      }

      // Valid profile - update state and cache
      console.log('✅ [AuthContext] Profile refreshed from DB');
      const { companies, ...profile } = profileData;
      const updatedUser = profile as User;

      // Update state
      setUser(updatedUser);
      userRef.current = updatedUser;

      // Update Persistent Cache
      setCachedProfile(updatedUser);

      // Setup Realtime
      setupCompanyListener(updatedUser);

    } catch (error: any) {
      console.error('❌ [AuthContext] Profile fetch exception:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to separate listener logic
  const setupCompanyListener = (user: User) => {
    if (user.company_id && user.role !== 'system_administrator') {
      if ((window as any).companyStatusChannel) {
        // If already subscribed to THIS company, skip
        // But simpler to just unsubscribe and resubscribe to be safe/lazy
        unsubscribe((window as any).companyStatusChannel);
      }

      const companyChannel = subscribeToTable('companies', async (payload: any) => {
        if (payload.new?.id === user.company_id || payload.old?.id === user.company_id) {
          if (payload.new?.status === 'inactive') {
            console.warn('❌ [AuthContext] Company inactive via real-time, logging out');
            await supabase.auth.signOut();
            setUser(null);
            userRef.current = null;
            window.location.href = '/login';
          }
        }
      });
      (window as any).companyStatusChannel = companyChannel;
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
        await loadUserProfile(session, true);
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
      isLoading,
      isInitialized
    } as any}>
      {!isInitialized ? (
        <div className="flex h-screen w-full items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium text-muted-foreground animate-pulse">
              Initializing application...
            </p>
          </div>
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}
