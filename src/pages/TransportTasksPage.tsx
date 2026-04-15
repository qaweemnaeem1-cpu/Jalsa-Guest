/**
 * /transport/tasks — Full task management for Transport Department Heads.
 * Sub-tabs: Suggested | Active | All
 * Features: assign, reject, reassign, handover, batch pickup, ETA, PDF report, schedule cross-check.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Plane, Building2, Package, AlertCircle, Clock,
  Loader2, ChevronDown, X, Plus, ArrowRightLeft, FileText,
  MapPin, ExternalLink, Phone,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { TransportSidebar } from '@/components/TransportSidebar';
import { TopBar } from '@/components/TopBar';
import { supabase } from '@/lib/supabase';
import type { DriverTask, DriverTaskType, DriverTaskPriority } from '@/types';
import { calculateETA, formatETA, isETAOverdue, getMapLink, looksLikeAirport } from '@/lib/driverMatchUtils';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CreateTaskDialog } from '@/components/CreateTaskDialog';
import type { DriverInfo } from '@/components/CreateTaskDialog';
import { HandoverDialog } from '@/components/HandoverDialog';
import { DailyReportDialog } from '@/components/DailyReportDialog';

// ── helpers ───────────────────────────────────────────────────────────────────

function todayStr()    { return new Date().toISOString().split('T')[0]; }
function tomorrowStr() { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; }
function thisWeekEnd() { const d = new Date(); d.setDate(d.getDate() + (6 - d.getDay())); return d.toISOString().split('T')[0]; }
function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

type DateFilter = 'all' | 'today' | 'tomorrow' | 'week';
type SubTab     = 'suggested' | 'active' | 'all';
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
  normal: { label: 'Normal',    cls: 'bg-gray-100 text-gray-600' },
  urgent: { label: '! Urgent',  cls: 'bg-red-100 text-red-700' },
  vip:    { label: '⭐ VIP',    cls: 'bg-purple-100 text-purple-700' },
};
const PRIORITY_ORDER: Record<DriverTaskPriority, number> = { vip: 0, urgent: 1, normal: 2 };

function sortByPriority<T extends { priority?: DriverTaskPriority; scheduled_date: string; scheduled_time?: string | null }>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority ?? 'normal'];
    const pb = PRIORITY_ORDER[b.priority ?? 'normal'];
    if (pa !== pb) return pa - pb;
    const d = a.scheduled_date.localeCompare(b.scheduled_date);
    return d !== 0 ? d : (a.scheduled_time ?? '').localeCompare(b.scheduled_time ?? '');
  });
}

// ── extended task type ────────────────────────────────────────────────────────

interface AllTask extends DriverTask {
  is_suggestion?: boolean;
  priority?: DriverTaskPriority;
  driver_name?: string;
  handed_over_from_name?: string;
  handed_over_at?: string;
  handover_reason?: string;
  transport_department_id?: string;
  driver_task_passengers?: { guest_name: string; guest_id?: string; guest_phone?: string }[];
}

interface DriverRow extends DriverInfo {
  is_available?: boolean;
  todayTaskCount?: number;
}

// ── guest contact ─────────────────────────────────────────────────────────────

interface GuestContact {
  full_name: string;
  country?: string;
  designation?: string;
  contact_number?: string;
  email?: string;
  photo_url?: string;
}

function useGuestContact(guestId?: string | null) {
  const [contact, setContact] = useState<GuestContact | null>(null);
  useEffect(() => {
    if (!guestId) return;
    supabase
      .from('guests')
      .select('full_name,country,designation,contact_number,email,photo_url')
      .eq('id', guestId)
      .maybeSingle()
      .then(({ data }) => setContact(data as GuestContact | null));
  }, [guestId]);
  return contact;
}

// ── Reassign Dialog ───────────────────────────────────────────────────────────

function ReassignDialog({ task, drivers, onClose, onDone }: {
  task: AllTask | null;
  drivers: DriverRow[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [newDriverId, setNewDriverId] = useState('');
  const [saving, setSaving]           = useState(false);

  useEffect(() => { if (task) setNewDriverId(''); }, [task]);

  const handleSave = async () => {
    if (!task || !newDriverId) return;
    const driver = drivers.find(d => d.id === newDriverId);
    setSaving(true);
    try {
      await supabase.from('driver_tasks').update({
        driver_id:   newDriverId,
        driver_name: driver?.name ?? null,
      }).eq('id', task.id);
      toast.success(`Task reassigned to ${driver?.name ?? 'driver'}`);
      onClose();
      onDone();
    } catch {
      toast.error('Failed to reassign');
    } finally {
      setSaving(false);
    }
  };

  const availDrivers = drivers.filter(d => d.id !== task?.driver_id);

  return (
    <Dialog open={!!task} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-[#2D5A45]" /> Reassign Task
          </DialogTitle>
          {task && <p className="text-sm text-[#4A4A4A]">Currently: {task.driver_name ?? 'Unassigned'}</p>}
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label>New Driver</Label>
            <select value={newDriverId} onChange={e => setNewDriverId(e.target.value)}
              className="w-full border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#2D5A45]">
              <option value="">Select driver…</option>
              {availDrivers.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.vehicle_type ? ` (${d.vehicle_type}` : ''}
                  {d.vehicle_capacity ? ` · ${d.vehicle_capacity} pax)` : d.vehicle_type ? ')' : ''}
                  {d.is_available === false ? ' 🟡 Off Duty' : ''}
                  {(d.todayTaskCount ?? 0) > 0 ? ` — ${d.todayTaskCount} tasks` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !newDriverId}
            className="bg-[#2D5A45] hover:bg-[#234839] text-white">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin mr-1.5" />Saving…</> : 'Reassign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Schedule Cross-check ──────────────────────────────────────────────────────

async function checkDriverSchedule(driverId: string, date: string): Promise<'off' | 'ok' | null> {
  try {
    const { data } = await supabase
      .from('driver_schedules')
      .select('status')
      .eq('driver_id', driverId)
      .eq('date', date)
      .maybeSingle();
    if (!data) return null;
    const s = (data as { status: string }).status;
    if (s === 'off_duty' || s === 'leave') return 'off';
    return 'ok';
  } catch {
    return null;
  }
}

// ── Assign Driver Dropdown (inline in table) ──────────────────────────────────

function AssignDriverInline({ task, drivers, onAssigned, userId }: {
  task: AllTask;
  drivers: DriverRow[];
  onAssigned: (taskId: string, driverId: string, driverName: string) => void;
  userId?: string;
}) {
  const [selected, setSelected]   = useState('');
  const [saving, setSaving]       = useState(false);
  const [open, setOpen]           = useState(false);
  const [scheduleWarn, setSchedWarn] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function hdl(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', hdl);
    return () => document.removeEventListener('mousedown', hdl);
  }, [open]);

  const handleSelect = async (driverId: string) => {
    setOpen(false);
    setSelected(driverId);
    const driver = drivers.find(d => d.id === driverId);
    // Check schedule
    if (task.scheduled_date) {
      const schedStatus = await checkDriverSchedule(driverId, task.scheduled_date);
      if (schedStatus === 'off' && driver) {
        setSchedWarn(`⚠️ ${driver.name} is off duty on ${fmtDate(task.scheduled_date)}. Assign anyway?`);
        return;
      }
    }
    await doAssign(driverId);
  };

  const doAssign = async (driverId: string) => {
    const driver = drivers.find(d => d.id === driverId);
    setSaving(true);
    try {
      await supabase.from('driver_tasks').update({
        driver_id:    driverId,
        driver_name:  driver?.name ?? null,
        status:       'pending',
        is_suggestion: false,
        approved_by:  userId,
        approved_at:  new Date().toISOString(),
      }).eq('id', task.id);
      toast.success(`Task assigned to ${driver?.name ?? 'driver'}`);
      onAssigned(task.id, driverId, driver?.name ?? '');
    } catch {
      toast.error('Failed to assign task');
    } finally {
      setSaving(false);
      setSelected('');
      setSchedWarn(null);
    }
  };

  return (
    <>
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen(v => !v)}
          disabled={saving}
          className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 bg-[#2D5A45] text-white rounded-lg hover:bg-[#234839] transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <><span>Assign To</span><ChevronDown className="w-3 h-3" /></>}
        </button>

        {open && (
          <div className="absolute left-0 mt-1 w-72 bg-white rounded-xl border border-[#E8E3DB] shadow-lg z-50 py-1 max-h-56 overflow-y-auto">
            {drivers.length === 0 ? (
              <p className="px-3 py-2 text-xs text-[#4A4A4A]">No drivers available</p>
            ) : drivers.map(d => {
              const status = d.is_available === false ? '🟡' : d.todayTaskCount ? '🔵' : '🟢';
              return (
                <button
                  key={d.id}
                  onClick={() => handleSelect(d.id)}
                  className={`w-full text-left px-3 py-2 hover:bg-[#F5F0E8] transition-colors ${selected === d.id ? 'bg-[#F5F0E8]' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-[#1A1A1A]">{d.name}</p>
                    <span className="text-xs">{status}</span>
                  </div>
                  <p className="text-xs text-[#4A4A4A]">
                    {[d.vehicle_type, d.vehicle_capacity ? `${d.vehicle_capacity} pax` : ''].filter(Boolean).join(' · ')}
                    {(d.todayTaskCount ?? 0) > 0 ? ` — ${d.todayTaskCount} tasks today` : ''}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Schedule warning confirm */}
      <AlertDialog open={!!scheduleWarn} onOpenChange={o => !o && setSchedWarn(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Driver Off Duty</AlertDialogTitle>
            <AlertDialogDescription>{scheduleWarn}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setSchedWarn(null); setSelected(''); }}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => doAssign(selected)} className="bg-[#2D5A45] hover:bg-[#234839] text-white">
              Assign Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Task Expanded Detail ──────────────────────────────────────────────────────

