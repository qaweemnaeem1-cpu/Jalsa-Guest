import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export interface Coordinator {
  id: string;
  name: string;
  email: string;
  password: string;
  phone: string;
  country: string;
  assignedDeskInchargeId: string;
  assignedDeskInchargeName: string;
  isActive: boolean;
  createdAt: string;
}

// ── Mirrors desk incharge assignments from useUsers.tsx ───────────────────────

const DI_LIST: { id: string; name: string; countries: string[] }[] = [
  {
    id: 'di-001',
    name: 'Muhammad Anas Sahib',
    countries: [
      'Argentina', 'Bolivia', 'Cayman Islands', 'Chile', 'Colombia',
      'Comoros', 'Costa Rica', 'Dominican Republic', 'Guatemala', 'Honduras',
      'Marshall Islands', 'Mayotte', 'Paraguay', 'Peru', 'Spain', 'Uruguay',
    ],
  },
  {
    id: 'di-002',
    name: 'Rana Mahmood Sahib',
    countries: [
      'Austria', 'Brazil', 'Burkina Faso', 'Chad', 'Equatorial Guinea',
      'France', 'French Guiana', 'Germany', 'Mali', 'Nepal',
      'New Zealand', 'Slovenia', 'United States of America', 'Zambia', 'Zimbabwe',
    ],
  },
  {
    id: 'di-003',
    name: 'Tahir Khan Sahib',
    countries: [
      'Albania', 'Bangladesh', 'Bosnia and Herzegovina', 'Burundi', 'Georgia',
      'Greece', 'Guadeloupe', 'Guinea-Bissau', 'Hungary', 'Jamaica',
      'Japan', 'Kiribati', 'Latvia', 'Malawi', 'Netherlands', 'Taiwan',
    ],
  },
  {
    id: 'di-004',
    name: 'Saboor Ahmad Sahib',
    countries: [
      'Canada', 'Finland', 'Indonesia', 'Ireland', 'Italy',
      'Lithuania', 'Madagascar', 'Malaysia', 'Niger', 'Norway',
      'Poland', 'Sri Lanka', 'Sweden', 'Togo', 'Turkey',
    ],
  },
  {
    id: 'di-005',
    name: 'Taha Dawood Sahib',
    countries: [
      'Australia', 'Belgium', 'Belize', 'Congo', 'Denmark',
      'Haiti', 'Iceland', 'Lesotho', 'Palestine', 'Singapore',
      'Switzerland', 'Tanzania', 'Trinidad and Tobago', 'United Republic of Tanzania', 'Kosovo',
    ],
  },
  {
    id: 'di-006',
    name: 'Afaq Mian Sahib',
    countries: [
      'Afghanistan', 'Algeria', 'Egypt', 'Iran', 'Jordan',
      'Kazakhstan', 'Kuwait', 'Kyrgyzstan', 'Morocco', 'Qatar',
      'Russian Federation', 'Saudi Arabia', 'Syrian Arab Republic',
      'Tunisia', 'Turkmenistan', 'Uzbekistan', 'Sharjah', 'Abu Dhabi', 'Dubai',
    ],
  },
  {
    id: 'di-007',
    name: 'Zishan Kahloon Sahib',
    countries: [
      'Benin', 'Botswana', 'Cameroon', "Côte d'Ivoire", 'Gambia',
      'Ghana', 'Kenya', 'Liberia', 'Mauritius', 'Nigeria',
      'Rwanda', 'Senegal', 'Sierra Leone', 'South Africa', 'Tanzania',
      'United Republic of Tanzania', 'Uganda',
    ],
  },
];

// ── Country → email slug + password prefix ───────────────────────────────────

const SLUG_OVERRIDES: Record<string, string> = {
  'United States of America': 'usa',
  "Côte d'Ivoire": 'cotedivoire',
  'Bosnia and Herzegovina': 'bosnia',
  'Trinidad and Tobago': 'trinidadtobago',
  'Dominican Republic': 'dominicanrepublic',
  'Russian Federation': 'russia',
  'Syrian Arab Republic': 'syria',
  'United Republic of Tanzania': 'urt',
  'New Zealand': 'newzealand',
  'Sri Lanka': 'srilanka',
  'Saudi Arabia': 'saudiarabia',
  'South Africa': 'southafrica',
  'Cayman Islands': 'caymanislands',
  'Marshall Islands': 'marshallislands',
  'Costa Rica': 'costarica',
  'Guinea-Bissau': 'guineabissau',
  'French Guiana': 'frenchguiana',
  'Burkina Faso': 'burkinafaso',
  'Equatorial Guinea': 'equatorialguinea',
  'Abu Dhabi': 'abudhabi',
  'Sierra Leone': 'sierraleone',
};

