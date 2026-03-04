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
  assignedCountries?: string[];   // For desk-in-charge
  assignedDepartments?: string[]; // For desk-in-charge
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
  assignItems: (userId: string, countries: string[], departments: string[]) => void;
  removeAssignedItemFromAll: (name: string) => void;
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
    assignedCountries: ['Germany', 'France', 'Netherlands'],
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
    assignedCountries: ['Pakistan', 'India', 'Bangladesh'],
    isActive: true,
    createdAt: '2024-02-10',
    lastLogin: '2024-03-03',
  },
  // Real Jalsa Desk Incharges
  {
    id: 'di-001',
    name: 'Muhammad Anas Sahib',
    email: 'muhammad.jalsa@tabshir.org',
    password: 'Tabshir123',
    userType: 'desk-in-charge',
    phone: '+44 7340 822880',
    assignedCountries: [
      'Argentina', 'Bolivia', 'Cayman Islands', 'Chile', 'Colombia',
      'Comoros', 'Costa Rica', 'Dominican Republic', 'Guatemala', 'Honduras',
      'Marshall Islands', 'Mayotte', 'Paraguay', 'Peru', 'Spain', 'Uruguay',
    ],
    isActive: true,
    createdAt: '2024-01-01',
  },
  {
    id: 'di-002',
    name: 'Rana Mahmood Sahib',
    email: 'rana.jalsa@tabshir.org',
    password: 'Tabshir123',
    userType: 'desk-in-charge',
    phone: '+44 7555 951733',
    assignedCountries: [
      'Austria', 'Brazil', 'Burkina Faso', 'Chad', 'Equatorial Guinea',
      'France', 'French Guiana', 'Germany', 'Mali', 'Nepal',
      'New Zealand', 'Slovenia', 'United States of America', 'Zambia', 'Zimbabwe',
    ],
    isActive: true,
    createdAt: '2024-01-01',
  },
  {
    id: 'di-003',
    name: 'Tahir Khan Sahib',
    email: 'tahir.jalsa@tabshir.org',
    password: 'Tabshir123',
    userType: 'desk-in-charge',
    phone: '+44 7984 870097',
    assignedCountries: [
      'Albania', 'Bangladesh', 'Bosnia and Herzegovina', 'Burundi', 'Georgia',
      'Greece', 'Guadeloupe', 'Guinea-Bissau', 'Hungary', 'Jamaica',
      'Japan', 'Kiribati', 'Latvia', 'Malawi', 'Netherlands', 'Taiwan',
    ],
    isActive: true,
    createdAt: '2024-01-01',
  },
  {
    id: 'di-004',
    name: 'Saboor Ahmad Sahib',
    email: 'saboor.jalsa@tabshir.org',
    password: 'Tabshir123',
    userType: 'desk-in-charge',
    phone: '+44 7476 315122',
    assignedCountries: [
      'Canada', 'Finland', 'Indonesia', 'Ireland', 'Italy',
      'Lithuania', 'Madagascar', 'Malaysia', 'Niger', 'Norway',
      'Poland', 'Sri Lanka', 'Sweden', 'Togo', 'Turkey',
    ],
    isActive: true,
    createdAt: '2024-01-01',
  },
  {
    id: 'di-005',
    name: 'Taha Dawood Sahib',
    email: 'taha.jalsa@tabshir.org',
    password: 'Tabshir123',
    userType: 'desk-in-charge',
    phone: '+44 7392 340713',
    assignedCountries: [
      'Australia', 'Belgium', 'Belize', 'Congo', 'Denmark',
      'Haiti', 'Iceland', 'Lesotho', 'Palestine', 'Singapore',
      'Switzerland', 'Tanzania', 'Trinidad and Tobago', 'United Republic of Tanzania', 'Kosovo',
    ],
    isActive: true,
    createdAt: '2024-01-01',
  },
  {
    id: 'di-006',
    name: 'Afaq Mian Sahib',
    email: 'afaq.jalsa@tabshir.org',
    password: 'Tabshir123',
    userType: 'desk-in-charge',
    phone: '+44 7901 166797',
    assignedCountries: [
      'Afghanistan', 'Algeria', 'Egypt', 'Iran', 'Jordan',
      'Kazakhstan', 'Kuwait', 'Kyrgyzstan', 'Morocco', 'Qatar',
      'Russian Federation', 'Saudi Arabia', 'Syrian Arab Republic',
      'Tunisia', 'Turkmenistan', 'Uzbekistan', 'Sharjah', 'Abu Dhabi', 'Dubai',
    ],
    isActive: true,
    createdAt: '2024-01-01',
  },
  {
    id: 'di-007',
    name: 'Zishan Kahloon Sahib',
    email: 'zishan.jalsa@tabshir.org',
    password: 'Tabshir123',
    userType: 'desk-in-charge',
    phone: '+44 7875 482575',
    assignedCountries: [
      'Benin', 'Botswana', 'Cameroon', "Côte d'Ivoire", 'Gambia',
      'Ghana', 'Kenya', 'Liberia', 'Mauritius', 'Nigeria',
      'Rwanda', 'Senegal', 'Sierra Leone', 'South Africa', 'Tanzania',
      'United Republic of Tanzania', 'Uganda',
    ],
    isActive: true,
    createdAt: '2024-01-01',
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

  const assignItems = useCallback((userId: string, countries: string[], departments: string[]) => {
    setUsers(prev =>
      prev.map(u =>
        u.id === userId ? { ...u, assignedCountries: countries, assignedDepartments: departments } : u
      )
    );
  }, []);

  const removeAssignedItemFromAll = useCallback((name: string) => {
    setUsers(prev =>
      prev.map(u => ({
        ...u,
        assignedCountries: u.assignedCountries?.filter(c => c !== name),
        assignedDepartments: u.assignedDepartments?.filter(d => d !== name),
      }))
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
