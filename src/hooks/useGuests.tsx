import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import type { Guest, GuestStatus, GuestRemark, FamilyMember, FamilyMemberStatus } from '@/types';
import { useAuth } from './useAuth';

// ── Age calculation ────────────────────────────────────────────────────────────

function calculateAge(dob: string): number | null {
  if (!dob) return null;
  const today = new Date();
  const birth = new Date(dob);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age >= 0 ? age : null;
}

// ── Context type ───────────────────────────────────────────────────────────────

interface GuestsContextType {
  guests: Guest[];
  isLoading: boolean;
  addGuest: (guestData: Omit<Guest, 'id' | 'referenceNumber' | 'submittedAt' | 'status' | 'resubmitCount' | 'appealStatus'>) => Promise<Guest | null>;
  updateGuest: (id: string, updates: Partial<Guest>) => Promise<void>;
  deleteGuest: (id: string) => void;
  addRemark: (guestId: string, remark: Omit<GuestRemark, 'id' | 'createdAt'>) => void;
  getGuestById: (id: string) => Guest | undefined;
  getGuestsByCountry: (countryCode: string) => Guest[];
  getGuestsByStatus: (status: GuestStatus) => Guest[];
  getMySubmissions: () => Guest[];
  getMyWaitingGuests: () => Guest[];
  getMySubmittedGuests: () => Guest[];
  getNeedsCorrectionCount: () => number;
  generateReferenceNumber: () => string;
  updateFamilyMemberStatus: (guestId: string, memberId: string, newStatus: FamilyMemberStatus) => void;
  assignFamilyMemberDepartment: (guestId: string, memberId: string, department: string) => void;
  placeFamilyMember: (guestId: string, memberId: string, location: string) => void;
  getFamilyStatusSummary: (guest: Guest) => { approved: number; awaiting: number; total: number };
}

const GuestsContext = createContext<GuestsContextType | undefined>(undefined);

// ── DB ↔ TypeScript mappers ────────────────────────────────────────────────────

/** Normalise a DATE column — returns "YYYY-MM-DD" or undefined.
 *  Handles DATE ("2026-07-22"), TIMESTAMPTZ ("2026-07-22T00:00:00+00:00"), null. */
function normaliseDateCol(v: unknown): string | undefined {
  if (!v) return undefined;
  const s = String(v);
  return s.includes('T') ? s.split('T')[0] : s;
}

/** Normalise a TIME column — returns "HH:MM" or undefined.
 *  Handles TIME ("17:45:00"), TIMESTAMPTZ ("...T17:45:00+00:00"), null. */
