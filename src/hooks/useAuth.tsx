import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import type { User, UserRole } from '@/types';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authError: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  hasPermission: (requiredRoles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_KEY = 'jalsa_guest_session';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Restore session from localStorage on mount (no DB call)
  useEffect(() => {
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) {
      try {
        setUser(JSON.parse(stored) as User);
      } catch {
        localStorage.removeItem(SESSION_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.rpc('verify_login', {
        user_email: email,
        user_password: password,
      });

      if (error) {
        setAuthError('Login failed. Please try again.');
        return false;
      }

      if (!data.success) {
        setAuthError(data.error);
        return false;
      }

      setUser(data.user);
      localStorage.setItem(SESSION_KEY, JSON.stringify(data.user));
      setAuthError(null);
      return true;
    } catch {
      setAuthError('Login failed. Please try again.');
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setAuthError(null);
    localStorage.removeItem(SESSION_KEY);
  }, []);

  const hasPermission = useCallback(
    (requiredRoles: UserRole[]) => {
      if (!user) return false;
      return requiredRoles.includes(user.role);
    },
    [user],
  );

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: !!user, isLoading, authError, login, logout, hasPermission }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
