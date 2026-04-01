import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Inbox, CheckCircle, BedDouble, ArrowRight,
  Search, MapPin, ArrowDown, ArrowUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { useRooms } from '@/hooks/useRooms';
import { GuestViewModal } from '@/components/GuestViewModal';
import { LocationSidebar } from '@/components/LocationSidebar';
import { LocationUserMenu } from '@/components/LocationUserMenu';
import { supabase } from '@/lib/supabase';
import type { Guest, Room, BedAssignment } from '@/types';

// ── Helpers ────────────────────────────────────────────────────────────────────

interface PersonRow {
  rowKey: string;
  guestId: string;
  memberId: string | null;
  placedAt?: string;
}

function buildLocationRows(guests: Guest[], loc: string): PersonRow[] {
  const rows: PersonRow[] = [];
  for (const g of guests) {
    if (g.placedLocation === loc) {
      rows.push({ rowKey: g.id, guestId: g.id, memberId: null, placedAt: g.placedAt });
    }
    for (const m of g.familyMembers ?? []) {
      if (m.placedLocation === loc) {
        rows.push({ rowKey: `${g.id}-${m.id}`, guestId: g.id, memberId: m.id, placedAt: m.placedAt });
      }
    }
  }
  return rows;
}

function buildAssignedKeys(rooms: Room[], bedAssignments: Record<string, BedAssignment[]>): Set<string> {
  const s = new Set<string>();
  for (const room of rooms) {
    for (const bed of bedAssignments[room.id] ?? []) {
      if (bed.guestId) s.add(bed.familyMemberId ? `${bed.guestId}-${bed.familyMemberId}` : bed.guestId);
    }
  }
  return s;
}

function OccupancyBar({ occupied, total }: { occupied: number; total: number }) {
  const pct = total > 0 ? Math.round((occupied / total) * 100) : 0;
  const color = pct >= 100 ? 'bg-red-500' : pct >= 60 ? 'bg-amber-500' : 'bg-[#2D5A45]';
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-xs text-gray-500">{occupied}/{total} beds</span>
    </div>
  );
}

