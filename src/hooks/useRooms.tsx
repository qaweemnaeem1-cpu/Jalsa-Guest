import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { useAuditTrail } from '@/hooks/useAuditTrail';
import type { Block, BedAssignment, Room } from '@/types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RoomGroup {
  block: Block | null; // null = rooms not in a block
  rooms: Room[];
}

export interface OccupancyInfo {
  total: number;
  occupied: number;
  available: number;
}

export interface LocationOccupancy {
  totalRooms: number;
  totalBeds: number;
  occupiedBeds: number;
  availableBeds: number;
}

interface RoomsContextValue {
  blocks: Block[];
  rooms: Room[];
  bedAssignments: Record<string, BedAssignment[]>; // roomId → beds
  // Blocks
  addBlock: (locationId: string, name: string) => Block;
  updateBlock: (blockId: string, name: string) => void;
  deleteBlock: (blockId: string) => void;
  // Rooms
  addRoom: (locationId: string, name: string, capacity: number, blockId?: string) => Room;
  updateRoom: (roomId: string, name: string, capacity: number) => void;
  deleteRoom: (roomId: string) => void;
  // Beds
  assignGuestToRoom: (roomId: string, bedNumber: number, guestId: string, guestName: string, familyMemberId?: string) => void;
  removeGuestFromRoom: (roomId: string, bedNumber: number) => void;
  // Queries
  getRoomsByLocation: (locationId: string) => RoomGroup[];
  getOccupancy: (roomId: string) => OccupancyInfo;
  getLocationOccupancy: (locationId: string) => LocationOccupancy;
}

// ── Seed data ─────────────────────────────────────────────────────────────────

const SEED_BLOCKS: Block[] = [
  { id: 'blk-1', name: 'Block A', locationId: 'Jamia',  isActive: true },
  { id: 'blk-2', name: 'Block B', locationId: 'Jamia',  isActive: true },
];

const SEED_ROOMS: Room[] = [
  // Jamia — Block A
  { id: 'rm-A101', name: 'A-101', locationId: 'Jamia',  blockId: 'blk-1', capacity: 4, isActive: true },
  { id: 'rm-A102', name: 'A-102', locationId: 'Jamia',  blockId: 'blk-1', capacity: 2, isActive: true },
  { id: 'rm-A103', name: 'A-103', locationId: 'Jamia',  blockId: 'blk-1', capacity: 3, isActive: true },
  // Jamia — Block B
  { id: 'rm-B201', name: 'B-201', locationId: 'Jamia',  blockId: 'blk-2', capacity: 6, isActive: true },
  { id: 'rm-B202', name: 'B-202', locationId: 'Jamia',  blockId: 'blk-2', capacity: 4, isActive: true },
  // Jamia — no block
  { id: 'rm-VIP1', name: 'VIP-1', locationId: 'Jamia',  capacity: 2, isActive: true },
  // Hotels — no block
  { id: 'rm-H101', name: 'H-101', locationId: 'Hotels', capacity: 2, isActive: true },
  { id: 'rm-H102', name: 'H-102', locationId: 'Hotels', capacity: 2, isActive: true },
];

// Beds are fully initialised from seed capacity; occupied beds are pre-filled
function buildSeedBeds(): Record<string, BedAssignment[]> {
  const map: Record<string, BedAssignment[]> = {};
  for (const room of SEED_ROOMS) {
    map[room.id] = Array.from({ length: room.capacity }, (_, i) => ({
      bedNumber: i + 1,
    }));
  }
  // A-101, Bed 1 → Ahmed Khan (demo placeholder, no real guestId)
  map['rm-A101'][0] = { bedNumber: 1, guestId: '', guestName: 'Ahmed Khan', assignedAt: '2024-01-15T10:00:00' };
  // H-101, Bed 1 → Hans Schmidt (guest '2')
  map['rm-H101'][0] = { bedNumber: 1, guestId: '2', guestName: 'Hans Schmidt', assignedAt: '2024-01-15T13:00:00' };
  // H-101, Bed 2 → Helga Schmidt (guest '2', family member 'f1')
  map['rm-H101'][1] = { bedNumber: 2, guestId: '2', guestName: 'Helga Schmidt', familyMemberId: 'f1', assignedAt: '2024-01-15T13:00:00' };
  return map;
}

let nextBlockId = 100;
let nextRoomId  = 200;

// ── Context ───────────────────────────────────────────────────────────────────

const RoomsContext = createContext<RoomsContextValue | null>(null);

