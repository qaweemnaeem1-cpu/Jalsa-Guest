import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Plane, Building2, Package, CheckCircle2,
  Loader2, Eye, X, Clock,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { DriverSidebar } from '@/components/DriverSidebar';
import { TopBar } from '@/components/TopBar';
import { formatDate, formatTimestamp } from '@/utils/dateHelpers';
import { supabase } from '@/lib/supabase';
import type { DriverTask, DriverTaskType } from '@/types';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

// ── helpers ───────────────────────────────────────────────────────────────────

function todayStr()    { return new Date().toISOString().split('T')[0]; }
function thisWeekStart() {
  const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().split('T')[0];
}
function thisMonthStart() {
  const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0];
}

const fmtDate = (iso: string) => formatDate(iso);
const fmtDateTime = (iso: string) => formatTimestamp(iso);
function calcDuration(startIso?: string, endIso?: string): string {
  if (!startIso || !endIso) return '—';
  const mins = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
  if (mins < 0) return '—';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

type PeriodFilter = 'today' | 'week' | 'month' | 'all';
const PERIOD_CHIPS: { label: string; value: PeriodFilter }[] = [
  { label: 'Today',      value: 'today' },
  { label: 'This Week',  value: 'week' },
  { label: 'This Month', value: 'month' },
  { label: 'All Time',   value: 'all' },
];

const TYPE_META: Record<DriverTaskType, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  airport_pickup:    { label: 'Pickup',   bg: 'bg-blue-100',   text: 'text-blue-700',   icon: <Plane className="w-3.5 h-3.5" /> },
  airport_dropoff:   { label: 'Drop-off', bg: 'bg-purple-100', text: 'text-purple-700', icon: <Plane className="w-3.5 h-3.5 rotate-90" /> },
  mulaqat_transport: { label: 'Mulaqat',  bg: 'bg-green-100',  text: 'text-green-700',  icon: <Building2 className="w-3.5 h-3.5" /> },
  other:             { label: 'Other',    bg: 'bg-gray-100',   text: 'text-gray-700',   icon: <Package className="w-3.5 h-3.5" /> },
};

interface CompletedTask extends DriverTask {
  guest_country?: string;
  guest_designation?: string;
  flight_airport?: string;
  flight_terminal?: string;
  pickup_address?: string;
  dropoff_address?: string;
  assigned_by_name?: string;
  assigned_by_role?: string;
  created_at?: string;
  approved_at?: string;
}

// ── timeline item ─────────────────────────────────────────────────────────────

