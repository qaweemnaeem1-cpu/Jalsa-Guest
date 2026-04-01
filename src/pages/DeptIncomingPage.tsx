import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Inbox, Eye, Check, Search, Users, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { DeptSidebar } from '@/components/DeptSidebar';
import { DeptUserMenu } from '@/components/DeptUserMenu';
import { useDepartments } from '@/hooks/useDepartments';
import { useAuditTrail2 } from '@/hooks/useAuditTrail2';
import { GuestViewModal } from '@/components/GuestViewModal';
import { FamilyBadge, type FamilyMemberInfo } from '@/components/FamilyBadge';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { Guest } from '@/types';
import { supabase } from '@/lib/supabase';
import { formatDesignation } from '@/lib/constants';

// ── Location colour palette ──────────────────────────────────────────────────
const LOCATION_COLORS = [
  { dot: 'bg-blue-500',   ring: 'ring-blue-200',   text: 'text-blue-700',   bg: 'bg-blue-50'   },
  { dot: 'bg-purple-500', ring: 'ring-purple-200', text: 'text-purple-700', bg: 'bg-purple-50' },
  { dot: 'bg-teal-500',   ring: 'ring-teal-200',   text: 'text-teal-700',   bg: 'bg-teal-50'   },
  { dot: 'bg-orange-500', ring: 'ring-orange-200', text: 'text-orange-700', bg: 'bg-orange-50' },
  { dot: 'bg-rose-500',   ring: 'ring-rose-200',   text: 'text-rose-700',   bg: 'bg-rose-50'   },
];

// A flattened row representing a single person (head or family member)
interface PersonRow {
  rowKey: string;
  guestId: string;
  memberId: string | null; // null = the head guest itself
  name: string;
  country: string;
  referenceNumber: string;
  relationship: string;
  isFamily: boolean;
  familyLastName: string;
  familyGroupId: string; // = guestId, used to cluster siblings
  familyAllMembers: FamilyMemberInfo[];
  assignedDepartmentAt?: string;
  status: string;
  arrivalTime?: string;
  arrivalAirport?: string;
  arrivalFlightNumber?: string;
  departureTime?: string;
  departureAirport?: string;
  designation: string | string[];
  roomAssignment?: string;
}

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
  const head: FamilyMemberInfo = {
    name: g.fullName,
    relationship: 'Head',
    status: g.status,
    assignedDepartment: g.assignedDepartment,
    placedLocation: g.placedLocation,
  };
  const rest: FamilyMemberInfo[] = (g.familyMembers ?? []).map(m => ({
    name: m.name,
    relationship: m.relationship,
    status: m.status ?? g.status,
    assignedDepartment: m.assignedDepartment,
    placedLocation: m.placedLocation,
  }));
  return [head, ...rest];
}

