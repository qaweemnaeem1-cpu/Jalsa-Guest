import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, CheckCircle, Eye, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { DeptSidebar } from '@/components/DeptSidebar';
import { DeptUserMenu } from '@/components/DeptUserMenu';
import { useDepartments } from '@/hooks/useDepartments';
import { useAuditTrail2 } from '@/hooks/useAuditTrail2';
import { GuestViewModal } from '@/components/GuestViewModal';
import { FamilyBadge, type FamilyMemberInfo } from '@/components/FamilyBadge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { formatDesignation } from '@/lib/constants';
import type { Guest } from '@/types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlacedRow {
  rowKey: string;
  guestId: string;
  memberId: string | null;
  name: string;
  country: string;
  referenceNumber: string;
  relationship: string;
  isFamily: boolean;
  familyLastName: string;
  familyAllMembers: FamilyMemberInfo[];
  placedLocation: string;
  placedAt?: string;
  arrivalTime?: string;
  arrivalAirport?: string;
  departureTime?: string;
  departureAirport?: string;
  designation: string | string[];
  roomAssignment?: string;
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

function buildRows(guests: Guest[], dept: string): PlacedRow[] {
  const rows: PlacedRow[] = [];
  for (const g of guests) {
    if (g.familyGroupId) {
      if (g.assignedDepartment === dept && g.placedLocation) {
        const lastName = (g.familyName ?? g.fullName).replace(' Family', '').split(' ').pop() ?? g.fullName;
        rows.push({
          rowKey: g.id, guestId: g.id, memberId: null,
          name: g.fullName, country: g.country, referenceNumber: g.referenceNumber,
          relationship: g.isHeadOfFamily ? 'Head' : (g.relationship ?? '—'),
          isFamily: true, familyLastName: lastName,
          familyAllMembers: buildFamilyMemberListFromGroup(guests, g.familyGroupId),
          placedLocation: g.placedLocation, placedAt: g.placedAt,
          arrivalTime: g.arrivalTime, arrivalAirport: g.arrivalAirport,
          departureTime: g.departureTime, departureAirport: g.departureAirport,
          designation: g.designation, roomAssignment: g.roomAssignment,
        });
      }
      continue;
    }
    const isFamily = g.guestType === 'family' && (g.familyMembers?.length ?? 0) > 0;
    const lastName = g.fullName.split(' ').pop() ?? g.fullName;
    const familyAllMembers = isFamily ? buildFamilyMemberList(g) : [];
    if (g.assignedDepartment === dept && g.placedLocation) {
      rows.push({
        rowKey: g.id, guestId: g.id, memberId: null,
        name: g.fullName, country: g.country, referenceNumber: g.referenceNumber,
        relationship: isFamily ? 'Head' : 'Individual',
        isFamily, familyLastName: lastName, familyAllMembers,
        placedLocation: g.placedLocation, placedAt: g.placedAt,
        arrivalTime: g.arrivalTime, arrivalAirport: g.arrivalAirport,
        departureTime: g.departureTime, departureAirport: g.departureAirport,
        designation: g.designation, roomAssignment: g.roomAssignment,
      });
    }
    if (isFamily) {
      for (const m of g.familyMembers ?? []) {
        if (m.assignedDepartment === dept && m.placedLocation) {
          rows.push({
            rowKey: `${g.id}-${m.id}`, guestId: g.id, memberId: m.id,
            name: m.name, country: g.country, referenceNumber: g.referenceNumber,
            relationship: m.relationship,
            isFamily: true, familyLastName: lastName, familyAllMembers,
            placedLocation: m.placedLocation, placedAt: m.placedAt,
            arrivalTime: g.arrivalTime, arrivalAirport: g.arrivalAirport,
            departureTime: g.departureTime, departureAirport: g.departureAirport,
            designation: g.designation, roomAssignment: g.roomAssignment,
          });
        }
      }
    }
  }
  return rows;
}

// ── Helper: fetch rooms for a location name ───────────────────────────────────

