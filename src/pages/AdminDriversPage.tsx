/**
 * /admin/drivers — one-page transport management for Super Admin.
 * Shows ALL drivers grouped by transport dept, ALL guests needing pickup/dropoff.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Phone, MapPin, MessageCircle, ChevronDown, ChevronUp, Loader2, Plus, Car, Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { SidebarUserFooter } from '@/components/SidebarUserFooter';
import { TopBar } from '@/components/TopBar';
import { SUPER_ADMIN_NAV } from '@/lib/navItems';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { getMapLink } from '@/lib/driverMatchUtils';
import { DriverMessagesDialog } from '@/components/DriverMessagesDialog';
import { useTransportDepts } from '@/hooks/useTransportDepartments';
import type { TransportDepartment } from '@/types';
import { formatDate, formatTime, formatDateShort, formatTimestampTime } from '@/utils/dateHelpers';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DriverRow {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  vehicle_type?: string | null;
  vehicle_model?: string | null;
  vehicle_registration?: string | null;
  vehicle_capacity?: number | null;
  vehicle_available_from?: string | null;
  vehicle_available_to?: string | null;
  is_head_driver?: boolean;
  is_available?: boolean;
  transport_department_id?: string | null;
  tasksToday: number;
  hasActiveTask: boolean;
}

interface GuestRow {
  id: string;
  full_name: string;
  country?: string | null;
  contact_number?: string | null;
  arrival_time?: string | null;
  departure_time?: string | null;
  flight_number?: string | null;
  arrival_airport?: string | null;
  arrival_terminal?: string | null;
  departure_airport?: string | null;
  departure_terminal?: string | null;
  placed_location?: string | null;
  transport_department_id?: string | null;
  family_members?: { id: string }[];
}

interface TaskRow {
  id: string;
  driver_id: string;
  driver_name?: string | null;
  guest_id?: string | null;
  guest_name?: string | null;
  task_type: string;
  status: string;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  pickup_location?: string | null;
  dropoff_location?: string | null;
  transport_department_id?: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const todayStr = new Date().toISOString().slice(0, 10);

const DEPT_COLOR_CYCLE = [
  { header: 'text-green-700 bg-green-50 border-green-200',    dot: 'bg-green-500'  },
  { header: 'text-blue-700 bg-blue-50 border-blue-200',       dot: 'bg-blue-500'   },
  { header: 'text-purple-700 bg-purple-50 border-purple-200', dot: 'bg-purple-500' },
  { header: 'text-amber-700 bg-amber-50 border-amber-200',    dot: 'bg-amber-500'  },
  { header: 'text-teal-700 bg-teal-50 border-teal-200',       dot: 'bg-teal-500'   },
  { header: 'text-rose-700 bg-rose-50 border-rose-200',       dot: 'bg-rose-500'   },
];

function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—';
  // driver_tasks.completed_at etc. — full ISO timestamps
  return `${formatDateShort(iso)} ${formatTimestampTime(iso)}`;
}

const fmtDate = (iso?: string | null): string => iso ? formatDate(iso) : '';
const fmtTime = (iso?: string | null): string => formatTime(iso);

function driverStatus(driver: DriverRow): 'available' | 'on_task' | 'off_duty' {
  if (driver.hasActiveTask) return 'on_task';
  if (!driver.is_available) return 'off_duty';
  return 'available';
}

function StatusDot({ status }: { status: 'available' | 'on_task' | 'off_duty' }) {
  const cls = status === 'available' ? 'bg-green-500' : status === 'on_task' ? 'bg-blue-500' : 'bg-yellow-400';
  const title = status === 'available' ? 'Available' : status === 'on_task' ? 'On Task' : 'Off Duty';
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${cls} shrink-0`} title={title} />;
}

function vehicleAvailLabel(driver: DriverRow): { label: string; warn: 'none' | 'amber' | 'red' } {
  if (!driver.vehicle_available_from && !driver.vehicle_available_to) {
    return { label: 'Always', warn: 'none' };
  }
  const now = Date.now();
  const toMs = driver.vehicle_available_to
    ? new Date(driver.vehicle_available_to + (driver.vehicle_available_to.includes('T') ? '' : 'T12:00:00')).getTime()
    : null;
  if (toMs && toMs < now) {
    return { label: `${fmtDate(driver.vehicle_available_from)} — ${fmtDate(driver.vehicle_available_to)} EXPIRED`, warn: 'red' };
  }
  if (toMs && toMs < now + 7 * 86400000) {
    return { label: `${fmtDate(driver.vehicle_available_from)} — ${fmtDate(driver.vehicle_available_to)}`, warn: 'amber' };
  }
  const from = driver.vehicle_available_from ? fmtDate(driver.vehicle_available_from) : '';
  const to   = driver.vehicle_available_to   ? fmtDate(driver.vehicle_available_to)   : '';
  const label = from && to ? `${from} — ${to}` : from ? `From ${from}` : to ? `Until ${to}` : 'Always';
  return { label, warn: 'none' };
}

function passengerLabel(guest: GuestRow): string {
  const total = 1 + (guest.family_members?.length ?? 0);
  return total === 1 ? '1 passenger' : `Family (${total})`;
}

function taskDuration(task: TaskRow): string {
  if (!task.started_at || !task.completed_at) return '';
  const ms   = new Date(task.completed_at).getTime() - new Date(task.started_at).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// ── Add/Edit Driver Dialog ────────────────────────────────────────────────────

interface AdminDriverFormProps {
  open: boolean;
  onClose: () => void;
  driver: DriverRow | null;
  transportDepts: TransportDepartment[];
  onSaved: (driver: DriverRow) => void;
}

function AdminDriverFormDialog({ open, onClose, driver, transportDepts, onSaved }: AdminDriverFormProps) {
  const isEdit = !!driver;
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [phone, setPhone]       = useState('');
  const [password, setPassword] = useState('');
  const [tdId, setTdId]         = useState('');
  const [vType, setVType]       = useState('');
  const [vModel, setVModel]     = useState('');
  const [vReg, setVReg]         = useState('');
  const [vCap, setVCap]         = useState('');
  const [isHead, setIsHead]     = useState(false);
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    if (!open) return;
    if (driver) {
      setName(driver.name); setEmail(driver.email);
      setPhone(driver.phone ?? ''); setPassword('');
      setTdId(driver.transport_department_id ?? '');
      setVType(driver.vehicle_type ?? ''); setVModel(driver.vehicle_model ?? '');
      setVReg(driver.vehicle_registration ?? '');
      setVCap(driver.vehicle_capacity != null ? String(driver.vehicle_capacity) : '');
      setIsHead(driver.is_head_driver ?? false);
    } else {
      setName(''); setEmail(''); setPhone(''); setPassword('');
      setTdId(transportDepts[0]?.id ?? '');
      setVType(''); setVModel(''); setVReg(''); setVCap(''); setIsHead(false);
    }
  }, [open, driver, transportDepts]);

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    if (!email.trim()) { toast.error('Email is required'); return; }
    if (!isEdit && !password.trim()) { toast.error('Password is required'); return; }
    if (!tdId) { toast.error('Transport team is required'); return; }
    const selectedTd = transportDepts.find(t => t.id === tdId);
    setSaving(true);
    try {
      const common = {
        name: name.trim(), email: email.trim(), phone: phone.trim() || null,
        transport_department_id: tdId,
        transport_department_name: selectedTd?.name ?? null,
        vehicle_type: vType || null, vehicle_model: vModel.trim() || null,
        vehicle_registration: vReg.trim() || null,
        vehicle_capacity: vCap ? Number(vCap) : null,
        is_head_driver: isHead,
      };
      if (isEdit && driver) {
        const updates: Record<string, unknown> = { ...common };
        if (password.trim()) updates.password_hash = password.trim();
        const { data, error } = await supabase.from('users').update(updates).eq('id', driver.id).select().single();
        if (error) throw error;
        toast.success('Driver updated');
        onSaved({ ...(data as DriverRow), tasksToday: driver.tasksToday, hasActiveTask: driver.hasActiveTask });
      } else {
        const { data, error } = await supabase.from('users').insert({
          ...common, password_hash: password.trim(), role: 'driver', is_available: true,
        }).select().single();
        if (error) throw error;
        toast.success('Driver added');
        onSaved({ ...(data as DriverRow), tasksToday: 0, hasActiveTask: false });
      }
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save driver');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Driver' : 'Add Driver'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Name <span className="text-red-500">*</span></Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Driver name"
              className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]" />
          </div>
          <div className="space-y-1.5">
            <Label>Email <span className="text-red-500">*</span></Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="driver@example.com"
              className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]" />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+44 7000 000000"
              className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]" />
          </div>
          <div className="space-y-1.5">
            <Label>
              Password{!isEdit && <span className="text-red-500"> *</span>}
              {isEdit && <span className="text-xs font-normal text-[#4A4A4A] ml-1">(leave blank to keep current)</span>}
            </Label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
              className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]" />
          </div>
          <div className="space-y-1.5">
            <Label>Transport Team <span className="text-red-500">*</span></Label>
            <select value={tdId} onChange={e => setTdId(e.target.value)}
              className="w-full border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45] bg-white">
              <option value="">Select team…</option>
              {transportDepts.map(td => <option key={td.id} value={td.id}>{td.name}</option>)}
            </select>
          </div>
          <div className="pt-1 border-t border-[#E8E3DB]">
            <p className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider mb-3">Vehicle Details</p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Vehicle Type</Label>
                <select value={vType} onChange={e => setVType(e.target.value)}
                  className="w-full border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45] bg-white">
                  <option value="">None / Unknown</option>
                  {['Saloon', 'MPV', 'Minibus', 'Coach', 'Van', 'SUV'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Model</Label>
                  <Input value={vModel} onChange={e => setVModel(e.target.value)} placeholder="e.g. Toyota Alphard"
                    className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]" />
                </div>
                <div className="space-y-1.5">
                  <Label>Registration</Label>
                  <Input value={vReg} onChange={e => setVReg(e.target.value)} placeholder="e.g. AB12 CDE"
                    className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Passenger Capacity</Label>
                <Input type="number" min="1" max="72" value={vCap} onChange={e => setVCap(e.target.value)} placeholder="e.g. 8"
                  className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="isHeadAdmin" checked={isHead} onChange={e => setIsHead(e.target.checked)}
              className="accent-[#2D5A45] w-4 h-4" />
            <label htmlFor="isHeadAdmin" className="text-sm cursor-pointer">Nazim Transport (head driver)</label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-[#2D5A45] hover:bg-[#234839] text-white">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin mr-1.5" />Saving…</> : (isEdit ? 'Update' : 'Add Driver')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ label, count }: { label: string; count?: number }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="h-px flex-1 bg-[#E8E3DB]" />
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">{label}</span>
        {count !== undefined && (
          <span className="text-xs font-bold bg-[#2D5A45] text-white px-1.5 py-0.5 rounded-full">{count}</span>
        )}
      </div>
      <div className="h-px flex-1 bg-[#E8E3DB]" />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export interface AdminDriversPageProps {
  /** When true, render only the main content (for embedding inside AdminTransportPage tabs). */
  hideSidebar?: boolean;
}

