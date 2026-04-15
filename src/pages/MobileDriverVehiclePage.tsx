import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Car, Wrench, BarChart3, Plus, AlertTriangle,
  ChevronRight, CheckCircle2, Edit3, Calendar,
} from 'lucide-react';
import { toast } from 'sonner';
import MobileDriverLayout from '@/components/MobileDriverLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

// ── Constants ─────────────────────────────────────────────────────────────────
type VehicleView = 'main' | 'editVehicle' | 'addMaintenance';

const VEHICLE_STATUS_OPTIONS = [
  { value: 'available',   label: '🟢 Available'   },
  { value: 'in_use',      label: '🔵 In Use'       },
  { value: 'maintenance', label: '🔴 Maintenance'  },
  { value: 'fueling',     label: '🟡 Fueling'      },
  { value: 'unavailable', label: '⚪ Unavailable'  },
  { value: 'reserved',    label: '🟣 Reserved'     },
];

const VEHICLE_TYPES = ['Car', 'Van', 'Minibus', 'Minivan', 'SUV', 'Bus', 'Lorry', 'Other'];

const MAINTENANCE_TYPES = [
  'Oil Change', 'Service', 'Repair', 'Tyre Change', 'MOT', 'Wash/Clean', 'Fuel', 'Other',
];

// ── Types ─────────────────────────────────────────────────────────────────────
interface DriverRecord {
  id: string;
  vehicle_type?: string;
  vehicle_model?: string;
  vehicle_registration?: string;
  vehicle_capacity?: number;
  vehicle_status?: string;
  vehicle_available_from?: string;
  vehicle_available_to?: string;
}

interface MaintenanceEntry {
  id: string;
  driver_id: string;
  type: string;
  date: string;
  description?: string;
  mileage?: number;
  cost?: number;
  next_due_date?: string;
  next_due_mileage?: number;
  created_at: string;
}

interface VehicleStats {
  weeklyKm: number;
  monthlyKm: number;
  weeklyTrips: number;
  weeklyPassengers: number;
}

interface EditForm {
  vehicle_type: string;
  vehicle_model: string;
  vehicle_registration: string;
  vehicle_capacity: string;
  vehicle_status: string;
  vehicle_available_from: string;
  vehicle_available_to: string;
}

