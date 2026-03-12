import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export type UserType = 'desk-in-charge' | 'coordinator' | 'driver' | 'nizamat-in-charge' | 'department-head';

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
  department?: string;            // For department-head or nizamat-in-charge
  locations?: string[];           // For department-head
  location?: string;              // For nizamat-in-charge (single assigned location)
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

// Initial users — only real data
const INITIAL_USERS: SystemUser[] = [
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
  // Reserve 1 (R1) sub users
  { id: 'su-r1-1', name: 'Jamia Manager',      email: 'jamia.r1@tabshir.org',       password: 'Jamia123',      userType: 'nizamat-in-charge', department: 'Reserve 1 (R1)', location: 'Jamia',               phone: '+44 7000 100001', isActive: true, createdAt: '2024-01-01' },
  { id: 'su-r1-2', name: 'University Manager', email: 'university.r1@tabshir.org',  password: 'University123', userType: 'nizamat-in-charge', department: 'Reserve 1 (R1)', location: 'University',          phone: '+44 7000 100002', isActive: true, createdAt: '2024-01-01' },
  { id: 'su-r1-3', name: 'Hotels Manager',     email: 'hotels.r1@tabshir.org',      password: 'Hotels123',     userType: 'nizamat-in-charge', department: 'Reserve 1 (R1)', location: 'Hotels',              phone: '+44 7000 100003', isActive: true, createdAt: '2024-01-01' },
  // UK Jamaat sub users
  { id: 'su-ukj-1', name: 'Bait Ul Futuh Manager', email: 'baitulfutuh.ukj@tabshir.org', password: 'BaitUlFutuh123', userType: 'nizamat-in-charge', department: 'UK Jamaat', location: 'Bait Ul Futuh', phone: '+44 7000 200001', isActive: true, createdAt: '2024-01-01' },
  { id: 'su-ukj-2', name: 'Bait Ul Ehsan Manager', email: 'baitulehsan.ukj@tabshir.org', password: 'BaitUlEhsan123', userType: 'nizamat-in-charge', department: 'UK Jamaat', location: 'Bait Ul Ehsan', phone: '+44 7000 200002', isActive: true, createdAt: '2024-01-01' },
  // Central Guests sub users
  { id: 'su-cg-1', name: 'VIP Manager',               email: 'vip.central@tabshir.org',     password: 'VIP123',             userType: 'nizamat-in-charge', department: 'Central Guests', location: 'Bait Ul Futuh VIP',    phone: '+44 7000 300001', isActive: true, createdAt: '2024-01-01' },
  { id: 'su-cg-2', name: 'Islamabad Inside Manager',  email: 'inside.central@tabshir.org',  password: 'Inside123',          userType: 'nizamat-in-charge', department: 'Central Guests', location: 'Islamabad Inside',     phone: '+44 7000 300002', isActive: true, createdAt: '2024-01-01' },
  { id: 'su-cg-3', name: 'Islamabad Suburbs Manager', email: 'suburbs.central@tabshir.org', password: 'Suburbs123',         userType: 'nizamat-in-charge', department: 'Central Guests', location: 'Islamabad Suburbs',    phone: '+44 7000 300003', isActive: true, createdAt: '2024-01-01' },
  // Department heads
  {
    id: 'dh-001',
    name: 'R1 In-Charge',
    email: 'r1.jalsa@tabshir.org',
    password: 'R1Jalsa123',
    userType: 'department-head',
    phone: '+44 7000 000001',
    department: 'Reserve 1 (R1)',
    locations: ['Jamia', 'University', 'Hotels'],
    isActive: true,
    createdAt: '2024-01-01',
  },
  {
    id: 'dh-002',
    name: 'UK Jamaat In-Charge',
    email: 'ukjamaat.jalsa@tabshir.org',
    password: 'UKJamaat123',
    userType: 'department-head',
    phone: '+44 7000 000002',
    department: 'UK Jamaat',
    locations: ['Bait Ul Futuh', 'Bait Ul Ehsan'],
    isActive: true,
    createdAt: '2024-01-01',
  },
  {
    id: 'dh-003',
    name: 'Central Guests In-Charge',
    email: 'centralguests.jalsa@tabshir.org',
    password: 'CentralGuests123',
    userType: 'department-head',
    phone: '+44 7000 000003',
    department: 'Central Guests',
    locations: ['Bait Ul Futuh VIP', 'Islamabad Inside', 'Islamabad Suburbs'],
    isActive: true,
    createdAt: '2024-01-01',
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
  'nizamat-in-charge': 'Sub. Departmental Users',
  'department-head': 'Departmental Users',
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
