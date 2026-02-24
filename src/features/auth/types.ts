import type { Profile, Company } from '@/types/database.types';

// User interface matches Profile structure from database
export interface User extends Profile {
    // Profile already has all the fields we need
}

export interface LoginResult {
    success: boolean;
    error?: 'invalid_credentials' | 'account_restricted' | 'company_inactive' | 'network_error';
}

export interface AuthContextType {
    user: User | null;
    impersonatedCompany: Company | null;
    login: (email: string, password: string) => Promise<LoginResult>;
    logout: () => Promise<void>;
    refreshProfile: () => Promise<void>;
    startImpersonation: (company: Company) => void;
    stopImpersonation: () => void;
    isAuthenticated: boolean;
    isLoading: boolean;
    isInitialized: boolean;
    isOffline: boolean;
}
