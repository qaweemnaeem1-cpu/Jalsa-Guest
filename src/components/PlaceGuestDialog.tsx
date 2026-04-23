import { useEffect, useState } from 'react';
import { formatDate, formatTime } from '@/utils/dateHelpers';
import { AlertTriangle, ChevronDown, MapPin } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';

// ── Location colour palette (matches DeptIncomingPage) ───────────────────────
const LOCATION_COLORS = [
  { dot: 'bg-blue-500',   bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200'   },
  { dot: 'bg-purple-500', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  { dot: 'bg-teal-500',   bg: 'bg-teal-50',   text: 'text-teal-700',   border: 'border-teal-200'   },
  { dot: 'bg-orange-500', bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  { dot: 'bg-rose-500',   bg: 'bg-rose-50',   text: 'text-rose-700',   border: 'border-rose-200'   },
];

function getLocationColor(locations: string[], loc: string) {
  const idx = locations.indexOf(loc);
  return LOCATION_COLORS[(idx >= 0 ? idx : 0) % LOCATION_COLORS.length];
}

type RoomOption = {
  id: string;
  name: string;
  capacity: number;
  occupancy: number;
  available_from?: string;
  available_to?: string;
};

export interface PlaceGuestDialogProps {
  open: boolean;
  onClose: () => void;
  /** 'place' = incoming guest, 'change' = already-placed guest */
  mode: 'place' | 'change';
  guestName: string;
  guestCountry: string;
  arrivalTime?: string;
  arrivalAirport?: string;
  arrivalFlightNumber?: string;
  departureTime?: string;
  departureAirport?: string;
  /** Department locations to show in the picker */
  locations: string[];
  /** Number of guests already at each location (for display) */
  guestCountByLocation: Record<string, number>;
  /** Pre-fill when changing an existing assignment */
  initialLocation?: string;
  /** Called when user confirms; parent handles DB writes */
  saving?: boolean;
  onConfirm: (
    locationName: string,
    room?: { id: string; name: string; capacity: number },
  ) => Promise<void>;
}

function formatDT(dt?: string) {
  if (!dt) return null;
  const date = formatDate(dt);
  const time = formatTime(dt);
  return { date: date === '—' ? '' : date, time: time === '—' ? '' : time };
}

export function PlaceGuestDialog({
  open, onClose, mode,
  guestName, guestCountry,
  arrivalTime, arrivalAirport, arrivalFlightNumber,
  departureTime, departureAirport,
  locations, guestCountByLocation,
  initialLocation,
  saving,
  onConfirm,
}: PlaceGuestDialogProps) {
  const [selectedLocation, setSelectedLocation] = useState(initialLocation ?? '');
  const [openLocDropdown, setOpenLocDropdown] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [openRoomDropdown, setOpenRoomDropdown] = useState(false);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);

  // Reset when dialog opens/closes
  useEffect(() => {
    if (open) {
      setSelectedLocation(initialLocation ?? '');
      setSelectedRoomId('');
      setRooms([]);
      setOpenLocDropdown(false);
      setOpenRoomDropdown(false);
      if (initialLocation) fetchRooms(initialLocation);
    }
  }, [open, initialLocation]);

  // Fetch rooms when location changes
  useEffect(() => {
    if (selectedLocation) fetchRooms(selectedLocation);
    else setRooms([]);
    setSelectedRoomId('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLocation]);

  async function fetchRooms(locationName: string) {
    setLoadingRooms(true);
    const { data: locData } = await supabase
      .from('locations')
      .select('id')
      .eq('name', locationName)
      .maybeSingle();

    if (!locData?.id) { setRooms([]); setLoadingRooms(false); return; }

    const { data: roomData } = await supabase
      .from('rooms')
      .select('id, name, capacity, available_from, available_to')
      .eq('location_id', locData.id)
      .eq('is_active', true)
      .order('name');

    if (!roomData) { setRooms([]); setLoadingRooms(false); return; }

    const roomIds = roomData.map((r: any) => r.id);
    const { data: beds } = await supabase
      .from('bed_assignments')
      .select('room_id')
      .in('room_id', roomIds.length > 0 ? roomIds : ['_none_']);
    const occMap: Record<string, number> = {};
    if (beds) for (const b of beds) occMap[b.room_id] = (occMap[b.room_id] ?? 0) + 1;

    setRooms(roomData.map((r: any) => ({
      id: r.id, name: r.name, capacity: r.capacity,
      occupancy: occMap[r.id] ?? 0,
      available_from: r.available_from ?? undefined,
      available_to: r.available_to ?? undefined,
    })));
    setLoadingRooms(false);
  }

  const selectedRoom = rooms.find(r => r.id === selectedRoomId);

  // Date mismatch detection
  const guestArrivalDate = arrivalTime?.substring(0, 10);
  const guestDepartureDate = departureTime?.substring(0, 10);
  const dateMismatch = selectedRoom
    ? (selectedRoom.available_from && guestArrivalDate && guestArrivalDate < selectedRoom.available_from) ||
      (selectedRoom.available_to && guestDepartureDate && guestDepartureDate > selectedRoom.available_to)
    : false;

  const confirmLabel = selectedRoomId
    ? 'Place & Assign Room'
    : mode === 'change' ? 'Update Placement' : 'Place Guest';

  async function handleConfirm() {
    if (!selectedLocation) return;
    const room = selectedRoomId ? rooms.find(r => r.id === selectedRoomId) : undefined;
    await onConfirm(
      selectedLocation,
      room ? { id: room.id, name: room.name, capacity: room.capacity } : undefined,
    );
  }

  const arrival = formatDT(arrivalTime);
  const departure = formatDT(departureTime);

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[#1A1A1A] flex items-center gap-2">
            <MapPin className="w-5 h-5 text-[#2D5A45]" />
            {mode === 'change' ? 'Change Placement' : 'Place Guest'}
          </DialogTitle>
          <DialogDescription className="text-[#4A4A4A]">
            {guestName} — {guestCountry}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Flight info */}
          {(arrival || departure) && (
            <div className="bg-[#F9F8F6] rounded-lg px-4 py-3 space-y-1 text-sm">
              {arrival && (
                <div className="flex items-center gap-2">
                  <span className="w-16 text-xs font-medium text-[#4A4A4A] uppercase tracking-wide">Arrives</span>
                  <span className="text-[#1A1A1A]">{arrival.date}, {arrival.time}</span>
                  {(arrivalFlightNumber || arrivalAirport) && (
                    <span className="text-gray-400 text-xs">
                      · {[arrivalFlightNumber, arrivalAirport].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </div>
              )}
              {departure && (
                <div className="flex items-center gap-2">
                  <span className="w-16 text-xs font-medium text-[#4A4A4A] uppercase tracking-wide">Departs</span>
                  <span className="text-[#1A1A1A]">{departure.date}, {departure.time}</span>
                  {departureAirport && (
                    <span className="text-gray-400 text-xs">· {departureAirport}</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Location picker */}
          <div>
            <label className="text-sm font-medium text-[#1A1A1A] mb-1.5 block">
              Location <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <button
                onClick={() => { setOpenLocDropdown(p => !p); setOpenRoomDropdown(false); }}
                className="flex items-center justify-between gap-2 w-full border border-[#D4CFC7] rounded-lg px-3 py-2.5 text-sm bg-white hover:border-[#2D5A45] transition-colors"
              >
                {selectedLocation ? (
                  <span className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${getLocationColor(locations, selectedLocation).dot} shrink-0`} />
                    <span className="text-[#1A1A1A]">{selectedLocation}</span>
                    <span className="text-gray-400 text-xs">
                      ({guestCountByLocation[selectedLocation] ?? 0} guests)
                    </span>
                  </span>
                ) : (
                  <span className="text-gray-400">Select location…</span>
                )}
                <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
              </button>
              {openLocDropdown && (
                <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-[#E8E3DB] rounded-xl shadow-xl overflow-hidden">
                  {locations.map(loc => {
                    const color = getLocationColor(locations, loc);
                    const count = guestCountByLocation[loc] ?? 0;
                    return (
                      <button
                        key={loc}
                        onClick={() => {
                          setSelectedLocation(loc);
                          setOpenLocDropdown(false);
                        }}
                        className={`flex items-center justify-between w-full px-4 py-2.5 text-sm text-left transition-colors hover:bg-[#F5F0E8] ${selectedLocation === loc ? 'bg-[#F5F0E8] font-medium' : ''}`}
                      >
                        <span className="flex items-center gap-2.5">
                          <span className={`w-2.5 h-2.5 rounded-full ${color.dot} shrink-0`} />
                          <span className="text-[#1A1A1A]">{loc}</span>
                        </span>
                        <span className="text-xs text-gray-400">{count} guests</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Room picker */}
          <div>
            <label className="text-sm font-medium text-[#1A1A1A] mb-0.5 block">
              Room <span className="text-xs font-normal text-gray-400 ml-1">(optional — you can assign later)</span>
            </label>
            <div className="relative">
              <button
                disabled={!selectedLocation}
                onClick={() => { setOpenRoomDropdown(p => !p); setOpenLocDropdown(false); }}
                className="flex items-center justify-between gap-2 w-full border border-[#D4CFC7] rounded-lg px-3 py-2.5 text-sm bg-white hover:border-[#2D5A45] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {!selectedLocation ? (
                  <span className="text-gray-400 text-xs">Select location first</span>
                ) : loadingRooms ? (
                  <span className="text-gray-400">Loading rooms…</span>
                ) : selectedRoom ? (
                  <span className="text-[#1A1A1A]">{selectedRoom.name}</span>
                ) : (
                  <span className="text-gray-400">Select room… (skip to place without room)</span>
                )}
                <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
              </button>

              {openRoomDropdown && selectedLocation && !loadingRooms && (
                <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-[#E8E3DB] rounded-xl shadow-xl overflow-hidden max-h-64 overflow-y-auto">
                  {/* "No room" option */}
                  <button
                    onClick={() => { setSelectedRoomId(''); setOpenRoomDropdown(false); }}
                    className={`flex items-center w-full px-4 py-2.5 text-sm text-left border-b border-[#E8E3DB] transition-colors hover:bg-[#F5F0E8] ${!selectedRoomId ? 'bg-[#F5F0E8] font-medium' : ''}`}
                  >
                    <span className="text-gray-400 italic">No room — place only</span>
                  </button>
                  {rooms.length === 0 ? (
                    <div className="px-4 py-4 text-sm text-gray-400 text-center">No rooms available for this location</div>
                  ) : rooms.map(room => {
                    const isFull = room.occupancy >= room.capacity;
                    const fillPct = room.capacity > 0 ? Math.round((room.occupancy / room.capacity) * 100) : 0;
                    const hasMismatch = !!(
                      (room.available_from && guestArrivalDate && guestArrivalDate < room.available_from) ||
                      (room.available_to && guestDepartureDate && guestDepartureDate > room.available_to)
                    );
                    return (
                      <button
                        key={room.id}
                        disabled={isFull}
                        onClick={() => { setSelectedRoomId(room.id); setOpenRoomDropdown(false); }}
                        className={`flex flex-col gap-1.5 w-full px-4 py-3 text-left border-b border-[#E8E3DB] last:border-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${selectedRoomId === room.id ? 'bg-emerald-50' : 'hover:bg-[#F5F0E8]'}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-[#1A1A1A] flex items-center gap-1.5">
                            {isFull
                              ? <span className="text-red-400">●</span>
                              : hasMismatch
                                ? <span className="text-amber-400">⚠</span>
                                : <span className="text-emerald-400">●</span>}
                            {room.name}
                          </span>
                          <span className="text-xs text-[#4A4A4A] shrink-0">{room.occupancy}/{room.capacity} beds</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full ${isFull ? 'bg-red-400' : fillPct > 70 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                            style={{ width: `${fillPct}%` }}
                          />
                        </div>
                        {(room.available_from || room.available_to) && (
                          <div className="text-xs text-gray-400">
                            {room.available_from && room.available_to
                              ? `${new Date(room.available_from + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${new Date(room.available_to + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                              : room.available_from ? `From ${room.available_from}` : `Until ${room.available_to}`}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Inline date mismatch warning */}
            {dateMismatch && selectedRoom && (
              <div className="flex items-start gap-2 mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-sm text-amber-800">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <span>
                  Guest {guestArrivalDate ? `arrives ${guestArrivalDate}` : ''}
                  {guestDepartureDate ? ` and departs ${guestDepartureDate}` : ''} but{' '}
                  <strong>{selectedRoom.name}</strong> is available{' '}
                  {selectedRoom.available_from && selectedRoom.available_to
                    ? `${selectedRoom.available_from} – ${selectedRoom.available_to}`
                    : selectedRoom.available_from
                      ? `from ${selectedRoom.available_from}`
                      : `until ${selectedRoom.available_to}`}.
                  {' '}You can still assign — this is a warning only.
                </span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-[#D4CFC7] text-sm text-[#4A4A4A] hover:bg-[#F5F0E8] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedLocation || saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#2D5A45] text-white hover:bg-[#234839] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <MapPin className="w-4 h-4" />
            {saving ? 'Saving…' : confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
