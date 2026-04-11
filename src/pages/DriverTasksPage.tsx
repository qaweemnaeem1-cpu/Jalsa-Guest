import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Plane, Building2, Package, CheckCircle2, Clock,
  AlertCircle, Loader2, ChevronDown, ChevronUp, X,
  MapPin, User, FileText, CalendarDays,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { DriverSidebar } from '@/components/DriverSidebar';
import { supabase } from '@/lib/supabase';
import type { DriverTask, DriverTaskStatus, DriverTaskType } from '@/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// ── helpers ───────────────────────────────────────────────────────────────────

function todayStr()    { return new Date().toISOString().split('T')[0]; }
function tomorrowStr() { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; }
function thisWeekEnd() { const d = new Date(); d.setDate(d.getDate() + (6 - d.getDay())); return d.toISOString().split('T')[0]; }

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

type DateFilter   = 'all' | 'today' | 'tomorrow' | 'week';
type TypeFilter   = 'all' | DriverTaskType;

const DATE_CHIPS: { label: string; value: DateFilter }[] = [
  { label: 'All',       value: 'all' },
  { label: 'Today',     value: 'today' },
  { label: 'Tomorrow',  value: 'tomorrow' },
  { label: 'This Week', value: 'week' },
];
const TYPE_CHIPS: { label: string; value: TypeFilter }[] = [
  { label: 'All',        value: 'all' },
  { label: 'Pickups',    value: 'airport_pickup' },
  { label: 'Drop-offs',  value: 'airport_dropoff' },
  { label: 'Mulaqat',    value: 'mulaqat_transport' },
  { label: 'Other',      value: 'other' },
];

const TYPE_META: Record<DriverTaskType, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  airport_pickup:    { label: 'Pickup',   bg: 'bg-blue-100',   text: 'text-blue-700',   icon: <Plane className="w-3.5 h-3.5" /> },
  airport_dropoff:   { label: 'Drop-off', bg: 'bg-purple-100', text: 'text-purple-700', icon: <Plane className="w-3.5 h-3.5 rotate-90" /> },
  mulaqat_transport: { label: 'Mulaqat',  bg: 'bg-green-100',  text: 'text-green-700',  icon: <Building2 className="w-3.5 h-3.5" /> },
  other:             { label: 'Other',    bg: 'bg-gray-100',   text: 'text-gray-700',   icon: <Package className="w-3.5 h-3.5" /> },
};

const STATUS_META: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  suggested:   { label: 'Suggested',   cls: 'bg-gray-100 text-gray-600',   icon: <AlertCircle className="w-3.5 h-3.5" /> },
  pending:     { label: 'Pending',     cls: 'bg-amber-100 text-amber-700', icon: <Clock className="w-3.5 h-3.5" /> },
  in_progress: { label: 'In Progress', cls: 'bg-blue-100 text-blue-700',   icon: <Loader2 className="w-3.5 h-3.5" /> },
  completed:   { label: 'Completed',   cls: 'bg-green-100 text-green-700', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
};

// Extended task type to carry extra DB columns
interface TaskRow extends DriverTask {
  is_suggestion?: boolean;
  guest_country?: string;
  guest_designation?: string;
  flight_airport?: string;
  flight_terminal?: string;
  pickup_address?: string;
  dropoff_address?: string;
  assigned_by_name?: string;
  assigned_by_role?: string;
  approved_at?: string;
}

// ── expanded detail row ───────────────────────────────────────────────────────