export function RoomsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { guests, updateGuest } = useGuests();
  const { addEntry } = useAuditTrail();

  const [blocks, setBlocks]         = useState<Block[]>(SEED_BLOCKS);
  const [rooms, setRooms]           = useState<Room[]>(SEED_ROOMS);
  const [bedAssignments, setBedAssignments] = useState<Record<string, BedAssignment[]>>(buildSeedBeds);

  // ── Block CRUD ──────────────────────────────────────────────────────────────

  const addBlock = useCallback((locationId: string, name: string): Block => {
    const block: Block = { id: `blk-${nextBlockId++}`, name: name.trim(), locationId, isActive: true };
    setBlocks(prev => [...prev, block]);
    return block;
  }, []);

  const updateBlock = useCallback((blockId: string, name: string) => {
    setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, name: name.trim() } : b));
  }, []);

  const deleteBlock = useCallback((blockId: string) => {
    const hasRooms = rooms.some(r => r.blockId === blockId);
    if (hasRooms) {
      toast.error('Cannot delete block — it still has rooms. Remove rooms first.');
      return;
    }
    setBlocks(prev => prev.filter(b => b.id !== blockId));
  }, [rooms]);

  // ── Room CRUD ───────────────────────────────────────────────────────────────

  const addRoom = useCallback((locationId: string, name: string, capacity: number, blockId?: string): Room => {
    const room: Room = { id: `rm-${nextRoomId++}`, name: name.trim(), locationId, blockId, capacity, isActive: true };
    setRooms(prev => [...prev, room]);
    setBedAssignments(prev => ({
      ...prev,
      [room.id]: Array.from({ length: capacity }, (_, i) => ({ bedNumber: i + 1 })),
    }));
    return room;
  }, []);

  const updateRoom = useCallback((roomId: string, name: string, capacity: number) => {
    setRooms(prev => prev.map(r => {
      if (r.id !== roomId) return r;
      return { ...r, name: name.trim(), capacity };
    }));
    // Adjust bed array length while preserving existing assignments
    setBedAssignments(prev => {
      const existing = prev[roomId] ?? [];
      const newBeds: BedAssignment[] = Array.from({ length: capacity }, (_, i) => {
        return existing[i] ?? { bedNumber: i + 1 };
      });
      return { ...prev, [roomId]: newBeds };
    });
  }, []);

  const deleteRoom = useCallback((roomId: string) => {
    const beds = bedAssignments[roomId] ?? [];
    const hasGuests = beds.some(b => !!b.guestName);
    if (hasGuests) {
      toast.error('Cannot delete room — guests are assigned. Remove them first.');
      return;
    }
    setRooms(prev => prev.filter(r => r.id !== roomId));
    setBedAssignments(prev => {
      const next = { ...prev };
      delete next[roomId];
      return next;
    });
  }, [bedAssignments]);

  // ── Bed assignment ──────────────────────────────────────────────────────────

  const assignGuestToRoom = useCallback((
    roomId: string,
    bedNumber: number,
    guestId: string,
    guestName: string,
    familyMemberId?: string,
  ) => {
    const now = new Date().toISOString();

    setBedAssignments(prev => {
      const beds = (prev[roomId] ?? []).map(b =>
        b.bedNumber === bedNumber
          ? { ...b, guestId, guestName, familyMemberId, assignedAt: now }
          : b,
      );
      return { ...prev, [roomId]: beds };
    });

    // Update guest status to Accommodated
    if (guestId) {
      const guest = guests.find(g => g.id === guestId);
      if (guest) {
        if (!familyMemberId) {
          updateGuest(guestId, { status: 'Accommodated' });
        }
        // Create audit entry
        const room = rooms.find(r => r.id === roomId);
        addEntry({
          guestId,
          guestName,
          guestReference: guest.referenceNumber,
          type: 'assignment',
          action: 'Room assigned',
          details: `${familyMemberId ? `Family member "${guestName}"` : guestName} assigned to room ${room?.name ?? roomId}, bed ${bedNumber}`,
          newValue: `${room?.name ?? roomId} / Bed ${bedNumber}`,
          createdBy: {
            id: user?.id ?? 'system',
            name: user?.name ?? 'System',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            role: (user?.role ?? 'super-admin') as any,
          },
          createdAt: now,
        });
      }
    }
  }, [guests, rooms, user, updateGuest, addEntry]);

  const removeGuestFromRoom = useCallback((roomId: string, bedNumber: number) => {
    setBedAssignments(prev => {
      const beds = (prev[roomId] ?? []).map(b =>
        b.bedNumber === bedNumber
          ? { bedNumber: b.bedNumber }
          : b,
      );
      return { ...prev, [roomId]: beds };
    });
  }, []);

  // ── Queries ─────────────────────────────────────────────────────────────────

  const getRoomsByLocation = useCallback((locationId: string): RoomGroup[] => {
    const locRooms = rooms.filter(r => r.locationId === locationId && r.isActive);
    const locBlocks = blocks.filter(b => b.locationId === locationId && b.isActive);

    const groups: RoomGroup[] = locBlocks.map(block => ({
      block,
      rooms: locRooms.filter(r => r.blockId === block.id),
    }));

    const unblocked = locRooms.filter(r => !r.blockId);
    if (unblocked.length > 0) {
      groups.push({ block: null, rooms: unblocked });
    }

    return groups;
  }, [blocks, rooms]);

  const getOccupancy = useCallback((roomId: string): OccupancyInfo => {
    const beds = bedAssignments[roomId] ?? [];
    const total = beds.length;
    const occupied = beds.filter(b => !!b.guestName).length;
    return { total, occupied, available: total - occupied };
  }, [bedAssignments]);

  const getLocationOccupancy = useCallback((locationId: string): LocationOccupancy => {
    const locRooms = rooms.filter(r => r.locationId === locationId && r.isActive);
    let totalBeds = 0;
    let occupiedBeds = 0;
    for (const room of locRooms) {
      const beds = bedAssignments[room.id] ?? [];
      totalBeds += beds.length;
      occupiedBeds += beds.filter(b => !!b.guestName).length;
    }
    return {
      totalRooms: locRooms.length,
      totalBeds,
      occupiedBeds,
      availableBeds: totalBeds - occupiedBeds,
    };
  }, [rooms, bedAssignments]);

  // ── Context value ────────────────────────────────────────────────────────────

  const value: RoomsContextValue = {
    blocks,
    rooms,
    bedAssignments,
    addBlock,
    updateBlock,
    deleteBlock,
    addRoom,
    updateRoom,
    deleteRoom,
    assignGuestToRoom,
    removeGuestFromRoom,
    getRoomsByLocation,
    getOccupancy,
    getLocationOccupancy,
  };

  return <RoomsContext.Provider value={value}>{children}</RoomsContext.Provider>;
}

export function useRooms() {
  const ctx = useContext(RoomsContext);
  if (!ctx) throw new Error('useRooms must be used within RoomsProvider');
  return ctx;
}
