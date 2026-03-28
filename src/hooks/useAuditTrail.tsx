import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

// ── Types ──────────────────────────────────────────────────────────────────────

export type AuditEntryType =
  | 'status_change'
  | 'field_edit'
  | 'comment'
  | 'submission'
  | 'assignment'
  | 'rejection'
  | 'resubmission'
  | 'appeal';

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
  /** IDs of users who have read this entry */
  readBy?: string[];
}

// ── Strip HTML for security ────────────────────────────────────────────────────
export function sanitizeComment(raw: string): string {
  return raw.replace(/<[^>]*>/g, '').trim().slice(0, 1000);
}

// ── Row mapper ─────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToEntry(row: any): AuditEntry {
  return {
    id: row.id,
    guestId: row.guest_id,
    guestName: row.guest_name,
    guestReference: row.guest_reference,
    type: row.type as AuditEntryType,
    action: row.action,
    details: row.details ?? undefined,
    oldValue: row.old_value ?? undefined,
    newValue: row.new_value ?? undefined,
    fieldName: row.field_name ?? undefined,
    comment: row.comment ?? undefined,
    createdBy: {
      id: row.created_by_id,
      name: row.created_by_name,
      role: row.created_by_role,
    },
    createdAt: row.created_at,
    readBy: (row.read_by as string[]) ?? [],
  };
}

// ── Context ───────────────────────────────────────────────────────────────────

interface AuditTrailContextType {
  entries: AuditEntry[];
  addEntry: (entry: Omit<AuditEntry, 'id'>) => void;
  addComment: (params: {
    guestId: string;
    guestName: string;
    guestReference: string;
    comment: string;
    createdBy: AuditEntry['createdBy'];
  }) => void;
  getEntriesForGuest: (guestId: string) => AuditEntry[];
  markAsRead: (entryId: string, userId: string) => void;
  markGuestEntriesAsRead: (guestId: string, userId: string) => void;
}

const AuditTrailContext = createContext<AuditTrailContextType | undefined>(undefined);

export function AuditTrailProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[]>([]);

  // Fetch all entries on mount / login
  useEffect(() => {
    if (!user) return;
    supabase
      .from('audit_trail')
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
      .channel('audit-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'audit_trail' },
        (payload) => {
          const incoming = rowToEntry(payload.new);
          setEntries(prev => {
            // Skip if already present (e.g. our own optimistic entry replaced by real)
            if (prev.find(e => e.id === incoming.id)) return prev;
            // Replace matching optimistic entry if same guest+action+timestamp proximity
            return [incoming, ...prev.filter(e => !e.id.startsWith('optimistic-') ||
              e.guestId !== incoming.guestId || e.type !== incoming.type)];
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const addEntry = useCallback((entry: Omit<AuditEntry, 'id'>) => {
    const optimisticId = `optimistic-${Date.now()}-${Math.random()}`;
    const optimistic: AuditEntry = { ...entry, id: optimisticId };
    setEntries(prev => [optimistic, ...prev]);

    supabase
      .from('audit_trail')
      .insert({
        guest_id: entry.guestId,
        guest_name: entry.guestName,
        guest_reference: entry.guestReference,
        type: entry.type,
        action: entry.action,
        details: entry.details ?? null,
        comment: entry.comment ?? null,
        old_value: entry.oldValue ?? null,
        new_value: entry.newValue ?? null,
        field_name: entry.fieldName ?? null,
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

  const addComment = useCallback((params: {
    guestId: string;
    guestName: string;
    guestReference: string;
    comment: string;
    createdBy: AuditEntry['createdBy'];
  }) => {
    addEntry({
      guestId: params.guestId,
      guestName: params.guestName,
      guestReference: params.guestReference,
      type: 'comment',
      action: 'Comment added',
      comment: sanitizeComment(params.comment),
      createdBy: params.createdBy,
      createdAt: new Date().toISOString(),
      readBy: [params.createdBy.id],
    });
  }, [addEntry]);

  const getEntriesForGuest = useCallback(
    (guestId: string) => entries.filter(e => e.guestId === guestId),
    [entries]
  );

  const markAsRead = useCallback((entryId: string, userId: string) => {
    setEntries(prev =>
      prev.map(e => {
        if (e.id !== entryId || e.readBy?.includes(userId)) return e;
        const updated = { ...e, readBy: [...(e.readBy ?? []), userId] };
        supabase
          .from('audit_trail')
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
        if (e.guestId !== guestId || e.readBy?.includes(userId)) return e;
        const updated = { ...e, readBy: [...(e.readBy ?? []), userId] };
        supabase
          .from('audit_trail')
          .update({ read_by: updated.readBy })
          .eq('id', e.id)
          .then(() => {});
        return updated;
      })
    );
  }, []);

  return (
    <AuditTrailContext.Provider value={{
      entries, addEntry, addComment, getEntriesForGuest, markAsRead, markGuestEntriesAsRead,
    }}>
      {children}
    </AuditTrailContext.Provider>
  );
}

export function useAuditTrail() {
  const ctx = useContext(AuditTrailContext);
  if (!ctx) throw new Error('useAuditTrail must be used within AuditTrailProvider');
  return ctx;
}
