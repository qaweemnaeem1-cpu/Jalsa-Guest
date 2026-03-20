import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import type { Guest, GuestStatus, GuestRemark, FamilyMember, FamilyMemberStatus } from '@/types';
import { useAuth } from './useAuth';

// ── Context type ───────────────────────────────────────────────────────────────

interface GuestsContextType {
  guests: Guest[];
  isLoading: boolean;
  addGuest: (guestData: Omit<Guest, 'id' | 'referenceNumber' | 'submittedAt' | 'status' | 'resubmitCount' | 'appealStatus'>) => Promise<Guest | null>;
  updateGuest: (id: string, updates: Partial<Guest>) => void;
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToFamilyMember(row: any): FamilyMember {
  return {
    id: String(row.id),
    name: row.name,
    age: row.age,
    relationship: row.relationship,
    gender: row.gender,
    status: row.status ?? undefined,
    assignedDepartment: row.assigned_department ?? undefined,
    assignedDepartmentAt: row.assigned_department_at ?? undefined,
    placedLocation: row.placed_location ?? undefined,
    placedAt: row.placed_at ?? undefined,
    rejectionReason: row.rejection_reason ?? undefined,
    remarks: row.remarks ?? undefined,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToGuest(row: any): Guest {
  return {
    id: String(row.id),
    referenceNumber: row.reference_number,
    fullName: row.full_name,
    country: row.country,
    countryCode: row.country_code,
    gender: row.gender,
    age: row.age,
    dateOfBirth: row.date_of_birth ?? undefined,
    passportNumber: row.passport_number,
    contactNumber: row.contact_number,
    email: row.email ?? undefined,
    visaStatus: row.visa_status,
    visaDetails: row.visa_details ?? undefined,
    guestType: row.guest_type,
    familyMembers: Array.isArray(row.family_members)
      ? row.family_members.map(rowToFamilyMember)
      : [],
    designation: row.designation,
    arrivalFlightNumber: row.arrival_flight_number ?? undefined,
    arrivalAirport: row.arrival_airport ?? undefined,
    arrivalTerminal: row.arrival_terminal ?? undefined,
    arrivalTime: row.arrival_time ?? undefined,
    departureFlightNumber: row.departure_flight_number ?? undefined,
    departureAirport: row.departure_airport ?? undefined,
    departureTerminal: row.departure_terminal ?? undefined,
    departureTime: row.departure_time ?? undefined,
    specialNeeds: row.special_needs ?? undefined,
    dietaryRequirements: row.dietary_requirements ?? undefined,
    wheelchairRequired: row.wheelchair_required ?? false,
    status: row.status,
    submittedBy: row.submitted_by,
    submittedAt: row.submitted_at,
    resubmittedAt: row.resubmitted_at ?? undefined,
    resubmitCount: row.resubmit_count ?? 0,
    reviewedBy: row.reviewed_by ?? undefined,
    reviewedAt: row.reviewed_at ?? undefined,
    rejectionReason: row.rejection_reason ?? undefined,
    appealStatus: row.appeal_status ?? 'none',
    appealReason: row.appeal_reason ?? undefined,
    appealedAt: row.appealed_at ?? undefined,
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
  };
}

/** Convert a camelCase Partial<Guest> to snake_case DB columns */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function updatesToDbRow(updates: Partial<Guest>): Record<string, any> {
  const map: Record<string, string> = {
    referenceNumber: 'reference_number',
    fullName: 'full_name',
    countryCode: 'country_code',
    dateOfBirth: 'date_of_birth',
    passportNumber: 'passport_number',
    contactNumber: 'contact_number',
    visaStatus: 'visa_status',
    visaDetails: 'visa_details',
    guestType: 'guest_type',
    familyMembers: 'family_members', // excluded below
    arrivalFlightNumber: 'arrival_flight_number',
    arrivalAirport: 'arrival_airport',
    arrivalTerminal: 'arrival_terminal',
    arrivalTime: 'arrival_time',
    departureFlightNumber: 'departure_flight_number',
    departureAirport: 'departure_airport',
    departureTerminal: 'departure_terminal',
    departureTime: 'departure_time',
    specialNeeds: 'special_needs',
    dietaryRequirements: 'dietary_requirements',
    wheelchairRequired: 'wheelchair_required',
    submittedBy: 'submitted_by',
    submittedAt: 'submitted_at',
    resubmittedAt: 'resubmitted_at',
    resubmitCount: 'resubmit_count',
    reviewedBy: 'reviewed_by',
    reviewedAt: 'reviewed_at',
    rejectionReason: 'rejection_reason',
    appealStatus: 'appeal_status',
    appealReason: 'appeal_reason',
    appealedAt: 'appealed_at',
    roomAssignment: 'room_assignment',
    assignedDepartment: 'assigned_department',
    assignedDepartmentAt: 'assigned_department_at',
    assignedDepartmentBy: 'assigned_department_by',
    assignedDepartmentByName: 'assigned_department_by_name',
    placedLocation: 'placed_location',
    placedAt: 'placed_at',
    placedBy: 'placed_by',
    placedByName: 'placed_by_name',
    statusHistory: 'status_history',
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row: Record<string, any> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (key === 'familyMembers') continue; // managed via family_members table
    const dbKey = map[key] ?? key;
    row[dbKey] = value;
  }
  return row;
}

// ── Provider ───────────────────────────────────────────────────────────────────

export function GuestsProvider({ children }: { children: ReactNode }) {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  // ── Fetch guests ────────────────────────────────────────────────────────────

  const fetchGuests = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);

    let query = supabase
      .from('guests')
      .select('*, family_members(*)')
      .order('created_at', { ascending: false });

    // Role-based filtering
    if (user.role === 'desk-in-charge' && user.assignedCountries?.length) {
      query = query.in('country', user.assignedCountries);
    } else if (user.role === 'coordinator') {
      query = query.eq('country', user.country ?? '');
    } else if (user.role === 'department-head') {
      query = query.eq('assigned_department', user.department ?? '');
    } else if (user.role === 'location-manager') {
      query = query.eq('placed_location', user.location ?? '');
    }
    // super-admin, transport, accommodation, viewer: no filter

    const { data, error } = await query;
    if (error) {
      toast.error('Failed to load guests');
    } else if (data) {
      setGuests(data.map(rowToGuest));
    }
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    fetchGuests();
  }, [fetchGuests]);