function normaliseTimeCol(v: unknown): string | undefined {
  if (!v) return undefined;
  const s = String(v);
  if (s.includes('T')) {
    const part = s.split('T')[1] ?? '';
    return part.slice(0, 5) || undefined;
  }
  return s.includes(':') && !s.includes('-') ? s.slice(0, 5) : undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToFamilyMember(row: any): FamilyMember {
  return {
    id: String(row.id),
    name: row.name,
    age: row.age,
    relationship: row.relationship,
    gender: row.gender,
    passportCountry: row.passport_country ?? undefined,
    status: row.status ?? undefined,
    assignedDepartment: row.assigned_department ?? undefined,
    assignedDepartmentAt: row.assigned_department_at ?? undefined,
    placedLocation: row.placed_location ?? undefined,
    placedAt: row.placed_at ?? undefined,
    rejectionReason: row.rejection_reason ?? undefined,
    remarks: row.remarks ?? undefined,
    arrivalFlightNumber: row.arrival_flight_number ?? row.flight_number ?? undefined,
    arrivalAirport: row.arrival_airport ?? undefined,
    arrivalTerminal: row.arrival_terminal ?? undefined,
    arrival_date: normaliseDateCol(row.arrival_date),
    arrival_time: normaliseTimeCol(row.arrival_time),
    departureFlightNumber: row.departure_flight_number ?? undefined,
    departureAirport: row.departure_airport ?? undefined,
    departureTerminal: row.departure_terminal ?? undefined,
    departure_date: normaliseDateCol(row.departure_date),
    departure_time: normaliseTimeCol(row.departure_time),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToGuest(row: any): Guest {
  return {
    id: String(row.id),
    referenceNumber: row.reference ?? row.reference_number ?? '',
    fullName: row.full_name ?? '',
    country: row.country ?? '',
    countryCode: row.country_code ?? row.country ?? '',
    gender: row.gender,
    age: row.age,
    dateOfBirth: row.date_of_birth ?? undefined,
    passportNumber: row.passport_number ?? '',
    passportCountry: row.passport_country ?? undefined,
    contactNumber: row.contact_number ?? '',
    email: row.email ?? undefined,
    visaStatus: row.visa_status ?? 'not-required',
    visaDetails: row.visa_details ?? undefined,
    guestType: row.guest_type ?? 'individual',
    familyMembers: Array.isArray(row.family_members)
      ? row.family_members.map(rowToFamilyMember)
      : [],
    designation: Array.isArray(row.designation) ? row.designation : (row.designation ? [row.designation] : []),
    arrivalFlightNumber: row.flight_number ?? row.arrival_flight_number ?? undefined,
    arrivalAirport: row.arrival_airport ?? undefined,
    arrivalTerminal: row.arrival_terminal ?? undefined,
    // Raw DB columns — kept separate, normalised to DATE string / HH:MM string
    arrival_date: normaliseDateCol(row.arrival_date),
    arrival_time: normaliseTimeCol(row.arrival_time),
    departureFlightNumber: row.flight_number ?? row.departure_flight_number ?? undefined,
    departureAirport: row.departure_airport ?? undefined,
    departureTerminal: row.departure_terminal ?? undefined,
    departure_date: normaliseDateCol(row.departure_date),
    departure_time: normaliseTimeCol(row.departure_time),
    specialNeeds: row.special_needs ?? undefined,
    dietaryRequirements: row.dietary_requirements ?? undefined,
    wheelchairRequired: row.wheelchair_required ?? false,
    status: row.status,
    submittedBy: row.submitted_by ?? '',
    submittedAt: row.submitted_at ?? '',
    resubmittedAt: row.resubmitted_at ?? undefined,
    resubmitCount: row.resubmit_count ?? 0,
    reviewedBy: row.reviewed_by ?? undefined,
    reviewedAt: row.reviewed_at ?? undefined,
    rejectionReason: row.rejection_reason ?? undefined,
    appealStatus: row.appeal_status ?? 'none',
    appealReason: row.appeal_reason ?? undefined,
    appealedAt: row.appealed_at ?? undefined,
    appealReviewedBy: row.appeal_reviewed_by ?? undefined,
    accommodatedBy: row.accommodated_by ?? undefined,
    accommodatedAt: row.accommodated_at ?? undefined,
    department: row.department ?? undefined,
    roomAssignment: row.room_assignment ?? undefined,
    assignedDepartment: row.assigned_department ?? undefined,
    assignedDepartmentAt: row.assigned_department_at ?? undefined,
    assignedDepartmentBy: row.assigned_department_by ?? undefined,
    assignedDepartmentByName: row.assigned_department_by_name ?? undefined,
    placedLocation: row.placed_location ?? undefined,
    placedAt: row.placed_at ?? undefined,
    placedBy: row.placed_by ?? undefined,
    placedByName: row.placed_by_name ?? undefined,
    remarks: Array.isArray(row.remarks) ? row.remarks : [],
    statusHistory: Array.isArray(row.status_history) ? row.status_history : [],
    mulaqat: row.mulaqat ?? false,
    mulaqatType: row.mulaqat_type ?? 'No',
    delegationId: row.delegation_id ?? null,
    religion: row.religion ?? undefined,
    introduction: row.introduction ?? undefined,
    isHeadOfFamily: row.is_head_of_family ?? false,
    expenses: row.expenses ?? undefined,
    tabshirReference: row.tabshir_reference ?? undefined,
    photoUrl: row.photo_url ?? undefined,
    familyGroupId: row.family_group_id ?? null,
    familyName: row.family_name ?? undefined,
    relationship: row.relationship ?? undefined,
    transportDepartmentId: row.transport_department_id ?? undefined,
    transportDepartmentName: row.transport_department_name ?? undefined,
  };
}

function cleanTime(value?: string | null): string | null {
  if (!value) return null;
  const t = value.includes('T') ? value.split('T')[1] : value;
  return t?.slice(0, 5) || null; // HH:MM only
}

function cleanDate(value?: string | null): string | null {
  if (!value) return null;
  return value.includes('T') ? value.split('T')[0] : value;
}

/** Convert a camelCase Partial<Guest> to snake_case DB columns.
 *  Only emits columns that actually exist in the guests table. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function updatesToDbRow(updates: Partial<Guest>): Record<string, any> {
  // camelCase key → exact DB column name
  const map: Record<string, string> = {
    fullName:           'full_name',
    gender:             'gender',
    dateOfBirth:        'date_of_birth',
    age:                'age',
    passportNumber:     'passport_number',
    passportCountry:    'passport_country',
    contactNumber:      'contact_number',
    email:              'email',
    visaStatus:         'visa_status',
    guestType:          'guest_type',
    designation:        'designation',
    country:            'country',
    arrivalFlightNumber: 'flight_number',     // DB has single flight_number column
    arrivalAirport:     'arrival_airport',
    arrivalTerminal:    'arrival_terminal',
    arrival_date:       'arrival_date',
    arrival_time:       'arrival_time',
    departureAirport:   'departure_airport',
    departureTerminal:  'departure_terminal',
    departure_date:     'departure_date',
    departure_time:     'departure_time',
    specialNeeds:       'special_needs',
    dietaryRequirements: 'dietary_requirements',
    wheelchairRequired: 'wheelchair_required',
    status:             'status',
    submittedBy:        'submitted_by',
    submittedAt:        'submitted_at',
    resubmittedAt:      'resubmitted_at',
    resubmitCount:      'resubmit_count',
    reviewedBy:         'reviewed_by',
    reviewedAt:         'reviewed_at',
    rejectionReason:    'rejection_reason',
    appealStatus:       'appeal_status',
    appealReason:       'appeal_reason',
    appealedAt:         'appealed_at',
    appealReviewedBy:   'appeal_reviewed_by',
    accommodatedBy:     'accommodated_by',
    accommodatedAt:     'accommodated_at',
    assignedDepartment: 'assigned_department',
    assignedDepartmentAt: 'assigned_department_at',
    assignedDepartmentBy: 'assigned_department_by',
    placedLocation:     'placed_location',
    placedAt:           'placed_at',
    placedBy:           'placed_by',
    remarks:            'remarks',
    mulaqat:            'mulaqat',
    mulaqatType:        'mulaqat_type',
    delegationId:       'delegation_id',
    religion:           'religion',
    introduction:       'introduction',
    isHeadOfFamily:     'is_head_of_family',
    expenses:           'expenses',
    tabshirReference:   'tabshir_reference',
    photoUrl:           'photo_url',
    familyGroupId:      'family_group_id',
    familyName:         'family_name',
    relationship:       'relationship',
    transportDepartmentId:   'transport_department_id',
    transportDepartmentName: 'transport_department_name',
  };

  // Fields that must never be sent to the DB (no matching column)
  const skip = new Set([
    'id', 'referenceNumber', 'familyMembers', 'countryCode', 'visaDetails',
    'departureFlightNumber', 'roomAssignment',
    'assignedDepartmentByName', 'placedByName', 'statusHistory',
    'department',  // read-only profile field, not the assignment column
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row: Record<string, any> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (skip.has(key)) continue;

    // DATE/TIME fields — normalise to safe formats before sending to PostgreSQL
    if (key === 'arrival_date' || key === 'departure_date') {
      row[key] = cleanDate(value as string);
      continue;
    }
    if (key === 'arrival_time' || key === 'departure_time') {
      row[key] = cleanTime(value as string);
      continue;
    }

    const dbKey = map[key] ?? key;
    // Convert empty strings to null so PostgreSQL doesn't reject typed columns
    // Arrays are passed through as-is (TEXT[] columns); empty arrays become null
    if (Array.isArray(value)) {
      row[dbKey] = value.length > 0 ? value : null;
    } else {
      row[dbKey] = (value === '' || value === undefined) ? null : value;
    }
  }
  return row;
}

// ── Provider ───────────────────────────────────────────────────────────────────

export function GuestsProvider({ children }: { children: ReactNode }) {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();
  const hasFetched = useRef(false);

  // ── Fetch guests ────────────────────────────────────────────────────────────
  // Depends only on stable primitives (id, role) — not the full user object — to avoid
  // infinite re-render loops caused by new object references on every render.

  const fetchGuests = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);

    console.log('[fetchGuests] Current user:', {
      id: user.id,
      name: user.name,
      role: user.role,
      country: user.country,
      assignedCountries: user.assignedCountries,
    });

    let query = supabase
      .from('guests')
      .select('*, family_members(*)')
      .order('created_at', { ascending: false });

    // Role-based filtering
    if (user.role === 'super-admin') {
      // no filter — sees all guests
    } else if (user.role === 'desk-in-charge') {
      const countries = user.assignedCountries ?? [];
      if (countries.length === 0) {
        setGuests([]);
        setIsLoading(false);
        return;
      }
      query = query.in('country', countries);
    } else if (user.role === 'coordinator') {
      // Coordinators see all guests they personally submitted
      console.log('[fetchGuests] Coordinator filter — submitted_by:', JSON.stringify(user.id));
      console.log('[fetchGuests] Coordinator country (informational):', JSON.stringify(user.country));
      query = query.eq('submitted_by', user.id);
    } else if (user.role === 'department-head') {
      query = query.eq('assigned_department', user.department ?? '');
    } else if (user.role === 'location-manager') {
      query = query.eq('placed_location', user.location ?? '');
    }

    const { data, error } = await query;

    console.log('[fetchGuests] Query result:', {
      role: user.role,
      total: data?.length ?? 0,
      error: error ?? null,
      guests: data?.map(g => ({
        id: g.id,
        full_name: g.full_name,
        status: g.status,
        submitted_by: g.submitted_by,
        country: g.country,
      })),
    });

    if (user.role === 'coordinator' && data) {
      const statusCounts: Record<string, number> = {};
      data.forEach(g => {
        statusCounts[g.status] = (statusCounts[g.status] ?? 0) + 1;
      });
      console.log('[fetchGuests] Coordinator status counts:', statusCounts);
      console.log('[fetchGuests] Coordinator guest countries in DB:', data.map(g => JSON.stringify(g.country)));
    }

    if (error) {
      toast.error('Failed to load guests');
    } else if (data) {
      setGuests(data.map(rowToGuest));
    }
    setIsLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (user?.id && !hasFetched.current) {
      hasFetched.current = true;
      fetchGuests();
    }
    if (!user) {
      // User logged out — reset state
      setGuests([]);
      setIsLoading(false);
      hasFetched.current = false;
    }
  }, [user?.id, fetchGuests]);

  // ── Real-time subscription ───────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('guests-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'guests' },
        (payload) => {
          console.log('[realtime] Guest change:', payload.eventType);

          if (payload.eventType === 'INSERT') {
            const newGuest = rowToGuest(payload.new);
            setGuests(prev => {
              if (prev.find(g => g.id === newGuest.id)) return prev;
              return [newGuest, ...prev];
            });
          }

          if (payload.eventType === 'UPDATE') {
            const updated = rowToGuest(payload.new);
            // Merge updated fields but preserve family_members — they come from a separate
            // table and are not included in the real-time guests row payload.
            setGuests(prev => prev.map(g =>
              g.id === updated.id
                ? { ...updated, familyMembers: g.familyMembers }
                : g,
            ));
          }

          if (payload.eventType === 'DELETE') {
            setGuests(prev => prev.filter(g => g.id !== String(payload.old.id)));
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reference number ────────────────────────────────────────────────────────

  const generateReferenceNumber = useCallback(() => {
    const num = (guests.length + 1).toString().padStart(6, '0');
    return `MEH-2024-${num}`;
  }, [guests.length]);

  // ── Add guest ───────────────────────────────────────────────────────────────

  const addGuest = useCallback(async (
    guestData: Omit<Guest, 'id' | 'referenceNumber' | 'submittedAt' | 'status' | 'resubmitCount' | 'appealStatus'>,
  ): Promise<Guest | null> => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toNull = (val: any) =>
        val === '' || val === undefined || val === null || val === 'undefined' ? null : val;

      const toBool = (val: unknown) => val === true || val === 'true';

      const toInt = (val: unknown) => {
        const n = parseInt(String(val));
        return isNaN(n) ? null : n;
      };

      // Get DB count for reference number
      const { count } = await supabase.from('guests').select('*', { count: 'exact', head: true });
      const reference = `MEH-2024-${String((count ?? 0) + 1).padStart(6, '0')}`;

      const insertData = {
        reference,
        full_name:          toNull(guestData.fullName),
        gender:             toNull(guestData.gender),
        date_of_birth:      toNull(guestData.dateOfBirth),
        age:                guestData.dateOfBirth ? calculateAge(guestData.dateOfBirth) : toInt(guestData.age),
        guest_type:         toNull(guestData.guestType) ?? 'Individual',
        designation:        Array.isArray(guestData.designation) ? (guestData.designation.length > 0 ? guestData.designation : null) : toNull(guestData.designation),
        // Coordinators always use their own country so guests are always visible to them
        country: user?.role === 'coordinator'
          ? (toNull(user.country) ?? toNull(guestData.country))
          : toNull(guestData.country),
        passport_number:    toNull(guestData.passportNumber),
        passport_country:   toNull(guestData.passportCountry),
        contact_number:     toNull(guestData.contactNumber),
        email:              toNull(guestData.email),
        visa_status:        toNull(guestData.visaStatus) ?? 'Not Required',
        wheelchair_required: toBool(guestData.wheelchairRequired),
        special_needs:      toNull(guestData.specialNeeds),
        dietary_requirements: toNull(guestData.dietaryRequirements),
        flight_number:      toNull(guestData.arrivalFlightNumber),
        arrival_date:       cleanDate(guestData.arrival_date),
        arrival_time:       cleanTime(guestData.arrival_time),
        arrival_airport:    toNull(guestData.arrivalAirport),
        arrival_terminal:   toNull(guestData.arrivalTerminal),
        departure_date:     cleanDate(guestData.departure_date),
        departure_time:     cleanTime(guestData.departure_time),
        departure_airport:  toNull(guestData.departureAirport),
        departure_terminal: toNull(guestData.departureTerminal),
        remarks:            null,
        status:             'Awaiting Review',
        appeal_status:      'none',
        submitted_by:       toNull(guestData.submittedBy),
        submitted_at:       new Date().toISOString(),
        resubmit_count:     0,
        religion:           toNull(guestData.religion),
        introduction:       toNull(guestData.introduction),
        is_head_of_family:  toBool(guestData.isHeadOfFamily),
        expenses:           toNull(guestData.expenses) ?? 'Self',
        tabshir_reference:  toNull(guestData.tabshirReference),
        photo_url:          toNull(guestData.photoUrl),
      };

      console.log('[addGuest] Clean insert data:', insertData);

      const { data, error } = await supabase
        .from('guests')
        .insert(insertData)
        .select()
        .single();

      console.log('[addGuest] Supabase response:', { data, error });

      if (error || !data) {
        console.error('[addGuest] Error:', error?.message);
        toast.error(error?.message ?? 'Failed to register guest');
        return null;
      }

      // Insert family members if any
      if (guestData.familyMembers?.length > 0) {
        await supabase.from('family_members').insert(
          guestData.familyMembers.map(m => ({
            guest_id: data.id,
            name:             toNull(m.name),
            age:              toInt(m.age),
            gender:           toNull(m.gender),
            passport_country: toNull(m.passportCountry),
            relationship:     toNull(m.relationship),
            status:       'Awaiting Review',
          })),
        );
      }

      // Refetch full row with family_members
      const { data: full } = await supabase
        .from('guests')
        .select('*, family_members(*)')
        .eq('id', data.id)
        .single();

      const newGuest = rowToGuest(full ?? data);
      // If real-time already inserted this guest, replace it (to get familyMembers);
      // otherwise prepend. This prevents duplicates regardless of timing.
      setGuests(prev =>
        prev.some(g => g.id === newGuest.id)
          ? prev.map(g => g.id === newGuest.id ? newGuest : g)
          : [newGuest, ...prev]
      );
      return newGuest;
    } catch (err) {
      console.error('[addGuest] Exception:', err);
      toast.error('Failed to register guest');
      return null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role, user?.country]);

  // ── Update guest ────────────────────────────────────────────────────────────

  const updateGuest = useCallback(async (id: string, updates: Partial<Guest>): Promise<void> => {
    // If dateOfBirth is being updated, recalculate age from it
    const resolvedUpdates =
      updates.dateOfBirth !== undefined
        ? { ...updates, age: calculateAge(updates.dateOfBirth) ?? updates.age }
        : updates;

    // Optimistic update so the UI responds instantly
    setGuests(prev => prev.map(g => (g.id === id ? { ...g, ...resolvedUpdates } : g)));

    const row = updatesToDbRow(resolvedUpdates);
    row.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('guests')
      .update(row)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      toast.error('Failed to save changes');
      // Revert optimistic update by refetching
      fetchGuests();
    } else if (data) {
      // Sync state with server's canonical response, preserving in-memory fields that
      // have their own dedicated persistence paths (familyMembers, remarks).
      setGuests(prev => prev.map(g =>
        g.id === id
          ? { ...rowToGuest(data), familyMembers: g.familyMembers, remarks: g.remarks }
          : g,
      ));
    }
  }, [fetchGuests]);

  // ── Delete guest (optimistic) ───────────────────────────────────────────────

  const deleteGuest = useCallback((id: string) => {
    setGuests(prev => prev.filter(g => g.id !== id));

    supabase
      .from('guests')
      .delete()
      .eq('id', id)
      .then(({ error }) => {
        if (error) {
          toast.error('Failed to delete guest');
          fetchGuests();
        }
      });
  }, [fetchGuests]);

  // ── Add remark (optimistic, stored as JSONB on the guest row) ──────────────

  const addRemark = useCallback((guestId: string, remark: Omit<GuestRemark, 'id' | 'createdAt'>) => {
    const newRemark: GuestRemark = {
      ...remark,
      id: `r${Date.now()}`,
      createdAt: new Date().toISOString(),
    };

    setGuests(prev =>
      prev.map(g =>
        g.id === guestId
          ? { ...g, remarks: [...(g.remarks ?? []), newRemark] }
          : g,
      ),
    );

    supabase
      .from('guests')
      .select('remarks')
      .eq('id', guestId)
      .single()
      .then(({ data }) => {
        const existing = Array.isArray(data?.remarks) ? data.remarks : [];
        return supabase
          .from('guests')
          .update({ remarks: [...existing, newRemark], updated_at: new Date().toISOString() })
          .eq('id', guestId);
      })
      .then(({ error }) => {
        if (error) toast.error('Failed to save remark');
      });
  }, []);

  // ── Queries ─────────────────────────────────────────────────────────────────

  const getGuestById = useCallback((id: string) => guests.find(g => g.id === id), [guests]);

  const getGuestsByCountry = useCallback(
    (countryCode: string) => guests.filter(g => g.countryCode === countryCode),
    [guests],
  );

  const getGuestsByStatus = useCallback(
    (status: GuestStatus) => guests.filter(g => g.status === status),
    [guests],
  );

  const getMySubmissions = useCallback(() => {
    if (!user) return [];
    return guests.filter(g => g.submittedBy === user.id);
  }, [guests, user]);

  const getMyWaitingGuests = useCallback(() => {
    if (!user) return [];
    return guests.filter(g => g.submittedBy === user.id && g.status === 'Needs Correction');
  }, [guests, user]);

  const getMySubmittedGuests = useCallback(() => {
    if (!user) return [];
    return guests.filter(
      g =>
        g.submittedBy === user.id &&
        (g.status === 'Awaiting Review' || g.status === 'Approved' || g.status === 'Rejected'),
    );
  }, [guests, user]);

  const getNeedsCorrectionCount = useCallback(() => {
    if (!user) return 0;
    return guests.filter(g => g.submittedBy === user.id && g.status === 'Needs Correction').length;
  }, [guests, user]);

  // ── Family member operations ─────────────────────────────────────────────────

  const updateFamilyMember = useCallback((guestId: string, memberId: string, updates: Partial<FamilyMember>) => {
    setGuests(prev =>
      prev.map(g =>
        g.id === guestId
          ? { ...g, familyMembers: g.familyMembers.map(m => (m.id === memberId ? { ...m, ...updates } : m)) }
          : g,
      ),
    );

    const row: Record<string, unknown> = {};
    if (updates.status !== undefined) row.status = updates.status;
    if (updates.assignedDepartment !== undefined) row.assigned_department = updates.assignedDepartment;
    if (updates.assignedDepartmentAt !== undefined) row.assigned_department_at = updates.assignedDepartmentAt;
    if (updates.placedLocation !== undefined) row.placed_location = updates.placedLocation;
    if (updates.placedAt !== undefined) row.placed_at = updates.placedAt;
    if (updates.rejectionReason !== undefined) row.rejection_reason = updates.rejectionReason;

    if (Object.keys(row).length > 0) {
      supabase
        .from('family_members')
        .update(row)
        .eq('id', memberId)
        .then(({ error }) => {
          if (error) toast.error('Failed to update family member');
        });
    }
  }, []);

  const updateFamilyMemberStatus = useCallback(
    (guestId: string, memberId: string, newStatus: FamilyMemberStatus) =>
      updateFamilyMember(guestId, memberId, { status: newStatus }),
    [updateFamilyMember],
  );

  const assignFamilyMemberDepartment = useCallback(
    (guestId: string, memberId: string, department: string) =>
      updateFamilyMember(guestId, memberId, {
        assignedDepartment: department,
        assignedDepartmentAt: new Date().toISOString(),
      }),
    [updateFamilyMember],
  );

  const placeFamilyMember = useCallback(
    (guestId: string, memberId: string, location: string) =>
      updateFamilyMember(guestId, memberId, {
        placedLocation: location,
        placedAt: new Date().toISOString(),
      }),
    [updateFamilyMember],
  );

  const getFamilyStatusSummary = useCallback((guest: Guest) => {
    const all = [
      { status: guest.status as string },
      ...guest.familyMembers.map(m => ({ status: (m.status ?? guest.status) as string })),
    ];
    const approved = all.filter(m => m.status === 'Approved' || m.status === 'Accommodated').length;
    const awaiting = all.filter(m => m.status === 'Awaiting Review').length;
    return { approved, awaiting, total: all.length };
  }, []);

  return (
    <GuestsContext.Provider
      value={{
        guests,
        isLoading,
        addGuest,
        updateGuest,
        deleteGuest,
        addRemark,
        getGuestById,
        getGuestsByCountry,
        getGuestsByStatus,
        getMySubmissions,
        getMyWaitingGuests,
        getMySubmittedGuests,
        getNeedsCorrectionCount,
        generateReferenceNumber,
        updateFamilyMemberStatus,
        assignFamilyMemberDepartment,
        placeFamilyMember,
        getFamilyStatusSummary,
      }}
    >
      {children}
    </GuestsContext.Provider>
  );
}

export function useGuests() {
  const context = useContext(GuestsContext);
  if (context === undefined) throw new Error('useGuests must be used within a GuestsProvider');
  return context;
}