function buildRows(guests: Guest[], dept: string): PersonRow[] {
  const rows: PersonRow[] = [];
  for (const g of guests) {
    // New model: guest has familyGroupId — it IS its own row
    if (g.familyGroupId) {
      if (g.assignedDepartment === dept && !g.placedLocation) {
        const lastName = (g.familyName ?? g.fullName).replace(' Family', '').split(' ').pop() ?? g.fullName;
        rows.push({
          rowKey: g.id,
          guestId: g.id,
          memberId: null,
          name: g.fullName,
          country: g.country,
          referenceNumber: g.referenceNumber,
          relationship: g.isHeadOfFamily ? 'Head' : (g.relationship ?? '—'),
          isFamily: true,
          familyLastName: lastName,
          familyGroupId: g.familyGroupId,
          familyAllMembers: buildFamilyMemberListFromGroup(guests, g.familyGroupId),
          assignedDepartmentAt: g.assignedDepartmentAt,
          status: g.status,
          arrivalTime: g.arrivalTime,
          arrivalAirport: g.arrivalAirport,
          arrivalFlightNumber: g.arrivalFlightNumber,
          departureTime: g.departureTime,
          departureAirport: g.departureAirport,
          designation: g.designation,
        });
      }
      continue;
    }

    // Old model: single guest row with familyMembers sub-array
    const isFamily = g.guestType === 'family' && (g.familyMembers?.length ?? 0) > 0;
    const lastName = g.fullName.split(' ').pop() ?? g.fullName;
    const familyAllMembers = isFamily ? buildFamilyMemberList(g) : [];

    if (g.assignedDepartment === dept && !g.placedLocation) {
      rows.push({
        rowKey: g.id,
        guestId: g.id,
        memberId: null,
        name: g.fullName,
        country: g.country,
        referenceNumber: g.referenceNumber,
        relationship: isFamily ? 'Head' : 'Individual',
        isFamily,
        familyLastName: lastName,
        familyGroupId: g.id,
        familyAllMembers,
        assignedDepartmentAt: g.assignedDepartmentAt,
        status: g.status,
        arrivalTime: g.arrivalTime,
        arrivalAirport: g.arrivalAirport,
        arrivalFlightNumber: g.arrivalFlightNumber,
        departureTime: g.departureTime,
        departureAirport: g.departureAirport,
        designation: g.designation,
      });
    }

    if (isFamily) {
      for (const m of g.familyMembers ?? []) {
        if (m.assignedDepartment === dept && !m.placedLocation) {
          rows.push({
            rowKey: `${g.id}-${m.id}`,
            guestId: g.id,
            memberId: m.id,
            name: m.name,
            country: g.country,
            referenceNumber: g.referenceNumber,
            relationship: m.relationship,
            isFamily: true,
            familyLastName: lastName,
            familyGroupId: g.id,
            familyAllMembers,
            assignedDepartmentAt: m.assignedDepartmentAt,
            status: m.status ?? g.status,
            // Family members inherit flight info from parent guest
            arrivalTime: g.arrivalTime,
            arrivalAirport: g.arrivalAirport,
            arrivalFlightNumber: g.arrivalFlightNumber,
            departureTime: g.departureTime,
            departureAirport: g.departureAirport,
            designation: g.designation,
          });
        }
      }
    }
  }
  return rows;
}

interface PendingPlacement {
  rowKey: string;
  guestId: string;
  memberId: string | null;
  name: string;
  location: string;
}

interface BulkPending {
  guestId: string;
  location: string;
  rows: PersonRow[];
}