function TimelineItem({ label, time, done }: { label: string; time?: string; done: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${done ? 'bg-green-500' : 'bg-gray-200'}`}>
        {done ? <CheckCircle2 className="w-4 h-4 text-white" /> : <Clock className="w-4 h-4 text-gray-400" />}
      </div>
      <div>
        <p className="text-sm font-medium text-[#1A1A1A]">{label}</p>
        <p className="text-xs text-[#4A4A4A]">{time ? fmtDateTime(time) : '—'}</p>
      </div>
    </div>
  );
}

// ── detail dialog ─────────────────────────────────────────────────────────────

function DetailDialog({ task, onClose }: { task: CompletedTask | null; onClose: () => void }) {
  if (!task) return null;
  const tm = TYPE_META[task.task_type];
  const label = task.guest_name ?? task.delegation_name ?? '—';

  return (
    <Dialog open={!!task} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${tm.bg} ${tm.text}`}>
              {tm.icon}{tm.label}
            </span>
            {label}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            <div><span className="text-[#4A4A4A]">Date:</span> <span className="font-medium">{fmtDate(task.scheduled_date)}</span></div>
            <div><span className="text-[#4A4A4A]">Time:</span> <span className="font-medium">{task.scheduled_time ?? '—'}</span></div>
            {task.passenger_count != null && (
              <div><span className="text-[#4A4A4A]">Passengers:</span> <span className="font-medium">{task.passenger_count}</span></div>
            )}
            {task.flight_number && (
              <div><span className="text-[#4A4A4A]">Flight:</span> <span className="font-medium">{task.flight_number}</span></div>
            )}
            {task.flight_airport && (
              <div><span className="text-[#4A4A4A]">Airport:</span> <span className="font-medium">{task.flight_airport}</span></div>
            )}
            {task.flight_terminal && (
              <div><span className="text-[#4A4A4A]">Terminal:</span> <span className="font-medium">{task.flight_terminal}</span></div>
            )}
            {task.guest_country && (
              <div><span className="text-[#4A4A4A]">Country:</span> <span className="font-medium">{task.guest_country}</span></div>
            )}
            {task.guest_designation && (
              <div><span className="text-[#4A4A4A]">Designation:</span> <span className="font-medium">{task.guest_designation}</span></div>
            )}
          </div>

          {/* Route */}
          {(task.pickup_location || task.dropoff_location) && (
            <div className="bg-[#F5F0E8] rounded-lg px-4 py-3">
              <p className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider mb-1.5">Route</p>
              <p className="text-[#1A1A1A]">
                {task.pickup_address ?? task.pickup_location ?? '?'}
                {' '}<span className="text-[#4A4A4A]">→</span>{' '}
                {task.dropoff_address ?? task.dropoff_location ?? '?'}
              </p>
            </div>
          )}

          {/* Notes */}
          {task.notes && (
            <div>
              <p className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider mb-1">Notes</p>
              <p className="text-[#1A1A1A] italic">{task.notes}</p>
            </div>
          )}

          {/* Timeline */}
          <div>
            <p className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider mb-3">Timeline</p>
            <div className="space-y-3 pl-1">
              <TimelineItem label="Created"   time={task.created_at}    done={!!task.created_at} />
              <TimelineItem label="Accepted"  time={task.approved_at}   done={!!task.approved_at} />
              <TimelineItem label="Started"   time={task.started_at}    done={!!task.started_at} />
              <TimelineItem label="Completed" time={task.completed_at}  done={!!task.completed_at} />
            </div>
          </div>

          {/* Duration */}
          <div className="flex items-center justify-between pt-2 border-t border-[#E8E3DB]">
            <span className="text-[#4A4A4A] text-sm">Trip duration:</span>
            <span className="font-semibold text-[#1A1A1A]">{calcDuration(task.started_at, task.completed_at)}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function DriverCompletedPage() {
  const { user } = useAuth();

  const [tasks, setTasks]           = useState<CompletedTask[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [period, setPeriod]         = useState<PeriodFilter>('week');
  const [detailTask, setDetailTask] = useState<CompletedTask | null>(null);

  const loadedRef = useRef(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const today      = todayStr();
  const weekStart  = thisWeekStart();
  const monthStart = thisMonthStart();

  // ── fetch ────────────────────────────────────────────────────────────────────
  const fetchTasks = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data } = await supabase
        .from('driver_tasks')
        .select('*')
        .eq('driver_id', user.id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false });
      setTasks((data as CompletedTask[]) ?? []);
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

  // ── real-time ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel('driver-completed-tasks')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'driver_tasks', filter: `driver_id=eq.${user.id}` },
        (payload) => {
          const t = payload.new as CompletedTask;
          if (t.status === 'completed') {
            setTasks(prev => {
              const exists = prev.find(x => x.id === t.id);
              if (exists) return prev.map(x => x.id === t.id ? t : x);
              return [t, ...prev];
            });
          }
        }
      )
      .subscribe();
    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  // ── derived stats ─────────────────────────────────────────────────────────────
  const todayCount  = useMemo(() => tasks.filter(t => t.scheduled_date === today).length,     [tasks, today]);
  const weekCount   = useMemo(() => tasks.filter(t => t.scheduled_date >= weekStart).length,  [tasks, weekStart]);
  const totalCount  = tasks.length;

  // ── filtered ─────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return tasks.filter(t => {
      // period
      if (period === 'today' && t.scheduled_date !== today)           return false;
      if (period === 'week'  && t.scheduled_date < weekStart)         return false;
      if (period === 'month' && t.scheduled_date < monthStart)        return false;
      // search
      if (search) {
        const q = search.toLowerCase();
        const haystack = [t.guest_name, t.delegation_name, t.flight_number, t.pickup_location, t.dropoff_location]
          .filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [tasks, period, search, today, weekStart, monthStart]);

  return (
    <div className="flex min-h-screen bg-[#F5F0E8]">
      <DriverSidebar />

      <main className="ml-64 flex-1">
        <TopBar />
        <div className="p-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#1A1A1A] flex items-center gap-2">
            Completed Tasks
            <span className="text-sm font-bold bg-[#2D5A45] text-white px-2 py-0.5 rounded-full">{totalCount}</span>
          </h1>
          <p className="text-sm text-[#4A4A4A] mt-0.5">Your completed task history</p>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Completed today',     value: todayCount },
            { label: 'Completed this week', value: weekCount },
            { label: 'Total completed',     value: totalCount },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-[#E8E3DB] px-5 py-4 text-center shadow-sm">
              <p className="text-2xl font-bold text-[#2D5A45]">{s.value}</p>
              <p className="text-xs text-[#4A4A4A] mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filter row */}
        <div className="bg-white rounded-xl border border-[#E8E3DB] p-4 mb-6 flex flex-wrap items-center gap-3">
          <div className="flex gap-1.5">
            {PERIOD_CHIPS.map(c => (
              <button
                key={c.value}
                onClick={() => setPeriod(c.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  period === c.value ? 'bg-[#2D5A45] text-white' : 'border border-[#E8E3DB] text-[#4A4A4A] hover:bg-[#F5F0E8]'
                }`}
              >{c.label}</button>
            ))}
          </div>

          <div className="relative ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search completed…"
              className="pl-9 pr-4 py-2 text-sm border border-[#E8E3DB] rounded-lg focus:outline-none focus:border-[#2D5A45] bg-white w-52"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#4A4A4A] hover:text-[#1A1A1A]">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-[#E8E3DB] shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-[#4A4A4A]">
              <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-[#4A4A4A] text-sm">
              No completed tasks for this period.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E8E3DB] bg-[#F5F0E8]/50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Time</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Guest / Delegation</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Route</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Duration</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Completed At</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E3DB]">
                  {filtered.map(task => {
                    const tm = TYPE_META[task.task_type];
                    const label = task.guest_name ?? task.delegation_name ?? '—';
                    return (
                      <tr key={task.id} className="hover:bg-[#F5F0E8]/50 transition-colors">
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
                        <td className="px-4 py-3 whitespace-nowrap text-[#4A4A4A]">{calcDuration(task.started_at, task.completed_at)}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-[#4A4A4A] text-xs">
                          {task.completed_at ? fmtDateTime(task.completed_at) : '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <button
                            onClick={() => setDetailTask(task)}
                            className="p-1.5 text-[#4A4A4A] hover:text-[#2D5A45] rounded-md hover:bg-[#F5F0E8] transition-colors"
                            title="View details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </div>{/* /p-8 */}
      </main>

      <DetailDialog task={detailTask} onClose={() => setDetailTask(null)} />
    </div>
  );
}
