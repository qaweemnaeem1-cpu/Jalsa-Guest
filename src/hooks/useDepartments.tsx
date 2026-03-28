import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

// ─── Color palettes ───────────────────────────────────────────────────────────

const DEPT_COLORS = [
  'bg-blue-50 text-blue-700 border-blue-200',
  'bg-purple-50 text-purple-700 border-purple-200',
  'bg-teal-50 text-teal-700 border-teal-200',
  'bg-rose-50 text-rose-700 border-rose-200',
  'bg-amber-50 text-amber-700 border-amber-200',
  'bg-indigo-50 text-indigo-700 border-indigo-200',
  'bg-lime-50 text-lime-700 border-lime-200',
  'bg-cyan-50 text-cyan-700 border-cyan-200',
];

const LOC_COLORS = [
  'bg-blue-50 text-blue-700 border-blue-200',
  'bg-purple-50 text-purple-700 border-purple-200',
  'bg-teal-50 text-teal-700 border-teal-200',
  'bg-rose-50 text-rose-700 border-rose-200',
  'bg-amber-50 text-amber-700 border-amber-200',
];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Department {
  id: string;
  name: string;
}

export interface DepLocation {
  id: string;
  name: string;
  departmentId: string;
  description?: string;
  isActive: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToDept(row: any): Department {
  return { id: row.id, name: row.name };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToLocation(row: any): DepLocation {
  return {
    id: row.id,
    name: row.name,
    departmentId: row.department_id,
    description: row.description ?? undefined,
    isActive: row.is_active ?? true,
  };
}

interface DepartmentsContextType {
  /** Backward-compatible: department name → ordered location names */
  departments: Record<string, string[]>;
  /** Backward-compatible: ordered list of department names */
  departmentList: string[];
  /** Structured departments with IDs */
  deptList: Department[];
  /** Structured locations with IDs */
  locationsList: DepLocation[];
  // Department CRUD
  addDepartment: (name: string) => Promise<void>;
  renameDepartment: (oldName: string, newName: string) => Promise<void>;
  deleteDepartment: (name: string) => Promise<void>;
  // Location CRUD
  addLocation: (deptName: string, locationName: string, description?: string) => Promise<DepLocation | null>;
  updateLocation: (id: string, updates: Partial<Pick<DepLocation, 'name' | 'description' | 'isActive'>>) => Promise<void>;
  deleteLocation: (deptName: string, locationName: string) => Promise<void>;
  deleteLocationById: (id: string) => Promise<void>;
  /** Tailwind classes for a department badge */
  getDeptBadgeCls: (dept: string) => string;
  /** Tailwind classes for a location pill within a department */
  getLocPillCls: (dept: string, location: string) => string;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const DepartmentsContext = createContext<DepartmentsContextType | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function DepartmentsProvider({ children }: { children: ReactNode }) {
  const [deptList, setDeptList] = useState<Department[]>([]);
  const [locationsList, setLocationsList] = useState<DepLocation[]>([]);

  // Fetch departments and locations on mount
  useEffect(() => {
    supabase
      .from('departments')
      .select('*')
      .order('name')
      .then(({ data, error }) => {
        if (error) { console.error('useDepartments fetch:', error); return; }
        if (data) setDeptList(data.map(rowToDept));
      });

    supabase
      .from('locations')
      .select('*')
      .order('name')
      .then(({ data, error }) => {
        if (error) { console.error('useDepartments locations fetch:', error); return; }
        if (data) setLocationsList(data.map(rowToLocation));
      });
  }, []);

  // ── Computed backward-compat values ─────────────────────────────────────────

  const departmentList = deptList.map(d => d.name);

  const departments: Record<string, string[]> = {};
  for (const dept of deptList) {
    departments[dept.name] = locationsList
      .filter(l => l.departmentId === dept.id && l.isActive)
      .map(l => l.name);
  }

  // ── Department CRUD ──────────────────────────────────────────────────────────

  const addDepartment = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const { data, error } = await supabase
      .from('departments')
      .insert({ name: trimmed })
      .select()
      .single();

    if (error) { toast.error('Failed to add department'); return; }
    setDeptList(prev => [...prev, rowToDept(data)].sort((a, b) => a.name.localeCompare(b.name)));
  }, []);

  const renameDepartment = useCallback(async (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || oldName === trimmed) return;
    const dept = deptList.find(d => d.name === oldName);
    if (!dept) return;

    const { error } = await supabase
      .from('departments')
      .update({ name: trimmed, updated_at: new Date().toISOString() })
      .eq('id', dept.id);

    if (error) { toast.error('Failed to rename department'); return; }
    setDeptList(prev => prev.map(d => d.id === dept.id ? { ...d, name: trimmed } : d));
  }, [deptList]);

