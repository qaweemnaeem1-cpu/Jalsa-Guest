import { useMemo, useState } from 'react';
import { CheckCircle, Eye, Search, MoveRight } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { useRooms } from '@/hooks/useRooms';
import { LocationSidebar } from '@/components/LocationSidebar';
import { LocationUserMenu } from '@/components/LocationUserMenu';
import { FamilyBadge, type FamilyMemberInfo } from '@/components/FamilyBadge';
import { GuestViewModal } from '@/components/GuestViewModal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
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
  familyAllMembers: FamilyMemberInfo[];
  roomId: string;
  roomName: string;
  blockName: string;
  blockId: string;
  bedNumber: number;
  assignedAt?: string;
}

function buildFamilyMemberList(g: Guest): FamilyMemberInfo[] {
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

  const [viewGuestId, setViewGuestId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterRoom, setFilterRoom] = useState('');
  const [filterBlock, setFilterBlock] = useState('');
  const [movePending, setMovePending] = useState<MovePending | null>(null);
  const [moveToRoomId, setMoveToRoomId] = useState('');

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
        const isFamily = !!(g && g.guestType === 'family' && (g.familyMembers?.length ?? 0) > 0);
        const lastName = g ? g.fullName.split(' ').pop() ?? g.fullName : '';
        const familyAllMembers = g && isFamily ? buildFamilyMemberList(g) : [];
        rows.push({
          rowKey: bed.familyMemberId ? `${bed.guestId}-${bed.familyMemberId}` : bed.guestId,
          guestId: bed.guestId,
          memberId: bed.familyMemberId ?? null,
          name: bed.guestName,
          country: g?.country ?? '—',
          referenceNumber: g?.referenceNumber ?? '—',
          isFamily,
          familyLastName: lastName,
          familyAllMembers,
          roomId: room.id,
          roomName: room.name,
          blockName: block?.name ?? '—',
          blockId: block?.id ?? '',
          bedNumber: bed.bedNumber,
          assignedAt: bed.assignedAt,
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
            {/* Filters */}
            {allRows.length > 0 && (
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative max-w-xs flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
                  <Input
                    placeholder="Search by name, country…"
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
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Reference</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Name</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Country</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Block</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Room</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Bed</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Date</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E3DB]">
                    {filteredRows.map(row => (
                      <tr key={row.rowKey} className="hover:bg-[#F9F8F6]">
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
                        <td className="px-4 py-3 text-[#4A4A4A]">{row.country}</td>
                        <td className="px-4 py-3 text-[#4A4A4A]">{row.blockName}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                            {row.roomName}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[#4A4A4A]">Bed {row.bedNumber}</td>
                        <td className="px-4 py-3 text-[#4A4A4A]">
                          {row.assignedAt ? new Date(row.assignedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
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
                              title="Change room"
                            >
                              <MoveRight className="w-3.5 h-3.5" /> Change Room
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
    </div>
  );
}
