import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

export type AuditEntry2Type =
  | 'room_assignment'
  | 'room_change'
  | 'comment'
  | 'status_change'
  | 'guest_placed';

export interface AuditEntry2 {
  id: string;
  guestId: string;
  guestName: string;
  guestReference: string;
  locationId: string;
  locationName: string;
  departmentId: string;
  departmentName: string;
  type: AuditEntry2Type;
  action: string;
  comment?: string;
  oldValue?: string;
  newValue?: string;
  createdBy: {
    id: string;
    name: string;
    role: 'department-head' | 'location-manager' | 'super-admin';
  };
  createdAt: string;
  readBy: string[];
}

interface AuditTrail2ContextValue {
  entries: AuditEntry2[];
  addEntry: (entry: Omit<AuditEntry2, 'id' | 'readBy'>) => AuditEntry2;
  addComment: (opts: {
    guestId: string; guestName: string; guestReference: string;
    locationId: string; locationName: string;
    departmentId: string; departmentName: string;
    comment: string;
    createdBy: AuditEntry2['createdBy'];
  }) => AuditEntry2;
  getEntriesByLocation: (locationId: string) => AuditEntry2[];
  getEntriesByDepartment: (departmentId: string) => AuditEntry2[];
  getEntriesByGuest: (guestId: string) => AuditEntry2[];
  markAsRead: (entryId: string, userId: string) => void;
  markGuestEntriesAsRead: (guestId: string, userId: string) => void;
}

// ── Sample data ────────────────────────────────────────────────────────────────

const SAMPLE: AuditEntry2[] = [
  {
    id: 'at2-1',
    guestId: '1',
    guestName: 'Klaus Mueller',
    guestReference: 'MEH-2024-000001',
    locationId: 'Jamia',
    locationName: 'Jamia',
    departmentId: 'Reserve 1 (R1)',
    departmentName: 'Reserve 1 (R1)',
    type: 'guest_placed',
    action: 'Guest placed at Jamia',
    newValue: 'Jamia',
    createdBy: { id: 'dh-001', name: 'R1 In-Charge', role: 'department-head' },
    createdAt: '2024-01-13T09:00:00',
    readBy: ['dh-001'],
  },
  {
    id: 'at2-2',
    guestId: '1',
    guestName: 'Klaus Mueller',
    guestReference: 'MEH-2024-000001',
    locationId: 'Jamia',
    locationName: 'Jamia',
    departmentId: 'Reserve 1 (R1)',
    departmentName: 'Reserve 1 (R1)',
    type: 'comment',
    action: 'Comment by R1 In-Charge',
    comment: 'Please assign to Block A if possible.',
    createdBy: { id: 'dh-001', name: 'R1 In-Charge', role: 'department-head' },
    createdAt: '2024-01-13T09:10:00',
    readBy: ['dh-001'],
  },
  {
    id: 'at2-3',
    guestId: '1',
    guestName: 'Klaus Mueller',
    guestReference: 'MEH-2024-000001',
    locationId: 'Jamia',
    locationName: 'Jamia',
    departmentId: 'Reserve 1 (R1)',
    departmentName: 'Reserve 1 (R1)',
    type: 'room_assignment',
    action: 'Assigned to Room A-101, Bed 1',
    newValue: 'A-101 / Bed 1',
    createdBy: { id: 'lm-001', name: 'Jamia Manager', role: 'location-manager' },
    createdAt: '2024-01-14T10:00:00',
    readBy: ['lm-001'],
  },
  {
    id: 'at2-4',
    guestId: '1',
    guestName: 'Klaus Mueller',
    guestReference: 'MEH-2024-000001',
    locationId: 'Jamia',
    locationName: 'Jamia',
    departmentId: 'Reserve 1 (R1)',
    departmentName: 'Reserve 1 (R1)',
    type: 'comment',
    action: 'Comment by Jamia Manager',
    comment: 'Noted, Block A it is. Room A-101 confirmed.',
    createdBy: { id: 'lm-001', name: 'Jamia Manager', role: 'location-manager' },
    createdAt: '2024-01-14T10:15:00',
    readBy: ['lm-001'],
  },
  {
    id: 'at2-5',
    guestId: '1',
    guestName: 'Klaus Mueller',
    guestReference: 'MEH-2024-000001',
    locationId: 'Jamia',
    locationName: 'Jamia',
    departmentId: 'Reserve 1 (R1)',
    departmentName: 'Reserve 1 (R1)',
    type: 'status_change',
    action: 'Guest accommodated',
    newValue: 'Accommodated',
    createdBy: { id: 'lm-001', name: 'Jamia Manager', role: 'location-manager' },
    createdAt: '2024-01-14T10:30:00',
    readBy: ['lm-001'],
  },
];