function ExpandedDetail({ task }: { task: TaskRow }) {
  return (
    <tr className="bg-[#F5F0E8]/60">
      <td colSpan={9} className="px-6 py-4">
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          {/* Guest info */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider mb-2 flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> Guest</p>
            {task.guest_name       && <p><span className="text-[#4A4A4A]">Name:</span> <span className="font-medium text-[#1A1A1A]">{task.guest_name}</span></p>}
            {task.guest_country    && <p><span className="text-[#4A4A4A]">Country:</span> <span className="text-[#1A1A1A]">{task.guest_country}</span></p>}
            {task.guest_designation && <p><span className="text-[#4A4A4A]">Designation:</span> <span className="text-[#1A1A1A]">{task.guest_designation}</span></p>}
            {task.delegation_name  && <p><span className="text-[#4A4A4A]">Delegation:</span> <span className="text-[#1A1A1A]">{task.delegation_name}</span></p>}
          </div>

          {/* Flight info */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider mb-2 flex items-center gap-1.5"><Plane className="w-3.5 h-3.5" /> Flight</p>
            {task.flight_number   && <p><span className="text-[#4A4A4A]">Flight:</span> <span className="font-medium text-[#1A1A1A]">{task.flight_number}</span></p>}
            {task.flight_airport  && <p><span className="text-[#4A4A4A]">Airport:</span> <span className="text-[#1A1A1A]">{task.flight_airport}</span></p>}
            {task.flight_terminal && <p><span className="text-[#4A4A4A]">Terminal:</span> <span className="text-[#1A1A1A]">{task.flight_terminal}</span></p>}
          </div>

          {/* Route */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider mb-2 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> Route</p>
            {task.pickup_address  && <p><span className="text-[#4A4A4A]">Pickup:</span> <span className="text-[#1A1A1A]">{task.pickup_address}</span></p>}
            {task.dropoff_address && <p><span className="text-[#4A4A4A]">Drop-off:</span> <span className="text-[#1A1A1A]">{task.dropoff_address}</span></p>}
            {task.pickup_location && !task.pickup_address  && <p><span className="text-[#4A4A4A]">From:</span> <span className="text-[#1A1A1A]">{task.pickup_location}</span></p>}
            {task.dropoff_location && !task.dropoff_address && <p><span className="text-[#4A4A4A]">To:</span> <span className="text-[#1A1A1A]">{task.dropoff_location}</span></p>}
          </div>

          {/* Notes + assigned by */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider mb-2 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Notes</p>
            {task.notes ? (
              <p className="text-[#1A1A1A] italic">{task.notes}</p>
            ) : (
              <p className="text-[#4A4A4A] italic">No notes</p>
            )}
            {task.assigned_by_name && (
              <p className="mt-2"><span className="text-[#4A4A4A]">Assigned by:</span> <span className="font-medium text-[#1A1A1A]">{task.assigned_by_name}</span>{task.assigned_by_role ? ` · ${task.assigned_by_role}` : ''}</p>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── confirm dialog ────────────────────────────────────────────────────────────

interface ConfirmDlgProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  confirmCls?: string;
  onConfirm: () => void;
  onCancel: () => void;
}
function ConfirmDlg({ open, title, description, confirmLabel, confirmCls, onConfirm, onCancel }: ConfirmDlgProps) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={confirmCls ?? 'bg-[#2D5A45] hover:bg-[#234839] text-white'}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── task table ────────────────────────────────────────────────────────────────

interface TaskTableProps {
  tasks: TaskRow[];
  mode: 'suggested' | 'active';
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onAccept?: (task: TaskRow) => void;
  onDecline?: (task: TaskRow) => void;
  onStart?: (task: TaskRow) => void;
  onComplete?: (task: TaskRow) => void;
  onCancel?: (task: TaskRow) => void;
}

function TaskTable({ tasks, mode, expandedId, onToggleExpand, onAccept, onDecline, onStart, onComplete, onCancel }: TaskTableProps) {
  if (tasks.length === 0) {
    return (
      <div className="text-center py-8 text-[#4A4A4A] text-sm">
        No {mode === 'suggested' ? 'suggested' : 'active'} tasks.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#E8E3DB] bg-[#F5F0E8]/50">
            <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Date</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Time</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Type</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Guest / Delegation</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Route</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Flight</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Pax</th>
            {mode === 'active' && (
              <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Status</th>
            )}
            <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E8E3DB]">
          {tasks.map(task => {
            const tm = TYPE_META[task.task_type];
            const sm = STATUS_META[task.status];
            const expanded = expandedId === task.id;
            const label = task.guest_name ?? task.delegation_name ?? '—';

            return (
              <>
                <tr
                  key={task.id}
                  className="hover:bg-[#F5F0E8]/50 transition-colors cursor-pointer"
                  onClick={() => onToggleExpand(task.id)}
                >
                  <td className="px-4 py-3 whitespace-nowrap font-medium text-[#1A1A1A]">{fmtDate(task.scheduled_date)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-[#4A4A4A]">{task.scheduled_time ?? '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${tm.bg} ${tm.text}`}>
                      {tm.icon}{tm.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-[160px] truncate font-medium text-[#1A1A1A]">{label}</td>
                  <td className="px-4 py-3 text-[#4A4A4A] whitespace-nowrap text-xs">
                    {task.pickup_location && task.dropoff_location
                      ? <>{task.pickup_location} <span className="text-[#D4CFC7]">→</span> {task.dropoff_location}</>
                      : task.pickup_location ?? task.dropoff_location ?? '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-[#4A4A4A] text-xs">{task.flight_number ?? '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-center text-[#4A4A4A]">{task.passenger_count ?? '—'}</td>
                  {mode === 'active' && (
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${sm.cls}`}>
                        {sm.icon}{sm.label}
                      </span>
                    </td>
                  )}
                  <td className="px-4 py-3 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {mode === 'suggested' && (
                        <>
                          <button
                            onClick={() => onAccept?.(task)}
                            className="px-2.5 py-1 text-xs font-medium bg-[#2D5A45] text-white rounded-lg hover:bg-[#234839] transition-colors"
                          >Accept</button>
                          <button
                            onClick={() => onDecline?.(task)}
                            className="px-2.5 py-1 text-xs font-medium border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                          >Decline</button>
                        </>
                      )}
                      {mode === 'active' && task.status === 'pending' && (
                        <>
                          <button
                            onClick={() => onStart?.(task)}
                            className="px-2.5 py-1 text-xs font-medium bg-[#2D5A45] text-white rounded-lg hover:bg-[#234839] transition-colors"
                          >Start Journey</button>
                          <button
                            onClick={() => onCancel?.(task)}
                            className="px-2.5 py-1 text-xs font-medium border border-[#E8E3DB] text-[#4A4A4A] rounded-lg hover:bg-[#F5F0E8] transition-colors"
                          >Cancel</button>
                        </>
                      )}
                      {mode === 'active' && task.status === 'in_progress' && (
                        <>
                          <button
                            onClick={() => onComplete?.(task)}
                            className="px-2.5 py-1 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                          >Complete</button>
                          <button
                            onClick={() => onCancel?.(task)}
                            className="px-2.5 py-1 text-xs font-medium border border-[#E8E3DB] text-[#4A4A4A] rounded-lg hover:bg-[#F5F0E8] transition-colors"
                          >Cancel</button>
                        </>
                      )}
                      <button
                        onClick={() => onToggleExpand(task.id)}
                        className="p-1 text-[#4A4A4A] hover:text-[#2D5A45] rounded-md hover:bg-[#F5F0E8] transition-colors"
                        title={expanded ? 'Collapse' : 'Expand'}
                      >
                        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
                {expanded && <ExpandedDetail key={`exp-${task.id}`} task={task} />}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function DriverTasksPage() {
  const { user } = useAuth();

  const [tasks, setTasks]         = useState<TaskRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Confirm dialogs
  const [declineTask, setDeclineTask]   = useState<TaskRow | null>(null);
  const [cancelTask, setCancelTask]     = useState<TaskRow | null>(null);

  const loadedRef = useRef(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── fetch ────────────────────────────────────────────────────────────────────
  const fetchTasks = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data } = await supabase
        .from('driver_tasks')
        .select('*')
        .eq('driver_id', user.id)
        .not('status', 'in', '("completed","cancelled")')
        .order('scheduled_date')
        .order('scheduled_time');
      setTasks((data as TaskRow[]) ?? []);
    } catch {
      // table may not exist yet
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || loadedRef.current) return;
    loadedRef.current = true;
    fetchTasks();
  }, [user?.id, fetchTasks]);

  // ── real-time subscription ────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('driver-tasks-active')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'driver_tasks', filter: `driver_id=eq.${user.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const t = payload.new as TaskRow;
            if (!['completed', 'cancelled'].includes(t.status)) {
              setTasks(prev => [...prev, t].sort((a, b) => {
                const d = a.scheduled_date.localeCompare(b.scheduled_date);
                return d !== 0 ? d : (a.scheduled_time ?? '').localeCompare(b.scheduled_time ?? '');
              }));
            }
          } else if (payload.eventType === 'UPDATE') {
            const t = payload.new as TaskRow;
            if (['completed', 'cancelled'].includes(t.status)) {
              setTasks(prev => prev.filter(x => x.id !== t.id));
            } else {
              setTasks(prev => prev.map(x => x.id === t.id ? t : x));
            }
          } else if (payload.eventType === 'DELETE') {
            setTasks(prev => prev.filter(x => x.id !== (payload.old as TaskRow).id));
          }
        }
      )
      .subscribe();

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  // ── actions ───────────────────────────────────────────────────────────────────

  const handleAccept = useCallback(async (task: TaskRow) => {
    try {
      await supabase
        .from('driver_tasks')
        .update({ status: 'pending', is_suggestion: false, approved_by: user?.id, approved_at: new Date().toISOString() })
        .eq('id', task.id);
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'pending' as DriverTaskStatus, is_suggestion: false } : t));
      toast.success('Task accepted');
    } catch {
      toast.error('Failed to accept task');
    }
  }, [user?.id]);

  const handleDecline = useCallback(async () => {
    if (!declineTask) return;
    const id = declineTask.id;
    setDeclineTask(null);
    try {
      await supabase.from('driver_tasks').update({ status: 'cancelled' }).eq('id', id);
      setTasks(prev => prev.filter(t => t.id !== id));
      toast.success('Task declined');
    } catch {
      toast.error('Failed to decline task');
    }
  }, [declineTask]);

  const handleStart = useCallback(async (task: TaskRow) => {
    try {
      await supabase
        .from('driver_tasks')
        .update({ status: 'in_progress', started_at: new Date().toISOString() })
        .eq('id', task.id);
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'in_progress' as DriverTaskStatus } : t));
      toast.success('Journey started — drive safe!');
    } catch {
      toast.error('Failed to start journey');
    }
  }, []);

  const handleComplete = useCallback(async (task: TaskRow) => {
    try {
      await supabase
        .from('driver_tasks')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', task.id);
      setTasks(prev => prev.filter(t => t.id !== task.id));
      toast.success('Task completed');
    } catch {
      toast.error('Failed to complete task');
    }
  }, []);

  const handleCancelConfirm = useCallback(async () => {
    if (!cancelTask) return;
    const id = cancelTask.id;
    setCancelTask(null);
    try {
      await supabase.from('driver_tasks').update({ status: 'cancelled' }).eq('id', id);
      setTasks(prev => prev.filter(t => t.id !== id));
      toast.success('Task cancelled');
    } catch {
      toast.error('Failed to cancel task');
    }
  }, [cancelTask]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  }, []);

  // ── filter logic ──────────────────────────────────────────────────────────────
  const today    = todayStr();
  const tomorrow = tomorrowStr();
  const weekEnd  = thisWeekEnd();

  const filtered = useMemo(() => {
    return tasks.filter(t => {
      // date
      if (dateFilter === 'today'    && t.scheduled_date !== today)    return false;
      if (dateFilter === 'tomorrow' && t.scheduled_date !== tomorrow)  return false;
      if (dateFilter === 'week'     && (t.scheduled_date < today || t.scheduled_date > weekEnd)) return false;
      // type
      if (typeFilter !== 'all' && t.task_type !== typeFilter) return false;
      // search
      if (search) {
        const q = search.toLowerCase();
        const haystack = [t.guest_name, t.delegation_name, t.flight_number, t.pickup_location, t.dropoff_location, t.notes]
          .filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [tasks, dateFilter, typeFilter, search, today, tomorrow, weekEnd]);

  const suggested = useMemo(() => filtered.filter(t => t.is_suggestion && t.status === 'suggested'), [filtered]);
  const active    = useMemo(() => filtered.filter(t => !t.is_suggestion && (t.status === 'pending' || t.status === 'in_progress')), [filtered]);

  const totalCount = tasks.length;

  return (
    <div className="flex min-h-screen bg-[#F5F0E8]">
      <DriverSidebar />

      <main className="ml-64 flex-1 p-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#1A1A1A] flex items-center gap-2">
              My Tasks
              <span className="text-sm font-bold bg-[#2D5A45] text-white px-2 py-0.5 rounded-full">{totalCount}</span>
            </h1>
            <p className="text-sm text-[#4A4A4A] mt-0.5">Active and suggested tasks assigned to you</p>
          </div>
        </div>

        {/* Filter row */}
        <div className="bg-white rounded-xl border border-[#E8E3DB] p-4 mb-6 flex flex-wrap items-center gap-3">
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

          <div className="w-px h-6 bg-[#E8E3DB]" />

          {/* Type chips */}
          <div className="flex gap-1.5">
            {TYPE_CHIPS.map(c => (
              <button
                key={c.value}
                onClick={() => setTypeFilter(c.value as TypeFilter)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  typeFilter === c.value ? 'bg-[#2D5A45] text-white' : 'border border-[#E8E3DB] text-[#4A4A4A] hover:bg-[#F5F0E8]'
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
              className="pl-9 pr-4 py-2 text-sm border border-[#E8E3DB] rounded-lg focus:outline-none focus:border-[#2D5A45] bg-white w-52"
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
            {/* Suggested tasks */}
            {(suggested.length > 0 || typeFilter === 'all') && (
              <section className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-4 border-b border-amber-100 bg-amber-50/50">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <h2 className="font-semibold text-[#1A1A1A] text-sm">
                    Suggested Tasks — needs your approval
                    <span className="ml-2 text-xs font-bold bg-amber-500 text-white px-1.5 py-0.5 rounded-full">{suggested.length}</span>
                  </h2>
                </div>
                <TaskTable
                  tasks={suggested}
                  mode="suggested"
                  expandedId={expandedId}
                  onToggleExpand={toggleExpand}
                  onAccept={handleAccept}
                  onDecline={setDeclineTask}
                />
              </section>
            )}

            {/* Active tasks */}
            <section className="bg-white rounded-2xl border border-[#E8E3DB] shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-[#E8E3DB]">
                <CalendarDays className="w-4 h-4 text-[#2D5A45]" />
                <h2 className="font-semibold text-[#1A1A1A] text-sm">
                  Active Tasks
                  <span className="ml-2 text-xs font-bold bg-[#2D5A45] text-white px-1.5 py-0.5 rounded-full">{active.length}</span>
                </h2>
              </div>
              <TaskTable
                tasks={active}
                mode="active"
                expandedId={expandedId}
                onToggleExpand={toggleExpand}
                onStart={handleStart}
                onComplete={handleComplete}
                onCancel={setCancelTask}
              />
            </section>
          </div>
        )}
      </main>

      {/* Decline confirm */}
      <ConfirmDlg
        open={!!declineTask}
        title="Decline task?"
        description="It will be returned to the task pool for reassignment."
        confirmLabel="Decline"
        confirmCls="bg-red-600 hover:bg-red-700 text-white"
        onConfirm={handleDecline}
        onCancel={() => setDeclineTask(null)}
      />

      {/* Cancel confirm */}
      <ConfirmDlg
        open={!!cancelTask}
        title="Cancel this task?"
        description="The task will be marked as cancelled."
        confirmLabel="Cancel Task"
        confirmCls="bg-red-600 hover:bg-red-700 text-white"
        onConfirm={handleCancelConfirm}
        onCancel={() => setCancelTask(null)}
      />
    </div>
  );
}