  // ── Reference number ────────────────────────────────────────────────────────

  const generateReferenceNumber = useCallback(() => {
    const num = (guests.length + 1).toString().padStart(6, '0');
    return `MEH-2024-${num}`;
  }, [guests.length]);

  // ── Add guest ───────────────────────────────────────────────────────────────

  const addGuest = useCallback(async (
    guestData: Omit<Guest, 'id' | 'referenceNumber' | 'submittedAt' | 'status' | 'resubmitCount' | 'appealStatus'>,
  ): Promise<Guest | null> => {
    const referenceNumber = generateReferenceNumber();

    const { data, error } = await supabase
      .from('guests')
      .insert({
        reference_number: referenceNumber,
        full_name: guestData.fullName,
        country: guestData.country,
        country_code: guestData.countryCode,
        gender: guestData.gender,
        age: guestData.age,
        date_of_birth: guestData.dateOfBirth,
        passport_number: guestData.passportNumber,
        contact_number: guestData.contactNumber,
        email: guestData.email,
        visa_status: guestData.visaStatus,
        visa_details: guestData.visaDetails,
        guest_type: guestData.guestType,
        designation: guestData.designation,
        arrival_flight_number: guestData.arrivalFlightNumber,
        arrival_airport: guestData.arrivalAirport,
        arrival_terminal: guestData.arrivalTerminal,
        arrival_time: guestData.arrivalTime,
        departure_flight_number: guestData.departureFlightNumber,
        departure_airport: guestData.departureAirport,
        departure_terminal: guestData.departureTerminal,
        departure_time: guestData.departureTime,
        special_needs: guestData.specialNeeds,
        dietary_requirements: guestData.dietaryRequirements,
        wheelchair_required: guestData.wheelchairRequired,
        status: 'Awaiting Review',
        submitted_by: guestData.submittedBy,
        submitted_at: new Date().toISOString(),
        resubmit_count: 0,
        appeal_status: 'none',
        department: guestData.department,
      })
      .select()
      .single();

    if (error || !data) {
      toast.error('Failed to register guest');
      return null;
    }

    // Insert family members if any
    if (guestData.familyMembers?.length > 0) {
      await supabase.from('family_members').insert(
        guestData.familyMembers.map(m => ({
          guest_id: data.id,
          name: m.name,
          age: m.age,
          relationship: m.relationship,
          gender: m.gender,
          status: 'Awaiting Review',
        })),
      );
    }

    // Refetch to get the full row including family_members
    const { data: full } = await supabase
      .from('guests')
      .select('*, family_members(*)')
      .eq('id', data.id)
      .single();

    const newGuest = rowToGuest(full ?? data);
    setGuests(prev => [newGuest, ...prev]);
    return newGuest;
  }, [generateReferenceNumber]);

  // ── Update guest (optimistic) ───────────────────────────────────────────────

  const updateGuest = useCallback((id: string, updates: Partial<Guest>) => {
    // Optimistic update
    setGuests(prev => prev.map(g => (g.id === id ? { ...g, ...updates } : g)));

    const row = updatesToDbRow(updates);
    row.updated_at = new Date().toISOString();

    supabase
      .from('guests')
      .update(row)
      .eq('id', id)
      .then(({ error }) => {
        if (error) {
          toast.error('Failed to save changes');
          // Revert by refetching
          fetchGuests();
        }
      });
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
