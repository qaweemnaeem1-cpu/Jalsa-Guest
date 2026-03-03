import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { Designation } from '@/types';
import { INITIAL_DESIGNATIONS } from '@/lib/constants';

interface DesignationsContextType {
  designations: Designation[];
  activeDesignations: string[];
  addDesignation: (name: string) => Designation;
  updateDesignation: (id: string, updates: Partial<Designation>) => void;
  deleteDesignation: (id: string) => void;
  toggleDesignationStatus: (id: string) => void;
}

const DesignationsContext = createContext<DesignationsContextType | undefined>(undefined);

export function DesignationsProvider({ children }: { children: ReactNode }) {
  const [designations, setDesignations] = useState<Designation[]>(INITIAL_DESIGNATIONS);

  const activeDesignations = designations
    .filter(d => d.isActive)
    .map(d => d.name)
    .sort();

  const addDesignation = useCallback((name: string) => {
    const newDesignation: Designation = {
      id: `desig-${Date.now()}`,
      name: name.trim(),
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    setDesignations(prev => [...prev, newDesignation]);
    return newDesignation;
  }, []);

  const updateDesignation = useCallback((id: string, updates: Partial<Designation>) => {
    setDesignations(prev =>
      prev.map(d =>
        d.id === id ? { ...d, ...updates } : d
      )
    );
  }, []);

  const deleteDesignation = useCallback((id: string) => {
    setDesignations(prev => prev.filter(d => d.id !== id));
  }, []);

  const toggleDesignationStatus = useCallback((id: string) => {
    setDesignations(prev =>
      prev.map(d =>
        d.id === id ? { ...d, isActive: !d.isActive } : d
      )
    );
  }, []);

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
