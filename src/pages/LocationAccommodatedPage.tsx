import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { formatDate, formatDateShort, formatTime, formatTimestampTime } from '@/utils/dateHelpers';
import { CheckCircle, ChevronRight, Eye, Search, MoveRight, ArrowRightLeft, Car, ClipboardList, AlertCircle, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { useRooms } from '@/hooks/useRooms';
import { useAuditTrail2 } from '@/hooks/useAuditTrail2';
import { LocationSidebar } from '@/components/LocationSidebar';
import { LocationUserMenu } from '@/components/LocationUserMenu';
import { GuestViewModal } from '@/components/GuestViewModal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/lib/supabase';
import type { Guest } from '@/types';

const shortenRef = (ref: string) =>
  !ref ? '—' : ref.length <= 10 ? ref : ref.slice(0, 2) + '....' + ref.slice(-5);

// ── Row model ─────────────────────────────────────────────────────────────────

interface AccommodatedRow {
  rowKey: string;
  guestId: string;
  memberId: string | null;
  name: string;
  country: string;
  referenceNumber: string;
  isFamily: boolean;
  familyLastName: string;
  familyGroupId: string | null;
  relationship: string;
  roomId: string;
  roomName: string;
  blockName: string;
  blockId: string;
  bedNumber: number;
  assignedAt?: string;
  arrival_date?: string;
  arrival_time?: string;
  arrivalFlightNumber?: string;
  departure_date?: string;
  departure_time?: string;
  departureFlightNumber?: string;
  departureAirport?: string;
  departureTerminal?: string;
}


// ── Checklist items ───────────────────────────────────────────────────────────

const CHECKLIST_ITEMS = [
  'Room keys returned',
  'Room inspected',
  'Driver assigned for airport dropoff',
  'Guest checked out in system',
];

// ── Page ──────────────────────────────────────────────────────────────────────

interface MovePending {
  rowKey: string; roomId: string; bedNumber: number;
  guestId: string; guestName: string; familyMemberId?: string;
}

interface DriverAtLoc {
  id: string; name: string; vehicle_type?: string; vehicle_model?: string; is_available?: boolean;
}

export default function LocationAccommodatedPage() {
  const { user } = useAuth();
  const { guests } = useGuests();
  const {
    rooms, blocks, bedAssignments,
    assignGuestToRoom, removeGuestFromRoom,
    getOccupancy,
  } = useRooms();
  const { addEntry: addEntry2 } = useAuditTrail2();

  const [viewGuestId, setViewGuestId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterRoom, setFilterRoom] = useState('');
  const [filterBlock, setFilterBlock] = useState('');
  const [movePending, setMovePending] = useState<MovePending | null>(null);
  const [moveToRoomId, setMoveToRoomId] = useState('');

  // Checkboxes + swap
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [swapDialogOpen, setSwapDialogOpen] = useState(false);
  const [swapSaving, setSwapSaving] = useState(false);

  // Check-in / Check-out
  const [checkInOut, setCheckInOut] = useState<Record<string, { checkedInAt?: string; checkedOutAt?: string }>>({});
  const [checkOutPending, setCheckOutPending] = useState<{ guestId: string; name: string; roomName: string } | null>(null);

  // Driver assign state
  const [dropoffTaskMap, setDropoffTaskMap] = useState<Record<string, { driverName: string }>>({});
  const [pickupTaskMap, setPickupTaskMap]   = useState<Record<string, { driverName: string }>>({});
  const [driversAtLoc, setDriversAtLoc]     = useState<DriverAtLoc[]>([]);
  const [assignDriverGuest, setAssignDriverGuest] = useState<AccommodatedRow | null>(null);
  const [assignDriverId, setAssignDriverId]       = useState('');
  const [assignPickupTime, setAssignPickupTime]   = useState('');
  const [assignSaving, setAssignSaving]           = useState(false);

  // Departure checklist state
  const [checklistGuest, setChecklistGuest]   = useState<AccommodatedRow | null>(null);
  const [checklistState, setChecklistState]   = useState<Record<string, boolean[]>>({});

  const loc = user?.location ?? '';

  const todayStr    = useMemo(() => new Date().toISOString().split('T')[0], []);
  const tomorrowStr = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }, []);

  const locRooms  = useMemo(() => rooms.filter(r => r.locationId === loc && r.isActive), [rooms, loc]);
  const locBlocks = useMemo(() => blocks.filter(b => b.locationId === loc), [blocks, loc]);

  const guestById = useMemo(() => {
    const map = new Map<string, Guest>();
    for (const g of guests) map.set(g.id, g);
    return map;
  }, [guests]);

  const allRows = useMemo((): AccommodatedRow[] => {
    const rows: AccommodatedRow[] = [];
    for (const room of locRooms) {
      const block = blocks.find(b => b.id === room.blockId);
      for (const bed of bedAssignments[room.id] ?? []) {
        if (!bed.guestName || !bed.guestId) continue;
        const g = guestById.get(bed.guestId);
        const isFamily = !!(g && (g.familyGroupId || (g.guestType === 'family' && (g.familyMembers?.length ?? 0) > 0)));
        const lastName = g ? ((g.familyName ?? g.fullName).replace(' Family', '').split(' ').pop() ?? g.fullName) : '';
        const member = bed.familyMemberId ? (g?.familyMembers ?? []).find(m => m.id === bed.familyMemberId) : null;
        const relationship = g?.familyGroupId
          ? (g.isHeadOfFamily ? 'Head' : (g.relationship ?? '—'))
          : (member ? member.relationship : (isFamily ? 'Head' : 'Individual'));
        rows.push({
          rowKey: bed.familyMemberId ? `${bed.guestId}-${bed.familyMemberId}` : bed.guestId,
          guestId: bed.guestId,
          memberId: bed.familyMemberId ?? null,
          name: bed.guestName,
          country: g?.country ?? '—',
          referenceNumber: g?.referenceNumber ?? '—',
          isFamily,
          familyLastName: lastName,
          familyGroupId: g?.familyGroupId ?? null,
          relationship,
          roomId: room.id,
          roomName: room.name,
          blockName: block?.name ?? '—',
          blockId: block?.id ?? '',
          bedNumber: bed.bedNumber,
          assignedAt: bed.assignedAt,
          arrival_date: g?.arrival_date,
          arrival_time: g?.arrival_time,
          arrivalFlightNumber: g?.arrivalFlightNumber,
          departure_date: g?.departure_date,
          departure_time: g?.departure_time,
          departureFlightNumber: g?.departureFlightNumber,
          departureAirport: g?.departureAirport,
          departureTerminal: g?.departureTerminal,
        });
      }
    }
    return rows;
  }, [locRooms, blocks, bedAssignments, guestById]);

  const filteredRows = useMemo(() => {
    let rows = allRows;
    if (filterRoom)  rows = rows.filter(r => r.roomId  === filterRoom);
    if (filterBlock) rows = rows.filter(r => r.blockId === filterBlock);
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter(r =>
      r.name.toLowerCase().includes(q) ||
      r.country.toLowerCase().includes(q) ||
      r.referenceNumber.toLowerCase().includes(q),
    );
    return rows;
  }, [allRows, filterRoom, filterBlock, search]);

  const groupMeta = useMemo(() => {
    const counts = new Map<string, number>();
    const firstRowKey = new Map<string, string>();
    for (const r of filteredRows) {
      if (!r.isFamily) continue;
      const key = r.familyGroupId ?? r.guestId;
      const prev = counts.get(key) ?? 0;
      counts.set(key, prev + 1);
      if (prev === 0) firstRowKey.set(key, r.rowKey);
    }
    return { counts, firstRowKey };
  }, [filteredRows]);
  const [expandedFamilyIds, setExpandedFamilyIds] = useState<Set<string>>(new Set());

  const viewGuest = useMemo(() => guests.find(g => g.id === viewGuestId) ?? null, [guests, viewGuestId]);

  const moveableRooms = useMemo(() => {
    if (!movePending) return [];
    return locRooms.filter(r => {
      if (r.id === movePending.roomId) return false;
      return getOccupancy(r.id).available > 0;
    });
  }, [movePending, locRooms, getOccupancy]);

  // ── Fetch driver tasks for guests ─────────────────────────────────────────────

  const guestIdsKey = useMemo(
    () => [...new Set(allRows.map(r => r.guestId))].sort().join(','),
    [allRows],
  );

  const fetchDriverTasks = useCallback(async () => {
    if (!loc || !guestIdsKey) return;
    const guestIds = guestIdsKey.split(',').filter(Boolean);
    if (guestIds.length === 0) return;

    const [dropoffRes, pickupRes, driversRes] = await Promise.all([
      supabase
        .from('driver_tasks')
        .select('guest_id,driver_name,task_type')
        .in('guest_id', guestIds)
        .eq('task_type', 'airport_dropoff')
        .neq('status', 'cancelled'),
      supabase
        .from('driver_tasks')
        .select('guest_id,driver_name,status')
        .in('guest_id', guestIds)
        .eq('task_type', 'airport_pickup')
        .eq('status', 'completed'),
      supabase
        .from('users')
        .select('id,name,vehicle_type,vehicle_model,is_available')
        .eq('role', 'driver')
        .eq('location', loc),
    ]);

    const dropoffMap: Record<string, { driverName: string }> = {};
    for (const t of dropoffRes.data ?? []) {
      if (t.guest_id) dropoffMap[t.guest_id] = { driverName: t.driver_name ?? '—' };
    }
    setDropoffTaskMap(dropoffMap);

    const pickupMap: Record<string, { driverName: string }> = {};
    for (const t of pickupRes.data ?? []) {
      if (t.guest_id) pickupMap[t.guest_id] = { driverName: t.driver_name ?? '—' };
    }
    setPickupTaskMap(pickupMap);

    setDriversAtLoc((driversRes.data ?? []) as DriverAtLoc[]);
  }, [loc, guestIdsKey]);

  useEffect(() => { fetchDriverTasks(); }, [fetchDriverTasks]);

  // Auto-set pickup time when assign dialog opens
  useEffect(() => {
    if (!assignDriverGuest) { setAssignDriverId(''); return; }
    if (assignDriverGuest.departure_time) {
      const [hh, mm] = assignDriverGuest.departure_time.split(':').map(Number);
      const totalMins = hh * 60 + mm - 60;
      const pickup = `${String(Math.floor(((totalMins % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(((totalMins % 60) + 60) % 60).padStart(2, '0')}`;
      setAssignPickupTime(pickup);
    }
  }, [assignDriverGuest]);

  async function handleAssignDriver() {
    if (!assignDriverGuest || !assignDriverId || !user) return;
    setAssignSaving(true);
    const driver = driversAtLoc.find(d => d.id === assignDriverId);
    const depDate = assignDriverGuest.departure_date ?? todayStr;
    const dropoffLoc = [
      assignDriverGuest.departureAirport,
      assignDriverGuest.departureTerminal ? `Terminal ${assignDriverGuest.departureTerminal}` : null,
    ].filter(Boolean).join(' ');

    const { error } = await supabase.from('driver_tasks').insert({
      driver_id: assignDriverId,
      driver_name: driver?.name,
      task_type: 'airport_dropoff',
      guest_id: assignDriverGuest.guestId,
      guest_name: assignDriverGuest.name,
      pickup_location: loc,
      dropoff_location: dropoffLoc || 'Airport',
      scheduled_date: depDate,
      scheduled_time: assignPickupTime || null,
      flight_number: assignDriverGuest.departureFlightNumber ?? null,
      location: loc,
      status: 'pending',
      is_suggestion: false,
    });

    setAssignSaving(false);
    if (error) { toast.error('Failed to assign driver'); return; }
    toast.success(`${driver?.name} assigned to drop off ${assignDriverGuest.name}`);
    setDropoffTaskMap(prev => ({ ...prev, [assignDriverGuest.guestId]: { driverName: driver?.name ?? '—' } }));
    setAssignDriverGuest(null);
  }

  // ── Departure status helpers ──────────────────────────────────────────────────

  function getDepartureStatus(row: AccommodatedRow): 'today' | 'tomorrow' | 'none' {
    if (!row.departure_date) return 'none';
    if (row.departure_date === todayStr)    return 'today';
    if (row.departure_date === tomorrowStr) return 'tomorrow';
    return 'none';
  }

  function loadChecklist(guestId: string, hasDriver: boolean, isCheckedOut: boolean): boolean[] {
    try {
      const saved = JSON.parse(localStorage.getItem(`checklist_${guestId}`) ?? 'null');
      const base: boolean[] = Array.isArray(saved) && saved.length === 4 ? [...saved] : [false, false, false, false];
      base[2] = base[2] || hasDriver;
      base[3] = base[3] || isCheckedOut;
      return base;
    } catch {
      return [false, false, hasDriver, isCheckedOut];
    }
  }

  function openChecklist(row: AccommodatedRow) {
    const hasDriver  = !!dropoffTaskMap[row.guestId];
    const isCheckedOut = !!checkInOut[row.guestId]?.checkedOutAt;
    const items = loadChecklist(row.guestId, hasDriver, isCheckedOut);
    setChecklistState(prev => ({ ...prev, [row.guestId]: items }));
    setChecklistGuest(row);
  }

  async function handleChecklistToggle(idx: number) {
    if (!checklistGuest) return;
    const guestId = checklistGuest.guestId;
    const current = checklistState[guestId] ?? [false, false, false, false];
    const next = [...current];
    next[idx] = !next[idx];
    localStorage.setItem(`checklist_${guestId}`, JSON.stringify(next));
    setChecklistState(prev => ({ ...prev, [guestId]: next }));

    // Auto-mark room for cleaning when roomInspected(1) AND checkedOut(3) both checked
    if (next[1] && next[3] && checklistGuest.roomId) {
      const { error } = await supabase
        .from('rooms')
        .update({ status: 'cleaning' })
        .eq('id', checklistGuest.roomId);
      if (!error) toast.success(`Room ${checklistGuest.roomName} marked for cleaning`);
    }
  }

  function getChecklistCompletion(guestId: string): number {
    const items = checklistState[guestId] ?? null;
    if (!items) return -1; // unknown — haven't opened yet
    return items.filter(Boolean).length;
  }

  function ChecklistIcon({ row }: { row: AccommodatedRow }) {
    const depStatus = getDepartureStatus(row);
    if (depStatus === 'none') return null;
    const hasDriver   = !!dropoffTaskMap[row.guestId];
    const isCheckedOut = !!checkInOut[row.guestId]?.checkedOutAt;
    const saved = (() => {
      try { return JSON.parse(localStorage.getItem(`checklist_${row.guestId}`) ?? 'null'); } catch { return null; }
    })();
    const items: boolean[] = Array.isArray(saved) && saved.length === 4 ? [...saved] : [false, false, false, false];
    items[2] = items[2] || hasDriver;
    items[3] = items[3] || isCheckedOut;
    const done = items.filter(Boolean).length;
    const all  = CHECKLIST_ITEMS.length;
    if (done === all) return <span title="All complete">🟢</span>;
    return depStatus === 'today'
      ? <span title="Departing today — checklist incomplete">🔴</span>
      : <span title="Departing tomorrow — checklist incomplete">🟡</span>;
  }

  // ── Check-in / Check-out ─────────────────────────────────────────────────────

  useEffect(() => {
    const ids = allRows.map(r => r.guestId);
    if (ids.length === 0) return;
    supabase.from('guests').select('id, checked_in_at, checked_out_at').in('id', ids)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data }: { data: any[] | null }) => {
        if (!data) return;
        const map: Record<string, { checkedInAt?: string; checkedOutAt?: string }> = {};
        for (const row of data) {
          map[row.id] = {
            checkedInAt: row.checked_in_at ?? undefined,
            checkedOutAt: row.checked_out_at ?? undefined,
          };
        }
        setCheckInOut(map);
      });
  }, [allRows.length]);

  async function handleCheckIn(guestId: string, guestName: string) {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('guests')
      .update({ checked_in_at: now, updated_at: now })
      .eq('id', guestId);
    if (error) { toast.error('Failed to check in'); return; }
    setCheckInOut(prev => ({ ...prev, [guestId]: { ...prev[guestId], checkedInAt: now } }));
    const time = new Date(now).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    toast.success(`${guestName} checked in at ${time}`);
  }

  async function handleCheckOut(guestId: string, guestName: string) {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('guests')
      .update({ checked_out_at: now, updated_at: now })
      .eq('id', guestId);
    if (error) { toast.error('Failed to check out'); return; }
    setCheckInOut(prev => ({ ...prev, [guestId]: { ...prev[guestId], checkedOutAt: now } }));
    const time = new Date(now).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    toast.success(`${guestName} checked out at ${time}`);
    setCheckOutPending(null);
  }

  // ── Move guest ───────────────────────────────────────────────────────────────

  const handleConfirmMove = () => {
    if (!movePending || !moveToRoomId) return;
    const { roomId, bedNumber, guestId, guestName, familyMemberId } = movePending;
    const targetRoom = rooms.find(r => r.id === moveToRoomId);
    const nextBed = (bedAssignments[moveToRoomId] ?? []).find(b => !b.guestName)?.bedNumber;
    if (!nextBed || !targetRoom) { toast.error('No available beds in target room'); return; }
    removeGuestFromRoom(roomId, bedNumber);
    assignGuestToRoom(moveToRoomId, nextBed, guestId, guestName, familyMemberId);
    toast.success(`${guestName} moved to ${targetRoom.name} · Bed ${nextBed}`);
    setMovePending(null); setMoveToRoomId('');
  };

  // ── Swap Rooms ───────────────────────────────────────────────────────────────

  const selectedGuestRows = useMemo(
    () => allRows.filter(r => selectedRows.has(r.rowKey)),
    [allRows, selectedRows],
  );

  const canSwap = selectedGuestRows.length === 2 &&
    selectedGuestRows[0].roomId !== selectedGuestRows[1].roomId;

  async function handleSwapConfirm() {
    if (!canSwap || !user) return;
    const [a, b] = selectedGuestRows;
    setSwapSaving(true);
    try {
      const [resA, resB] = await Promise.all([
        supabase.from('bed_assignments').select('id').eq('guest_id', a.guestId).maybeSingle(),
        supabase.from('bed_assignments').select('id').eq('guest_id', b.guestId).maybeSingle(),
      ]);
      const idA = resA.data?.id;
      const idB = resB.data?.id;
      if (!idA || !idB) { toast.error('Could not find bed assignments'); return; }

      const now = new Date().toISOString();
      await Promise.all([
        supabase.from('bed_assignments').delete().eq('id', idA),
        supabase.from('bed_assignments').delete().eq('id', idB),
      ]);
      await Promise.all([
        supabase.from('bed_assignments').insert({ room_id: b.roomId, bed_number: b.bedNumber, guest_id: a.guestId, guest_name: a.name, assigned_at: now }),
        supabase.from('bed_assignments').insert({ room_id: a.roomId, bed_number: a.bedNumber, guest_id: b.guestId, guest_name: b.name, assigned_at: now }),
      ]);

      const gA = guests.find(g => g.id === a.guestId);
      const gB = guests.find(g => g.id === b.guestId);
      if (gA) addEntry2({ guestId: a.guestId, guestName: a.name, guestReference: gA.referenceNumber, locationId: loc, locationName: loc, departmentId: gA.assignedDepartment ?? '', departmentName: gA.assignedDepartment ?? '', type: 'room_change', action: `Swapped rooms: ${a.roomName} ↔ ${b.roomName}`, oldValue: a.roomName, newValue: b.roomName, createdBy: { id: user.id, name: user.name, role: 'location-manager' }, createdAt: now });
      if (gB) addEntry2({ guestId: b.guestId, guestName: b.name, guestReference: gB.referenceNumber, locationId: loc, locationName: loc, departmentId: gB.assignedDepartment ?? '', departmentName: gB.assignedDepartment ?? '', type: 'room_change', action: `Swapped rooms: ${b.roomName} ↔ ${a.roomName}`, oldValue: b.roomName, newValue: a.roomName, createdBy: { id: user.id, name: user.name, role: 'location-manager' }, createdAt: now });

      toast.success(`Rooms swapped: ${a.name} (${a.roomName}) ↔ ${b.name} (${b.roomName})`);
      setSwapDialogOpen(false);
      setSelectedRows(new Set());
    } catch {
      toast.error('Swap failed');
    } finally {
      setSwapSaving(false);
    }
  }

  function fmtTime(iso?: string) {
    if (!iso) return null;
    return formatTimestampTime(iso); // called on ISO timestamps (driver_tasks.completed_at / started_at)
  }

  if (!user) return null;

  // Active checklist items (for the open dialog)
  const activeChecklist: boolean[] = checklistGuest
    ? (checklistState[checklistGuest.guestId] ?? [false, false, false, false])
    : [false, false, false, false];
  const checklistDone = activeChecklist.filter(Boolean).length;
  const checklistPct  = Math.round((checklistDone / CHECKLIST_ITEMS.length) * 100);
  const allComplete   = checklistDone === CHECKLIST_ITEMS.length;

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <div className="flex">
        <LocationSidebar />
        <main className="flex-1 ml-64">
          <header className="bg-white border-b border-[#E8E3DB] px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-[#2D5A45]" />
                <div>
                  <h1 className="text-xl font-semibold text-[#1A1A1A]">Accommodated Guests</h1>
                  <p className="text-xs text-[#4A4A4A] mt-0.5">Guests with room assignments at {loc}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="bg-green-100 text-green-700 text-xs font-semibold px-3 py-1 rounded-full border border-green-200">
                  {allRows.length} accommodated
                </span>
                <LocationUserMenu />
              </div>
            </div>
          </header>

          <div className="p-6 space-y-4">
            {/* Toolbar */}
            {allRows.length > 0 && (
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative max-w-xs flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                  <Input
                    placeholder="Search by name, country, room…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-10 border-[#D4CFC7] focus:border-[#2D5A45] h-10 bg-white"
                  />
                </div>
                {locBlocks.length > 0 && (
                  <select
                    value={filterBlock}
                    onChange={e => { setFilterBlock(e.target.value); setFilterRoom(''); }}
                    className="border border-[#D4CFC7] rounded-lg px-3 py-2 text-sm text-[#1A1A1A] bg-white focus:outline-none focus:border-[#2D5A45] h-10"
                  >
                    <option value="">All blocks</option>
                    {locBlocks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                )}
                <select
                  value={filterRoom}
                  onChange={e => setFilterRoom(e.target.value)}
                  className="border border-[#D4CFC7] rounded-lg px-3 py-2 text-sm text-[#1A1A1A] bg-white focus:outline-none focus:border-[#2D5A45] h-10"
                >
                  <option value="">All rooms</option>
                  {locRooms
                    .filter(r => !filterBlock || r.blockId === filterBlock)
                    .map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                {selectedRows.size > 0 && (
                  <span className="text-xs text-[#4A4A4A]">{selectedRows.size} selected</span>
                )}
                {canSwap && (
                  <Button
                    onClick={() => setSwapDialogOpen(true)}
                    variant="outline"
                    className="h-9 px-3 text-sm border-[#D4CFC7] text-[#4A4A4A] gap-1.5"
                  >
                    <ArrowRightLeft className="w-4 h-4" /> Swap Rooms
                  </Button>
                )}
              </div>
            )}

            {allRows.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#E8E3DB] p-12 text-center">
                <CheckCircle className="w-12 h-12 mx-auto mb-4 text-[#D4CFC7]" />
                <h2 className="text-base font-semibold text-[#1A1A1A] mb-1">No accommodated guests yet</h2>
                <p className="text-sm text-[#4A4A4A]">Assign incoming guests to rooms from the Incoming page.</p>
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#E8E3DB] p-10 text-center">
                <Search className="w-10 h-10 mx-auto mb-3 text-[#D4CFC7]" />
                <p className="text-sm font-medium text-[#1A1A1A] mb-1">No results</p>
                <p className="text-xs text-[#4A4A4A]">Try different search or filter values.</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-[#E8E3DB] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#E8E3DB] bg-[#F9F8F6]">
                      <th className="px-3 py-3 w-9"></th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Reference</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Name</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Country</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Room</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Bed</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Arrival</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Departure</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Driver</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Checklist</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Check-in</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E3DB]">
                    {filteredRows.map(row => {
                      const familyKey = row.familyGroupId ?? row.guestId;
                      const groupCount = groupMeta.counts.get(familyKey) ?? 0;
                      const isFirstInGroup = row.isFamily && groupMeta.firstRowKey.get(familyKey) === row.rowKey;
                      const ciData     = checkInOut[row.guestId];
                      const checkedIn  = ciData?.checkedInAt;
                      const checkedOut = ciData?.checkedOutAt;
                      const dropoff    = dropoffTaskMap[row.guestId];
                      const pickup     = pickupTaskMap[row.guestId];
                      const depStatus  = getDepartureStatus(row);

                      return (
                      <Fragment key={row.rowKey}>
                        {isFirstInGroup && groupCount > 1 && (
                          <tr
                            className="bg-[#F0F7F4] border-b border-[#D4E9DC] cursor-pointer hover:bg-[#E8F5EE] select-none"
                            onClick={() => setExpandedFamilyIds(prev => {
                              const next = new Set(prev);
                              next.has(familyKey) ? next.delete(familyKey) : next.add(familyKey);
                              return next;
                            })}
                          >
                            <td colSpan={14} className="px-4 py-2">
                              <div className="flex items-center gap-2">
                                <ChevronRight className={`w-3.5 h-3.5 text-[#2D5A45] transition-transform duration-200 shrink-0 ${expandedFamilyIds.has(familyKey) ? 'rotate-90' : ''}`} />
                                <Users className="w-3.5 h-3.5 text-[#2D5A45] shrink-0" />
                                <span className="text-xs text-[#2D5A45] font-semibold">
                                  {row.familyLastName} Family · {groupCount} members
                                </span>
                                <span className="text-xs text-[#4A4A4A]">
                                  {expandedFamilyIds.has(familyKey) ? '— click to collapse' : '— click to expand'}
                                </span>
                              </div>
                            </td>
                          </tr>
                        )}
                        {(!row.isFamily || groupCount <= 1 || expandedFamilyIds.has(familyKey)) && (
                        <tr className={`hover:bg-[#F9F8F6] ${selectedRows.has(row.rowKey) ? 'bg-[#F0F7F4]' : ''} ${row.isFamily && groupCount > 1 ? 'border-l-4 border-[#2D5A45]/20' : ''}`}>
                          {/* Checkbox */}
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
                          <td className="px-4 py-3 font-mono text-xs text-[#4A4A4A]" title={row.referenceNumber}>{shortenRef(row.referenceNumber)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5 flex-wrap">
                              <span className="font-medium text-[#1A1A1A]">{row.name}</span>
                              {row.isFamily && groupCount > 1 && (
                                <span className="text-xs text-[#4A4A4A] bg-[#F0F7F4] border border-[#D4E9DC] rounded px-1.5 py-0.5">
                                  {row.relationship || 'Family'}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-[#4A4A4A]">{row.country}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                              {row.roomName}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-[#4A4A4A]">Bed {row.bedNumber}</td>
                          {/* Arrival */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            {(row.arrival_date || row.arrival_time) ? (
                              <div>
                                <div className="text-xs text-[#1A1A1A]">
                                  {formatDateShort(row.arrival_date)}
                                  {' · '}{formatTime(row.arrival_time)}
                                </div>
                                {row.arrivalFlightNumber && (
                                  <div className="text-xs text-gray-400">{row.arrivalFlightNumber}</div>
                                )}
                                {pickup && (
                                  <div className="text-xs text-green-600 mt-0.5">✅ Picked up by {pickup.driverName}</div>
                                )}
                              </div>
                            ) : <span className="text-gray-300 text-xs">—</span>}
                          </td>
                          {/* Departure */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            {(row.departure_date || row.departure_time) ? (
                              <div>
                                <div className="text-xs text-[#1A1A1A]">
                                  {formatDateShort(row.departure_date)}
                                  {' · '}{formatTime(row.departure_time)}
                                </div>
                                {row.departureFlightNumber && (
                                  <div className="text-xs text-gray-400">{row.departureFlightNumber}</div>
                                )}
                              </div>
                            ) : <span className="text-gray-300 text-xs">—</span>}
                          </td>
                          {/* Driver column */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            {dropoff ? (
                              <span className="flex items-center gap-1 text-xs text-green-700">
                                <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                                {dropoff.driverName}
                              </span>
                            ) : row.departure_date ? (
                              <div className="flex flex-col gap-1">
                                <span className="flex items-center gap-1 text-xs text-amber-600">
                                  <AlertCircle className="w-3 h-3" /> No driver
                                </span>
                                <button
                                  onClick={() => setAssignDriverGuest(row)}
                                  className="text-amber-600 hover:bg-amber-50 rounded-md px-2 py-1 text-xs border border-amber-200 transition-colors"
                                >
                                  Assign Driver
                                </button>
                              </div>
                            ) : (
                              <span className="text-gray-300 text-xs">—</span>
                            )}
                          </td>
                          {/* Checklist column */}
                          <td className="px-4 py-3">
                            {depStatus !== 'none' ? (
                              <button
                                onClick={() => openChecklist(row)}
                                className="flex items-center gap-1.5 text-xs hover:bg-gray-50 rounded-md px-2 py-1 transition-colors border border-gray-200"
                                title="Departure checklist"
                              >
                                <ChecklistIcon row={row} />
                                <ClipboardList className="w-3 h-3 text-gray-400" />
                              </button>
                            ) : (
                              <span className="text-gray-300 text-xs">—</span>
                            )}
                          </td>
                          {/* Check-in */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            {checkedOut ? (
                              <span className="text-xs text-gray-400">✅✅ Out {fmtTime(checkedOut)}</span>
                            ) : checkedIn ? (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs text-green-700">✅ {fmtTime(checkedIn)}</span>
                                <button
                                  onClick={() => setCheckOutPending({ guestId: row.guestId, name: row.name, roomName: row.roomName })}
                                  className="text-xs px-2 py-0.5 rounded border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors"
                                >
                                  Check Out
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleCheckIn(row.guestId, row.name)}
                                className="text-xs px-2.5 py-1 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors font-medium"
                              >
                                Check In
                              </button>
                            )}
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
                                onClick={() => setMovePending({ rowKey: row.rowKey, roomId: row.roomId, bedNumber: row.bedNumber, guestId: row.guestId, guestName: row.name, familyMemberId: row.memberId ?? undefined })}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#4A4A4A] border border-[#D4CFC7] hover:bg-[#F5F0E8] transition-colors"
                                title="Move guest"
                              >
                                <MoveRight className="w-3.5 h-3.5" /> Move
                              </button>
                            </div>
                          </td>
                        </tr>
                        )}
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

      <GuestViewModal guest={viewGuest} open={!!viewGuestId} onClose={() => setViewGuestId(null)} />

      {/* Move dialog */}
      <Dialog open={!!movePending} onOpenChange={o => { if (!o) { setMovePending(null); setMoveToRoomId(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[#1A1A1A]">Change Room</DialogTitle>
          </DialogHeader>
          <div className="py-1 space-y-3">
            <p className="text-sm text-[#1A1A1A]">Move <strong>{movePending?.guestName}</strong> to:</p>
            <select
              value={moveToRoomId}
              onChange={e => setMoveToRoomId(e.target.value)}
              className="w-full border border-[#D4CFC7] rounded-md px-3 py-2 text-sm text-[#1A1A1A] bg-white focus:outline-none focus:border-[#2D5A45]"
            >
              <option value="">Select room…</option>
              {moveableRooms.map(r => {
                const occ = getOccupancy(r.id);
                return <option key={r.id} value={r.id}>{r.name} ({occ.occupied}/{occ.total})</option>;
              })}
            </select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setMovePending(null); setMoveToRoomId(''); }} className="border-[#D4CFC7] text-[#4A4A4A] h-9 text-sm">Cancel</Button>
            <Button disabled={!moveToRoomId} onClick={handleConfirmMove} className="bg-[#2D5A45] hover:bg-[#234839] text-white h-9 text-sm">Move Guest</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Swap Rooms dialog */}
      <Dialog open={swapDialogOpen} onOpenChange={o => { if (!o) setSwapDialogOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[#1A1A1A]">Swap Rooms</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3 text-sm">
            {selectedGuestRows.length === 2 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[#1A1A1A]">{selectedGuestRows[0].name}</span>
                  <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">{selectedGuestRows[0].roomName}</span>
                </div>
                <div className="text-center text-[#4A4A4A]">⇅</div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[#1A1A1A]">{selectedGuestRows[1].name}</span>
                  <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">{selectedGuestRows[1].roomName}</span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSwapDialogOpen(false)} className="border-[#D4CFC7] text-[#4A4A4A] h-9 text-sm">Cancel</Button>
            <Button disabled={swapSaving} onClick={handleSwapConfirm} className="bg-[#2D5A45] hover:bg-[#234839] text-white h-9 text-sm">
              {swapSaving ? 'Swapping…' : 'Confirm Swap'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Check-out confirmation */}
      <AlertDialog open={!!checkOutPending} onOpenChange={o => { if (!o) setCheckOutPending(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Check Out Guest</AlertDialogTitle>
            <AlertDialogDescription>
              Check out <strong>{checkOutPending?.name}</strong> from Room <strong>{checkOutPending?.roomName}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => checkOutPending && handleCheckOut(checkOutPending.guestId, checkOutPending.name)}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              Check Out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Quick Assign Driver dialog ─────────────────────────────────────────── */}
      <Dialog open={!!assignDriverGuest} onOpenChange={o => { if (!o) setAssignDriverGuest(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#1A1A1A]">
              <Car className="w-4 h-4 text-[#2D5A45]" /> Assign Driver for Dropoff
            </DialogTitle>
          </DialogHeader>
          {assignDriverGuest && (
            <div className="space-y-4 py-1">
              <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                <div><span className="text-gray-500">Guest:</span> <span className="font-medium text-[#1A1A1A]">{assignDriverGuest.name}</span></div>
                {(assignDriverGuest.departure_date || assignDriverGuest.departure_time) && (
                  <div>
                    <span className="text-gray-500">Departure:</span>{' '}
                    <span className="text-[#1A1A1A]">
                      {formatDate(assignDriverGuest.departure_date)},{' '}
                      {formatTime(assignDriverGuest.departure_time)}
                    </span>
                  </div>
                )}
                {assignDriverGuest.departureFlightNumber && (
                  <div>
                    <span className="text-gray-500">Flight:</span>{' '}
                    <span className="font-mono text-[#1A1A1A]">{assignDriverGuest.departureFlightNumber}</span>
                    {assignDriverGuest.departureAirport && <span className="text-gray-500"> · {assignDriverGuest.departureAirport}</span>}
                    {assignDriverGuest.departureTerminal && <span className="text-gray-500"> T{assignDriverGuest.departureTerminal}</span>}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-[#4A4A4A]">Pickup Time</label>
                <input
                  type="time"
                  value={assignPickupTime}
                  onChange={e => setAssignPickupTime(e.target.value)}
                  className="w-full border border-[#D4CFC7] rounded-lg px-3 py-2 text-sm text-[#1A1A1A] bg-white focus:outline-none focus:border-[#2D5A45]"
                />
                <p className="text-xs text-gray-400">Auto-set to 1 hour before departure</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-[#4A4A4A]">Driver</label>
                <select
                  value={assignDriverId}
                  onChange={e => setAssignDriverId(e.target.value)}
                  className="w-full border border-[#D4CFC7] rounded-lg px-3 py-2 text-sm text-[#1A1A1A] bg-white focus:outline-none focus:border-[#2D5A45]"
                >
                  <option value="">Select driver…</option>
                  {driversAtLoc.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name}{d.vehicle_type ? ` — ${d.vehicle_type}${d.vehicle_model ? ` ${d.vehicle_model}` : ''}` : ''}
                      {!d.is_available ? ' (off duty)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDriverGuest(null)} className="border-[#D4CFC7] text-[#4A4A4A] h-9 text-sm">Cancel</Button>
            <Button
              disabled={!assignDriverId || assignSaving}
              onClick={handleAssignDriver}
              className="bg-[#2D5A45] hover:bg-[#234839] text-white h-9 text-sm"
            >
              {assignSaving ? 'Assigning…' : 'Assign Driver'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Departure Checklist dialog ─────────────────────────────────────────── */}
      <Dialog open={!!checklistGuest} onOpenChange={o => { if (!o) setChecklistGuest(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#1A1A1A]">
              <ClipboardList className="w-4 h-4 text-[#2D5A45]" />
              Departure Checklist — {checklistGuest?.name}
            </DialogTitle>
          </DialogHeader>
          {checklistGuest && (
            <div className="space-y-4 py-1">
              {/* Guest departure info */}
              {(checklistGuest.departure_date || checklistGuest.departure_time) && (
                <div className="text-sm text-[#4A4A4A]">
                  Departing:{' '}
                  <span className="font-medium text-[#1A1A1A]">
                    {formatDate(checklistGuest.departure_date)},{' '}
                    {formatTime(checklistGuest.departure_time)}
                  </span>
                  {checklistGuest.departureFlightNumber && (
                    <span className="font-mono ml-2">· {checklistGuest.departureFlightNumber}</span>
                  )}
                  {checklistGuest.departureAirport && (
                    <span className="ml-1 text-gray-400">
                      · {checklistGuest.departureAirport}{checklistGuest.departureTerminal ? ` T${checklistGuest.departureTerminal}` : ''}
                    </span>
                  )}
                </div>
              )}

              {/* Checklist items */}
              <div className="space-y-2">
                {CHECKLIST_ITEMS.map((item, idx) => {
                  const isAutoChecked = (idx === 2 && !!dropoffTaskMap[checklistGuest.guestId]) ||
                                        (idx === 3 && !!checkInOut[checklistGuest.guestId]?.checkedOutAt);
                  const checked = activeChecklist[idx] ?? false;
                  return (
                    <label
                      key={idx}
                      className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
                        checked ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-100 hover:bg-gray-100'
                      } ${isAutoChecked ? 'opacity-80' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => !isAutoChecked && handleChecklistToggle(idx)}
                        disabled={isAutoChecked}
                        className="w-4 h-4 rounded border-gray-300 accent-[#2D5A45]"
                      />
                      <span className={`text-sm ${checked ? 'text-green-800 line-through' : 'text-[#1A1A1A]'}`}>
                        {item}
                      </span>
                      {isAutoChecked && (
                        <span className="ml-auto text-xs text-green-600 font-medium">auto</span>
                      )}
                    </label>
                  );
                })}
              </div>

              {/* Progress bar */}
              <div>
                <div className="flex items-center justify-between mb-1.5 text-xs text-[#4A4A4A]">
                  <span>Progress: {checklistDone} of {CHECKLIST_ITEMS.length} completed</span>
                  <span>{checklistPct}%</span>
                </div>
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${allComplete ? 'bg-green-500' : 'bg-[#2D5A45]'}`}
                    style={{ width: `${checklistPct}%` }}
                  />
                </div>
                {allComplete && (
                  <p className="text-xs text-green-600 font-medium mt-1.5">✅ Ready for departure</p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setChecklistGuest(null)} className="bg-[#2D5A45] hover:bg-[#234839] text-white h-9 text-sm">Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
