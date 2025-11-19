export type UserRole = 
  | 'system_admin'
  | 'super_admin'
  | 'admin'
  | 'manager'
  | 'team_leader'
  | 'mobile_sales';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  companyId: string | null;
  companyName: string | null;
}

export interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: boolean;
}
