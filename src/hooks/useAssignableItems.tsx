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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToGroup(row: any): AssignableItem {
  return {
    id: row.id,
    name: row.name,
    type: 'department',
    description: row.description ?? undefined,
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
  const [deptItems, setDeptItems] = useState<AssignableItem[]>([]);

  // Fetch countries and groups on mount
  useEffect(() => {
    supabase
      .from('countries')
      .select('*')
      .order('name')
      .then(({ data, error }) => {
        if (error) { console.error('useAssignableItems countries fetch:', error); return; }
        if (data) setCountryItems(data.map(rowToCountry));
      });

    supabase
      .from('departments')
      .select('*')
      .eq('type', 'group')
      .order('name')
      .then(({ data, error }) => {
        if (error) { console.error('useAssignableItems groups fetch:', error); return; }
        if (data) setDeptItems(data.map(rowToGroup));
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

    // Groups — stored in departments table with type = 'group'
    const { data, error } = await supabase
      .from('departments')
      .insert({ name: safeName, type: 'group', description: safeDesc ?? null, is_active: true })
      .select()
      .single();

    if (error) { return null; }
    const newItem = rowToGroup(data);
    setDeptItems(prev => [...prev, newItem].sort((a, b) => a.name.localeCompare(b.name)));
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
          ...(updates.continent !== undefined ? { continent: updates.continent } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      setCountryItems(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    } else {
      await supabase
        .from('departments')
        .update({
          ...(updates.name        !== undefined ? { name: updates.name }                   : {}),
          ...(updates.description !== undefined ? { description: updates.description ?? null } : {}),
          ...(updates.isActive    !== undefined ? { is_active: updates.isActive }           : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      setDeptItems(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
    }
  }, [countryItems]);

  const deleteItem = useCallback(async (id: string) => {
    const isCountry = countryItems.some(c => c.id === id);

    if (isCountry) {
      await supabase.from('countries').delete().eq('id', id);
      setCountryItems(prev => prev.filter(c => c.id !== id));
    } else {
      await supabase.from('departments').delete().eq('id', id);
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
      const dept = deptItems.find(d => d.id === id);
      if (!dept) return;
      await supabase
        .from('departments')
        .update({ is_active: !dept.isActive, updated_at: new Date().toISOString() })
        .eq('id', id);
      setDeptItems(prev =>
        prev.map(d => d.id === id ? { ...d, isActive: !d.isActive } : d)
      );
    }
  }, [countryItems, deptItems]);

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
