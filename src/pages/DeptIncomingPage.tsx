import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Inbox, Eye, MapPin, Search, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { DeptSidebar } from '@/components/DeptSidebar';
import { DeptUserMenu } from '@/components/DeptUserMenu';
import { useDepartments } from '@/hooks/useDepartments';
import { useAuditTrail2 } from '@/hooks/useAuditTrail2';
import { GuestViewModal } from '@/components/GuestViewModal';
import { PlaceGuestDialog } from '@/components/PlaceGuestDialog';
import { FamilyBadge, type FamilyMemberInfo } from '@/components/FamilyBadge';
import { Input } from '@/components/ui/input';
import type { Guest } from '@/types';
import { supabase } from '@/lib/supabase';
import { formatDesignation } from '@/lib/constants';

// ── Location colour palette ───────────────────────────────────────────────────
const LOCATION_COLORS = [
  { dot: 'bg-blue-500' },
  { dot: 'bg-purple-500' },
  { dot: 'bg-teal-500' },
  { dot: 'bg-orange-500' },
  { dot: 'bg-rose-500' },
];

function getLocColor(locations: string[], loc: string) {
  const idx = locations.indexOf(loc);
  return LOCATION_COLORS[(idx >= 0 ? idx : 0) % LOCATION_COLORS.length];
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface PersonRow {
  rowKey: string;
  guestId: string;
  memberId: string | null;
  name: string;
  country: string;
  referenceNumber: string;
  relationship: string;
  isFamily: boolean;
  familyLastName: string;
  familyGroupId: string;
  familyAllMembers: FamilyMemberInfo[];
  assignedDepartmentAt?: string;
  status: string;
  arrivalTime?: string;
  arrivalAirport?: string;
  arrivalFlightNumber?: string;
  departureTime?: string;
  departureAirport?: string;
  designation: string | string[];
}

type RoomOption = {
  id: string;
  name: string;
  capacity: number;
  occupancy: number;
  available_from?: string;
  available_to?: string;
};

// ── Build helpers ─────────────────────────────────────────────────────────────

function buildFamilyMemberListFromGroup(allGuests: Guest[], familyGroupId: string): FamilyMemberInfo[] {
  return allGuests
    .filter(g => g.familyGroupId === familyGroupId)
    .map(g => ({
      name: g.fullName,
      relationship: g.isHeadOfFamily ? 'Head' : (g.relationship ?? '—'),
      status: g.status,
      assignedDepartment: g.assignedDepartment,
      placedLocation: g.placedLocation,
    }));
}

function buildFamilyMemberList(g: Guest): FamilyMemberInfo[] {
  return [
    { name: g.fullName, relationship: 'Head', status: g.status, assignedDepartment: g.assignedDepartment, placedLocation: g.placedLocation },
    ...(g.familyMembers ?? []).map(m => ({
      name: m.name, relationship: m.relationship,
      status: m.status ?? g.status,
      assignedDepartment: m.assignedDepartment, placedLocation: m.placedLocation,
    })),
  ];
}

function buildRows(guests: Guest[], dept: string): PersonRow[] {
  const rows: PersonRow[] = [];
  for (const g of guests) {
    if (g.familyGroupId) {
      if (g.assignedDepartment === dept && !g.placedLocation) {
        const lastName = (g.familyName ?? g.fullName).replace(' Family', '').split(' ').pop() ?? g.fullName;
        rows.push({
          rowKey: g.id, guestId: g.id, memberId: null,
          name: g.fullName, country: g.country, referenceNumber: g.referenceNumber,
          relationship: g.isHeadOfFamily ? 'Head' : (g.relationship ?? '—'),
          isFamily: true, familyLastName: lastName,
          familyGroupId: g.familyGroupId,
          familyAllMembers: buildFamilyMemberListFromGroup(guests, g.familyGroupId),
          assignedDepartmentAt: g.assignedDepartmentAt, status: g.status,
          arrivalTime: g.arrivalTime, arrivalAirport: g.arrivalAirport,
          arrivalFlightNumber: g.arrivalFlightNumber,
          departureTime: g.departureTime, departureAirport: g.departureAirport,
          designation: g.designation,
        });
      }
      continue;
    }
    const isFamily = g.guestType === 'family' && (g.familyMembers?.length ?? 0) > 0;
    const lastName = g.fullName.split(' ').pop() ?? g.fullName;
    const familyAllMembers = isFamily ? buildFamilyMemberList(g) : [];
    if (g.assignedDepartment === dept && !g.placedLocation) {
      rows.push({
        rowKey: g.id, guestId: g.id, memberId: null,
        name: g.fullName, country: g.country, referenceNumber: g.referenceNumber,
        relationship: isFamily ? 'Head' : 'Individual',
        isFamily, familyLastName: lastName, familyGroupId: g.id, familyAllMembers,
        assignedDepartmentAt: g.assignedDepartmentAt, status: g.status,
        arrivalTime: g.arrivalTime, arrivalAirport: g.arrivalAirport,
        arrivalFlightNumber: g.arrivalFlightNumber,
        departureTime: g.departureTime, departureAirport: g.departureAirport,
        designation: g.designation,
      });
    }
    if (isFamily) {
      for (const m of g.familyMembers ?? []) {
        if (m.assignedDepartment === dept && !m.placedLocation) {
          rows.push({
            rowKey: `${g.id}-${m.id}`, guestId: g.id, memberId: m.id,
            name: m.name, country: g.country, referenceNumber: g.referenceNumber,
            relationship: m.relationship,
            isFamily: true, familyLastName: lastName, familyGroupId: g.id, familyAllMembers,
            assignedDepartmentAt: m.assignedDepartmentAt, status: m.status ?? g.status,
            arrivalTime: g.arrivalTime, arrivalAirport: g.arrivalAirport,
            arrivalFlightNumber: g.arrivalFlightNumber,
            departureTime: g.departureTime, departureAirport: g.departureAirport,
            designation: g.designation,
          });
        }
      }
    }
  }
  return rows;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DeptIncomingPage() {
  const { user } = useAuth();
  const { guests, updateGuest, placeFamilyMember } = useGuests();
  const { departments } = useDepartments();
  const { addEntry: addEntry2 } = useAuditTrail2();

  const [viewGuestId, setViewGuestId] = useState<string | null>(null);
  const [placeDialogRow, setPlaceDialogRow] = useState<PersonRow | null>(null);
  const [search, setSearch] = useState('');

  // Inline dropdown state
  const [selectedLocations, setSelectedLocations] = useState<Record<string, string>>({});
  const [selectedRooms, setSelectedRooms] = useState<Record<string, string>>({});
  const [roomsByLocation, setRoomsByLocation] = useState<Record<string, RoomOption[]>>({});
  const [openLocDropdown, setOpenLocDropdown] = useState<string | null>(null);
  const [openRoomDropdown, setOpenRoomDropdown] = useState<string | null>(null);
  const [placingRows, setPlacingRows] = useState<Set<string>>(new Set());
  const [dialogSaving, setDialogSaving] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenLocDropdown(null);
        setOpenRoomDropdown(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const dept = user?.department ?? '';
  const locations = departments[dept] ?? [];

  const allRows = useMemo(() => buildRows(guests, dept), [guests, dept]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter(r =>
      r.name.toLowerCase().includes(q) ||
      r.country.toLowerCase().includes(q) ||
      r.referenceNumber.toLowerCase().includes(q) ||
      r.familyLastName.toLowerCase().includes(q),
    );
  }, [allRows, search]);

  const groupMeta = useMemo(() => {
    const counts = new Map<string, number>();
    const firstRowKey = new Map<string, string>();
    for (const r of filteredRows) {
      if (!r.isFamily) continue;
      const prev = counts.get(r.familyGroupId) ?? 0;
      counts.set(r.familyGroupId, prev + 1);
      if (prev === 0) firstRowKey.set(r.familyGroupId, r.rowKey);
    }
    return { counts, firstRowKey };
  }, [filteredRows]);

  const guestCountByLocation = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const loc of locations) {
      counts[loc] = guests.filter(g => g.placedLocation === loc && g.assignedDepartment === dept).length;
    }
    return counts;
  }, [guests, locations, dept]);

  const viewGuest = useMemo(
    () => guests.find(g => g.id === viewGuestId) ?? null,
    [guests, viewGuestId],
  );

  // ── Room fetching ────────────────────────────────────────────────────────────

  const fetchRoomsForLocation = useCallback(async (locationName: string) => {
    if (roomsByLocation[locationName]) return; // cached

    const { data: locData } = await supabase
      .from('locations').select('id').eq('name', locationName).maybeSingle();
    if (!locData?.id) {
      setRoomsByLocation(prev => ({ ...prev, [locationName]: [] }));
      return;
    }

    const { data: roomData } = await supabase
      .from('rooms')
      .select('id, name, capacity, available_from, available_to')
      .eq('location_id', locData.id)
      .eq('is_active', true)
      .order('name');

    if (!roomData) return;

    const roomIds = roomData.map((r: any) => r.id);
    const { data: beds } = roomIds.length
      ? await supabase.from('bed_assignments').select('room_id').in('room_id', roomIds)
      : { data: [] };
    const occMap: Record<string, number> = {};
    if (beds) for (const b of beds) occMap[b.room_id] = (occMap[b.room_id] ?? 0) + 1;

    setRoomsByLocation(prev => ({
      ...prev,
      [locationName]: roomData.map((r: any) => ({
        id: r.id, name: r.name, capacity: r.capacity,
        occupancy: occMap[r.id] ?? 0,
        available_from: r.available_from ?? undefined,
        available_to: r.available_to ?? undefined,
      })),
    }));
  }, [roomsByLocation]);

  // ── Place action ─────────────────────────────────────────────────────────────

  const handlePlace = useCallback(async (row: PersonRow) => {
    const locationName = selectedLocations[row.rowKey];
    if (!locationName || !user) return;

    const roomId = selectedRooms[row.rowKey];
    const locRooms = roomsByLocation[locationName] ?? [];
    const room = locRooms.find(r => r.id === roomId);
    const now = new Date().toISOString();
    const guest = guests.find(g => g.id === row.guestId);

    setPlacingRows(prev => new Set([...prev, row.rowKey]));

    try {
      if (room) {
        // Check capacity
        const { data: existingBeds } = await supabase
          .from('bed_assignments').select('bed_number').eq('room_id', room.id);
        const nextBed = (existingBeds?.length ?? 0) + 1;
        if (nextBed > room.capacity) {
          toast.error('Room is full');
          return;
        }

        // Date mismatch — warn but proceed
        const guestArrival = row.arrivalTime?.substring(0, 10);
        const guestDeparture = row.departureTime?.substring(0, 10);
        if (
          (room.available_from && guestArrival && guestArrival < room.available_from) ||
          (room.available_to && guestDeparture && guestDeparture > room.available_to)
        ) {
          toast.warning(
            `Date mismatch: guest stay may be outside room availability (${room.available_from ?? '?'} – ${room.available_to ?? '?'})`,
            { duration: 6000 },
          );
        }

        await supabase.from('bed_assignments').insert({
          room_id: room.id, bed_number: nextBed,
          guest_id: row.guestId, guest_name: row.name, assigned_at: now,
        });

        await supabase.from('guests').update({
          placed_location: locationName, placed_at: now, placed_by: user.id,
          room_assignment: room.name,
          status: 'Accommodated',
          accommodated_at: now, accommodated_by: user.id,
          updated_at: now,
        }).eq('id', row.guestId);

        if (row.memberId) {
          placeFamilyMember(row.guestId, row.memberId, locationName);
        } else {
          updateGuest(row.guestId, {
            status: 'Accommodated',
            placedLocation: locationName, placedAt: now, placedBy: user.id,
            roomAssignment: room.name, accommodatedAt: now, accommodatedBy: user.id,
          });
        }

        toast.success(`${row.name} placed at ${locationName} — Room ${room.name} (Bed ${nextBed})`);

        // Bust room cache so occupancy updates
        setRoomsByLocation(prev => { const n = { ...prev }; delete n[locationName]; return n; });
        fetchRoomsForLocation(locationName);
      } else {
        // Location only
        await supabase.from('guests').update({
          placed_location: locationName, placed_at: now, placed_by: user.id,
          status: 'Placed', updated_at: now,
        }).eq('id', row.guestId);

        if (row.memberId) {
          placeFamilyMember(row.guestId, row.memberId, locationName);
        } else {
          updateGuest(row.guestId, {
            status: 'Placed', placedLocation: locationName, placedAt: now, placedBy: user.id,
          });
        }

        toast.success(`${row.name} placed at ${locationName}`);
      }

      if (guest) {
        addEntry2({
          guestId: row.guestId, guestName: row.name, guestReference: guest.referenceNumber,
          locationId: locationName, locationName,
          departmentId: dept, departmentName: dept,
          type: 'guest_placed',
          action: room
            ? `Guest placed at ${locationName} — Room ${room.name}`
            : `Guest placed at ${locationName}`,
          newValue: locationName,
          createdBy: { id: user.id, name: user.name, role: 'department-head' },
          createdAt: now,
        });
      }

      // Clean up row selections (guest leaves the list on next render)
      setSelectedLocations(prev => { const n = { ...prev }; delete n[row.rowKey]; return n; });
      setSelectedRooms(prev => { const n = { ...prev }; delete n[row.rowKey]; return n; });
    } finally {
      setPlacingRows(prev => { const s = new Set(prev); s.delete(row.rowKey); return s; });
    }
  }, [user, selectedLocations, selectedRooms, roomsByLocation, guests, dept,
      addEntry2, updateGuest, placeFamilyMember, fetchRoomsForLocation]);

  // ── Dialog-based placement (fallback) ────────────────────────────────────────

  const handleDialogConfirm = useCallback(async (
    locationName: string,
    room?: { id: string; name: string; capacity: number },
  ) => {
    if (!user || !placeDialogRow) return;
    setDialogSaving(true);
    const now = new Date().toISOString();
    const { guestId, memberId, name } = placeDialogRow;
    const guest = guests.find(g => g.id === guestId);

    try {
      if (room) {
        const { data: existingBeds } = await supabase
          .from('bed_assignments').select('bed_number').eq('room_id', room.id);
        const nextBed = (existingBeds?.length ?? 0) + 1;
        if (nextBed > room.capacity) { toast.error('Room is full'); return; }

        await supabase.from('bed_assignments').insert({
          room_id: room.id, bed_number: nextBed,
          guest_id: guestId, guest_name: name, assigned_at: now,
        });
        await supabase.from('guests').update({
          placed_location: locationName, placed_at: now, placed_by: user.id,
          room_assignment: room.name, status: 'Accommodated',
          accommodated_at: now, accommodated_by: user.id, updated_at: now,
        }).eq('id', guestId);

        if (memberId) placeFamilyMember(guestId, memberId, locationName);
        else updateGuest(guestId, {
          status: 'Accommodated', placedLocation: locationName, placedAt: now, placedBy: user.id,
          roomAssignment: room.name, accommodatedAt: now, accommodatedBy: user.id,
        });
        toast.success(`${name} placed at ${locationName} — Room ${room.name} (Bed ${nextBed})`);
      } else {
        await supabase.from('guests').update({
          placed_location: locationName, placed_at: now, placed_by: user.id,
          status: 'Placed', updated_at: now,
        }).eq('id', guestId);

        if (memberId) placeFamilyMember(guestId, memberId, locationName);
        else updateGuest(guestId, {
          status: 'Placed', placedLocation: locationName, placedAt: now, placedBy: user.id,
        });
        toast.success(`${name} placed at ${locationName}`);
      }

      if (guest) {
        addEntry2({
          guestId, guestName: name, guestReference: guest.referenceNumber,
          locationId: locationName, locationName,
          departmentId: dept, departmentName: dept,
          type: 'guest_placed',
          action: room ? `Guest placed at ${locationName} — Room ${room.name}` : `Guest placed at ${locationName}`,
          newValue: locationName,
          createdBy: { id: user.id, name: user.name, role: 'department-head' },
          createdAt: now,
        });
      }

      setPlaceDialogRow(null);
    } finally {
      setDialogSaving(false);
    }
  }, [user, placeDialogRow, guests, dept, addEntry2, updateGuest, placeFamilyMember]);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <div className="flex">
        <DeptSidebar />
        <main className="flex-1 ml-64">
          <header className="bg-white border-b border-[#E8E3DB] px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Inbox className="w-5 h-5 text-[#2D5A45]" />
                <div>
                  <h1 className="text-2xl font-semibold text-[#1A1A1A]">Incoming Guests</h1>
                  <p className="text-sm text-[#4A4A4A] mt-0.5">Guests assigned to {dept} — awaiting placement</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {allRows.length > 0 && (
                  <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-3 py-1 rounded-full border border-amber-200">
                    {allRows.length} unplaced
                  </span>
                )}
                <DeptUserMenu />
              </div>
            </div>
          </header>

          <div className="p-6 space-y-4">
            {allRows.length > 0 && (
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                <Input
                  placeholder="Search by name, country, reference…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-10 border-[#D4CFC7] focus:border-[#2D5A45] h-10 bg-white"
                />
              </div>
            )}

            {allRows.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#E8E3DB] p-12 text-center">
                <Inbox className="w-12 h-12 mx-auto mb-4 text-[#D4CFC7]" />
                <h2 className="text-base font-semibold text-[#1A1A1A] mb-1">All guests placed</h2>
                <p className="text-sm text-[#4A4A4A]">No incoming guests awaiting placement.</p>
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#E8E3DB] p-10 text-center">
                <Search className="w-10 h-10 mx-auto mb-3 text-[#D4CFC7]" />
                <p className="text-sm font-medium text-[#1A1A1A] mb-1">No results found</p>
                <p className="text-xs text-[#4A4A4A]">Try a different name, country, or reference number.</p>
              </div>
            ) : (
              <div ref={dropdownRef} className="bg-white rounded-xl border border-[#E8E3DB] overflow-visible">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#E8E3DB] bg-[#F9F8F6]">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Ref</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Name</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Country</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Designation</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Arrival</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Departure</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Type</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Location</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Room</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Place</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E3DB]">
                    {filteredRows.map(row => {
                      const selectedLoc = selectedLocations[row.rowKey] ?? '';
                      const selectedRoomId = selectedRooms[row.rowKey] ?? '';
                      const locRooms = selectedLoc ? (roomsByLocation[selectedLoc] ?? []) : [];
                      const selectedRoom = locRooms.find(r => r.id === selectedRoomId);
                      const isPlacing = placingRows.has(row.rowKey);

                      const isFirstInGroup = row.isFamily && groupMeta.firstRowKey.get(row.familyGroupId) === row.rowKey;
                      const groupCount = groupMeta.counts.get(row.familyGroupId) ?? 0;

                      return (
                        <Fragment key={row.rowKey}>
                          {isFirstInGroup && groupCount > 1 && (
                            <tr className="bg-indigo-50 border-b border-indigo-100">
                              <td colSpan={11} className="px-4 py-1.5">
                                <div className="flex items-center gap-2">
                                  <Users className="w-3 h-3 text-indigo-600 shrink-0" />
                                  <span className="text-xs text-indigo-700 font-medium">
                                    {groupCount} members — {row.familyLastName} Family
                                  </span>
                                </div>
                              </td>
                            </tr>
                          )}

                          <tr className="hover:bg-[#F9F8F6]">
                            {/* Reference */}
                            <td className="px-4 py-2.5 font-mono text-xs text-[#4A4A4A] whitespace-nowrap">{row.referenceNumber}</td>

                            {/* Name */}
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <div className="w-8 h-8 bg-[#2D5A45] rounded-full flex items-center justify-center text-white text-sm font-medium shrink-0">
                                  {row.name.charAt(0)}
                                </div>
                                <span className="font-medium text-sm text-[#1A1A1A]">{row.name}</span>
                                {row.isFamily && (
                                  <FamilyBadge
                                    lastName={row.familyLastName}
                                    members={row.familyAllMembers}
                                    currentDept={dept}
                                  />
                                )}
                              </div>
                            </td>

                            {/* Country */}
                            <td className="px-4 py-2.5 text-xs text-[#4A4A4A] whitespace-nowrap">{row.country}</td>

                            {/* Designation */}
                            <td className="px-4 py-2.5 text-xs text-[#4A4A4A]">{formatDesignation(row.designation)}</td>

                            {/* Arrival */}
                            <td className="px-4 py-2.5 whitespace-nowrap">
                              {row.arrivalTime ? (
                                <div>
                                  <div className="text-xs text-[#1A1A1A]">
                                    {new Date(row.arrivalTime).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                    {' '}{new Date(row.arrivalTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                  </div>
                                  {(row.arrivalFlightNumber || row.arrivalAirport) && (
                                    <div className="text-xs text-gray-400">
                                      {[row.arrivalFlightNumber, row.arrivalAirport].filter(Boolean).join(' · ')}
                                    </div>
                                  )}
                                </div>
                              ) : <span className="text-gray-300 text-xs">—</span>}
                            </td>

                            {/* Departure */}
                            <td className="px-4 py-2.5 whitespace-nowrap">
                              {row.departureTime ? (
                                <div>
                                  <div className="text-xs text-[#1A1A1A]">
                                    {new Date(row.departureTime).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                    {' '}{new Date(row.departureTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                  </div>
                                  {row.departureAirport && (
                                    <div className="text-xs text-gray-400">{row.departureAirport}</div>
                                  )}
                                </div>
                              ) : <span className="text-gray-300 text-xs">—</span>}
                            </td>

                            {/* Type */}
                            <td className="px-4 py-2.5">
                              <span className="text-xs text-[#4A4A4A]">{row.relationship}</span>
                            </td>

                            {/* Location dropdown */}
                            <td className="px-3 py-2.5">
                              <div className="relative">
                                <button
                                  onClick={() => {
                                    setOpenRoomDropdown(null);
                                    setOpenLocDropdown(prev => prev === row.rowKey ? null : row.rowKey);
                                  }}
                                  className="flex items-center justify-between gap-1 border border-[#D4CFC7] rounded-md px-2 py-1.5 text-xs bg-white hover:border-[#2D5A45] min-w-[110px] max-w-[130px] transition-colors"
                                >
                                  {selectedLoc ? (
                                    <span className="flex items-center gap-1.5 truncate">
                                      <span className={`w-2 h-2 rounded-full ${getLocColor(locations, selectedLoc).dot} shrink-0`} />
                                      <span className="text-[#1A1A1A] truncate">{selectedLoc}</span>
                                    </span>
                                  ) : (
                                    <span className="text-gray-400 truncate">Location…</span>
                                  )}
                                  <ChevronDown className="w-3 h-3 text-gray-400 shrink-0 ml-1" />
                                </button>
                                {openLocDropdown === row.rowKey && (
                                  <div className="absolute z-50 top-full mt-1 left-0 bg-white border border-[#E8E3DB] rounded-xl shadow-xl min-w-[160px] overflow-hidden">
                                    {locations.map(loc => (
                                      <button
                                        key={loc}
                                        onClick={() => {
                                          setSelectedLocations(prev => ({ ...prev, [row.rowKey]: loc }));
                                          setSelectedRooms(prev => { const n = { ...prev }; delete n[row.rowKey]; return n; });
                                          fetchRoomsForLocation(loc);
                                          setOpenLocDropdown(null);
                                        }}
                                        className={`flex items-center gap-2 w-full px-3 py-2 text-xs text-left hover:bg-[#F5F0E8] transition-colors ${selectedLoc === loc ? 'bg-[#F5F0E8] font-medium' : ''}`}
                                      >
                                        <span className={`w-2 h-2 rounded-full ${getLocColor(locations, loc).dot} shrink-0`} />
                                        <span className="text-[#1A1A1A]">{loc}</span>
                                        <span className="ml-auto text-gray-400 text-xs">
                                          {guestCountByLocation[loc] ?? 0}
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Room dropdown */}
                            <td className="px-3 py-2.5">
                              <div className="relative">
                                <button
                                  disabled={!selectedLoc}
                                  onClick={() => {
                                    setOpenLocDropdown(null);
                                    setOpenRoomDropdown(prev => prev === row.rowKey ? null : row.rowKey);
                                  }}
                                  className="flex items-center justify-between gap-1 border border-[#D4CFC7] rounded-md px-2 py-1.5 text-xs bg-white hover:border-[#2D5A45] min-w-[120px] max-w-[150px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {!selectedLoc ? (
                                    <span className="text-gray-400 truncate">Location first</span>
                                  ) : selectedRoom ? (
                                    <span className="flex items-center gap-1.5 truncate">
                                      <span className={`w-2 h-2 rounded-full shrink-0 ${
                                        selectedRoom.occupancy >= selectedRoom.capacity ? 'bg-red-400'
                                        : selectedRoom.capacity - selectedRoom.occupancy <= 1 ? 'bg-amber-400'
                                        : 'bg-emerald-400'
                                      }`} />
                                      <span className="text-[#1A1A1A] truncate">{selectedRoom.name}</span>
                                    </span>
                                  ) : (
                                    <span className="text-gray-400 truncate">Room (opt.)</span>
                                  )}
                                  <ChevronDown className="w-3 h-3 text-gray-400 shrink-0 ml-1" />
                                </button>
                                {openRoomDropdown === row.rowKey && selectedLoc && (
                                  <div className="absolute z-50 top-full mt-1 left-0 bg-white border border-[#E8E3DB] rounded-xl shadow-xl w-52 overflow-hidden">
                                    {/* Clear / no room */}
                                    <button
                                      onClick={() => {
                                        setSelectedRooms(prev => { const n = { ...prev }; delete n[row.rowKey]; return n; });
                                        setOpenRoomDropdown(null);
                                      }}
                                      className="w-full px-3 py-2 text-xs text-left text-gray-400 italic hover:bg-[#F5F0E8] border-b border-[#E8E3DB] transition-colors"
                                    >
                                      No room — place only
                                    </button>
                                    {locRooms.length === 0 ? (
                                      <div className="px-3 py-3 text-xs text-gray-400 text-center">No rooms found</div>
                                    ) : locRooms.map(room => {
                                      const isFull = room.occupancy >= room.capacity;
                                      const almostFull = !isFull && (room.capacity - room.occupancy) <= 1;
                                      const guestArrival = row.arrivalTime?.substring(0, 10);
                                      const guestDep = row.departureTime?.substring(0, 10);
                                      const hasMismatch = !!(
                                        (room.available_from && guestArrival && guestArrival < room.available_from) ||
                                        (room.available_to && guestDep && guestDep > room.available_to)
                                      );
                                      const dotColor = isFull ? 'bg-red-400' : almostFull ? 'bg-amber-400' : 'bg-emerald-400';
                                      return (
                                        <button
                                          key={room.id}
                                          disabled={isFull}
                                          onClick={() => {
                                            setSelectedRooms(prev => ({ ...prev, [row.rowKey]: room.id }));
                                            setOpenRoomDropdown(null);
                                          }}
                                          className={`flex items-center justify-between w-full px-3 py-2 text-xs text-left transition-colors border-b border-[#E8E3DB] last:border-0 ${isFull ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#F5F0E8]'} ${selectedRoomId === room.id ? 'bg-emerald-50' : ''}`}
                                        >
                                          <span className="flex items-center gap-1.5 min-w-0">
                                            <span className={`w-2 h-2 rounded-full ${dotColor} shrink-0`} />
                                            <span className="text-[#1A1A1A] truncate">{room.name}</span>
                                            {hasMismatch && <span className="text-amber-500 shrink-0">⚠</span>}
                                          </span>
                                          <span className="text-gray-400 shrink-0 ml-2">
                                            {room.occupancy}/{room.capacity}
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Place button */}
                            <td className="px-3 py-2.5">
                              <button
                                onClick={() => handlePlace(row)}
                                disabled={!selectedLoc || isPlacing}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-[#2D5A45] text-white hover:bg-[#234839] disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                              >
                                <MapPin className="w-3 h-3 shrink-0" />
                                {isPlacing ? 'Saving…' : selectedRoomId ? 'Place + Room' : 'Place'}
                              </button>
                            </td>

                            {/* Actions */}
                            <td className="px-4 py-2.5">
                              <div className="flex items-center justify-end gap-1">
                                {row.memberId === null && (
                                  <button
                                    onClick={() => setViewGuestId(row.guestId)}
                                    className="p-1.5 rounded-lg text-[#4A4A4A] hover:bg-[#F5F0E8] hover:text-[#2D5A45] transition-colors"
                                    title="View guest"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                )}
                                <button
                                  onClick={() => setPlaceDialogRow(row)}
                                  className="p-1.5 rounded-lg text-[#4A4A4A] hover:bg-[#F5F0E8] hover:text-[#2D5A45] transition-colors"
                                  title="Place via dialog"
                                >
                                  <MapPin className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>

      <GuestViewModal
        guest={viewGuest}
        open={!!viewGuestId}
        onClose={() => setViewGuestId(null)}
      />

      {placeDialogRow && (
        <PlaceGuestDialog
          open={!!placeDialogRow}
          onClose={() => setPlaceDialogRow(null)}
          mode="place"
          guestName={placeDialogRow.name}
          guestCountry={placeDialogRow.country}
          arrivalTime={placeDialogRow.arrivalTime}
          arrivalAirport={placeDialogRow.arrivalAirport}
          arrivalFlightNumber={placeDialogRow.arrivalFlightNumber}
          departureTime={placeDialogRow.departureTime}
          departureAirport={placeDialogRow.departureAirport}
          locations={locations}
          guestCountByLocation={guestCountByLocation}
          saving={dialogSaving}
          onConfirm={handleDialogConfirm}
        />
      )}
    </div>
  );
}
