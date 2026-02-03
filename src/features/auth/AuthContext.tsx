import { useState, useEffect, ReactNode, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { subscribeToTable, unsubscribe } from '@/lib/realtime.helpers';
import { getCachedProfile, setCachedProfile, clearProfileCache, isCacheStale } from '@/lib/profileCache';
import { startTokenMonitoring, stopTokenMonitoring, cleanupLocalStorage, logSecurityEvent, getAuthTokenInfo } from '@/lib/security';
import { shouldCheckSession, isNetworkError, resetSessionCheckCooldown } from '@/lib/networkUtils';
import { AuthContext } from './hooks';
import type { User, LoginResult } from './types';
import { Loader2, WifiOff } from 'lucide-react';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [impersonatedCompany, setImpersonatedCompany] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const { toast } = useToast();
  const userRef = useRef<User | null>(null);

  // Handle global read-only mode for impersonation
  useEffect(() => {
    if (impersonatedCompany) {
      document.body.classList.add('read-only-mode');
    } else {
      document.body.classList.remove('read-only-mode');
    }
  }, [impersonatedCompany]);

  // Network status monitoring
  useEffect(() => {
    const handleOnline = () => {
      console.log('🌐 [AuthContext] Network restored');
      setIsOffline(false);

      // Refresh profile when back online
      if (userRef.current) {
        refreshProfile();
      }
    };

    const handleOffline = () => {
      console.log('📡 [AuthContext] Network lost');
      setIsOffline(true);
      toast({
        title: 'Connection Lost',
        description: 'You are offline. Some features may be limited.',
        variant: 'destructive',
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [toast]);

  // Load user session on mount
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      console.log('🚀 [AuthContext] Initializing auth...');
      
      // Clean up deprecated localStorage items
      cleanupLocalStorage();

      // Load impersonation from sessionStorage
      const savedImpersonation = sessionStorage.getItem('impersonated_company');
      if (savedImpersonation) {
        try {
          if (mounted) setImpersonatedCompany(JSON.parse(savedImpersonation));
        } catch (e) {
          console.error('Failed to parse saved impersonation', e);
        }
      }

      // Initialize auth state
      await initializeAuth(mounted);
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      
      console.log(`🔔 [AuthContext] Auth event: ${event}`, session ? `User: ${session.user.id}` : 'No session');

      // FIX 1: Tightened onAuthStateChange handler.
      // Previously this swallowed TOKEN_REFRESHED and other valid events on
      // browser reopen because the flag survived in localStorage.
      // Now we only block events that are genuinely post-logout noise
      // (i.e. not SIGNED_IN and not SIGNED_OUT and not TOKEN_REFRESHED).
      const justLoggedOut = localStorage.getItem('just_logged_out');
      if (justLoggedOut === 'true') {
        if (event === 'SIGNED_IN') {
          // Real new login — clear the flag and let it through.
          console.log('✅ [AuthContext] New login detected, clearing logout flag');
          localStorage.removeItem('just_logged_out');
        } else if (event === 'TOKEN_REFRESHED') {
          // Token refresh on reopen — not a logout event, clear flag and let it through.
          console.log('✅ [AuthContext] Token refreshed after reopen, clearing logout flag');
          localStorage.removeItem('just_logged_out');
        } else if (event === 'SIGNED_OUT') {
          // Actual sign-out — let it fall through to the handler below.
        } else {
          // Anything else (e.g. USER_UPDATED right after a real logout) — ignore.
          console.log('🚫 [AuthContext] Ignoring auth event after logout:', event);
          return;
        }
      }

      if (session?.user) {
        // Skip profile reload for token refresh events
        if (event === 'TOKEN_REFRESHED' && userRef.current?.id === session.user.id) {
          console.log('🔄 [AuthContext] Token refreshed, skipping profile reload');
          return;
        }

        // Skip profile reload for same user (unless it's a new sign-in)
        if (userRef.current?.id === session.user.id && event !== 'SIGNED_IN') {
          console.log('🔄 [AuthContext] Session updated for same user, skipping profile reload');
          return;
        }

        // Load profile for SIGNED_IN events or new users
        if (event === 'SIGNED_IN' || !userRef.current) {
          await loadUserProfile(session);
        }
      } else if (event === 'SIGNED_OUT') {
        console.log('👋 [AuthContext] User signed out, clearing user');
        if ((window as any).companyStatusChannel) {
          unsubscribe((window as any).companyStatusChannel);
          (window as any).companyStatusChannel = null;
        }
        setUser(null);
        userRef.current = null;
        setIsLoading(false);
        localStorage.setItem('just_logged_out', 'true');
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
      stopTokenMonitoring();
    };
  }, [toast]);

  // Session monitoring effect (Interval, Visibility, Focus)
  useEffect(() => {
    const companyStatusCheckInterval = setInterval(async () => {
      const currentUser = userRef.current;
      if (currentUser?.company_id && currentUser.role !== 'system_administrator') {
        try {
          // Verify session is still valid
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();

          if (sessionError || !session) {
            console.warn('⚠️ [AuthContext] Session expired or invalid during periodic check');
            await logout();
            toast({
              title: 'Session Expired',
              description: 'Your session has expired. Please log in again.',
              variant: 'destructive',
            });
            return;
          }

          const { data: company, error: companyError } = await supabase
            .from('companies')
            .select('status')
            .eq('id', currentUser.company_id)
            .single();

          if (companyError) {
            console.warn('⚠️ [AuthContext] Failed to check company status:', companyError);
            // Don't log out on network errors, just skip this check
            return;
          }

          if (company && company.status === 'inactive') {
            console.warn('❌ [AuthContext] Company status check: Company is inactive, logging out');
            await logout();
            toast({
              title: "Access Denied",
              description: "Your company account has been deactivated. Please contact your system administrator.",
              variant: "destructive",
            });
          }
        } catch (error) {
          console.warn('⚠️ [AuthContext] Company status check failed:', error);
          // Don't log out on errors, could be network issues
        }
      }
    }, 60000);

    // Handle page visibility change (laptop sleep/wake)
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && userRef.current) {
        console.log('👁️ [AuthContext] Page became visible, verifying session...');

        try {
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();

          if (sessionError || !session) {
            if (isNetworkError(sessionError)) {
              console.warn('⚠️ [AuthContext] Network error after wake, entering offline mode');
              setIsOffline(true);
              return;
            }

            console.warn('⚠️ [AuthContext] Session expired after wake from sleep');
            toast({
              title: 'Session Expired',
              description: 'Your session expired while your device was asleep. Please log in again.',
              variant: 'destructive',
            });
            await logout();
            return;
          }

          const expiresAt = session.expires_at;
          if (expiresAt) {
            const expiresIn = expiresAt - Math.floor(Date.now() / 1000);
            if (expiresIn < 300) {
              console.log('🔄 [AuthContext] Token expiring soon, refreshing...');
              const { error: refreshError } = await supabase.auth.refreshSession();
              if (refreshError) {
                console.error('❌ [AuthContext] Failed to refresh session:', refreshError);
                toast({
                  title: 'Session Expired',
                  description: 'Unable to refresh your session. Please log in again.',
                  variant: 'destructive',
                });
                await logout();
              } else {
                console.log('✅ [AuthContext] Session refreshed successfully');
              }
            }
          }
        } catch (error) {
           if (isNetworkError(error)) {
             console.warn('⚠️ [AuthContext] Network error during visibility check');
             setIsOffline(true);
           } else {
             console.error('❌ [AuthContext] Visibility change check failed:', error);
           }
        }
      }
    };

    // Handle window focus with cooldown to prevent spamming
    const handleFocus = async () => {
      if (!userRef.current) return;

      // Check cooldown to prevent excessive session checks
      if (!shouldCheckSession()) {
        return; // Skip if checked recently
      }

      console.log('🎯 [AuthContext] Window focused, checking session...');

      try {
        const tokenInfo = getAuthTokenInfo();
        console.log('🔑 [AuthContext] Current token info:', tokenInfo);

        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          if (isNetworkError(error)) {
            console.warn('⚠️ [AuthContext] Network error during focus check, staying offline');
            setIsOffline(true);
            return; // Don't logout on network errors
          }
          console.warn('⚠️ [AuthContext] Session error on focus:', error);
        }

        if (!session) {
          console.warn('⚠️ [AuthContext] No session on focus');
          await logout();
        } else {
          resetSessionCheckCooldown();
        }
      } catch (error) {
        if (isNetworkError(error)) {
          console.warn('⚠️ [AuthContext] Network error during focus check');
          setIsOffline(true);
        } else {
          console.error('❌ [AuthContext] Focus check failed:', error);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(companyStatusCheckInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [toast]);

  const initializeAuth = async (mounted = true) => {
    let flowCompleted = false;
    const safetyTimer = setTimeout(() => {
      if (!flowCompleted && mounted) {
        console.warn('⚠️ [AuthContext] Init timeout - forcing app load');
        setIsInitialized(true);
        if (isLoading) setIsLoading(false);
      }
    }, 5000);

    try {
      // FIX 2: Session-aware just_logged_out check.
      // Previously this returned immediately if the flag was set, even when a
      // valid Supabase session still existed (e.g. after closing and reopening
      // the browser). Now we actually verify the session before honoring the flag.
      const justLoggedOut = localStorage.getItem('just_logged_out');
      if (justLoggedOut === 'true') {
        try {
          const { data, error } = await supabase.auth.getSession();

          if (!error && data.session?.user) {
            // Valid session exists — the flag is stale (browser was closed, not a real logout).
            // Clear it and fall through to normal init below.
            console.log('✅ [AuthContext] just_logged_out flag is stale — valid session found, clearing flag and continuing');
            localStorage.removeItem('just_logged_out');
          } else {
            // No valid session — this was a real logout. Honor the flag and exit.
            console.log('🚫 [AuthContext] just_logged_out confirmed, no active session');
            if (mounted) {
              setUser(null);
              userRef.current = null;
              setIsLoading(false);
              localStorage.removeItem('just_logged_out');
              setIsInitialized(true);
            }
            return;
          }
        } catch (err) {
          // Network error while checking — clear the flag and let the rest of
          // initializeAuth handle it (it already has network/cache logic).
          console.warn('⚠️ [AuthContext] Network error while verifying session for just_logged_out, continuing init');
          localStorage.removeItem('just_logged_out');
        }
      }

      // Attempt to get session (with network error handling)
      let session;
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        session = data.session;
      } catch (error: any) {
        console.error('❌ [AuthContext] Failed to get session:', error);

        // Check if it's a network error
        if (error.message?.includes('fetch') || error.message?.includes('network')) {
          console.log('🌐 [AuthContext] Network error during init, using cached profile');
          if (mounted) setIsOffline(true);

          // Try to use cached profile for offline access
          const cachedProfile = getCachedProfile();
          if (cachedProfile && mounted) {
            console.log('✅ [AuthContext] Using cached profile in offline mode');
            setUser(cachedProfile);
            userRef.current = cachedProfile;
            setIsLoading(false);
            setIsInitialized(true);

            toast({
              title: 'Offline Mode',
              description: 'You are offline. Some features may be limited.',
              variant: 'default',
            });
            return;
          }
        }

        // No session and no cache - show login
        console.log('🚫 [AuthContext] No session and no cache available');
        clearProfileCache();
        if (mounted) {
          setUser(null);
          userRef.current = null;
          setIsLoading(false);
          setIsInitialized(true);
        }
        return;
      }

      if (!session?.user) {
        console.log('🚫 [AuthContext] No valid session, clearing any stale cache');
        clearProfileCache();
        if (mounted) {
          setUser(null);
          userRef.current = null;
          setIsLoading(false);
          setIsInitialized(true);
        }
        return;
      }

      // Session is valid - check cache
      const cachedProfile = getCachedProfile();
      if (cachedProfile && cachedProfile.id === session.user.id && !isCacheStale()) {
        console.log('⚡ [AuthContext] Using fresh cached profile');
        if (mounted) {
          setUser(cachedProfile);
          userRef.current = cachedProfile;
          setIsLoading(false);
          setIsInitialized(true);
        }

        startTokenMonitoring(() => {
          logSecurityEvent('Token tampering detected');
          toast({
            title: 'Security Alert',
            description: 'Suspicious activity detected. Please log in again.',
            variant: 'destructive'
          });
          logout();
        });

        return;
      }

      // Fetch fresh profile
      console.log('🔍 [AuthContext] Fetching fresh profile from database...');
      if (mounted) setIsLoading(true);

      await loadUserProfile(session);

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

      // Try to gracefully handle with cache
      const cachedProfile = getCachedProfile();
      if (cachedProfile) {
        console.log('⚡ [AuthContext] Using cached profile after init error');
        if (mounted) {
          setUser(cachedProfile);
          userRef.current = cachedProfile;
          setIsOffline(true);
        }
      } else {
        if (mounted) {
          setUser(null);
          userRef.current = null;
        }
      }

      if (mounted) setIsLoading(false);
    } finally {
      flowCompleted = true;
      clearTimeout(safetyTimer);
      if (mounted) setIsInitialized(true);
    }
  };

  const loadUserProfile = async (session: any, forceRefresh = false) => {
    const userId = session.user.id;

    // Memory cache check
    if (!forceRefresh && userRef.current?.id === userId) {
      console.log('✅ [AuthContext] User already in memory');
      setIsLoading(false);
      return;
    }

    // Persistent cache check
    const cached = getCachedProfile();
    const shouldFetch = forceRefresh || !cached || isCacheStale();

    if (cached && cached.id === userId) {
      console.log('✅ [AuthContext] Using cached profile (Instant Load)');
      setUser(cached);
      userRef.current = cached;
      setIsLoading(false);

      if (!shouldFetch) {
        return;
      }

      console.log('🔄 [AuthContext] Cache is stale, refreshing in background...');
    } else {
      console.log('🔍 [AuthContext] No cache found, fetching from DB...');
      setIsLoading(true);
    }

    // DB Fetch with network error handling
    try {
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

        if (error.message?.includes('fetch') || error.message?.includes('Failed to fetch')) {
          console.log('🌐 [AuthContext] Network error, keeping cached profile');
          setIsOffline(true);

          // Keep using cached profile if available
          if (cached) {
            setIsLoading(false);
            return;
          }
        }

        // Fallback to basic user from session metadata
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
        setIsLoading(false);
        return;
      }

      if (!profileData) {
        console.warn('⚠️ [AuthContext] Profile not found');
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
        setIsLoading(false);
        return;
      }

      // Check user status
      if (profileData.status !== 'active') {
        console.warn('❌ [AuthContext] User account is not active');
        setUser(null);
        userRef.current = null;
        setIsLoading(false);
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
          setIsLoading(false);
          toast({ title: "Access Denied", description: "Company account deactivated.", variant: "destructive" });
          return;
        }
      }

      // Valid profile - update state and cache
      console.log('✅ [AuthContext] Profile refreshed from DB');
      const { companies, ...profile } = profileData;
      const updatedUser = profile as User;

      setUser(updatedUser);
      userRef.current = updatedUser;
      setCachedProfile(updatedUser);
      setupCompanyListener(updatedUser);

      // Clear offline state if we successfully fetched
      setIsOffline(false);

    } catch (error: any) {
      console.error('❌ [AuthContext] Profile fetch exception:', error);

      if (error.message?.includes('fetch') || error.message?.includes('network')) {
        console.log('🌐 [AuthContext] Network error, using cached profile');
        setIsOffline(true);

        if (cached) {
          // Keep using cached profile
          setIsLoading(false);
          return;
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const setupCompanyListener = (user: User) => {
    if (user.company_id && user.role !== 'system_administrator') {
      if ((window as any).companyStatusChannel) {
        unsubscribe((window as any).companyStatusChannel);
      }

      try {
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
      } catch (error) {
        console.warn('⚠️ [AuthContext] Failed to setup realtime listener:', error);
        // Don't fail the whole auth flow if realtime fails
      }
    }
  };

  const login = async (email: string, password: string): Promise<LoginResult> => {
    try {
      setIsLoading(true);
      localStorage.removeItem('just_logged_out');

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('Login error:', error);
        setIsLoading(false);

        if (error.message?.includes('fetch') || error.message?.includes('network')) {
          return { success: false, error: 'network_error' };
        }

        return { success: false, error: 'invalid_credentials' };
      }

      if (data?.user?.id) {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('company_id, role, status, companies(status)')
          .eq('id', data.user.id)
          .single();

        if (profileError) {
          console.error('Error fetching profile during login:', profileError);
        } else if (profile) {
          if (profile.status !== 'active') {
            await supabase.auth.signOut();
            setIsLoading(false);
            return { success: false, error: 'account_restricted' };
          }

          if (profile.company_id && profile.role !== 'system_administrator') {
            const companyStatus = (profile.companies as any)?.status;
            if (companyStatus === 'inactive') {
              await supabase.auth.signOut();
              setIsLoading(false);
              return { success: false, error: 'company_inactive' };
            }
          }
        }
      }

      return { success: true };
    } catch (error) {
      console.error('Login exception:', error);
      setIsLoading(false);
      return { success: false, error: 'invalid_credentials' };
    }
  };

  const logout = async () => {
    console.group('🚪 [AuthContext] Logout initiated');
    console.trace('Logout caller trace');
    console.groupEnd();

    try {
      localStorage.setItem('just_logged_out', 'true');

      if ((window as any).companyStatusChannel) {
        unsubscribe((window as any).companyStatusChannel);
        (window as any).companyStatusChannel = null;
      }

      clearProfileCache();
      stopTokenMonitoring();

      setUser(null);
      userRef.current = null;
      setIsLoading(false);

      // Clear Supabase auth tokens (let Supabase manage its own keys)
      console.log('🚪 [AuthContext] Calling supabase.auth.signOut()...');
      await supabase.auth.signOut({ scope: 'local' });
      console.log('✅ [AuthContext] SignOut complete');

      await new Promise(resolve => setTimeout(resolve, 100));

      console.log('👋 [AuthContext] Logout complete, redirecting...');
      window.location.href = '/login';
    } catch (error) {
      console.error('❌ [AuthContext] Logout error:', error);

      setUser(null);
      userRef.current = null;
      clearProfileCache();

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

      if (error instanceof Error &&
        (error.message?.includes('fetch') || error.message?.includes('network'))) {
        setIsOffline(true);
        toast({
          title: 'Connection Lost',
          description: 'Unable to refresh profile. You may be offline.',
          variant: 'destructive',
        });
      }
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
      isInitialized,
      isOffline,
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
        <>
          {/* Offline indicator */}
          {isOffline && (
            <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-500 text-white px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-2">
              <WifiOff className="h-4 w-4" />
              You are offline. Some features may be limited.
            </div>
          )}
          {children}
        </>
      )}
    </AuthContext.Provider>
  );
}