// Also add a Hotels entry for Hans Schmidt (guest '2')
const HOTELS_SAMPLE: AuditEntry2[] = [
  {
    id: 'at2-6',
    guestId: '2',
    guestName: 'Hans Schmidt',
    guestReference: 'MEH-2024-000002',
    locationId: 'Hotels',
    locationName: 'Hotels',
    departmentId: 'Reserve 1 (R1)',
    departmentName: 'Reserve 1 (R1)',
    type: 'guest_placed',
    action: 'Guest placed at Hotels',
    newValue: 'Hotels',
    createdBy: { id: 'dh-001', name: 'R1 In-Charge', role: 'department-head' },
    createdAt: '2024-01-15T10:00:00',
    readBy: ['dh-001', 'lm-001'],
  },
  {
    id: 'at2-7',
    guestId: '2',
    guestName: 'Hans Schmidt',
    guestReference: 'MEH-2024-000002',
    locationId: 'Hotels',
    locationName: 'Hotels',
    departmentId: 'Reserve 1 (R1)',
    departmentName: 'Reserve 1 (R1)',
    type: 'room_assignment',
    action: 'Assigned to Room H-101, Bed 1',
    newValue: 'H-101 / Bed 1',
    createdBy: { id: 'lm-001', name: 'Jamia Manager', role: 'location-manager' },
    createdAt: '2024-01-15T13:00:00',
    readBy: ['dh-001', 'lm-001'],
  },
];

const INITIAL_ENTRIES: AuditEntry2[] = [...SAMPLE, ...HOTELS_SAMPLE];

let nextId = 100;

// ── Context ────────────────────────────────────────────────────────────────────

const AuditTrail2Context = createContext<AuditTrail2ContextValue | null>(null);

export function AuditTrail2Provider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<AuditEntry2[]>(INITIAL_ENTRIES);

  const addEntry = useCallback((entry: Omit<AuditEntry2, 'id' | 'readBy'>): AuditEntry2 => {
    const newEntry: AuditEntry2 = { ...entry, id: `at2-${nextId++}`, readBy: [entry.createdBy.id] };
    setEntries(prev => [newEntry, ...prev]);
    return newEntry;
  }, []);

  const addComment = useCallback((opts: {
    guestId: string; guestName: string; guestReference: string;
    locationId: string; locationName: string;
    departmentId: string; departmentName: string;
    comment: string;
    createdBy: AuditEntry2['createdBy'];
  }): AuditEntry2 => {
    return addEntry({
      ...opts,
      type: 'comment',
      action: `Comment by ${opts.createdBy.name}`,
    });
  }, [addEntry]);

  const getEntriesByLocation = useCallback(
    (locationId: string) => entries.filter(e => e.locationId === locationId),
    [entries],
  );

  const getEntriesByDepartment = useCallback(
    (departmentId: string) => entries.filter(e => e.departmentId === departmentId),
    [entries],
  );

  const getEntriesByGuest = useCallback(
    (guestId: string) => entries.filter(e => e.guestId === guestId),
    [entries],
  );

  const markAsRead = useCallback((entryId: string, userId: string) => {
    setEntries(prev => prev.map(e =>
      e.id === entryId && !e.readBy.includes(userId)
        ? { ...e, readBy: [...e.readBy, userId] }
        : e,
    ));
  }, []);

  const markGuestEntriesAsRead = useCallback((guestId: string, userId: string) => {
    setEntries(prev => prev.map(e =>
      e.guestId === guestId && !e.readBy.includes(userId)
        ? { ...e, readBy: [...e.readBy, userId] }
        : e,
    ));
  }, []);

  return (
    <AuditTrail2Context.Provider value={{
      entries,
      addEntry,
      addComment,
      getEntriesByLocation,
      getEntriesByDepartment,
      getEntriesByGuest,
      markAsRead,
      markGuestEntriesAsRead,
    }}>
      {children}
    </AuditTrail2Context.Provider>
  );
}

export function useAuditTrail2() {
  const ctx = useContext(AuditTrail2Context);
  if (!ctx) throw new Error('useAuditTrail2 must be used within AuditTrail2Provider');
  return ctx;
}

// ── sanitize helper (same as trail 1) ─────────────────────────────────────────
export function sanitizeComment2(raw: string): string {
  return raw.replace(/<[^>]*>/g, '').trim().slice(0, 1000);
}