interface MaintForm {
  type: string;
  date: string;
  description: string;
  mileage: string;
  cost: string;
  next_due_date: string;
  next_due_mileage: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function today() { return new Date().toISOString().split('T')[0]; }

function getWeekBounds() {
  const d = new Date();
  const dow = d.getDay();
  const monOffset = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(d); mon.setDate(d.getDate() + monOffset);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return { weekStart: mon.toISOString().split('T')[0], weekEnd: sun.toISOString().split('T')[0] };
}

function getMonthBounds() {
  const d = new Date();
  return {
    monthStart: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`,
    monthEnd: today(),
  };
}

function daysBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

function fmtDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
}

function getAlertStatus(entry: MaintenanceEntry): 'overdue' | 'due' | null {
  if (!entry.next_due_date) return null;
  const diff = daysBetween(today(), entry.next_due_date);
  if (diff < 0) return 'overdue';
  if (diff <= 7) return 'due';
  return null;
}

// ── Shared full-screen form wrapper ───────────────────────────────────────────
function FullScreenForm({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 bg-[#F5F0E8] dark:bg-gray-950 z-50 flex flex-col"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex items-center h-14 px-4 shrink-0">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center active:bg-gray-200 dark:active:bg-gray-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-800 dark:text-gray-100" />
        </button>
        <h1 className="flex-1 text-center font-bold text-base text-gray-800 dark:text-gray-100 -ml-9 pr-9">{title}</h1>
      </div>
      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

// ── Shared input styles ───────────────────────────────────────────────────────
const inputCls =
  'w-full h-12 px-4 text-base rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-[#2D5A45] focus:ring-2 focus:ring-[#2D5A45]/20';

const labelCls = 'block text-sm text-gray-500 dark:text-gray-400 mb-1 font-medium';

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className={labelCls}>{children}</label>;
}

// ── Skeleton loader ───────────────────────────────────────────────────────────
function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 dark:bg-gray-700 rounded-xl ${className ?? ''}`} />;
}

// ── Edit vehicle form ─────────────────────────────────────────────────────────
function EditVehicleView({
  initial,
  driverId,
  onBack,
  onSaved,
}: {
  initial: EditForm;
  driverId: string;
  onBack: () => void;
  onSaved: (updated: Partial<DriverRecord>) => void;
}) {
  const [form, setForm] = useState<EditForm>(initial);
  const [saving, setSaving] = useState(false);

  const set = (k: keyof EditForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from('users').update({
      vehicle_type:           form.vehicle_type || null,
      vehicle_model:          form.vehicle_model || null,
      vehicle_registration:   form.vehicle_registration || null,
      vehicle_capacity:       form.vehicle_capacity ? Number(form.vehicle_capacity) : null,
      vehicle_status:         form.vehicle_status || null,
      vehicle_available_from: form.vehicle_available_from || null,
      vehicle_available_to:   form.vehicle_available_to || null,
    }).eq('id', driverId);

    setSaving(false);
    if (error) {
      toast.error('Failed to update vehicle details');
    } else {
      toast.success('Vehicle updated');
      onSaved({
        vehicle_type:           form.vehicle_type,
        vehicle_model:          form.vehicle_model,
        vehicle_registration:   form.vehicle_registration,
        vehicle_capacity:       Number(form.vehicle_capacity) || undefined,
        vehicle_status:         form.vehicle_status,
        vehicle_available_from: form.vehicle_available_from,
        vehicle_available_to:   form.vehicle_available_to,
      });
    }
  };

  return (
    <FullScreenForm title="Edit Vehicle" onBack={onBack}>
      <div className="px-4 py-6 space-y-4">
        {/* Vehicle Type */}
        <div>
          <FieldLabel>Vehicle Type</FieldLabel>
          <select value={form.vehicle_type} onChange={set('vehicle_type')} className={inputCls}>
            <option value="">Select type…</option>
            {VEHICLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {/* Model */}
        <div>
          <FieldLabel>Model</FieldLabel>
          <input type="text" value={form.vehicle_model} onChange={set('vehicle_model')}
            placeholder="e.g. Toyota Hiace" className={inputCls} />
        </div>

        {/* Registration */}
        <div>
          <FieldLabel>Registration Number</FieldLabel>
          <input type="text" value={form.vehicle_registration} onChange={set('vehicle_registration')}
            placeholder="e.g. ABC-1234" className={`${inputCls} uppercase`} />
        </div>

        {/* Capacity */}
        <div>
          <FieldLabel>Passenger Capacity</FieldLabel>
          <input type="number" min={1} max={60} value={form.vehicle_capacity} onChange={set('vehicle_capacity')}
            placeholder="8" className={inputCls} />
        </div>

        {/* Status */}
        <div>
          <FieldLabel>Current Status</FieldLabel>
          <select value={form.vehicle_status} onChange={set('vehicle_status')} className={inputCls}>
            {VEHICLE_STATUS_OPTIONS.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        {/* Available From */}
        <div>
          <FieldLabel>Available From</FieldLabel>
          <div className="relative">
            <input type="date" value={form.vehicle_available_from} onChange={set('vehicle_available_from')}
              className={`${inputCls} pr-10`} />
            <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Available Until */}
        <div>
          <FieldLabel>Available Until</FieldLabel>
          <div className="relative">
            <input type="date" value={form.vehicle_available_to} onChange={set('vehicle_available_to')}
              className={`${inputCls} pr-10`} />
            <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full h-14 rounded-2xl bg-[#2D5A45] text-white text-lg font-bold active:bg-[#234839] transition-colors disabled:opacity-60 mt-4"
        >
          {saving ? 'Saving…' : 'SAVE CHANGES'}
        </button>
      </div>
    </FullScreenForm>
  );
}

// ── Add maintenance form ──────────────────────────────────────────────────────
function AddMaintenanceView({
  driverId,
  prefillType,
  onBack,
  onSaved,
}: {
  driverId: string;
  prefillType?: string;
  onBack: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<MaintForm>({
    type:             prefillType ?? MAINTENANCE_TYPES[0],
    date:             today(),
    description:      '',
    mileage:          '',
    cost:             '',
    next_due_date:    '',
    next_due_mileage: '',
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<MaintForm>>({});

  const set = (k: keyof MaintForm) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => setForm(f => ({ ...f, [k]: e.target.value }));

  const validate = () => {
    const errs: Partial<MaintForm> = {};
    if (!form.type)  errs.type = 'Required';
    if (!form.date)  errs.date = 'Required';
    return errs;
  };

  const handleSave = async () => {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    const { error } = await supabase.from('vehicle_maintenance').insert({
      driver_id:        driverId,
      type:             form.type,
      date:             form.date,
      description:      form.description || null,
      mileage:          form.mileage ? Number(form.mileage) : null,
      cost:             form.cost ? Number(form.cost) : null,
      next_due_date:    form.next_due_date || null,
      next_due_mileage: form.next_due_mileage ? Number(form.next_due_mileage) : null,
    });
    setSaving(false);
    if (error) {
      toast.error('Failed to save entry');
    } else {
      toast.success('Maintenance entry added');
      onSaved();
    }
  };

  return (
    <FullScreenForm title="Add Maintenance" onBack={onBack}>
      <div className="px-4 py-6 space-y-4">

        {/* Type */}
        <div>
          <FieldLabel>Type</FieldLabel>
          <select value={form.type} onChange={set('type')} className={inputCls}>
            {MAINTENANCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {errors.type && <p className="text-sm text-red-500 mt-1">{errors.type}</p>}
        </div>

        {/* Date */}
        <div>
          <FieldLabel>Date</FieldLabel>
          <div className="relative">
            <input type="date" value={form.date} onChange={set('date')} className={`${inputCls} pr-10`} />
            <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
          {errors.date && <p className="text-sm text-red-500 mt-1">{errors.date}</p>}
        </div>

        {/* Description */}
        <div>
          <FieldLabel>Description</FieldLabel>
          <textarea
            value={form.description}
            onChange={set('description')}
            rows={3}
            placeholder="e.g. Front brake pads replaced"
            className="w-full px-4 py-3 text-base rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-[#2D5A45] focus:ring-2 focus:ring-[#2D5A45]/20 resize-none"
          />
        </div>

        {/* Mileage + Cost side by side */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Mileage (km)</FieldLabel>
            <input type="number" min={0} value={form.mileage} onChange={set('mileage')}
              placeholder="45230" className={inputCls} />
          </div>
          <div>
            <FieldLabel>Cost (£)</FieldLabel>
            <input type="number" min={0} step={0.01} value={form.cost} onChange={set('cost')}
              placeholder="85.00" className={inputCls} />
          </div>
        </div>

        {/* Next due */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-600 space-y-3">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Next Due (optional)</p>
          <div>
            <FieldLabel>By Date</FieldLabel>
            <div className="relative">
              <input type="date" value={form.next_due_date} onChange={set('next_due_date')}
                className={`${inputCls} pr-10`} />
              <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
          <div>
            <FieldLabel>By Mileage (km)</FieldLabel>
            <input type="number" min={0} value={form.next_due_mileage} onChange={set('next_due_mileage')}
              placeholder="50000" className={inputCls} />
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full h-14 rounded-2xl bg-[#2D5A45] text-white text-lg font-bold active:bg-[#234839] transition-colors disabled:opacity-60 mt-4"
        >
          {saving ? 'Saving…' : 'SAVE ENTRY'}
        </button>
      </div>
    </FullScreenForm>
  );
}

// ── Stat box ──────────────────────────────────────────────────────────────────
function StatBox({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4 text-center">
      <p className="text-2xl font-bold text-[#2D5A45] dark:text-emerald-400 leading-none mb-1">{value}</p>
      <p className="text-xs text-gray-400 dark:text-gray-500">{label}</p>
    </div>
  );
}

// ── Maintenance history card ──────────────────────────────────────────────────
function MaintenanceCard({ entry }: { entry: MaintenanceEntry }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <button
      onClick={() => setExpanded(p => !p)}
      className="w-full text-left bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 active:scale-[0.98] transition-transform"
    >
      <div className="flex items-center gap-3">
        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{entry.type}</span>
            <span className="text-xs text-gray-400">·</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">{fmtDate(entry.date)}</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {entry.mileage ? `${entry.mileage.toLocaleString()} km` : '—'}
            {entry.cost ? ` · £${Number(entry.cost).toFixed(2)}` : ''}
            {entry.description ? ` · ${entry.description}` : ''}
          </p>
        </div>
        <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 space-y-1.5 text-sm text-left">
          {entry.description && (
            <p className="text-gray-700 dark:text-gray-200">{entry.description}</p>
          )}
          {entry.next_due_date && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Next due: {fmtDate(entry.next_due_date)}
              {entry.next_due_mileage ? ` or ${entry.next_due_mileage.toLocaleString()} km` : ''}
            </p>
          )}
        </div>
      )}
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MobileDriverVehiclePage() {
  const { user } = useAuth();

  const [view, setView]               = useState<VehicleView>('main');
  const [prefillMaintType, setPrefillMaintType] = useState<string | undefined>();
  const [driver, setDriver]           = useState<DriverRecord | null>(null);
  const [maintenance, setMaintenance] = useState<MaintenanceEntry[]>([]);
  const [stats, setStats]             = useState<VehicleStats>({ weeklyKm: 0, monthlyKm: 0, weeklyTrips: 0, weeklyPassengers: 0 });
  const [loading, setLoading]         = useState(true);
  const [vehicleStatus, setVehicleStatus] = useState('available');

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { weekStart, weekEnd } = getWeekBounds();
    const { monthStart, monthEnd } = getMonthBounds();

    const [driverRes, maintRes, weekTasksRes, monthTasksRes] = await Promise.all([
      supabase.from('users').select('id,vehicle_type,vehicle_model,vehicle_registration,vehicle_capacity,vehicle_status,vehicle_available_from,vehicle_available_to').eq('id', user.id).single(),
      supabase.from('vehicle_maintenance').select('*').eq('driver_id', user.id).order('date', { ascending: false }),
      supabase.from('driver_tasks').select('start_mileage,end_mileage,passenger_count').eq('driver_id', user.id).eq('status', 'completed').gte('scheduled_date', weekStart).lte('scheduled_date', weekEnd),
      supabase.from('driver_tasks').select('start_mileage,end_mileage').eq('driver_id', user.id).eq('status', 'completed').gte('scheduled_date', monthStart).lte('scheduled_date', monthEnd),
    ]);

    if (driverRes.data) {
      const d = driverRes.data as DriverRecord;
      setDriver(d);
      setVehicleStatus(d.vehicle_status ?? 'available');
    }
    setMaintenance((maintRes.data ?? []) as MaintenanceEntry[]);

    // Compute stats
    const weekTasks = (weekTasksRes.data ?? []) as { start_mileage?: number; end_mileage?: number; passenger_count?: number }[];
    const monthTasks = (monthTasksRes.data ?? []) as { start_mileage?: number; end_mileage?: number }[];
    const weeklyKm = weekTasks.reduce((s, t) => {
      const km = (t.end_mileage ?? 0) - (t.start_mileage ?? 0);
      return s + (km > 0 ? km : 0);
    }, 0);
    const monthlyKm = monthTasks.reduce((s, t) => {
      const km = (t.end_mileage ?? 0) - (t.start_mileage ?? 0);
      return s + (km > 0 ? km : 0);
    }, 0);
    const weeklyPassengers = weekTasks.reduce((s, t) => s + (t.passenger_count ?? 0), 0);
    setStats({ weeklyKm, monthlyKm, weeklyTrips: weekTasks.length, weeklyPassengers });
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Update vehicle status ──────────────────────────────────────────────────
  const handleStatusChange = async (val: string) => {
    setVehicleStatus(val);
    await supabase.from('users').update({ vehicle_status: val }).eq('id', user!.id);
  };

  // ── Edit form initial values ───────────────────────────────────────────────
  const editInitial: EditForm = {
    vehicle_type:           driver?.vehicle_type ?? '',
    vehicle_model:          driver?.vehicle_model ?? user?.vehicleModel ?? '',
    vehicle_registration:   driver?.vehicle_registration ?? user?.vehicleRegistration ?? '',
    vehicle_capacity:       String(driver?.vehicle_capacity ?? user?.vehicleCapacity ?? ''),
    vehicle_status:         driver?.vehicle_status ?? 'available',
    vehicle_available_from: driver?.vehicle_available_from ?? '',
    vehicle_available_to:   driver?.vehicle_available_to ?? '',
  };

  // ── Availability warning ───────────────────────────────────────────────────
  const availWarning = (() => {
    const to = driver?.vehicle_available_to;
    if (!to) return null;
    const diff = daysBetween(today(), to);
    if (diff < 0) return { type: 'expired' as const, text: '🔴 Vehicle availability EXPIRED' };
    if (diff <= 7) return { type: 'soon' as const, text: `⚠️ Available for ${diff} more day${diff === 1 ? '' : 's'}` };
    return null;
  })();

  // ── Maintenance alerts (overdue / due soon) ────────────────────────────────
  const alerts = maintenance.filter(m => getAlertStatus(m) !== null);

  // ── Render sub-views ───────────────────────────────────────────────────────
  if (view === 'editVehicle') {
    return (
      <EditVehicleView
        initial={editInitial}
        driverId={user!.id}
        onBack={() => setView('main')}
        onSaved={(updated) => {
          setDriver(prev => prev ? { ...prev, ...updated } : prev);
          setVehicleStatus(updated.vehicle_status ?? vehicleStatus);
          setView('main');
        }}
      />
    );
  }

  if (view === 'addMaintenance') {
    return (
      <AddMaintenanceView
        driverId={user!.id}
        prefillType={prefillMaintType}
        onBack={() => { setView('main'); setPrefillMaintType(undefined); }}
        onSaved={() => { setView('main'); setPrefillMaintType(undefined); fetchAll(); }}
      />
    );
  }

  // ── Main view ──────────────────────────────────────────────────────────────
  const displayModel = driver?.vehicle_model ?? user?.vehicleModel ?? 'No vehicle assigned';
  const displayReg   = driver?.vehicle_registration ?? user?.vehicleRegistration;
  const displayType  = driver?.vehicle_type ?? user?.vehicleType;
  const displayCap   = driver?.vehicle_capacity ?? user?.vehicleCapacity;
  const statusLabel  = VEHICLE_STATUS_OPTIONS.find(o => o.value === vehicleStatus)?.label ?? '🟢 Available';

  return (
    <MobileDriverLayout>
      <div className="pb-6">

        {/* ── Vehicle details card ── */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm mx-4 mt-4">

          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-16 rounded-full mx-auto" />
              <Skeleton className="h-5 w-40 mx-auto" />
              <Skeleton className="h-4 w-24 mx-auto" />
            </div>
          ) : (
            <>
              {/* Icon + title */}
              <div className="flex flex-col items-center mb-4">
                <Car className="w-16 h-16 text-[#2D5A45] dark:text-emerald-400 mb-2" />
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">{displayModel}</h2>
                {displayReg && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-medium tracking-widest">{displayReg}</p>
                )}
              </div>

              {/* Type + Capacity */}
              <div className="flex gap-3 mb-4">
                <div className="flex-1 bg-gray-50 dark:bg-gray-700 rounded-xl px-4 py-3 text-center">
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Type</p>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{displayType ?? '—'}</p>
                </div>
                <div className="flex-1 bg-gray-50 dark:bg-gray-700 rounded-xl px-4 py-3 text-center">
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Capacity</p>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                    {displayCap ? `${displayCap} pax` : '—'}
                  </p>
                </div>
              </div>

              {/* Status */}
              <div className="mb-4">
                <p className={labelCls}>Status</p>
                <select
                  value={vehicleStatus}
                  onChange={e => handleStatusChange(e.target.value)}
                  className={`${inputCls} cursor-pointer`}
                >
                  {VEHICLE_STATUS_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {/* Availability dates */}
              {(driver?.vehicle_available_from || driver?.vehicle_available_to) && (
                <div className="mb-3">
                  <p className={labelCls}>Availability</p>
                  <div className="flex gap-3">
                    <div className="flex-1 bg-gray-50 dark:bg-gray-700 rounded-xl px-3 py-2.5 text-center">
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-0.5">From</p>
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{fmtDate(driver?.vehicle_available_from)}</p>
                    </div>
                    <div className="flex-1 bg-gray-50 dark:bg-gray-700 rounded-xl px-3 py-2.5 text-center">
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-0.5">Until</p>
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{fmtDate(driver?.vehicle_available_to)}</p>
                    </div>
                  </div>
                  {availWarning && (
                    <p className={`text-xs mt-2 font-medium ${availWarning.type === 'expired' ? 'text-red-500' : 'text-amber-600 dark:text-amber-400'}`}>
                      {availWarning.text}
                    </p>
                  )}
                </div>
              )}

              {/* Edit button */}
              <button
                onClick={() => setView('editVehicle')}
                className="w-full h-11 rounded-xl border border-[#2D5A45] dark:border-emerald-600 text-[#2D5A45] dark:text-emerald-400 text-sm font-bold flex items-center justify-center gap-2 active:bg-[#2D5A45]/10 transition-colors"
              >
                <Edit3 className="w-4 h-4" /> EDIT VEHICLE DETAILS
              </button>
            </>
          )}
        </div>

        {/* ── Stats ── */}
        <div className="mx-4 mt-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-gray-600 dark:text-gray-300" />
            <h3 className="font-bold text-sm text-gray-800 dark:text-gray-100">Stats</h3>
          </div>
          {loading ? (
            <div className="grid grid-cols-2 gap-3">
              {[0,1,2,3].map(i => <Skeleton key={i} className="h-20" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <StatBox value={stats.weeklyKm > 0 ? `${stats.weeklyKm.toLocaleString()} km` : '—'} label="This Week" />
              <StatBox value={stats.monthlyKm > 0 ? `${stats.monthlyKm.toLocaleString()} km` : '—'} label="This Month" />
              <StatBox value={stats.weeklyTrips} label="Trips (week)" />
              <StatBox value={stats.weeklyPassengers} label="Passengers (wk)" />
            </div>
          )}
        </div>

        {/* ── Maintenance ── */}
        <div className="mx-4 mt-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-gray-600 dark:text-gray-300" />
              <h3 className="font-bold text-sm text-gray-800 dark:text-gray-100">Maintenance</h3>
            </div>
            <button
              onClick={() => { setPrefillMaintType(undefined); setView('addMaintenance'); }}
              className="flex items-center gap-1 text-sm font-semibold text-[#2D5A45] dark:text-emerald-400 active:opacity-70 transition-opacity"
            >
              <Plus className="w-4 h-4" /> ADD ENTRY
            </button>
          </div>

          {/* Alerts */}
          {alerts.length > 0 && (
            <div className="space-y-2 mb-4">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Alerts</p>
              {alerts.map(entry => {
                const alertType = getAlertStatus(entry);
                return (
                  <div key={entry.id} className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                          <span className="text-sm font-bold text-red-700 dark:text-red-400">
                            {entry.type} {alertType === 'overdue' ? 'OVERDUE' : 'DUE SOON'}
                          </span>
                        </div>
                        <p className="text-xs text-red-600 dark:text-red-400 pl-6">
                          Due: {fmtDate(entry.next_due_date)}
                          {entry.next_due_mileage ? ` · ${entry.next_due_mileage.toLocaleString()} km` : ''}
                        </p>
                      </div>
                      <button
                        onClick={() => { setPrefillMaintType(entry.type); setView('addMaintenance'); }}
                        className="text-xs font-bold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/40 px-3 py-1.5 rounded-lg shrink-0 active:scale-95 transition-transform"
                      >
                        Log Now
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* History */}
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : maintenance.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 text-center border border-gray-100 dark:border-gray-700">
              <Wrench className="w-8 h-8 text-gray-200 dark:text-gray-600 mx-auto mb-2" />
              <p className="text-sm text-gray-400 dark:text-gray-500">No maintenance records yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">History</p>
              {maintenance.map(entry => (
                <MaintenanceCard key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </div>

      </div>
    </MobileDriverLayout>
  );
}
