import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { User, UserRole } from '@/types';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (_email: string, _password: string, role: UserRole) => Promise<void>;
  logout: () => void;
  hasPermission: (requiredRoles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEMO_USERS: Record<UserRole, User> = {
  'super-admin': {
    id: '1',
    name: 'Ahmad Khan',
    email: 'admin@mehmaan.local',
    role: 'super-admin',
  },
  'desk-in-charge': {
    id: '2',
    name: 'Fatima Ali',
    email: 'desk.incharge@mehmaan.local',
    role: 'desk-in-charge',
  },
  'coordinator': {
    id: '3',
    name: 'Klaus Mueller',
    email: 'coordinator.de@external.local',
    role: 'coordinator',
    country: 'Germany',
    countryCode: 'DE',
  },
  'transport': {
    id: '4',
    name: 'Omar Hassan',
    email: 'transport@mehmaan.local',
    role: 'transport',
  },
  'accommodation': {
    id: '5',
    name: 'Aisha Rahman',
    email: 'accommodation@mehmaan.local',
    role: 'accommodation',
  },
  'viewer': {
    id: '6',
    name: 'Guest User',
    email: 'viewer@mehmaan.local',
    role: 'viewer',
  },
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  const login = useCallback(async (_email: string, _password: string, role: UserRole) => {
    await new Promise(resolve => setTimeout(resolve, 500));
    const demoUser = DEMO_USERS[role];
    if (demoUser) {
      setUser(demoUser);
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
  }, []);

  const hasPermission = useCallback((requiredRoles: UserRole[]) => {
    if (!user) return false;
    return requiredRoles.includes(user.role);
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        login,
        logout,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
