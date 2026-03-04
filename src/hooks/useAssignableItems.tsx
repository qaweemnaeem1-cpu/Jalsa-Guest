import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { ALL_COUNTRIES, CONTINENT_ORDER } from '@/data/countries';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AssignableItem {
  id: string;
  name: string;
  type: 'country' | 'department';
  continent?: string;   // present for countries
  description?: string; // present for departments
  isActive: boolean;
}

export { CONTINENT_ORDER };

// Strip HTML tags for security
function stripHtml(raw: string): string {
  return raw.replace(/<[^>]*>/g, '').trim();
}

// ── Seed data ─────────────────────────────────────────────────────────────────

const INITIAL_DEPARTMENTS: AssignableItem[] = [
  { id: 'dept-001', name: 'MTA Africa',      type: 'department', description: 'Muslim Television Ahmadiyya - Africa',                                       isActive: true },
  { id: 'dept-002', name: 'MTA Europe',      type: 'department', description: 'Muslim Television Ahmadiyya - Europe',                                       isActive: true },
  { id: 'dept-003', name: 'MTA Asia',        type: 'department', description: 'Muslim Television Ahmadiyya - Asia',                                         isActive: true },
  { id: 'dept-004', name: 'Humanity First',  type: 'department', description: 'International humanitarian relief organization',                              isActive: true },
  { id: 'dept-005', name: 'IAAAE',           type: 'department', description: 'International Association of Ahmadi Architects and Engineers',                isActive: true },
];

// De-duplicate ALL_COUNTRIES by name (Tanzania appears twice)
const _seen = new Set<string>();
const INITIAL_COUNTRIES: AssignableItem[] = ALL_COUNTRIES
  .filter(c => {
    if (_seen.has(c.name)) return false;
    _seen.add(c.name);
    return true;
  })
  .map((c, i) => ({
    id: `country-${i}-${c.code}`,
    name: c.name,
    type: 'country' as const,
    continent: c.continent,
    isActive: true,
  }));

const INITIAL_ITEMS: AssignableItem[] = [...INITIAL_COUNTRIES, ...INITIAL_DEPARTMENTS];

// ── Context ───────────────────────────────────────────────────────────────────

interface AssignableItemsContextType {
  items: AssignableItem[];
  countries: AssignableItem[];
  departments: AssignableItem[];
  addItem: (name: string, type: 'country' | 'department', description?: string) => AssignableItem;
  updateItem: (id: string, updates: Partial<Omit<AssignableItem, 'id'>>) => void;
  deleteItem: (id: string) => void;
  toggleItemStatus: (id: string) => void;
}

const AssignableItemsContext = createContext<AssignableItemsContextType | undefined>(undefined);

export function AssignableItemsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<AssignableItem[]>(INITIAL_ITEMS);

  const countries = items.filter(i => i.type === 'country');
  const departments = items.filter(i => i.type === 'department');

  const addItem = useCallback(
    (name: string, type: 'country' | 'department', description?: string): AssignableItem => {
      const safeName = stripHtml(name).slice(0, 100);
      const safeDesc = description ? stripHtml(description).slice(0, 500) : undefined;
      const newItem: AssignableItem = {
        id: `item-${Date.now()}`,
        name: safeName,
        type,
        description: safeDesc,
        isActive: true,
      };
      setItems(prev => [...prev, newItem]);
      return newItem;
    },
    []
  );

  const updateItem = useCallback(
    (id: string, updates: Partial<Omit<AssignableItem, 'id'>>) => {
      setItems(prev =>
        prev.map(item => (item.id === id ? { ...item, ...updates } : item))
      );
    },
    []
  );

  const deleteItem = useCallback((id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  const toggleItemStatus = useCallback((id: string) => {
    setItems(prev =>
      prev.map(item => (item.id === id ? { ...item, isActive: !item.isActive } : item))
    );
  }, []);

  return (
    <AssignableItemsContext.Provider
      value={{ items, countries, departments, addItem, updateItem, deleteItem, toggleItemStatus }}
    >
      {children}
    </AssignableItemsContext.Provider>
  );
}

export function useAssignableItems() {
  const context = useContext(AssignableItemsContext);
  if (context === undefined) {
    throw new Error('useAssignableItems must be used within an AssignableItemsProvider');
  }
  return context;
}
