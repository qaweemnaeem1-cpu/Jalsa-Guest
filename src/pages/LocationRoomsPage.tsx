import { useMemo, useState } from 'react';
import { BedDouble, Plus, Pencil, Trash2, ChevronDown, ChevronRight, UserX, MoveRight } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { useRooms } from '@/hooks/useRooms';
import { useAuditTrail2 } from '@/hooks/useAuditTrail2';
import { LocationSidebar } from '@/components/LocationSidebar';
import { LocationUserMenu } from '@/components/LocationUserMenu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { Block, Room } from '@/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function OccupancyBar({ occupied, total }: { occupied: number; total: number }) {
  const pct = total > 0 ? Math.round((occupied / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden shrink-0">
        <div className="h-full bg-[#2D5A45] rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500">{occupied}/{total} beds</span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type DialogMode = 'addBlock' | 'editBlock' | 'addRoom' | 'editRoom' | null;

interface MovePending {
  roomId: string; bedNumber: number;
  guestId: string; guestName: string; familyMemberId?: string;
}

export default function LocationRoomsPage() {
  const { user } = useAuth();
  const { guests } = useGuests();
  const { addEntry: addEntry2 } = useAuditTrail2();
  const {
    rooms, blocks, bedAssignments,
    addBlock, updateBlock, deleteBlock,
    addRoom, updateRoom, deleteRoom,
    assignGuestToRoom, removeGuestFromRoom,
    getRoomsByLocation, getOccupancy, getLocationOccupancy,
  } = useRooms();

  const loc = user?.location ?? '';

  // Expand/collapse blocks and rooms
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set(['blk-1', 'blk-2', 'none']));
  const [expandedRooms, setExpandedRooms]   = useState<Set<string>>(new Set());

  // Dialogs
  const [dialogMode, setDialogMode]     = useState<DialogMode>(null);
  const [formName, setFormName]         = useState('');
  const [formCapacity, setFormCapacity] = useState(2);
  const [formBlockId, setFormBlockId]   = useState('');
  const [formError, setFormError]       = useState('');
  const [editTarget, setEditTarget]     = useState<Block | Room | null>(null);

  // Delete confirmation
  const [deleteType, setDeleteType]     = useState<'block' | 'room' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Block | Room | null>(null);

  // Move guest
  const [movePending, setMovePending]   = useState<MovePending | null>(null);
  const [moveToRoomId, setMoveToRoomId] = useState('');

  const roomGroups = useMemo(() => getRoomsByLocation(loc), [getRoomsByLocation, loc]);
  const locOcc     = useMemo(() => getLocationOccupancy(loc), [getLocationOccupancy, loc]);
  const locBlocks  = useMemo(() => blocks.filter(b => b.locationId === loc), [blocks, loc]);
  const locRooms   = useMemo(() => rooms.filter(r => r.locationId === loc && r.isActive), [rooms, loc]);

  // Available rooms for "move to" (rooms with space, excluding source)
  const moveableRooms = useMemo(() => {
    if (!movePending) return [];
    return locRooms.filter(r => {
      if (r.id === movePending.roomId) return false;
      const occ = getOccupancy(r.id);
      return occ.available > 0;
    });
  }, [movePending, locRooms, getOccupancy]);

  const toggleBlock = (id: string) =>
    setExpandedBlocks(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleRoom = (id: string) =>
    setExpandedRooms(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // ── Block dialog ─────────────────────────────────────────────────────────────

  const openAddBlock = () => {
    setDialogMode('addBlock'); setEditTarget(null);
    setFormName(''); setFormError('');
  };
  const openEditBlock = (b: Block) => {
    setDialogMode('editBlock'); setEditTarget(b);
    setFormName(b.name); setFormError('');
  };
  const openAddRoom = () => {
    setDialogMode('addRoom'); setEditTarget(null);
    setFormName(''); setFormCapacity(2); setFormBlockId(''); setFormError('');
  };
  const openEditRoom = (r: Room) => {
    setDialogMode('editRoom'); setEditTarget(r);
    setFormName(r.name); setFormCapacity(r.capacity); setFormBlockId(r.blockId ?? ''); setFormError('');
  };

  const handleDialogSave = () => {
    const name = formName.trim().replace(/<[^>]*>/g, '');
    if (name.length < 1) { setFormError('Name is required'); return; }
    if (name.length > 60) { setFormError('Name must be 60 characters or fewer'); return; }

    if (dialogMode === 'addBlock') {
      addBlock(loc, name);
      toast.success('Block added');
    } else if (dialogMode === 'editBlock' && editTarget) {
      updateBlock(editTarget.id, name);
      toast.success('Block updated');
    } else if (dialogMode === 'addRoom') {
      if (formCapacity < 1 || formCapacity > 20) { setFormError('Capacity must be 1–20'); return; }
      addRoom(loc, name, formCapacity, formBlockId || undefined);
      toast.success('Room added');
    } else if (dialogMode === 'editRoom' && editTarget) {
      const r = editTarget as Room;
      const minCap = (bedAssignments[r.id] ?? []).filter(b => !!b.guestName).length;
      if (formCapacity < Math.max(1, minCap)) {
        setFormError(`Capacity cannot be less than current occupancy (${minCap})`); return;
      }
      if (formCapacity > 20) { setFormError('Capacity must be 20 or fewer'); return; }
      updateRoom(r.id, name, formCapacity);
      toast.success('Room updated');
    }
    setDialogMode(null);
  };

  // ── Delete ────────────────────────────────────────────────────────────────────

  const handleDeleteBlock = (b: Block) => {
    const hasRooms = rooms.some(r => r.blockId === b.id);
    if (hasRooms) { toast.error(`Cannot delete — remove all rooms in ${b.name} first`); return; }
    setDeleteType('block'); setDeleteTarget(b);
  };
  const handleDeleteRoom = (r: Room) => {
    const occupied = (bedAssignments[r.id] ?? []).filter(b => !!b.guestName).length;
    if (occupied > 0) { toast.error(`Cannot delete — ${occupied} guest${occupied !== 1 ? 's' : ''} in this room`); return; }
    setDeleteType('room'); setDeleteTarget(r);
  };
  const confirmDelete = () => {
    if (!deleteTarget || !deleteType) return;
    if (deleteType === 'block') deleteBlock(deleteTarget.id);
    else deleteRoom(deleteTarget.id);
    setDeleteTarget(null); setDeleteType(null);
  };

  // ── Move guest ────────────────────────────────────────────────────────────────

  const handleConfirmMove = () => {
    if (!movePending || !moveToRoomId || !user) return;
    const { roomId, bedNumber, guestId, guestName, familyMemberId } = movePending;
    const sourceRoom = rooms.find(r => r.id === roomId);
    const targetRoom = rooms.find(r => r.id === moveToRoomId);
    const nextBed = (bedAssignments[moveToRoomId] ?? []).find(b => !b.guestName)?.bedNumber;
    if (!nextBed || !targetRoom) { toast.error('No available beds in target room'); return; }
    const guest = guests.find(g => g.id === guestId);
    removeGuestFromRoom(roomId, bedNumber);
    assignGuestToRoom(moveToRoomId, nextBed, guestId, guestName, familyMemberId);
    if (guest) {
      addEntry2({
        guestId, guestName, guestReference: guest.referenceNumber,
        locationId: loc, locationName: loc,
        departmentId: guest.assignedDepartment ?? '', departmentName: guest.assignedDepartment ?? '',
        type: 'room_change',
        action: `Guest moved from ${sourceRoom?.name ?? roomId} to ${targetRoom.name}`,
        oldValue: sourceRoom?.name ?? roomId,
        newValue: targetRoom.name,
        createdBy: { id: user.id, name: user.name, role: 'location-manager' },
        createdAt: new Date().toISOString(),
      });
    }
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
                <BedDouble className="w-5 h-5 text-[#2D5A45]" />
                <div>
                  <h1 className="text-xl font-semibold text-[#1A1A1A]">Rooms &amp; Blocks — {loc}</h1>
                  <p className="text-xs text-[#4A4A4A] mt-0.5">
                    {locOcc.totalRooms} rooms · {locOcc.totalBeds} beds · {locOcc.occupiedBeds} occupied · {locOcc.availableBeds} available
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button onClick={openAddRoom} className="bg-[#2D5A45] hover:bg-[#234839] text-white h-9 px-4 text-sm flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Add Room
                </Button>
                <LocationUserMenu />
              </div>
            </div>
          </header>

          <div className="p-6 space-y-4">
            {roomGroups.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#E8E3DB] p-12 text-center">
                <BedDouble className="w-12 h-12 mx-auto mb-4 text-[#D4CFC7]" />
                <h2 className="text-base font-semibold text-[#1A1A1A] mb-1">No rooms yet</h2>
                <p className="text-sm text-[#4A4A4A] mb-4">Add your first room to start assigning guests.</p>
                <Button onClick={openAddRoom} className="bg-[#2D5A45] hover:bg-[#234839] text-white h-9 px-4 text-sm">
                  <Plus className="w-4 h-4 mr-2" /> Add Room
                </Button>
              </div>
            ) : (
              <>
                {roomGroups.map(group => {
                  const groupKey = group.block?.id ?? 'none';
                  const isExpanded = expandedBlocks.has(groupKey);
                  const groupLabel = group.block ? group.block.name : 'Unassigned Rooms';
                  const roomCount = group.rooms.length;

                  return (
                    <div key={groupKey} className="bg-white rounded-xl border border-[#E8E3DB] overflow-hidden">
                      {/* Block header */}
                      <div className="flex items-center justify-between px-4 py-3 border-b border-[#E8E3DB] bg-[#F9F8F6]">
                        <button
                          onClick={() => toggleBlock(groupKey)}
                          className="flex items-center gap-2 text-left flex-1"
                        >
                          {isExpanded ? <ChevronDown className="w-4 h-4 text-[#4A4A4A]" /> : <ChevronRight className="w-4 h-4 text-[#4A4A4A]" />}
                          <span className="font-semibold text-sm text-[#1A1A1A]">{groupLabel}</span>
                          <span className="text-xs text-[#4A4A4A]">({roomCount} room{roomCount !== 1 ? 's' : ''})</span>
                        </button>
                        {group.block && (
                          <div className="flex items-center gap-1">
                            <button onClick={() => openEditBlock(group.block!)} className="p-1.5 rounded-lg text-[#4A4A4A] hover:bg-blue-50 hover:text-blue-600 transition-colors" title="Edit block">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDeleteBlock(group.block!)} className="p-1.5 rounded-lg text-[#4A4A4A] hover:bg-red-50 hover:text-red-600 transition-colors" title="Delete block">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Rooms in block */}
                      {isExpanded && (
                        <div className="divide-y divide-[#E8E3DB]">
                          {group.rooms.length === 0 ? (
                            <p className="px-6 py-4 text-sm text-[#4A4A4A]">No rooms in this block.</p>
                          ) : (
                            group.rooms.map(room => {
                              const occ = getOccupancy(room.id);
                              const isRoomExpanded = expandedRooms.has(room.id);
                              const beds = bedAssignments[room.id] ?? [];
                              return (
                                <div key={room.id}>
                                  {/* Room row */}
                                  <div
                                    className="flex items-center gap-4 px-6 py-3 hover:bg-[#F9F8F6] cursor-pointer"
                                    onClick={() => toggleRoom(room.id)}
                                  >
                                    {isRoomExpanded ? <ChevronDown className="w-3.5 h-3.5 text-[#4A4A4A] shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-[#4A4A4A] shrink-0" />}
                                    <span className="font-medium text-sm text-[#1A1A1A] w-16 shrink-0">{room.name}</span>
                                    <span className="text-xs text-[#4A4A4A] shrink-0">Capacity: {room.capacity}</span>
                                    <OccupancyBar occupied={occ.occupied} total={occ.total} />
                                    <div className="flex items-center gap-1 ml-auto" onClick={e => e.stopPropagation()}>
                                      <button onClick={() => openEditRoom(room)} className="p-1.5 rounded-lg text-[#4A4A4A] hover:bg-blue-50 hover:text-blue-600 transition-colors" title="Edit room">
                                        <Pencil className="w-3.5 h-3.5" />
                                      </button>
                                      <button onClick={() => handleDeleteRoom(room)} className="p-1.5 rounded-lg text-[#4A4A4A] hover:bg-red-50 hover:text-red-600 transition-colors" title="Delete room">
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>

                                  {/* Bed list */}
                                  {isRoomExpanded && (
                                    <div className="ml-10 mr-6 mb-3 rounded-lg border border-[#E8E3DB] divide-y divide-[#E8E3DB] overflow-hidden">
                                      {beds.map(bed => (
                                        <div key={bed.bedNumber} className="flex items-center gap-3 px-4 py-2 bg-white text-sm">
                                          <span className="text-[#4A4A4A] w-12 shrink-0">Bed {bed.bedNumber}</span>
                                          {bed.guestName ? (
                                            <>
                                              <div className="w-6 h-6 bg-[#2D5A45] rounded-full flex items-center justify-center text-white text-[10px] font-medium shrink-0">
                                                {bed.guestName.charAt(0)}
                                              </div>
                                              <span className="font-medium text-[#1A1A1A] flex-1">{bed.guestName}</span>
                                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">✓ Assigned</span>
                                              <button
                                                onClick={() => setMovePending({ roomId: room.id, bedNumber: bed.bedNumber, guestId: bed.guestId!, guestName: bed.guestName, familyMemberId: bed.familyMemberId })}
                                                className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 transition-colors shrink-0"
                                                title="Move guest to another room"
                                              >
                                                <MoveRight className="w-3.5 h-3.5" /> Move
                                              </button>
                                              <button
                                                onClick={() => removeGuestFromRoom(room.id, bed.bedNumber)}
                                                className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
                                                title="Remove guest from bed"
                                              >
                                                <UserX className="w-3.5 h-3.5" />
                                              </button>
                                            </>
                                          ) : (
                                            <span className="text-[#4A4A4A] italic">empty</span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Add Block button */}
                <button
                  onClick={openAddBlock}
                  className="flex items-center gap-2 text-sm text-[#2D5A45] font-medium hover:underline"
                >
                  <Plus className="w-4 h-4" /> Add Block
                </button>
              </>
            )}
          </div>
        </main>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogMode !== null} onOpenChange={o => { if (!o) setDialogMode(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#1A1A1A]">
              {dialogMode === 'addBlock' ? 'Add Block'
                : dialogMode === 'editBlock' ? 'Edit Block'
                  : dialogMode === 'addRoom' ? 'Add Room'
                    : 'Edit Room'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div>
              <Label className="text-xs text-[#4A4A4A] mb-1 block">
                {dialogMode?.includes('Block') ? 'Block Name' : 'Room Name'} <span className="text-red-500">*</span>
              </Label>
              <Input
                value={formName}
                onChange={e => { setFormName(e.target.value); setFormError(''); }}
                placeholder={dialogMode?.includes('Block') ? 'e.g. Block C' : 'e.g. A-104'}
                className="border-[#D4CFC7] focus:border-[#2D5A45] h-9 text-sm"
                maxLength={60}
              />
            </div>
            {(dialogMode === 'addRoom' || dialogMode === 'editRoom') && (
              <>
                <div>
                  <Label className="text-xs text-[#4A4A4A] mb-1 block">Capacity (beds) <span className="text-red-500">*</span></Label>
                  <Input
                    type="number" min={1} max={20}
                    value={formCapacity}
                    onChange={e => { setFormCapacity(Number(e.target.value)); setFormError(''); }}
                    className="border-[#D4CFC7] focus:border-[#2D5A45] h-9 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs text-[#4A4A4A] mb-1 block">Block (optional)</Label>
                  <select
                    value={formBlockId}
                    onChange={e => setFormBlockId(e.target.value)}
                    className="w-full border border-[#D4CFC7] rounded-md px-3 py-2 text-sm text-[#1A1A1A] bg-white focus:outline-none focus:border-[#2D5A45] h-9"
                  >
                    <option value="">No Block</option>
                    {locBlocks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              </>
            )}
            {formError && <p className="text-xs text-red-600">{formError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMode(null)} className="border-[#D4CFC7] text-[#4A4A4A] h-9 text-sm">Cancel</Button>
            <Button onClick={handleDialogSave} className="bg-[#2D5A45] hover:bg-[#234839] text-white h-9 text-sm">
              {dialogMode?.startsWith('edit') ? 'Save Changes' : dialogMode?.includes('Block') ? 'Add Block' : 'Add Room'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={o => { if (!o) { setDeleteTarget(null); setDeleteType(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteType === 'block' ? 'Block' : 'Room'}</AlertDialogTitle>
            <AlertDialogDescription>
              Delete <strong>{deleteTarget?.name}</strong>? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700 text-white">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Move guest dialog */}
      <Dialog open={!!movePending} onOpenChange={o => { if (!o) { setMovePending(null); setMoveToRoomId(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[#1A1A1A]">Move Guest</DialogTitle>
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