const PWD_OVERRIDES: Record<string, string> = {
  'United States of America': 'USA',
  "Côte d'Ivoire": 'CoteDivoire',
  'Bosnia and Herzegovina': 'Bosnia',
  'Trinidad and Tobago': 'TrinidadTobago',
  'Dominican Republic': 'DominicanRepublic',
  'Russian Federation': 'Russia',
  'Syrian Arab Republic': 'Syria',
  'United Republic of Tanzania': 'URT',
  'New Zealand': 'NewZealand',
  'Sri Lanka': 'SriLanka',
  'Saudi Arabia': 'SaudiArabia',
  'South Africa': 'SouthAfrica',
  'Cayman Islands': 'CaymanIslands',
  'Marshall Islands': 'MarshallIslands',
  'Costa Rica': 'CostaRica',
  'Guinea-Bissau': 'GuineaBissau',
  'French Guiana': 'FrenchGuiana',
  'Burkina Faso': 'BurkinaFaso',
  'Equatorial Guinea': 'EquatorialGuinea',
  'Abu Dhabi': 'AbuDhabi',
  'Sierra Leone': 'SierraLeone',
};

function toSlug(country: string): string {
  if (SLUG_OVERRIDES[country]) return SLUG_OVERRIDES[country];
  // Lowercase, remove everything except a-z
  return country.toLowerCase().replace(/[^a-z]/g, '');
}

function toPwdPrefix(country: string): string {
  if (PWD_OVERRIDES[country]) return PWD_OVERRIDES[country];
  // Title-case each word, strip non-alphanumeric
  return country
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('')
    .replace(/[^a-zA-Z0-9]/g, '');
}

// ── Seed data generation ──────────────────────────────────────────────────────

function generateInitialCoordinators(): Coordinator[] {
  const seen = new Set<string>();
  const result: Coordinator[] = [];
  let phoneIdx = 1;

  for (const di of DI_LIST) {
    for (const country of di.countries) {
      if (seen.has(country)) continue; // first DI wins for duplicates
      seen.add(country);

      const slug = toSlug(country);
      const pwd = toPwdPrefix(country);

      result.push({
        id: `coord-${slug}`,
        name: `${country} Coordinator`,
        email: `${slug}.jalsa@tabshir.org`,
        password: `${pwd}123`,
        phone: `+00 0000 ${String(phoneIdx).padStart(6, '0')}`,
        country,
        assignedDeskInchargeId: di.id,
        assignedDeskInchargeName: di.name,
        isActive: true,
        createdAt: '2024-01-01',
      });
      phoneIdx++;
    }
  }

  // Sort alphabetically by country
  return result.sort((a, b) => a.country.localeCompare(b.country));
}

const INITIAL_COORDINATORS = generateInitialCoordinators();

// ── Context ───────────────────────────────────────────────────────────────────

interface CoordinatorsContextType {
  coordinators: Coordinator[];
  addCoordinator: (data: Omit<Coordinator, 'id' | 'createdAt'>) => Coordinator;
  updateCoordinator: (id: string, updates: Partial<Coordinator>) => void;
  deleteCoordinator: (id: string) => void;
  toggleCoordinatorActive: (id: string) => void;
}

const CoordinatorsContext = createContext<CoordinatorsContextType | undefined>(undefined);

export function CoordinatorsProvider({ children }: { children: ReactNode }) {
  const [coordinators, setCoordinators] = useState<Coordinator[]>(INITIAL_COORDINATORS);

  const addCoordinator = useCallback((data: Omit<Coordinator, 'id' | 'createdAt'>): Coordinator => {
    const newCoord: Coordinator = {
      ...data,
      id: `coord-${Date.now()}`,
      createdAt: new Date().toISOString().split('T')[0],
    };
    setCoordinators(prev =>
      [...prev, newCoord].sort((a, b) => a.country.localeCompare(b.country))
    );
    return newCoord;
  }, []);

  const updateCoordinator = useCallback((id: string, updates: Partial<Coordinator>) => {
    setCoordinators(prev =>
      prev.map(c => (c.id === id ? { ...c, ...updates } : c))
    );
  }, []);

  const deleteCoordinator = useCallback((id: string) => {
    setCoordinators(prev => prev.filter(c => c.id !== id));
  }, []);

  const toggleCoordinatorActive = useCallback((id: string) => {
    setCoordinators(prev =>
      prev.map(c => (c.id === id ? { ...c, isActive: !c.isActive } : c))
    );
  }, []);

  return (
    <CoordinatorsContext.Provider
      value={{ coordinators, addCoordinator, updateCoordinator, deleteCoordinator, toggleCoordinatorActive }}
    >
      {children}
    </CoordinatorsContext.Provider>
  );
}

export function useCoordinators() {
  const ctx = useContext(CoordinatorsContext);
  if (!ctx) throw new Error('useCoordinators must be used within CoordinatorsProvider');
  return ctx;
}
