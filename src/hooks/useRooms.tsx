import { createContext, useCallback, useContext, useState, useEffect, useRef, type ReactNode } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { useAuditTrail } from '@/hooks/useAuditTrail';
import type { Block, BedAssignment, Room } from '@/types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RoomGroup {
  block: Block | null;
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
  bedAssignments: Record<string, BedAssignment[]>;
  // Blocks
  addBlock: (locationId: string, name: string) => Promise<Block | null>;
  updateBlock: (blockId: string, name: string) => void;
  deleteBlock: (blockId: string) => Promise<void>;
  // Rooms
  addRoom: (locationId: string, name: string, capacity: number, blockId?: string, availableFrom?: string, availableTo?: string) => Promise<Room | null>;
  updateRoom: (roomId: string, name: string, capacity: number, availableFrom?: string, availableTo?: string) => void;
  deleteRoom: (roomId: string) => Promise<void>;
  // Beds
  assignGuestToRoom: (roomId: string, bedNumber: number, guestId: string, guestName: string, familyMemberId?: string) => void;
  removeGuestFromRoom: (roomId: string, bedNumber: number) => void;
  // Queries
  getRoomsByLocation: (locationId: string) => RoomGroup[];
  getOccupancy: (roomId: string) => OccupancyInfo;
  getLocationOccupancy: (locationId: string) => LocationOccupancy;
}

