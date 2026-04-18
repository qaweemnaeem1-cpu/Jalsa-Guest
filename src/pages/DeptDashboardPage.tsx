import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Inbox, CheckCircle, Users, MapPin, Clock, ArrowRight,
  AlertTriangle, BedDouble, BarChart2, CalendarDays, Search, Car,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useGuests } from '@/hooks/useGuests';
import { DeptSidebar } from '@/components/DeptSidebar';
import { DeptUserMenu } from '@/components/DeptUserMenu';
import { getStatusBadgeClass } from '@/lib/constants';
import { useDepartments } from '@/hooks/useDepartments';
import { GuestViewModal } from '@/components/GuestViewModal';
import { supabase } from '@/lib/supabase';
import type { Guest } from '@/types';

const shortenRef = (ref: string) =>
  !ref ? '—' : ref.length <= 10 ? ref : ref.slice(0, 2) + '...' + ref.slice(-5);

interface LocationOccupancy {
  locationName: string;
  totalBeds: number;
  occupiedBeds: number;
}

interface DriverLocSummary {
  location: string;
  total: number;
  available: number;
  busy: number;
  offDuty: number;
  tasksToday: number;
  unassigned: number;
}

function occupancyBarColor(pct: number): string {
  if (pct >= 100) return 'bg-red-500';
  if (pct >= 81)  return 'bg-orange-500';
  if (pct >= 51)  return 'bg-amber-500';
  return 'bg-green-500';
}

