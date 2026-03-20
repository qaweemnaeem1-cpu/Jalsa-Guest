import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import type { User, UserRole } from '@/types';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  hasPermission: (requiredRoles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_KEY = 'jalsa_guest_uid';

const USER_COLUMNS = 'id, name, email, phone, role, country, country_code, assigned_countries, department, location, password_hash, is_active';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToUser(row: any): User {
  return {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    role: row.role as UserRole,
    country: row.country ?? undefined,
    countryCode: row.country_code ?? undefined,
    assignedCountries: Array.isArray(row.assigned_countries) ? row.assigned_countries : undefined,
    department: row.department ?? undefined,
    location: row.location ?? undefined,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session on mount — verify the saved user ID still exists in DB
  useEffect(() => {
    const savedId = localStorage.getItem(SESSION_KEY);
    if (!savedId) {
      setIsLoading(false);
      return;
    }
    supabase
      .from('users')
      .select('id, name, email, role, country, country_code, assigned_countries, department, location')
      .eq('id', savedId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!error && data) {
          setUser(rowToUser(data));
        } else {
          localStorage.removeItem(SESSION_KEY);
        }
        setIsLoading(false);
      });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    // Step 1: fetch user by email only
    const { data: row, error } = await supabase
      .from('users')
      .select(USER_COLUMNS)
      .eq('email', email)
      .maybeSingle();

    if (error) throw new Error('Login failed. Please try again.');
    if (!row) throw new Error('Invalid email or password');

    // Step 2: verify password in JavaScript
    if (row.password_hash !== password) throw new Error('Invalid email or password');

    // Step 3: check account is active
    if (row.is_active === false) throw new Error('Account is inactive. Contact your administrator.');

    // Step 4: store user — never include password_hash in state or localStorage
    const { password_hash: _ph, is_active: _ia, ...safeRow } = row;
    void _ph; void _ia;
    const u = rowToUser(safeRow);
    setUser(u);
    localStorage.setItem(SESSION_KEY, u.id);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
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
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
