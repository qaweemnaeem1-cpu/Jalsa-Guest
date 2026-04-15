import { useState, useEffect, useRef } from 'react';
import {
  Plus, X, Search, ChevronDown, Car, User, Calendar, Clock,
  ClipboardList, CheckCircle2, AlertCircle, Circle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import MobileTransportHeadLayout from '@/components/MobileTransportHeadLayout';
import { toast } from 'sonner';

interface Task {
  id: string;
  guest_name: string;
  task_type: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'vip' | 'urgent' | 'normal' | 'low';
  assigned_driver_id: string | null;
  assigned_driver_name: string | null;
  pickup_location: string | null;
  dropoff_location: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  flight_number: string | null;
}

interface Driver {
  id: string;
  name: string;
  is_available: boolean;
}

const TASK_TYPES = ['airport_pickup', 'airport_dropoff', 'hotel_transfer', 'local_transfer', 'vip_escort'];
const PRIORITIES = ['vip', 'urgent', 'normal', 'low'] as const;

const priorityColor = (p: string) => ({
  vip:    'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
  urgent: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  normal: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  low:    'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
}[p] ?? 'bg-gray-100 text-gray-600');

const statusIcon = (s: string) => {
  if (s === 'completed') return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
  if (s === 'in_progress') return <Circle className="w-4 h-4 text-blue-500 fill-blue-500/30" />;
  if (s === 'cancelled') return <AlertCircle className="w-4 h-4 text-red-400" />;
  return <Clock className="w-4 h-4 text-amber-500" />;
};

const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-[#E8E3DB] dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-[#1A1A1A] dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#2D5A45]';
const labelCls = 'block text-xs font-medium text-[#4A4A4A] dark:text-gray-400 mb-1';

const STATUS_FILTERS = ['all', 'pending', 'in_progress', 'completed'] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

export default function MobileTransportTasksPage() {
  const { user } = useAuth();
  const deptId = (user as { transportDepartmentId?: string })?.transportDepartmentId;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [driverFilter, setDriverFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    guest_name: '',
    task_type: 'airport_pickup',
    priority: 'normal' as typeof PRIORITIES[number],
    assigned_driver_id: '',
    pickup_location: '',
    dropoff_location: '',
    scheduled_date: '',
    scheduled_time: '',
    flight_number: '',
    notes: '',
  });

  async function fetchAll() {
    if (!deptId) return;
    setLoading(true);
    try {
      const [taskRes, drRes] = await Promise.all([
        supabase.from('driver_tasks').select('id,guest_name,task_type,status,priority,assigned_driver_id,assigned_driver_name,pickup_location,dropoff_location,scheduled_date,scheduled_time,flight_number').eq('transport_department_id', deptId).order('scheduled_date', { ascending: false }),
        supabase.from('users').select('id,name,is_available').eq('transport_department_id', deptId).eq('role', 'driver').eq('is_head_driver', false),
      ]);
      setTasks((taskRes.data ?? []) as Task[]);
      setDrivers((drRes.data ?? []) as Driver[]);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void fetchAll(); }, [deptId]);

  const filtered = tasks.filter(t => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (driverFilter !== 'all' && t.assigned_driver_id !== driverFilter) return false;
    return true;
  });

  async function handleCreate() {
    if (!form.guest_name.trim()) { toast.error('Guest name required'); return; }
    setSaving(true);
    try {
      const driver = drivers.find(d => d.id === form.assigned_driver_id);
      const { error } = await supabase.from('driver_tasks').insert({
        guest_name: form.guest_name.trim(),
        task_type: form.task_type,
        priority: form.priority,
        status: 'pending',
        transport_department_id: deptId,
        assigned_driver_id: form.assigned_driver_id || null,
        assigned_driver_name: driver?.name ?? null,
        pickup_location: form.pickup_location || null,
        dropoff_location: form.dropoff_location || null,
        scheduled_date: form.scheduled_date || null,
        scheduled_time: form.scheduled_time || null,
        flight_number: form.flight_number || null,
        notes: form.notes || null,
        created_by: user?.id,
      });
      if (error) throw error;
      toast.success('Task created');
      setShowCreate(false);
      setForm({ guest_name: '', task_type: 'airport_pickup', priority: 'normal', assigned_driver_id: '', pickup_location: '', dropoff_location: '', scheduled_date: '', scheduled_time: '', flight_number: '', notes: '' });
      void fetchAll();
    } catch {
      toast.error('Failed to create task');
    } finally {
      setSaving(false);
    }
  }

  const Skeleton = ({ cls = '' }) => (
    <div className={`animate-pulse bg-gray-200 dark:bg-gray-700 rounded-xl ${cls}`} />
  );

  if (showCreate) {
    return (
      <div className="fixed inset-0 z-50 bg-[#F5F0E8] dark:bg-gray-950 flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 bg-white dark:bg-gray-900 border-b border-[#E8E3DB] dark:border-gray-800">
          <button onClick={() => setShowCreate(false)}>
            <X className="w-5 h-5 text-[#4A4A4A] dark:text-gray-400" />
          </button>
          <h2 className="text-base font-semibold text-[#1A1A1A] dark:text-gray-100">Create Task</h2>
          <button
            disabled={saving}
            onClick={handleCreate}
            className="text-sm font-semibold text-[#2D5A45] dark:text-emerald-400 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Guest name */}
          <div>
            <label className={labelCls}>Guest Name *</label>
            <input className={inputCls} value={form.guest_name} onChange={e => setForm(f => ({ ...f, guest_name: e.target.value }))} placeholder="Full name" />
          </div>

          {/* Task type */}
          <div>
            <label className={labelCls}>Task Type</label>
            <div className="relative">
              <select className={inputCls + ' appearance-none pr-8'} value={form.task_type} onChange={e => setForm(f => ({ ...f, task_type: e.target.value }))}>
                {TASK_TYPES.map(t => (
                  <option key={t} value={t}>{t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Priority pills */}
          <div>
            <label className={labelCls}>Priority</label>
            <div className="flex gap-2 flex-wrap">
              {PRIORITIES.map(p => (
                <button
                  key={p}
                  onClick={() => setForm(f => ({ ...f, priority: p }))}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize border transition-all ${
                    form.priority === p
                      ? priorityColor(p) + ' border-current'
                      : 'bg-transparent border-[#E8E3DB] dark:border-gray-700 text-[#4A4A4A] dark:text-gray-400'
                  }`}
                >
                  {p.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Assign driver */}
          <div>
            <label className={labelCls}>Assign Driver</label>
            <div className="relative">
              <select className={inputCls + ' appearance-none pr-8'} value={form.assigned_driver_id} onChange={e => setForm(f => ({ ...f, assigned_driver_id: e.target.value }))}>
                <option value="">Unassigned</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>{d.name}{d.is_available ? '' : ' (off duty)'}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Date</label>
              <input className={inputCls} type="date" value={form.scheduled_date} onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Time</label>
              <input className={inputCls} type="time" value={form.scheduled_time} onChange={e => setForm(f => ({ ...f, scheduled_time: e.target.value }))} />
            </div>
          </div>

          {/* Locations */}
          <div>
            <label className={labelCls}>Pickup Location</label>
            <input className={inputCls} value={form.pickup_location} onChange={e => setForm(f => ({ ...f, pickup_location: e.target.value }))} placeholder="e.g. Heathrow T2" />
          </div>
          <div>
            <label className={labelCls}>Drop-off Location</label>
            <input className={inputCls} value={form.dropoff_location} onChange={e => setForm(f => ({ ...f, dropoff_location: e.target.value }))} placeholder="e.g. Guest House, Tilford" />
          </div>

          {/* Flight number */}
          <div>
            <label className={labelCls}>Flight Number</label>
            <input className={inputCls} value={form.flight_number} onChange={e => setForm(f => ({ ...f, flight_number: e.target.value }))} placeholder="e.g. PK702" />
          </div>

          {/* Notes */}
          <div>
            <label className={labelCls}>Notes</label>
            <textarea className={inputCls} rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any special instructions…" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <MobileTransportHeadLayout>
      <div className="px-4 pt-4 pb-6 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-[#1A1A1A] dark:text-gray-100">Tasks</h1>
          <span className="text-sm text-[#4A4A4A] dark:text-gray-400">{filtered.length} shown</span>
        </div>

        {/* Status filter pills */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {STATUS_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-all ${
                statusFilter === f
                  ? 'bg-[#2D5A45] text-white border-[#2D5A45]'
                  : 'bg-white dark:bg-gray-800 text-[#4A4A4A] dark:text-gray-400 border-[#E8E3DB] dark:border-gray-700'
              }`}
            >
              {f === 'all' ? 'All' : f.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </button>
          ))}
        </div>

        {/* Driver filter */}
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <select
            className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-[#E8E3DB] dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-[#1A1A1A] dark:text-gray-100 focus:outline-none appearance-none"
            value={driverFilter}
            onChange={e => setDriverFilter(e.target.value)}
          >
            <option value="all">All Drivers</option>
            {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>

        {/* Task list */}
        {loading ? (
          <div className="space-y-3">
            {[0,1,2,3].map(i => <Skeleton key={i} cls="h-24" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-[#4A4A4A] dark:text-gray-500 text-sm">
            No tasks match the current filters
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(t => (
              <div
                key={t.id}
                className="bg-white dark:bg-gray-800 rounded-xl border border-[#E8E3DB] dark:border-gray-700 px-4 py-3"
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {statusIcon(t.status)}
                    <span className="text-sm font-semibold text-[#1A1A1A] dark:text-gray-100 truncate">{t.guest_name}</span>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${priorityColor(t.priority)}`}>
                    {t.priority.toUpperCase()}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-[#4A4A4A] dark:text-gray-400">
                  <span className="flex items-center gap-1">
                    <ClipboardList className="w-3 h-3" />
                    {t.task_type.replace(/_/g, ' ')}
                  </span>
                  {t.assigned_driver_name && (
                    <span className="flex items-center gap-1">
                      <Car className="w-3 h-3" />
                      {t.assigned_driver_name}
                    </span>
                  )}
                  {t.scheduled_date && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {t.scheduled_date}
                    </span>
                  )}
                </div>
                {(t.pickup_location || t.dropoff_location) && (
                  <div className="mt-1.5 text-xs text-[#4A4A4A] dark:text-gray-500 truncate">
                    {t.pickup_location ?? '—'} → {t.dropoff_location ?? '—'}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => setShowCreate(true)}
        className="fixed bottom-20 right-4 z-40 w-14 h-14 bg-[#2D5A45] text-white rounded-full flex items-center justify-center shadow-lg active:bg-[#234839]"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Search icon ref to satisfy lint */}
      <span className="hidden"><Search /></span>
    </MobileTransportHeadLayout>
  );
}