async function fetchRoomsForLoc(locationName: string): Promise<RoomOption[]> {
  const { data: locData } = await supabase
    .from('locations').select('id').eq('name', locationName).maybeSingle();
  if (!locData?.id) return [];
  const { data: roomData } = await supabase
    .from('rooms').select('id, name, capacity, available_from, available_to')
    .eq('location_id', locData.id).eq('is_active', true).order('name');
  if (!roomData) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roomIds = roomData.map((r: any) => r.id as string);
  const { data: beds } = roomIds.length
    ? await supabase.from('bed_assignments').select('room_id').in('room_id', roomIds)
    : { data: [] };
  const occMap: Record<string, number> = {};
  if (beds) for (const b of beds) occMap[b.room_id] = (occMap[b.room_id] ?? 0) + 1;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return roomData.map((r: any) => ({
    id: r.id, name: r.name, capacity: r.capacity,
    occupancy: occMap[r.id] ?? 0,
    available_from: r.available_from ?? undefined,
    available_to: r.available_to ?? undefined,
  }));
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DeptPlacedPage() {
  const { user } = useAuth();
  const { guests, updateGuest } = useGuests();
  const { departments, getLocPillCls } = useDepartments();
  const { addEntry: addEntry2 } = useAuditTrail2();

  const [viewGuestId, setViewGuestId]       = useState<string | null>(null);
  const [filterLocation, setFilterLocation] = useState<string>('');
  const [search, setSearch]                 = useState('');

  // ── Checkbox selection ────────────────────────────────────────────────────────
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  // ── Move dialog ───────────────────────────────────────────────────────────────
  const [moveRow, setMoveRow]                   = useState<PlacedRow | null>(null);
  const [moveSaving, setMoveSaving]             = useState(false);
  const [moveNewLocation, setMoveNewLocation]   = useState('');
  const [moveNewRoomId, setMoveNewRoomId]       = useState('');
  const [moveRooms, setMoveRooms]               = useState<RoomOption[]>([]);
  const [moveLoadingRooms, setMoveLoadingRooms] = useState(false);
  const [moveReason, setMoveReason]             = useState('');

  // ── Swap Rooms dialog ─────────────────────────────────────────────────────────
  const [swapDialogOpen, setSwapDialogOpen] = useState(false);
  const [swapSaving, setSwapSaving]         = useState(false);

  // ── Bulk Move dialog ──────────────────────────────────────────────────────────
  const [bulkMoveOpen, setBulkMoveOpen]             = useState(false);
  const [bulkMoveSaving, setBulkMoveSaving]         = useState(false);
  const [bulkMoveLocation, setBulkMoveLocation]     = useState('');
  const [bulkMoveRoomId, setBulkMoveRoomId]         = useState('');
  const [bulkMoveRooms, setBulkMoveRooms]           = useState<RoomOption[]>([]);
  const [bulkMoveLoadingRooms, setBulkMoveLoadingRooms] = useState(false);

  const dept      = user?.department ?? '';
  const locations = departments[dept] ?? [];

  const allRows = useMemo(() => buildRows(guests, dept), [guests, dept]);

  const filteredRows = useMemo(() => {
    let rows = filterLocation ? allRows.filter(r => r.placedLocation === filterLocation) : allRows;
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter(r =>
      r.name.toLowerCase().includes(q) ||
      r.country.toLowerCase().includes(q) ||
      r.referenceNumber.toLowerCase().includes(q),
    );
    return rows;
  }, [allRows, filterLocation, search]);

  const viewGuest = useMemo(
    () => guests.find(g => g.id === viewGuestId) ?? null,
    [guests, viewGuestId],
  );

  const guestCountByLocation = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const loc of locations) {
      counts[loc] = guests.filter(g => g.placedLocation === loc && g.assignedDepartment === dept).length;
    }
    return counts;
  }, [guests, locations, dept]);

  // ── Selection helpers ─────────────────────────────────────────────────────────

  const selectedGuestRows = useMemo(
    () => allRows.filter(r => selectedRows.has(r.rowKey)),
    [allRows, selectedRows],
  );
  const allFilteredSelected = filteredRows.length > 0 && filteredRows.every(r => selectedRows.has(r.rowKey));

  // ── Swap validation ───────────────────────────────────────────────────────────

  const swapDisabledReason = useMemo(() => {
    if (selectedGuestRows.length !== 2) return '';
    const [a, b] = selectedGuestRows;
    if (a.placedLocation !== b.placedLocation) return 'Guests must be at the same location';
    if (!a.roomAssignment || !b.roomAssignment) return 'Both guests must have a room assigned';
    return '';
  }, [selectedGuestRows]);

  const canSwap = selectedGuestRows.length === 2 && swapDisabledReason === '';

  // ── Bulk Move — bed capacity warning ─────────────────────────────────────────

  const bulkMoveSelectedRoom = bulkMoveRooms.find(r => r.id === bulkMoveRoomId);
  const bulkMoveBedsLeft     = bulkMoveSelectedRoom
    ? Math.max(0, bulkMoveSelectedRoom.capacity - bulkMoveSelectedRoom.occupancy)
    : Infinity;
  const bulkMoveHasWarning   = !!bulkMoveSelectedRoom && bulkMoveBedsLeft < selectedGuestRows.length;

  // ── Effects: fetch rooms for Move dialog ─────────────────────────────────────

  useEffect(() => {
    if (!moveNewLocation) { setMoveRooms([]); setMoveNewRoomId(''); return; }
    setMoveLoadingRooms(true);
    fetchRoomsForLoc(moveNewLocation).then(rooms => {
      setMoveRooms(rooms);
      setMoveLoadingRooms(false);
    });
  }, [moveNewLocation]);

  // ── Effects: fetch rooms for Bulk Move dialog ─────────────────────────────────

  useEffect(() => {
    if (!bulkMoveLocation) { setBulkMoveRooms([]); setBulkMoveRoomId(''); return; }
    setBulkMoveLoadingRooms(true);
    fetchRoomsForLoc(bulkMoveLocation).then(rooms => {
      setBulkMoveRooms(rooms);
      setBulkMoveLoadingRooms(false);
    });
  }, [bulkMoveLocation]);

  // ── Open helpers ──────────────────────────────────────────────────────────────

  const openMoveDialog = useCallback((row: PlacedRow) => {
    setMoveRow(row);
    setMoveNewLocation(row.placedLocation);
    setMoveNewRoomId('');
    setMoveRooms([]);
    setMoveReason('');
  }, []);

  const openBulkMove = useCallback(() => {
    setBulkMoveLocation('');
    setBulkMoveRoomId('');
    setBulkMoveRooms([]);
    setBulkMoveOpen(true);
  }, []);

  // ── Handle Move confirm ───────────────────────────────────────────────────────

  const handleMoveConfirm = useCallback(async () => {
    if (!user || !moveRow || !moveNewLocation) return;
    setMoveSaving(true);
    const now = new Date().toISOString();
    const { guestId, name, placedLocation: oldLocation, roomAssignment: oldRoom, referenceNumber } = moveRow;
    const newRoom = moveRooms.find(r => r.id === moveNewRoomId) ?? null;

    try {
      await supabase.from('bed_assignments').delete().eq('guest_id', guestId);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dbUpdates: Record<string, any> = {
        placed_location: moveNewLocation, placed_at: now, placed_by: user.id, updated_at: now,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const localUpdates: Record<string, any> = {
        placedLocation: moveNewLocation, placedAt: now, placedBy: user.id,
      };

      if (newRoom) {
        const { data: existingBeds } = await supabase
          .from('bed_assignments').select('bed_number').eq('room_id', newRoom.id);
        const nextBed = (existingBeds?.length ?? 0) + 1;
        if (nextBed > newRoom.capacity) { toast.error(`${newRoom.name} is full`); return; }
        await supabase.from('bed_assignments').insert({
          room_id: newRoom.id, bed_number: nextBed,
          guest_id: guestId, guest_name: name, assigned_at: now,
        });
        dbUpdates.room_assignment = newRoom.name;
        dbUpdates.status = 'Accommodated'; dbUpdates.accommodated_at = now; dbUpdates.accommodated_by = user.id;
        localUpdates.roomAssignment = newRoom.name; localUpdates.status = 'Accommodated';
        localUpdates.accommodatedAt = now; localUpdates.accommodatedBy = user.id;
      } else {
        dbUpdates.room_assignment = null; dbUpdates.status = 'Placed';
        dbUpdates.accommodated_at = null; dbUpdates.accommodated_by = null;
        localUpdates.roomAssignment = undefined; localUpdates.status = 'Placed';
        localUpdates.accommodatedAt = undefined; localUpdates.accommodatedBy = undefined;
      }

      const { error } = await supabase.from('guests').update(dbUpdates).eq('id', guestId);
      if (error) { toast.error('Failed to move guest'); return; }
      updateGuest(guestId, localUpdates);

      const oldLabel = `${oldLocation}${oldRoom ? ` / Room ${oldRoom}` : ''}`;
      const newLabel = `${moveNewLocation}${newRoom ? ` / Room ${newRoom.name}` : ''}`;
      addEntry2({
        guestId, guestName: name, guestReference: referenceNumber,
        locationId: moveNewLocation, locationName: moveNewLocation,
        departmentId: dept, departmentName: dept,
        type: 'room_change', action: 'Guest moved',
        comment: moveReason.trim() || undefined,
        oldValue: oldLabel, newValue: newLabel,
        createdBy: { id: user.id, name: user.name, role: 'department-head' },
        createdAt: now,
      });

      toast.success(`${name} moved to ${moveNewLocation}${newRoom ? ` — Room ${newRoom.name}` : ''}`);
      setMoveRow(null);
    } finally {
      setMoveSaving(false);
    }
  }, [user, moveRow, moveNewLocation, moveNewRoomId, moveRooms, moveReason,
      dept, updateGuest, addEntry2]);

  // ── Handle Swap Rooms confirm ─────────────────────────────────────────────────

  const handleSwapConfirm = useCallback(async () => {
    if (!user || selectedGuestRows.length !== 2 || !canSwap) return;
    const [rowA, rowB] = selectedGuestRows;
    setSwapSaving(true);
    const now = new Date().toISOString();

    try {
      // Get current bed assignments to know room_id + bed_number
      const [{ data: bedA }, { data: bedB }] = await Promise.all([
        supabase.from('bed_assignments').select('room_id, bed_number').eq('guest_id', rowA.guestId).maybeSingle(),
        supabase.from('bed_assignments').select('room_id, bed_number').eq('guest_id', rowB.guestId).maybeSingle(),
      ]);

      if (!bedA?.room_id || !bedB?.room_id) {
        toast.error('Could not locate bed assignments for both guests');
        return;
      }

      // Delete old assignments
      await Promise.all([
        supabase.from('bed_assignments').delete().eq('guest_id', rowA.guestId),
        supabase.from('bed_assignments').delete().eq('guest_id', rowB.guestId),
      ]);

      // Insert swapped assignments
      await Promise.all([
        supabase.from('bed_assignments').insert({
          room_id: bedB.room_id, bed_number: bedA.bed_number,
          guest_id: rowA.guestId, guest_name: rowA.name, assigned_at: now,
        }),
        supabase.from('bed_assignments').insert({
          room_id: bedA.room_id, bed_number: bedB.bed_number,
          guest_id: rowB.guestId, guest_name: rowB.name, assigned_at: now,
        }),
      ]);

      // Update guest records (swap room names)
      await Promise.all([
        supabase.from('guests').update({ room_assignment: rowB.roomAssignment, updated_at: now }).eq('id', rowA.guestId),
        supabase.from('guests').update({ room_assignment: rowA.roomAssignment, updated_at: now }).eq('id', rowB.guestId),
      ]);
      updateGuest(rowA.guestId, { roomAssignment: rowB.roomAssignment });
      updateGuest(rowB.guestId, { roomAssignment: rowA.roomAssignment });

      // Audit trail for both
      const sharedBase = {
        locationId: rowA.placedLocation, locationName: rowA.placedLocation,
        departmentId: dept, departmentName: dept,
        type: 'room_change' as const, action: 'Rooms swapped',
        createdBy: { id: user.id, name: user.name, role: 'department-head' as const },
        createdAt: now,
      };
      addEntry2({ ...sharedBase, guestId: rowA.guestId, guestName: rowA.name, guestReference: rowA.referenceNumber,
        oldValue: rowA.roomAssignment, newValue: rowB.roomAssignment,
        comment: `Swapped with ${rowB.name}` });
      addEntry2({ ...sharedBase, guestId: rowB.guestId, guestName: rowB.name, guestReference: rowB.referenceNumber,
        oldValue: rowB.roomAssignment, newValue: rowA.roomAssignment,
        comment: `Swapped with ${rowA.name}` });

      toast.success(
        `Rooms swapped: ${rowA.name} (${rowA.roomAssignment} → ${rowB.roomAssignment}) and ${rowB.name} (${rowB.roomAssignment} → ${rowA.roomAssignment})`,
      );
      setSelectedRows(new Set());
      setSwapDialogOpen(false);
    } finally {
      setSwapSaving(false);
    }
  }, [user, selectedGuestRows, canSwap, dept, updateGuest, addEntry2]);

  // ── Handle Bulk Move confirm ──────────────────────────────────────────────────

  const handleBulkMoveConfirm = useCallback(async () => {
    if (!user || selectedGuestRows.length === 0 || !bulkMoveLocation) return;
    setBulkMoveSaving(true);
    const now = new Date().toISOString();
    const room = bulkMoveSelectedRoom ?? null;

    let bedCount = 0;
    if (room) {
      const { data: existingBeds } = await supabase
        .from('bed_assignments').select('bed_number').eq('room_id', room.id);
      bedCount = existingBeds?.length ?? 0;
    }

    let movedCount = 0;
    let accommodatedCount = 0;

    for (const row of selectedGuestRows) {
      try {
        // Remove old bed assignment
        await supabase.from('bed_assignments').delete().eq('guest_id', row.guestId);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dbUpdates: Record<string, any> = {
          placed_location: bulkMoveLocation, placed_at: now, placed_by: user.id, updated_at: now,
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const localUpdates: Record<string, any> = {
          placedLocation: bulkMoveLocation, placedAt: now, placedBy: user.id,
        };

        if (room && bedCount < room.capacity) {
          bedCount++;
          await supabase.from('bed_assignments').insert({
            room_id: room.id, bed_number: bedCount,
            guest_id: row.guestId, guest_name: row.name, assigned_at: now,
          });
          dbUpdates.room_assignment = room.name;
          dbUpdates.status = 'Accommodated'; dbUpdates.accommodated_at = now; dbUpdates.accommodated_by = user.id;
          localUpdates.roomAssignment = room.name; localUpdates.status = 'Accommodated';
          localUpdates.accommodatedAt = now; localUpdates.accommodatedBy = user.id;
          accommodatedCount++;
        } else {
          dbUpdates.room_assignment = null; dbUpdates.status = 'Placed';
          dbUpdates.accommodated_at = null; dbUpdates.accommodated_by = null;
          localUpdates.roomAssignment = undefined; localUpdates.status = 'Placed';
          localUpdates.accommodatedAt = undefined; localUpdates.accommodatedBy = undefined;
          movedCount++;
        }

        await supabase.from('guests').update(dbUpdates).eq('id', row.guestId);
        updateGuest(row.guestId, localUpdates);

        addEntry2({
          guestId: row.guestId, guestName: row.name, guestReference: row.referenceNumber,
          locationId: bulkMoveLocation, locationName: bulkMoveLocation,
          departmentId: dept, departmentName: dept,
          type: 'room_change', action: 'Guest moved (bulk)',
          oldValue: `${row.placedLocation}${row.roomAssignment ? ` / Room ${row.roomAssignment}` : ''}`,
          newValue: `${bulkMoveLocation}${room && localUpdates.roomAssignment ? ` / Room ${room.name}` : ''}`,
          createdBy: { id: user.id, name: user.name, role: 'department-head' },
          createdAt: now,
        });
      } catch { /* continue with remaining */ }
    }

    const total = movedCount + accommodatedCount;
    toast.success(
      room && accommodatedCount > 0
        ? `${total} guests moved to ${bulkMoveLocation} — ${accommodatedCount} assigned to ${room.name}`
        : `${total} guests moved to ${bulkMoveLocation}`,
    );
    setSelectedRows(new Set());
    setBulkMoveOpen(false);
    setBulkMoveLocation('');
    setBulkMoveRoomId('');
    setBulkMoveRooms([]);
    setBulkMoveSaving(false);
  }, [user, selectedGuestRows, bulkMoveLocation, bulkMoveSelectedRoom, dept, updateGuest, addEntry2]);

  if (!user) return null;

  const moveSelectedRoom = moveRooms.find(r => r.id === moveNewRoomId);

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <div className="flex">
        <DeptSidebar />
        <main className="flex-1 ml-64">
          <header className="bg-white border-b border-[#E8E3DB] px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-[#2D5A45]" />
                <div>
                  <h1 className="text-2xl font-semibold text-[#1A1A1A]">Placed Guests</h1>
                  <p className="text-sm text-[#4A4A4A] mt-0.5">Guests assigned to a location in {dept}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="bg-green-100 text-green-700 text-xs font-semibold px-3 py-1 rounded-full border border-green-200">
                  {filteredRows.length} placed
                </span>
                <DeptUserMenu />
              </div>
            </div>
          </header>

          <div className="p-6 space-y-4">

            {/* ── Toolbar: bulk actions + search + filter ──────────────────────── */}
            {allRows.length > 0 && (
              <div className="flex items-center gap-3 flex-wrap">
                {/* Swap Rooms — only when exactly 2 selected */}
                {selectedGuestRows.length === 2 && (
                  <button
                    onClick={() => setSwapDialogOpen(true)}
                    disabled={!canSwap}
                    title={swapDisabledReason || 'Swap rooms between the two selected guests'}
                    className="flex items-center gap-2 bg-white text-[#2D5A45] border border-[#2D5A45] rounded-lg px-4 py-2 text-sm font-medium hover:bg-[#F0F7F4] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                  >
                    <ArrowRightLeft className="w-4 h-4" />
                    Swap Rooms
                  </button>
                )}

                {/* Bulk Move — only when 2+ selected */}
                {selectedGuestRows.length >= 2 && (
                  <button
                    onClick={openBulkMove}
                    className="flex items-center gap-2 bg-[#2D5A45] text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-[#234839] transition-colors shrink-0"
                  >
                    <ArrowRightLeft className="w-4 h-4" />
                    Bulk Move ({selectedGuestRows.length})
                  </button>
                )}

                {selectedGuestRows.length > 0 && selectedGuestRows.length < 2 && (
                  <span className="text-sm text-[#4A4A4A] shrink-0">{selectedGuestRows.length} selected</span>
                )}

                {/* Search */}
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                  <Input
                    placeholder="Search name, country, reference…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-10 border-[#D4CFC7] focus:border-[#2D5A45] h-9 bg-white text-sm"
                  />
                </div>

                {/* Location filter */}
                {locations.length > 0 && (
                  <select
                    value={filterLocation}
                    onChange={e => setFilterLocation(e.target.value)}
                    className="border border-[#D4CFC7] rounded-lg px-3 py-1.5 text-sm text-[#1A1A1A] bg-white focus:outline-none focus:border-[#2D5A45] h-9 shrink-0"
                  >
                    <option value="">All locations</option>
                    {locations.map(loc => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {filteredRows.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#E8E3DB] p-12 text-center">
                <CheckCircle className="w-12 h-12 mx-auto mb-4 text-[#D4CFC7]" />
                <h2 className="text-base font-semibold text-[#1A1A1A] mb-1">No placed guests</h2>
                <p className="text-sm text-[#4A4A4A]">
                  {filterLocation ? `No guests placed at ${filterLocation}.` : 'No guests have been placed yet.'}
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-[#E8E3DB] overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#E8E3DB] bg-[#F9F8F6]">
                      {/* Checkbox header */}
                      <th className="px-3 py-3 w-9">
                        <input
                          type="checkbox"
                          checked={allFilteredSelected}
                          onChange={e => {
                            if (e.target.checked) {
                              setSelectedRows(prev => new Set([...prev, ...filteredRows.map(r => r.rowKey)]));
                            } else {
                              setSelectedRows(prev => {
                                const next = new Set(prev);
                                filteredRows.forEach(r => next.delete(r.rowKey));
                                return next;
                              });
                            }
                          }}
                          className="w-4 h-4 rounded border-[#D4CFC7] accent-[#2D5A45] cursor-pointer"
                          title="Select all"
                        />
                      </th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-[#4A4A4A] uppercase tracking-wider">Reference</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-[#4A4A4A] uppercase tracking-wider">Name</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-[#4A4A4A] uppercase tracking-wider">Country</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-[#4A4A4A] uppercase tracking-wider">Designation</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-[#4A4A4A] uppercase tracking-wider">Location</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-[#4A4A4A] uppercase tracking-wider">Room</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-[#4A4A4A] uppercase tracking-wider">Arrival</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-[#4A4A4A] uppercase tracking-wider">Departure</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-[#4A4A4A] uppercase tracking-wider">Placed</th>
                      <th className="text-right px-4 py-3 text-sm font-semibold text-[#4A4A4A] uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E3DB]">
                    {filteredRows.map(row => (
                      <tr
                        key={row.rowKey}
                        className={`hover:bg-[#F9F8F6] ${selectedRows.has(row.rowKey) ? 'bg-[#F0F7F4]' : ''}`}
                      >
                        {/* Checkbox cell */}
                        <td className="px-3 py-3 w-9" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedRows.has(row.rowKey)}
                            onChange={e => {
                              setSelectedRows(prev => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(row.rowKey);
                                else next.delete(row.rowKey);
                                return next;
                              });
                            }}
                            className="w-4 h-4 rounded border-[#D4CFC7] accent-[#2D5A45] cursor-pointer"
                          />
                        </td>

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
                        <td className="px-4 py-3 text-sm text-[#4A4A4A]">{row.country}</td>
                        <td className="px-4 py-3 text-sm text-[#4A4A4A]">{formatDesignation(row.designation)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getLocPillCls(dept, row.placedLocation)}`}>
                            {row.placedLocation}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {row.roomAssignment ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200">
                              {row.roomAssignment}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">No room</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {row.arrivalTime ? (
                            <div>
                              <div className="text-sm text-[#1A1A1A]">
                                {new Date(row.arrivalTime).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </div>
                              {row.arrivalAirport && <div className="text-xs text-gray-400">{row.arrivalAirport}</div>}
                            </div>
                          ) : <span className="text-gray-400 text-sm">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {row.departureTime ? (
                            <div>
                              <div className="text-sm text-[#1A1A1A]">
                                {new Date(row.departureTime).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </div>
                              {row.departureAirport && <div className="text-xs text-gray-400">{row.departureAirport}</div>}
                            </div>
                          ) : <span className="text-gray-400 text-sm">—</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-[#4A4A4A]">
                          {row.placedAt
                            ? new Date(row.placedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
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
                              onClick={() => openMoveDialog(row)}
                              className="flex items-center gap-1 text-[#2D5A45] hover:bg-[#D6E4D9] rounded-md px-2 py-1 text-xs transition-colors"
                              title="Move guest"
                            >
                              <ArrowRightLeft className="w-3.5 h-3.5" />
                              Move
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
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

      {/* ── Move Guest Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={!!moveRow} onOpenChange={open => { if (!open && !moveSaving) setMoveRow(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-[#2D5A45]" />
              Move Guest
            </DialogTitle>
            <DialogDescription>
              {moveRow && (
                <span>
                  <span className="font-medium text-[#1A1A1A]">{moveRow.name}</span>
                  {' — currently at '}
                  <span className="font-medium text-[#1A1A1A]">{moveRow.placedLocation}</span>
                  {moveRow.roomAssignment
                    ? <>, Room <span className="font-medium text-[#1A1A1A]">{moveRow.roomAssignment}</span></>
                    : ', no room assigned'}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {moveRow && (
            <div className="space-y-4 py-1">
              <div className="flex gap-4 p-3 bg-[#F9F8F6] rounded-lg border border-[#E8E3DB]">
                <div className="flex-1">
                  <p className="text-xs text-[#4A4A4A] mb-0.5">Current location</p>
                  <p className="text-sm font-medium text-[#1A1A1A]">{moveRow.placedLocation}</p>
                </div>
                <div className="flex-1">
                  <p className="text-xs text-[#4A4A4A] mb-0.5">Current room</p>
                  <p className="text-sm font-medium text-[#1A1A1A]">{moveRow.roomAssignment ?? 'None'}</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">
                  New location <span className="text-red-500">*</span>
                </label>
                <select
                  value={moveNewLocation}
                  onChange={e => { setMoveNewLocation(e.target.value); setMoveNewRoomId(''); setMoveRooms([]); }}
                  className="w-full border border-[#D4CFC7] rounded-lg px-3 py-2 text-sm text-[#1A1A1A] bg-white focus:outline-none focus:border-[#2D5A45]"
                >
                  <option value="">Select a location…</option>
                  {locations.map(loc => (
                    <option key={loc} value={loc}>{loc} ({guestCountByLocation[loc] ?? 0} placed)</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">
                  New room <span className="text-xs font-normal text-[#4A4A4A]">(optional)</span>
                </label>
                <select
                  value={moveNewRoomId}
                  onChange={e => setMoveNewRoomId(e.target.value)}
                  disabled={!moveNewLocation || moveLoadingRooms}
                  className="w-full border border-[#D4CFC7] rounded-lg px-3 py-2 text-sm text-[#1A1A1A] bg-white focus:outline-none focus:border-[#2D5A45] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">No room</option>
                  {moveLoadingRooms ? <option disabled>Loading rooms…</option>
                    : moveRooms.map(room => {
                      const bedsLeft = Math.max(0, room.capacity - room.occupancy);
                      const isFull = bedsLeft === 0;
                      return (
                        <option key={room.id} value={room.id} disabled={isFull}>
                          {room.name} — {room.occupancy}/{room.capacity} beds{isFull ? ' (FULL)' : ` (${bedsLeft} free)`}
                        </option>
                      );
                    })}
                </select>
                {moveSelectedRoom && (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${
                      moveSelectedRoom.occupancy >= moveSelectedRoom.capacity ? 'bg-red-400'
                      : moveSelectedRoom.capacity - moveSelectedRoom.occupancy <= 1 ? 'bg-amber-400'
                      : 'bg-emerald-400'}`} />
                    <span className="text-xs text-[#4A4A4A]">
                      {moveSelectedRoom.capacity - moveSelectedRoom.occupancy} bed{moveSelectedRoom.capacity - moveSelectedRoom.occupancy !== 1 ? 's' : ''} available
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">
                  Reason <span className="text-xs font-normal text-[#4A4A4A]">(optional)</span>
                </label>
                <textarea
                  value={moveReason}
                  onChange={e => setMoveReason(e.target.value)}
                  rows={3}
                  placeholder="Reason for moving (optional)…"
                  className="w-full border border-[#D4CFC7] rounded-lg px-3 py-2 text-sm text-[#1A1A1A] bg-white resize-y focus:outline-none focus:border-[#2D5A45] placeholder:text-gray-400"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <button onClick={() => setMoveRow(null)} disabled={moveSaving}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-[#D4CFC7] text-[#4A4A4A] bg-white hover:bg-[#F5F0E8] disabled:opacity-50 transition-colors">
              Cancel
            </button>
            <button onClick={handleMoveConfirm} disabled={!moveNewLocation || moveSaving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-[#2D5A45] text-white hover:bg-[#234839] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              <ArrowRightLeft className="w-3.5 h-3.5" />
              {moveSaving ? 'Moving…' : 'Move Guest'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Swap Rooms Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={swapDialogOpen} onOpenChange={open => { if (!open && !swapSaving) setSwapDialogOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-[#2D5A45]" />
              Swap Rooms
            </DialogTitle>
            <DialogDescription>
              The two selected guests will exchange rooms.
            </DialogDescription>
          </DialogHeader>

          {selectedGuestRows.length === 2 && (() => {
            const [a, b] = selectedGuestRows;
            return (
              <div className="py-2 space-y-4">
                {/* Visual swap grid */}
                <div className="bg-[#F9F8F6] rounded-xl border border-[#E8E3DB] p-5 space-y-3">
                  {[{ row: a, newRoom: b.roomAssignment }, { row: b, newRoom: a.roomAssignment }].map(({ row, newRoom }) => (
                    <div key={row.rowKey} className="flex items-center gap-3">
                      <div className="w-7 h-7 bg-[#2D5A45] rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0">
                        {row.name.charAt(0)}
                      </div>
                      <span className="text-sm font-medium text-[#1A1A1A] w-32 truncate">{row.name}</span>
                      <span className="text-sm font-mono bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded shrink-0">
                        {row.roomAssignment}
                      </span>
                      <ArrowRightLeft className="w-3.5 h-3.5 text-[#4A4A4A] shrink-0" />
                      <span className="text-sm font-mono bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded shrink-0">
                        {newRoom}
                      </span>
                    </div>
                  ))}
                  <div className="pt-1 border-t border-[#E8E3DB]">
                    <p className="text-xs text-[#4A4A4A]">
                      Location: <span className="font-medium text-[#1A1A1A]">{a.placedLocation}</span>
                    </p>
                  </div>
                </div>
              </div>
            );
          })()}

          <DialogFooter className="gap-2">
            <button onClick={() => setSwapDialogOpen(false)} disabled={swapSaving}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-[#D4CFC7] text-[#4A4A4A] bg-white hover:bg-[#F5F0E8] disabled:opacity-50 transition-colors">
              Cancel
            </button>
            <button onClick={handleSwapConfirm} disabled={swapSaving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-[#2D5A45] text-white hover:bg-[#234839] disabled:opacity-50 transition-colors">
              <ArrowRightLeft className="w-3.5 h-3.5" />
              {swapSaving ? 'Swapping…' : 'Swap Rooms'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Bulk Move Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={bulkMoveOpen} onOpenChange={open => { if (!open && !bulkMoveSaving) setBulkMoveOpen(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-[#2D5A45]" />
              Move {selectedGuestRows.length} Guests
            </DialogTitle>
            <DialogDescription>
              Move all selected guests to a new location.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-1">
            {/* Guest pills */}
            <div className="flex flex-wrap gap-1.5">
              {selectedGuestRows.map(r => (
                <span key={r.rowKey}
                  className="inline-flex items-center px-2.5 py-1 bg-[#F0F7F4] border border-[#C2D9CE] rounded-full text-xs font-medium text-[#2D5A45]">
                  {r.name}
                  {r.roomAssignment && <span className="ml-1 text-gray-400">({r.roomAssignment})</span>}
                </span>
              ))}
            </div>

            {/* New location */}
            <div>
              <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">
                New location <span className="text-red-500">*</span>
              </label>
              <select
                value={bulkMoveLocation}
                onChange={e => { setBulkMoveLocation(e.target.value); setBulkMoveRoomId(''); }}
                className="w-full border border-[#D4CFC7] rounded-lg px-3 py-2 text-sm text-[#1A1A1A] bg-white focus:outline-none focus:border-[#2D5A45]"
              >
                <option value="">Select a location…</option>
                {locations.map(loc => (
                  <option key={loc} value={loc}>{loc} ({guestCountByLocation[loc] ?? 0} placed)</option>
                ))}
              </select>
            </div>

            {/* New room (optional) */}
            <div>
              <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">
                New room <span className="text-xs font-normal text-[#4A4A4A]">(optional)</span>
              </label>
              <select
                value={bulkMoveRoomId}
                onChange={e => setBulkMoveRoomId(e.target.value)}
                disabled={!bulkMoveLocation || bulkMoveLoadingRooms}
                className="w-full border border-[#D4CFC7] rounded-lg px-3 py-2 text-sm text-[#1A1A1A] bg-white focus:outline-none focus:border-[#2D5A45] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">No room</option>
                {bulkMoveLoadingRooms ? <option disabled>Loading rooms…</option>
                  : bulkMoveRooms.map(room => {
                    const bedsLeft = Math.max(0, room.capacity - room.occupancy);
                    const isFull = bedsLeft === 0;
                    return (
                      <option key={room.id} value={room.id} disabled={isFull}>
                        {room.name} — {room.occupancy}/{room.capacity} beds{isFull ? ' (FULL)' : ` (${bedsLeft} free)`}
                      </option>
                    );
                  })}
              </select>

              {/* Capacity warning */}
              {bulkMoveHasWarning && bulkMoveSelectedRoom && (
                <div className="mt-2 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <span className="text-amber-500 shrink-0 text-base leading-none mt-0.5">⚠️</span>
                  <p className="text-xs text-amber-700">
                    <span className="font-semibold">{bulkMoveSelectedRoom.name}</span> has {bulkMoveBedsLeft} bed{bulkMoveBedsLeft !== 1 ? 's' : ''} left but you selected {selectedGuestRows.length} guests.
                    Only {bulkMoveBedsLeft} will get a bed — the rest will be moved without a room.
                  </p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <button onClick={() => setBulkMoveOpen(false)} disabled={bulkMoveSaving}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-[#D4CFC7] text-[#4A4A4A] bg-white hover:bg-[#F5F0E8] disabled:opacity-50 transition-colors">
              Cancel
            </button>
            <button onClick={handleBulkMoveConfirm} disabled={!bulkMoveLocation || bulkMoveSaving}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-[#2D5A45] text-white hover:bg-[#234839] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {bulkMoveSaving ? 'Moving…' : `Move All (${selectedGuestRows.length})`}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
