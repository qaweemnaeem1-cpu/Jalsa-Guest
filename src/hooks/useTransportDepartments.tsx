import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import type { TransportDepartment } from '@/types';

// ── DB row → TransportDepartment ───────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToTransportDept(row: any): TransportDepartment {
  const mappings = (row.transport_department_mapping as { accommodation_department: string }[] | undefined) ?? [];
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    isSeasonal: row.is_seasonal ?? false,
    activeFrom: row.active_from ?? undefined,
    activeTo: row.active_to ?? undefined,
    isActive: row.is_active ?? true,
    createdAt: row.created_at ?? new Date().toISOString(),
    serves: mappings.map(m => m.accommodation_department),
  };
}

export interface AddTransportDeptInput {
  name: string;
  description?: string;
  serves: string[];
  isSeasonal: boolean;
  activeFrom?: string;
  activeTo?: string;
}

interface TransportDeptsContextType {
  transportDepts: TransportDepartment[];
  loading: boolean;
  addTransportDept: (input: AddTransportDeptInput) => Promise<TransportDepartment | null>;
  updateTransportDept: (id: string, input: Partial<AddTransportDeptInput>) => Promise<void>;
  deleteTransportDept: (id: string) => Promise<void>;
  toggleTransportDeptStatus: (id: string) => Promise<void>;
}

const TransportDeptsContext = createContext<TransportDeptsContextType | undefined>(undefined);

const SELECT = '*, transport_department_mapping(accommodation_department)';

export function TransportDeptsProvider({ children }: { children: ReactNode }) {
  const [transportDepts, setTransportDepts] = useState<TransportDepartment[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    supabase
      .from('transport_departments')
      .select(SELECT)
      .order('name')
      .then(({ data, error }) => {
        if (error) { console.error('useTransportDepartments fetch:', error); }
        if (data) setTransportDepts(data.map(rowToTransportDept));
        setLoading(false);
      });
  }, []);

  const addTransportDept = useCallback(async (input: AddTransportDeptInput): Promise<TransportDepartment | null> => {
    const { data, error } = await supabase
      .from('transport_departments')
      .insert({
        name: input.name,
        description: input.description ?? null,
        is_seasonal: input.isSeasonal,
        active_from: input.isSeasonal ? (input.activeFrom ?? null) : null,
        active_to: input.isSeasonal ? (input.activeTo ?? null) : null,
        is_active: true,
      })
      .select('id')
      .single();

    if (error) { toast.error('Failed to add transport department'); return null; }

    // Insert mappings
    if (input.serves.length > 0) {
      await supabase.from('transport_department_mapping').insert(
        input.serves.map(dept => ({ transport_department_id: data.id, accommodation_department: dept }))
      );
    }

    // Re-fetch to get full row with mappings
    const { data: full } = await supabase
      .from('transport_departments').select(SELECT).eq('id', data.id).single();

    if (full) {
      const newDept = rowToTransportDept(full);
      setTransportDepts(prev => [...prev, newDept].sort((a, b) => a.name.localeCompare(b.name)));
      toast.success('Transport department added');
      return newDept;
    }
    return null;
  }, []);

  const updateTransportDept = useCallback(async (id: string, input: Partial<AddTransportDeptInput>) => {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description ?? null;
    if (input.isSeasonal !== undefined) {
      updates.is_seasonal = input.isSeasonal;
      updates.active_from = input.isSeasonal ? (input.activeFrom ?? null) : null;
      updates.active_to = input.isSeasonal ? (input.activeTo ?? null) : null;
    }

    const { error } = await supabase.from('transport_departments').update(updates).eq('id', id);
    if (error) { toast.error('Failed to update transport department'); return; }

    // Update mappings if serves provided
    if (input.serves !== undefined) {
      await supabase.from('transport_department_mapping').delete().eq('transport_department_id', id);
      if (input.serves.length > 0) {
        await supabase.from('transport_department_mapping').insert(
          input.serves.map(dept => ({ transport_department_id: id, accommodation_department: dept }))
        );
      }
    }

    const { data: full } = await supabase
      .from('transport_departments').select(SELECT).eq('id', id).single();

    if (full) {
      setTransportDepts(prev => prev.map(d => d.id === id ? rowToTransportDept(full) : d));
      toast.success('Transport department updated');
    }
  }, []);

  const deleteTransportDept = useCallback(async (id: string) => {
    const { error } = await supabase.from('transport_departments').delete().eq('id', id);
    if (error) { toast.error('Failed to delete transport department'); return; }
    setTransportDepts(prev => prev.filter(d => d.id !== id));
    toast.success('Transport department deleted');
  }, []);

  const toggleTransportDeptStatus = useCallback(async (id: string) => {
    const current = transportDepts.find(d => d.id === id);
    if (!current) return;
    const { error } = await supabase
      .from('transport_departments')
      .update({ is_active: !current.isActive, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { toast.error('Failed to update status'); return; }
    setTransportDepts(prev => prev.map(d => d.id === id ? { ...d, isActive: !d.isActive } : d));
  }, [transportDepts]);

  return (
    <TransportDeptsContext.Provider value={{
      transportDepts,
      loading,
      addTransportDept,
      updateTransportDept,
      deleteTransportDept,
      toggleTransportDeptStatus,
    }}>
      {children}
    </TransportDeptsContext.Provider>
  );
}

export function useTransportDepts() {
  const ctx = useContext(TransportDeptsContext);
  if (!ctx) throw new Error('useTransportDepts must be used within TransportDeptsProvider');
  return ctx;
}

// ── Transport dept badge colors ────────────────────────────────────────────────
export function getTransportDeptBadgeClass(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('jalsa') || n.includes('salana')) return 'bg-green-100 text-green-700 border-green-200';
  if (n.includes('reserve 1') || n.includes('reserve1')) return 'bg-blue-100 text-blue-700 border-blue-200';
  if (n.includes('central')) return 'bg-teal-100 text-teal-700 border-teal-200';
  if (n.includes('uk jamaat') || n.includes('jamaat')) return 'bg-purple-100 text-purple-700 border-purple-200';
  return 'bg-gray-100 text-gray-700 border-gray-200';
}

// ── Standalone fetch for dept head pages (no context needed) ──────────────────
export async function fetchTransportDeptsForDept(
  accommodationDept: string,
): Promise<TransportDepartment[]> {
  const { data, error } = await supabase
    .from('transport_department_mapping')
    .select('transport_departments(*, transport_department_mapping(accommodation_department))')
    .eq('accommodation_department', accommodationDept);

  if (error || !data) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return data.map((row: any) => rowToTransportDept(row.transport_departments)).filter(Boolean);
}
