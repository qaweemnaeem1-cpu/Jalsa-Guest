import { useEffect, useMemo, useState } from 'react';
import { CheckCircle, Eye, Search, MoveRight, ArrowRightLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { useRooms } from '@/hooks/useRooms';
import { useAuditTrail2 } from '@/hooks/useAuditTrail2';
import { LocationSidebar } from '@/components/LocationSidebar';
import { LocationUserMenu } from '@/components/LocationUserMenu';
import { FamilyBadge, type FamilyMemberInfo } from '@/components/FamilyBadge';
import { FamilyLinkDialog } from '@/components/FamilyLinkDialog';
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
  familyAllMembers: FamilyMemberInfo[];
  roomId: string;
  roomName: string;
  blockName: string;
  blockId: string;
  bedNumber: number;
  assignedAt?: string;
  arrivalTime?: string;
  arrivalFlightNumber?: string;
  departureTime?: string;
  departureFlightNumber?: string;
}

function buildFamilyMemberList(g: Guest, allGuests?: Guest[]): FamilyMemberInfo[] {
  // New model: use family_group_id to find all members
  if (g.familyGroupId && allGuests) {
    return allGuests
      .filter(x => x.familyGroupId === g.familyGroupId)
      .map(x => ({
        name: x.fullName,
        relationship: x.isHeadOfFamily ? 'Head' : (x.relationship ?? '—'),
        status: x.status,
        assignedDepartment: x.assignedDepartment,
        placedLocation: x.placedLocation,
      }));
  }
  // Old model
  return [
    { name: g.fullName, relationship: 'Head', status: g.status, assignedDepartment: g.assignedDepartment, placedLocation: g.placedLocation },
    ...(g.familyMembers ?? []).map(m => ({
      name: m.name, relationship: m.relationship, status: m.status ?? g.status,
      assignedDepartment: m.assignedDepartment, placedLocation: m.placedLocation,
    })),
  ];
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface MovePending {
  rowKey: string; roomId: string; bedNumber: number;
  guestId: string; guestName: string; familyMemberId?: string;
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

  const loc = user?.location ?? '';

  const locRooms  = useMemo(() => rooms.filter(r => r.locationId === loc && r.isActive), [rooms, loc]);
  const locBlocks = useMemo(() => blocks.filter(b => b.locationId === loc), [blocks, loc]);

  // Index guests by id for fast lookup
  const guestById = useMemo(() => {
    const map = new Map<string, Guest>();
    for (const g of guests) map.set(g.id, g);
    return map;
  }, [guests]);

  // Build accommodated rows from bed assignments
  const allRows = useMemo((): AccommodatedRow[] => {
    const rows: AccommodatedRow[] = [];
    for (const room of locRooms) {
      const block = blocks.find(b => b.id === room.blockId);
      for (const bed of bedAssignments[room.id] ?? []) {
        if (!bed.guestName || !bed.guestId) continue;
        const g = guestById.get(bed.guestId);
        const isFamily = !!(g && (g.familyGroupId || (g.guestType === 'family' && (g.familyMembers?.length ?? 0) > 0)));
        const lastName = g ? ((g.familyName ?? g.fullName).replace(' Family', '').split(' ').pop() ?? g.fullName) : '';
        const familyAllMembers = g && isFamily ? buildFamilyMemberList(g, guests) : [];
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
          familyAllMembers,
          roomId: room.id,
          roomName: room.name,
          blockName: block?.name ?? '—',
          blockId: block?.id ?? '',
          bedNumber: bed.bedNumber,
          assignedAt: bed.assignedAt,
          arrivalTime: g?.arrivalTime,
          arrivalFlightNumber: g?.arrivalFlightNumber,
          departureTime: g?.departureTime,
          departureFlightNumber: g?.departureFlightNumber,
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

  const viewGuest = useMemo(() => guests.find(g => g.id === viewGuestId) ?? null, [guests, viewGuestId]);

  // Available rooms for move (with space, excluding current)
  const moveableRooms = useMemo(() => {
    if (!movePending) return [];
    return locRooms.filter(r => {
      if (r.id === movePending.roomId) return false;
      return getOccupancy(r.id).available > 0;
    });
  }, [movePending, locRooms, getOccupancy]);

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
      // Fetch both bed_assignment IDs
      const [resA, resB] = await Promise.all([
        supabase.from('bed_assignments').select('id').eq('guest_id', a.guestId).maybeSingle(),
        supabase.from('bed_assignments').select('id').eq('guest_id', b.guestId).maybeSingle(),
      ]);
      const idA = resA.data?.id;
      const idB = resB.data?.id;
      if (!idA || !idB) { toast.error('Could not find bed assignments'); return; }

      const now = new Date().toISOString();

      // Delete both assignments
      await Promise.all([
        supabase.from('bed_assignments').delete().eq('id', idA),
        supabase.from('bed_assignments').delete().eq('id', idB),
      ]);

      // Re-insert swapped
      await Promise.all([
        supabase.from('bed_assignments').insert({ room_id: b.roomId, bed_number: b.bedNumber, guest_id: a.guestId, guest_name: a.name, assigned_at: now }),
        supabase.from('bed_assignments').insert({ room_id: a.roomId, bed_number: a.bedNumber, guest_id: b.guestId, guest_name: b.name, assigned_at: now }),
      ]);

      // Audit
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
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  if (!user) return null;

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
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Family</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Country</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Room</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Bed</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Arrival</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Departure</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Check-in</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E3DB]">
                    {filteredRows.map(row => {
                      const ciData = checkInOut[row.guestId];
                      const checkedIn  = ciData?.checkedInAt;
                      const checkedOut = ciData?.checkedOutAt;
                      return (
                        <tr key={row.rowKey} className={`hover:bg-[#F9F8F6] ${selectedRows.has(row.rowKey) ? 'bg-[#F0F7F4]' : ''}`}>
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
                          <td className="px-4 py-3 font-mono text-xs text-[#4A4A4A]">{row.referenceNumber}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5 flex-wrap">
                              <div className="w-8 h-8 bg-[#2D5A45] rounded-full flex items-center justify-center text-white text-sm font-medium shrink-0">
                                {row.name.charAt(0)}
                              </div>
                              <span className="font-medium text-[#1A1A1A]">{row.name}</span>
                              {row.isFamily && (
                                <FamilyBadge lastName={row.familyLastName} members={row.familyAllMembers} currentDept={loc} />
                              )}
                            </div>
                          </td>
                          {/* Family */}
                          <td className="px-4 py-3">
                            {row.isFamily && row.familyGroupId ? (
                              <FamilyLinkDialog familyGroupId={row.familyGroupId} familyName={row.familyLastName} />
                            ) : <span className="text-gray-300 text-xs">—</span>}
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
                            {row.arrivalTime ? (
                              <div>
                                <div className="text-xs text-[#1A1A1A]">
                                  {new Date(row.arrivalTime).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                  {' '}{new Date(row.arrivalTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                </div>
                                {row.arrivalFlightNumber && (
                                  <div className="text-xs text-gray-400">{row.arrivalFlightNumber}</div>
                                )}
                              </div>
                            ) : <span className="text-gray-300 text-xs">—</span>}
                          </td>
                          {/* Departure */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            {row.departureTime ? (
                              <div>
                                <div className="text-xs text-[#1A1A1A]">
                                  {new Date(row.departureTime).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                  {' '}{new Date(row.departureTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                </div>
                                {row.departureFlightNumber && (
                                  <div className="text-xs text-gray-400">{row.departureFlightNumber}</div>
                                )}
                              </div>
                            ) : <span className="text-gray-300 text-xs">—</span>}
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
    </div>
  );
}
