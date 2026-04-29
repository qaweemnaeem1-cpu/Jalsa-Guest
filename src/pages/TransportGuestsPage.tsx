/**
 * /transport/guests — Guest Assignments for Transport Department Head.
 * Shows all guests assigned to this transport department with driver assignment.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Loader2, ChevronDown, ChevronUp, ChevronRight, ChevronsUpDown, Phone, AlertTriangle, Plane, Users, Eye, Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { TransportSidebar } from '@/components/TransportSidebar';
import { TopBar } from '@/components/TopBar';
import { supabase } from '@/lib/supabase';
import { CreateTaskDialog } from '@/components/CreateTaskDialog';
import type { DriverInfo } from '@/components/CreateTaskDialog';
import { GuestViewModal } from '@/components/GuestViewModal';
import { rowToGuest } from '@/hooks/useGuests';
import type { Guest } from '@/types';
import type { DriverTask } from '@/types';
import { formatDateShort, formatTime } from '@/utils/dateHelpers';
import { useDesignations } from '@/hooks/useDesignations';
import { getTransportDeptBadgeClass } from '@/hooks/useTransportDepartments';
import { TIER_ORDER } from '@/lib/constants';

// ── helpers ───────────────────────────────────────────────────────────────────

function todayStr() { return new Date().toISOString().split('T')[0]; }

function fmtDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso.includes('T') ? iso : iso + 'T12:00:00').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: '2-digit',
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface GuestRow {
  id: string;
  full_name: string;
  country?: string;
  designation?: string | string[];
  photo_url?: string;
  contact_number?: string;
  arrival_date?: string;
  arrival_time?: string;
  departure_date?: string;
  departure_time?: string;
  arrival_flight_number?: string;
  flight_number?: string;
  departure_flight_number?: string;
  arrival_airport?: string;
  departure_airport?: string;
  arrival_terminal?: string;
  departure_terminal?: string;
  placed_location?: string;
  assigned_department?: string;
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

function shortenDeptName(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('jalsa') || n.includes('salana')) return 'JST';
  if (n.includes('reserve 1') || n.includes('reserve1')) return 'R1T';
  if (n.includes('central')) return 'CGT';
  if (n.includes('uk jamaat') || n.includes('jamaat')) return 'UKT';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3);
}

function StatusBadge({ status }: { status?: string }) {
  switch (status) {
    case 'in_progress': return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">🔵 In Progress</span>;
    case 'completed':   return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">✅ Done</span>;
    case 'cancelled':   return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">Cancelled</span>;
    default:            return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">⏳ Pending</span>;
  }
}

// ── Main page ──────────────────────────────────────────────────────────────────

export interface TransportGuestsPageProps {
  /** 'pickup' = Pick Up tab (airport_pickup, arrival columns)
   *  'dropoff' = Drop Off tab (airport_dropoff, departure columns)
   *  undefined = legacy combined view */
  mode?: 'pickup' | 'dropoff';
  /** 'admin' = Super Admin view (all transport depts, extra column, full tier badges, admin sidebar)
   *  default 'transport-head' = Transport Head view (scoped to user.transportDepartmentId) */
  variant?: 'transport-head' | 'admin';
  /** When true, renders only the main content (no sidebar wrapper). Used by AdminTransportPage
   *  which wraps the admin sidebar + tabs around this page. */
  hideSidebar?: boolean;
}

