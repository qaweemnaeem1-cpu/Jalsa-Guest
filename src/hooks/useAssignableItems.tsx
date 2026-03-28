import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { CONTINENT_ORDER } from '@/data/countries';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AssignableItem {
  id: string;
  name: string;
  type: 'country' | 'department';
  continent?: string;
  description?: string;
  isActive: boolean;
}

export { CONTINENT_ORDER };

// Strip HTML tags for security
function stripHtml(raw: string): string {
  return raw.replace(/<[^>]*>/g, '').trim();
}

// ── Static departments (not yet in a DB table) ─────────────────────────────────

const STATIC_DEPARTMENTS: AssignableItem[] = [
  { id: 'dept-001', name: 'MTA Africa',      type: 'department', description: 'Muslim Television Ahmadiyya - Africa',                  isActive: true },
  { id: 'dept-002', name: 'MTA Europe',      type: 'department', description: 'Muslim Television Ahmadiyya - Europe',                  isActive: true },
  { id: 'dept-003', name: 'MTA Asia',        type: 'department', description: 'Muslim Television Ahmadiyya - Asia',                    isActive: true },
  { id: 'dept-004', name: 'Humanity First',  type: 'department', description: 'International humanitarian relief organization',         isActive: true },
  { id: 'dept-005', name: 'IAAAE',           type: 'department', description: 'International Association of Ahmadi Architects and Engineers', isActive: true },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToCountry(row: any): AssignableItem {
  return {
    id: row.id,
    name: row.name,
    type: 'country',
    continent: row.continent ?? undefined,
    isActive: row.is_active ?? true,
  };
}

// ── Context ───────────────────────────────────────────────────────────────────

interface AssignableItemsContextType {
  items: AssignableItem[];
  countries: AssignableItem[];
  departments: AssignableItem[];
  addItem: (name: string, type: 'country' | 'department', description?: string) => Promise<AssignableItem | null>;
  updateItem: (id: string, updates: Partial<Omit<AssignableItem, 'id'>>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  toggleItemStatus: (id: string) => Promise<void>;
}

const AssignableItemsContext = createContext<AssignableItemsContextType | undefined>(undefined);

export function AssignableItemsProvider({ children }: { children: ReactNode }) {
  const [countryItems, setCountryItems] = useState<AssignableItem[]>([]);
  const [deptItems, setDeptItems] = useState<AssignableItem[]>(STATIC_DEPARTMENTS);

  // Fetch countries from Supabase on mount
  useEffect(() => {
    supabase
      .from('countries')
      .select('*')
      .order('name')
      .then(({ data, error }) => {
        if (error) { console.error('useAssignableItems countries fetch:', error); return; }
        if (data) setCountryItems(data.map(rowToCountry));
      });
  }, []);

  const items = [...countryItems, ...deptItems];
  const countries = countryItems;
  const departments = deptItems;

  const addItem = useCallback(async (
    name: string, type: 'country' | 'department', description?: string,
  ): Promise<AssignableItem | null> => {
    const safeName = stripHtml(name).slice(0, 100);
    const safeDesc = description ? stripHtml(description).slice(0, 500) : undefined;

    if (type === 'country') {
      const { data, error } = await supabase
        .from('countries')
        .insert({ name: safeName, is_active: true })
        .select()
        .single();

      if (error) { return null; }
      const newItem = rowToCountry(data);
      setCountryItems(prev => [...prev, newItem]);
      return newItem;
    }

    // Departments are local-only
    const newItem: AssignableItem = {
      id: `dept-${Date.now()}`,
      name: safeName,
      type,
      description: safeDesc,
      isActive: true,
    };
    setDeptItems(prev => [...prev, newItem]);
    return newItem;
  }, []);

  const updateItem = useCallback(async (
    id: string, updates: Partial<Omit<AssignableItem, 'id'>>,
  ) => {
    const isCountry = countryItems.some(c => c.id === id);

    if (isCountry) {
      await supabase
        .from('countries')
        .update({
          ...(updates.name     !== undefined ? { name: updates.name }          : {}),
          ...(updates.isActive !== undefined ? { is_active: updates.isActive } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      setCountryItems(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    } else {
      setDeptItems(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
    }
  }, [countryItems]);

  const deleteItem = useCallback(async (id: string) => {
    const isCountry = countryItems.some(c => c.id === id);

    if (isCountry) {
      await supabase.from('countries').delete().eq('id', id);
      setCountryItems(prev => prev.filter(c => c.id !== id));
    } else {
      setDeptItems(prev => prev.filter(d => d.id !== id));
    }
  }, [countryItems]);

  const toggleItemStatus = useCallback(async (id: string) => {
    const country = countryItems.find(c => c.id === id);
    if (country) {
      await supabase
        .from('countries')
        .update({ is_active: !country.isActive, updated_at: new Date().toISOString() })
        .eq('id', id);
      setCountryItems(prev =>
        prev.map(c => c.id === id ? { ...c, isActive: !c.isActive } : c)
      );
    } else {
      setDeptItems(prev =>
        prev.map(d => d.id === id ? { ...d, isActive: !d.isActive } : d)
      );
    }
  }, [countryItems]);

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
