import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Car, ChevronDown, ChevronUp, Plane, Building2, Package,
  CheckCircle2, Clock, AlertCircle, Loader2, Phone, CalendarDays, MapPin, ExternalLink,
} from 'lucide-react';
import { calculateETA, formatETA, isETAOverdue, getMapLink, looksLikeAirport } from '@/lib/driverMatchUtils';
import { useAuth } from '@/hooks/useAuth';
import { DriverSidebar } from '@/components/DriverSidebar';
import { supabase } from '@/lib/supabase';
import type { DriverTask, DriverTaskStatus, DriverTaskType, DriverTaskPriority } from '@/types';
import { InlineMessagesPanel } from '@/components/DriverMessagesDialog';
import { AddMaintenanceDialog, type MaintenanceEntry, computeStatus } from '@/components/VehicleMaintenanceDialog';
import { TopBar } from '@/components/TopBar';
import { formatDateWithWeekday } from '@/utils/dateHelpers';

// ── avatar / contact helpers ──────────────────────────────────────────────────

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-purple-500', 'bg-green-600',
  'bg-amber-500', 'bg-rose-500', 'bg-cyan-600',
];
function avatarColor(name: string) { return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]; }
function initials(name: string)    { return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(); }

interface GuestContact {
  full_name: string; country?: string; designation?: string;
  contact_number?: string; email?: string; photo_url?: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split('T')[0];
}
function tomorrowStr() {
  const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0];
}
function dayAfterStr() {
  const d = new Date(); d.setDate(d.getDate() + 2); return d.toISOString().split('T')[0];
}
const fmtDate = (iso: string) => formatDateWithWeekday(iso);

const TASK_TYPE_META: Record<DriverTaskType, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  airport_pickup:    { label: 'Pickup',   bg: 'bg-blue-100',   text: 'text-blue-700',   icon: <Plane className="w-4 h-4" /> },
  airport_dropoff:   { label: 'Drop-off', bg: 'bg-purple-100', text: 'text-purple-700', icon: <Plane className="w-4 h-4 rotate-90" /> },
  mulaqat_transport: { label: 'Mulaqat',  bg: 'bg-green-100',  text: 'text-green-700',  icon: <Building2 className="w-4 h-4" /> },
  other:             { label: 'Other',    bg: 'bg-gray-100',   text: 'text-gray-700',   icon: <Package className="w-4 h-4" /> },
};

const STATUS_META: Record<DriverTaskStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  suggested:   { label: 'Suggested',   cls: 'bg-gray-100 text-gray-600',    icon: <AlertCircle className="w-3.5 h-3.5" /> },
  pending:     { label: 'Pending',     cls: 'bg-amber-100 text-amber-700',  icon: <Clock className="w-3.5 h-3.5" /> },
  in_progress: { label: 'In Progress', cls: 'bg-blue-100 text-blue-700',    icon: <Loader2 className="w-3.5 h-3.5" /> },
  completed:   { label: 'Completed',   cls: 'bg-green-100 text-green-700',  icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
};

const PRIORITY_META: Record<DriverTaskPriority, { label: string; cls: string }> = {
  normal: { label: 'Normal', cls: 'bg-gray-100 text-gray-600' },
  urgent: { label: '! Urgent', cls: 'bg-red-100 text-red-700' },
  vip:    { label: '⭐ VIP',   cls: 'bg-purple-100 text-purple-700' },
};

const AVAILABILITY_OPTIONS = [
  { value: true,  label: 'Available',  dot: 'bg-green-500' },
  { value: false, label: 'Off Duty',   dot: 'bg-red-500' },
] as const;

// ── task card ─────────────────────────────────────────────────────────────────

