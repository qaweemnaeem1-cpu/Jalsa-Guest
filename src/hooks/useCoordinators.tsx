import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export interface Coordinator {
  id: string;
  name: string;
  email: string;
  phone: string;
  country: string;
  /** Not stored in DB — populated from UI when assigning */
  assignedDeskInchargeId: string;
  assignedDeskInchargeName: string;
  isActive: boolean;
  createdAt: string;
}

const COORD_SELECT =
  'id, name, email, phone, country, is_active, created_at';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToCoordinator(row: any): Coordinator {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone ?? '',
    country: row.country ?? '',
    assignedDeskInchargeId: '',
    assignedDeskInchargeName: '',
    isActive: row.is_active ?? true,
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

interface CoordinatorsContextType {
  coordinators: Coordinator[];
  addCoordinator: (data: Omit<Coordinator, 'id' | 'createdAt'> & { password: string }) => Promise<Coordinator | null>;
  updateCoordinator: (id: string, updates: Partial<Coordinator>) => Promise<void>;
  deleteCoordinator: (id: string) => Promise<void>;
  toggleCoordinatorActive: (id: string) => Promise<void>;
}

const CoordinatorsContext = createContext<CoordinatorsContextType | undefined>(undefined);

export function CoordinatorsProvider({ children }: { children: ReactNode }) {
  const [coordinators, setCoordinators] = useState<Coordinator[]>([]);

  // Fetch all coordinators on mount
  useEffect(() => {
    supabase
      .from('users')
      .select(COORD_SELECT)
      .eq('role', 'coordinator')
      .order('country')
      .then(({ data, error }) => {
        if (error) { console.error('useCoordinators fetch:', error); return; }
        if (data) setCoordinators(data.map(rowToCoordinator));
      });
  }, []);

  const addCoordinator = useCallback(async (
    data: Omit<Coordinator, 'id' | 'createdAt'> & { password: string },
  ): Promise<Coordinator | null> => {
    const { data: row, error } = await supabase
      .from('users')
      .insert({
        name: data.name,
        email: data.email,
        password_hash: data.password,
        phone: data.phone || null,
        role: 'coordinator',
        country: data.country || null,
        is_active: true,
      })
      .select(COORD_SELECT)
      .single();

    if (error) { toast.error('Failed to add coordinator'); return null; }
    const newCoord = rowToCoordinator(row);
    setCoordinators(prev =>
      [...prev, newCoord].sort((a, b) => a.country.localeCompare(b.country))
    );
    return newCoord;
  }, []);

  const updateCoordinator = useCallback(async (id: string, updates: Partial<Coordinator>) => {
    const { error } = await supabase
      .from('users')
      .update({
        ...(updates.name     !== undefined ? { name: updates.name }           : {}),
        ...(updates.phone    !== undefined ? { phone: updates.phone || null } : {}),
        ...(updates.country  !== undefined ? { country: updates.country }     : {}),
        ...(updates.isActive !== undefined ? { is_active: updates.isActive }  : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) { toast.error('Failed to update coordinator'); return; }
    setCoordinators(prev =>
      prev.map(c => c.id === id ? { ...c, ...updates } : c)
    );
  }, []);

  const deleteCoordinator = useCallback(async (id: string) => {
    const { error } = await supabase.from('users').delete().eq('id', id);
    if (error) { toast.error('Failed to remove coordinator'); return; }
    setCoordinators(prev => prev.filter(c => c.id !== id));
    toast.success('User removed');
  }, []);

  const toggleCoordinatorActive = useCallback(async (id: string) => {
    const current = coordinators.find(c => c.id === id);
    if (!current) return;
    const { error } = await supabase
      .from('users')
      .update({ is_active: !current.isActive, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) { toast.error('Failed to update coordinator status'); return; }
    setCoordinators(prev =>
      prev.map(c => c.id === id ? { ...c, isActive: !c.isActive } : c)
    );
  }, [coordinators]);

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