export default function TransportGuestsPage({ mode, variant = 'transport-head', hideSidebar = false }: TransportGuestsPageProps = {}) {
  const isPickup  = mode === 'pickup';
  const isDropoff = mode === 'dropoff';
  const isAdmin   = variant === 'admin';
  const { user } = useAuth();
  const { activeDesignations } = useDesignations();

  const [guests, setGuests]   = useState<GuestRow[]>([]);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [tasks, setTasks]     = useState<DriverTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewGuest, setViewGuest] = useState<Guest | null>(null);
  const [transportDepts, setTransportDepts] = useState<{ id: string; name: string }[]>([]);

  // Load transport departments (for admin filter dropdown + per-row badges)
  useEffect(() => {
    if (!isAdmin) return;
    supabase.from('transport_departments').select('id, name').order('name').then(({ data }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setTransportDepts((data ?? []) as any);
    });
  }, [isAdmin]);
  const [sortField, setSortField] = useState<'country' | 'location' | 'arrival' | 'departure'>(
    isDropoff ? 'departure' : 'arrival',
  );
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [showCompleted, setShowCompleted] = useState(true);
  const handleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDirection('asc'); }
  };

  // ── Bulk selection + bulk driver assign ──────────────────────────────────────
  const [selectedGuests, setSelectedGuests] = useState<string[]>([]);
  const [showBulkDriverDropdown, setShowBulkDriverDropdown] = useState(false);
  const bulkDropdownRef = useRef<HTMLDivElement | null>(null);

  // Reset selection whenever the tab (mode) changes
  useEffect(() => { setSelectedGuests([]); setShowBulkDriverDropdown(false); }, [mode]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showBulkDriverDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (bulkDropdownRef.current && !bulkDropdownRef.current.contains(e.target as Node)) {
        setShowBulkDriverDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showBulkDriverDropdown]);

  // Count passengers: a selected family head counts the entire family; otherwise 1.
  const totalSelectedPax = useMemo(() => {
    let n = 0;
    for (const id of selectedGuests) {
      const g = guests.find(gg => gg.id === id);
      if (!g) continue;
      if (g.is_head_of_family && g.family_group_id) {
        n += guests.filter(fg => fg.family_group_id === g.family_group_id).length;
      } else {
        n += 1;
      }
    }
    return n;
  }, [selectedGuests, guests]);

  const handleBulkDone = async () => {
    if (selectedGuests.length === 0) return;
    if (selectedGuests.length >= 5) {
      const proceed = window.confirm(`Mark ${selectedGuests.length} guests as done?`);
      if (!proceed) return;
    }
    const taskType: 'airport_pickup' | 'airport_dropoff' = isDropoff ? 'airport_dropoff' : 'airport_pickup';
    const now = new Date().toISOString();
    let successCount = 0;
    let errorCount = 0;

    for (const guestId of selectedGuests) {
      const guest = guests.find(gg => gg.id === guestId);
      if (!guest) continue;
      const existing = tasks.find(t => t.guest_id === guestId && t.task_type === taskType);

      if (existing) {
        const { error } = await supabase.from('driver_tasks').update({
          status: 'completed',
          completed_at: now,
        }).eq('id', existing.id);
        if (error) { console.error('[BulkDone] Update error:', error); errorCount++; }
        else successCount++;
      } else {
        const isPickupTask = !isDropoff;
        const pickupLoc = isPickupTask
          ? [guest.arrival_airport, guest.arrival_terminal].filter(Boolean).join(' ') || 'Airport'
          : (guest.placed_location || guest.assigned_department || 'TBD');
        const dropoffLoc = isPickupTask
          ? (guest.placed_location || guest.assigned_department || 'TBD')
          : [guest.departure_airport, guest.departure_terminal].filter(Boolean).join(' ') || 'Airport';
        const { error } = await supabase.from('driver_tasks').insert({
          guest_id: guest.id,
          guest_name: guest.full_name,
          task_type: taskType,
          pickup_location: pickupLoc,
          dropoff_location: dropoffLoc,
          scheduled_date: isPickupTask ? (guest.arrival_date ?? null) : (guest.departure_date ?? null),
          scheduled_time: isPickupTask ? (guest.arrival_time ?? null) : (guest.departure_time ?? null),
          flight_number: guest.arrival_flight_number ?? guest.flight_number ?? null,
          status: 'completed',
          completed_at: now,
          transport_department_id: user?.transportDepartmentId ?? null,
        });
        if (error) { console.error('[BulkDone] Insert error:', error); errorCount++; }
        else successCount++;
      }
    }

    setSelectedGuests([]);
    fetchAll();

    if (errorCount === 0) {
      toast.success(`${successCount} guest${successCount !== 1 ? 's' : ''} marked as done ✓`);
    } else {
      toast.error(`${successCount} done, ${errorCount} failed`);
    }
  };

  const handleBulkAssign = async (driver: DriverRow) => {
    const cap = driver.vehicle_capacity ?? 0;
    if (cap > 0 && totalSelectedPax > cap) {
      const proceed = window.confirm(
        `⚠️ ${totalSelectedPax} passengers but ${driver.name}'s vehicle has ${cap} seats. Assign anyway?`,
      );
      if (!proceed) return;
    }

    const taskType: 'airport_pickup' | 'airport_dropoff' = isDropoff ? 'airport_dropoff' : 'airport_pickup';
    let successCount = 0;
    let errorCount = 0;

    for (const guestId of selectedGuests) {
      const guest = guests.find(gg => gg.id === guestId);
      if (!guest) continue;
      const existing = tasks.find(t => t.guest_id === guestId && t.task_type === taskType);

      if (existing) {
        const { error } = await supabase.from('driver_tasks').update({
          driver_id: driver.id,
          driver_name: driver.name,
          status: existing.status === 'completed' ? 'completed' : 'pending',
        }).eq('id', existing.id);
        if (error) errorCount++; else successCount++;
      } else {
        const isPickupTask = !isDropoff;
        const pickupLoc = isPickupTask
          ? [guest.arrival_airport, guest.arrival_terminal].filter(Boolean).join(' ') || 'Airport'
          : (guest.placed_location || guest.assigned_department || 'TBD');
        const dropoffLoc = isPickupTask
          ? (guest.placed_location || guest.assigned_department || 'TBD')
          : [guest.departure_airport, guest.departure_terminal].filter(Boolean).join(' ') || 'Airport';
        const { error } = await supabase.from('driver_tasks').insert({
          guest_id: guest.id,
          guest_name: guest.full_name,
          driver_id: driver.id,
          driver_name: driver.name,
          task_type: taskType,
          pickup_location: pickupLoc,
          dropoff_location: dropoffLoc,
          scheduled_date: isPickupTask ? (guest.arrival_date ?? null) : (guest.departure_date ?? null),
          scheduled_time: isPickupTask ? (guest.arrival_time ?? null) : (guest.departure_time ?? null),
          flight_number: guest.arrival_flight_number ?? guest.flight_number ?? null,
          passenger_count: 1,
          status: 'pending',
          transport_department_id: user?.transportDepartmentId ?? null,
        });
        if (error) errorCount++; else successCount++;
      }
    }

    setSelectedGuests([]);
    setShowBulkDriverDropdown(false);
    fetchAll();

    if (errorCount === 0) {
      toast.success(`${driver.name} assigned to ${successCount} guest${successCount !== 1 ? 's' : ''}`);
    } else {
      toast.error(`Assigned ${successCount}, ${errorCount} failed`);
    }
  };

  const openViewGuest = async (guestId: string) => {
    const { data } = await supabase
      .from('guests')
      .select('*, family_members(*)')
      .eq('id', guestId)
      .maybeSingle();
    if (data) setViewGuest(rowToGuest(data));
  };

  const handleMarkDone = async (guest: GuestRow, taskType: 'airport_pickup' | 'airport_dropoff') => {
    console.log('[Done] Marking guest as done:', guest.full_name, guest.id, taskType);
    const existing = tasks.find(t => t.guest_id === guest.id && t.task_type === taskType);
    const now = new Date().toISOString();

    if (existing) {
      const { error } = await supabase.from('driver_tasks').update({
        status: 'completed',
        completed_at: now,
      }).eq('id', existing.id);
      console.log('[Done] Update result:', { error });
      if (error) { toast.error('Failed to mark as done: ' + error.message); return; }

      // Optimistic local state update — move the task to completed immediately
      setTasks(prev => prev.map(t =>
        t.id === existing.id ? { ...t, status: 'completed', completed_at: now } : t
      ));
    } else {
      // No task yet — create one already marked completed (no driver assigned is fine).
      const isPickupTask = taskType === 'airport_pickup';
      const flight = guest.arrival_flight_number ?? guest.flight_number ?? null;
      const pickupLoc  = isPickupTask
        ? [guest.arrival_airport, guest.arrival_terminal].filter(Boolean).join(' ') || 'Airport'
        : (guest.placed_location || guest.assigned_department || 'TBD');
      const dropoffLoc = isPickupTask
        ? (guest.placed_location || guest.assigned_department || 'TBD')
        : [guest.departure_airport, guest.departure_terminal].filter(Boolean).join(' ') || 'Airport';
      const { data, error } = await supabase.from('driver_tasks').insert({
        guest_id: guest.id,
        guest_name: guest.full_name,
        task_type: taskType,
        pickup_location: pickupLoc,
        dropoff_location: dropoffLoc,
        scheduled_date: isPickupTask ? (guest.arrival_date ?? null) : (guest.departure_date ?? null),
        scheduled_time: isPickupTask ? (guest.arrival_time ?? null) : (guest.departure_time ?? null),
        flight_number: flight,
        status: 'completed',
        completed_at: now,
        transport_department_id: user?.transportDepartmentId ?? null,
      }).select().single();
      console.log('[Done] Insert result:', { data, error });
      if (error) { toast.error('Failed to mark as done: ' + error.message); return; }
      if (data) setTasks(prev => [...prev, data as DriverTask]);
    }
    toast.success(`${guest.full_name} marked as done ✓`);
  };

  const handleUndoDone = async (taskId: string) => {
    console.log('[Undo] Deleting task so guest appears fresh in active:', taskId);
    const { error } = await supabase.from('driver_tasks').delete().eq('id', taskId);
    console.log('[Undo] Delete result:', { error });
    if (error) { toast.error('Failed to undo: ' + error.message); return; }
    setTasks(prev => prev.filter(t => t.id !== taskId));
    toast.info('Moved back to active');
  };

  const [statusFilter, setStatusFilter] = useState('');
  const [accomFilter, setAccomFilter]   = useState('');
  const [deptFilter,  setDeptFilter]    = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [search, setSearch]             = useState('');

  const [createOpen, setCreateOpen]     = useState(false);
  const [createTaskType, setCreateTaskType] = useState<'airport_pickup' | 'airport_dropoff'>('airport_pickup');
  const [createGuestId, setCreateGuestId]   = useState('');
  const [createDriverId, setCreateDriverId] = useState('');

  const loadedRef = useRef(false);
  const today = todayStr();

  const fetchAll = useCallback(async () => {
    if (!isAdmin && !user?.transportDepartmentId) return;
    const tdId = user?.transportDepartmentId;

    try {
      // Admin sees guests across ALL transport depts (but only guests that HAVE a transport
       // dept assigned — unassigned guests don't belong on this page).
       // Transport Head scoped to their transport dept.
      const guestsQ   = supabase.from('guests').select('*').order('full_name');
      const driversQ  = supabase.from('users').select('*').eq('role', 'driver').order('name');
      const tasksQ    = supabase.from('driver_tasks').select('*').neq('status', 'cancelled');
      const activeQ   = supabase.from('driver_tasks').select('driver_id,guest_name').eq('status', 'in_progress');
      if (!isAdmin && tdId) {
        guestsQ.eq('transport_department_id', tdId);
        driversQ.eq('transport_department_id', tdId);
        tasksQ.eq('transport_department_id', tdId);
        activeQ.eq('transport_department_id', tdId);
      } else if (isAdmin) {
        guestsQ.not('transport_department_id', 'is', null);
      }
      const [guestsRes, driversRes, tasksRes, activeTasksRes] = await Promise.all([guestsQ, driversQ, tasksQ, activeQ]);

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
  }, [user?.transportDepartmentId, today, isAdmin]);

  useEffect(() => {
    if (loadedRef.current) return;
    if (!isAdmin && !user?.transportDepartmentId) return;
    loadedRef.current = true;
    fetchAll();
  }, [user?.transportDepartmentId, fetchAll, isAdmin]);

  // Tier-per-guest: look up each guest's designations in the live-loaded designations list,
  // then pick the highest tier (1(a) > 1(b) > 2 > 3 > 4 > 5).
  const tierByGuestId = useMemo(() => {
    const nameToTier = new Map<string, string | null>();
    for (const d of activeDesignations) nameToTier.set(d.name, d.tier);
    const result: Record<string, string | undefined> = {};
    for (const g of guests) {
      const desigs = Array.isArray(g.designation) ? g.designation : (g.designation ? [g.designation] : []);
      let best: string | undefined;
      let bestIdx = Infinity;
      for (const n of desigs) {
        const t = nameToTier.get(n);
        if (!t) continue;
        const idx = TIER_ORDER.indexOf(t as typeof TIER_ORDER[number]);
        if (idx !== -1 && idx < bestIdx) { best = t; bestIdx = idx; }
      }
      if (best) result[g.id] = best;
    }
    // Diagnostic — remove once tiers are confirmed visible
    if (guests.length > 0 && activeDesignations.length > 0) {
      const sample = guests.slice(0, 3).map(g => ({
        name: g.full_name,
        designations: g.designation,
        resolvedTier: result[g.id],
      }));
      console.log('[TransportGuests] tier resolution sample:', sample,
        '— activeDesignations count:', activeDesignations.length);
    }
    return result;
  }, [guests, activeDesignations]);

  // Accommodation options (sourced from assigned_department column)
  const accomOptions = useMemo(() => {
    const set = new Set<string>();
    for (const g of guests) { if (g.assigned_department) set.add(g.assigned_department); }
    return [...set].sort();
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
      rows = rows.filter(g => g.assigned_department === accomFilter);
    }

    if (deptFilter) {
      rows = rows.filter(g => g.transport_department_id === deptFilter);
    }

    if (countryFilter) {
      rows = rows.filter(g => g.country === countryFilter);
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
  }, [guests, tasks, statusFilter, accomFilter, deptFilter, countryFilter, search]);

  // Sort by user-selected field while keeping family members adjacent to their head.
  const sortedFiltered = useMemo(() => {
    const getKey = (g: GuestRow): string => {
      switch (sortField) {
        case 'country':   return (g.country        ?? '').toLowerCase();
        case 'location':  return (g.placed_location ?? '').toLowerCase();
        case 'arrival':   return `${g.arrival_date   ?? '9999'}T${g.arrival_time   ?? '99:99'}`;
        case 'departure': return `${g.departure_date ?? '9999'}T${g.departure_time ?? '99:99'}`;
      }
    };
    const cmp = (a: string, b: string) => sortDirection === 'asc' ? a.localeCompare(b) : b.localeCompare(a);

    // Bucket non-head family members by their family_group_id
    const byFamily = new Map<string, GuestRow[]>();
    const leads: GuestRow[] = [];
    for (const g of filtered) {
      if (g.family_group_id && !g.is_head_of_family) {
        const arr = byFamily.get(g.family_group_id) ?? [];
        arr.push(g);
        byFamily.set(g.family_group_id, arr);
      } else {
        leads.push(g);
      }
    }
    leads.sort((a, b) => cmp(getKey(a), getKey(b)));
    const out: GuestRow[] = [];
    for (const head of leads) {
      out.push(head);
      if (head.family_group_id) {
        const members = [...(byFamily.get(head.family_group_id) ?? [])];
        members.sort((a, b) => a.full_name.localeCompare(b.full_name));
        out.push(...members);
      }
    }
    // Append any orphaned family rows (no head in the filter)
    for (const [gid, members] of byFamily) {
      if (!leads.some(l => l.family_group_id === gid && l.is_head_of_family)) out.push(...members);
    }
    return out;
  }, [filtered, sortField, sortDirection]);

  // Split into active vs completed based on the relevant task type
  const { activeGuests, completedGuests } = useMemo(() => {
    const taskType = isDropoff ? 'airport_dropoff' : 'airport_pickup';
    const active: GuestRow[] = [];
    const completed: GuestRow[] = [];
    for (const g of sortedFiltered) {
      const t = tasks.find(tt => tt.guest_id === g.id && tt.task_type === taskType);
      if (t?.status === 'completed') completed.push(g);
      else active.push(g);
    }
    return { activeGuests: active, completedGuests: completed };
  }, [sortedFiltered, tasks, isDropoff]);

  const groupMeta = useMemo(() => {
    const counts = new Map<string, number>();
    const firstId = new Map<string, string>();
    const lastNames = new Map<string, string>();
    for (const g of activeGuests) {
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
  }, [activeGuests]);

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

  const desigArray = (d?: string | string[]) =>
    d ? (Array.isArray(d) ? d : [d]) : [];

  const tierBadge = (tier?: string) => {
    if (!tier) return null;
    const cls = TIER_BADGE[tier] ?? 'bg-gray-100 text-gray-600';
    return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${cls}`}>T{tier}</span>;
  };

  return (
    <div className={hideSidebar ? '' : 'flex min-h-screen bg-[#F5F0E8]'}>
      {!hideSidebar && <TransportSidebar />}

      <main className={hideSidebar ? 'flex-1' : 'ml-64 flex-1'}>
        {!hideSidebar && <TopBar />}
        <div className={hideSidebar ? '' : 'p-8'}>


          {/* Header — hidden when embedded (AdminTransportPage renders its own) */}
          {!hideSidebar && (
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-[#1A1A1A] flex items-center gap-2">
                {isPickup ? 'Pick Up' : isDropoff ? 'Drop Off' : 'Guest Assignments'}
                <span className="text-base font-normal text-[#4A4A4A]">
                  — {isAdmin ? 'All Transport Departments' : (user?.transportDepartmentName ?? 'Transport Department')}
                </span>
                <span className="text-sm font-bold bg-[#2D5A45] text-white px-2 py-0.5 rounded-full">{guests.length}</span>
              </h1>
              <p className="text-sm text-[#4A4A4A] mt-0.5">
                {isPickup  && 'All guests needing pickup from the airport'}
                {isDropoff && 'All guests needing drop off to the airport'}
                {!isPickup && !isDropoff && 'All guests assigned to your transport department'}
              </p>
            </div>
          )}


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

            {isAdmin && (
              <>
                <select
                  value={deptFilter}
                  onChange={e => setDeptFilter(e.target.value)}
                  className="border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#2D5A45]"
                >
                  <option value="">All Transport Departments</option>
                  {transportDepts.map(td => <option key={td.id} value={td.id}>{td.name}</option>)}
                </select>
                <select
                  value={countryFilter}
                  onChange={e => setCountryFilter(e.target.value)}
                  className="border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#2D5A45]"
                >
                  <option value="">All Countries</option>
                  {[...new Set(guests.map(g => g.country).filter(Boolean))].sort().map(c => (
                    <option key={c} value={c!}>{c}</option>
                  ))}
                </select>
              </>
            )}

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

          {/* Bulk-assign bar (pickup / dropoff modes only) */}
          {(isPickup || isDropoff) && (
            <div className="flex items-center justify-between bg-white border border-[#E8E3DB] rounded-xl px-4 py-3 mb-4 shadow-sm">
              <span className="text-sm text-[#4A4A4A]">
                {selectedGuests.length > 0 ? (
                  <>
                    <span className="font-bold text-[#2D5A45]">{selectedGuests.length}</span>{' '}
                    guest{selectedGuests.length !== 1 ? 's' : ''} selected
                    {totalSelectedPax !== selectedGuests.length && (
                      <span className="text-gray-500"> ({totalSelectedPax} passengers total)</span>
                    )}
                  </>
                ) : 'Select guests to assign a driver or mark as done'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={selectedGuests.length < 1}
                  onClick={handleBulkDone}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    selectedGuests.length >= 1
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <Check className="w-4 h-4" />
                  Done
                </button>
                <div className="relative bulk-assign-dropdown" ref={bulkDropdownRef}>
                  <button
                    disabled={selectedGuests.length < 2}
                    onClick={() => setShowBulkDriverDropdown(v => !v)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      selectedGuests.length >= 2
                        ? 'bg-[#2D5A45] text-white hover:bg-[#234839]'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    <Users className="w-4 h-4" />
                    Assign Driver
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  {showBulkDriverDropdown && selectedGuests.length >= 2 && (
                    <div className="absolute right-0 top-full mt-1 bg-white border border-[#E8E3DB] rounded-xl shadow-lg z-50 w-80 py-2">
                      <div className="px-3 py-2 text-xs text-gray-400 uppercase font-semibold border-b border-[#E8E3DB]">
                        Assign {selectedGuests.length} guest{selectedGuests.length !== 1 ? 's' : ''} · {totalSelectedPax} pax to:
                      </div>
                      {drivers.length === 0 ? (
                        <p className="px-3 py-4 text-sm text-gray-400 text-center">No drivers</p>
                      ) : drivers.map(driver => {
                        const cap = driver.vehicle_capacity ?? 0;
                        const capacityOk = cap === 0 ? true : cap >= totalSelectedPax;
                        return (
                          <button
                            key={driver.id}
                            onClick={() => handleBulkAssign(driver)}
                            className="w-full text-left px-3 py-2.5 hover:bg-[#F5F0E8] flex items-center justify-between"
                          >
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-[#1A1A1A] flex items-center gap-2">
                                <span className="truncate">{driver.name}</span>
                                <span className={driver.is_available ? 'text-green-600' : 'text-blue-600'}>
                                  {driver.is_available ? '🟢' : '🔵'}
                                </span>
                              </div>
                              <div className="text-xs text-[#4A4A4A] truncate">
                                {[driver.vehicle_model, driver.vehicle_registration, cap ? `${cap} seats` : null].filter(Boolean).join(' · ')}
                              </div>
                            </div>
                            {cap > 0 && (
                              <span className={`text-xs font-medium whitespace-nowrap ml-2 ${capacityOk ? 'text-green-600' : 'text-red-500'}`}>
                                {totalSelectedPax} / {cap} pax{!capacityOk && ' ⚠️'}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                {selectedGuests.length > 0 && (
                  <button
                    onClick={() => setSelectedGuests([])}
                    className="px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}

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
                      {(isPickup || isDropoff) && (
                        <th className="w-10 px-3 py-3 text-left">
                          <input
                            type="checkbox"
                            checked={activeGuests.length > 0 && activeGuests.every(g => selectedGuests.includes(g.id))}
                            onChange={e => {
                              if (e.target.checked) setSelectedGuests(activeGuests.map(g => g.id));
                              else setSelectedGuests([]);
                            }}
                            className="w-4 h-4 rounded border-gray-300 text-[#2D5A45] focus:ring-[#2D5A45] cursor-pointer"
                          />
                        </th>
                      )}
                      {(() => {
                        const sortable: (typeof sortField)[] = ['country', 'location', 'arrival', 'departure'];
                        const labelMap: Record<typeof sortField, string> = {
                          country:   'Country',
                          location:  'Location',
                          arrival:   'Arrival',
                          departure: 'Departure',
                        };
                        const cols: { label: string; field?: typeof sortField }[] = isPickup
                          ? [
                              { label: 'Name' },
                              ...(isAdmin ? [] : [{ label: 'Number' }]),
                              { label: 'Country',       field: 'country' },
                              { label: 'Tier' },
                              ...(isAdmin ? [{ label: 'Transp. Dept.' }] : []),
                              { label: 'Accommodation' },
                              { label: 'Location',      field: 'location' },
                              { label: 'Arrival',       field: 'arrival' },
                              { label: 'Airport' }, { label: 'Pick Up Driver' }, { label: 'Actions' },
                            ]
                          : isDropoff
                          ? [
                              { label: 'Name' },
                              ...(isAdmin ? [] : [{ label: 'Number' }]),
                              { label: 'Country',       field: 'country' },
                              { label: 'Tier' },
                              ...(isAdmin ? [{ label: 'Transp. Dept.' }] : []),
                              { label: 'Accommodation' },
                              { label: 'Location',      field: 'location' },
                              { label: 'Departure',     field: 'departure' },
                              { label: 'Airport' }, { label: 'Drop Off Driver' }, { label: 'Actions' },
                            ]
                          : [
                              { label: 'Name' }, { label: 'Country', field: 'country' }, { label: 'Designation' },
                              { label: 'Tier' }, { label: 'Accommodation' }, { label: 'Location', field: 'location' },
                              { label: 'Arrival', field: 'arrival' }, { label: 'Departure', field: 'departure' },
                              { label: 'Pickup Driver' }, { label: 'Actions' },
                            ];
                        void labelMap; void sortable;
                        return cols.map(c => {
                          const isActive = c.field && sortField === c.field;
                          const baseCls = 'px-3 py-3 text-left text-xs uppercase tracking-wider whitespace-nowrap';
                          if (!c.field) {
                            return <th key={c.label} className={`${baseCls} font-semibold text-[#4A4A4A]`}>{c.label}</th>;
                          }
                          return (
                            <th
                              key={c.label}
                              onClick={() => handleSort(c.field!)}
                              className={`${baseCls} cursor-pointer select-none hover:bg-[#E8E3DB] ${isActive ? 'text-[#2D5A45] font-bold' : 'font-semibold text-[#4A4A4A]'}`}
                            >
                              <div className="flex items-center gap-1">
                                {c.label}
                                {isActive
                                  ? (sortDirection === 'asc'
                                      ? <ChevronUp   className="w-3 h-3 text-[#2D5A45]" />
                                      : <ChevronDown className="w-3 h-3 text-[#2D5A45]" />)
                                  : <ChevronsUpDown className="w-3 h-3 text-gray-300" />}
                              </div>
                            </th>
                          );
                        });
                      })()}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E3DB]">
                    {activeGuests.map(g => {
                      const familyKey = g.family_group_id ?? null;
                      const groupCount = familyKey ? (groupMeta.counts.get(familyKey) ?? 0) : 0;
                      const isFirstInGroup = !!familyKey && groupMeta.firstId.get(familyKey) === g.id;
                      const lastName = groupMeta.lastNames.get(familyKey ?? '') ?? '';
                      const pickupTask  = getPickupTask(g.id);
                      const dropoffTask = getDropoffTask(g.id);
                      const desigs = desigArray(g.designation);
                      const tier = tierByGuestId[g.id];
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
                            <td colSpan={(isPickup || isDropoff) ? 11 : 10} className="px-3 py-2">
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
                        <tr className={`transition-colors ${
                          selectedGuests.includes(g.id)
                            ? 'bg-[#D6E4D9]/40'
                            : 'hover:bg-[#F5F0E8]/50'
                        } ${familyKey && groupCount > 1 ? 'border-l-4 border-[#2D5A45]/20' : ''}`}>
                          {(isPickup || isDropoff) && (
                            <td className="w-10 px-3 py-3">
                              <input
                                type="checkbox"
                                checked={selectedGuests.includes(g.id)}
                                onChange={e => {
                                  if (e.target.checked) setSelectedGuests(prev => [...prev, g.id]);
                                  else setSelectedGuests(prev => prev.filter(id => id !== g.id));
                                }}
                                className="w-4 h-4 rounded border-gray-300 text-[#2D5A45] focus:ring-[#2D5A45] cursor-pointer"
                              />
                            </td>
                          )}
                          {/* Name + photo */}
                          <td className="px-3 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              {!isPickup && !isDropoff && ((g as { photo_url?: string }).photo_url ? (
                                <img src={(g as { photo_url?: string }).photo_url} alt={g.full_name}
                                  className="w-6 h-6 rounded-full object-cover shrink-0" />
                              ) : (
                                <div className="w-6 h-6 bg-[#2D5A45]/10 rounded-full flex items-center justify-center shrink-0">
                                  <span className="text-[#2D5A45] text-[10px] font-semibold">{g.full_name.charAt(0)}</span>
                                </div>
                              ))}
                              <div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className="font-medium text-[#1A1A1A] whitespace-nowrap">{g.full_name}</p>
                                  {familyKey && groupCount > 1 && (
                                    <span className="text-[10px] text-[#4A4A4A] bg-[#F0F7F4] border border-[#D4E9DC] rounded px-1 py-0.5">
                                      {relationship}
                                    </span>
                                  )}
                                </div>
                                {/* Phone under name — legacy view, and admin pickup/dropoff. */}
                                {((!isPickup && !isDropoff) || (isAdmin && (isPickup || isDropoff))) && g.contact_number && (
                                  <a href={`tel:${g.contact_number}`}
                                    className="flex items-center gap-1 text-[10px] text-[#2D5A45] hover:underline">
                                    <Phone className="w-2.5 h-2.5" />{g.contact_number}
                                  </a>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Number (phone) — pickup/dropoff TRANSPORT HEAD only.
                              Admin shows phone as a small line under the name in the Name cell. */}
                          {(isPickup || isDropoff) && !isAdmin && (
                            <td className="px-3 py-3 whitespace-nowrap">
                              {g.contact_number ? (
                                <a href={`tel:${g.contact_number}`} className="text-blue-600 hover:underline text-xs">
                                  {g.contact_number}
                                </a>
                              ) : <span className="text-[#4A4A4A] text-xs">—</span>}
                            </td>
                          )}

                          {/* Country */}
                          <td className="px-3 py-3 whitespace-nowrap text-[#4A4A4A]">{g.country ?? '—'}</td>

                          {/* Designation — legacy view only */}
                          {!isPickup && !isDropoff && (
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
                          )}

                          {/* Tier — Transport Head: ⭐ only for Tier 1(a)/1(b)/2.
                               Super Admin + legacy: full tier badge. */}
                          <td className="px-3 py-3 whitespace-nowrap">
                            {(isPickup || isDropoff) && !isAdmin
                              ? ((tier === '1(a)' || tier === '1(b)' || tier === '2')
                                  ? <span className="text-amber-500 text-base" aria-label={`Tier ${tier}`}>⭐</span>
                                  : <span className="text-[#4A4A4A]">—</span>)
                              : (tierBadge(tier) ?? <span className="text-[#4A4A4A]">—</span>)}
                          </td>

                          {/* Transport Dept — admin only. Shows short code (JST/R1T/CGT/UKT) with full name in tooltip. */}
                          {isAdmin && (
                            <td className="px-2 py-3 whitespace-nowrap">
                              {g.transport_department_id ? (() => {
                                const td = transportDepts.find(t => t.id === g.transport_department_id);
                                const name = td?.name ?? '—';
                                const short = shortenDeptName(name);
                                return (
                                  <span
                                    className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${getTransportDeptBadgeClass(name)}`}
                                    title={name}
                                  >
                                    {short}
                                  </span>
                                );
                              })() : (
                                <span className="text-red-500 text-[11px] font-medium">⚠️ None</span>
                              )}
                            </td>
                          )}

                          {/* Accommodation */}
                          <td className={`${isAdmin ? 'px-2' : 'px-3'} py-3 whitespace-nowrap text-[#4A4A4A] ${isAdmin ? 'max-w-[90px]' : 'max-w-[120px]'} truncate`} title={g.assigned_department ?? ''}>{g.assigned_department ?? '—'}</td>

                          {/* Location */}
                          <td className={`${isAdmin ? 'px-2' : 'px-3'} py-3 whitespace-nowrap text-[#4A4A4A] ${isAdmin ? 'max-w-[100px] truncate' : ''}`} title={g.placed_location ?? ''}>{g.placed_location ?? '—'}</td>

                          {/* Arrival — pickup + legacy */}
                          {!isDropoff && (
                            <td className="px-3 py-3 min-w-[130px]">
                              <div className="text-xs">
                                <p className="font-medium text-[#1A1A1A]">
                                  {(g.arrival_date || g.arrival_time)
                                    ? `${formatDateShort(g.arrival_date)} · ${formatTime(g.arrival_time)}`
                                    : '—'}
                                </p>
                                {(g.arrival_flight_number || g.flight_number) && (
                                  <p className="text-[#4A4A4A]">
                                    ✈ {g.arrival_flight_number ?? g.flight_number}
                                    {!(isPickup || isDropoff) && g.arrival_airport ? ` · ${g.arrival_airport}` : ''}
                                  </p>
                                )}
                              </div>
                            </td>
                          )}

                          {/* Departure — dropoff + legacy */}
                          {!isPickup && (
                            <td className="px-3 py-3 min-w-[130px]">
                              <div className="text-xs">
                                <p className="font-medium text-[#1A1A1A]">
                                  {(g.departure_date || g.departure_time)
                                    ? `${formatDateShort(g.departure_date)} · ${formatTime(g.departure_time)}`
                                    : '—'}
                                </p>
                                {g.departure_flight_number && (
                                  <p className="text-[#4A4A4A]">✈ {g.departure_flight_number}</p>
                                )}
                              </div>
                            </td>
                          )}

                          {/* Airport — pickup/dropoff modes only, clickable Maps link */}
                          {(isPickup || isDropoff) && (() => {
                            const ap  = isPickup ? g.arrival_airport  : g.departure_airport;
                            const tm  = isPickup ? g.arrival_terminal : g.departure_terminal;
                            if (!ap) return <td className="px-3 py-3 text-xs text-[#4A4A4A]">—</td>;
                            const q = encodeURIComponent([ap, tm, isPickup ? 'arrivals' : 'departures'].filter(Boolean).join(' '));
                            return (
                              <td className="px-3 py-3 whitespace-nowrap">
                                <a
                                  href={`https://maps.google.com/?q=${q}`}
                                  target="_blank" rel="noopener noreferrer"
                                  className="text-blue-600 hover:underline text-xs"
                                >
                                  {ap}{tm ? ` · T${tm}` : ''} 📍
                                </a>
                              </td>
                            );
                          })()}

                          {/* Driver (Pick Up or Drop Off) */}
                          <td className="px-3 py-3 whitespace-nowrap">
                            <AssignDropdown
                              guestId={g.id}
                              guestName={g.full_name}
                              taskType={isDropoff ? 'airport_dropoff' : 'airport_pickup'}
                              drivers={drivers}
                              tasks={tasks}
                              onAssigned={fetchAll}
                            />
                          </td>

                          {/* Actions */}
                          <td className="px-3 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              {isPickup ? (
                                !pickupTask ? (
                                  <button
                                    onClick={() => openCreateTask(g.id, 'airport_pickup')}
                                    className="text-[10px] font-medium px-2 py-1 bg-[#2D5A45] text-white rounded-lg hover:bg-[#234839] transition-colors whitespace-nowrap"
                                  >
                                    + Pickup
                                  </button>
                                ) : (
                                  <StatusBadge status={pickupTask.status} />
                                )
                              ) : isDropoff ? (
                                !dropoffTask ? (
                                  <button
                                    onClick={() => openCreateTask(g.id, 'airport_dropoff')}
                                    className="text-[10px] font-medium px-2 py-1 bg-[#2D5A45] text-white rounded-lg hover:bg-[#234839] transition-colors whitespace-nowrap"
                                  >
                                    + Drop-off
                                  </button>
                                ) : (
                                  <StatusBadge status={dropoffTask.status} />
                                )
                              ) : (
                                <>
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
                                </>
                              )}
                              {(isPickup || isDropoff) && (
                                <>
                                  <button
                                    onClick={() => handleMarkDone(g, isDropoff ? 'airport_dropoff' : 'airport_pickup')}
                                    title="Mark as done"
                                    className="w-5 h-5 rounded-full border border-gray-300 hover:border-green-500 hover:bg-green-50 flex items-center justify-center transition-all group"
                                  >
                                    <Check className="w-2.5 h-2.5 text-gray-300 group-hover:text-green-500" />
                                  </button>
                                  <button
                                    onClick={() => openViewGuest(g.id)}
                                    title="View guest details"
                                    className="w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex items-center justify-center transition-colors"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                </>
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

          {/* ── COMPLETED section (pickup / dropoff tabs only) — always visible ── */}
          {(isPickup || isDropoff) && (
            <div className="mt-8 border-t border-gray-200 pt-4">
              <div
                className="flex items-center justify-between cursor-pointer py-2"
                onClick={() => setShowCompleted(s => !s)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
                    {isDropoff ? 'Done Drop Offs' : 'Done Pick Ups'}
                  </span>
                  <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium">
                    {completedGuests.length}
                  </span>
                </div>
                {showCompleted
                  ? <ChevronUp   className="w-4 h-4 text-gray-400" />
                  : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </div>

              {showCompleted && (completedGuests.length > 0 ? (() => {
                const taskType = isDropoff ? 'airport_dropoff' : 'airport_pickup';
                return (
                  <div className="bg-white rounded-2xl border border-[#E8E3DB] shadow-sm overflow-hidden mt-2">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[#E8E3DB] bg-[#F5F0E8]/50">
                            {['Name', 'Country', isDropoff ? 'Departure' : 'Arrival', 'Airport', 'Driver', 'Completed At', ''].map(h => (
                              <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E8E3DB]">
                          {completedGuests.map(g => {
                            const task = tasks.find(t => t.guest_id === g.id && t.task_type === taskType);
                            const date  = isDropoff ? g.departure_date : g.arrival_date;
                            const time  = isDropoff ? g.departure_time : g.arrival_time;
                            const ap    = isDropoff ? g.departure_airport : g.arrival_airport;
                            const tm    = isDropoff ? g.departure_terminal : g.arrival_terminal;
                            return (
                              <tr key={g.id} className="hover:bg-[#F5F0E8]/50 transition-colors">
                                <td className="px-3 py-3 whitespace-nowrap">
                                  <span className="text-green-500 mr-1.5">✅</span>
                                  <span className="font-medium text-[#1A1A1A]">{g.full_name}</span>
                                </td>
                                <td className="px-3 py-3 whitespace-nowrap text-[#4A4A4A]">{g.country ?? '—'}</td>
                                <td className="px-3 py-3 whitespace-nowrap text-xs text-[#1A1A1A]">
                                  {(date || time) ? `${formatDateShort(date)} · ${formatTime(time)}` : '—'}
                                </td>
                                <td className="px-3 py-3 whitespace-nowrap text-xs text-[#4A4A4A]">
                                  {ap ? `${ap}${tm ? ` · T${tm}` : ''}` : '—'}
                                </td>
                                <td className="px-3 py-3 whitespace-nowrap text-xs text-[#4A4A4A]">{task?.driver_name ?? '—'}</td>
                                <td className="px-3 py-3 whitespace-nowrap text-xs text-[#4A4A4A]">
                                  {task?.completed_at
                                    ? `${formatDateShort(task.completed_at)} · ${new Date(task.completed_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
                                    : '—'}
                                </td>
                                <td className="px-3 py-3 whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                    {task && (
                                      <button
                                        onClick={() => handleUndoDone(task.id)}
                                        className="text-xs text-gray-400 hover:text-amber-600"
                                      >
                                        ↩ Undo
                                      </button>
                                    )}
                                    <button
                                      onClick={() => openViewGuest(g.id)}
                                      title="View guest details"
                                      className="w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex items-center justify-center transition-colors"
                                    >
                                      <Eye className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })() : (
                <div className="bg-white rounded-2xl border border-[#E8E3DB] shadow-sm p-6 mt-2 text-center">
                  <p className="text-sm text-gray-400">
                    {isDropoff ? 'No completed drop offs yet' : 'No completed pick ups yet'}
                  </p>
                </div>
              ))}
            </div>
          )}
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

      {/* Guest detail view modal */}
      <GuestViewModal
        guest={viewGuest}
        open={!!viewGuest}
        onClose={() => setViewGuest(null)}
      />
    </div>
  );
}
