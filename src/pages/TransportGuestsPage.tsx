/**
 * /transport/guests — Guest Assignments for Transport Department Head.
 * Shows all guests assigned to this transport department with driver assignment.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Loader2, ChevronDown, ChevronRight, Phone, AlertTriangle, Plane, Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { TransportSidebar } from '@/components/TransportSidebar';
import { TopBar } from '@/components/TopBar';
import { supabase } from '@/lib/supabase';
import { CreateTaskDialog } from '@/components/CreateTaskDialog';
import type { DriverInfo } from '@/components/CreateTaskDialog';
import type { DriverTask } from '@/types';

// ── helpers ───────────────────────────────────────────────────────────────────

function todayStr() { return new Date().toISOString().split('T')[0]; }

function fmtDateTime(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : iso + 'T00:00:00');
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function fmtDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso.includes('T') ? iso : iso + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: '2-digit',
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface GuestRow {
  id: string;
  full_name: string;
  country?: string;
  designation?: string | string[];
  tier?: string;
  photo_url?: string;
  contact_number?: string;
  arrival_time?: string;
  departure_time?: string;
  arrival_flight_number?: string;
  departure_flight_number?: string;
  arrival_airport?: string;
  departure_airport?: string;
  arrival_terminal?: string;
  departure_terminal?: string;
  location?: string;
  accommodation_department?: string;
  transport_department_id?: string;
  reference_number?: string;
  family_group_id?: string | null;
  relationship?: string | null;
  is_head_of_family?: boolean | null;
}

interface DriverRow extends DriverInfo {
  is_available?: boolean;
  todayTaskCount?: number;
  activeTaskLabel?: string;
}

type AvailStatus = 'available' | 'on_task' | 'off_duty' | 'unknown';

function driverAvailStatus(d: DriverRow): AvailStatus {
  if (d.activeTaskLabel) return 'on_task';
  if (d.is_available === true) return 'available';
  if (d.is_available === false) return 'off_duty';
  return 'unknown';
}

const STATUS_DOT: Record<AvailStatus, string> = {
  available: 'bg-green-500',
  on_task:   'bg-blue-500',
  off_duty:  'bg-amber-500',
  unknown:   'bg-gray-400',
};

const STATUS_LABEL_MAP: Record<AvailStatus, string> = {
  available: 'Available',
  on_task:   'On Task',
  off_duty:  'Off Duty',
  unknown:   'Unknown',
};

const TIER_BADGE: Record<string, string> = {
  '1(a)': 'bg-red-100 text-red-700',
  '1(b)': 'bg-purple-100 text-purple-700',
  '2':    'bg-amber-100 text-amber-700',
  '3':    'bg-blue-100 text-blue-700',
  '4':    'bg-gray-100 text-gray-600',
  '5':    'bg-gray-50 text-gray-500',
};

// ── Assign Driver Dropdown ────────────────────────────────────────────────────

function AssignDropdown({
  guestId,
  guestName,
  taskType,
  drivers,
  tasks,
  onAssigned,
}: {
  guestId: string;
  guestName: string;
  taskType: 'airport_pickup' | 'airport_dropoff';
  drivers: DriverRow[];
  tasks: DriverTask[];
  onAssigned: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const existingTask = tasks.find(t => t.guest_id === guestId && t.task_type === taskType);
  const assigned = existingTask?.driver_id
    ? drivers.find(d => d.id === existingTask.driver_id)
    : null;

  const handleSelect = async (driver: DriverRow) => {
    setSaving(true);
    setOpen(false);
    try {
      if (existingTask) {
        await supabase
          .from('driver_tasks')
          .update({ driver_id: driver.id, driver_name: driver.name, status: 'pending' })
          .eq('id', existingTask.id);
      } else {
        toast.warning('No suggested task found — create one from Actions first');
        setSaving(false);
        return;
      }
      toast.success(`${driver.name} assigned to ${guestName}`);
      onAssigned();
    } catch {
      toast.error('Failed to assign driver');
    } finally {
      setSaving(false);
    }
  };

  if (assigned) {
    return (
      <span className="flex items-center gap-1 text-xs text-green-700 font-medium">
        <span className="w-2 h-2 bg-green-500 rounded-full" />
        {assigned.name}
      </span>
    );
  }

  if (!existingTask) {
    return <span className="text-xs text-[#4A4A4A] italic">No task</span>;
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        disabled={saving}
        className="flex items-center gap-1 text-xs font-medium px-2 py-1 bg-amber-50 border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-100"
      >
        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <><AlertTriangle className="w-3 h-3" />No driver<ChevronDown className="w-3 h-3" /></>}
      </button>

      {open && (
        <div className="absolute left-0 mt-1 w-72 bg-white rounded-xl border border-[#E8E3DB] shadow-lg z-50 py-1 max-h-64 overflow-y-auto">
          {drivers.map(d => {
            const s = driverAvailStatus(d);
            return (
              <button
                key={d.id}
                onClick={() => handleSelect(d)}
                className="w-full text-left px-3 py-2 hover:bg-[#F5F0E8] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[s]}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#1A1A1A]">{d.name}</p>
                    <p className="text-xs text-[#4A4A4A] truncate">
                      {d.vehicle_type && `${d.vehicle_type}`}
                      {d.vehicle_capacity ? ` · ${d.vehicle_capacity} pax` : ''}
                      {' · '}{STATUS_LABEL_MAP[s]}
                      {(d.todayTaskCount ?? 0) > 0 ? ` — ${d.todayTaskCount} tasks today` : ''}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function TransportGuestsPage() {
  const { user } = useAuth();

  const [guests, setGuests]   = useState<GuestRow[]>([]);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [tasks, setTasks]     = useState<DriverTask[]>([]);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState('');
  const [accomFilter, setAccomFilter]   = useState('');
  const [search, setSearch]             = useState('');

  const [createOpen, setCreateOpen]     = useState(false);
  const [createTaskType, setCreateTaskType] = useState<'airport_pickup' | 'airport_dropoff'>('airport_pickup');
  const [createGuestId, setCreateGuestId]   = useState('');
  const [createDriverId, setCreateDriverId] = useState('');

  const loadedRef = useRef(false);
  const today = todayStr();

  const fetchAll = useCallback(async () => {
    if (!user?.transportDepartmentId) return;
    const tdId = user.transportDepartmentId;

    try {
      const [guestsRes, driversRes, tasksRes, activeTasksRes] = await Promise.all([
        supabase.from('guests').select('*').eq('transport_department_id', tdId).order('full_name'),
        supabase.from('users').select('*').eq('role', 'driver').eq('transport_department_id', tdId).order('name'),
        supabase.from('driver_tasks').select('*').eq('transport_department_id', tdId).not('status', 'in', '("cancelled","completed")'),
        supabase.from('driver_tasks').select('driver_id,guest_name').eq('transport_department_id', tdId).eq('status', 'in_progress'),
      ]);

      const guestRows  = (guestsRes.data  ?? []) as GuestRow[];
      const driverRows = (driversRes.data ?? []) as DriverRow[];
      const taskRows   = (tasksRes.data   ?? []) as DriverTask[];
      const activeRows = (activeTasksRes.data ?? []) as { driver_id: string | null; guest_name: string | null }[];

      // Build today task counts + active task label per driver
      const countMap: Record<string, number> = {};
      const activeMap: Record<string, string> = {};
      for (const t of taskRows) {
        if (t.driver_id && t.scheduled_date === today) {
          countMap[t.driver_id] = (countMap[t.driver_id] ?? 0) + 1;
        }
      }
      for (const a of activeRows) {
        if (a.driver_id) activeMap[a.driver_id] = a.guest_name ?? 'guest';
      }

      setGuests(guestRows);
      setTasks(taskRows);
      setDrivers(driverRows.map(d => ({
        ...d,
        todayTaskCount: countMap[d.id] ?? 0,
        activeTaskLabel: activeMap[d.id],
      })));
    } catch {
      // best-effort
    } finally {
      setLoading(false);
    }
  }, [user?.transportDepartmentId, today]);

  useEffect(() => {
    if (!user?.transportDepartmentId || loadedRef.current) return;
    loadedRef.current = true;
    fetchAll();
  }, [user?.transportDepartmentId, fetchAll]);

  // Accommodation options
  const accomOptions = useMemo(() => {
    const set = new Set<string>();
    for (const g of guests) { if (g.accommodation_department) set.add(g.accommodation_department); }
    return [...set].sort();
  }, [guests]);

  // Batch pickup detection: guests arriving same flight + same date
  const batchGroups = useMemo(() => {
    const map: Record<string, GuestRow[]> = {};
    for (const g of guests) {
      if (!g.arrival_flight_number || !g.arrival_time) continue;
      const date = g.arrival_time.substring(0, 10);
      const key = `${g.arrival_flight_number}|${date}`;
      if (!map[key]) map[key] = [];
      map[key].push(g);
    }
    return Object.entries(map).filter(([, gs]) => gs.length >= 2);
  }, [guests]);

  // Filtered guests
  const filtered = useMemo(() => {
    let rows = [...guests];

    if (statusFilter === 'has-driver') {
      rows = rows.filter(g => tasks.some(t => t.guest_id === g.id && t.driver_id));
    } else if (statusFilter === 'no-driver') {
      rows = rows.filter(g => !tasks.some(t => t.guest_id === g.id && t.driver_id));
    }

    if (accomFilter) {
      rows = rows.filter(g => g.accommodation_department === accomFilter);
    }

    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(g =>
        g.full_name.toLowerCase().includes(q) ||
        (g.country ?? '').toLowerCase().includes(q) ||
        (g.arrival_flight_number ?? '').toLowerCase().includes(q) ||
        (g.departure_flight_number ?? '').toLowerCase().includes(q),
      );
    }

    return rows;
  }, [guests, tasks, statusFilter, accomFilter, search]);

  // Sort family members adjacent, then build group meta
  const sortedFiltered = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const keyA = a.family_group_id ?? a.id;
      const keyB = b.family_group_id ?? b.id;
      if (keyA !== keyB) return keyA.localeCompare(keyB);
      // Head first within group
      if (a.is_head_of_family && !b.is_head_of_family) return -1;
      if (!a.is_head_of_family && b.is_head_of_family) return 1;
      return a.full_name.localeCompare(b.full_name);
    });
  }, [filtered]);

  const groupMeta = useMemo(() => {
    const counts = new Map<string, number>();
    const firstId = new Map<string, string>();
    const lastNames = new Map<string, string>();
    for (const g of sortedFiltered) {
      if (!g.family_group_id) continue;
      const prev = counts.get(g.family_group_id) ?? 0;
      counts.set(g.family_group_id, prev + 1);
      if (prev === 0) {
        firstId.set(g.family_group_id, g.id);
        const ln = g.full_name.split(' ').pop() ?? g.full_name;
        lastNames.set(g.family_group_id, ln);
      }
    }
    return { counts, firstId, lastNames };
  }, [sortedFiltered]);

  const [expandedFamilyIds, setExpandedFamilyIds] = useState<Set<string>>(new Set());

  const getPickupTask = (guestId: string) =>
    tasks.find(t => t.guest_id === guestId && t.task_type === 'airport_pickup');

  const getDropoffTask = (guestId: string) =>
    tasks.find(t => t.guest_id === guestId && t.task_type === 'airport_dropoff');

  const openCreateTask = (guestId: string, taskType: 'airport_pickup' | 'airport_dropoff') => {
    setCreateGuestId(guestId);
    setCreateDriverId('');
    setCreateTaskType(taskType);
    setCreateOpen(true);
  };

  const handleBatchPickup = async (guestGroup: GuestRow[]) => {
    if (!guestGroup[0]?.arrival_flight_number) return;
    const lead = guestGroup[0];
    const cap = Math.max(...drivers.map(d => d.vehicle_capacity ?? 0), 0);
    if (cap > 0 && guestGroup.length > cap) {
      toast.warning(`${guestGroup.length} guests exceed max vehicle capacity (${cap} pax). You may need multiple vehicles.`);
    }
    // Pre-fill create task dialog for first guest; head can adjust
    setCreateGuestId(lead.id);
    setCreateTaskType('airport_pickup');
    setCreateDriverId('');
    setCreateOpen(true);
  };

  const desigArray = (d?: string | string[]) =>
    d ? (Array.isArray(d) ? d : [d]) : [];

  const tierBadge = (tier?: string) => {
    if (!tier) return null;
    const cls = TIER_BADGE[tier] ?? 'bg-gray-100 text-gray-600';
    return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${cls}`}>T{tier}</span>;
  };

  return (
    <div className="flex min-h-screen bg-[#F5F0E8]">
      <TransportSidebar />

      <main className="ml-64 flex-1">
        <TopBar />
        <div className="p-8">

          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-[#1A1A1A] flex items-center gap-2">
              Guest Assignments
              <span className="text-base font-normal text-[#4A4A4A]">
                — {user?.transportDepartmentName ?? 'Transport Department'}
              </span>
              <span className="text-sm font-bold bg-[#2D5A45] text-white px-2 py-0.5 rounded-full">{guests.length}</span>
            </h1>
            <p className="text-sm text-[#4A4A4A] mt-0.5">All guests assigned to your transport department</p>
          </div>

          {/* Batch pickup banners */}
          {batchGroups.map(([key, group]) => {
            const [flight] = key.split('|');
            const date = group[0].arrival_time?.substring(0, 10);
            return (
              <div key={key} className="mb-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Plane className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-800">
                    {group.length} guests arriving on {flight}
                    {date ? ` (${fmtDate(date)})` : ''}
                    — consider batch pickup
                  </span>
                </div>
                <button
                  onClick={() => handleBatchPickup(group)}
                  className="text-xs font-medium px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Create Batch Pickup
                </button>
              </div>
            );
          })}

          {/* Filter row */}
          <div className="flex items-center gap-3 mb-4">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#2D5A45]"
            >
              <option value="">All Status</option>
              <option value="has-driver">Has Driver</option>
              <option value="no-driver">No Driver</option>
            </select>

            <select
              value={accomFilter}
              onChange={e => setAccomFilter(e.target.value)}
              className="border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#2D5A45]"
            >
              <option value="">All Accommodation</option>
              {accomOptions.map(o => <option key={o} value={o}>{o}</option>)}
            </select>

            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search guests, countries, flights…"
                className="w-full pl-9 pr-3 py-2 border border-[#E8E3DB] rounded-lg text-sm bg-white focus:outline-none focus:border-[#2D5A45]"
              />
            </div>

            <span className="text-sm text-[#4A4A4A] ml-auto">{filtered.length} shown</span>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-[#E8E3DB] shadow-sm overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-[#4A4A4A]">
                <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading guests…
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-center py-16 text-sm text-[#4A4A4A]">No guests match filters.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#E8E3DB] bg-[#F5F0E8]/50">
                      {['Name', 'Country', 'Designation', 'Tier', 'Accommodation', 'Location', 'Arrival', 'Departure', 'Pickup Driver', 'Actions'].map(h => (
                        <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E3DB]">
                    {sortedFiltered.map(g => {
                      const familyKey = g.family_group_id ?? null;
                      const groupCount = familyKey ? (groupMeta.counts.get(familyKey) ?? 0) : 0;
                      const isFirstInGroup = !!familyKey && groupMeta.firstId.get(familyKey) === g.id;
                      const lastName = groupMeta.lastNames.get(familyKey ?? '') ?? '';
                      const pickupTask  = getPickupTask(g.id);
                      const dropoffTask = getDropoffTask(g.id);
                      const desigs = desigArray(g.designation);
                      const tier = (g as { tier?: string }).tier;
                      const relationship = g.is_head_of_family ? 'Head' : (g.relationship || 'Family');

                      return (
                      <Fragment key={g.id}>
                        {isFirstInGroup && groupCount > 1 && (
                          <tr
                            className="bg-[#F0F7F4] border-b border-[#D4E9DC] cursor-pointer hover:bg-[#E8F5EE] select-none"
                            onClick={() => setExpandedFamilyIds(prev => {
                              const next = new Set(prev);
                              next.has(familyKey!) ? next.delete(familyKey!) : next.add(familyKey!);
                              return next;
                            })}
                          >
                            <td colSpan={10} className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <ChevronRight className={`w-3.5 h-3.5 text-[#2D5A45] transition-transform duration-200 shrink-0 ${expandedFamilyIds.has(familyKey!) ? 'rotate-90' : ''}`} />
                                <Users className="w-3.5 h-3.5 text-[#2D5A45] shrink-0" />
                                <span className="text-xs text-[#2D5A45] font-semibold">
                                  {lastName} Family · {groupCount} members
                                </span>
                                <span className="text-xs text-[#4A4A4A]">
                                  {expandedFamilyIds.has(familyKey!) ? '— click to collapse' : '— click to expand'}
                                </span>
                              </div>
                            </td>
                          </tr>
                        )}
                        {(!familyKey || groupCount <= 1 || expandedFamilyIds.has(familyKey)) && (
                        <tr className={`hover:bg-[#F5F0E8]/50 transition-colors ${familyKey && groupCount > 1 ? 'border-l-4 border-[#2D5A45]/20' : ''}`}>
                          {/* Name + photo */}
                          <td className="px-3 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              {(g as { photo_url?: string }).photo_url ? (
                                <img src={(g as { photo_url?: string }).photo_url} alt={g.full_name}
                                  className="w-6 h-6 rounded-full object-cover shrink-0" />
                              ) : (
                                <div className="w-6 h-6 bg-[#2D5A45]/10 rounded-full flex items-center justify-center shrink-0">
                                  <span className="text-[#2D5A45] text-[10px] font-semibold">{g.full_name.charAt(0)}</span>
                                </div>
                              )}
                              <div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className="font-medium text-[#1A1A1A] whitespace-nowrap">{g.full_name}</p>
                                  {familyKey && groupCount > 1 && (
                                    <span className="text-[10px] text-[#4A4A4A] bg-[#F0F7F4] border border-[#D4E9DC] rounded px-1 py-0.5">
                                      {relationship}
                                    </span>
                                  )}
                                </div>
                                {g.contact_number && (
                                  <a href={`tel:${g.contact_number}`}
                                    className="flex items-center gap-1 text-[10px] text-[#2D5A45] hover:underline">
                                    <Phone className="w-2.5 h-2.5" />{g.contact_number}
                                  </a>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Country */}
                          <td className="px-3 py-3 whitespace-nowrap text-[#4A4A4A]">{g.country ?? '—'}</td>

                          {/* Designation */}
                          <td className="px-3 py-3 max-w-[140px]">
                            {desigs.length === 0 ? (
                              <span className="text-[#4A4A4A]">—</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {desigs.slice(0, 2).map((d, i) => (
                                  <span key={i} className="text-[10px] font-medium bg-[#F5F0E8] text-[#4A4A4A] px-1.5 py-0.5 rounded truncate max-w-[100px]">{d}</span>
                                ))}
                                {desigs.length > 2 && <span className="text-[10px] text-[#4A4A4A]">+{desigs.length - 2}</span>}
                              </div>
                            )}
                          </td>

                          {/* Tier */}
                          <td className="px-3 py-3 whitespace-nowrap">
                            {tierBadge(tier) ?? <span className="text-[#4A4A4A]">—</span>}
                          </td>

                          {/* Accommodation */}
                          <td className="px-3 py-3 whitespace-nowrap text-[#4A4A4A] max-w-[120px] truncate">{g.accommodation_department ?? '—'}</td>

                          {/* Location */}
                          <td className="px-3 py-3 whitespace-nowrap text-[#4A4A4A]">{g.location ?? '—'}</td>

                          {/* Arrival */}
                          <td className="px-3 py-3 min-w-[130px]">
                            <div className="text-xs">
                              <p className="font-medium text-[#1A1A1A]">{fmtDateTime(g.arrival_time)}</p>
                              {g.arrival_flight_number && (
                                <p className="text-[#4A4A4A]">✈ {g.arrival_flight_number} {g.arrival_airport ? `· ${g.arrival_airport}` : ''}</p>
                              )}
                            </div>
                          </td>

                          {/* Departure */}
                          <td className="px-3 py-3 min-w-[110px]">
                            <div className="text-xs">
                              <p className="font-medium text-[#1A1A1A]">{fmtDateTime(g.departure_time)}</p>
                              {g.departure_flight_number && (
                                <p className="text-[#4A4A4A]">✈ {g.departure_flight_number}</p>
                              )}
                            </div>
                          </td>

                          {/* Pickup Driver */}
                          <td className="px-3 py-3 whitespace-nowrap">
                            <AssignDropdown
                              guestId={g.id}
                              guestName={g.full_name}
                              taskType="airport_pickup"
                              drivers={drivers}
                              tasks={tasks}
                              onAssigned={fetchAll}
                            />
                          </td>

                          {/* Actions */}
                          <td className="px-3 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              {!pickupTask && (
                                <button
                                  onClick={() => openCreateTask(g.id, 'airport_pickup')}
                                  className="text-[10px] font-medium px-2 py-1 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors whitespace-nowrap"
                                >
                                  + Pickup
                                </button>
                              )}
                              {!dropoffTask && (
                                <button
                                  onClick={() => openCreateTask(g.id, 'airport_dropoff')}
                                  className="text-[10px] font-medium px-2 py-1 bg-purple-50 border border-purple-200 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors whitespace-nowrap"
                                >
                                  + Drop-off
                                </button>
                              )}
                              {pickupTask && dropoffTask && (
                                <span className="text-[10px] text-green-600 font-medium">✓ Tasks set</span>
                              )}
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
        </div>
      </main>

      {/* Create Task Dialog */}
      {createOpen && (
        <CreateTaskDialog
          open={createOpen}
          onClose={() => { setCreateOpen(false); fetchAll(); }}
          drivers={drivers}
          preselectedDriverId={createDriverId || undefined}
          locationName={user?.location}
          departmentName={user?.transportDepartmentName}
          onCreated={() => { setCreateOpen(false); fetchAll(); }}
        />
      )}
    </div>
  );
}