export default function AdminDriversPage({ hideSidebar = false }: AdminDriversPageProps = {}) {
  const { user }           = useAuth();
  const { transportDepts } = useTransportDepts();
  const navigate           = useNavigate();
  const location           = useLocation();

  const [drivers, setDrivers]               = useState<DriverRow[]>([]);
  const [pickupGuests, setPickupGuests]     = useState<GuestRow[]>([]);
  const [dropoffGuests, setDropoffGuests]   = useState<GuestRow[]>([]);
  const [tasks, setTasks]                   = useState<TaskRow[]>([]);
  const [loading, setLoading]               = useState(true);
  const [formOpen, setFormOpen]             = useState(false);
  const [editDriver, setEditDriver]         = useState<DriverRow | null>(null);
  const [msgDriver, setMsgDriver]           = useState<DriverRow | null>(null);
  const [showMsgList, setShowMsgList]       = useState(false);
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [assigning, setAssigning]           = useState<Record<string, boolean>>({});

  // ── Fetch ─────────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    const [driversRes, activeTasksRes, todayTasksRes, pickupRes, dropoffRes] = await Promise.all([
      supabase.from('users').select('*').eq('role', 'driver')
        .order('transport_department_id').order('is_head_driver', { ascending: false }).order('name'),
      supabase.from('driver_tasks').select('*')
        .in('status', ['pending', 'in_progress']).gte('scheduled_date', todayStr),
      supabase.from('driver_tasks').select('driver_id, status')
        .eq('scheduled_date', todayStr).neq('status', 'cancelled').neq('status', 'suggested'),
      supabase.from('guests')
        .select('id, full_name, country, contact_number, arrival_time, flight_number, arrival_airport, arrival_terminal, placed_location, transport_department_id, family_members(*)')
        .gte('arrival_time', todayStr + 'T00:00:00').order('arrival_time'),
      supabase.from('guests')
        .select('id, full_name, country, contact_number, departure_time, flight_number, departure_airport, departure_terminal, placed_location, transport_department_id, family_members(*)')
        .gte('departure_time', todayStr + 'T00:00:00').order('departure_time'),
    ]);

    const taskCountMap: Record<string, number> = {};
    const activeSet = new Set<string>();
    for (const t of todayTasksRes.data ?? []) {
      taskCountMap[t.driver_id] = (taskCountMap[t.driver_id] ?? 0) + 1;
    }
    for (const t of activeTasksRes.data ?? []) {
      if (t.status === 'in_progress') activeSet.add(t.driver_id);
    }
    setDrivers((driversRes.data ?? []).map(d => ({
      ...d, tasksToday: taskCountMap[d.id] ?? 0, hasActiveTask: activeSet.has(d.id),
    })));

    const allGuestIds = [
      ...(pickupRes.data ?? []).map(g => g.id),
      ...(dropoffRes.data ?? []).map(g => g.id),
    ];
    const completedRes = allGuestIds.length > 0
      ? await supabase.from('driver_tasks').select('guest_id, task_type')
          .in('guest_id', allGuestIds).eq('status', 'completed')
      : { data: [] };
    const completedPickup  = new Set<string>();
    const completedDropoff = new Set<string>();
    for (const t of completedRes.data ?? []) {
      if (t.task_type === 'airport_pickup')  completedPickup.add(t.guest_id);
      if (t.task_type === 'airport_dropoff') completedDropoff.add(t.guest_id);
    }
    setPickupGuests((pickupRes.data ?? []).filter(g => !completedPickup.has(g.id)) as GuestRow[]);
    setDropoffGuests((dropoffRes.data ?? []).filter(g => !completedDropoff.has(g.id)) as GuestRow[]);

    const completedTodayRes = await supabase.from('driver_tasks').select('*')
      .eq('status', 'completed').eq('scheduled_date', todayStr);
    setTasks([...(activeTasksRes.data ?? []), ...(completedTodayRes.data ?? [])] as TaskRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Real-time ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const channel = supabase.channel('admin-drivers-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_tasks' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guests' }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAll]);

  // ── Assignment ────────────────────────────────────────────────────────────────

  const handleAssign = async (
    guest: GuestRow,
    driverId: string,
    taskType: 'airport_pickup' | 'airport_dropoff',
  ) => {
    const driver = drivers.find(d => d.id === driverId);
    if (!driver) return;
    const key = `${guest.id}_${taskType}`;
    setAssigning(prev => ({ ...prev, [key]: true }));
    try {
      const timeField  = taskType === 'airport_pickup' ? guest.arrival_time : guest.departure_time;
      const airport    = taskType === 'airport_pickup' ? guest.arrival_airport : guest.departure_airport;
      const terminal   = taskType === 'airport_pickup' ? guest.arrival_terminal : guest.departure_terminal;
      const pickupLoc  = taskType === 'airport_pickup'
        ? [airport, terminal].filter(Boolean).join(' ')
        : guest.placed_location ?? '';
      const dropoffLoc = taskType === 'airport_pickup'
        ? guest.placed_location ?? ''
        : [airport, terminal].filter(Boolean).join(' ');

      const existing = tasks.find(t =>
        t.guest_id === guest.id && t.task_type === taskType &&
        t.status !== 'completed' && t.status !== 'cancelled'
      );

      if (existing) {
        const { error } = await supabase.from('driver_tasks')
          .update({ driver_id: driverId, driver_name: driver.name, status: 'pending' })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const scheduledDate  = timeField ? timeField.slice(0, 10) : todayStr;
        const scheduledTime  = timeField && timeField.length > 10
          ? new Date(timeField).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
          : undefined;
        const passengerCount = 1 + (guest.family_members?.length ?? 0);
        const { error } = await supabase.from('driver_tasks').insert({
          guest_id: guest.id, guest_name: guest.full_name,
          driver_id: driverId, driver_name: driver.name,
          task_type: taskType,
          pickup_location: pickupLoc, dropoff_location: dropoffLoc,
          scheduled_date: scheduledDate, scheduled_time: scheduledTime ?? null,
          flight_number: guest.flight_number ?? null,
          passenger_count: passengerCount,
          priority: 'normal', status: 'pending',
          transport_department_id: guest.transport_department_id ?? null,
          is_suggestion: false,
        });
        if (error) throw error;
      }
      const verb = taskType === 'airport_pickup' ? 'pick up' : 'drop off';
      toast.success(`${driver.name} assigned to ${verb} ${guest.full_name}`);
      fetchAll();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to assign driver');
    } finally {
      setAssigning(prev => ({ ...prev, [key]: false }));
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────────

  const activeTasks    = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
  const completedToday = tasks.filter(t => t.status === 'completed');

  const pickupDriverMap:  Record<string, string> = {};
  const dropoffDriverMap: Record<string, string> = {};
  for (const t of activeTasks) {
    if (!t.guest_id) continue;
    if (t.task_type === 'airport_pickup')  pickupDriverMap[t.guest_id]  = t.driver_id;
    if (t.task_type === 'airport_dropoff') dropoffDriverMap[t.guest_id] = t.driver_id;
  }

  const knownTdIds = new Set(transportDepts.map(d => d.id));

  // ── Sub-components ────────────────────────────────────────────────────────────

  function DriverCard({ driver }: { driver: DriverRow }) {
    const status = driverStatus(driver);
    const avail  = vehicleAvailLabel(driver);
    return (
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <StatusDot status={status} />
            <div>
              <span className="font-semibold text-[#1A1A1A]">{driver.name}</span>
              {driver.is_head_driver && (
                <span className="ml-2 text-xs font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">★ Nazim</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {driver.phone && (
              <a href={`tel:${driver.phone}`} className="flex items-center gap-1 text-xs text-[#2D5A45] hover:underline">
                <Phone className="w-3 h-3" />{driver.phone}
              </a>
            )}
            <button onClick={() => setMsgDriver(driver)}
              className="p-1.5 rounded-lg text-[#4A4A4A] hover:bg-[#F5F0E8] hover:text-[#2D5A45] transition-colors" title="Messages">
              <MessageCircle className="w-4 h-4" />
            </button>
            <button onClick={() => { setEditDriver(driver); setFormOpen(true); }}
              className="p-1.5 rounded-lg text-[#4A4A4A] hover:bg-[#F5F0E8] hover:text-[#2D5A45] transition-colors" title="Edit">
              <Car className="w-4 h-4" />
            </button>
          </div>
        </div>
        {(driver.vehicle_type || driver.vehicle_model) && (
          <p className="text-sm text-[#4A4A4A]">
            🚐 {[driver.vehicle_type, driver.vehicle_model, driver.vehicle_registration].filter(Boolean).join(' · ')}
            {driver.vehicle_capacity != null && ` · ${driver.vehicle_capacity} seats`}
          </p>
        )}
        <div className="flex items-center gap-4 text-xs text-[#4A4A4A]">
          <span className={avail.warn === 'red' ? 'text-red-600 font-medium' : avail.warn === 'amber' ? 'text-amber-600 font-medium' : ''}>
            Available: {avail.label}
          </span>
          <span className={driver.tasksToday > 0 ? 'text-amber-700 font-medium' : ''}>
            Today: {driver.tasksToday} task{driver.tasksToday !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    );
  }

  function GuestCard({ guest, taskType }: { guest: GuestRow; taskType: 'airport_pickup' | 'airport_dropoff' }) {
    const isPickup   = taskType === 'airport_pickup';
    const time       = isPickup ? guest.arrival_time : guest.departure_time;
    const airport    = isPickup ? guest.arrival_airport : guest.departure_airport;
    const terminal   = isPickup ? guest.arrival_terminal : guest.departure_terminal;
    const assignedId = isPickup ? pickupDriverMap[guest.id] : dropoffDriverMap[guest.id];
    const key        = `${guest.id}_${taskType}`;
    const isLoading  = assigning[key] ?? false;
    const mapUrl     = airport ? getMapLink(airport, terminal ?? undefined) : undefined;

    return (
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <p className="font-semibold text-[#1A1A1A]">{guest.full_name}</p>
            {guest.country && <p className="text-xs text-[#4A4A4A]">{guest.country}</p>}
          </div>
          <span className="text-xs bg-[#F5F0E8] text-[#2D5A45] px-2 py-0.5 rounded-full shrink-0">
            👥 {passengerLabel(guest)}
          </span>
        </div>
        <div className="text-sm text-[#4A4A4A] space-y-1 mb-3">
          {(guest.flight_number || time) && (
            <p>✈️ {[guest.flight_number, fmtDateTime(time), airport, terminal].filter(Boolean).join(' · ')}</p>
          )}
          <p className={isPickup ? 'text-green-700' : 'text-amber-700'}>
            {isPickup ? '→' : '←'} {guest.placed_location ?? '—'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <select
              value={assignedId ?? ''}
              onChange={e => { if (e.target.value) handleAssign(guest, e.target.value, taskType); }}
              disabled={isLoading}
              className="flex-1 min-w-0 border border-[#E8E3DB] rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#2D5A45] bg-white disabled:opacity-60 truncate"
            >
              <option value="">Select Driver ▼</option>
              {drivers.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name}{d.vehicle_type ? ` · ${d.vehicle_type}` : ''}{d.vehicle_capacity != null ? ` · ${d.vehicle_capacity}p` : ''}
                  {d.is_available ? ' 🟢' : ' 🟡'}
                </option>
              ))}
            </select>
            {assignedId && <Check className="w-4 h-4 text-green-600 shrink-0" />}
            {isLoading && <Loader2 className="w-4 h-4 animate-spin text-[#2D5A45] shrink-0" />}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {guest.contact_number && (
              <a href={`tel:${guest.contact_number}`}
                className="flex items-center gap-1 text-xs border border-[#E8E3DB] rounded-lg px-2.5 py-1.5 text-[#2D5A45] hover:bg-[#F5F0E8] transition-colors">
                <Phone className="w-3 h-3" /> Call
              </a>
            )}
            {mapUrl && (
              <a href={mapUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs border border-[#E8E3DB] rounded-lg px-2.5 py-1.5 text-[#4A4A4A] hover:bg-[#F5F0E8] transition-colors">
                <MapPin className="w-3 h-3" /> Navigate
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className={hideSidebar ? '' : 'flex min-h-screen bg-[#F5F0E8]'}>
      {/* Sidebar */}
      {!hideSidebar && (
        <aside className="w-64 bg-white border-r border-[#E8E3DB] min-h-screen fixed left-0 top-0 flex flex-col">
          <div className="p-4 border-b border-[#E8E3DB]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#2D5A45] rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">J</span>
              </div>
              <div>
                <span className="font-semibold text-[#1A1A1A]">Jalsa Guest</span>
                <p className="text-xs text-[#4A4A4A]">Admin View</p>
              </div>
            </div>
          </div>
          <nav className="p-4 space-y-1 flex-1">
            <div className="text-xs font-medium text-[#4A4A4A] uppercase tracking-wider mb-2">Main</div>
            {SUPER_ADMIN_NAV.map((item, i) => (
              <button key={i} onClick={() => navigate(item.href)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  location.pathname === item.href
                    ? 'bg-[#2D5A45] text-white'
                    : 'text-[#4A4A4A] hover:bg-[#F5F0E8]'
                }`}>
                <item.icon className="w-5 h-5" />
                {item.label}
              </button>
            ))}
          </nav>
          <SidebarUserFooter />
        </aside>
      )}
      <main className={hideSidebar ? 'flex-1' : 'ml-64 flex-1'}>
        {!hideSidebar && <TopBar />}
        <div className={hideSidebar ? '' : 'p-8 max-w-5xl'}>

          <div className="flex items-center justify-between mb-8">
            <h1 className="text-2xl font-bold text-[#1A1A1A] flex items-center gap-2">
              🚗 Transportation — All Teams
            </h1>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowMsgList(true)}
                className="flex items-center gap-1.5 text-sm border border-[#E8E3DB] rounded-lg px-3 py-2 text-[#4A4A4A] hover:bg-white transition-colors bg-white">
                <MessageCircle className="w-4 h-4" /> Messages
              </button>
              <Button onClick={() => { setEditDriver(null); setFormOpen(true); }}
                className="bg-[#2D5A45] hover:bg-[#234839] text-white gap-2">
                <Plus className="w-4 h-4" /> Add Driver
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20 text-[#4A4A4A]">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <div className="space-y-8">

              {/* ALL DRIVERS — grouped by transport dept */}
              <section>
                <SectionHeader label="All Drivers" count={drivers.length} />
                {drivers.length === 0 ? (
                  <p className="text-sm text-center text-[#4A4A4A] py-6">No drivers found.</p>
                ) : (
                  <div className="space-y-6">
                    {transportDepts.map((dept, idx) => {
                      const deptDrivers = drivers.filter(d => d.transport_department_id === dept.id);
                      if (deptDrivers.length === 0) return null;
                      const colors = DEPT_COLOR_CYCLE[idx % DEPT_COLOR_CYCLE.length];
                      return (
                        <div key={dept.id}>
                          <div className={`flex items-center gap-3 mb-3 px-3 py-2 rounded-lg border text-sm font-semibold ${colors.header}`}>
                            <span className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
                            {dept.name}
                            <span className="ml-auto text-xs font-normal opacity-70">
                              {deptDrivers.length} driver{deptDrivers.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {deptDrivers.map(d => <DriverCard key={d.id} driver={d} />)}
                          </div>
                        </div>
                      );
                    })}
                    {/* Drivers not assigned to any known transport dept */}
                    {(() => {
                      const unassigned = drivers.filter(d => !d.transport_department_id || !knownTdIds.has(d.transport_department_id));
                      if (unassigned.length === 0) return null;
                      return (
                        <div>
                          <div className="flex items-center gap-3 mb-3 px-3 py-2 rounded-lg border text-sm font-semibold text-gray-600 bg-gray-50 border-gray-200">
                            <span className="w-2.5 h-2.5 rounded-full bg-gray-400" />
                            Unassigned
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {unassigned.map(d => <DriverCard key={d.id} driver={d} />)}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </section>

              {/* GUESTS NEEDING PICKUP */}
              <section>
                <SectionHeader label="Guests Needing Pickup" count={pickupGuests.length} />
                {pickupGuests.length === 0 ? (
                  <p className="text-sm text-center text-[#4A4A4A] py-6">No upcoming arrivals.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {pickupGuests.map(g => <GuestCard key={g.id} guest={g} taskType="airport_pickup" />)}
                  </div>
                )}
              </section>

              {/* GUESTS NEEDING DROPOFF */}
              <section>
                <SectionHeader label="Guests Needing Dropoff" count={dropoffGuests.length} />
                {dropoffGuests.length === 0 ? (
                  <p className="text-sm text-center text-[#4A4A4A] py-6">No upcoming departures.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {dropoffGuests.map(g => <GuestCard key={g.id} guest={g} taskType="airport_dropoff" />)}
                  </div>
                )}
              </section>

              {/* ACTIVE TASKS */}
              {activeTasks.length > 0 && (
                <section>
                  <SectionHeader label="Active Tasks" count={activeTasks.length} />
                  <div className="space-y-3">
                    {activeTasks.map(t => {
                      const isInProgress = t.status === 'in_progress';
                      return (
                        <div key={t.id} className={`rounded-xl p-4 border ${isInProgress ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'}`}>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${isInProgress ? 'bg-blue-200 text-blue-800' : 'bg-amber-200 text-amber-800'}`}>
                              {isInProgress ? '🔵 IN PROGRESS' : '🟡 PENDING'}
                            </span>
                            <span className="text-sm font-medium text-[#1A1A1A]">
                              {t.driver_name ?? 'Driver'} → {t.guest_name ?? '—'}
                            </span>
                          </div>
                          {(t.pickup_location || t.dropoff_location) && (
                            <p className="text-xs text-[#4A4A4A] mt-1.5">
                              {t.pickup_location ?? '—'} → {t.dropoff_location ?? '—'}
                            </p>
                          )}
                          {isInProgress && t.started_at && (
                            <p className="text-xs text-blue-700 mt-1">Started: {fmtTime(t.started_at)}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* COMPLETED TODAY */}
              {completedToday.length > 0 && (
                <section>
                  <SectionHeader label="Completed Today" count={completedToday.length} />
                  <div className="space-y-2">
                    {(completedExpanded ? completedToday : completedToday.slice(0, 3)).map(t => {
                      const dur = taskDuration(t);
                      return (
                        <div key={t.id} className="rounded-xl p-3 border bg-gray-50 border-gray-200 text-gray-500">
                          <p className="text-sm">
                            <span className="text-green-600 font-medium">✅</span>{' '}
                            {t.driver_name ?? 'Driver'} → {t.guest_name ?? '—'}
                            {dur && <span className="text-xs ml-2">· {dur}</span>}
                          </p>
                          {(t.pickup_location || t.dropoff_location) && (
                            <p className="text-xs mt-0.5">{t.pickup_location ?? '—'} → {t.dropoff_location ?? '—'}</p>
                          )}
                        </div>
                      );
                    })}
                    {completedToday.length > 3 && (
                      <button onClick={() => setCompletedExpanded(e => !e)}
                        className="flex items-center gap-1 text-xs text-[#4A4A4A] hover:text-[#2D5A45] mt-1">
                        {completedExpanded
                          ? <><ChevronUp className="w-3.5 h-3.5" /> Show less</>
                          : <><ChevronDown className="w-3.5 h-3.5" /> Show all {completedToday.length} completed</>
                        }
                      </button>
                    )}
                  </div>
                </section>
              )}

            </div>
          )}
        </div>
      </main>

      {/* Dialogs */}

      <AdminDriverFormDialog
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditDriver(null); }}
        driver={editDriver}
        transportDepts={transportDepts}
        onSaved={saved => {
          setDrivers(prev => {
            const idx = prev.findIndex(d => d.id === saved.id);
            if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
            return [saved, ...prev];
          });
          setFormOpen(false); setEditDriver(null);
        }}
      />

      <Dialog open={showMsgList} onOpenChange={o => !o && setShowMsgList(false)}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>Driver Messages</DialogTitle></DialogHeader>
          <div className="space-y-1.5 py-1 max-h-80 overflow-y-auto">
            {drivers.map(d => (
              <button key={d.id} onClick={() => { setMsgDriver(d); setShowMsgList(false); }}
                className="w-full text-left flex items-center gap-3 p-3 rounded-lg hover:bg-[#F5F0E8] transition-colors">
                <MessageCircle className="w-4 h-4 text-[#2D5A45] shrink-0" />
                <div>
                  <p className="text-sm font-medium">{d.name}</p>
                  {d.vehicle_type && <p className="text-xs text-[#4A4A4A]">{d.vehicle_type}</p>}
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {user && (
        <DriverMessagesDialog
          open={!!msgDriver}
          onClose={() => setMsgDriver(null)}
          driverId={msgDriver?.id ?? ''}
          driverName={msgDriver?.name ?? ''}
          currentUser={{ id: user.id, name: user.name, role: user.role }}
        />
      )}
    </div>
  );
}
