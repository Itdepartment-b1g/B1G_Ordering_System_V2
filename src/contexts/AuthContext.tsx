import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, AuthContextType } from '@/types/auth';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Demo accounts with hardcoded credentials
const DEMO_ACCOUNTS: Array<User & { password: string }> = [
  {
    id: '1',
    email: 'sysadmin@b2b.com',
    password: 'admin123',
    name: 'System Administrator',
    role: 'system_admin',
    companyId: null,
    companyName: null,
  },
  {
    id: '2',
    email: 'superadmin@acme.com',
    password: 'super123',
    name: 'John Doe',
    role: 'super_admin',
    companyId: 'acme',
    companyName: 'ACME Corporation',
  },
  {
    id: '3',
    email: 'admin@acme.com',
    password: 'admin123',
    name: 'Jane Smith',
    role: 'admin',
    companyId: 'acme',
    companyName: 'ACME Corporation',
  },
  {
    id: '4',
    email: 'manager@acme.com',
    password: 'manager123',
    name: 'Bob Manager',
    role: 'manager',
    companyId: 'acme',
    companyName: 'ACME Corporation',
  },
  {
    id: '5',
    email: 'teamlead@acme.com',
    password: 'team123',
    name: 'Alice Leader',
    role: 'team_leader',
    companyId: 'acme',
    companyName: 'ACME Corporation',
  },
  {
    id: '6',
    email: 'sales@acme.com',
    password: 'sales123',
    name: 'Charlie Sales',
    role: 'mobile_sales',
    companyId: 'acme',
    companyName: 'ACME Corporation',
  },
];

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const savedUser = localStorage.getItem('demo_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    const account = DEMO_ACCOUNTS.find(
      acc => acc.email === email && acc.password === password
    );

    if (account) {
      const { password: _, ...userData } = account;
      setUser(userData);
      localStorage.setItem('demo_user', JSON.stringify(userData));
      return true;
    }

    return false;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('demo_user');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