function fmtTime(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function LocationDashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { guests } = useGuests();
  const { rooms, bedAssignments, getRoomsByLocation, getOccupancy, getLocationOccupancy } = useRooms();

  const loc  = user?.location ?? '';
  const dept = user?.department ?? '';

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  // ── Location data ─────────────────────────────────────────────────────────────

  const locGuests = useMemo(
    () => guests.filter(g => g.placedLocation === loc),
    [guests, loc],
  );

  const locationRows = useMemo(() => buildLocationRows(guests, loc), [guests, loc]);

  const locationRooms = useMemo(
    () => rooms.filter(r => r.locationId === loc && r.isActive),
    [rooms, loc],
  );

  const assignedKeys = useMemo(
    () => buildAssignedKeys(locationRooms, bedAssignments),
    [locationRooms, bedAssignments],
  );

  const incomingCount    = useMemo(() => locationRows.filter(r => !assignedKeys.has(r.rowKey)).length, [locationRows, assignedKeys]);
  const accommodatedCount = useMemo(() => locationRows.filter(r => assignedKeys.has(r.rowKey)).length, [locationRows, assignedKeys]);

  const { totalBeds, occupiedBeds } = useMemo(() => getLocationOccupancy(loc), [loc, getLocationOccupancy]);
  const roomGroups = useMemo(() => getRoomsByLocation(loc), [loc, getRoomsByLocation]);
  const flatRooms  = useMemo(() => roomGroups.flatMap(g => g.rooms), [roomGroups]);

  // ── Today's arrivals / departures ─────────────────────────────────────────────

  const arrivingToday = useMemo(
    () => locGuests.filter(g => g.arrivalTime?.startsWith(todayStr)),
    [locGuests, todayStr],
  );

  const departingToday = useMemo(
    () => locGuests.filter(g => g.departureTime?.startsWith(todayStr)),
    [locGuests, todayStr],
  );

  // ── Bed map for search results ────────────────────────────────────────────────

  const guestBedMap = useMemo(() => {
    const m = new Map<string, { roomName: string; bedNumber: number }>();
    for (const room of locationRooms) {
      for (const bed of bedAssignments[room.id] ?? []) {
        if (bed.guestId) m.set(bed.guestId, { roomName: room.name, bedNumber: bed.bedNumber });
      }
    }
    return m;
  }, [locationRooms, bedAssignments]);

  // ── Real-time: toast when new guest placed at this location ───────────────────

  useEffect(() => {
    if (!loc) return;
    const channel = supabase
      .channel('loc-guest-placed')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'guests' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          if (
            payload.new?.placed_location === loc &&
            payload.old?.placed_location !== loc
          ) {
            toast.info(`New guest placed: ${payload.new.full_name}`, {
              description: `${payload.new.full_name} has been placed at ${loc}`,
              duration: 5000,
            });
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loc]);

  // ── Guest search ──────────────────────────────────────────────────────────────

  const [searchText, setSearchText]         = useState('');
  const [searchResults, setSearchResults]   = useState<Guest[]>([]);
  const [highlightIdx, setHighlightIdx]     = useState(-1);
  const [showDropdown, setShowDropdown]     = useState(false);
  const [viewGuestId, setViewGuestId]       = useState<string | null>(null);
  const searchContainerRef                  = useRef<HTMLDivElement>(null);
  const debounceRef                         = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (searchText.length < 2) {
      setSearchResults([]); setShowDropdown(false); setHighlightIdx(-1); return;
    }
    debounceRef.current = setTimeout(() => {
      const q = searchText.toLowerCase();
      const results = locGuests.filter(g =>
        g.fullName?.toLowerCase().includes(q) ||
        g.country?.toLowerCase().includes(q) ||
        g.referenceNumber?.toLowerCase().includes(q) ||
        guestBedMap.get(g.id)?.roomName?.toLowerCase().includes(q)
      ).slice(0, 8);
      setSearchResults(results);
      setShowDropdown(true);
      setHighlightIdx(-1);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchText, locGuests, guestBedMap]);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  function handleSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(i => Math.min(i + 1, searchResults.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx(i => Math.max(i - 1, -1)); }
    else if (e.key === 'Enter' && highlightIdx >= 0) openResult(searchResults[highlightIdx].id);
    else if (e.key === 'Escape') { setSearchText(''); setShowDropdown(false); }
  }

  function openResult(id: string) { setViewGuestId(id); setShowDropdown(false); }

  // ── Quick actions ─────────────────────────────────────────────────────────────

  const quickActions = [
    { label: 'Assign Rooms →', href: '/location/incoming' },
    { label: 'View All Rooms →', href: '/location/rooms' },
  ];

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <div className="flex">
        <LocationSidebar />
        <main className="flex-1 ml-64">
          <header className="bg-white border-b border-[#E8E3DB] px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <LayoutDashboard className="w-5 h-5 text-[#2D5A45]" />
                <div>
                  <h1 className="text-xl font-semibold text-[#1A1A1A]">{loc} Dashboard</h1>
                  <p className="text-xs text-[#4A4A4A] mt-0.5">{dept} — {user.name}</p>
                </div>
              </div>
              <LocationUserMenu />
            </div>
          </header>

          <div className="p-6 space-y-6">

            {/* ── 🔍 Quick Search ──────────────────────────────────────────── */}
            <div ref={searchContainerRef} className="relative">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchText}
                  onChange={e => setSearchText(e.target.value)}
                  onKeyDown={handleSearchKey}
                  onFocus={() => { if (searchResults.length > 0) setShowDropdown(true); }}
                  placeholder="Search guests by name, country, reference, or room…"
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 pl-11 text-sm shadow-sm focus:outline-none focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45]"
                />
              </div>
              {showDropdown && (
                <div className="absolute z-50 w-full mt-1 bg-white rounded-xl shadow-lg border border-gray-200 max-h-96 overflow-y-auto">
                  {searchResults.length === 0 ? (
                    <p className="px-4 py-5 text-sm text-gray-400 italic text-center">
                      No guests found matching &ldquo;{searchText}&rdquo;
                    </p>
                  ) : searchResults.map((g, i) => {
                    const bed = guestBedMap.get(g.id);
                    return (
                      <div
                        key={g.id}
                        onClick={() => openResult(g.id)}
                        className={`flex items-start gap-3 px-4 py-3 cursor-pointer rounded-lg mx-1 my-0.5 transition-colors ${i === highlightIdx ? 'bg-[#D6E4D9]' : 'hover:bg-[#D6E4D9]/30'}`}
                      >
                        <div className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${g.status === 'Accommodated' ? 'bg-green-500' : 'bg-amber-400'}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-sm font-medium text-[#1A1A1A]">{g.fullName}</span>
                            <span className="text-sm text-gray-500">{g.country}</span>
                            <span className="text-xs text-gray-400 font-mono">{g.referenceNumber}</span>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                            <MapPin className="w-3 h-3 shrink-0" />
                            {bed ? (
                              <span>{bed.roomName} — Bed {bed.bedNumber}</span>
                            ) : (
                              <span className="text-amber-600">No bed assigned</span>
                            )}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            Arrives: {fmtDate(g.arrivalTime)} &nbsp;|&nbsp; Departs: {fmtDate(g.departureTime)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── ↓↑ Today's Check-ins / Check-outs ───────────────────────── */}
            <div className="grid grid-cols-2 gap-4">
              {/* Arriving today */}
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <ArrowDown className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-semibold text-green-800">Arriving TODAY</span>
                  </div>
                  <span className="bg-green-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {arrivingToday.length}
                  </span>
                </div>
                {arrivingToday.length === 0 ? (
                  <p className="text-sm text-green-600">No arrivals today ✅</p>
                ) : (
                  <div className="space-y-2">
                    {arrivingToday.map(g => (
                      <div
                        key={g.id}
                        onClick={() => setViewGuestId(g.id)}
                        className="flex items-center justify-between py-1 cursor-pointer hover:bg-green-100 rounded px-1 transition-colors"
                      >
                        <span className="text-sm font-medium text-green-900 truncate max-w-[130px]">{g.fullName}</span>
                        <div className="flex items-center gap-2 shrink-0 text-xs text-green-700">
                          <span>{fmtTime(g.arrivalTime)}</span>
                          {g.arrivalFlightNumber && (
                            <span className="font-mono bg-green-100 px-1.5 py-0.5 rounded">{g.arrivalFlightNumber}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Departing today */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <ArrowUp className="w-4 h-4 text-amber-600" />
                    <span className="text-sm font-semibold text-amber-800">Departing TODAY</span>
                  </div>
                  <span className="bg-amber-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {departingToday.length}
                  </span>
                </div>
                {departingToday.length === 0 ? (
                  <p className="text-sm text-amber-600">No departures today</p>
                ) : (
                  <div className="space-y-2">
                    {departingToday.map(g => (
                      <div
                        key={g.id}
                        onClick={() => setViewGuestId(g.id)}
                        className="flex items-center justify-between py-1 cursor-pointer hover:bg-amber-100 rounded px-1 transition-colors"
                      >
                        <span className="text-sm font-medium text-amber-900 truncate max-w-[130px]">{g.fullName}</span>
                        <div className="flex items-center gap-2 shrink-0 text-xs text-amber-700">
                          <span>{fmtTime(g.departureTime)}</span>
                          {g.departureFlightNumber && (
                            <span className="font-mono bg-amber-100 px-1.5 py-0.5 rounded">{g.departureFlightNumber}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Stats cards ───────────────────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-4">
              <button
                onClick={() => navigate('/location/incoming')}
                className="bg-white rounded-xl border border-[#E8E3DB] p-5 text-left hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
                    <Inbox className="w-5 h-5 text-amber-600" />
                  </div>
                  <span className="text-2xl font-bold text-amber-600">{incomingCount}</span>
                </div>
                <p className="text-sm font-medium text-[#1A1A1A]">Incoming</p>
                <p className="text-xs text-[#4A4A4A] mt-0.5">Placed but no bed assigned</p>
              </button>

              <button
                onClick={() => navigate('/location/accommodated')}
                className="bg-white rounded-xl border border-[#E8E3DB] p-5 text-left hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  </div>
                  <span className="text-2xl font-bold text-green-600">{accommodatedCount}</span>
                </div>
                <p className="text-sm font-medium text-[#1A1A1A]">Accommodated</p>
                <p className="text-xs text-[#4A4A4A] mt-0.5">Bed assigned</p>
              </button>

              <button
                onClick={() => navigate('/location/rooms')}
                className="bg-white rounded-xl border border-[#E8E3DB] p-5 text-left hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                    <BedDouble className="w-5 h-5 text-blue-600" />
                  </div>
                  <span className="text-2xl font-bold text-blue-600">{occupiedBeds}/{totalBeds}</span>
                </div>
                <p className="text-sm font-medium text-[#1A1A1A]">Room Capacity</p>
                <OccupancyBar occupied={occupiedBeds} total={totalBeds} />
              </button>
            </div>

            {/* ── Room Overview ─────────────────────────────────────────────── */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <BedDouble className="w-4 h-4 text-[#2D5A45]" />
                <h2 className="text-sm font-semibold text-[#1A1A1A]">Room Overview</h2>
                {totalBeds > 0 && (
                  <span className="text-xs text-[#4A4A4A] ml-auto">
                    {occupiedBeds}/{totalBeds} beds occupied ({totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0}%)
                  </span>
                )}
              </div>
              {flatRooms.length === 0 ? (
                <div className="bg-white rounded-xl border border-[#E8E3DB] p-10 text-center">
                  <BedDouble className="w-10 h-10 mx-auto mb-3 text-[#D4CFC7]" />
                  <p className="text-sm font-medium text-[#1A1A1A] mb-1">No rooms configured</p>
                  <p className="text-xs text-[#4A4A4A]">Add rooms from the Rooms &amp; Blocks page.</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {flatRooms.map(room => {
                    const occ = getOccupancy(room.id);
                    const isFull  = occ.total > 0 && occ.occupied >= occ.total;
                    const isEmpty = occ.occupied === 0;
                    const borderColor = isFull ? 'border-l-red-400' : isEmpty ? 'border-l-gray-300' : 'border-l-green-500';
                    return (
                      <div
                        key={room.id}
                        className={`bg-white border border-[#E8E3DB] border-l-4 ${borderColor} rounded-xl p-4`}
                      >
                        <p className="font-medium text-sm text-[#1A1A1A] mb-2">{room.name}</p>
                        <OccupancyBar occupied={occ.occupied} total={occ.total} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Quick Actions ─────────────────────────────────────────────── */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <ArrowRight className="w-4 h-4 text-[#2D5A45]" />
                <h2 className="text-sm font-semibold text-[#1A1A1A]">Quick Actions</h2>
              </div>
              <div className="bg-white border border-[#E8E3DB] rounded-xl overflow-hidden">
                {quickActions.map((action, idx) => (
                  <button
                    key={idx}
                    onClick={() => navigate(action.href)}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#F5F0E8] transition-colors border-b border-[#E8E3DB] last:border-b-0 text-left"
                  >
                    <span className="text-sm text-[#1A1A1A]">{action.label}</span>
                    <ArrowRight className="w-4 h-4 text-[#4A4A4A]" />
                  </button>
                ))}
              </div>
            </div>

          </div>
        </main>
      </div>

      <GuestViewModal
        guest={guests.find(g => g.id === viewGuestId) ?? null}
        open={!!viewGuestId}
        onClose={() => setViewGuestId(null)}
      />
    </div>
  );
}
