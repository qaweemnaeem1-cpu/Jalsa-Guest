import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Car, ChevronDown, Plane, Building2, Package,
  CheckCircle2, Clock, AlertCircle, Loader2,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { DriverSidebar } from '@/components/DriverSidebar';
import { supabase } from '@/lib/supabase';
import type { DriverTask, DriverTaskStatus, DriverTaskType } from '@/types';

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
function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

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

const AVAILABILITY_OPTIONS = [
  { value: true,  label: 'Available',  dot: 'bg-green-500' },
  { value: false, label: 'Off Duty',   dot: 'bg-red-500' },
] as const;

// ── task card ─────────────────────────────────────────────────────────────────

function TaskCard({ task, onUpdateStatus }: { task: DriverTask; onUpdateStatus: (id: string, s: DriverTaskStatus) => void }) {
  const typeMeta = TASK_TYPE_META[task.task_type];
  const statusMeta = STATUS_META[task.status];
  const label = task.guest_name ?? task.delegation_name ?? '—';

  const canStart    = task.status === 'pending' || task.status === 'suggested';
  const canComplete = task.status === 'in_progress';

  return (
    <div className="flex gap-3 p-4 bg-white rounded-xl border border-[#E8E3DB] hover:border-[#2D5A45]/30 transition-colors">
      {/* Time column */}
      <div className="w-14 shrink-0 text-right">
        <span className="text-sm font-semibold text-[#1A1A1A]">{task.scheduled_time ?? '—'}</span>
      </div>

      {/* Divider */}
      <div className="w-px bg-[#E8E3DB] shrink-0" />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          {/* Type badge */}
          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${typeMeta.bg} ${typeMeta.text}`}>
            {typeMeta.icon}
            {typeMeta.label}
          </span>
          {/* Status badge */}
          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${statusMeta.cls}`}>
            {statusMeta.icon}
            {statusMeta.label}
          </span>
        </div>

        <p className="font-semibold text-[#1A1A1A] text-sm truncate">{label}</p>

        {/* Route */}
        {(task.pickup_location || task.dropoff_location) && (
          <p className="text-xs text-[#4A4A4A] mt-0.5">
            {task.pickup_location ?? '?'} → {task.dropoff_location ?? '?'}
          </p>
        )}

        {/* Flight + passengers */}
        <div className="flex items-center gap-3 mt-1 text-xs text-[#4A4A4A]">
          {task.flight_number && <span>Flight: {task.flight_number}</span>}
          {task.passenger_count != null && (
            <span>{task.passenger_count} passenger{task.passenger_count !== 1 ? 's' : ''}</span>
          )}
        </div>

        {task.notes && (
          <p className="text-xs text-[#4A4A4A] italic mt-1">{task.notes}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-1.5 shrink-0 justify-center">
        {canStart && (
          <button
            onClick={() => onUpdateStatus(task.id, 'in_progress')}
            className="px-3 py-1 text-xs font-medium bg-[#2D5A45] text-white rounded-lg hover:bg-[#234839] transition-colors"
          >
            Start
          </button>
        )}
        {canComplete && (
          <button
            onClick={() => onUpdateStatus(task.id, 'completed')}
            className="px-3 py-1 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            Complete
          </button>
        )}
        <button className="px-3 py-1 text-xs font-medium border border-[#E8E3DB] text-[#4A4A4A] rounded-lg hover:bg-[#F5F0E8] transition-colors">
          Details
        </button>
      </div>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function DriverDashboardPage() {
  const { user, updateUser } = useAuth();

  const [tasks, setTasks]                     = useState<DriverTask[]>([]);
  const [tasksLoading, setTasksLoading]       = useState(true);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [updatingAvail, setUpdatingAvail]     = useState(false);
  const availMenuRef                          = useRef<HTMLDivElement>(null);
  const loadedRef                             = useRef(false);

  const today     = todayStr();
  const tomorrow  = tomorrowStr();
  const dayAfter  = dayAfterStr();

  // ── fetch tasks ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id || loadedRef.current) return;
    loadedRef.current = true;

    (async () => {
      try {
        const { data } = await supabase
          .from('driver_tasks')
          .select('*')
          .eq('driver_id', user.id)
          .gte('scheduled_date', today)
          .order('scheduled_date')
          .order('scheduled_time');

        setTasks((data as DriverTask[]) ?? []);
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

      <main className="ml-64 flex-1 p-8">
        {/* ── Header ── */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#1A1A1A]">Driver Dashboard</h1>
          <p className="text-sm text-[#4A4A4A] mt-1">
            {user?.name}
            {user?.location   ? ` — ${user.location}`   : ''}
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
        <div className="bg-white rounded-2xl border border-[#E8E3DB] shadow-sm">
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
      </main>
    </div>
  );
}