export default function DeptIncomingPage() {
  const { user } = useAuth();
  const { guests, updateGuest, placeFamilyMember } = useGuests();
  const { departments } = useDepartments();
  const { addEntry: addEntry2 } = useAuditTrail2();

  const [viewGuestId, setViewGuestId] = useState<string | null>(null);
  const [pendingPlacement, setPendingPlacement] = useState<PendingPlacement | null>(null);
  const [bulkPending, setBulkPending] = useState<BulkPending | null>(null);
  const [selectedLocations, setSelectedLocations] = useState<Record<string, string>>({});
  const [bulkLocations, setBulkLocations] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');

  const [selectedRooms, setSelectedRooms] = useState<Record<string, string>>({}); // rowKey → roomId
  const [roomsByLocation, setRoomsByLocation] = useState<Record<string, Array<{
    id: string; name: string; capacity: number; available_from?: string; available_to?: string; occupancy: number;
  }>>>({}); // locationName → rooms
  const [dateMismatch, setDateMismatch] = useState<{
    rowKey: string; guestId: string; memberId: string | null; name: string;
    roomId: string; roomName: string;
    guestArrival?: string; guestDeparture?: string;
    roomFrom?: string; roomTo?: string;
  } | null>(null);
  const [openLocationDropdown, setOpenLocationDropdown] = useState<string | null>(null);
  const [openRoomDropdown, setOpenRoomDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenLocationDropdown(null);
        setOpenRoomDropdown(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const dept = user?.department ?? '';
  const locations = departments[dept] ?? [];

  const getLocationColor = useCallback((loc: string) => {
    const idx = locations.indexOf(loc);
    return LOCATION_COLORS[(idx >= 0 ? idx : 0) % LOCATION_COLORS.length];
  }, [locations]);

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

  // Precompute group metadata for bulk banner
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

  const viewGuest = useMemo(
    () => guests.find(g => g.id === viewGuestId) ?? null,
    [guests, viewGuestId],
  );

  // Fetch rooms whenever a location is selected for any row
  useEffect(() => {
    for (const locationName of Object.values(selectedLocations)) {
      if (locationName) {
        fetchRoomsForLocation(locationName);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLocations]);

  const fetchRoomsForLocation = async (locationName: string) => {
    if (roomsByLocation[locationName]) return; // cached
    const { data } = await supabase
      .from('rooms')
      .select('id, name, capacity, available_from, available_to')
      .eq('is_active', true)
      .order('name');
    if (!data) return;
    // Filter by location — rooms table has location_id which may be a UUID or name
    // Fetch the location id first
    const { data: locData } = await supabase
      .from('locations')
      .select('id')
      .eq('name', locationName)
      .maybeSingle();
    const locationId = locData?.id;
    const filtered = locationId
      ? data.filter((r: any) => r.location_id === locationId)
      : data;
    // Get occupancy counts
    const { data: beds } = await supabase
      .from('bed_assignments')
      .select('room_id');
    const occMap: Record<string, number> = {};
    if (beds) { for (const b of beds) { occMap[b.room_id] = (occMap[b.room_id] ?? 0) + 1; } }
    setRoomsByLocation(prev => ({
      ...prev,
      [locationName]: filtered.map((r: any) => ({
        id: r.id, name: r.name, capacity: r.capacity,
        available_from: r.available_from ?? undefined,
        available_to: r.available_to ?? undefined,
        occupancy: occMap[r.id] ?? 0,
      })),
    }));
  };

  const assignRoom = async (row: PersonRow, roomId: string) => {
    const locationName = selectedLocations[row.rowKey] ?? '';
    const rooms = roomsByLocation[locationName] ?? [];
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;

    const guest = guests.find(g => g.id === row.guestId);

    // Date mismatch check
    const guestArrival = guest?.arrivalTime?.substring(0, 10); // YYYY-MM-DD
    const guestDeparture = guest?.departureTime?.substring(0, 10);
    const mismatch = (room.available_from && guestArrival && guestArrival < room.available_from) ||
      (room.available_to && guestDeparture && guestDeparture > room.available_to);

    if (mismatch) {
      setDateMismatch({
        rowKey: row.rowKey, guestId: row.guestId, memberId: row.memberId, name: row.name,
        roomId, roomName: room.name,
        guestArrival, guestDeparture,
        roomFrom: room.available_from, roomTo: room.available_to,
      });
      return;
    }

    await doAssignRoom(row, roomId, room.name, room.capacity);
  };

  const doAssignRoom = async (row: PersonRow, roomId: string, roomName: string, roomCapacity: number) => {
    if (!user) return;

    // Find next bed
    const { data: beds } = await supabase
      .from('bed_assignments')
      .select('bed_number')
      .eq('room_id', roomId);
    const nextBed = (beds?.length ?? 0) + 1;
    if (nextBed > roomCapacity) {
      toast.error('Room is full');
      return;
    }

    const now = new Date().toISOString();

    // Insert bed_assignment
    await supabase.from('bed_assignments').insert({
      room_id: roomId,
      bed_number: nextBed,
      guest_id: row.guestId,
      guest_name: row.name,
      assigned_at: now,
    });

    // Update guest
    await supabase.from('guests').update({
      room_assignment: roomName,
      status: 'Accommodated',
      accommodated_at: now,
      accommodated_by: user.id,
    }).eq('id', row.guestId);

    // Update local state via updateGuest
    updateGuest(row.guestId, {
      roomAssignment: roomName,
      status: 'Accommodated',
      accommodatedAt: now,
      accommodatedBy: user.id,
    });

    toast.success(`${row.name} assigned to ${roomName} (Bed ${nextBed})`);
    setSelectedRooms(prev => { const n = { ...prev }; delete n[row.rowKey]; return n; });

    // Invalidate room cache for this location
    const locationName = selectedLocations[row.rowKey] ?? '';
    setRoomsByLocation(prev => { const n = { ...prev }; delete n[locationName]; return n; });
  };

  const handleConfirmPlacement = () => {
    if (!pendingPlacement || !user) return;
    const { guestId, memberId, location, name } = pendingPlacement;
    const guest = guests.find(g => g.id === guestId);
    if (memberId) {
      placeFamilyMember(guestId, memberId, location);
    } else {
      updateGuest(guestId, {
        status: 'Placed',
        placedLocation: location,
        placedAt: new Date().toISOString(),
        placedBy: user.id,
      });
    }
    if (guest) {
      addEntry2({
        guestId, guestName: name, guestReference: guest.referenceNumber,
        locationId: location, locationName: location,
        departmentId: dept, departmentName: dept,
        type: 'guest_placed',
        action: `Guest placed at ${location}`,
        newValue: location,
        createdBy: { id: user.id, name: user.name, role: 'department-head' },
        createdAt: new Date().toISOString(),
      });
    }
    toast.success(`${name} placed at ${location}`);
    setSelectedLocations(prev => {
      const next = { ...prev };
      delete next[pendingPlacement.rowKey];
      return next;
    });
    setPendingPlacement(null);
  };

  const handleConfirmBulk = () => {
    if (!bulkPending || !user) return;
    const { guestId, location, rows } = bulkPending;
    const guest = guests.find(g => g.id === guestId);
    for (const r of rows) {
      if (r.memberId) {
        placeFamilyMember(guestId, r.memberId, location);
      } else {
        updateGuest(guestId, {
          status: 'Placed',
          placedLocation: location,
          placedAt: new Date().toISOString(),
          placedBy: user.id,
        });
      }
      if (guest) {
        addEntry2({
          guestId, guestName: r.name, guestReference: guest.referenceNumber,
          locationId: location, locationName: location,
          departmentId: dept, departmentName: dept,
          type: 'guest_placed',
          action: `Guest placed at ${location}`,
          newValue: location,
          createdBy: { id: user.id, name: user.name, role: 'department-head' },
          createdAt: new Date().toISOString(),
        });
      }
    }
    toast.success(`${rows.length} members placed at ${location}`);
    setBulkLocations(prev => {
      const next = { ...prev };
      delete next[guestId];
      return next;
    });
    setBulkPending(null);
  };

  const placeRow = (row: PersonRow) => {
    const selected = selectedLocations[row.rowKey] ?? '';
    if (!selected) { toast.error('Please select a location first'); return; }
    setPendingPlacement({ rowKey: row.rowKey, guestId: row.guestId, memberId: row.memberId, name: row.name, location: selected });
  };

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
                      <th className="text-left px-4 py-3 text-sm font-semibold text-[#4A4A4A] uppercase tracking-wider">Reference</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-[#4A4A4A] uppercase tracking-wider">Name</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-[#4A4A4A] uppercase tracking-wider">Designation</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-[#4A4A4A] uppercase tracking-wider">Arrival</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-[#4A4A4A] uppercase tracking-wider">Departure</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-[#4A4A4A] uppercase tracking-wider">Assign Location</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-[#4A4A4A] uppercase tracking-wider">Assign Room</th>
                      <th className="text-right px-4 py-3 text-sm font-semibold text-[#4A4A4A] uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E3DB]">
                    {filteredRows.map(row => {
                      const selected = selectedLocations[row.rowKey] ?? '';
                      const isFirstInGroup =
                        row.isFamily &&
                        groupMeta.firstRowKey.get(row.familyGroupId) === row.rowKey;
                      const groupCount = groupMeta.counts.get(row.familyGroupId) ?? 0;
                      const showBulkBanner = isFirstInGroup && groupCount > 1;
                      const bulkLoc = bulkLocations[row.familyGroupId] ?? '';

                      // Collect sibling rows in this group for bulk action
                      const siblingRows = showBulkBanner
                        ? filteredRows.filter(r => r.familyGroupId === row.familyGroupId)
                        : [];

                      return (
                        <Fragment key={row.rowKey}>
                          {/* Bulk assignment banner — rendered before first sibling row */}
                          {showBulkBanner && (
                            <tr className="bg-indigo-50 border-b border-indigo-100">
                              <td colSpan={8} className="px-4 py-2">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-2">
                                    <Users className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                    <span className="text-xs text-indigo-700 font-medium">
                                      {groupCount} members from {row.familyLastName} Family — assign all to the same location?
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <select
                                      value={bulkLoc}
                                      onChange={e => setBulkLocations(prev => ({ ...prev, [row.familyGroupId]: e.target.value }))}
                                      className="border border-indigo-200 rounded-lg px-2 py-1 text-xs text-[#1A1A1A] bg-white focus:outline-none focus:border-indigo-400 min-w-[130px]"
                                    >
                                      <option value="">Select location…</option>
                                      {locations.map(loc => (
                                        <option key={loc} value={loc}>{loc}</option>
                                      ))}
                                    </select>
                                    <button
                                      disabled={!bulkLoc}
                                      onClick={() => {
                                        if (bulkLoc) setBulkPending({ guestId: row.familyGroupId, location: bulkLoc, rows: siblingRows });
                                        else toast.error('Please select a location first');
                                      }}
                                      className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    >
                                      <Check className="w-3 h-3" />
                                      Assign All
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}

                          {/* Person row */}
                          <tr className="hover:bg-[#F9F8F6]">
                            <td className="px-4 py-3 font-mono text-sm text-[#4A4A4A]">{row.referenceNumber}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5 flex-wrap">
                                <div className="w-9 h-9 bg-[#2D5A45] rounded-full flex items-center justify-center text-white text-base font-medium shrink-0">
                                  {row.name.charAt(0)}
                                </div>
                                <span className="font-medium text-base text-[#1A1A1A]">{row.name}</span>
                                {row.isFamily && (
                                  <FamilyBadge
                                    lastName={row.familyLastName}
                                    members={row.familyAllMembers}
                                    currentDept={dept}
                                  />
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-[#4A4A4A] text-sm">{formatDesignation(row.designation)}</td>
                            <td className="px-4 py-3">
                              {row.arrivalTime ? (
                                <div>
                                  <div className="text-sm text-[#1A1A1A]">
                                    {new Date(row.arrivalTime).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    {' '}
                                    {new Date(row.arrivalTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                  </div>
                                  {(row.arrivalFlightNumber || row.arrivalAirport) && (
                                    <div className="text-xs text-gray-400">
                                      {[row.arrivalFlightNumber, row.arrivalAirport].filter(Boolean).join(' · ')}
                                    </div>
                                  )}
                                </div>
                              ) : <span className="text-gray-400">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              {row.departureTime ? (
                                <div>
                                  <div className="text-sm text-[#1A1A1A]">
                                    {new Date(row.departureTime).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    {' '}
                                    {new Date(row.departureTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                  </div>
                                  {row.departureAirport && (
                                    <div className="text-xs text-gray-400">
                                      {row.departureAirport}
                                    </div>
                                  )}
                                </div>
                              ) : <span className="text-gray-400">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              <div className="relative">
                                <button
                                  onClick={() => {
                                    setOpenRoomDropdown(null);
                                    setOpenLocationDropdown(prev => prev === row.rowKey ? null : row.rowKey);
                                  }}
                                  className="flex items-center justify-between gap-2 border border-[#D4CFC7] rounded-lg px-3 py-2 text-sm bg-white hover:border-[#2D5A45] min-w-[160px] transition-colors"
                                >
                                  {selected ? (
                                    <span className="flex items-center gap-2">
                                      <span className={`w-2.5 h-2.5 rounded-full ${getLocationColor(selected).dot} shrink-0`} />
                                      <span className="text-[#1A1A1A]">{selected}</span>
                                    </span>
                                  ) : (
                                    <span className="text-gray-400">Select location…</span>
                                  )}
                                  <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                                </button>
                                {openLocationDropdown === row.rowKey && (
                                  <div className="absolute z-50 top-full mt-1 left-0 bg-white border border-[#E8E3DB] rounded-xl shadow-xl min-w-[180px] overflow-hidden">
                                    {locations.map(loc => {
                                      const color = getLocationColor(loc);
                                      return (
                                        <button
                                          key={loc}
                                          onClick={() => {
                                            setSelectedLocations(prev => ({ ...prev, [row.rowKey]: loc }));
                                            fetchRoomsForLocation(loc);
                                            setOpenLocationDropdown(null);
                                          }}
                                          className={`flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-left transition-colors hover:bg-[#F5F0E8] ${selected === loc ? 'bg-[#F5F0E8] font-medium' : ''}`}
                                        >
                                          <span className={`w-2.5 h-2.5 rounded-full ${color.dot} shrink-0`} />
                                          <span className="text-[#1A1A1A]">{loc}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {(() => {
                                const hasLocation = !!selectedLocations[row.rowKey];
                                const locRooms = hasLocation ? (roomsByLocation[selectedLocations[row.rowKey]] ?? []) : [];
                                const selectedRoom = locRooms.find(r => r.id === selectedRooms[row.rowKey]);
                                return (
                                  <div className="relative">
                                    <button
                                      disabled={!hasLocation}
                                      onClick={() => {
                                        setOpenLocationDropdown(null);
                                        setOpenRoomDropdown(prev => prev === row.rowKey ? null : row.rowKey);
                                      }}
                                      className="flex items-center justify-between gap-2 border border-[#D4CFC7] rounded-lg px-3 py-2 text-sm bg-white hover:border-[#2D5A45] min-w-[180px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      {!hasLocation ? (
                                        <span className="text-gray-400 text-xs">Assign location first</span>
                                      ) : selectedRoom ? (
                                        <span className="text-[#1A1A1A] truncate">{selectedRoom.name}</span>
                                      ) : (
                                        <span className="text-gray-400">Select room…</span>
                                      )}
                                      <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                                    </button>
                                    {openRoomDropdown === row.rowKey && hasLocation && (
                                      <div className="absolute z-50 top-full mt-1 left-0 bg-white border border-[#E8E3DB] rounded-xl shadow-xl w-72 overflow-hidden">
                                        {locRooms.length === 0 ? (
                                          <div className="px-4 py-4 text-sm text-gray-400 text-center">No rooms available</div>
                                        ) : locRooms.map(room => {
                                          const isFull = room.occupancy >= room.capacity;
                                          const guestArrival = guests.find(g => g.id === row.guestId)?.arrivalTime?.substring(0, 10);
                                          const guestDeparture = guests.find(g => g.id === row.guestId)?.departureTime?.substring(0, 10);
                                          const hasMismatch = !!(
                                            (room.available_from && guestArrival && guestArrival < room.available_from) ||
                                            (room.available_to && guestDeparture && guestDeparture > room.available_to)
                                          );
                                          const fillPct = room.capacity > 0 ? Math.round((room.occupancy / room.capacity) * 100) : 0;
                                          const isSelected = selectedRooms[row.rowKey] === room.id;
                                          return (
                                            <button
                                              key={room.id}
                                              disabled={isFull}
                                              onClick={() => {
                                                setSelectedRooms(prev => ({ ...prev, [row.rowKey]: room.id }));
                                                setOpenRoomDropdown(null);
                                              }}
                                              className={`flex flex-col gap-1.5 w-full px-4 py-3 text-left border-b border-[#E8E3DB] last:border-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isSelected ? 'bg-emerald-50' : 'hover:bg-[#F5F0E8]'}`}
                                            >
                                              <div className="flex items-center justify-between gap-2">
                                                <span className="text-sm font-medium text-[#1A1A1A] flex items-center gap-1.5">
                                                  {isFull && <span className="text-red-500">●</span>}
                                                  {!isFull && hasMismatch && <span className="text-amber-500">⚠</span>}
                                                  {!isFull && !hasMismatch && <span className="text-emerald-500">●</span>}
                                                  {room.name}
                                                </span>
                                                <span className="text-xs text-[#4A4A4A] shrink-0">{room.occupancy}/{room.capacity}</span>
                                              </div>
                                              <div className="w-full bg-gray-100 rounded-full h-1.5">
                                                <div
                                                  className={`h-1.5 rounded-full transition-all ${isFull ? 'bg-red-400' : fillPct > 70 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                                                  style={{ width: `${fillPct}%` }}
                                                />
                                              </div>
                                              {(room.available_from || room.available_to || hasMismatch) && (
                                                <div className="text-xs text-gray-400 flex items-center gap-1">
                                                  {room.available_from && room.available_to
                                                    ? `${new Date(room.available_from + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${new Date(room.available_to + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                                                    : room.available_from ? `From ${room.available_from}` : room.available_to ? `Until ${room.available_to}` : ''}
                                                  {hasMismatch && <span className="text-amber-500 font-medium">· date mismatch</span>}
                                                </div>
                                              )}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-2">
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
                                  onClick={() => placeRow(row)}
                                  disabled={!selected}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-[#2D5A45] text-white hover:bg-[#234839] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  Place
                                </button>
                                <button
                                  onClick={() => selectedRooms[row.rowKey] && assignRoom(row, selectedRooms[row.rowKey])}
                                  disabled={!selectedRooms[row.rowKey]}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                  Assign Room
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

      {/* Individual placement confirmation */}
      <AlertDialog open={!!pendingPlacement} onOpenChange={o => { if (!o) setPendingPlacement(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Placement</AlertDialogTitle>
            <AlertDialogDescription>
              Assign <strong>{pendingPlacement?.name}</strong> to <strong>{pendingPlacement?.location}</strong>?
              This will move them to the Placed list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmPlacement}
              className="bg-[#2D5A45] hover:bg-[#234839] text-white"
            >
              Confirm Placement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk placement confirmation */}
      <AlertDialog open={!!bulkPending} onOpenChange={o => { if (!o) setBulkPending(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Assign All Family Members</AlertDialogTitle>
            <AlertDialogDescription>
              Assign all <strong>{bulkPending?.rows.length} members</strong> to{' '}
              <strong>{bulkPending?.location}</strong>? Each will be moved to the Placed list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmBulk}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              Assign All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Date mismatch confirmation */}
      <AlertDialog open={!!dateMismatch} onOpenChange={o => { if (!o) setDateMismatch(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Date Mismatch
            </AlertDialogTitle>
            <AlertDialogDescription>
              {dateMismatch && (
                <span>
                  Guest arrives on {dateMismatch.guestArrival ?? '—'} but room <strong>{dateMismatch.roomName}</strong> is available from {dateMismatch.roomFrom ?? '—'} to {dateMismatch.roomTo ?? '—'}.
                  The guest's stay may extend beyond the room's availability period.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDateMismatch(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!dateMismatch) return;
                const rooms = roomsByLocation[selectedLocations[dateMismatch.rowKey]] ?? [];
                const room = rooms.find(r => r.id === dateMismatch.roomId);
                if (!room) return;
                const row: PersonRow = { rowKey: dateMismatch.rowKey, guestId: dateMismatch.guestId, memberId: dateMismatch.memberId, name: dateMismatch.name } as PersonRow;
                await doAssignRoom(row, dateMismatch.roomId, dateMismatch.roomName, room.capacity);
                setDateMismatch(null);
              }}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              Assign Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
