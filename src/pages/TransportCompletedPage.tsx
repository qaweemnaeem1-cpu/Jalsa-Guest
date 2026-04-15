/**
 * /transport/completed — Completed tasks for Transport Department Head.
 * Shows all completed tasks across all drivers in the transport department.
 * Filters by transport_department_id (not location).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Plane, Building2, Package, CheckCircle2, Loader2,
  Eye, X, Clock, FileText, Users,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { TransportSidebar } from '@/components/TransportSidebar';
import { TopBar } from '@/components/TopBar';
import { supabase } from '@/lib/supabase';
import { DailyReportDialog } from '@/components/DailyReportDialog';
import type { DriverTaskType, DriverTaskPriority } from '@/types';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { getMapLink, looksLikeAirport } from '@/lib/driverMatchUtils';

// ── helpers ───────────────────────────────────────────────────────────────────

function todayStr()     { return new Date().toISOString().split('T')[0]; }
function thisWeekStart() {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d.toISOString().split('T')[0];
}
function thisMonthStart() {
  const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0];
}
function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}
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

const PRIORITY_META: Record<DriverTaskPriority, { label: string; cls: string }> = {
  normal: { label: 'Normal',   cls: 'bg-gray-100 text-gray-600' },
  urgent: { label: '! Urgent', cls: 'bg-red-100 text-red-700' },
  vip:    { label: '⭐ VIP',   cls: 'bg-purple-100 text-purple-700' },
};

// ── types ─────────────────────────────────────────────────────────────────────

interface CompletedTask {
  id: string;
  driver_id?: string;
  driver_name?: string;
  task_type: DriverTaskType;
  status: string;
  scheduled_date: string;
  scheduled_time?: string;
  guest_id?: string;
  guest_name?: string;
  delegation_name?: string;
  pickup_location?: string;
  dropoff_location?: string;
  flight_number?: string;
  passenger_count?: number;
  start_mileage?: number;
  end_mileage?: number;
  started_at?: string;
  completed_at?: string;
  created_at?: string;
  approved_at?: string;
  approved_by_name?: string;
  priority?: DriverTaskPriority;
  notes?: string;
  handover_from_driver_name?: string;
  handover_at?: string;
  handover_reason?: string;
  transport_department_id?: string;
  driver_task_passengers?: { id: string; guest_name: string; guest_phone?: string }[];
}

interface GuestContact {
  full_name: string;
  country?: string;
  designation?: string;
  contact_number?: string;
  photo_url?: string;
}

// ── timeline item ─────────────────────────────────────────────────────────────

function TimelineItem({ label, time, by, done }: { label: string; time?: string; by?: string; done: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${done ? 'bg-green-500' : 'bg-gray-200'}`}>
        {done ? <CheckCircle2 className="w-4 h-4 text-white" /> : <Clock className="w-4 h-4 text-gray-400" />}
      </div>
      <div>
        <p className="text-sm font-medium text-[#1A1A1A]">{label}</p>
        <p className="text-xs text-[#4A4A4A]">
          {time ? fmtDateTime(time) : '—'}
          {by ? ` · ${by}` : ''}
        </p>
      </div>
    </div>
  );
}

// ── detail dialog ─────────────────────────────────────────────────────────────

function DetailDialog({ task, onClose }: { task: CompletedTask | null; onClose: () => void }) {
  const [guest, setGuest] = useState<GuestContact | null>(null);

  useEffect(() => {
    if (!task?.guest_id) { setGuest(null); return; }
    supabase
      .from('guests')
      .select('full_name,country,designation,contact_number,photo_url')
      .eq('id', task.guest_id)
      .maybeSingle()
      .then(({ data }) => setGuest(data as GuestContact | null));
  }, [task?.guest_id]);

  if (!task) return null;
  const tm = TYPE_META[task.task_type];
  const pm = PRIORITY_META[task.priority ?? 'normal'];
  const label = guest?.full_name ?? task.guest_name ?? task.delegation_name ?? '—';
  const mileageDist = task.start_mileage != null && task.end_mileage != null && task.end_mileage > task.start_mileage
    ? task.end_mileage - task.start_mileage : null;

  const airportStr = task.task_type === 'airport_pickup' ? task.pickup_location : task.dropoff_location;
  const mapLink = looksLikeAirport(airportStr) ? getMapLink(airportStr) : null;

  return (
    <Dialog open={!!task} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            Completed Task — {tm.label} {label}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 text-sm">
          {/* Guest */}
          <div>
            <p className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider mb-2">Guest</p>
            <div className="flex items-start gap-3 bg-[#F5F0E8] rounded-xl p-3">
              {guest?.photo_url ? (
                <img src={guest.photo_url} alt={label} className="w-14 h-14 rounded-lg object-cover shrink-0" />
              ) : label !== '—' ? (
                <div className="w-14 h-14 bg-[#2D5A45]/10 rounded-lg flex items-center justify-center text-[#2D5A45] font-bold text-lg shrink-0">
                  {label.charAt(0)}
                </div>
              ) : null}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[#1A1A1A]">{label}</p>
                {(guest?.country || guest?.designation) && (
                  <p className="text-xs text-[#4A4A4A]">{[guest.country, guest.designation].filter(Boolean).join(' · ')}</p>
                )}
                {guest?.contact_number && (
                  <a href={`tel:${guest.contact_number}`}
                    className="flex items-center gap-1 text-[#2D5A45] hover:underline text-xs mt-1">
                    📞 {guest.contact_number}
                    <span className="ml-1 px-1.5 py-0.5 border border-[#2D5A45] rounded text-[10px] font-medium">Call</span>
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Driver */}
          {task.driver_name && (
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
              <div><span className="text-[#4A4A4A]">Driver:</span> <span className="font-medium">{task.driver_name}</span></div>
              <div><span className="text-[#4A4A4A]">Priority:</span>{' '}
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${pm.cls}`}>{pm.label}</span>
              </div>
              {task.flight_number && (
                <div><span className="text-[#4A4A4A]">Flight:</span> <span className="font-medium">✈ {task.flight_number}</span></div>
              )}
              {task.passenger_count != null && (
                <div><span className="text-[#4A4A4A]">Passengers:</span> <span className="font-medium">{task.passenger_count}</span></div>
              )}
            </div>
          )}

          {/* Route */}
          {(task.pickup_location || task.dropoff_location) && (
            <div className="bg-[#F5F0E8] rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider mb-1">Route</p>
              <p className="text-[#1A1A1A] text-sm">
                {task.pickup_location ?? '?'}
                {mapLink && task.task_type === 'airport_pickup' && (
                  <a href={mapLink} target="_blank" rel="noopener noreferrer" className="ml-1 text-[#2D5A45] hover:underline text-xs">📍 Map</a>
                )}
                <span className="text-[#4A4A4A] mx-1">→</span>
                {task.dropoff_location ?? '?'}
                {mapLink && task.task_type === 'airport_dropoff' && (
                  <a href={mapLink} target="_blank" rel="noopener noreferrer" className="ml-1 text-[#2D5A45] hover:underline text-xs">📍 Map</a>
                )}
              </p>
            </div>
          )}

          {/* Timeline */}
          <div>
            <p className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider mb-3">Timeline</p>
            <div className="space-y-3 pl-1">
              <TimelineItem label="Created"   time={task.created_at}   done={!!task.created_at} />
              <TimelineItem label="Assigned"  time={task.approved_at}  by={task.approved_by_name} done={!!task.approved_at} />
              <TimelineItem label="Started"   time={task.started_at}   done={!!task.started_at} />
              <TimelineItem label="Completed" time={task.completed_at} done={!!task.completed_at} />
            </div>
            {task.started_at && task.completed_at && (
              <div className="mt-3 pt-3 border-t border-[#E8E3DB] flex justify-between">
                <span className="text-[#4A4A4A]">Duration:</span>
                <span className="font-semibold">{calcDuration(task.started_at, task.completed_at)}</span>
              </div>
            )}
          </div>

          {/* Mileage */}
          {(task.start_mileage != null || task.end_mileage != null) && (
            <div className="bg-[#F5F0E8] rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider mb-1">Mileage</p>
              <p className="text-[#1A1A1A] text-sm">
                {task.start_mileage != null ? task.start_mileage.toLocaleString() : '—'}
                {' '}→{' '}
                {task.end_mileage != null ? task.end_mileage.toLocaleString() : '—'} km
                {mileageDist != null && (
                  <span className="ml-2 text-[#2D5A45] font-semibold">({mileageDist} km)</span>
                )}
              </p>
            </div>
          )}

          {/* Handover */}
          {task.handover_from_driver_name && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-1">Handover History</p>
              <p className="text-sm text-[#1A1A1A]">
                Handed over from <strong>{task.handover_from_driver_name}</strong>
                {task.handover_at ? ` at ${fmtDateTime(task.handover_at)}` : ''}
              </p>
              {task.handover_reason && (
                <p className="text-xs text-[#4A4A4A] mt-1 italic">Reason: "{task.handover_reason}"</p>
              )}
            </div>
          )}

          {/* Batch passengers */}
          {task.driver_task_passengers && task.driver_task_passengers.length > 1 && (
            <div>
              <p className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider mb-2">
                Passengers ({task.driver_task_passengers.length})
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {task.driver_task_passengers.map((p, i) => (
                  <div key={i} className="bg-[#F5F0E8] rounded-lg px-3 py-1.5 text-xs">
                    <span className="font-medium">{p.guest_name}</span>
                    {p.guest_phone && <span className="text-[#4A4A4A] ml-1">· {p.guest_phone}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {task.notes && (
            <div>
              <p className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider mb-1">Notes</p>
              <p className="text-[#1A1A1A] italic">{task.notes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function TransportCompletedPage() {
  const { user } = useAuth();
  const tdId   = user?.transportDepartmentId ?? '';
  const tdName = user?.transportDepartmentName ?? '';

  const [tasks, setTasks]           = useState<CompletedTask[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [period, setPeriod]         = useState<PeriodFilter>('week');
  const [driverFilter, setDriverFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [detailTask, setDetailTask] = useState<CompletedTask | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  const loadedRef  = useRef(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const today      = todayStr();
  const weekStart  = thisWeekStart();
  const monthStart = thisMonthStart();

  // ── fetch ─────────────────────────────────────────────────────────────────
  const fetchTasks = useCallback(async () => {
    if (!tdId) return;
    try {
      const { data } = await supabase
        .from('driver_tasks')
        .select('*, driver_task_passengers(*)')
        .eq('transport_department_id', tdId)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false });
      setTasks((data as CompletedTask[]) ?? []);
    } catch {
      // table may not exist
    } finally {
      setLoading(false);
    }
  }, [tdId]);

  useEffect(() => {
    if (!tdId || loadedRef.current) return;
    loadedRef.current = true;
    fetchTasks();
  }, [tdId, fetchTasks]);

  // ── real-time ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tdId) return;
    const ch = supabase
      .channel('transport-completed')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'driver_tasks',
          filter: `transport_department_id=eq.${tdId}` },
        payload => {
          const t = payload.new as CompletedTask;
          if (t.status === 'completed') {
            setTasks(prev => {
              const exists = prev.find(x => x.id === t.id);
              if (exists) return prev.map(x => x.id === t.id ? { ...x, ...t } : x);
              return [t, ...prev];
            });
          }
        }
      )
      .subscribe();
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [tdId]);

  // ── derived stats ─────────────────────────────────────────────────────────
  const todayCount    = useMemo(() => tasks.filter(t => t.scheduled_date === today).length, [tasks, today]);
  const weekCount     = useMemo(() => tasks.filter(t => t.scheduled_date >= weekStart).length, [tasks, weekStart]);
  const totalCount    = tasks.length;
  const totalPassengers = useMemo(() => tasks.reduce((s, t) => s + (t.passenger_count ?? 1), 0), [tasks]);

  // ── driver options ────────────────────────────────────────────────────────
  const driverOptions = useMemo(() => {
    const names = [...new Set(tasks.map(t => t.driver_name).filter(Boolean))] as string[];
    return names.sort();
  }, [tasks]);

  // ── filtered ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return tasks.filter(t => {
      if (period === 'today' && t.scheduled_date !== today)        return false;
      if (period === 'week'  && t.scheduled_date < weekStart)      return false;
      if (period === 'month' && t.scheduled_date < monthStart)     return false;
      if (driverFilter !== 'all' && t.driver_name !== driverFilter) return false;
      if (typeFilter !== 'all' && t.task_type !== typeFilter)        return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = [t.guest_name, t.delegation_name, t.driver_name, t.flight_number, t.pickup_location, t.dropoff_location]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tasks, period, driverFilter, typeFilter, search, today, weekStart, monthStart]);

  return (
    <div className="flex min-h-screen bg-[#F5F0E8]">
      <TransportSidebar />

      <main className="ml-64 flex-1">
        <TopBar />
        <div className="p-8">

        {/* Header */}
        <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#1A1A1A] flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
              Completed Tasks
              <span className="text-sm font-bold bg-green-600 text-white px-2 py-0.5 rounded-full">{totalCount}</span>
              {tdName && <span className="text-base font-normal text-[#4A4A4A]">— {tdName}</span>}
            </h1>
            <p className="text-sm text-[#4A4A4A] mt-0.5">Full history of completed transport tasks</p>
          </div>
          <button
            onClick={() => setReportOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-[#E8E3DB] bg-white rounded-lg hover:bg-[#F5F0E8] transition-colors"
          >
            <FileText className="w-4 h-4 text-[#2D5A45]" /> Daily Report
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Completed today',       value: todayCount },
            { label: 'Completed this week',   value: weekCount },
            { label: 'Total completed',       value: totalCount },
            { label: 'Total passengers',      value: totalPassengers },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-[#E8E3DB] px-5 py-4 text-center shadow-sm">
              <p className="text-2xl font-bold text-[#2D5A45]">{s.value}</p>
              <p className="text-xs text-[#4A4A4A] mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filter row */}
        <div className="bg-white rounded-xl border border-[#E8E3DB] p-4 mb-6 flex flex-wrap items-center gap-3">
          {/* Driver select */}
          <select
            value={driverFilter}
            onChange={e => setDriverFilter(e.target.value)}
            className="border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45] bg-white"
          >
            <option value="all">All Drivers</option>
            {driverOptions.map(n => <option key={n} value={n}>{n}</option>)}
          </select>

          {/* Type select */}
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45] bg-white"
          >
            <option value="all">All Types</option>
            <option value="airport_pickup">Pickups</option>
            <option value="airport_dropoff">Drop-offs</option>
            <option value="mulaqat_transport">Mulaqat</option>
            <option value="other">Other</option>
          </select>

          {/* Period chips */}
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

          {/* Search */}
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
              <Users className="w-10 h-10 mx-auto mb-3 text-[#D4CFC7]" />
              No completed tasks for this period.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E8E3DB] bg-[#F5F0E8]/50">
                    {['Driver','Date','Time','Type','Guest','Route','Duration','Mileage','Priority','Completed At',''].map(h => (
                      <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E3DB]">
                  {filtered.map(task => {
                    const tm = TYPE_META[task.task_type];
                    const pm = PRIORITY_META[task.priority ?? 'normal'];
                    const label = task.guest_name ?? task.delegation_name ?? '—';
                    const mileageDist = task.start_mileage != null && task.end_mileage != null && task.end_mileage > task.start_mileage
                      ? `${task.end_mileage - task.start_mileage} km` : '—';
                    const airportStr = task.task_type === 'airport_pickup' ? task.pickup_location : task.dropoff_location;
                    const mapLink = looksLikeAirport(airportStr) ? getMapLink(airportStr) : null;

                    return (
                      <tr key={task.id} className="hover:bg-[#F5F0E8]/50 transition-colors">
                        <td className="px-3 py-3 whitespace-nowrap">
                          <p className="font-medium text-[#1A1A1A]">{task.driver_name ?? '—'}</p>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-[#1A1A1A] font-medium">{fmtDate(task.scheduled_date)}</td>
                        <td className="px-3 py-3 whitespace-nowrap text-[#4A4A4A]">{task.scheduled_time ?? '—'}</td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${tm.bg} ${tm.text}`}>
                            {tm.icon}{tm.label}
                          </span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className="font-medium text-[#1A1A1A] max-w-[140px] truncate block">{label}</span>
                        </td>
                        <td className="px-3 py-3 text-[#4A4A4A] text-xs whitespace-nowrap">
                          {task.pickup_location && task.dropoff_location ? (
                            <span>
                              {task.pickup_location}
                              {mapLink && task.task_type === 'airport_pickup' && (
                                <a href={mapLink} target="_blank" rel="noopener noreferrer"
                                  className="ml-1 text-[#2D5A45]">📍</a>
                              )}
                              <span className="text-[#D4CFC7] mx-1">→</span>
                              {task.dropoff_location}
                              {mapLink && task.task_type === 'airport_dropoff' && (
                                <a href={mapLink} target="_blank" rel="noopener noreferrer"
                                  className="ml-1 text-[#2D5A45]">📍</a>
                              )}
                            </span>
                          ) : task.pickup_location ?? task.dropoff_location ?? '—'}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-[#4A4A4A]">{calcDuration(task.started_at, task.completed_at)}</td>
                        <td className="px-3 py-3 whitespace-nowrap text-[#4A4A4A] text-xs">{mileageDist}</td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${pm.cls}`}>{pm.label}</span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-[#4A4A4A] text-xs">
                          {task.completed_at ? fmtDateTime(task.completed_at) : '—'}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
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
        </div>
      </main>

      <DetailDialog task={detailTask} onClose={() => setDetailTask(null)} />

      <DailyReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        defaultLocation={tdName}
        generatedBy={user?.name ?? 'Transport Head'}
        transportDepartmentId={tdId}
      />
    </div>
  );
}
