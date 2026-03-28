import { createContext, useCallback, useContext, useState, useEffect, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

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

// ── Row mapper ─────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToEntry(row: any): AuditEntry2 {
  return {
    id: row.id,
    guestId: row.guest_id,
    guestName: row.guest_name,
    guestReference: row.guest_reference,
    locationId: row.location_id ?? '',
    locationName: row.location_name ?? '',
    departmentId: row.department_id ?? '',
    departmentName: row.department_name ?? '',
    type: row.type as AuditEntry2Type,
    action: row.action,
    comment: row.comment ?? undefined,
    oldValue: row.old_value ?? undefined,
    newValue: row.new_value ?? undefined,
    createdBy: {
      id: row.created_by_id,
      name: row.created_by_name,
      role: row.created_by_role,
    },
    createdAt: row.created_at,
    readBy: (row.read_by as string[]) ?? [],
  };
}

// ── Context ────────────────────────────────────────────────────────────────────

interface AuditTrail2ContextValue {
  entries: AuditEntry2[];
  addEntry: (entry: Omit<AuditEntry2, 'id' | 'readBy'>) => void;
  addComment: (opts: {
    guestId: string; guestName: string; guestReference: string;
    locationId: string; locationName: string;
    departmentId: string; departmentName: string;
    comment: string;
    createdBy: AuditEntry2['createdBy'];
  }) => void;
  getEntriesByLocation: (locationId: string) => AuditEntry2[];
  getEntriesByDepartment: (departmentId: string) => AuditEntry2[];
  getEntriesByGuest: (guestId: string) => AuditEntry2[];
  markAsRead: (entryId: string, userId: string) => void;
  markGuestEntriesAsRead: (guestId: string, userId: string) => void;
}

const AuditTrail2Context = createContext<AuditTrail2ContextValue | null>(null);

export function AuditTrail2Provider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<AuditEntry2[]>([]);

  // Fetch all entries on mount / login
  useEffect(() => {
    if (!user) return;
    supabase
      .from('audit_trail_2')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setEntries(data.map(rowToEntry));
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ── Real-time subscription ───────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('audit2-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'audit_trail_2' },
        (payload) => {
          const incoming = rowToEntry(payload.new);
          setEntries(prev => {
            if (prev.find(e => e.id === incoming.id)) return prev;
            return [incoming, ...prev.filter(e => !e.id.startsWith('at2-opt-') ||
              e.guestId !== incoming.guestId || e.type !== incoming.type)];
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const addEntry = useCallback((entry: Omit<AuditEntry2, 'id' | 'readBy'>) => {
    const optimisticId = `at2-opt-${Date.now()}-${Math.random()}`;
    const optimistic: AuditEntry2 = {
      ...entry,
      id: optimisticId,
      readBy: [entry.createdBy.id],
    };
    setEntries(prev => [optimistic, ...prev]);

    supabase
      .from('audit_trail_2')
      .insert({
        guest_id: entry.guestId,
        guest_name: entry.guestName,
        guest_reference: entry.guestReference,
        location_id: entry.locationId || null,
        location_name: entry.locationName || null,
        department_id: entry.departmentId || null,
        department_name: entry.departmentName || null,
        type: entry.type,
        action: entry.action,
        comment: entry.comment ?? null,
        old_value: entry.oldValue ?? null,
        new_value: entry.newValue ?? null,
        created_by_id: entry.createdBy.id,
        created_by_name: entry.createdBy.name,
        created_by_role: entry.createdBy.role,
        read_by: [entry.createdBy.id],
        created_at: entry.createdAt,
      })
      .select()
      .single()
      .then(({ data }) => {
        if (data) {
          setEntries(prev =>
            prev.map(e => (e.id === optimisticId ? rowToEntry(data) : e))
          );
        }
      });
  }, []);

  const addComment = useCallback((opts: {
    guestId: string; guestName: string; guestReference: string;
    locationId: string; locationName: string;
    departmentId: string; departmentName: string;
    comment: string;
    createdBy: AuditEntry2['createdBy'];
  }) => {
    addEntry({
      ...opts,
      type: 'comment',
      action: `Comment by ${opts.createdBy.name}`,
      createdAt: new Date().toISOString(),
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
    setEntries(prev =>
      prev.map(e => {
        if (e.id !== entryId || e.readBy.includes(userId)) return e;
        const updated = { ...e, readBy: [...e.readBy, userId] };
        supabase
          .from('audit_trail_2')
          .update({ read_by: updated.readBy })
          .eq('id', entryId)
          .then(() => {});
        return updated;
      })
    );
  }, []);

  const markGuestEntriesAsRead = useCallback((guestId: string, userId: string) => {
    setEntries(prev =>
      prev.map(e => {
        if (e.guestId !== guestId || e.readBy.includes(userId)) return e;
        const updated = { ...e, readBy: [...e.readBy, userId] };
        supabase
          .from('audit_trail_2')
          .update({ read_by: updated.readBy })
          .eq('id', e.id)
          .then(() => {});
        return updated;
      })
    );
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
