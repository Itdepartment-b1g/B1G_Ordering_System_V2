import { useState, useEffect, ReactNode, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { subscribeToTable, unsubscribe } from '@/lib/realtime.helpers';
import { isNetworkError, withTimeout } from '@/lib/networkUtils';
import { getCachedProfile, setCachedProfile, isCacheStale, clearProfileCache } from '@/lib/profileCache';
import { AuthContext } from './hooks';
import type { User, LoginResult } from './types';
import type { Company } from '@/types/database.types';
import { Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [impersonatedCompany, setImpersonatedCompany] = useState<Company | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const qc = useQueryClient();
  const companyChannelRef = useRef<any>(null);
  const profileChannelRef = useRef<any>(null);
  const userRef = useRef<User | null>(null);
  const profileRetryRef = useRef<Record<string, number>>({});

  // Handle global read-only mode for impersonation
  useEffect(() => {
    if (impersonatedCompany) {
      document.body.classList.add('read-only-mode');
    } else {
      document.body.classList.remove('read-only-mode');
    }
  }, [impersonatedCompany]);

  // Load impersonation from sessionStorage on mount
  useEffect(() => {
    const savedImpersonation = sessionStorage.getItem('impersonated_company');
    if (savedImpersonation) {
      try {
        setImpersonatedCompany(JSON.parse(savedImpersonation));
      } catch (e) {
        console.error('Failed to parse saved impersonation', e);
      }
    }
  }, []);

  // Initialize auth: Check for existing session with instant cache load
  useEffect(() => {
    let mounted = true;

    // INSTANT LOAD: Try cached profile first for zero-delay UI
    const cachedProfile = getCachedProfile();
    if (cachedProfile) {
      console.log('⚡ [AuthContext] Instant load from cache:', cachedProfile.id);
      setUser(cachedProfile);
      userRef.current = cachedProfile;
      setIsLoading(false); // Show UI immediately
    }

    // Check for existing session on mount
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;

      console.log('🔐 [AuthContext] Initial getSession result:', session ? `user ${session.user.id}` : 'no session');
      
      if (session?.user) {
        // If we have cached profile and it matches, refresh in background
        if (cachedProfile && cachedProfile.id === session.user.id && !isCacheStale()) {
          console.log('🔄 [AuthContext] Cache is fresh, refreshing in background');
          // Refresh in background without blocking UI
          loadUserProfile(session.user).catch(err => {
            console.warn('⚠️ [AuthContext] Background refresh failed:', err);
            // Keep using cached profile
          });
        } else {
          // No cache or stale cache - load profile (will update UI when done)
          await loadUserProfile(session.user);
        }
      } else {
        // No session - check cache one more time, then show login
        if (!cachedProfile) {
          // No cache and no session - safe to show login page immediately
          setIsLoading(false);
        } else {
          // We have cache but no session - clear cache and show login
          console.warn('⚠️ [AuthContext] Session expired, clearing cache');
          setUser(null);
          userRef.current = null;
          setIsLoading(false);
        }
      }
    }).catch((error) => {
      console.error('❌ [AuthContext] getSession failed on mount:', error);
      if (mounted) {
        // On error, if we have cache, keep using it
        if (cachedProfile) {
          console.log('✅ [AuthContext] Using cache after getSession error');
          // Cache already loaded above, just ensure loading is false
          setIsLoading(false);
        } else {
          setIsLoading(false);
        }
      }
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      
      console.log(`🔔 [AuthContext] Auth event: ${event}`, session ? `User: ${session.user.id}` : 'No session');

      if (session?.user) {
        // Ensure role/location dependent caches don't persist across auth changes.
        // (e.g. warehouse main vs sub membership, inventory source selection)
        if (event === 'SIGNED_IN' || !userRef.current || userRef.current.id !== session.user.id) {
          await qc.invalidateQueries({ queryKey: ['warehouse-location-membership'] });
          await qc.invalidateQueries({ queryKey: ['inventory'] });
        }

        // Only load profile for SIGNED_IN events or when user changes
        // Skip TOKEN_REFRESHED and other events if we already have the same user loaded
        if (event === 'SIGNED_IN' || !userRef.current || userRef.current.id !== session.user.id) {
          await loadUserProfile(session.user);
        } else {
          // User already loaded, just ensure loading is false (in case of tab switch)
          console.log('✅ [AuthContext] User already loaded, skipping profile reload');
          if (isLoading) {
            setIsLoading(false);
          }
        }
      } else if (event === 'SIGNED_OUT') {
        // Clear user on explicit sign out
        setUser(null);
        userRef.current = null;
        setIsLoading(false);
        clearProfileCache();
        await qc.invalidateQueries({ queryKey: ['warehouse-location-membership'] });
        await qc.invalidateQueries({ queryKey: ['inventory'] });
        
        // Clean up real-time subscriptions
        if (companyChannelRef.current) {
          unsubscribe(companyChannelRef.current);
          companyChannelRef.current = null;
        }
        if (profileChannelRef.current) {
          unsubscribe(profileChannelRef.current);
          profileChannelRef.current = null;
        }
      } else if (event === 'TOKEN_REFRESHED') {
        // On token refresh, verify session is still valid but don't reload profile
        // If we already have a user, keep them and just ensure loading is false
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (!currentSession) {
          setUser(null);
          userRef.current = null;
          setIsLoading(false);
        } else if (userRef.current) {
          // User already loaded, just ensure loading is false
          setIsLoading(false);
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
      if (companyChannelRef.current) {
        unsubscribe(companyChannelRef.current);
      }
      if (profileChannelRef.current) {
        unsubscribe(profileChannelRef.current);
      }
    };
  }, []); // Empty deps - only run on mount

  // Real-time subscription for profile status changes
  useEffect(() => {
    if (!user?.id) {
      if (profileChannelRef.current) {
        unsubscribe(profileChannelRef.current);
        profileChannelRef.current = null;
      }
              return;
            }

    // Subscribe to profile updates
    const profileChannel = subscribeToTable('profiles', (payload: any) => {
      if (payload.new && payload.new.id === user.id) {
        console.log('Profile updated:', payload);
        
        // Check if status changed to inactive
        if (payload.new.status === 'inactive') {
          console.log('⚠️ Your account has been set to inactive. Logging out...');
          logout();
        } else {
          // Update user profile if other fields changed
          setUser((prev) => prev ? { ...prev, ...payload.new } : null);
        }
      }
    }, '*', { column: 'id', value: user.id });

    profileChannelRef.current = profileChannel;

    return () => {
      if (profileChannelRef.current) {
        unsubscribe(profileChannelRef.current);
        profileChannelRef.current = null;
      }
    };
  }, [user?.id]);

  // Real-time subscription for company status changes
  useEffect(() => {
    if (!user?.company_id || user.role === 'system_administrator') {
      if (companyChannelRef.current) {
        unsubscribe(companyChannelRef.current);
        companyChannelRef.current = null;
        }
        return;
      }

    // Subscribe to company status updates
    const companyChannel = subscribeToTable('companies', (payload: any) => {
      if (payload.new && payload.new.id === user.company_id) {
        console.log('Company status updated:', payload);
        
        if (payload.new.status === 'inactive') {
          console.warn('❌ Company is inactive, logging out');
          logout();
          toast({
            title: "Access Denied",
            description: "Your company account has been deactivated. Please contact your system administrator.",
            variant: "destructive",
          });
        }
      }
    }, '*', { column: 'id', value: user.company_id });

    companyChannelRef.current = companyChannel;

    return () => {
      if (companyChannelRef.current) {
        unsubscribe(companyChannelRef.current);
        companyChannelRef.current = null;
      }
    };
  }, [user?.company_id, user?.role]);

  const loadUserProfile = async (authUser: any): Promise<void> => {
    try {
      console.log('👤 [AuthContext] Loading user profile for', authUser.id);
      
      // If we already have this user loaded, skip the fetch but ensure loading is false
      if (userRef.current?.id === authUser.id) {
        console.log('✅ [AuthContext] User already in memory, skipping fetch');
        // Don't set loading to false here - it should already be false
        // But ensure user state is set (in case of race condition)
        if (!user) {
          setUser(userRef.current);
        }
        return;
      }

      // Set loading to true only if we're actually going to fetch
      setIsLoading(true);

      // Run profile query with a safety timeout so we never hang forever
      // Keep this long enough to survive cold starts / slow first request.
      const profilePromise = supabase
        .from('profiles')
        .select(`
          id, email, full_name, role, status, company_id, phone, region, city, address, country, avatar_url, created_at, updated_at,
          companies (status)
        `)
        .eq('id', authUser.id)
        .maybeSingle();

      const { data: profileData, error } = await withTimeout(
        profilePromise as unknown as Promise<{ data: any; error: any }>,
        15000,
        '[AuthContext] Profile fetch timed out'
      );

      if (error) {
        console.error('⚠️ [AuthContext] Profile fetch failed:', error);

        // Fallback: if we at least have the auth user, create a minimal profile
        const metadata = authUser.user_metadata || {};
          const basicUser: User = {
          id: authUser.id,
          email: authUser.email || '',
          full_name: metadata.full_name || metadata.name || 'User',
          role: metadata.role || 'mobile_sales',
            status: 'active',
          company_id: metadata.company_id,
          phone: metadata.phone,
          region: metadata.region,
          city: metadata.city,
          address: metadata.address,
          country: metadata.country,
          avatar_url: metadata.avatar_url,
          created_at: authUser.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
        } as User;

        console.warn('⚠️ [AuthContext] Using basic auth user as fallback profile');
          setUser(basicUser);
          userRef.current = basicUser;
        setCachedProfile(basicUser); // Cache fallback too
        setIsLoading(false);
        return;
      }

      if (!profileData) {
        console.warn('⚠️ [AuthContext] Profile not found');
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
        toast({ 
          title: "Access Denied", 
          description: "Your account is not active.", 
          variant: "destructive" 
        });
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
          toast({ 
            title: "Access Denied", 
            description: "Company account deactivated.", 
            variant: "destructive" 
          });
          return;
        }
      }

      // Valid profile - update state and cache
      const { companies, ...profile } = profileData;
      const updatedUser = profile as User;

      console.log('✅ [AuthContext] Profile loaded for', updatedUser.id, 'role', updatedUser.role);
      setUser(updatedUser);
      userRef.current = updatedUser;
      setCachedProfile(updatedUser); // Cache for next time
      setIsLoading(false);
    } catch (error) {
      console.error('❌ [AuthContext] Profile fetch exception:', error);

      // If auth succeeded but profile fetch is slow/flaky, don't treat it as a login failure.
      // Fall back to basic auth user (like the non-timeout error path) and retry in background.
      const err = error as any;
      if (isNetworkError(err) || String(err?.message || '').toLowerCase().includes('timed out')) {
        const metadata = authUser?.user_metadata || {};
        const basicUser: User = {
          id: authUser.id,
          email: authUser.email || '',
          full_name: metadata.full_name || metadata.name || 'User',
          role: metadata.role || 'mobile_sales',
          status: 'active',
          company_id: metadata.company_id,
          phone: metadata.phone,
          region: metadata.region,
          city: metadata.city,
          address: metadata.address,
          country: metadata.country,
          avatar_url: metadata.avatar_url,
          created_at: authUser.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as User;

        setUser(basicUser);
        userRef.current = basicUser;
        setCachedProfile(basicUser);

        const key = String(authUser?.id || '');
        const attempts = (profileRetryRef.current[key] ?? 0) + 1;
        profileRetryRef.current[key] = attempts;
        if (key && attempts <= 2) {
          const delayMs = attempts === 1 ? 2000 : 5000;
          setTimeout(() => {
            void loadUserProfile(authUser);
          }, delayMs);
        }
      }

      setIsLoading(false);
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
          setIsLoading(false);
          return { success: false, error: 'invalid_credentials' };
        }

        if (profile) {
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

      // Profile will be loaded by onAuthStateChange handler
      return { success: true };
    } catch (error) {
      console.error('Login exception:', error);
      setIsLoading(false);
      return { success: false, error: 'invalid_credentials' };
    }
  };

  const logout = async () => {
    try {
      // Clean up real-time subscriptions
      if (companyChannelRef.current) {
        unsubscribe(companyChannelRef.current);
        companyChannelRef.current = null;
      }
      if (profileChannelRef.current) {
        unsubscribe(profileChannelRef.current);
        profileChannelRef.current = null;
      }

      setUser(null);
      userRef.current = null;
      setIsLoading(false);
      setImpersonatedCompany(null);
      sessionStorage.removeItem('impersonated_company');
      clearProfileCache(); // Clear cached profile on logout

      await supabase.auth.signOut();

      // Hard-clear any persisted auth token in case the client library leaves it behind
      try {
        window.localStorage.removeItem('supabase.auth.token');
      } catch (e) {
        console.warn('Unable to clear supabase.auth.token from localStorage:', e);
      }

      window.location.href = '/login';
    } catch (error) {
      console.error('❌ [AuthContext] Logout error:', error);
      setUser(null);
      userRef.current = null;
      setIsLoading(false);
      window.location.href = '/login';
    }
  };

  const startImpersonation = (company: Company) => {
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
        await loadUserProfile(session.user);
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
      isInitialized: !isLoading, // Backward compatibility
      isOffline: false,
    } as any}>
          {children}
    </AuthContext.Provider>
  );
}