function TaskCard({ task, onUpdateStatus }: { task: DriverTask; onUpdateStatus: (id: string, s: DriverTaskStatus) => void }) {
  const typeMeta     = TASK_TYPE_META[task.task_type];
  const statusMeta   = STATUS_META[task.status];
  const priorityMeta = PRIORITY_META[task.priority ?? 'normal'];
  const label = task.guest_name ?? task.delegation_name ?? '—';

  const canStart    = task.status === 'pending' || task.status === 'suggested';
  const canComplete = task.status === 'in_progress';
  const isActive    = task.status === 'in_progress';

  const [expanded, setExpanded]         = useState(false);
  const [guestContact, setGuestContact] = useState<GuestContact | null>(null);
  const [, setTick]                     = useState(0); // for ETA re-render

  // ETA ticker — refresh every minute when task is in progress
  useEffect(() => {
    if (!isActive) return;
    const iv = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(iv);
  }, [isActive]);

  // Always pre-fetch guest contact so photo shows on active tasks
  useEffect(() => {
    if (!task.guest_id) return;
    supabase
      .from('guests')
      .select('full_name,country,designation,contact_number,email,photo_url')
      .eq('id', task.guest_id)
      .maybeSingle()
      .then(({ data }) => setGuestContact(data as GuestContact | null));
  }, [task.guest_id]);

  // ETA
  const eta = isActive ? calculateETA(task as Parameters<typeof calculateETA>[0]) : null;
  const etaText  = eta ? formatETA(eta) : null;
  const etaOver  = eta ? isETAOverdue(eta) : false;

  // Map link for airport locations
  const airportLocStr = task.task_type === 'airport_pickup'
    ? task.pickup_location
    : task.task_type === 'airport_dropoff'
    ? task.dropoff_location
    : null;
  const showMapLink = looksLikeAirport(airportLocStr);
  const mapLink = showMapLink ? getMapLink(airportLocStr) : null;

  return (
    <div className={`bg-white rounded-xl border transition-colors overflow-hidden ${isActive ? 'border-blue-300 shadow-sm' : 'border-[#E8E3DB] hover:border-[#2D5A45]/30'}`}>
      <div className="flex gap-3 p-4">
        {/* Guest photo (visible for all tasks with guest_id) */}
        {task.guest_id && (
          <div className="shrink-0">
            {guestContact?.photo_url ? (
              <img src={guestContact.photo_url} alt={label} className="w-16 h-16 rounded-xl object-cover" />
            ) : (
              <div className={`w-16 h-16 ${avatarColor(label)} rounded-xl flex items-center justify-center text-white text-lg font-bold`}>
                {initials(label)}
              </div>
            )}
          </div>
        )}

        {/* Time column (only when no photo) */}
        {!task.guest_id && (
          <div className="w-14 shrink-0 text-right">
            <span className="text-sm font-semibold text-[#1A1A1A]">{task.scheduled_time ?? '—'}</span>
          </div>
        )}

        {/* Divider */}
        <div className="w-px bg-[#E8E3DB] shrink-0" />

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Time shown here when photo is shown */}
          {task.guest_id && task.scheduled_time && (
            <p className="text-xs text-[#4A4A4A] mb-1 font-medium">{task.scheduled_time}</p>
          )}

          <div className="flex items-center gap-2 flex-wrap mb-1">
            {task.priority && task.priority !== 'normal' && (
              <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${priorityMeta.cls}`}>
                {priorityMeta.label}
              </span>
            )}
            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${typeMeta.bg} ${typeMeta.text}`}>
              {typeMeta.icon}{typeMeta.label}
            </span>
            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${statusMeta.cls}`}>
              {statusMeta.icon}{statusMeta.label}
            </span>
          </div>

          {/* Guest name */}
          <p className="font-semibold text-[#1A1A1A] text-sm truncate mb-0.5">{label}</p>

          {/* Route with map link */}
          {(task.pickup_location || task.dropoff_location) && (
            <div className="text-xs text-[#4A4A4A] mt-0.5 flex items-center gap-1 flex-wrap">
              <span>{task.pickup_location ?? '?'} → {task.dropoff_location ?? '?'}</span>
              {mapLink && (
                <a href={mapLink} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-[#2D5A45] hover:underline ml-1">
                  <MapPin className="w-3 h-3" /><ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 mt-1 text-xs text-[#4A4A4A]">
            {task.flight_number && <span>✈ {task.flight_number}</span>}
            {task.passenger_count != null && (
              <span>{task.passenger_count} pax</span>
            )}
          </div>

          {/* ETA badge */}
          {etaText && (
            <p className={`text-xs font-medium mt-1.5 ${etaOver ? 'text-red-600' : 'text-blue-600'}`}>
              {etaText}
            </p>
          )}

          {/* Contact info always visible when active */}
          {isActive && guestContact && (
            <div className="mt-1.5 space-y-0.5">
              {guestContact.contact_number && (
                <a href={`tel:${guestContact.contact_number}`}
                  className="flex items-center gap-1 text-[#2D5A45] hover:underline text-xs">
                  <Phone className="w-3 h-3" />{guestContact.contact_number}
                  <span className="ml-1 px-1.5 py-0.5 border border-[#2D5A45] text-[#2D5A45] rounded text-[10px] font-medium">Call</span>
                </a>
              )}
            </div>
          )}

          {task.notes && <p className="text-xs text-[#4A4A4A] italic mt-1">{task.notes}</p>}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1.5 shrink-0 justify-center">
          {canStart && (
            <button
              onClick={() => onUpdateStatus(task.id, 'in_progress')}
              className="px-3 py-1 text-xs font-medium bg-[#2D5A45] text-white rounded-lg hover:bg-[#234839] transition-colors"
            >Start</button>
          )}
          {canComplete && (
            <button
              onClick={() => onUpdateStatus(task.id, 'completed')}
              className="px-3 py-1 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >Complete</button>
          )}
          {!isActive && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="px-3 py-1 text-xs font-medium border border-[#E8E3DB] text-[#4A4A4A] rounded-lg hover:bg-[#F5F0E8] transition-colors flex items-center gap-1"
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              Details
            </button>
          )}
        </div>
      </div>

      {/* Expanded guest contact (non-active tasks) */}
      {expanded && !isActive && (
        <div className="border-t border-[#E8E3DB] bg-[#F5F0E8]/50 px-4 py-3">
          {task.guest_id ? (
            guestContact ? (
              <div className="flex items-start gap-3">
                {guestContact.photo_url ? (
                  <img src={guestContact.photo_url} alt={guestContact.full_name} className="w-12 h-12 rounded-xl object-cover shrink-0" />
                ) : (
                  <div className={`w-12 h-12 ${avatarColor(guestContact.full_name)} rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0`}>
                    {initials(guestContact.full_name)}
                  </div>
                )}
                <div className="flex-1 min-w-0 space-y-0.5">
                  <p className="font-semibold text-[#1A1A1A] text-sm">{guestContact.full_name}</p>
                  {(guestContact.country || guestContact.designation) && (
                    <p className="text-xs text-[#4A4A4A]">
                      {[guestContact.country, guestContact.designation].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {guestContact.contact_number && (
                    <a href={`tel:${guestContact.contact_number}`} className="flex items-center gap-1 text-[#2D5A45] hover:underline text-xs">
                      <Phone className="w-3 h-3" />{guestContact.contact_number}
                      <span className="ml-1 px-1.5 py-0.5 border border-[#2D5A45] text-[#2D5A45] rounded text-[10px] font-medium">Call</span>
                    </a>
                  )}
                  {guestContact.email && (
                    <a href={`mailto:${guestContact.email}`} className="flex items-center gap-1 text-[#2D5A45] hover:underline text-xs">
                      ✉ {guestContact.email}
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-[#4A4A4A] italic">Loading guest contact…</p>
            )
          ) : (
            <p className="text-xs text-[#4A4A4A]">
              {task.delegation_name ? `Delegation: ${task.delegation_name}` : 'No guest contact info linked.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── schedule helpers ──────────────────────────────────────────────────────────

type ScheduleStatus = 'on_duty' | 'off_duty' | 'leave' | 'half_day';

interface ScheduleDay {
  date: string;
  status: ScheduleStatus;
  shift_start?: string;
  shift_end?: string;
}

const SCHED_META: Record<ScheduleStatus, { label: string; emoji: string; cls: string }> = {
  on_duty:  { label: 'On Duty',  emoji: '🟢', cls: 'text-green-700' },
  off_duty: { label: 'Off Duty', emoji: '🟡', cls: 'text-amber-700' },
  leave:    { label: 'Leave',    emoji: '🔴', cls: 'text-red-700'   },
  half_day: { label: 'Half Day', emoji: '🔵', cls: 'text-blue-700'  },
};

function getWeekDays(): string[] {
  const today = new Date();
  const day = today.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(today); mon.setDate(today.getDate() + diff);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i);
    return d.toISOString().split('T')[0];
  });
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function DriverDashboardPage() {
  const { user, updateUser } = useAuth();

  const [tasks, setTasks]                     = useState<DriverTask[]>([]);
  const [tasksLoading, setTasksLoading]       = useState(true);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [updatingAvail, setUpdatingAvail]     = useState(false);
  const [weekSchedule, setWeekSchedule]       = useState<ScheduleDay[]>([]);
  const [maintenance, setMaintenance]         = useState<MaintenanceEntry[]>([]);
  const [addMaintOpen, setAddMaintOpen]       = useState(false);
  const [maintPreselType, setMaintPreselType] = useState<MaintenanceEntry['type'] | undefined>();
  const availMenuRef                          = useRef<HTMLDivElement>(null);
  const loadedRef                             = useRef(false);

  const today     = todayStr();
  const tomorrow  = tomorrowStr();
  const dayAfter  = dayAfterStr();

  // ── fetch tasks + schedule ─────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id || loadedRef.current) return;
    loadedRef.current = true;

    const weekDays = getWeekDays();
    const weekStart = weekDays[0];
    const weekEnd   = weekDays[6];

    (async () => {
      try {
        const [tasksRes, schedRes, taskCountRes, maintRes] = await Promise.all([
          supabase
            .from('driver_tasks')
            .select('*')
            .eq('driver_id', user.id)
            .gte('scheduled_date', today)
            .order('scheduled_date')
            .order('scheduled_time'),
          supabase
            .from('driver_schedules')
            .select('date,status,shift_start,shift_end')
            .eq('driver_id', user.id)
            .gte('date', weekStart)
            .lte('date', weekEnd),
          supabase
            .from('driver_tasks')
            .select('scheduled_date')
            .eq('driver_id', user.id)
            .gte('scheduled_date', weekStart)
            .lte('scheduled_date', weekEnd)
            .neq('status', 'cancelled'),
          supabase
            .from('vehicle_maintenance')
            .select('*')
            .eq('driver_id', user.id)
            .order('date', { ascending: false }),
        ]);

        setTasks((tasksRes.data as DriverTask[]) ?? []);
        setMaintenance((maintRes.data ?? []) as MaintenanceEntry[]);

        // Build schedule list (one entry per day of week)
        const schedMap: Record<string, ScheduleDay> = {};
        for (const s of (schedRes.data ?? []) as ScheduleDay[]) {
          schedMap[s.date] = s;
        }
        const taskCountMap: Record<string, number> = {};
        for (const t of (taskCountRes.data ?? []) as { scheduled_date: string }[]) {
          taskCountMap[t.scheduled_date] = (taskCountMap[t.scheduled_date] ?? 0) + 1;
        }
        setWeekSchedule(weekDays.map(d => schedMap[d] ?? { date: d, status: 'on_duty' as ScheduleStatus }));
        void taskCountMap; // available for future use
      } catch {
        // table may not exist yet — swallow
      } finally {
        setTasksLoading(false);
      }
    })();
  }, [user?.id, today]);

  // ── close dropdown on outside click ───────────────────────────────────────
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (availMenuRef.current && !availMenuRef.current.contains(e.target as Node)) {
        setAvailabilityOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // ── availability toggle ────────────────────────────────────────────────────
  const handleSetAvailability = useCallback(async (val: boolean) => {
    if (!user?.id) return;
    setAvailabilityOpen(false);
    setUpdatingAvail(true);
    try {
      await supabase.from('users').update({ is_available: val }).eq('id', user.id);
      updateUser({ isAvailable: val });
    } catch {
      // swallow
    } finally {
      setUpdatingAvail(false);
    }
  }, [user?.id, updateUser]);

  // ── update task status ─────────────────────────────────────────────────────
  const handleUpdateStatus = useCallback(async (id: string, status: DriverTaskStatus) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t));
    try {
      const patch: Record<string, unknown> = { status };
      if (status === 'in_progress') patch.started_at = new Date().toISOString();
      if (status === 'completed')   patch.completed_at = new Date().toISOString();
      await supabase.from('driver_tasks').update(patch).eq('id', id);
    } catch {
      // swallow
    }
  }, []);

  // ── derived data ───────────────────────────────────────────────────────────
  const todayTasks    = useMemo(() => tasks.filter(t => t.scheduled_date === today),    [tasks, today]);
  const tomorrowTasks = useMemo(() => tasks.filter(t => t.scheduled_date === tomorrow), [tasks, tomorrow]);
  const dayAfterTasks = useMemo(() => tasks.filter(t => t.scheduled_date === dayAfter), [tasks, dayAfter]);

  const thisWeekCompleted = useMemo(() => {
    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const ws = weekStart.toISOString().split('T')[0];
    return tasks.filter(t => t.status === 'completed' && t.scheduled_date >= ws).length;
  }, [tasks]);

  const thisWeekTotal = useMemo(() => {
    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const ws = weekStart.toISOString().split('T')[0];
    return tasks.filter(t => t.scheduled_date >= ws).length;
  }, [tasks]);

  // ── availability display ───────────────────────────────────────────────────
  const isAvailable = user?.isAvailable;
  const availDot    = isAvailable === true  ? 'bg-green-500'
                    : isAvailable === false ? 'bg-red-500'
                    : 'bg-yellow-500';
  const availLabel  = isAvailable === true  ? 'Available'
                    : isAvailable === false ? 'Off Duty'
                    : 'Unknown';

  return (
    <div className="flex min-h-screen bg-[#F5F0E8]">
      <DriverSidebar />

      <main className="ml-64 flex-1">
        <TopBar />
        <div className="p-8">
        {/* ── Header ── */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#1A1A1A]">Driver Dashboard</h1>
          <p className="text-sm text-[#4A4A4A] mt-1">
            {user?.name}
            {user?.transportDepartmentName ? ` — ${user.transportDepartmentName}` : ''}
            {user?.department ? ` (${user.department})`  : ''}
          </p>
        </div>

        {/* ── Vehicle card ── */}
        <div className="bg-white rounded-2xl border border-[#E8E3DB] p-5 mb-6 shadow-sm">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#2D5A45]/10 rounded-xl flex items-center justify-center">
                <Car className="w-5 h-5 text-[#2D5A45]" />
              </div>
              <div>
                <p className="font-semibold text-[#1A1A1A] text-sm">
                  {user?.vehicleModel
                    ? `${user.vehicleModel}${user.vehicleRegistration ? ' · ' + user.vehicleRegistration : ''}`
                    : 'No vehicle assigned'}
                </p>
                {user?.vehicleType && (
                  <p className="text-xs text-[#4A4A4A]">{user.vehicleType}</p>
                )}
                {user?.vehicleCapacity != null && (
                  <p className="text-xs text-[#4A4A4A]">Capacity: {user.vehicleCapacity} passengers</p>
                )}
              </div>
            </div>

            {/* Status + toggle */}
            <div className="relative" ref={availMenuRef}>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-sm text-[#4A4A4A]">
                  <span className={`w-2 h-2 rounded-full ${availDot}`} />
                  {updatingAvail ? 'Saving…' : availLabel}
                </span>
                <button
                  onClick={() => setAvailabilityOpen(o => !o)}
                  disabled={updatingAvail}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-[#E8E3DB] rounded-lg hover:bg-[#F5F0E8] transition-colors disabled:opacity-50"
                >
                  Toggle <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>

              {availabilityOpen && (
                <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-[#E8E3DB] rounded-xl shadow-lg z-20 overflow-hidden">
                  {AVAILABILITY_OPTIONS.map(opt => (
                    <button
                      key={String(opt.value)}
                      onClick={() => handleSetAvailability(opt.value)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#1A1A1A] hover:bg-[#F5F0E8] transition-colors"
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${opt.dot}`} />
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Maintenance Alerts ── */}
        {maintenance.map(m => {
          const status = computeStatus(m);
          if (status !== 'overdue' && status !== 'scheduled') return null;
          const isOverdue = status === 'overdue';
          const typeLabel = m.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          const dueInfo = [
            m.next_due_date ? new Date(m.next_due_date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '',
            m.next_due_mileage ? `${m.next_due_mileage.toLocaleString()} km` : '',
          ].filter(Boolean).join(' or ');
          const daysInfo = m.next_due_date
            ? Math.ceil((new Date(m.next_due_date + 'T12:00:00').getTime() - Date.now()) / 86400000)
            : null;
          return (
            <div key={m.id} className={`rounded-xl border p-3 mb-3 flex items-start justify-between gap-3 ${
              isOverdue ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
            }`}>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${isOverdue ? 'text-red-700' : 'text-amber-700'}`}>
                  {isOverdue ? '🔴 OVERDUE' : '🟡 UPCOMING'}: {typeLabel}
                  {isOverdue ? ` was due ${dueInfo}` : ` due ${daysInfo != null && daysInfo >= 0 ? `in ${daysInfo} day${daysInfo !== 1 ? 's' : ''}` : 'soon'}`}
                </p>
                {m.current_mileage != null && m.next_due_mileage != null && (
                  <p className="text-xs text-[#4A4A4A] mt-0.5">
                    Last at: {m.current_mileage.toLocaleString()} km · Next: {m.next_due_mileage.toLocaleString()} km
                  </p>
                )}
                {dueInfo && <p className="text-xs text-[#4A4A4A] mt-0.5">Due: {dueInfo}</p>}
              </div>
              <button
                onClick={() => { setMaintPreselType(m.type as MaintenanceEntry['type']); setAddMaintOpen(true); }}
                className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  isOverdue
                    ? 'border-red-300 text-red-700 hover:bg-red-100'
                    : 'border-amber-300 text-amber-700 hover:bg-amber-100'
                }`}
              >
                Log Service
              </button>
            </div>
          );
        })}

        {/* ── Today's tasks ── */}
        <div className="bg-white rounded-2xl border border-[#E8E3DB] shadow-sm mb-6">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8E3DB]">
            <h2 className="font-semibold text-[#1A1A1A] flex items-center gap-2">
              Today's Tasks
              <span className="text-xs font-bold bg-[#2D5A45] text-white px-2 py-0.5 rounded-full">
                {todayTasks.length}
              </span>
            </h2>
            <span className="text-xs text-[#4A4A4A]">{fmtDate(today)}</span>
          </div>

          <div className="p-4 space-y-3">
            {tasksLoading ? (
              <div className="flex items-center justify-center py-8 text-[#4A4A4A]">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading tasks…
              </div>
            ) : todayTasks.length === 0 ? (
              <div className="text-center py-8 text-[#4A4A4A] text-sm">
                No tasks scheduled for today.
              </div>
            ) : (
              todayTasks.map(task => (
                <TaskCard key={task.id} task={task} onUpdateStatus={handleUpdateStatus} />
              ))
            )}
          </div>
        </div>

        {/* ── Stats bar ── */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Today',                  value: todayTasks.length },
            { label: 'This week',              value: thisWeekTotal },
            { label: 'Completed this week',    value: thisWeekCompleted },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-[#E8E3DB] px-5 py-4 text-center shadow-sm">
              <p className="text-2xl font-bold text-[#2D5A45]">{s.value}</p>
              <p className="text-xs text-[#4A4A4A] mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── Upcoming ── */}
        <div className="bg-white rounded-2xl border border-[#E8E3DB] shadow-sm mb-6">
          <div className="px-5 py-4 border-b border-[#E8E3DB]">
            <h2 className="font-semibold text-[#1A1A1A]">Upcoming</h2>
          </div>
          <div className="divide-y divide-[#E8E3DB]">
            {[
              { label: 'Tomorrow',       date: tomorrow,  count: tomorrowTasks.length },
              { label: fmtDate(dayAfter), date: dayAfter, count: dayAfterTasks.length },
            ].map(row => (
              <div key={row.date} className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-[#4A4A4A]">{row.label}</span>
                <span className="text-sm font-semibold text-[#1A1A1A]">
                  {row.count} task{row.count !== 1 ? 's' : ''}
                </span>
              </div>
            ))}
            {tomorrowTasks.length === 0 && dayAfterTasks.length === 0 && (
              <div className="px-5 py-4 text-sm text-[#4A4A4A] text-center">No upcoming tasks.</div>
            )}
          </div>
        </div>

        {/* ── My Schedule This Week ── */}
        {weekSchedule.length > 0 && (
          <div className="bg-white rounded-2xl border border-[#E8E3DB] shadow-sm mb-6">
            <div className="px-5 py-4 border-b border-[#E8E3DB] flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-[#2D5A45]" />
              <h2 className="font-semibold text-[#1A1A1A]">My Schedule This Week</h2>
            </div>
            <div className="divide-y divide-[#E8E3DB]">
              {weekSchedule.map(day => {
                const meta  = SCHED_META[day.status];
                const isToday = day.date === today;
                const label = new Date(day.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
                return (
                  <div key={day.date} className={`flex items-center justify-between px-5 py-2.5 ${isToday ? 'bg-[#F5F0E8]/50' : ''}`}>
                    <div className="flex items-center gap-2">
                      {isToday && <span className="w-1.5 h-1.5 rounded-full bg-[#2D5A45] shrink-0" />}
                      <span className={`text-sm ${isToday ? 'font-semibold text-[#1A1A1A]' : 'text-[#4A4A4A]'}`}>{label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${meta.cls}`}>{meta.emoji} {meta.label}</span>
                      {(day.shift_start || day.shift_end) && day.status !== 'off_duty' && day.status !== 'leave' && (
                        <span className="text-xs text-[#4A4A4A]">
                          {day.shift_start?.slice(0, 5) ?? ''}{day.shift_end ? `–${day.shift_end.slice(0, 5)}` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Messages ── */}
        {user && (
          <InlineMessagesPanel
            currentUser={{ id: user.id, name: user.name, role: user.role }}
          />
        )}
        </div>{/* /p-8 */}
      </main>

      {user && (
        <AddMaintenanceDialog
          open={addMaintOpen}
          onClose={() => { setAddMaintOpen(false); setMaintPreselType(undefined); }}
          driverId={user.id}
          vehicleRegistration={user.vehicleRegistration}
          preselectedType={maintPreselType}
          onSaved={saved => {
            setMaintenance(prev => {
              const idx = prev.findIndex(e => e.id === saved.id);
              if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
              return [saved, ...prev];
            });
          }}
        />
      )}
    </div>
  );
}