function TaskDetail({ task }: { task: AllTask }) {
  const contact = useGuestContact(task.guest_id);
  const passengers = task.driver_task_passengers ?? [];

  return (
    <div className="bg-[#F5F0E8]/60 border-t border-[#E8E3DB] px-4 py-3">
      {task.guest_id && (
        <div className="flex items-start gap-3 mb-2">
          {contact?.photo_url ? (
            <img src={contact.photo_url} alt={contact.full_name} className="w-16 h-16 rounded-xl object-cover shrink-0" />
          ) : contact ? (
            <div className="w-16 h-16 bg-[#2D5A45]/10 rounded-xl flex items-center justify-center shrink-0">
              <span className="text-[#2D5A45] text-xl font-bold">{contact.full_name.charAt(0)}</span>
            </div>
          ) : null}
          {contact && (
            <div className="space-y-0.5">
              <p className="font-semibold text-sm text-[#1A1A1A]">{contact.full_name}</p>
              {(contact.country || contact.designation) && (
                <p className="text-xs text-[#4A4A4A]">{[contact.country, contact.designation].filter(Boolean).join(' · ')}</p>
              )}
              {contact.contact_number && (
                <a href={`tel:${contact.contact_number}`} className="flex items-center gap-1 text-[#2D5A45] text-xs hover:underline">
                  <Phone className="w-3 h-3" />{contact.contact_number}
                  <span className="px-1.5 py-0.5 border border-[#2D5A45] rounded text-[10px] font-medium">Call</span>
                </a>
              )}
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="text-[#2D5A45] text-xs hover:underline">✉ {contact.email}</a>
              )}
            </div>
          )}
        </div>
      )}

      {/* Batch passengers */}
      {passengers.length > 1 && (
        <div className="mt-2">
          <p className="text-xs font-semibold text-[#4A4A4A] mb-1">All Passengers ({passengers.length})</p>
          <div className="flex flex-wrap gap-1.5">
            {passengers.map((p, i) => (
              <div key={i} className="flex items-center gap-1.5 bg-white border border-[#E8E3DB] rounded-lg px-2 py-1">
                <div className="w-5 h-5 bg-[#2D5A45]/10 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-[8px] text-[#2D5A45] font-bold">{p.guest_name?.charAt(0) ?? '?'}</span>
                </div>
                <div>
                  <p className="text-xs font-medium text-[#1A1A1A]">{p.guest_name}</p>
                  {p.guest_phone && (
                    <a href={`tel:${p.guest_phone}`} className="text-[10px] text-[#2D5A45] hover:underline">{p.guest_phone}</a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {task.notes && <p className="text-xs text-[#4A4A4A] italic mt-2">{task.notes}</p>}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function TransportTasksPage() {
  const { user } = useAuth();

  const [allTasks, setAllTasks]   = useState<AllTask[]>([]);
  const [drivers, setDrivers]     = useState<DriverRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [subTab, setSubTab]       = useState<SubTab>('suggested');

  const [dateFilter, setDateFilter]     = useState<DateFilter>('all');
  const [driverFilter, setDriverFilter] = useState('');
  const [typeFilter, setTypeFilter]     = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [search, setSearch]             = useState('');

  const [expandedTask, setExpandedTask]   = useState<string | null>(null);
  const [rejectTask, setRejectTask]       = useState<AllTask | null>(null);
  const [cancelTask, setCancelTask]       = useState<AllTask | null>(null);
  const [reassignTask, setReassignTask]   = useState<AllTask | null>(null);
  const [handoverTask, setHandoverTask]   = useState<AllTask | null>(null);
  const [createOpen, setCreateOpen]       = useState(false);
  const [createDriverId, setCreateDriverId] = useState('');
  const [reportOpen, setReportOpen]       = useState(false);

  const loadedRef  = useRef(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const today    = todayStr();
  const tomorrow = tomorrowStr();
  const weekEnd  = thisWeekEnd();

  // ── fetch ─────────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    if (!user?.transportDepartmentId) return;
    const tdId = user.transportDepartmentId;

    try {
      const [tasksRes, driversRes] = await Promise.all([
        supabase
          .from('driver_tasks')
          .select('*, driver_task_passengers(*)')
          .eq('transport_department_id', tdId)
          .not('status', 'in', '("cancelled")')
          .order('scheduled_date').order('scheduled_time'),
        supabase
          .from('users')
          .select('id,name,vehicle_type,vehicle_model,vehicle_capacity,is_available')
          .eq('role', 'driver')
          .eq('transport_department_id', tdId)
          .order('name'),
      ]);

      const tasks = (tasksRes.data as AllTask[]) ?? [];

      // Today task counts per driver
      const countMap: Record<string, number> = {};
      for (const t of tasks) {
        if (t.driver_id && t.scheduled_date === today) {
          countMap[t.driver_id] = (countMap[t.driver_id] ?? 0) + 1;
        }
      }

      setAllTasks(tasks);
      setDrivers(((driversRes.data as DriverRow[]) ?? []).map(d => ({
        ...d,
        todayTaskCount: countMap[d.id] ?? 0,
        location: user.location,
      })));
    } catch {
      // table may not exist yet
    } finally {
      setLoading(false);
    }
  }, [user?.transportDepartmentId, today, user?.location]);

  useEffect(() => {
    if (!user?.transportDepartmentId || loadedRef.current) return;
    loadedRef.current = true;
    fetchAll();
  }, [user?.transportDepartmentId, fetchAll]);

  // Real-time
  useEffect(() => {
    if (!user?.transportDepartmentId) return;
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    const channel = supabase
      .channel('transport-tasks-rt')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'driver_tasks',
        filter: `transport_department_id=eq.${user.transportDepartmentId}`,
      }, () => { fetchAll(); })
      .subscribe();
    channelRef.current = channel;
    return () => { if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; } };
  }, [user?.transportDepartmentId, fetchAll]);

  // ── derived task lists ────────────────────────────────────────────────────────

  const suggested = useMemo(() =>
    sortByPriority(allTasks.filter(t => (t.is_suggestion || !t.driver_id) && t.status === 'suggested')),
    [allTasks]);

  const active = useMemo(() =>
    sortByPriority(allTasks.filter(t => t.status === 'pending' || t.status === 'in_progress')),
    [allTasks]);

  // ── filter function ────────────────────────────────────────────────────────────

  function applyFilters(tasks: AllTask[]) {
    return tasks.filter(t => {
      if (dateFilter === 'today'    && t.scheduled_date !== today)    return false;
      if (dateFilter === 'tomorrow' && t.scheduled_date !== tomorrow)  return false;
      if (dateFilter === 'week'     && (t.scheduled_date < today || t.scheduled_date > weekEnd)) return false;
      if (driverFilter && t.driver_id !== driverFilter) return false;
      if (typeFilter   && t.task_type  !== typeFilter)  return false;
      if (priorityFilter && (t.priority ?? 'normal') !== priorityFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = [t.guest_name, t.driver_name, t.flight_number, t.pickup_location, t.dropoff_location]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  const filteredSuggested = useMemo(() => applyFilters(suggested), // eslint-disable-line react-hooks/exhaustive-deps
    [suggested, dateFilter, driverFilter, typeFilter, priorityFilter, search, today, tomorrow, weekEnd]);
  const filteredActive    = useMemo(() => applyFilters(active), // eslint-disable-line react-hooks/exhaustive-deps
    [active, dateFilter, driverFilter, typeFilter, priorityFilter, search, today, tomorrow, weekEnd]);
  const filteredAll       = useMemo(() => applyFilters(sortByPriority(allTasks)), // eslint-disable-line react-hooks/exhaustive-deps
    [allTasks, dateFilter, driverFilter, typeFilter, priorityFilter, search, today, tomorrow, weekEnd]);

  // ── batch detection (same flight + date among suggested) ──────────────────────

  const batchGroups = useMemo(() => {
    const map: Record<string, AllTask[]> = {};
    for (const t of suggested) {
      if (!t.flight_number || !t.scheduled_date) continue;
      const key = `${t.flight_number}|${t.scheduled_date}`;
      if (!map[key]) map[key] = [];
      map[key].push(t);
    }
    return Object.entries(map).filter(([, ts]) => ts.length >= 2);
  }, [suggested]);

  const handleCombineBatch = async (group: AllTask[]) => {
    if (group.length < 2) return;
    const lead    = group[0];
    const maxCap  = Math.max(...drivers.map(d => d.vehicle_capacity ?? 0), 0);
    if (maxCap > 0 && group.length > maxCap) {
      toast.warning(`${group.length} passengers exceed max vehicle capacity (${maxCap} pax). Multiple vehicles may be needed.`);
    }
    // Merge: update lead task with combined passenger count; cancel the rest
    const cancelIds = group.slice(1).map(t => t.id);
    const newCount  = group.reduce((sum, t) => sum + (t.passenger_count ?? 1), 0);
    const guestNames = group.map(t => t.guest_name).filter(Boolean).join(', ');
    try {
      await supabase.from('driver_tasks').update({
        passenger_count: newCount,
        guest_name: `${newCount} guests on ${lead.flight_number}`,
        notes: `Batch: ${guestNames}`,
      }).eq('id', lead.id);
      if (cancelIds.length > 0) {
        await supabase.from('driver_tasks').update({ status: 'cancelled' }).in('id', cancelIds);
      }
      toast.success(`Combined ${group.length} passengers into one batch pickup`);
      fetchAll();
    } catch {
      toast.error('Failed to combine batch');
    }
  };

  // ── actions ───────────────────────────────────────────────────────────────────

  const handleTaskAssigned = useCallback(() => { fetchAll(); }, [fetchAll]);

  const handleRejectConfirm = useCallback(async () => {
    if (!rejectTask) return;
    const id = rejectTask.id;
    setRejectTask(null);
    try {
      await supabase.from('driver_tasks').update({ status: 'cancelled' }).eq('id', id);
      toast.success('Suggestion rejected');
      fetchAll();
    } catch {
      toast.error('Failed to reject');
    }
  }, [rejectTask, fetchAll]);

  const handleCancelConfirm = useCallback(async () => {
    if (!cancelTask) return;
    const id = cancelTask.id;
    setCancelTask(null);
    try {
      await supabase.from('driver_tasks').update({ status: 'cancelled' }).eq('id', id);
      toast.success('Task cancelled');
      fetchAll();
    } catch {
      toast.error('Failed to cancel task');
    }
  }, [cancelTask, fetchAll]);

  // ── map link helper ───────────────────────────────────────────────────────────

  function renderRoute(task: AllTask) {
    const pickup  = task.pickup_location  ?? '';
    const dropoff = task.dropoff_location ?? '';
    const airportStr = task.task_type === 'airport_pickup' ? pickup : dropoff;
    const mapLink = looksLikeAirport(airportStr) ? getMapLink(airportStr) : null;
    return (
      <div className="flex items-center gap-1 flex-wrap text-xs text-[#4A4A4A]">
        <span className="truncate max-w-[100px]">{pickup || '?'}</span>
        <span>→</span>
        <span className="truncate max-w-[100px]">{dropoff || '?'}</span>
        {mapLink && (
          <a href={mapLink} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-[#2D5A45] hover:underline ml-0.5 shrink-0">
            <MapPin className="w-3 h-3" /><ExternalLink className="w-2.5 h-2.5" />
          </a>
        )}
      </div>
    );
  }

  // ── ETA cell ──────────────────────────────────────────────────────────────────

  function ETACell({ task }: { task: AllTask }) {
    const [, setTick] = useState(0);
    useEffect(() => {
      if (task.status !== 'in_progress') return;
      const iv = setInterval(() => setTick(t => t + 1), 60_000);
      return () => clearInterval(iv);
    }, [task.status]);

    if (task.status !== 'in_progress') return <span className="text-xs text-[#4A4A4A]">—</span>;
    const eta  = calculateETA(task);
    const text = eta ? formatETA(eta) : null;
    const over = eta ? isETAOverdue(eta) : false;
    if (!text) return <span className="text-xs text-[#4A4A4A]">—</span>;
    return (
      <span className={`text-xs font-medium ${over ? 'text-red-600' : 'text-blue-600'}`}>{text}</span>
    );
  }

  const tabs: { id: SubTab; label: string; count: number }[] = [
    { id: 'suggested', label: '📥 Suggested', count: filteredSuggested.length },
    { id: 'active',    label: '📋 Active',    count: filteredActive.length },
    { id: 'all',       label: '📑 All Tasks', count: filteredAll.length },
  ];

  // ── shared filter row ─────────────────────────────────────────────────────────

  const FilterRow = () => (
    <div className="flex items-center gap-2 mb-4 flex-wrap">
      {/* Driver filter */}
      <select value={driverFilter} onChange={e => setDriverFilter(e.target.value)}
        className="border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#2D5A45]">
        <option value="">All Drivers</option>
        {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>

      {/* Type filter */}
      <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
        className="border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#2D5A45]">
        <option value="">All Types</option>
        <option value="airport_pickup">Pickup</option>
        <option value="airport_dropoff">Drop-off</option>
        <option value="mulaqat_transport">Mulaqat</option>
        <option value="other">Other</option>
      </select>

      {/* Priority filter */}
      <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}
        className="border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#2D5A45]">
        <option value="">All Priority</option>
        <option value="vip">VIP</option>
        <option value="urgent">Urgent</option>
        <option value="normal">Normal</option>
      </select>

      {/* Date chips */}
      <div className="flex items-center gap-1">
        {DATE_CHIPS.map(c => (
          <button key={c.value} onClick={() => setDateFilter(c.value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              dateFilter === c.value ? 'bg-[#2D5A45] text-white' : 'bg-white border border-[#E8E3DB] text-[#4A4A4A] hover:bg-[#F5F0E8]'
            }`}
          >{c.label}</button>
        ))}
      </div>

      {/* Search */}
      <div className="relative flex-1 min-w-[180px] max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search guests, drivers, flights…"
          className="w-full pl-9 pr-3 py-2 border border-[#E8E3DB] rounded-lg text-sm bg-white focus:outline-none focus:border-[#2D5A45]" />
      </div>
    </div>
  );

  // ── SUGGESTED TABLE ───────────────────────────────────────────────────────────

  const SuggestedTable = ({ tasks }: { tasks: AllTask[] }) => (
    <div className="bg-white rounded-2xl border border-[#E8E3DB] shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-[#E8E3DB] bg-gray-50">
        <p className="text-sm font-semibold text-[#1A1A1A]">📥 Suggested Tasks — awaiting driver assignment</p>
      </div>
      {tasks.length === 0 ? (
        <p className="text-center py-12 text-sm text-[#4A4A4A]">No suggested tasks{dateFilter !== 'all' ? ' for this period' : ''}.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E8E3DB] bg-[#F5F0E8]/50">
                {['Priority', 'Date', 'Time', 'Type', 'Guest', 'Route', 'Flight', 'Pax', 'Assign To', 'Actions'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E3DB]">
              {tasks.map(t => {
                const pm = PRIORITY_META[t.priority ?? 'normal'];
                const tm = TYPE_META[t.task_type];
                const isExpanded = expandedTask === t.id;
                return (
                  <>
                    <tr key={t.id} className="hover:bg-[#F5F0E8]/30 transition-colors cursor-pointer"
                      onClick={() => setExpandedTask(expandedTask === t.id ? null : t.id)}>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${pm.cls}`}>{pm.label}</span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-[#1A1A1A] font-medium">{fmtDate(t.scheduled_date)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-[#4A4A4A]">{t.scheduled_time ?? '—'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${tm.bg} ${tm.text}`}>
                          {tm.icon}{tm.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 max-w-[120px]">
                        <p className="font-medium text-[#1A1A1A] truncate">{t.guest_name ?? t.delegation_name ?? '—'}</p>
                      </td>
                      <td className="px-3 py-2.5 min-w-[160px]">{renderRoute(t)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-[#4A4A4A] text-xs">
                        {t.flight_number ? <><span>✈</span> {t.flight_number}</> : '—'}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-center text-[#4A4A4A]">
                        {t.passenger_count ?? 1}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <AssignDriverInline task={t} drivers={drivers} onAssigned={handleTaskAssigned} userId={user?.id} />
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setRejectTask(t)}
                          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Reject">
                          <X className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${t.id}-detail`}>
                        <td colSpan={10} className="p-0">
                          <TaskDetail task={t} />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // ── ACTIVE TABLE ──────────────────────────────────────────────────────────────

  const ActiveTable = ({ tasks }: { tasks: AllTask[] }) => (
    <div className="bg-white rounded-2xl border border-[#E8E3DB] shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-[#E8E3DB] bg-blue-50">
        <p className="text-sm font-semibold text-blue-900">📋 Active Tasks</p>
      </div>
      {tasks.length === 0 ? (
        <p className="text-center py-12 text-sm text-[#4A4A4A]">No active tasks{dateFilter !== 'all' ? ' for this period' : ''}.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E8E3DB] bg-[#F5F0E8]/50">
                {['Priority', 'Driver', 'Date', 'Time', 'Type', 'Guest', 'Route', 'ETA', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E3DB]">
              {tasks.map(t => {
                const pm = PRIORITY_META[t.priority ?? 'normal'];
                const tm = TYPE_META[t.task_type];
                const isExpanded = expandedTask === t.id;
                const driverRow  = drivers.find(d => d.id === t.driver_id);
                const statusDot  = t.status === 'in_progress' ? 'bg-blue-500' : 'bg-amber-500';
                return (
                  <>
                    <tr key={t.id} className="hover:bg-[#F5F0E8]/30 transition-colors cursor-pointer"
                      onClick={() => setExpandedTask(expandedTask === t.id ? null : t.id)}>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${pm.cls}`}>{pm.label}</span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${statusDot} shrink-0`} />
                          <span className="font-medium text-[#1A1A1A] truncate max-w-[90px]">
                            {driverRow?.name ?? t.driver_name ?? '—'}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-[#1A1A1A] font-medium">{fmtDate(t.scheduled_date)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-[#4A4A4A]">{t.scheduled_time ?? '—'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${tm.bg} ${tm.text}`}>
                          {tm.icon}{tm.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 max-w-[110px]">
                        <p className="font-medium text-[#1A1A1A] truncate">{t.guest_name ?? t.delegation_name ?? '—'}</p>
                      </td>
                      <td className="px-3 py-2.5 min-w-[150px]">{renderRoute(t)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <ETACell task={t} />
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_CLS[t.status]}`}>
                          {t.status === 'in_progress' ? 'In Progress' : 'Pending'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setReassignTask(t)}
                            className="text-xs px-2 py-1 border border-[#E8E3DB] text-[#4A4A4A] rounded-lg hover:bg-[#F5F0E8] transition-colors whitespace-nowrap">
                            Reassign
                          </button>
                          <button onClick={() => setHandoverTask(t)}
                            className="p-1.5 text-[#4A4A4A] hover:text-[#2D5A45] hover:bg-[#F5F0E8] rounded-lg transition-colors" title="Handover">
                            <ArrowRightLeft className="w-4 h-4" />
                          </button>
                          <button onClick={() => setCancelTask(t)}
                            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Cancel">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${t.id}-detail`}>
                        <td colSpan={10} className="p-0">
                          <TaskDetail task={t} />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // ── ALL TABLE ─────────────────────────────────────────────────────────────────

  const AllTable = ({ tasks }: { tasks: AllTask[] }) => (
    <div className="bg-white rounded-2xl border border-[#E8E3DB] shadow-sm overflow-hidden">
      {tasks.length === 0 ? (
        <p className="text-center py-12 text-sm text-[#4A4A4A]">No tasks found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E8E3DB] bg-[#F5F0E8]/50">
                {['Priority', 'Date', 'Time', 'Type', 'Guest', 'Driver', 'Route', 'Flight', 'Status'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E3DB]">
              {tasks.map(t => {
                const pm = PRIORITY_META[t.priority ?? 'normal'];
                const tm = TYPE_META[t.task_type];
                const isExpanded = expandedTask === t.id;
                return (
                  <>
                    <tr key={t.id} className="hover:bg-[#F5F0E8]/30 transition-colors cursor-pointer"
                      onClick={() => setExpandedTask(expandedTask === t.id ? null : t.id)}>
                      <td className="px-3 py-2.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${pm.cls}`}>{pm.label}</span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap font-medium text-[#1A1A1A]">{fmtDate(t.scheduled_date)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-[#4A4A4A]">{t.scheduled_time ?? '—'}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${tm.bg} ${tm.text}`}>
                          {tm.icon}{tm.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 max-w-[120px] truncate font-medium text-[#1A1A1A]">
                        {t.guest_name ?? t.delegation_name ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-[#4A4A4A]">
                        {t.driver_name ?? <span className="text-gray-400 italic">Unassigned</span>}
                      </td>
                      <td className="px-3 py-2.5 min-w-[150px]">{renderRoute(t)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-[#4A4A4A] text-xs">
                        {t.flight_number ? `✈ ${t.flight_number}` : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_CLS[t.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {t.status.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${t.id}-detail`}>
                        <td colSpan={9} className="p-0">
                          <TaskDetail task={t} />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // ── render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen bg-[#F5F0E8]">
      <TransportSidebar />

      <main className="ml-64 flex-1">
        <TopBar />
        <div className="p-8 space-y-4">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[#1A1A1A] flex items-center gap-2">
                Tasks
                <span className="text-base font-normal text-[#4A4A4A]">— {user?.transportDepartmentName}</span>
                <span className="text-sm font-bold bg-[#2D5A45] text-white px-2 py-0.5 rounded-full">{allTasks.length}</span>
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setReportOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-[#E8E3DB] text-[#4A4A4A] bg-white rounded-xl hover:bg-[#F5F0E8] transition-colors">
                <FileText className="w-4 h-4" /> Print Schedule
              </button>
              <button
                onClick={() => { setCreateDriverId(''); setCreateOpen(true); }}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#2D5A45] text-white rounded-xl text-sm font-medium hover:bg-[#234839] transition-colors">
                <Plus className="w-4 h-4" /> Create Task
              </button>
            </div>
          </div>

          {/* Sub-tabs */}
          <div className="flex items-center gap-1 border-b border-[#E8E3DB]">
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setSubTab(tab.id)}
                className={`px-4 py-2.5 text-sm font-medium flex items-center gap-1.5 border-b-2 transition-colors ${
                  subTab === tab.id ? 'border-[#2D5A45] text-[#2D5A45]' : 'border-transparent text-[#4A4A4A] hover:text-[#1A1A1A]'
                }`}>
                {tab.label}
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${subTab === tab.id ? 'bg-[#2D5A45] text-white' : 'bg-gray-100 text-gray-600'}`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Filter row */}
          <FilterRow />

          {loading ? (
            <div className="flex items-center justify-center py-16 text-[#4A4A4A]">
              <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading tasks…
            </div>
          ) : (
            <>
              {/* Batch groups banner (only on Suggested tab) */}
              {subTab === 'suggested' && batchGroups.map(([key, group]) => {
                const [flight, date] = key.split('|');
                const time = group.find(t => t.scheduled_time)?.scheduled_time;
                return (
                  <div key={key} className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-blue-600 shrink-0" />
                      <span className="text-sm font-medium text-blue-800">
                        {flight} — {group.length} guests arriving {date ? `on ${fmtDate(date)}` : ''}{time ? ` at ${time}` : ''}
                      </span>
                    </div>
                    <button onClick={() => handleCombineBatch(group)}
                      className="text-xs font-medium px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap">
                      Combine into Batch Pickup
                    </button>
                  </div>
                );
              })}

              {subTab === 'suggested' && <SuggestedTable tasks={filteredSuggested} />}
              {subTab === 'active'    && <ActiveTable    tasks={filteredActive} />}
              {subTab === 'all'       && <AllTable       tasks={filteredAll} />}
            </>
          )}
        </div>
      </main>

      {/* Dialogs */}
      <AlertDialog open={!!rejectTask} onOpenChange={o => !o && setRejectTask(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Suggestion?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel the suggested task for {rejectTask?.guest_name ?? 'this guest'}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction onClick={handleRejectConfirm} className="bg-red-600 hover:bg-red-700 text-white">
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!cancelTask} onOpenChange={o => !o && setCancelTask(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Task?</AlertDialogTitle>
            <AlertDialogDescription>
              Cancel the task for {cancelTask?.guest_name ?? 'this guest'}? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelConfirm} className="bg-red-600 hover:bg-red-700 text-white">
              Cancel Task
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ReassignDialog
        task={reassignTask}
        drivers={drivers}
        onClose={() => setReassignTask(null)}
        onDone={fetchAll}
      />

      <HandoverDialog
        open={!!handoverTask}
        onClose={() => setHandoverTask(null)}
        task={handoverTask}
        locationName={user?.location}
        preloadedDrivers={drivers}
        onHandedOver={() => { setHandoverTask(null); fetchAll(); }}
      />

      <CreateTaskDialog
        open={createOpen}
        onClose={() => { setCreateOpen(false); fetchAll(); }}
        drivers={drivers}
        preselectedDriverId={createDriverId || undefined}
        locationName={user?.location}
        departmentName={user?.transportDepartmentName}
        onCreated={() => { setCreateOpen(false); fetchAll(); }}
      />

      <DailyReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        defaultLocation={user?.location}
        generatedBy={user?.name}
      />
    </div>
  );
}
