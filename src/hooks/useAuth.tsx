import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
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
  updateUser: (updates: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_KEY = 'jalsa_guest_session';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const checkedRef = useRef(false);

  // Restore session from sessionStorage on mount — each tab has its own session
  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) {
      try {
        setUser(JSON.parse(stored) as User);
      } catch {
        sessionStorage.removeItem(SESSION_KEY);
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

      // Normalize snake_case DB fields → camelCase User interface
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = data.user as any;
      const normalizedUser: User = {
        id: String(raw.id),
        name: raw.name,
        email: raw.email,
        role: raw.role as UserRole,
        country: raw.country ?? undefined,
        countryCode: raw.country_code ?? raw.countryCode ?? undefined,
        assignedCountries: Array.isArray(raw.assigned_countries)
          ? raw.assigned_countries
          : Array.isArray(raw.assignedCountries)
            ? raw.assignedCountries
            : undefined,
        department: raw.department ?? undefined,
        location: raw.location ?? undefined,
        // Driver fields
        vehicleType: raw.vehicle_type ?? raw.vehicleType ?? undefined,
        vehicleModel: raw.vehicle_model ?? raw.vehicleModel ?? undefined,
        vehicleRegistration: raw.vehicle_registration ?? raw.vehicleRegistration ?? undefined,
        vehicleCapacity: raw.vehicle_capacity ?? raw.vehicleCapacity ?? undefined,
        isHeadDriver: raw.is_head_driver ?? raw.isHeadDriver ?? undefined,
        isAvailable: raw.is_available ?? raw.isAvailable ?? undefined,
      };

      console.log('[auth] Logged in user:', JSON.stringify(normalizedUser));

      setUser(normalizedUser);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(normalizedUser));
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
    sessionStorage.removeItem(SESSION_KEY);
  }, []);

  const updateUser = useCallback((updates: Partial<User>) => {
    setUser(prev => {
      if (!prev) return prev;
      const updated = { ...prev, ...updates };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(updated));
      return updated;
    });
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
      value={{ user, isAuthenticated: !!user, isLoading, authError, login, logout, hasPermission, updateUser }}
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
