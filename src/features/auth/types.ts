import type { Profile } from '@/types/database.types';

// User interface matches Profile structure from database
export interface User extends Profile {
    // Profile already has all the fields we need
}

export interface LoginResult {
    success: boolean;
    error?: 'invalid_credentials' | 'account_restricted';
}

export interface AuthContextType {
    user: User | null;
    login: (email: string, password: string) => Promise<LoginResult>;
    logout: () => Promise<void>;
    isAuthenticated: boolean;
    isLoading: boolean;
}
