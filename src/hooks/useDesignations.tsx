import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import type { Designation } from '@/types';

interface DesignationsContextType {
  designations: Designation[];
  activeDesignations: string[];
  addDesignation: (name: string) => Promise<Designation | null>;
  updateDesignation: (id: string, updates: Partial<Designation>) => Promise<void>;
  deleteDesignation: (id: string) => Promise<void>;
  toggleDesignationStatus: (id: string) => Promise<void>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToDesignation(row: any): Designation {
  return {
    id: row.id,
    name: row.name,
    isActive: row.is_active ?? true,
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

const DesignationsContext = createContext<DesignationsContextType | undefined>(undefined);

export function DesignationsProvider({ children }: { children: ReactNode }) {
  const [designations, setDesignations] = useState<Designation[]>([]);

  useEffect(() => {
    supabase
      .from('designations')
      .select('*')
      .order('name')
      .then(({ data, error }) => {
        if (error) { console.error('useDesignations fetch:', error); return; }
        if (data) setDesignations(data.map(rowToDesignation));
      });
  }, []);

  const activeDesignations = designations
    .filter(d => d.isActive)
    .map(d => d.name)
    .sort();

  const addDesignation = useCallback(async (name: string): Promise<Designation | null> => {
    const { data, error } = await supabase
      .from('designations')
      .insert({ name: name.trim(), is_active: true })
      .select()
      .single();

    if (error) { toast.error('Failed to add designation'); return null; }
    const newDes = rowToDesignation(data);
    setDesignations(prev => [...prev, newDes]);
    return newDes;
  }, []);

  const updateDesignation = useCallback(async (id: string, updates: Partial<Designation>) => {
    const { error } = await supabase
      .from('designations')
      .update({
        ...(updates.name     !== undefined ? { name: updates.name }           : {}),
        ...(updates.isActive !== undefined ? { is_active: updates.isActive }  : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) { toast.error('Failed to update designation'); return; }
    setDesignations(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
  }, []);

  const deleteDesignation = useCallback(async (id: string) => {
    const { error } = await supabase.from('designations').delete().eq('id', id);
    if (error) { toast.error('Failed to delete designation'); return; }
    setDesignations(prev => prev.filter(d => d.id !== id));
  }, []);

  const toggleDesignationStatus = useCallback(async (id: string) => {
    const current = designations.find(d => d.id === id);
    if (!current) return;
    const { error } = await supabase
      .from('designations')
      .update({ is_active: !current.isActive, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) { toast.error('Failed to update designation status'); return; }
    setDesignations(prev =>
      prev.map(d => d.id === id ? { ...d, isActive: !d.isActive } : d)
    );
  }, [designations]);

  return (
    <DesignationsContext.Provider
      value={{
        designations,
        activeDesignations,
        addDesignation,
        updateDesignation,
        deleteDesignation,
        toggleDesignationStatus,
      }}
    >
      {children}
    </DesignationsContext.Provider>
  );
}

export function useDesignations() {
  const context = useContext(DesignationsContext);
  if (context === undefined) {
    throw new Error('useDesignations must be used within a DesignationsProvider');
  }
  return context;
}
