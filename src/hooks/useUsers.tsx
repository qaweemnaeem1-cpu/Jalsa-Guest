import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export type UserType = 'desk-in-charge' | 'coordinator' | 'driver' | 'nizamat-in-charge';

export interface SystemUser {
  id: string;
  name: string;
  email: string;
  password: string;
  userType: UserType;
  country?: string;
  countryCode?: string;
  assignedCountries?: string[]; // For desk-in-charge
  phone?: string;
  isActive: boolean;
  createdAt: string;
  lastLogin?: string;
}

interface UsersContextType {
  users: SystemUser[];
  activeUsers: SystemUser[];
  addUser: (userData: Omit<SystemUser, 'id' | 'createdAt'>) => SystemUser;
  updateUser: (id: string, updates: Partial<SystemUser>) => void;
  deleteUser: (id: string) => void;
  toggleUserStatus: (id: string) => void;
  assignCountries: (userId: string, countries: string[]) => void;
  getUsersByType: (userType: UserType) => SystemUser[];
  resetPassword: (id: string, newPassword: string) => void;
}

const UsersContext = createContext<UsersContextType | undefined>(undefined);

// Initial demo users
const INITIAL_USERS: SystemUser[] = [
  {
    id: 'u1',
    name: 'Fatima Ali',
    email: 'fatima.ali@mehmaan.local',
    password: 'Desk@2024',
    userType: 'desk-in-charge',
    phone: '+44 7700 900001',
    assignedCountries: ['DE', 'FR', 'NL'],
    isActive: true,
    createdAt: '2024-01-01',
    lastLogin: '2024-03-01',
  },
  {
    id: 'u2',
    name: 'Klaus Mueller',
    email: 'klaus.mueller@external.local',
    password: 'Coord@2024',
    userType: 'coordinator',
    country: 'Germany',
    countryCode: 'DE',
    phone: '+49 170 1234567',
    isActive: true,
    createdAt: '2024-01-05',
    lastLogin: '2024-03-02',
  },
  {
    id: 'u3',
    name: 'Ahmed Hassan',
    email: 'ahmed.hassan@external.local',
    password: 'Coord@2024',
    userType: 'coordinator',
    country: 'Pakistan',
    countryCode: 'PK',
    phone: '+92 300 1234567',
    isActive: true,
    createdAt: '2024-01-10',
    lastLogin: '2024-02-28',
  },
  {
    id: 'u4',
    name: 'Omar Hassan',
    email: 'omar.hassan@mehmaan.local',
    password: 'Driver@2024',
    userType: 'driver',
    phone: '+44 7700 900002',
    isActive: true,
    createdAt: '2024-01-15',
    lastLogin: '2024-03-01',
  },
  {
    id: 'u5',
    name: 'Yusuf Khan',
    email: 'yusuf.khan@mehmaan.local',
    password: 'Nizamat@2024',
    userType: 'nizamat-in-charge',
    phone: '+44 7700 900003',
    isActive: true,
    createdAt: '2024-01-20',
    lastLogin: '2024-03-02',
  },
  {
    id: 'u6',
    name: 'Inactive User',
    email: 'inactive@mehmaan.local',
    password: 'Inactive@2024',
    userType: 'coordinator',
    country: 'India',
    countryCode: 'IN',
    phone: '+91 98765 43210',
    isActive: false,
    createdAt: '2024-02-01',
    lastLogin: undefined,
  },
  {
    id: 'u7',
    name: 'Sarah Johnson',
    email: 'sarah.johnson@mehmaan.local',
    password: 'Desk@2024',
    userType: 'desk-in-charge',
    phone: '+44 7700 900004',
    assignedCountries: ['PK', 'IN', 'BD'],
    isActive: true,
    createdAt: '2024-02-10',
    lastLogin: '2024-03-03',
  },
];

export const USER_TYPE_LABELS: Record<UserType, string> = {
  'desk-in-charge': 'Desk In-Charge',
  'coordinator': 'Coordinator',
  'driver': 'Driver',
  'nizamat-in-charge': 'Nizamat In-Charge',
};

export function UsersProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<SystemUser[]>(INITIAL_USERS);

  const activeUsers = users.filter(u => u.isActive);

  const addUser = useCallback((userData: Omit<SystemUser, 'id' | 'createdAt'>) => {
    const newUser: SystemUser = {
      ...userData,
      id: `u${Date.now()}`,
      createdAt: new Date().toISOString().split('T')[0],
    };
    setUsers(prev => [...prev, newUser]);
    return newUser;
  }, []);

  const updateUser = useCallback((id: string, updates: Partial<SystemUser>) => {
    setUsers(prev =>
      prev.map(u =>
        u.id === id ? { ...u, ...updates } : u
      )
    );
  }, []);

  const deleteUser = useCallback((id: string) => {
    setUsers(prev => prev.filter(u => u.id !== id));
  }, []);

  const toggleUserStatus = useCallback((id: string) => {
    setUsers(prev =>
      prev.map(u =>
        u.id === id ? { ...u, isActive: !u.isActive } : u
      )
    );
  }, []);

  const assignCountries = useCallback((userId: string, countries: string[]) => {
    setUsers(prev =>
      prev.map(u =>
        u.id === userId ? { ...u, assignedCountries: countries } : u
      )
    );
  }, []);

  const getUsersByType = useCallback((userType: UserType) => {
    return users.filter(u => u.userType === userType);
  }, [users]);

  const resetPassword = useCallback((id: string, newPassword: string) => {
    setUsers(prev =>
      prev.map(u =>
        u.id === id ? { ...u, password: newPassword } : u
      )
    );
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
        assignCountries,
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
