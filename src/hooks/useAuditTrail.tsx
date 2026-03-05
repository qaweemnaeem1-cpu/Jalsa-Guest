import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

export type AuditEntryType = 'status_change' | 'field_edit' | 'comment' | 'submission' | 'assignment';

export interface AuditEntry {
  id: string;
  guestId: string;
  guestName: string;
  guestReference: string;
  type: AuditEntryType;
  action: string;
  details?: string;
  oldValue?: string;
  newValue?: string;
  fieldName?: string;
  comment?: string;
  createdBy: {
    id: string;
    name: string;
    role: 'super-admin' | 'desk-in-charge' | 'coordinator';
  };
  createdAt: string;
  isRead?: boolean;
}

// ── Strip HTML for security ────────────────────────────────────────────────────
export function sanitizeComment(raw: string): string {
  return raw.replace(/<[^>]*>/g, '').trim().slice(0, 1000);
}

// ── Sample data ───────────────────────────────────────────────────────────────

const INITIAL_ENTRIES: AuditEntry[] = [
  // ── Klaus Mueller (guest id '1') ──────────────────────────────────────────
  {
    id: 'audit-001', guestId: '1', guestName: 'Klaus Mueller', guestReference: 'MEH-2024-000001',
    type: 'submission', action: 'Guest submitted for review',
    createdBy: { id: 'coord-germany', name: 'Germany Coordinator', role: 'coordinator' },
    createdAt: '2024-01-10T09:00:00Z',
  },
  {
    id: 'audit-002', guestId: '1', guestName: 'Klaus Mueller', guestReference: 'MEH-2024-000001',
    type: 'comment', action: 'Comment added',
    comment: 'Please verify the passport number — it looks incorrect.',
    createdBy: { id: 'di-002', name: 'Rana Mahmood Sahib', role: 'desk-in-charge' },
    createdAt: '2024-01-10T14:30:00Z',
  },
  {
    id: 'audit-003', guestId: '1', guestName: 'Klaus Mueller', guestReference: 'MEH-2024-000001',
    type: 'status_change', action: 'Status changed',
    details: 'Awaiting Review → Needs Correction',
    oldValue: 'Awaiting Review', newValue: 'Needs Correction',
    createdBy: { id: 'di-002', name: 'Rana Mahmood Sahib', role: 'desk-in-charge' },
    createdAt: '2024-01-10T14:31:00Z',
  },
  {
    id: 'audit-004', guestId: '1', guestName: 'Klaus Mueller', guestReference: 'MEH-2024-000001',
    type: 'comment', action: 'Comment added',
    comment: 'Fixed! The correct passport number is C01X00T00. Please review again.',
    createdBy: { id: 'coord-germany', name: 'Germany Coordinator', role: 'coordinator' },
    createdAt: '2024-01-11T08:15:00Z',
  },
  {
    id: 'audit-005', guestId: '1', guestName: 'Klaus Mueller', guestReference: 'MEH-2024-000001',
    type: 'field_edit', action: 'Field updated',
    fieldName: 'Passport Number', oldValue: 'C01X00T01', newValue: 'C01X00T00',
    createdBy: { id: 'coord-germany', name: 'Germany Coordinator', role: 'coordinator' },
    createdAt: '2024-01-11T08:14:00Z',
  },
  {
    id: 'audit-006', guestId: '1', guestName: 'Klaus Mueller', guestReference: 'MEH-2024-000001',
    type: 'status_change', action: 'Status changed',
    details: 'Needs Correction → Awaiting Review',
    oldValue: 'Needs Correction', newValue: 'Awaiting Review',
    createdBy: { id: 'coord-germany', name: 'Germany Coordinator', role: 'coordinator' },
    createdAt: '2024-01-11T08:16:00Z',
  },
  {
    id: 'audit-007', guestId: '1', guestName: 'Klaus Mueller', guestReference: 'MEH-2024-000001',
    type: 'status_change', action: 'Status changed',
    details: 'Awaiting Review → Approved',
    oldValue: 'Awaiting Review', newValue: 'Approved',
    createdBy: { id: 'di-002', name: 'Rana Mahmood Sahib', role: 'desk-in-charge' },
    createdAt: '2024-01-12T10:00:00Z',
  },
  {
    id: 'audit-008', guestId: '1', guestName: 'Klaus Mueller', guestReference: 'MEH-2024-000001',
    type: 'comment', action: 'Comment added',
    comment: 'Approved. Guest accommodation has been arranged.',
    createdBy: { id: 'di-002', name: 'Rana Mahmood Sahib', role: 'desk-in-charge' },
    createdAt: '2024-01-12T10:01:00Z',
  },
  {
    id: 'audit-009', guestId: '1', guestName: 'Klaus Mueller', guestReference: 'MEH-2024-000001',
    type: 'status_change', action: 'Status changed',
    details: 'Approved → Accommodated',
    oldValue: 'Approved', newValue: 'Accommodated',
    createdBy: { id: 'admin-001', name: 'Ahmad Khan', role: 'super-admin' },
    createdAt: '2024-01-13T16:00:00Z',
  },

  // ── Aisha Rahman (guest id '2') ──────────────────────────────────────────
  {
    id: 'audit-101', guestId: '2', guestName: 'Aisha Rahman', guestReference: 'MEH-2024-000002',
    type: 'submission', action: 'Guest submitted for review',
    createdBy: { id: 'coord-bangladesh', name: 'Bangladesh Coordinator', role: 'coordinator' },
    createdAt: '2024-01-14T11:00:00Z',
  },
  {
    id: 'audit-102', guestId: '2', guestName: 'Aisha Rahman', guestReference: 'MEH-2024-000002',
    type: 'comment', action: 'Comment added',
    comment: 'Flight details need updating — arrival time has changed to 14:00.',
    createdBy: { id: 'di-003', name: 'Tahir Khan Sahib', role: 'desk-in-charge' },
    createdAt: '2024-01-14T15:45:00Z',
  },
  {
    id: 'audit-103', guestId: '2', guestName: 'Aisha Rahman', guestReference: 'MEH-2024-000002',
    type: 'field_edit', action: 'Field updated',
    fieldName: 'Arrival Time', oldValue: '2024-07-15T10:30', newValue: '2024-07-15T14:00',
    createdBy: { id: 'coord-bangladesh', name: 'Bangladesh Coordinator', role: 'coordinator' },
    createdAt: '2024-01-14T16:00:00Z',
  },
  {
    id: 'audit-104', guestId: '2', guestName: 'Aisha Rahman', guestReference: 'MEH-2024-000002',
    type: 'status_change', action: 'Status changed',
    details: 'Awaiting Review → Approved',
    oldValue: 'Awaiting Review', newValue: 'Approved',
    createdBy: { id: 'di-003', name: 'Tahir Khan Sahib', role: 'desk-in-charge' },
    createdAt: '2024-01-15T09:30:00Z',
  },

  // ── Omar Abdullah (guest id '3') ─────────────────────────────────────────
  {
    id: 'audit-201', guestId: '3', guestName: 'Omar Abdullah', guestReference: 'MEH-2024-000003',
    type: 'submission', action: 'Guest submitted for review',
    createdBy: { id: 'coord-nigeria', name: 'Nigeria Coordinator', role: 'coordinator' },
    createdAt: '2024-01-16T08:30:00Z',
  },
  {
    id: 'audit-202', guestId: '3', guestName: 'Omar Abdullah', guestReference: 'MEH-2024-000003',
    type: 'comment', action: 'Comment added',
    comment: 'Visa copy still pending. Please upload before approval.',
    createdBy: { id: 'di-007', name: 'Zishan Kahloon Sahib', role: 'desk-in-charge' },
    createdAt: '2024-01-16T13:00:00Z',
  },
  {
    id: 'audit-203', guestId: '3', guestName: 'Omar Abdullah', guestReference: 'MEH-2024-000003',
    type: 'status_change', action: 'Status changed',
    details: 'Awaiting Review → Needs Correction',
    oldValue: 'Awaiting Review', newValue: 'Needs Correction',
    createdBy: { id: 'di-007', name: 'Zishan Kahloon Sahib', role: 'desk-in-charge' },
    createdAt: '2024-01-16T13:01:00Z',
  },
  {
    id: 'audit-204', guestId: '3', guestName: 'Omar Abdullah', guestReference: 'MEH-2024-000003',
    type: 'comment', action: 'Comment added',
    comment: 'Visa copy uploaded. Visa number: NG-7X42-2024. Kindly review.',
    createdBy: { id: 'coord-nigeria', name: 'Nigeria Coordinator', role: 'coordinator' },
    createdAt: '2024-01-17T10:00:00Z',
  },
];

