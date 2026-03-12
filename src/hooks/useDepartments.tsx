import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { DEPT_LOCATIONS } from '@/lib/constants';

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

interface DepartmentsContextType {
  /** Map of department name → ordered list of locations */
  departments: Record<string, string[]>;
  /** Ordered list of department names */
  departmentList: string[];
  addDepartment: (name: string) => void;
  renameDepartment: (oldName: string, newName: string) => void;
  deleteDepartment: (name: string) => void;
  addLocation: (dept: string, location: string) => void;
  deleteLocation: (dept: string, location: string) => void;
  /** Tailwind classes for a department badge */
  getDeptBadgeCls: (dept: string) => string;
  /** Tailwind classes for a location pill within a department */
  getLocPillCls: (dept: string, location: string) => string;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const DepartmentsContext = createContext<DepartmentsContextType | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function DepartmentsProvider({ children }: { children: ReactNode }) {
  const [departments, setDepartments] = useState<Record<string, string[]>>(DEPT_LOCATIONS);
  // Maintain insertion order separately
  const [order, setOrder] = useState<string[]>(Object.keys(DEPT_LOCATIONS));

  const departmentList = order.filter(d => d in departments);

  const addDepartment = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setDepartments(prev => {
      if (trimmed in prev) return prev;
      return { ...prev, [trimmed]: [] };
    });
    setOrder(prev => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
  }, []);

  const renameDepartment = useCallback((oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || oldName === trimmed) return;
    setDepartments(prev => {
      if (!(oldName in prev)) return prev;
      const next: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(prev)) {
        next[k === oldName ? trimmed : k] = v;
      }
      return next;
    });
    setOrder(prev => prev.map(d => (d === oldName ? trimmed : d)));
  }, []);

  const deleteDepartment = useCallback((name: string) => {
    setDepartments(prev => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    setOrder(prev => prev.filter(d => d !== name));
  }, []);

  const addLocation = useCallback((dept: string, location: string) => {
    const trimmed = location.trim();
    if (!trimmed) return;
    setDepartments(prev => {
      if (!(dept in prev)) return prev;
      if (prev[dept].includes(trimmed)) return prev;
      return { ...prev, [dept]: [...prev[dept], trimmed] };
    });
  }, []);

  const deleteLocation = useCallback((dept: string, location: string) => {
    setDepartments(prev => {
      if (!(dept in prev)) return prev;
      return { ...prev, [dept]: prev[dept].filter(l => l !== location) };
    });
  }, []);

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
      addDepartment,
      renameDepartment,
      deleteDepartment,
      addLocation,
      deleteLocation,
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
