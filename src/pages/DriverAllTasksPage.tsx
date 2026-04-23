import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Plane, Building2, Package, AlertCircle, Clock,
  Loader2, ChevronDown, X, Plus, Bot, ArrowRightLeft, FileText,
} from 'lucide-react';

// ── avatar helper ─────────────────────────────────────────────────────────────
const AVATAR_COLORS_AT = ['bg-blue-500','bg-purple-500','bg-green-600','bg-amber-500','bg-rose-500','bg-cyan-600'];
function avatarColorAT(name: string) { return AVATAR_COLORS_AT[name.charCodeAt(0) % AVATAR_COLORS_AT.length]; }
function initialsAT(name: string) { return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(); }
function GuestAvatar({ name }: { name: string }) {
  return (
    <div className={`w-6 h-6 ${avatarColorAT(name)} rounded-full flex items-center justify-center text-white text-[10px] font-semibold shrink-0`}>
      {initialsAT(name)}
    </div>
  );
}
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { DriverSidebar } from '@/components/DriverSidebar';
import { formatDateShort } from '@/utils/dateHelpers';
import { supabase } from '@/lib/supabase';
import type { DriverTask, DriverTaskType, DriverTaskPriority } from '@/types';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { CreateTaskDialog } from '@/components/CreateTaskDialog';
import type { DriverInfo } from '@/components/CreateTaskDialog';
import { HandoverDialog } from '@/components/HandoverDialog';
import { DailyReportDialog } from '@/components/DailyReportDialog';
import { TopBar } from '@/components/TopBar';

// ── helpers ───────────────────────────────────────────────────────────────────

function todayStr()    { return new Date().toISOString().split('T')[0]; }
function tomorrowStr() { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; }
function thisWeekEnd() { const d = new Date(); d.setDate(d.getDate() + (6 - d.getDay())); return d.toISOString().split('T')[0]; }
const fmtDate = (iso: string) => formatDateShort(iso);

type DateFilter = 'all' | 'today' | 'tomorrow' | 'week';
type TaskStatus = 'suggested' | 'pending' | 'in_progress' | 'completed' | 'cancelled';

const DATE_CHIPS: { label: string; value: DateFilter }[] = [
  { label: 'All',       value: 'all' },
  { label: 'Today',     value: 'today' },
  { label: 'Tomorrow',  value: 'tomorrow' },
  { label: 'This Week', value: 'week' },
];

const TYPE_META: Record<DriverTaskType, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  airport_pickup:    { label: 'Pickup',   bg: 'bg-blue-100',   text: 'text-blue-700',   icon: <Plane className="w-3.5 h-3.5" /> },
  airport_dropoff:   { label: 'Drop-off', bg: 'bg-purple-100', text: 'text-purple-700', icon: <Plane className="w-3.5 h-3.5 rotate-90" /> },
  mulaqat_transport: { label: 'Mulaqat',  bg: 'bg-green-100',  text: 'text-green-700',  icon: <Building2 className="w-3.5 h-3.5" /> },
  other:             { label: 'Other',    bg: 'bg-gray-100',   text: 'text-gray-700',   icon: <Package className="w-3.5 h-3.5" /> },
};

const STATUS_CLS: Record<string, string> = {
  suggested:   'bg-gray-100 text-gray-600',
  pending:     'bg-amber-100 text-amber-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed:   'bg-green-100 text-green-700',
  cancelled:   'bg-red-100 text-red-700',
};

const PRIORITY_META: Record<DriverTaskPriority, { label: string; cls: string }> = {
  normal: { label: 'Normal', cls: 'bg-gray-100 text-gray-600' },
  urgent: { label: '! Urgent', cls: 'bg-red-100 text-red-700' },
  vip:    { label: '⭐ VIP',   cls: 'bg-purple-100 text-purple-700' },
};

const PRIORITY_ORDER: Record<DriverTaskPriority, number> = { urgent: 0, vip: 1, normal: 2 };