  const deleteDepartment = useCallback(async (name: string) => {
    const dept = deptList.find(d => d.name === name);
    if (!dept) return;

    const { error } = await supabase.from('departments').delete().eq('id', dept.id);
    if (error) { toast.error('Failed to delete department'); return; }
    setDeptList(prev => prev.filter(d => d.id !== dept.id));
    setLocationsList(prev => prev.filter(l => l.departmentId !== dept.id));
  }, [deptList]);

  // ── Location CRUD ────────────────────────────────────────────────────────────

  const addLocation = useCallback(async (
    deptName: string,
    locationName: string,
    description?: string,
  ): Promise<DepLocation | null> => {
    const dept = deptList.find(d => d.name === deptName);
    if (!dept) return null;
    const trimmed = locationName.trim();
    if (!trimmed) return null;

    const { data, error } = await supabase
      .from('locations')
      .insert({
        name: trimmed,
        department_id: dept.id,
        description: description?.trim() ?? null,
        is_active: true,
      })
      .select()
      .single();

    if (error) { toast.error('Failed to add location'); return null; }
    const loc = rowToLocation(data);
    setLocationsList(prev => [...prev, loc]);
    return loc;
  }, [deptList]);

  const updateLocation = useCallback(async (
    id: string,
    updates: Partial<Pick<DepLocation, 'name' | 'description' | 'isActive'>>,
  ) => {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.name      !== undefined) patch.name        = updates.name;
    if (updates.description !== undefined) patch.description = updates.description ?? null;
    if (updates.isActive  !== undefined) patch.is_active   = updates.isActive;

    const { error } = await supabase.from('locations').update(patch).eq('id', id);
    if (error) { toast.error('Failed to update location'); return; }
    setLocationsList(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
  }, []);

  const deleteLocation = useCallback(async (deptName: string, locationName: string) => {
    const dept = deptList.find(d => d.name === deptName);
    if (!dept) return;
    const loc = locationsList.find(l => l.departmentId === dept.id && l.name === locationName);
    if (!loc) return;

    const { error } = await supabase.from('locations').delete().eq('id', loc.id);
    if (error) { toast.error('Failed to delete location'); return; }
    setLocationsList(prev => prev.filter(l => l.id !== loc.id));
  }, [deptList, locationsList]);

  const deleteLocationById = useCallback(async (id: string) => {
    const { error } = await supabase.from('locations').delete().eq('id', id);
    if (error) { toast.error('Failed to delete location'); return; }
    setLocationsList(prev => prev.filter(l => l.id !== id));
  }, []);

  // ── Color helpers ────────────────────────────────────────────────────────────

  const getDeptBadgeCls = useCallback((dept: string) => {
    const idx = departmentList.indexOf(dept);
    return DEPT_COLORS[idx % DEPT_COLORS.length] ?? 'bg-gray-50 text-gray-700 border-gray-200';
  }, [departmentList]);

  const getLocPillCls = useCallback((dept: string, location: string) => {
    const locs = departments[dept] ?? [];
    const idx = locs.indexOf(location);
    return LOC_COLORS[idx % LOC_COLORS.length] ?? 'bg-gray-50 text-gray-700 border-gray-200';
  }, [departments]);

  return (
    <DepartmentsContext.Provider value={{
      departments,
      departmentList,
      deptList,
      locationsList,
      addDepartment,
      renameDepartment,
      deleteDepartment,
      addLocation,
      updateLocation,
      deleteLocation,
      deleteLocationById,
      getDeptBadgeCls,
      getLocPillCls,
    }}>
      {children}
    </DepartmentsContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDepartments() {
  const ctx = useContext(DepartmentsContext);
  if (!ctx) throw new Error('useDepartments must be used within DepartmentsProvider');
  return ctx;
}