// ── Context ───────────────────────────────────────────────────────────────────

interface AuditTrailContextType {
  entries: AuditEntry[];
  addEntry: (entry: Omit<AuditEntry, 'id'>) => AuditEntry;
  addComment: (params: {
    guestId: string;
    guestName: string;
    guestReference: string;
    comment: string;
    createdBy: AuditEntry['createdBy'];
  }) => AuditEntry;
  getEntriesForGuest: (guestId: string) => AuditEntry[];
  markAsRead: (entryId: string) => void;
}

const AuditTrailContext = createContext<AuditTrailContextType | undefined>(undefined);

export function AuditTrailProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<AuditEntry[]>(INITIAL_ENTRIES);

  const addEntry = useCallback((entry: Omit<AuditEntry, 'id'>): AuditEntry => {
    const newEntry: AuditEntry = { ...entry, id: `audit-${Date.now()}` };
    setEntries(prev => [...prev, newEntry]);
    return newEntry;
  }, []);

  const addComment = useCallback((params: {
    guestId: string;
    guestName: string;
    guestReference: string;
    comment: string;
    createdBy: AuditEntry['createdBy'];
  }): AuditEntry => {
    const safeComment = sanitizeComment(params.comment);
    const newEntry: AuditEntry = {
      id: `audit-${Date.now()}`,
      guestId: params.guestId,
      guestName: params.guestName,
      guestReference: params.guestReference,
      type: 'comment',
      action: 'Comment added',
      comment: safeComment,
      createdBy: params.createdBy,
      createdAt: new Date().toISOString(),
      isRead: false,
    };
    setEntries(prev => [...prev, newEntry]);
    return newEntry;
  }, []);

  const getEntriesForGuest = useCallback(
    (guestId: string) => entries.filter(e => e.guestId === guestId),
    [entries]
  );

  const markAsRead = useCallback((entryId: string) => {
    setEntries(prev =>
      prev.map(e => (e.id === entryId ? { ...e, isRead: true } : e))
    );
  }, []);

  return (
    <AuditTrailContext.Provider value={{ entries, addEntry, addComment, getEntriesForGuest, markAsRead }}>
      {children}
    </AuditTrailContext.Provider>
  );
}

export function useAuditTrail() {
  const ctx = useContext(AuditTrailContext);
  if (!ctx) throw new Error('useAuditTrail must be used within AuditTrailProvider');
  return ctx;
}