export default function DeptDashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { guests } = useGuests();
  const { departments, locationsList, deptList } = useDepartments();

  const [occupancyData, setOccupancyData]           = useState<LocationOccupancy[]>([]);
  const [roomsAvailableSoon, setRoomsAvailableSoon] = useState(0);
  const [driverSummary, setDriverSummary]           = useState<DriverLocSummary[]>([]);
  const [totalUnassignedTasks, setTotalUnassignedTasks] = useState(0);

  // ── Guest Search ──────────────────────────────────────────────────────────────
  const [searchText, setSearchText]           = useState('');
  const [searchResults, setSearchResults]     = useState<Guest[]>([]);
  const [highlightIdx, setHighlightIdx]       = useState(-1);
  const [showDropdown, setShowDropdown]       = useState(false);
  const [viewGuestId, setViewGuestId]         = useState<string | null>(null);
  const searchContainerRef                    = useRef<HTMLDivElement>(null);
  const searchDebounceRef                     = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dept      = user?.department ?? '';
  const locations = departments[dept] ?? [];

  const todayStr    = useMemo(() => new Date().toISOString().split('T')[0], []);
  const tomorrowStr = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0];
  }, []);

  const deptGuests = useMemo(
    () => guests.filter(g => g.assignedDepartment === dept),
    [guests, dept],
  );

  const incomingGuests = useMemo(() => deptGuests.filter(g => !g.placedLocation),  [deptGuests]);
  const placedGuests   = useMemo(() => deptGuests.filter(g => !!g.placedLocation), [deptGuests]);

  const recentActivity = useMemo(
    () =>
      [...deptGuests]
        .sort((a, b) => (b.assignedDepartmentAt ?? '').localeCompare(a.assignedDepartmentAt ?? ''))
        .slice(0, 5),
    [deptGuests],
  );

  // ── Urgent counts ─────────────────────────────────────────────────────────────

  const arrivingTodayNoRoom = useMemo(
    () => deptGuests.filter(g => g.arrivalTime?.startsWith(todayStr) && !g.roomAssignment).length,
    [deptGuests, todayStr],
  );

  const arrivingTomorrowNoRoom = useMemo(
    () => deptGuests.filter(g => g.arrivalTime?.startsWith(tomorrowStr) && !g.roomAssignment).length,
    [deptGuests, tomorrowStr],
  );

  // ── 7-day arrivals / departures ───────────────────────────────────────────────

  const next7Days = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() + i); return d.toISOString().split('T')[0];
    }), []);

  const dailyStats = useMemo(() =>
    next7Days.map(dayStr => ({
      dayStr,
      arriving:  deptGuests.filter(g => g.arrivalTime?.startsWith(dayStr)).length,
      departing: deptGuests.filter(g => g.departureTime?.startsWith(dayStr)).length,
      net: deptGuests.filter(g => g.arrivalTime?.startsWith(dayStr)).length
         - deptGuests.filter(g => g.departureTime?.startsWith(dayStr)).length,
    })), [deptGuests, next7Days]);

  // ── Fetch occupancy + rooms available soon ────────────────────────────────────

  const fetchOccupancy = useCallback(async () => {
    if (!dept || locations.length === 0) return;
    const deptRecord = deptList.find(d => d.name === dept);
    if (!deptRecord) return;

    const deptLocs = locationsList.filter(l => l.departmentId === deptRecord.id && l.isActive);
    if (deptLocs.length === 0) return;

    const results: LocationOccupancy[] = [];

    for (const loc of deptLocs) {
      const { data: rooms } = await supabase
        .from('rooms')
        .select('id, capacity')
        .eq('location_id', loc.id)
        .eq('is_active', true);

      if (!rooms || rooms.length === 0) {
        results.push({ locationName: loc.name, totalBeds: 0, occupiedBeds: 0 });
        continue;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const totalBeds = rooms.reduce((s: number, r: any) => s + (r.capacity ?? 0), 0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const roomIds   = rooms.map((r: any) => r.id as string);

      const { data: assignments } = await supabase
        .from('bed_assignments')
        .select('id')
        .in('room_id', roomIds);

      results.push({ locationName: loc.name, totalBeds, occupiedBeds: assignments?.length ?? 0 });
    }

    setOccupancyData(results);

    // Rooms becoming available today or tomorrow
    const locIds = deptLocs.map(l => l.id);
    const { data: soonRooms } = await supabase
      .from('rooms')
      .select('id')
      .in('location_id', locIds)
      .eq('is_active', true)
      .or(`available_to.eq.${todayStr},available_to.eq.${tomorrowStr}`);

    setRoomsAvailableSoon(soonRooms?.length ?? 0);
  }, [dept, locations, locationsList, deptList, todayStr, tomorrowStr]);

  const fetchDriverSummary = useCallback(async () => {
    if (!dept) return;
    const today = new Date().toISOString().substring(0, 10);
    const [driversRes, tasksRes] = await Promise.all([
      supabase.from('users')
        .select('id,location,is_available')
        .eq('role', 'driver')
        .eq('department', dept),
      supabase.from('driver_tasks')
        .select('driver_id,status,is_suggestion,location')
        .eq('department', dept)
        .eq('scheduled_date', today)
        .neq('status', 'cancelled'),
    ]);

    const driverRows = driversRes.data ?? [];
    const taskRows   = tasksRes.data ?? [];

    const busyDriverIds = new Set(taskRows.filter(t => t.status === 'in_progress').map(t => t.driver_id));
    const taskCountMap: Record<string, number> = {};
    let unassignedTotal = 0;
    const unassignedByLoc: Record<string, number> = {};

    for (const t of taskRows) {
      if (t.is_suggestion && t.status === 'suggested') {
        unassignedTotal++;
        const loc = t.location ?? '(No Location)';
        unassignedByLoc[loc] = (unassignedByLoc[loc] ?? 0) + 1;
      } else {
        taskCountMap[t.driver_id] = (taskCountMap[t.driver_id] ?? 0) + 1;
      }
    }

    const locMap: Record<string, DriverLocSummary> = {};
    for (const d of driverRows) {
      const loc = d.location ?? '(No Location)';
      if (!locMap[loc]) locMap[loc] = { location: loc, total: 0, available: 0, busy: 0, offDuty: 0, tasksToday: 0, unassigned: 0 };
      locMap[loc].total++;
      if (busyDriverIds.has(d.id)) locMap[loc].busy++;
      else if (d.is_available) locMap[loc].available++;
      else locMap[loc].offDuty++;
      locMap[loc].tasksToday += taskCountMap[d.id] ?? 0;
    }
    for (const [loc, cnt] of Object.entries(unassignedByLoc)) {
      if (locMap[loc]) locMap[loc].unassigned = cnt;
    }

    setDriverSummary(Object.values(locMap));
    setTotalUnassignedTasks(unassignedTotal);
  }, [dept]);

  useEffect(() => { fetchOccupancy(); fetchDriverSummary(); }, [fetchOccupancy, fetchDriverSummary]);

  // Real-time: re-fetch occupancy when rooms or bed assignments change
  useEffect(() => {
    const channel = supabase
      .channel('dept-dashboard-occupancy-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => {
        fetchOccupancy();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bed_assignments' }, () => {
        fetchOccupancy();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchOccupancy]);

  const quickActions = [
    { label: 'View Incoming Guests', href: '/dept/incoming',  icon: Inbox },
    { label: 'Manage Locations',     href: '/dept/locations', icon: MapPin },
    { label: 'Manage Sub Users',     href: '/dept/sub-users', icon: Users },
  ];

  const hasUrgentItems = arrivingTodayNoRoom > 0 || arrivingTomorrowNoRoom > 0 || roomsAvailableSoon > 0;

  // ── Search debounce ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (searchText.length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      setHighlightIdx(-1);
      return;
    }
    searchDebounceRef.current = setTimeout(() => {
      const q = searchText.toLowerCase();
      const results = deptGuests.filter(g =>
        g.fullName?.toLowerCase().includes(q) ||
        g.country?.toLowerCase().includes(q) ||
        g.referenceNumber?.toLowerCase().includes(q) ||
        (Array.isArray(g.designation) ? g.designation.join(' ') : g.designation || '').toLowerCase().includes(q)
      ).slice(0, 8);
      setSearchResults(results);
      setShowDropdown(true);
      setHighlightIdx(-1);
    }, 300);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [searchText, deptGuests]);

  // ── Click outside to close ────────────────────────────────────────────────────
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(i => Math.min(i + 1, searchResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      if (highlightIdx >= 0 && searchResults[highlightIdx]) {
        openSearchResult(searchResults[highlightIdx].id);
      }
    } else if (e.key === 'Escape') {
      setSearchText('');
      setShowDropdown(false);
    }
  }

  function openSearchResult(guestId: string) {
    setViewGuestId(guestId);
    setShowDropdown(false);
  }

  function searchStatusDot(g: Guest): string {
    if (g.status === 'Accommodated') return 'bg-green-500';
    if (g.placedLocation) return 'bg-amber-400';
    return 'bg-blue-500';
  }

  function fmtDate(iso?: string): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <div className="flex">
        <DeptSidebar />
        <main className="flex-1 ml-64">
          <header className="bg-white border-b border-[#E8E3DB] px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <LayoutDashboard className="w-5 h-5 text-[#2D5A45]" />
                <div>
                  <h1 className="text-2xl font-semibold text-[#1A1A1A]">{dept} Dashboard</h1>
                  <p className="text-sm text-[#4A4A4A] mt-0.5">{locations.length} location{locations.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <DeptUserMenu />
            </div>
          </header>

          <div className="p-6 space-y-6">

            {/* ── 🔍 Quick Search ──────────────────────────────────────────────────── */}
            <div ref={searchContainerRef} className="relative">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchText}
                  onChange={e => setSearchText(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  onFocus={() => { if (searchResults.length > 0) setShowDropdown(true); }}
                  placeholder="Search guests by name, country, reference, or designation..."
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 pl-11 text-sm shadow-sm focus:outline-none focus:border-[#2D5A45] focus:ring-1 focus:ring-[#2D5A45]"
                />
              </div>

              {showDropdown && (
                <div className="absolute z-50 w-full mt-1 bg-white rounded-xl shadow-lg border border-gray-200 max-h-96 overflow-y-auto">
                  {searchResults.length === 0 ? (
                    <p className="px-4 py-5 text-sm text-gray-400 italic text-center">
                      No guests found matching &ldquo;{searchText}&rdquo;
                    </p>
                  ) : searchResults.map((g, i) => (
                    <div
                      key={g.id}
                      onClick={() => openSearchResult(g.id)}
                      className={`flex items-start gap-3 px-4 py-3 cursor-pointer rounded-lg mx-1 my-0.5 transition-colors ${
                        i === highlightIdx ? 'bg-[#D6E4D9]' : 'hover:bg-[#D6E4D9]/30'
                      }`}
                    >
                      <div className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${searchStatusDot(g)}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-sm font-medium text-[#1A1A1A]">{g.fullName}</span>
                          <span className="text-sm text-gray-500">{g.country}</span>
                          <span className="text-xs text-gray-400 font-mono" title={g.referenceNumber}>{shortenRef(g.referenceNumber)}</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span>{g.placedLocation ?? 'No location'}</span>
                          {g.roomAssignment && (
                            <>
                              <span className="text-gray-300">→</span>
                              <span>{g.roomAssignment}</span>
                            </>
                          )}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          Arrives: {fmtDate(g.arrivalTime)} &nbsp;|&nbsp; Departs: {fmtDate(g.departureTime)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── ⚠️ Needs Attention ──────────────────────────────────────────────── */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <h2 className="text-sm font-semibold text-[#1A1A1A]">Needs Attention</h2>
              </div>
              {hasUrgentItems ? (
                <div className="flex gap-4">
                  {arrivingTodayNoRoom > 0 && (
                    <button
                      onClick={() => navigate('/dept/incoming')}
                      className="flex-1 bg-red-50 border border-red-200 rounded-xl p-4 text-left hover:bg-red-100 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-red-700">
                            {arrivingTodayNoRoom} guest{arrivingTodayNoRoom !== 1 ? 's' : ''} arriving TODAY with no room
                          </p>
                          <p className="text-xs text-red-500 mt-0.5">Click to view Incoming Guests</p>
                        </div>
                      </div>
                    </button>
                  )}
                  {arrivingTomorrowNoRoom > 0 && (
                    <button
                      onClick={() => navigate('/dept/incoming')}
                      className="flex-1 bg-amber-50 border border-amber-200 rounded-xl p-4 text-left hover:bg-amber-100 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <Clock className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-amber-700">
                            {arrivingTomorrowNoRoom} guest{arrivingTomorrowNoRoom !== 1 ? 's' : ''} arriving TOMORROW with no room
                          </p>
                          <p className="text-xs text-amber-500 mt-0.5">Click to view Incoming Guests</p>
                        </div>
                      </div>
                    </button>
                  )}
                  {roomsAvailableSoon > 0 && (
                    <div className="flex-1 bg-blue-50 border border-blue-200 rounded-xl p-4">
                      <div className="flex items-start gap-3">
                        <BedDouble className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-blue-700">
                            {roomsAvailableSoon} room{roomsAvailableSoon !== 1 ? 's' : ''} becoming available {roomsAvailableSoon === 1 ? '' : 'soon'}
                          </p>
                          <p className="text-xs text-blue-500 mt-0.5">Available today or tomorrow</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
                  <p className="text-sm font-medium text-green-700">All clear — no urgent items</p>
                </div>
              )}
            </div>

            {/* ── Action Cards ─────────────────────────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-4">
              <button
                onClick={() => navigate('/dept/incoming')}
                className="bg-white rounded-xl border border-[#E8E3DB] p-5 text-left hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
                    <Inbox className="w-5 h-5 text-amber-600" />
                  </div>
                  <span className="text-2xl font-bold text-amber-600">{incomingGuests.length}</span>
                </div>
                <p className="text-sm font-medium text-[#1A1A1A]">Incoming</p>
                <p className="text-xs text-[#4A4A4A] mt-0.5">Awaiting placement</p>
              </button>

              <button
                onClick={() => navigate('/dept/placed')}
                className="bg-white rounded-xl border border-[#E8E3DB] p-5 text-left hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  </div>
                  <span className="text-2xl font-bold text-green-600">{placedGuests.length}</span>
                </div>
                <p className="text-sm font-medium text-[#1A1A1A]">Placed</p>
                <p className="text-xs text-[#4A4A4A] mt-0.5">Location assigned</p>
              </button>

              <div className="bg-white rounded-xl border border-[#E8E3DB] p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                    <Users className="w-5 h-5 text-gray-500" />
                  </div>
                  <span className="text-2xl font-bold text-gray-600">{deptGuests.length}</span>
                </div>
                <p className="text-sm font-medium text-[#1A1A1A]">Total</p>
                <p className="text-xs text-[#4A4A4A] mt-0.5">All assigned guests</p>
              </div>
            </div>

            {/* ── 📊 Location Occupancy ────────────────────────────────────────────── */}
            {occupancyData.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart2 className="w-4 h-4 text-[#2D5A45]" />
                  <h2 className="text-sm font-semibold text-[#1A1A1A]">Location Occupancy</h2>
                </div>
                <div className="space-y-4">
                  {occupancyData.map(loc => {
                    const pct = loc.totalBeds > 0 ? Math.round((loc.occupiedBeds / loc.totalBeds) * 100) : 0;
                    const isFull = pct >= 100;
                    return (
                      <div key={loc.locationName} className="flex items-center gap-4">
                        <span className="text-sm text-[#1A1A1A] w-28 shrink-0 font-medium truncate">{loc.locationName}</span>
                        <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-3 rounded-full transition-all duration-500 ${occupancyBarColor(pct)}`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm text-[#4A4A4A] whitespace-nowrap">
                            {loc.occupiedBeds}/{loc.totalBeds} beds ({pct}%)
                          </span>
                          {isFull && (
                            <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
                              FULL
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── 🚗 Driver Summary ────────────────────────────────────────────────── */}
            {driverSummary.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Car className="w-4 h-4 text-[#2D5A45]" />
                    <h2 className="text-sm font-semibold text-[#1A1A1A]">Drivers — {dept}</h2>
                  </div>
                  <button onClick={() => navigate('/dept/drivers')}
                    className="text-xs text-[#2D5A45] hover:underline flex items-center gap-1">
                    View All Drivers <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {driverSummary.map(loc => (
                    <div key={loc.location} className="bg-white border border-gray-200 rounded-xl p-4 hover:border-[#2D5A45]/50 transition-colors">
                      <p className="font-semibold text-[#1A1A1A] text-sm mb-1">{loc.location}</p>
                      <p className="text-xs text-[#4A4A4A] mb-2">{loc.total} driver{loc.total !== 1 ? 's' : ''}</p>
                      <div className="space-y-0.5 text-xs">
                        {loc.available > 0 && (
                          <div className="flex items-center gap-1.5 text-green-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block shrink-0" />
                            {loc.available} available
                          </div>
                        )}
                        {loc.busy > 0 && (
                          <div className="flex items-center gap-1.5 text-blue-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block shrink-0" />
                            {loc.busy} on task
                          </div>
                        )}
                        {loc.offDuty > 0 && (
                          <div className="flex items-center gap-1.5 text-amber-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block shrink-0" />
                            {loc.offDuty} off duty
                          </div>
                        )}
                      </div>
                      <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-[#4A4A4A]">
                        <span>Today: <span className="font-medium text-[#1A1A1A]">{loc.tasksToday}</span> task{loc.tasksToday !== 1 ? 's' : ''}</span>
                        {loc.unassigned > 0 && (
                          <span className="ml-2 text-amber-600 font-medium">⚠️ {loc.unassigned} unassigned</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {totalUnassignedTasks > 0 && (
                  <div className="mt-3 flex items-center justify-between text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <span>⚠️ {totalUnassignedTasks} unassigned task{totalUnassignedTasks !== 1 ? 's' : ''} today</span>
                    <button onClick={() => navigate('/dept/drivers')}
                      className="text-xs text-[#2D5A45] hover:underline flex items-center gap-1 font-medium">
                      View All Drivers <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── 📅 Upcoming Arrivals & Departures ───────────────────────────────── */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <CalendarDays className="w-4 h-4 text-[#2D5A45]" />
                <h2 className="text-sm font-semibold text-[#1A1A1A]">Upcoming Arrivals &amp; Departures — Next 7 Days</h2>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#E8E3DB]">
                    <th className="text-left pb-2 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Date</th>
                    <th className="text-left pb-2 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Day</th>
                    <th className="text-center pb-2 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">↓ Arriving</th>
                    <th className="text-center pb-2 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">↑ Departing</th>
                    <th className="text-center pb-2 text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E3DB]">
                  {dailyStats.map(({ dayStr, arriving, departing, net }) => {
                    const isToday = dayStr === todayStr;
                    const dateObj = new Date(dayStr + 'T00:00:00');
                    const dateLabel = dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                    const dayLabel  = dateObj.toLocaleDateString('en-GB', { weekday: 'short' });
                    return (
                      <tr
                        key={dayStr}
                        className={isToday ? 'bg-[#D6E4D9]/30' : 'hover:bg-[#F9F8F6]'}
                      >
                        <td className={`py-2.5 pr-4 text-sm ${isToday ? 'font-semibold text-[#1A1A1A]' : 'text-[#1A1A1A]'}`}>
                          {dateLabel}
                          {isToday && <span className="ml-2 text-xs bg-[#2D5A45] text-white px-1.5 py-0.5 rounded">Today</span>}
                        </td>
                        <td className={`py-2.5 pr-4 text-sm ${isToday ? 'font-semibold text-[#4A4A4A]' : 'text-[#4A4A4A]'}`}>{dayLabel}</td>
                        <td className="py-2.5 text-center">
                          <span className={`text-sm font-medium ${arriving > 0 ? 'text-green-600' : 'text-gray-300'}`}>
                            {arriving > 0 ? `↓ ${arriving}` : '—'}
                          </span>
                        </td>
                        <td className="py-2.5 text-center">
                          <span className={`text-sm font-medium ${departing > 0 ? 'text-red-500' : 'text-gray-300'}`}>
                            {departing > 0 ? `↑ ${departing}` : '—'}
                          </span>
                        </td>
                        <td className="py-2.5 text-center">
                          <span className={`text-sm font-medium ${net > 0 ? 'text-green-600' : net < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                            {net > 0 ? `+${net}` : net === 0 ? '0' : net}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Location Cards ───────────────────────────────────────────────────── */}
            {locations.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="w-4 h-4 text-[#2D5A45]" />
                  <h2 className="text-sm font-semibold text-[#1A1A1A]">Locations</h2>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {locations.map(loc => {
                    const locGuests   = deptGuests.filter(g => g.placedLocation === loc);
                    const occ         = occupancyData.find(o => o.locationName === loc);
                    const borderColor = locGuests.length > 0 ? 'border-l-green-500' : 'border-l-amber-400';
                    return (
                      <div
                        key={loc}
                        className={`bg-white rounded-xl border border-[#E8E3DB] border-l-4 ${borderColor} p-4 hover:shadow-sm transition-shadow`}
                      >
                        <p className="text-sm font-semibold text-[#1A1A1A] mb-2">{loc}</p>
                        <div className="text-xs text-[#4A4A4A] space-y-0.5">
                          <div><span className="font-semibold text-[#1A1A1A]">{locGuests.length}</span> placed</div>
                          {occ && occ.totalBeds > 0 && (
                            <div>
                              <span className="font-semibold text-[#1A1A1A]">{occ.occupiedBeds}</span>
                              /{occ.totalBeds} beds
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Bottom row: Recent Activity + Quick Actions ──────────────────────── */}
            <div className="grid lg:grid-cols-5 gap-6">
              <div className="lg:col-span-3">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-[#2D5A45]" />
                  <h2 className="text-sm font-semibold text-[#1A1A1A]">Recent Activity</h2>
                </div>
                <div className="bg-white rounded-xl border border-[#E8E3DB] overflow-hidden">
                  {recentActivity.length === 0 ? (
                    <div className="p-8 text-center">
                      <Clock className="w-10 h-10 mx-auto mb-3 text-[#D4CFC7]" />
                      <p className="text-sm font-medium text-[#1A1A1A] mb-1">No activity yet</p>
                      <p className="text-xs text-[#4A4A4A]">Guests assigned to your department will appear here.</p>
                    </div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-[#E8E3DB] bg-[#F9F8F6]">
                          <th className="text-left px-4 py-3 text-sm font-semibold text-[#4A4A4A] uppercase tracking-wider">Name</th>
                          <th className="text-left px-4 py-3 text-sm font-semibold text-[#4A4A4A] uppercase tracking-wider">Country</th>
                          <th className="text-left px-4 py-3 text-sm font-semibold text-[#4A4A4A] uppercase tracking-wider">Status</th>
                          <th className="text-left px-4 py-3 text-sm font-semibold text-[#4A4A4A] uppercase tracking-wider">Location</th>
                          <th className="text-left px-4 py-3 text-sm font-semibold text-[#4A4A4A] uppercase tracking-wider">Assigned</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E8E3DB]">
                        {recentActivity.map(g => (
                          <tr key={g.id} className="hover:bg-[#F9F8F6]">
                            <td className="px-4 py-3">
                              <span className="font-medium text-[#1A1A1A] text-sm">{g.fullName}</span>
                            </td>
                            <td className="px-4 py-3 text-[#4A4A4A] text-sm">{g.country}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusBadgeClass(g.status)}`}>
                                {g.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {g.placedLocation
                                ? <span className="text-[#4A4A4A]">{g.placedLocation}</span>
                                : <span className="text-amber-600 font-medium">Unplaced</span>}
                            </td>
                            <td className="px-4 py-3 text-[#4A4A4A] text-sm">
                              {g.assignedDepartmentAt
                                ? new Date(g.assignedDepartmentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              <div className="lg:col-span-2">
                <div className="flex items-center gap-2 mb-3">
                  <ArrowRight className="w-4 h-4 text-[#2D5A45]" />
                  <h2 className="text-sm font-semibold text-[#1A1A1A]">Quick Actions</h2>
                </div>
                <div className="bg-white border border-[#E8E3DB] rounded-xl overflow-hidden">
                  {quickActions.map((action, index) => (
                    <button
                      key={index}
                      onClick={() => navigate(action.href)}
                      className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#F5F0E8] transition-colors border-b border-[#E8E3DB] last:border-b-0 text-left"
                    >
                      <div className="flex items-center gap-3">
                        <action.icon className="w-5 h-5 text-[#4A4A4A]" />
                        <span className="text-sm text-[#1A1A1A]">{action.label}</span>
                      </div>
                      <ArrowRight className="w-4 h-4 text-[#4A4A4A]" />
                    </button>
                  ))}
                </div>
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
