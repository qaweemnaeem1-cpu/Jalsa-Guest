import { useCallback, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  MapPin,
  Minus,
  Pencil,
  Plus,
  ToggleLeft,
  ToggleRight,
  Trash2,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { useRooms } from '@/hooks/useRooms';
import { DeptSidebar } from '@/components/DeptSidebar';
import { DeptUserMenu } from '@/components/DeptUserMenu';
import { useDepartments } from '@/hooks/useDepartments';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import type { Block, BedAssignment, Room } from '@/types';

// ── DeptLocation interface (unchanged) ────────────────────────────────────────

interface DeptLocation {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
}

let nextLocationId = 100;

function seedLocations(dept: string, deptMap: Record<string, string[]>): DeptLocation[] {
  return (deptMap[dept] ?? []).map((name, i) => ({
    id: `loc-seed-${i}`,
    name,
    description: '',
    isActive: true,
  }));
}

// ── Inline helpers ─────────────────────────────────────────────────────────────

function minCapacity(roomId: string, bedAssignments: Record<string, BedAssignment[]>): number {
  return (bedAssignments[roomId] ?? []).filter(b => !!b.guestName).length || 1;
}

// ── OccupancyBar inline component ─────────────────────────────────────────────

interface OccupancyBarProps {
  occupied: number;
  total: number;
}

function OccupancyBar({ occupied, total }: OccupancyBarProps) {
  const pct = total > 0 ? Math.round((occupied / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-[#2D5A45] rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-500">{occupied}/{total} beds</span>
    </div>
  );
}

// ── Main page component ────────────────────────────────────────────────────────

export default function DeptLocationsPage() {
  const { user } = useAuth();
  const { guests } = useGuests();
  const { departments } = useDepartments();
  const {
    blocks,
    bedAssignments,
    addBlock,
    updateBlock,
    deleteBlock,
    addRoom,
    updateRoom,
    deleteRoom,
    getRoomsByLocation,
    getOccupancy,
    getLocationOccupancy,
  } = useRooms();

  const dept = user?.department ?? '';

  // ── Location state ──────────────────────────────────────────────────────────

  const [locations, setLocations] = useState<DeptLocation[]>(() => seedLocations(dept, departments));

  // Location dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<DeptLocation | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formError, setFormError] = useState('');

  // Location delete state
  const [deleteTarget, setDeleteTarget] = useState<DeptLocation | null>(null);

  // Selected location for room view
  const [selectedLocation, setSelectedLocation] = useState<DeptLocation | null>(null);

  // ── Room view state ─────────────────────────────────────────────────────────

  // Collapsed blocks: set of block ids (or 'null' for unassigned group)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  // Expanded rooms: set of room ids showing bed list
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set());

  // Block dialog state
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [blockEditTarget, setBlockEditTarget] = useState<Block | null>(null);
  const [blockFormName, setBlockFormName] = useState('');
  const [blockFormError, setBlockFormError] = useState('');

  // Block delete state
  const [blockDeleteTarget, setBlockDeleteTarget] = useState<Block | null>(null);

  // Room dialog state
  const [roomDialogOpen, setRoomDialogOpen] = useState(false);
  const [roomEditTarget, setRoomEditTarget] = useState<Room | null>(null);
  const [roomFormName, setRoomFormName] = useState('');
  const [roomFormCapacity, setRoomFormCapacity] = useState('1');
  const [roomFormBlockId, setRoomFormBlockId] = useState('');
  const [roomFormError, setRoomFormError] = useState('');

  // Room delete state
  const [roomDeleteTarget, setRoomDeleteTarget] = useState<Room | null>(null);

  // ── Derived data ────────────────────────────────────────────────────────────

  const guestCountByLocation = useMemo(() => {
    const map: Record<string, number> = {};
    guests.forEach(g => {
      if (g.assignedDepartment === dept && g.placedLocation) {
        map[g.placedLocation] = (map[g.placedLocation] ?? 0) + 1;
      }
    });
    return map;
  }, [guests, dept]);

  // ── Location CRUD ───────────────────────────────────────────────────────────

  const openAdd = useCallback(() => {
    setEditTarget(null);
    setFormName('');
    setFormDesc('');
    setFormError('');
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((loc: DeptLocation) => {
    setEditTarget(loc);
    setFormName(loc.name);
    setFormDesc(loc.description);
    setFormError('');
    setDialogOpen(true);
  }, []);

  const handleSave = useCallback(() => {
    const trimmedName = formName.trim().replace(/<[^>]*>/g, '');
    const trimmedDesc = formDesc.trim().replace(/<[^>]*>/g, '');

    if (trimmedName.length < 2) {
      setFormError('Name must be at least 2 characters');
      return;
    }
    if (trimmedName.length > 100) {
      setFormError('Name must be 100 characters or fewer');
      return;
    }

    const duplicate = locations.find(
      l => l.name.toLowerCase() === trimmedName.toLowerCase() && l.id !== editTarget?.id,
    );
    if (duplicate) {
      setFormError('A location with this name already exists');
      return;
    }

    if (editTarget) {
      setLocations(prev =>
        prev.map(l => l.id === editTarget.id ? { ...l, name: trimmedName, description: trimmedDesc } : l),
      );
      toast.success('Location updated');
    } else {
      setLocations(prev => [
        ...prev,
        { id: `loc-${nextLocationId++}`, name: trimmedName, description: trimmedDesc, isActive: true },
      ]);
      toast.success('Location added successfully');
    }
    setDialogOpen(false);
  }, [formName, formDesc, editTarget, locations]);

  const handleToggleActive = useCallback((id: string) => {
    setLocations(prev => prev.map(l => l.id === id ? { ...l, isActive: !l.isActive } : l));
  }, []);

  const handleDeleteClick = useCallback((loc: DeptLocation) => {
    const count = guestCountByLocation[loc.name] ?? 0;
    if (count > 0) {
      toast.error(`Cannot delete — ${count} guest${count !== 1 ? 's' : ''} are placed here. Reassign them first.`);
      return;
    }
    setDeleteTarget(loc);
  }, [guestCountByLocation]);

  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    setLocations(prev => prev.filter(l => l.id !== deleteTarget.id));
    toast.success('Location deleted');
    setDeleteTarget(null);
  }, [deleteTarget]);

  // ── Block CRUD ──────────────────────────────────────────────────────────────

  const openAddBlock = useCallback(() => {
    setBlockEditTarget(null);
    setBlockFormName('');
    setBlockFormError('');
    setBlockDialogOpen(true);
  }, []);

  const openEditBlock = useCallback((block: Block) => {
    setBlockEditTarget(block);
    setBlockFormName(block.name);
    setBlockFormError('');
    setBlockDialogOpen(true);
  }, []);

  const handleBlockSave = useCallback(() => {
    const trimmed = blockFormName.trim();
    if (!trimmed) {
      setBlockFormError('Block name is required');
      return;
    }
    if (blockEditTarget) {
      updateBlock(blockEditTarget.id, trimmed);
      toast.success('Block updated');
    } else if (selectedLocation) {
      addBlock(selectedLocation.name, trimmed);
      toast.success('Block added');
    }
    setBlockDialogOpen(false);
  }, [blockFormName, blockEditTarget, selectedLocation, addBlock, updateBlock]);

  const handleBlockDelete = useCallback(() => {
    if (!blockDeleteTarget) return;
    deleteBlock(blockDeleteTarget.id);
    setBlockDeleteTarget(null);
  }, [blockDeleteTarget, deleteBlock]);

  // ── Room CRUD ───────────────────────────────────────────────────────────────

  const openAddRoom = useCallback(() => {
    setRoomEditTarget(null);
    setRoomFormName('');
    setRoomFormCapacity('1');
    setRoomFormBlockId('');
    setRoomFormError('');
    setRoomDialogOpen(true);
  }, []);

  const openEditRoom = useCallback((room: Room) => {
    setRoomEditTarget(room);
    setRoomFormName(room.name);
    setRoomFormCapacity(String(room.capacity));
    setRoomFormBlockId(room.blockId ?? '');
    setRoomFormError('');
    setRoomDialogOpen(true);
  }, []);

  const handleRoomSave = useCallback(() => {
    const trimmedName = roomFormName.trim();
    if (!trimmedName) {
      setRoomFormError('Room name is required');
      return;
    }
    const cap = parseInt(roomFormCapacity, 10);
    if (isNaN(cap) || cap < 1 || cap > 20) {
      setRoomFormError('Capacity must be between 1 and 20');
      return;
    }
    if (roomEditTarget) {
      const minCap = minCapacity(roomEditTarget.id, bedAssignments);
      if (cap < minCap) {
        setRoomFormError(`Capacity cannot be less than ${minCap} (current occupancy)`);
        return;
      }
      updateRoom(roomEditTarget.id, trimmedName, cap);
      toast.success('Room updated');
    } else if (selectedLocation) {
      addRoom(selectedLocation.name, trimmedName, cap, roomFormBlockId || undefined);
      toast.success('Room added');
    }
    setRoomDialogOpen(false);
  }, [roomFormName, roomFormCapacity, roomFormBlockId, roomEditTarget, selectedLocation, bedAssignments, addRoom, updateRoom]);

  const handleRoomDelete = useCallback(() => {
    if (!roomDeleteTarget) return;
    deleteRoom(roomDeleteTarget.id);
    setRoomDeleteTarget(null);
  }, [roomDeleteTarget, deleteRoom]);

  // ── Group / room toggle helpers ─────────────────────────────────────────────

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleRoom = useCallback((roomId: string) => {
    setExpandedRooms(prev => {
      const next = new Set(prev);
      if (next.has(roomId)) next.delete(roomId);
      else next.add(roomId);
      return next;
    });
  }, []);

  // ── Blocks for selected location (for room dialog select) ───────────────────

  const locationBlocks = useMemo(() => {
    if (!selectedLocation) return [];
    return blocks.filter(b => b.locationId === selectedLocation.name && b.isActive);
  }, [blocks, selectedLocation]);

  if (!user) return null;

  // ── VIEW 2 — Room management ────────────────────────────────────────────────

  if (selectedLocation !== null) {
    const { totalRooms, totalBeds, occupiedBeds, availableBeds } = getLocationOccupancy(selectedLocation.name);
    const groups = getRoomsByLocation(selectedLocation.name);

    return (
      <div className="min-h-screen bg-[#F5F0E8]">
        <div className="flex">
          <DeptSidebar />
          <main className="flex-1 ml-64">
            {/* Header */}
            <header className="bg-white border-b border-[#E8E3DB] px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelectedLocation(null)}
                    className="p-1.5 rounded-lg text-[#4A4A4A] hover:bg-[#F5F0E8] transition-colors"
                    title="Back to Locations"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div>
                    <h1 className="text-xl font-semibold text-[#1A1A1A]">
                      {selectedLocation.name} — Rooms &amp; Blocks
                    </h1>
                    <p className="text-xs text-[#4A4A4A] mt-0.5">
                      {totalRooms} rooms &middot; {totalBeds} beds &middot; {occupiedBeds} occupied &middot; {availableBeds} available
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    onClick={openAddRoom}
                    className="bg-[#2D5A45] hover:bg-[#234839] text-white h-9 px-4 text-sm flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Add Room
                  </Button>
                  <DeptUserMenu />
                </div>
              </div>
            </header>

            {/* Body */}
            <div className="p-6 space-y-4">
              {groups.length === 0 && (
                <div className="bg-white rounded-xl border border-[#E8E3DB] p-12 text-center">
                  <MapPin className="w-12 h-12 mx-auto mb-4 text-[#D4CFC7]" />
                  <h2 className="text-base font-medium text-[#1A1A1A] mb-1">No rooms yet</h2>
                  <p className="text-sm text-[#4A4A4A] mb-4">Add your first room to start managing beds.</p>
                  <Button
                    onClick={openAddRoom}
                    className="bg-[#2D5A45] hover:bg-[#234839] text-white h-9 px-4 text-sm"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Room
                  </Button>
                </div>
              )}

              {groups.map(group => {
                const groupKey = group.block ? group.block.id : 'unassigned';
                const isCollapsed = collapsedGroups.has(groupKey);

                return (
                  <div
                    key={groupKey}
                    className="bg-white rounded-xl border border-[#E8E3DB] overflow-hidden"
                  >
                    {/* Group header */}
                    <div className="bg-[#F9F8F6] px-4 py-2.5 border-b border-[#E8E3DB] flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleGroup(groupKey)}
                          className="p-0.5 text-[#4A4A4A] hover:text-[#1A1A1A] transition-colors"
                        >
                          {isCollapsed
                            ? <ChevronRight className="w-4 h-4" />
                            : <ChevronDown className="w-4 h-4" />}
                        </button>
                        {group.block ? (
                          <span className="font-semibold text-sm text-[#1A1A1A]">{group.block.name}</span>
                        ) : (
                          <span className="text-sm italic text-gray-500">Unassigned Rooms</span>
                        )}
                        <span className="ml-1 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                          ({group.rooms.length} rooms)
                        </span>
                      </div>
                      {group.block && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEditBlock(group.block!)}
                            className="p-1.5 rounded-lg text-[#4A4A4A] hover:bg-blue-50 hover:text-blue-600 transition-colors"
                            title="Edit block"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setBlockDeleteTarget(group.block!)}
                            className="p-1.5 rounded-lg text-[#4A4A4A] hover:bg-red-50 hover:text-red-600 transition-colors"
                            title="Delete block"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Room rows */}
                    {!isCollapsed && (
                      <div>
                        {group.rooms.length === 0 && (
                          <div className="px-4 py-3 text-sm text-gray-400 italic">No rooms in this block.</div>
                        )}
                        {group.rooms.map((room, roomIdx) => {
                          const occ = getOccupancy(room.id);
                          const isRoomExpanded = expandedRooms.has(room.id);
                          const beds = (bedAssignments[room.id] ?? []).slice().sort((a, b) => a.bedNumber - b.bedNumber);
                          const isLast = roomIdx === group.rooms.length - 1;

                          return (
                            <div key={room.id}>
                              {/* Room row */}
                              <div
                                className={`px-4 py-3 flex items-center gap-4 hover:bg-[#F9F8F6] cursor-pointer transition-colors ${isLast && !isRoomExpanded ? '' : 'border-b border-[#E8E3DB]'}`}
                                onClick={() => toggleRoom(room.id)}
                              >
                                {/* Left: name + capacity badge */}
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <span className="font-medium text-sm text-[#1A1A1A] truncate">{room.name}</span>
                                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded shrink-0">
                                    Cap. {room.capacity}
                                  </span>
                                </div>

                                {/* Middle: occupancy bar */}
                                <div className="shrink-0">
                                  <OccupancyBar occupied={occ.occupied} total={occ.total} />
                                </div>

                                {/* Right: actions */}
                                <div
                                  className="flex items-center gap-1 shrink-0"
                                  onClick={e => e.stopPropagation()}
                                >
                                  <button
                                    onClick={() => openEditRoom(room)}
                                    className="p-1.5 rounded-lg text-[#4A4A4A] hover:bg-blue-50 hover:text-blue-600 transition-colors"
                                    title="Edit room"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setRoomDeleteTarget(room)}
                                    className="p-1.5 rounded-lg text-[#4A4A4A] hover:bg-red-50 hover:text-red-600 transition-colors"
                                    title="Delete room"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              {/* Bed list (expanded) */}
                              {isRoomExpanded && (
                                <div className={`bg-[#F9F8F6] px-6 py-3 ${!isLast ? 'border-b border-[#E8E3DB]' : ''}`}>
                                  {beds.length === 0 ? (
                                    <p className="text-xs text-gray-400 italic">No beds configured.</p>
                                  ) : (
                                    <div className="space-y-1.5">
                                      {beds.map(bed => {
                                        const isOccupied = !!bed.guestName;
                                        return (
                                          <div key={bed.bedNumber} className="flex items-center gap-2">
                                            <span className="text-xs text-gray-500 w-12 shrink-0">
                                              Bed {bed.bedNumber}:
                                            </span>
                                            {isOccupied ? (
                                              <>
                                                <User className="w-3 h-3 text-[#2D5A45] shrink-0" />
                                                <span className="text-xs text-[#1A1A1A]">{bed.guestName}</span>
                                                <span className="text-xs text-green-600 ml-auto">✅</span>
                                              </>
                                            ) : (
                                              <>
                                                <Minus className="w-3 h-3 text-gray-300 shrink-0" />
                                                <span className="text-xs text-gray-400">[empty]</span>
                                              </>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Add Block link */}
              <button
                onClick={openAddBlock}
                className="text-sm text-[#2D5A45] font-medium flex items-center gap-1 hover:underline mt-2 px-1"
              >
                <Plus className="w-4 h-4" />
                Add Block
              </button>
            </div>
          </main>
        </div>

        {/* ── Block Add/Edit Dialog ─────────────────────────────────────────── */}
        <Dialog open={blockDialogOpen} onOpenChange={o => { if (!o) setBlockDialogOpen(false); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-[#1A1A1A]">
                {blockEditTarget ? 'Edit Block' : 'Add New Block'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-1">
              <div>
                <Label className="text-xs text-[#4A4A4A] mb-1 block">
                  Block Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={blockFormName}
                  onChange={e => { setBlockFormName(e.target.value); setBlockFormError(''); }}
                  placeholder="e.g. Block A"
                  className="border-[#D4CFC7] focus:border-[#2D5A45] h-9 text-sm"
                />
              </div>
              {blockFormError && <p className="text-xs text-red-600">{blockFormError}</p>}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setBlockDialogOpen(false)}
                className="border-[#D4CFC7] text-[#4A4A4A] h-9 text-sm"
              >
                Cancel
              </Button>
              <Button
                onClick={handleBlockSave}
                className="bg-[#2D5A45] hover:bg-[#234839] text-white h-9 text-sm"
              >
                {blockEditTarget ? 'Save Changes' : 'Add Block'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Block Delete Dialog ───────────────────────────────────────────── */}
        <AlertDialog open={!!blockDeleteTarget} onOpenChange={o => { if (!o) setBlockDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Block</AlertDialogTitle>
              <AlertDialogDescription>
                Delete <strong>{blockDeleteTarget?.name}</strong>? This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleBlockDelete}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* ── Room Add/Edit Dialog ──────────────────────────────────────────── */}
        <Dialog open={roomDialogOpen} onOpenChange={o => { if (!o) setRoomDialogOpen(false); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-[#1A1A1A]">
                {roomEditTarget ? 'Edit Room' : 'Add New Room'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-1">
              <div>
                <Label className="text-xs text-[#4A4A4A] mb-1 block">
                  Room Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={roomFormName}
                  onChange={e => { setRoomFormName(e.target.value); setRoomFormError(''); }}
                  placeholder="e.g. A-101"
                  className="border-[#D4CFC7] focus:border-[#2D5A45] h-9 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs text-[#4A4A4A] mb-1 block">
                  Capacity <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="number"
                  min={roomEditTarget ? minCapacity(roomEditTarget.id, bedAssignments) : 1}
                  max={20}
                  value={roomFormCapacity}
                  onChange={e => { setRoomFormCapacity(e.target.value); setRoomFormError(''); }}
                  className="border-[#D4CFC7] focus:border-[#2D5A45] h-9 text-sm"
                />
              </div>
              {!roomEditTarget && (
                <div>
                  <Label className="text-xs text-[#4A4A4A] mb-1 block">Block</Label>
                  <select
                    value={roomFormBlockId}
                    onChange={e => setRoomFormBlockId(e.target.value)}
                    className="border border-[#D4CFC7] rounded-lg px-3 py-2 h-9 text-sm w-full bg-white focus:outline-none focus:border-[#2D5A45]"
                  >
                    <option value="">No Block</option>
                    {locationBlocks.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {roomEditTarget && (
                <p className="text-xs text-gray-400 italic">Block cannot be changed after creation.</p>
              )}
              {roomFormError && <p className="text-xs text-red-600">{roomFormError}</p>}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setRoomDialogOpen(false)}
                className="border-[#D4CFC7] text-[#4A4A4A] h-9 text-sm"
              >
                Cancel
              </Button>
              <Button
                onClick={handleRoomSave}
                className="bg-[#2D5A45] hover:bg-[#234839] text-white h-9 text-sm"
              >
                {roomEditTarget ? 'Save Changes' : 'Add Room'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Room Delete Dialog ────────────────────────────────────────────── */}
        <AlertDialog open={!!roomDeleteTarget} onOpenChange={o => { if (!o) setRoomDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Room</AlertDialogTitle>
              <AlertDialogDescription>
                Delete <strong>{roomDeleteTarget?.name}</strong>? This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRoomDelete}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // ── VIEW 1 — Locations list ─────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <div className="flex">
        <DeptSidebar />
        <main className="flex-1 ml-64">
          <header className="bg-white border-b border-[#E8E3DB] px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <MapPin className="w-5 h-5 text-[#2D5A45]" />
                <div>
                  <h1 className="text-xl font-semibold text-[#1A1A1A]">Locations</h1>
                  <p className="text-xs text-[#4A4A4A] mt-0.5">Manage accommodation locations for {dept}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  onClick={openAdd}
                  className="bg-[#2D5A45] hover:bg-[#234839] text-white h-9 px-4 text-sm flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Location
                </Button>
                <DeptUserMenu />
              </div>
            </div>
          </header>

          <div className="p-6">
            {locations.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#E8E3DB] p-12 text-center">
                <MapPin className="w-12 h-12 mx-auto mb-4 text-[#D4CFC7]" />
                <h2 className="text-base font-medium text-[#1A1A1A] mb-1">No locations yet</h2>
                <p className="text-sm text-[#4A4A4A] mb-4">Add your first location to start placing guests.</p>
                <Button
                  onClick={openAdd}
                  className="bg-[#2D5A45] hover:bg-[#234839] text-white h-9 px-4 text-sm"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Location
                </Button>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-[#E8E3DB] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#E8E3DB] bg-[#F9F8F6]">
                      <th className="text-left px-4 py-3 text-xs font-medium text-[#4A4A4A] uppercase tracking-wider w-10">#</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-[#4A4A4A] uppercase tracking-wider">Name</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-[#4A4A4A] uppercase tracking-wider">Rooms</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-[#4A4A4A] uppercase tracking-wider">Beds</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-[#4A4A4A] uppercase tracking-wider">Status</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-[#4A4A4A] uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E3DB]">
                    {locations.map((loc, idx) => {
                      const { totalRooms, totalBeds, occupiedBeds } = getLocationOccupancy(loc.name);
                      return (
                        <tr key={loc.id} className="hover:bg-[#F9F8F6]">
                          <td className="px-4 py-3 text-[#4A4A4A]">{idx + 1}</td>
                          <td className="px-4 py-3 font-medium text-[#1A1A1A]">{loc.name}</td>
                          <td className="px-4 py-3 text-[#4A4A4A]">{totalRooms} rooms</td>
                          <td className="px-4 py-3">
                            <OccupancyBar occupied={occupiedBeds} total={totalBeds} />
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleToggleActive(loc.id)}
                              title="Toggle active status"
                            >
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                                loc.isActive
                                  ? 'bg-green-50 text-green-700 border-green-200'
                                  : 'bg-gray-50 text-gray-600 border-gray-200'
                              }`}>
                                {loc.isActive
                                  ? <ToggleRight className="w-3.5 h-3.5" />
                                  : <ToggleLeft className="w-3.5 h-3.5" />}
                                {loc.isActive ? 'Active' : 'Inactive'}
                              </span>
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => setSelectedLocation(loc)}
                                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[#2D5A45] text-white hover:bg-[#234839] transition-colors"
                                title="Manage rooms"
                              >
                                Manage →
                              </button>
                              <button
                                onClick={() => openEdit(loc)}
                                className="p-1.5 rounded-lg text-[#4A4A4A] hover:bg-blue-50 hover:text-blue-600 transition-colors"
                                title="Edit location"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteClick(loc)}
                                className="p-1.5 rounded-lg text-[#4A4A4A] hover:bg-red-50 hover:text-red-600 transition-colors"
                                title="Delete location"
                              >
                                <Trash2 className="w-4 h-4" />
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

      {/* ── Location Add/Edit Dialog ─────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={o => { if (!o) setDialogOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#1A1A1A]">
              {editTarget ? 'Edit Location' : 'Add New Location'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div>
              <Label className="text-xs text-[#4A4A4A] mb-1 block">Name <span className="text-red-500">*</span></Label>
              <Input
                value={formName}
                onChange={e => { setFormName(e.target.value); setFormError(''); }}
                placeholder="e.g. Jamia Block A"
                className="border-[#D4CFC7] focus:border-[#2D5A45] h-9 text-sm"
                maxLength={100}
              />
            </div>
            <div>
              <Label className="text-xs text-[#4A4A4A] mb-1 block">Description <span className="text-[#4A4A4A]">(optional)</span></Label>
              <Textarea
                value={formDesc}
                onChange={e => setFormDesc(e.target.value)}
                placeholder="Brief description of this location"
                className="border-[#D4CFC7] focus:border-[#2D5A45] text-sm resize-none"
                rows={3}
              />
            </div>
            {formError && <p className="text-xs text-red-600">{formError}</p>}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="border-[#D4CFC7] text-[#4A4A4A] h-9 text-sm"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              className="bg-[#2D5A45] hover:bg-[#234839] text-white h-9 text-sm"
            >
              {editTarget ? 'Save Changes' : 'Add Location'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Location Delete Confirmation ─────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Location</AlertDialogTitle>
            <AlertDialogDescription>
              Delete <strong>{deleteTarget?.name}</strong>? Guests placed here will need to be reassigned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