function sortByPriority<T extends { priority?: DriverTaskPriority; scheduled_date: string; scheduled_time?: string }>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority ?? 'normal'];
    const pb = PRIORITY_ORDER[b.priority ?? 'normal'];
    if (pa !== pb) return pa - pb;
    const d = a.scheduled_date.localeCompare(b.scheduled_date);
    return d !== 0 ? d : (a.scheduled_time ?? '').localeCompare(b.scheduled_time ?? '');
  });
}

// Extended task with extra DB fields
interface AllTask extends DriverTask {
  is_suggestion?: boolean;
  priority?: DriverTaskPriority;
  driver_name?: string;
  delegation_country?: string;
  handed_over_from_name?: string;
  handed_over_at?: string;
  handover_reason?: string;
  location?: string;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DriverAllTasksPage() {
  const { user } = useAuth();

  const [suggested, setSuggested]   = useState<AllTask[]>([]);
  const [active, setActive]         = useState<AllTask[]>([]);
  const [completedToday, setCompletedToday] = useState<AllTask[]>([]);
  const [drivers, setDrivers]       = useState<DriverInfo[]>([]);
  const [loading, setLoading]       = useState(true);

  const [dateFilter, setDateFilter]  = useState<DateFilter>('all');
  const [driverFilter, setDriverFilter] = useState('');
  const [search, setSearch]          = useState('');

  const [assignTo, setAssignTo]      = useState<Record<string, string>>({});
  const [rejectTask, setRejectTask]   = useState<AllTask | null>(null);
  const [cancelTask, setCancelTask]   = useState<AllTask | null>(null);
  const [handoverTask, setHandoverTask] = useState<AllTask | null>(null);
  const [createOpen, setCreateOpen]   = useState(false);
  const [createDriverId, setCreateDriverId] = useState('');
  const [reportOpen, setReportOpen]   = useState(false);

  const loadedRef    = useRef(false);
  const channelRef   = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const today    = todayStr();
  const tomorrow = tomorrowStr();
  const weekEnd  = thisWeekEnd();

  // ── fetch ─────────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    if (!user?.transportDepartmentId) return;
    try {
      const [tasksRes, driversRes] = await Promise.all([
        supabase
          .from('driver_tasks')
          .select('*')
          .eq('transport_department_id', user.transportDepartmentId)
          .not('status', 'in', '("cancelled")')
          .order('scheduled_date').order('scheduled_time'),
        supabase
          .from('users')
          .select('id,name,vehicle_type,vehicle_model,vehicle_capacity,is_available')
          .eq('role', 'driver')
          .eq('transport_department_id', user.transportDepartmentId)
          .order('name'),
      ]);

      const all = (tasksRes.data as AllTask[]) ?? [];
      setSuggested(sortByPriority(all.filter(t => t.is_suggestion && t.status === 'suggested')));
      setActive(sortByPriority(all.filter(t => !t.is_suggestion && (t.status === 'pending' || t.status === 'in_progress'))));
      setCompletedToday(all.filter(t => t.status === 'completed' && t.scheduled_date === today));
      setDrivers((driversRes.data as DriverInfo[]) ?? []);
    } catch {
      // table may not exist
    } finally {
      setLoading(false);
    }
  }, [user?.transportDepartmentId, today]);

  useEffect(() => {
    if (!user?.transportDepartmentId || loadedRef.current) return;
    loadedRef.current = true;
    fetchAll();
  }, [user?.transportDepartmentId, fetchAll]);

  // ── real-time ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.transportDepartmentId) return;
    const channel = supabase
      .channel('all-driver-tasks')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'driver_tasks', filter: `transport_department_id=eq.${user.transportDepartmentId}` },
        () => { fetchAll(); }
      )
      .subscribe();
    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [user?.transportDepartmentId, fetchAll]);

  // ── filters ────────────────────────────────────────────────────────────────────
  function applyFilters(tasks: AllTask[]) {
    return tasks.filter(t => {
      if (dateFilter === 'today'    && t.scheduled_date !== today)    return false;
      if (dateFilter === 'tomorrow' && t.scheduled_date !== tomorrow)  return false;
      if (dateFilter === 'week'     && (t.scheduled_date < today || t.scheduled_date > weekEnd)) return false;
      if (driverFilter && t.driver_id !== driverFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = [t.guest_name, t.delegation_name, t.driver_name, t.flight_number, t.pickup_location, t.dropoff_location]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  const filteredSuggested     = useMemo(() => applyFilters(suggested),     [suggested, dateFilter, driverFilter, search, today, tomorrow, weekEnd]); // eslint-disable-line react-hooks/exhaustive-deps
  const filteredActive        = useMemo(() => applyFilters(active),        [active, dateFilter, driverFilter, search, today, tomorrow, weekEnd]);     // eslint-disable-line react-hooks/exhaustive-deps
  const filteredCompletedToday = useMemo(() => applyFilters(completedToday), [completedToday, dateFilter, driverFilter, search, today, tomorrow, weekEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── actions ────────────────────────────────────────────────────────────────────
  const handleAssignSuggestion = useCallback(async (task: AllTask) => {
    const drId = assignTo[task.id];
    if (!drId) { toast.error('Select a driver first'); return; }
    const driver = drivers.find(d => d.id === drId);
    try {
      await supabase.from('driver_tasks').update({
        driver_id:    drId,
        driver_name:  driver?.name ?? null,
        status:       'pending',
        is_suggestion: false,
        approved_by:  user?.id,
        approved_at:  new Date().toISOString(),
      }).eq('id', task.id);
      toast.success(`Task assigned to ${driver?.name ?? 'driver'}`);
      fetchAll();
    } catch {
      toast.error('Failed to assign task');
    }
  }, [assignTo, drivers, user?.id, fetchAll]);

  const handleRejectConfirm = useCallback(async () => {
    if (!rejectTask) return;
    const id = rejectTask.id;
    setRejectTask(null);
    try {
      await supabase.from('driver_tasks').update({ status: 'cancelled' }).eq('id', id);
      setSuggested(prev => prev.filter(t => t.id !== id));
      toast.success('Suggestion rejected');
    } catch {
      toast.error('Failed to reject suggestion');
    }
  }, [rejectTask]);

  const handleReassign = useCallback(async (task: AllTask, newDriverId: string) => {
    const driver = drivers.find(d => d.id === newDriverId);
    try {
      await supabase.from('driver_tasks').update({
        driver_id: newDriverId, driver_name: driver?.name ?? null,
      }).eq('id', task.id);
      toast.success(`Task reassigned to ${driver?.name ?? 'driver'}`);
      fetchAll();
    } catch {
      toast.error('Failed to reassign task');
    }
  }, [drivers, fetchAll]);

  const handleCancelConfirm = useCallback(async () => {
    if (!cancelTask) return;
    const id = cancelTask.id;
    setCancelTask(null);
    try {
      await supabase.from('driver_tasks').update({ status: 'cancelled' }).eq('id', id);
      setActive(prev => prev.filter(t => t.id !== id));
      toast.success('Task cancelled');
    } catch {
      toast.error('Failed to cancel task');
    }
  }, [cancelTask]);

  const handleTaskCreated = useCallback((task: AllTask) => {
    setActive(prev => [...prev, task].sort((a, b) => {
      const d = a.scheduled_date.localeCompare(b.scheduled_date);
      return d !== 0 ? d : (a.scheduled_time ?? '').localeCompare(b.scheduled_time ?? '');
    }));
  }, []);

  const totalCount = suggested.length + active.length;

  // ── Task row component (shared between sections) ──────────────────────────────
  const TaskTypeBadge = ({ type }: { type: DriverTaskType }) => {
    const m = TYPE_META[type];
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${m.bg} ${m.text}`}>
        {m.icon}{m.label}
      </span>
    );
  };

  return (
    <div className="flex min-h-screen bg-[#F5F0E8]">
      <DriverSidebar />

      <main className="ml-64 flex-1">
        <TopBar />
        <div className="p-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#1A1A1A] flex items-center gap-2">
              All Tasks
              {user?.transportDepartmentName && <span className="text-base font-normal text-[#4A4A4A]">— {user.transportDepartmentName}</span>}
              <span className="text-sm font-bold bg-[#2D5A45] text-white px-2 py-0.5 rounded-full">{totalCount}</span>
            </h1>
            <p className="text-sm text-[#4A4A4A] mt-0.5">Tasks for all drivers in your transport department</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setReportOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white text-[#2D5A45] border border-[#2D5A45] text-sm font-medium rounded-xl hover:bg-[#F5F0E8] transition-colors"
            >
              <FileText className="w-4 h-4" /> Daily Report
            </button>
            <button
              onClick={() => { setCreateDriverId(''); setCreateOpen(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-[#2D5A45] text-white text-sm font-medium rounded-xl hover:bg-[#234839] transition-colors"
            >
              <Plus className="w-4 h-4" /> Create Task
            </button>
          </div>
        </div>

        {/* Filter row */}
        <div className="bg-white rounded-xl border border-[#E8E3DB] p-4 mb-6 flex flex-wrap items-center gap-3">
          {/* Driver filter */}
          <select
            value={driverFilter}
            onChange={e => setDriverFilter(e.target.value)}
            className="border border-[#E8E3DB] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#2D5A45] bg-white"
          >
            <option value="">All Drivers</option>
            {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>

          <div className="w-px h-6 bg-[#E8E3DB]" />

          {/* Date chips */}
          <div className="flex gap-1.5">
            {DATE_CHIPS.map(c => (
              <button
                key={c.value}
                onClick={() => setDateFilter(c.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  dateFilter === c.value ? 'bg-[#2D5A45] text-white' : 'border border-[#E8E3DB] text-[#4A4A4A] hover:bg-[#F5F0E8]'
                }`}
              >{c.label}</button>
            ))}
          </div>

          {/* Search */}
          <div className="relative ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search tasks…"
              className="pl-9 pr-4 py-2 text-sm border border-[#E8E3DB] rounded-lg focus:outline-none focus:border-[#2D5A45] bg-white w-48"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#4A4A4A] hover:text-[#1A1A1A]">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-[#4A4A4A]">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading tasks…
          </div>
        ) : (
          <div className="space-y-6">
            {/* Section A — Suggested */}
            <section className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-amber-100 bg-amber-50/50">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <h2 className="font-semibold text-[#1A1A1A] text-sm">
                  Suggested Tasks — needs assignment
                  <span className="ml-2 text-xs font-bold bg-amber-500 text-white px-1.5 py-0.5 rounded-full">{filteredSuggested.length}</span>
                </h2>
              </div>
              {filteredSuggested.length === 0 ? (
                <p className="text-center py-8 text-sm text-[#4A4A4A]">No unassigned suggestions.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#E8E3DB] bg-[#F5F0E8]/30">
                        {['Date', 'Time', 'Type', 'Guest', 'Route', 'Flight', 'Pax', 'Assign To', ''].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8E3DB]">
                      {filteredSuggested.map(task => (
                        <tr key={task.id} className="hover:bg-[#F5F0E8]/40 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <Bot className="w-3 h-3 text-gray-400" />
                              <span className="font-medium text-[#1A1A1A]">{fmtDate(task.scheduled_date)}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-[#4A4A4A]">{task.scheduled_time ?? '—'}</td>
                          <td className="px-4 py-3 whitespace-nowrap"><TaskTypeBadge type={task.task_type} /></td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-2 max-w-[150px]">
                              {(task.guest_name ?? task.delegation_name) && (
                                <GuestAvatar name={task.guest_name ?? task.delegation_name ?? ''} />
                              )}
                              <span className="font-medium text-[#1A1A1A] truncate">{task.guest_name ?? task.delegation_name ?? '—'}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[#4A4A4A] text-xs whitespace-nowrap">
                            {task.pickup_location && task.dropoff_location
                              ? <>{task.pickup_location} <span className="text-[#D4CFC7]">→</span> {task.dropoff_location}</>
                              : '—'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-[#4A4A4A] text-xs">{task.flight_number ?? '—'}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-center text-[#4A4A4A]">{task.passenger_count ?? '—'}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <select
                              value={assignTo[task.id] ?? ''}
                              onChange={e => setAssignTo(prev => ({ ...prev, [task.id]: e.target.value }))}
                              className="border border-[#E8E3DB] rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-[#2D5A45] bg-white min-w-[150px]"
                            >
                              <option value="">Select driver…</option>
                              {drivers.map(d => (
                                <option key={d.id} value={d.id}>
                                  {d.name}
                                  {d.vehicle_capacity != null ? ` (${d.vehicle_capacity} pax)` : ''}
                                  {d.is_available === true ? ' 🟢' : d.is_available === false ? ' 🔴' : ''}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleAssignSuggestion(task)}
                                className="px-2.5 py-1 text-xs font-medium bg-[#2D5A45] text-white rounded-lg hover:bg-[#234839] transition-colors"
                              >Assign</button>
                              <button
                                onClick={() => setRejectTask(task)}
                                className="px-2.5 py-1 text-xs font-medium border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                              >Reject</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Section B — Active (grouped by driver) */}
            <section className="bg-white rounded-2xl border border-[#E8E3DB] shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-[#E8E3DB]">
                <Clock className="w-4 h-4 text-[#2D5A45]" />
                <h2 className="font-semibold text-[#1A1A1A] text-sm">
                  Active Tasks
                  <span className="ml-2 text-xs font-bold bg-[#2D5A45] text-white px-1.5 py-0.5 rounded-full">{filteredActive.length}</span>
                </h2>
              </div>
              {filteredActive.length === 0 ? (
                <p className="text-center py-8 text-sm text-[#4A4A4A]">No active tasks.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#E8E3DB] bg-[#F5F0E8]/30">
                        {['Priority', 'Driver', 'Date', 'Time', 'Type', 'Guest', 'Route', 'Status', 'Actions'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8E3DB]">
                      {filteredActive.map(task => {
                        const pm = PRIORITY_META[task.priority ?? 'normal'];
                        return (
                          <tr key={task.id} className="hover:bg-[#F5F0E8]/40 transition-colors">
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${pm.cls}`}>{pm.label}</span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap font-medium text-[#1A1A1A]">{task.driver_name ?? '—'}</td>
                            <td className="px-4 py-3 whitespace-nowrap font-medium text-[#1A1A1A]">{fmtDate(task.scheduled_date)}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-[#4A4A4A]">{task.scheduled_time ?? '—'}</td>
                            <td className="px-4 py-3 whitespace-nowrap"><TaskTypeBadge type={task.task_type} /></td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="flex items-center gap-2 max-w-[150px]">
                                {(task.guest_name ?? task.delegation_name) && (
                                  <GuestAvatar name={task.guest_name ?? task.delegation_name ?? ''} />
                                )}
                                <span className="text-[#1A1A1A] truncate">{task.guest_name ?? task.delegation_name ?? '—'}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-[#4A4A4A] text-xs whitespace-nowrap">
                              {task.pickup_location && task.dropoff_location
                                ? <>{task.pickup_location} <span className="text-[#D4CFC7]">→</span> {task.dropoff_location}</>
                                : '—'}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_CLS[task.status]}`}>
                                {task.status === 'in_progress' ? 'In Progress' : task.status.charAt(0).toUpperCase() + task.status.slice(1)}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <select
                                  defaultValue=""
                                  onChange={e => { if (e.target.value) handleReassign(task, e.target.value); e.target.value = ''; }}
                                  className="border border-[#E8E3DB] rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-[#2D5A45] bg-white"
                                >
                                  <option value="">Reassign…</option>
                                  {drivers.filter(d => d.id !== task.driver_id).map(d => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                  ))}
                                </select>
                                <button
                                  onClick={() => setHandoverTask(task)}
                                  className="px-2.5 py-1 text-xs font-medium text-amber-600 border border-amber-200 rounded-lg hover:bg-amber-50 transition-colors flex items-center gap-1"
                                ><ArrowRightLeft className="w-3 h-3" />Handover</button>
                                <button
                                  onClick={() => setCancelTask(task)}
                                  className="px-2.5 py-1 text-xs font-medium border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                                >Cancel</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Section C — Completed today */}
            <section className="bg-white rounded-2xl border border-[#E8E3DB] shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-[#E8E3DB]">
                <span className="text-sm">✅</span>
                <h2 className="font-semibold text-[#1A1A1A] text-sm">
                  Completed Today
                  <span className="ml-2 text-xs font-bold bg-green-600 text-white px-1.5 py-0.5 rounded-full">{filteredCompletedToday.length}</span>
                </h2>
              </div>
              {filteredCompletedToday.length === 0 ? (
                <p className="text-center py-8 text-sm text-[#4A4A4A]">None completed today.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#E8E3DB] bg-[#F5F0E8]/30">
                        {['Driver', 'Time', 'Type', 'Guest', 'Route', 'Completed At'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8E3DB]">
                      {filteredCompletedToday.map(task => (
                        <tr key={task.id} className="hover:bg-[#F5F0E8]/40 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap font-medium text-[#1A1A1A]">{task.driver_name ?? '—'}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-[#4A4A4A]">{task.scheduled_time ?? '—'}</td>
                          <td className="px-4 py-3 whitespace-nowrap"><TaskTypeBadge type={task.task_type} /></td>
                          <td className="px-4 py-3 max-w-[130px] truncate text-[#1A1A1A]">{task.guest_name ?? task.delegation_name ?? '—'}</td>
                          <td className="px-4 py-3 text-[#4A4A4A] text-xs whitespace-nowrap">
                            {task.pickup_location && task.dropoff_location
                              ? <>{task.pickup_location} <span className="text-[#D4CFC7]">→</span> {task.dropoff_location}</>
                              : '—'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-[#4A4A4A] text-xs">
                            {task.completed_at ? new Date(task.completed_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
        </div>{/* /p-8 */}
      </main>

      {/* Create Task Dialog */}
      <CreateTaskDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        drivers={drivers}
        preselectedDriverId={createDriverId}
        locationName={user?.location ?? ''}
        departmentName={user?.department}
        onCreated={handleTaskCreated}
      />

      {/* Reject suggestion confirm */}
      <AlertDialog open={!!rejectTask}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject this suggestion?</AlertDialogTitle>
            <AlertDialogDescription>It will be removed from the task pool.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRejectTask(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRejectConfirm} className="bg-red-600 hover:bg-red-700 text-white">Reject</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel task confirm */}
      <AlertDialog open={!!cancelTask}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this task?</AlertDialogTitle>
            <AlertDialogDescription>The task will be marked as cancelled.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCancelTask(null)}>Back</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelConfirm} className="bg-red-600 hover:bg-red-700 text-white">Cancel Task</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Handover dialog */}
      <HandoverDialog
        open={!!handoverTask}
        onClose={() => setHandoverTask(null)}
        task={handoverTask}
        locationName={user?.location}
        preloadedDrivers={drivers}
        onHandedOver={(taskId) => {
          setActive(prev => prev.filter(t => t.id !== taskId));
          setHandoverTask(null);
        }}
      />

      {/* Daily Report dialog */}
      <DailyReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        defaultLocation={user?.location}
        generatedBy={user?.name ?? 'Head Driver'}
      />
    </div>
  );
}