// ── Row mappers ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToBlock(row: any): Block {
  return {
    id: row.id,
    name: row.name,
    locationId: row.location_id,
    isActive: row.is_active ?? true,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToRoom(row: any): Room {
  return {
    id: row.id,
    name: row.name,
    locationId: row.location_id,
    blockId: row.block_id ?? undefined,
    capacity: row.capacity,
    isActive: row.is_active ?? true,
    availableFrom: row.available_from ?? undefined,
    availableTo: row.available_to ?? undefined,
  };
}

/** Build the full bed-slot array for a room (empty + occupied). */
function buildBedSlots(capacity: number): BedAssignment[] {
  return Array.from({ length: capacity }, (_, i) => ({ bedNumber: i + 1 }));
}

// ── Context ───────────────────────────────────────────────────────────────────

const RoomsContext = createContext<RoomsContextValue | null>(null);

export function RoomsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { guests, updateGuest } = useGuests();
  const { addEntry } = useAuditTrail();

  const [blocks, setBlocks] = useState<Block[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [bedAssignments, setBedAssignments] = useState<Record<string, BedAssignment[]>>({});

  // Keep a ref to the latest location map so real-time handlers can resolve UUIDs → names
  const locMapRef = useRef<Record<string, string>>({});

  // ── Initial fetch ────────────────────────────────────────────────────────────

  useEffect(() => {
    // Fetch locations first to resolve UUIDs → names
    supabase
      .from('locations')
      .select('id, name')
      .then(({ data: locData }) => {
        const locMap: Record<string, string> = {};
        if (locData) {
          for (const l of locData) locMap[l.id] = l.name;
        }
        locMapRef.current = locMap;

    // Fetch blocks
    supabase
      .from('blocks')
      .select('*')
      .order('name')
      .then(({ data }) => {
        if (data) setBlocks(data.map(row => ({
          ...rowToBlock(row),
          locationId: locMap[row.location_id] ?? row.location_id,
        })));
      });

    // Fetch rooms then build bed slots
    supabase
      .from('rooms')
      .select('*')
      .order('name')
      .then(async ({ data: roomData }) => {
        if (!roomData) return;
        const loadedRooms = roomData.map(row => ({
          ...rowToRoom(row),
          locationId: locMap[row.location_id] ?? row.location_id,
        }));
        setRooms(loadedRooms);

        // Build initial empty bed map from room capacities
        const bedMap: Record<string, BedAssignment[]> = {};
        for (const r of loadedRooms) {
          bedMap[r.id] = buildBedSlots(r.capacity);
        }

        // Overlay actual assignments from DB
        const { data: assignments } = await supabase
          .from('bed_assignments')
          .select('*')
          .order('bed_number');

        if (assignments) {
          for (const a of assignments) {
            const slots = bedMap[a.room_id];
            if (!slots) continue;
            const idx = slots.findIndex(b => b.bedNumber === a.bed_number);
            if (idx !== -1) {
              slots[idx] = {
                bedNumber: a.bed_number,
                guestId: a.guest_id ?? undefined,
                guestName: a.guest_name ?? undefined,
                familyMemberId: a.family_member_id ?? undefined,
                assignedAt: a.assigned_at ?? undefined,
              };
            }
          }
        }
        setBedAssignments(bedMap);
      });
      }); // end locations fetch
  }, []);

  // ── Real-time subscriptions ──────────────────────────────────────────────────

  useEffect(() => {
    const roomsChannel = supabase
      .channel('rooms-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, (payload) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lm = locMapRef.current;
        if (payload.eventType === 'INSERT') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const row = payload.new as any;
          const room: Room = { ...rowToRoom(row), locationId: lm[row.location_id] ?? row.location_id };
          setRooms(prev => prev.some(r => r.id === room.id) ? prev : [...prev, room]);
          setBedAssignments(prev => prev[room.id] ? prev : { ...prev, [room.id]: buildBedSlots(room.capacity) });
        }
        if (payload.eventType === 'UPDATE') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const row = payload.new as any;
          const updated: Room = { ...rowToRoom(row), locationId: lm[row.location_id] ?? row.location_id };
          setRooms(prev => prev.map(r => r.id === updated.id ? updated : r));
          // Resize bed slots if capacity changed
          setBedAssignments(prev => {
            const existing = prev[updated.id] ?? [];
            if (existing.length === updated.capacity) return prev;
            const newBeds: BedAssignment[] = Array.from({ length: updated.capacity }, (_, i) =>
              existing[i] ?? { bedNumber: i + 1 }
            );
            return { ...prev, [updated.id]: newBeds };
          });
        }
        if (payload.eventType === 'DELETE') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const id = (payload.old as any).id as string;
          setRooms(prev => prev.filter(r => r.id !== id));
          setBedAssignments(prev => { const n = { ...prev }; delete n[id]; return n; });
        }
      })
      .subscribe();

    const blocksChannel = supabase
      .channel('blocks-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'blocks' }, (payload) => {
        const lm = locMapRef.current;
        if (payload.eventType === 'INSERT') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const row = payload.new as any;
          const block: Block = { ...rowToBlock(row), locationId: lm[row.location_id] ?? row.location_id };
          setBlocks(prev => prev.some(b => b.id === block.id) ? prev : [...prev, block]);
        }
        if (payload.eventType === 'UPDATE') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const row = payload.new as any;
          const updated: Block = { ...rowToBlock(row), locationId: lm[row.location_id] ?? row.location_id };
          setBlocks(prev => prev.map(b => b.id === updated.id ? updated : b));
        }
        if (payload.eventType === 'DELETE') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const id = (payload.old as any).id as string;
          setBlocks(prev => prev.filter(b => b.id !== id));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(roomsChannel);
      supabase.removeChannel(blocksChannel);
    };
  }, []);

  // ── Block CRUD ───────────────────────────────────────────────────────────────

  const addBlock = useCallback(async (locationId: string, name: string): Promise<Block | null> => {
    const { data, error } = await supabase
      .from('blocks')
      .insert({ name: name.trim(), location_id: locationId, is_active: true })
      .select()
      .single();

    if (error) { toast.error('Failed to add block'); return null; }
    const block: Block = { ...rowToBlock(data), locationId: locMapRef.current[data.location_id] ?? data.location_id };
    setBlocks(prev => [...prev, block]);
    toast.success('Block added');
    return block;
  }, []);

  const updateBlock = useCallback((blockId: string, name: string) => {
    supabase
      .from('blocks')
      .update({ name: name.trim(), updated_at: new Date().toISOString() })
      .eq('id', blockId)
      .then(({ error }) => { if (error) toast.error('Failed to update block'); });
    setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, name: name.trim() } : b));
  }, []);

  const deleteBlock = useCallback(async (blockId: string) => {
    const hasRooms = rooms.some(r => r.blockId === blockId);
    if (hasRooms) {
      toast.error('Cannot delete block — it still has rooms. Remove rooms first.');
      return;
    }
    const { error } = await supabase.from('blocks').delete().eq('id', blockId);
    if (error) { toast.error('Failed to delete block'); return; }
    setBlocks(prev => prev.filter(b => b.id !== blockId));
  }, [rooms]);

  // ── Room CRUD ────────────────────────────────────────────────────────────────

  const addRoom = useCallback(async (
    locationId: string, name: string, capacity: number, blockId?: string,
    availableFrom?: string, availableTo?: string,
  ): Promise<Room | null> => {
    const insertPayload = {
      name: name.trim(),
      location_id: locationId,
      block_id: blockId || null,
      capacity: typeof capacity === 'number' ? capacity : parseInt(String(capacity), 10) || 1,
      is_active: true,
      available_from: availableFrom || null,
      available_to: availableTo || null,
    };
    console.log('[addRoom] Insert data:', insertPayload);
    const { data, error } = await supabase
      .from('rooms')
      .insert(insertPayload)
      .select()
      .single();
    console.log('[addRoom] Result:', { data, error });

    if (error) { toast.error('Failed to add room'); return null; }
    const room: Room = { ...rowToRoom(data), locationId: locMapRef.current[data.location_id] ?? data.location_id };
    setRooms(prev => [...prev, room]);
    setBedAssignments(prev => ({
      ...prev,
      [room.id]: buildBedSlots(capacity),
    }));
    toast.success('Room added');
    return room;
  }, []);

  const updateRoom = useCallback((roomId: string, name: string, capacity: number, availableFrom?: string, availableTo?: string) => {
    supabase
      .from('rooms')
      .update({
        name: name.trim(), capacity,
        available_from: availableFrom ?? null,
        available_to: availableTo ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', roomId)
      .then(({ error }) => { if (error) toast.error('Failed to update room'); });

    setRooms(prev => prev.map(r => r.id !== roomId ? r : { ...r, name: name.trim(), capacity, availableFrom, availableTo }));
    setBedAssignments(prev => {
      const existing = prev[roomId] ?? [];
      const newBeds: BedAssignment[] = Array.from({ length: capacity }, (_, i) =>
        existing[i] ?? { bedNumber: i + 1 }
      );
      return { ...prev, [roomId]: newBeds };
    });
  }, []);

  const deleteRoom = useCallback(async (roomId: string) => {
    const beds = bedAssignments[roomId] ?? [];
    if (beds.some(b => !!b.guestName)) {
      toast.error('Cannot delete room — guests are assigned. Remove them first.');
      return;
    }
    const { error } = await supabase.from('rooms').delete().eq('id', roomId);
    if (error) { toast.error('Failed to delete room'); return; }
    setRooms(prev => prev.filter(r => r.id !== roomId));
    setBedAssignments(prev => {
      const next = { ...prev };
      delete next[roomId];
      return next;
    });
  }, [bedAssignments]);

  // ── Bed assignment ───────────────────────────────────────────────────────────

  const assignGuestToRoom = useCallback((
    roomId: string,
    bedNumber: number,
    guestId: string,
    guestName: string,
    familyMemberId?: string,
  ) => {
    const now = new Date().toISOString();

    // Optimistic local update
    setBedAssignments(prev => {
      const beds = (prev[roomId] ?? []).map(b =>
        b.bedNumber === bedNumber
          ? { ...b, guestId, guestName, familyMemberId, assignedAt: now }
          : b,
      );
      return { ...prev, [roomId]: beds };
    });

    // Persist bed assignment
    supabase
      .from('bed_assignments')
      .insert({
        room_id: roomId,
        bed_number: bedNumber,
        guest_id: guestId || null,
        guest_name: guestName,
        family_member_id: familyMemberId ?? null,
        assigned_at: now,
      })
      .then(({ error }) => { if (error) console.error('bed_assignment insert:', error); });

    // Update guest status + audit trail
    if (guestId) {
      const guest = guests.find(g => g.id === guestId);
      if (guest) {
        if (!familyMemberId) {
          updateGuest(guestId, { status: 'Accommodated' });
        }
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
        b.bedNumber === bedNumber ? { bedNumber: b.bedNumber } : b,
      );
      return { ...prev, [roomId]: beds };
    });

    supabase
      .from('bed_assignments')
      .delete()
      .eq('room_id', roomId)
      .eq('bed_number', bedNumber)
      .then(({ error }) => { if (error) console.error('bed_assignment delete:', error); });
  }, []);

  // ── Queries ──────────────────────────────────────────────────────────────────

  const getRoomsByLocation = useCallback((locationId: string): RoomGroup[] => {
    const locRooms  = rooms.filter(r => r.locationId === locationId && r.isActive);
    const locBlocks = blocks.filter(b => b.locationId === locationId && b.isActive);

    const groups: RoomGroup[] = locBlocks.map(block => ({
      block,
      rooms: locRooms.filter(r => r.blockId === block.id),
    }));
    const unblocked = locRooms.filter(r => !r.blockId);
    if (unblocked.length > 0) groups.push({ block: null, rooms: unblocked });
    return groups;
  }, [blocks, rooms]);

  const getOccupancy = useCallback((roomId: string): OccupancyInfo => {
    const beds = bedAssignments[roomId] ?? [];
    const total    = beds.length;
    const occupied = beds.filter(b => !!b.guestName).length;
    return { total, occupied, available: total - occupied };
  }, [bedAssignments]);

  const getLocationOccupancy = useCallback((locationId: string): LocationOccupancy => {
    const locRooms = rooms.filter(r => r.locationId === locationId && r.isActive);
    let totalBeds = 0, occupiedBeds = 0;
    for (const room of locRooms) {
      const beds = bedAssignments[room.id] ?? [];
      totalBeds    += beds.length;
      occupiedBeds += beds.filter(b => !!b.guestName).length;
    }
    return {
      totalRooms: locRooms.length,
      totalBeds,
      occupiedBeds,
      availableBeds: totalBeds - occupiedBeds,
    };
  }, [rooms, bedAssignments]);

  return (
    <RoomsContext.Provider value={{
      blocks, rooms, bedAssignments,
      addBlock, updateBlock, deleteBlock,
      addRoom, updateRoom, deleteRoom,
      assignGuestToRoom, removeGuestFromRoom,
      getRoomsByLocation, getOccupancy, getLocationOccupancy,
    }}>
      {children}
    </RoomsContext.Provider>
  );
}

export function useRooms() {
  const ctx = useContext(RoomsContext);
  if (!ctx) throw new Error('useRooms must be used within RoomsProvider');
  return ctx;
}
