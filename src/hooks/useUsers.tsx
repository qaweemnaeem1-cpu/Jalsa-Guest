import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export type UserType =
  | 'desk-in-charge'
  | 'coordinator'
  | 'driver'
  | 'nizamat-in-charge'
  | 'department-head'
  | 'location-manager';

export interface SystemUser {
  id: string;
  name: string;
  email: string;
  userType: UserType;
  country?: string;
  countryCode?: string;
  assignedCountries?: string[];
  assignedDepartments?: string[];
  department?: string;
  locations?: string[];
  location?: string;
  phone?: string;
  isActive: boolean;
  createdAt: string;
  lastLogin?: string;
}

// ── DB row → SystemUser ────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToUser(row: any): SystemUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    userType: row.role as UserType,
    country: row.country ?? undefined,
    assignedCountries: (row.assigned_countries as string[]) ?? undefined,
    department: row.department ?? undefined,
    location: row.location ?? undefined,
    phone: row.phone ?? undefined,
    isActive: row.is_active ?? true,
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

const USER_SELECT =
  'id, name, email, phone, role, country, assigned_countries, department, location, is_active, created_at';

interface UsersContextType {
  users: SystemUser[];
  activeUsers: SystemUser[];
  addUser: (userData: Partial<SystemUser> & { name: string; email: string; password: string; userType: UserType }) => Promise<SystemUser | null>;
  updateUser: (id: string, updates: Partial<SystemUser>) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  toggleUserStatus: (id: string) => Promise<void>;
  assignItems: (userId: string, countries: string[], departments: string[]) => Promise<void>;
  removeAssignedItemFromAll: (name: string) => void;
  getUsersByType: (userType: UserType) => SystemUser[];
  resetPassword: (id: string, newPassword: string) => void;
}

export const USER_TYPE_LABELS: Record<UserType, string> = {
  'desk-in-charge': 'Desk In-Charge',
  'coordinator': 'Coordinator',
  'driver': 'Driver',
  'nizamat-in-charge': 'Sub. Departmental Users',
  'department-head': 'Departmental Users',
  'location-manager': 'Location Manager',
};

const UsersContext = createContext<UsersContextType | undefined>(undefined);

export function UsersProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<SystemUser[]>([]);

  // Fetch all users on mount
  useEffect(() => {
    supabase
      .from('users')
      .select(USER_SELECT)
      .order('name')
      .then(({ data, error }) => {
        if (error) { console.error('useUsers fetch:', error); return; }
        if (data) setUsers(data.map(rowToUser));
      });
  }, []);

  const activeUsers = users.filter(u => u.isActive);

  const addUser = useCallback(async (
    userData: Partial<SystemUser> & { name: string; email: string; password: string; userType: UserType },
  ): Promise<SystemUser | null> => {
    const { data, error } = await supabase
      .from('users')
      .insert({
        name: userData.name,
        email: userData.email,
        password_hash: userData.password,
        phone: userData.phone ?? null,
        role: userData.userType,
        country: userData.country ?? null,
        assigned_countries: userData.assignedCountries ?? null,
        department: userData.department ?? null,
        location: userData.location ?? null,
        is_active: true,
      })
      .select(USER_SELECT)
      .single();

    if (error) { toast.error('Failed to add user'); return null; }
    const newUser = rowToUser(data);
    setUsers(prev => [...prev, newUser]);
    toast.success('User added successfully');
    return newUser;
  }, []);

  const updateUser = useCallback(async (id: string, updates: Partial<SystemUser>) => {
    const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.name         !== undefined) dbUpdates.name              = updates.name;
    if (updates.phone        !== undefined) dbUpdates.phone             = updates.phone ?? null;
    if (updates.isActive     !== undefined) dbUpdates.is_active         = updates.isActive;
    if (updates.country      !== undefined) dbUpdates.country           = updates.country ?? null;
    if (updates.department   !== undefined) dbUpdates.department        = updates.department ?? null;
    if (updates.location     !== undefined) dbUpdates.location          = updates.location ?? null;
    if (updates.assignedCountries !== undefined) dbUpdates.assigned_countries = updates.assignedCountries ?? null;

    const { data, error } = await supabase
      .from('users')
      .update(dbUpdates)
      .eq('id', id)
      .select(USER_SELECT)
      .single();

    if (error) { toast.error('Failed to update user'); return; }
    setUsers(prev => prev.map(u => u.id === id ? rowToUser(data) : u));
  }, []);

  const deleteUser = useCallback(async (id: string) => {
    const { error } = await supabase.from('users').delete().eq('id', id);
    if (error) { toast.error('Failed to remove user'); return; }
    setUsers(prev => prev.filter(u => u.id !== id));
    toast.success('User removed');
  }, []);

  const toggleUserStatus = useCallback(async (id: string) => {
    const current = users.find(u => u.id === id);
    if (!current) return;
    const { data, error } = await supabase
      .from('users')
      .update({ is_active: !current.isActive, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(USER_SELECT)
      .single();

    if (error) { toast.error('Failed to update user status'); return; }
    setUsers(prev => prev.map(u => u.id === id ? rowToUser(data) : u));
  }, [users]);

  const assignItems = useCallback(async (
    userId: string,
    countries: string[],
    _departments: string[],
  ) => {
    const { error } = await supabase
      .from('users')
      .update({ assigned_countries: countries, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) { toast.error('Failed to save country assignments'); return; }
    setUsers(prev =>
      prev.map(u => u.id === userId ? { ...u, assignedCountries: countries } : u)
    );
  }, []);

  const removeAssignedItemFromAll = useCallback((name: string) => {
    // Optimistic local remove; each DI's assigned_countries is updated lazily
    setUsers(prev =>
      prev.map(u => ({
        ...u,
        assignedCountries: u.assignedCountries?.filter(c => c !== name),
      }))
    );
  }, []);

  const getUsersByType = useCallback(
    (userType: UserType) => users.filter(u => u.userType === userType),
    [users],
  );

  // Password reset is handled server-side; not in scope here
  const resetPassword = useCallback((_id: string, _newPassword: string) => {
    toast.info('Password reset must be done via admin console');
  }, []);

  return (
    <UsersContext.Provider
      value={{
        users,
        activeUsers,
        addUser,
        updateUser,
        deleteUser,
        toggleUserStatus,
        assignItems,
        removeAssignedItemFromAll,
        getUsersByType,
        resetPassword,
      }}
    >
      {children}
    </UsersContext.Provider>
  );
}

export function useUsers() {
  const context = useContext(UsersContext);
  if (context === undefined) {
    throw new Error('useUsers must be used within a UsersProvider');
  }
  return context;
}
