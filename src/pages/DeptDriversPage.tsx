/**
 * /dept/drivers — full driver management for Department Head,
 * scoped to transport teams that serve their accommodation department.
 *
 * Tabs: Roster | Schedule
 * Roster: view, add, edit, delete drivers + arrival board + workload chart + task assign
 * Schedule: editable weekly calendar (same pattern as TransportSchedulePage)
 */
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  Plus, Eye, Pencil, Trash2, Car, Users, CheckCircle2, FileText, MessageCircle, Wrench,
  BarChart3, MapPin, ExternalLink, CalendarDays, ChevronLeft, ChevronRight, Loader2,
} from 'lucide-react';
import { getMapLink, calculateETA, formatETA, isETAOverdue } from '@/lib/driverMatchUtils';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { DeptSidebar } from '@/components/DeptSidebar';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import type { DriverRecord } from '@/components/DriverFormDialog';
import { DriverTaskViewDialog } from '@/components/DriverTaskViewDialog';
import { CreateTaskDialog, type DriverInfo } from '@/components/CreateTaskDialog';
import { DailyReportDialog } from '@/components/DailyReportDialog';
import { DriverMessagesDialog } from '@/components/DriverMessagesDialog';
import { AddMaintenanceDialog, ViewMaintenanceLogDialog } from '@/components/VehicleMaintenanceDialog';
import { TopBar } from '@/components/TopBar';
import { fetchTransportDeptsForDept, getTransportDeptBadgeClass } from '@/hooks/useTransportDepartments';
import type { TransportDepartment } from '@/types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DriverRow extends DriverRecord {
  tasksToday: number;
  transport_department_id?: string | null;
}

interface ArrivalGuest {
  id: string;
  fullName: string;
  time?: string;
  flightNumber?: string;
  airport?: string;
  terminal?: string;
  placedLocation?: string;
}

interface FlightTask {
  guest_id: string | null;
  guest_name: string | null;
  driver_id: string;
  driver_name?: string;
  status: string;
  started_at?: string | null;
  pickup_location?: string | null;
  dropoff_location?: string | null;
  task_type?: string;
}

type PageTab = 'roster' | 'schedule';
type ScheduleStatus = 'on_duty' | 'off_duty' | 'leave' | 'half_day';

interface ScheduleEntry {
  id?: string;
  driver_id: string;
  date: string;
  status: ScheduleStatus;
  shift_start?: string;
  shift_end?: string;
  notes?: string;
}

interface EditTarget {
  driverId: string;
  driverName: string;
  dates: string[];
}

// ── Schedule constants ─────────────────────────────────────────────────────────

const STATUS_META: Record<ScheduleStatus, { label: string; emoji: string; bg: string; border: string; text: string }> = {
  on_duty:  { label: 'On Duty',  emoji: '🟢', bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700' },
  off_duty: { label: 'Off Duty', emoji: '🟡', bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700' },
  leave:    { label: 'Leave',    emoji: '🔴', bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-700'   },
  half_day: { label: 'Half Day', emoji: '🔵', bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700'  },
};

const STATUS_OPTIONS: ScheduleStatus[] = ['on_duty', 'off_duty', 'leave', 'half_day'];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ── Week helpers ───────────────────────────────────────────────────────────────

function weekStartOf(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

function weekDays(weekStart: string): string[] {
  const days: string[] = [];
  const base = new Date(weekStart + 'T00:00:00');
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
}

function addWeeks(weekStart: string, delta: number): string {
  const d = new Date(weekStart + 'T00:00:00');
  d.setDate(d.getDate() + delta * 7);
  return d.toISOString().split('T')[0];
}

function fmtDayHeader(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
}

function fmtWeekRange(weekStart: string): string {
  const days = weekDays(weekStart);
  const s = new Date(days[0] + 'T00:00:00');
  const e = new Date(days[6] + 'T00:00:00');
  const sStr = s.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const eStr = e.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${sStr} — ${eStr}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtTime = (iso?: string | null): string => {
  if (!iso) return '—';
  const timePart = iso.includes('T') ? iso.split('T')[1]?.substring(0, 5) : '';
  return timePart || iso.substring(0, 10);
};

// ── Schedule Edit Dialog ──────────────────────────────────────────────────────

function ScheduleEditDialog({
  target, existing, onClose, onSaved, userId,
}: {
  target: EditTarget | null;
  existing: ScheduleEntry | null;
  onClose: () => void;
  onSaved: (entries: ScheduleEntry[]) => void;
  userId: string;
}) {
  const [status, setStatus]    = useState<ScheduleStatus>('on_duty');
  const [shiftStart, setStart] = useState('09:00');
  const [shiftEnd, setEnd]     = useState('18:00');
  const [notes, setNotes]      = useState('');
  const [saving, setSaving]    = useState(false);

  useEffect(() => {
    if (!target) return;
    setStatus(existing?.status ?? 'on_duty');
    setStart(existing?.shift_start ?? '09:00');
    setEnd(existing?.shift_end ?? '18:00');
    setNotes(existing?.notes ?? '');
  }, [target, existing]);

  const handleSave = async () => {
    if (!target) return;
    setSaving(true);
    try {
      const records = target.dates.map(date => ({
        driver_id:   target.driverId,
        date,
        status,
        shift_start: status === 'on_duty' || status === 'half_day' ? shiftStart || null : null,
        shift_end:   status === 'on_duty' || status === 'half_day' ? shiftEnd || null : null,
        notes:       notes.trim() || null,
        set_by:      userId,
      }));
      const { error } = await supabase.from('driver_schedules').upsert(records, { onConflict: 'driver_id,date' });
      if (error) throw error;
      const saved: ScheduleEntry[] = records.map(r => ({
        driver_id: r.driver_id, date: r.date, status: r.status as ScheduleStatus,
        shift_start: r.shift_start ?? undefined, shift_end: r.shift_end ?? undefined, notes: r.notes ?? undefined,
      }));
      toast.success(target.dates.length === 1
        ? `Schedule updated for ${target.driverName}`
        : `Schedule set for ${target.dates.length} days — ${target.driverName}`);
      onSaved(saved);
      onClose();
    } catch {
      toast.error('Failed to save schedule');
    } finally {
      setSaving(false);
    }
  };

  const isBulk = (target?.dates.length ?? 1) > 1;

  return (
    <Dialog open={!!target} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-[#2D5A45]" />
            {isBulk
              ? `Set Schedule — ${target?.driverName} (${target?.dates.length} days)`
              : `Set Schedule — ${target?.driverName}`}
          </DialogTitle>
          {!isBulk && target && (
            <p className="text-sm text-[#4A4A4A]">
              {new Date(target.dates[0] + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          )}
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Status</Label>
            <select value={status} onChange={e => setStatus(e.target.value as ScheduleStatus)}
              className="w-full border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45] bg-white">
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{STATUS_META[s].emoji} {STATUS_META[s].label}</option>
              ))}
            </select>
          </div>
          {(status === 'on_duty' || status === 'half_day') && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Shift Start</Label>
                <input type="time" value={shiftStart} onChange={e => setStart(e.target.value)}
                  className="w-full border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45]" />
              </div>
              <div className="space-y-1.5">
                <Label>Shift End</Label>
                <input type="time" value={shiftEnd} onChange={e => setEnd(e.target.value)}
                  className="w-full border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45]" />
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Morning airport runs" rows={2}
              className="w-full border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45] resize-none bg-white" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-[#2D5A45] hover:bg-[#234839] text-white">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin mr-1.5" />Saving…</> : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Inline Driver Form Dialog (with transport team dropdown) ──────────────────

interface DeptDriverFormDialogProps {
  open: boolean;
  onClose: () => void;
  driver: DriverRow | null;
  transportDepts: TransportDepartment[];
  onSaved: (driver: DriverRow) => void;
}

function DeptDriverFormDialog({ open, onClose, driver, transportDepts, onSaved }: DeptDriverFormDialogProps) {
  const isEdit = !!driver;
  const [name, setName]       = useState('');
  const [email, setEmail]     = useState('');
  const [phone, setPhone]     = useState('');
  const [password, setPassword] = useState('');
  const [tdId, setTdId]       = useState('');
  const [vType, setVType]     = useState('');
  const [vModel, setVModel]   = useState('');
  const [vReg, setVReg]       = useState('');
  const [vCap, setVCap]       = useState('');
  const [isHead, setIsHead]   = useState(false);
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    if (!open) return;
    if (driver) {
      setName(driver.name);
      setEmail(driver.email);
      setPhone(driver.phone ?? '');
      setPassword('');
      setTdId(driver.transport_department_id ?? '');
      setVType(driver.vehicle_type ?? '');
      setVModel(driver.vehicle_model ?? '');
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
    if (!isEdit && !password.trim()) { toast.error('Password is required for new drivers'); return; }
    if (!tdId) { toast.error('Transport team is required'); return; }

    const selectedTd = transportDepts.find(t => t.id === tdId);
    setSaving(true);
    try {
      if (isEdit && driver) {
        const updates: Record<string, unknown> = {
          name: name.trim(), email: email.trim(), phone: phone.trim() || null,
          transport_department_id: tdId,
          transport_department_name: selectedTd?.name ?? null,
          vehicle_type: vType || null, vehicle_model: vModel.trim() || null,
          vehicle_registration: vReg.trim() || null,
          vehicle_capacity: vCap ? Number(vCap) : null,
          is_head_driver: isHead,
        };
        if (password.trim()) updates.password = password.trim();
        const { data, error } = await supabase.from('users').update(updates).eq('id', driver.id).select().single();
        if (error) throw error;
        toast.success('Driver updated');
        onSaved({ ...(data as DriverRecord), tasksToday: driver.tasksToday, transport_department_id: tdId });
      } else {
        const { data, error } = await supabase.from('users').insert({
          name: name.trim(), email: email.trim(), phone: phone.trim() || null,
          password: password.trim(), role: 'driver',
          transport_department_id: tdId,
          transport_department_name: selectedTd?.name ?? null,
          vehicle_type: vType || null, vehicle_model: vModel.trim() || null,
          vehicle_registration: vReg.trim() || null,
          vehicle_capacity: vCap ? Number(vCap) : null,
          is_head_driver: isHead, is_available: true,
        }).select().single();
        if (error) throw error;
        toast.success('Driver added');
        onSaved({ ...(data as DriverRecord), tasksToday: 0, transport_department_id: tdId });
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
              {isEdit && <span className="text-[#4A4A4A] text-xs font-normal ml-1">(leave blank to keep current)</span>}
            </Label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
              className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]" />
          </div>
          <div className="space-y-1.5">
            <Label>Transport Team <span className="text-red-500">*</span></Label>
            <select value={tdId} onChange={e => setTdId(e.target.value)}
              className="w-full border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45] bg-white">
              <option value="">Select team…</option>
              {transportDepts.map(td => (
                <option key={td.id} value={td.id}>{td.name}</option>
              ))}
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
            <input type="checkbox" id="isHead" checked={isHead} onChange={e => setIsHead(e.target.checked)}
              className="accent-[#2D5A45] w-4 h-4" />
            <label htmlFor="isHead" className="text-sm text-[#1A1A1A] cursor-pointer">
              Nazim Transport (head driver for this team)
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving} className="border-[#D4CFC7] text-[#4A4A4A]">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-[#2D5A45] hover:bg-[#234839] text-white">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin mr-1.5" />Saving…</> : (isEdit ? 'Update Driver' : 'Add Driver')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DeptDriversPage() {
  const { user } = useAuth();
  const dept = user?.department ?? '';

  const [tab, setTab] = useState<PageTab>('roster');

  // ── core state ────────────────────────────────────────────────────────────────
  const [drivers, setDrivers]                 = useState<DriverRow[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [myTransportDepts, setMyTransportDepts] = useState<TransportDepartment[]>([]);
  const [transportFilter, setTransportFilter] = useState('');

  // roster dialogs
  const [formOpen, setFormOpen]               = useState(false);
  const [editDriver, setEditDriver]           = useState<DriverRow | null>(null);
  const [deleteId, setDeleteId]               = useState<string | null>(null);
  const [reportOpen, setReportOpen]           = useState(false);
  const [viewDriver, setViewDriver]           = useState<DriverRecord | null>(null);
  const [assignDriver, setAssignDriver]       = useState<DriverRecord | null>(null);
  const [msgDriver, setMsgDriver]             = useState<DriverRecord | null>(null);
  const [maintViewDriver, setMaintViewDriver] = useState<DriverRecord | null>(null);
  const [maintAddDriver, setMaintAddDriver]   = useState<DriverRecord | null>(null);

  // arrival board
  const [arrivals, setArrivals]               = useState<ArrivalGuest[]>([]);
  const [departures, setDepartures]           = useState<ArrivalGuest[]>([]);
  const [pickupTasks, setPickupTasks]         = useState<FlightTask[]>([]);
  const [dropoffTasks, setDropoffTasks]       = useState<FlightTask[]>([]);
  const [arrivalsLoading, setArrivalsLoading] = useState(true);

  // schedule state
  const [weekStart, setWeekStart]             = useState<string>(() => weekStartOf(new Date()));
  const [schedules, setSchedules]             = useState<Record<string, ScheduleEntry>>({});
  const [taskCounts, setTaskCounts]           = useState<Record<string, number>>({});
  const [schedLoading, setSchedLoading]       = useState(false);
  const [selectedDrivers, setSelectedDrivers] = useState<Set<string>>(new Set());
  const [editTarget, setEditTarget]           = useState<EditTarget | null>(null);
  const [editExisting, setEditExisting]       = useState<ScheduleEntry | null>(null);

  const loadedRef   = useRef(false);
  const schedLoadedWeekRef = useRef('');

  const today = useMemo(() => new Date().toISOString().substring(0, 10), []);

  // ── Fetch roster + transport depts ────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    if (!dept) return;

    const tdepts = await fetchTransportDeptsForDept(dept);
    setMyTransportDepts(tdepts);
    const tdIds = tdepts.map(d => d.id);

    if (tdIds.length === 0) {
      setDrivers([]);
      setLoading(false);
      return;
    }

    const [driversRes, tasksRes] = await Promise.all([
      supabase.from('users')
        .select('id,name,email,phone,location,department,transport_department_id,vehicle_type,vehicle_model,vehicle_registration,vehicle_capacity,is_head_driver,is_available')
        .eq('role', 'driver')
        .in('transport_department_id', tdIds),
      supabase.from('driver_tasks')
        .select('driver_id')
        .in('transport_department_id', tdIds)
        .eq('scheduled_date', today)
        .neq('status', 'cancelled')
        .neq('status', 'suggested'),
    ]);

    const countMap: Record<string, number> = {};
    for (const t of tasksRes.data ?? []) {
      countMap[t.driver_id] = (countMap[t.driver_id] ?? 0) + 1;
    }
    setDrivers((driversRes.data ?? []).map(d => ({ ...d, tasksToday: countMap[d.id] ?? 0 })) as DriverRow[]);
    setLoading(false);
  }, [dept, today]);

  // ── Fetch arrivals / departures ───────────────────────────────────────────────

  const fetchArrivals = useCallback(async () => {
    if (!dept) return;
    setArrivalsLoading(true);

    const [arrivalsRes, departuresRes, pickupRes, dropoffRes] = await Promise.all([
      supabase.from('guests').select('id,full_name,arrival_time,flight_number,arrival_airport,arrival_terminal,placed_location')
        .eq('assigned_department', dept).gte('arrival_time', today).lte('arrival_time', `${today}T23:59:59`).order('arrival_time'),
      supabase.from('guests').select('id,full_name,departure_time,flight_number,departure_airport,departure_terminal,placed_location')
        .eq('assigned_department', dept).gte('departure_time', today).lte('departure_time', `${today}T23:59:59`).order('departure_time'),
      supabase.from('driver_tasks').select('guest_id,guest_name,driver_id,driver_name,status,started_at,pickup_location,dropoff_location,task_type')
        .eq('task_type', 'airport_pickup').eq('department', dept).eq('scheduled_date', today),
      supabase.from('driver_tasks').select('guest_id,guest_name,driver_id,driver_name,status,started_at,pickup_location,dropoff_location,task_type')
        .eq('task_type', 'airport_dropoff').eq('department', dept).eq('scheduled_date', today),
    ]);

    setArrivals((arrivalsRes.data ?? []).map(r => ({
      id: r.id, fullName: r.full_name, time: r.arrival_time,
      flightNumber: r.flight_number, airport: r.arrival_airport,
      terminal: r.arrival_terminal, placedLocation: r.placed_location,
    })));
    setDepartures((departuresRes.data ?? []).map(r => ({
      id: r.id, fullName: r.full_name, time: r.departure_time,
      flightNumber: r.flight_number, airport: r.departure_airport,
      terminal: r.departure_terminal, placedLocation: r.placed_location,
    })));
    setPickupTasks((pickupRes.data ?? []) as FlightTask[]);
    setDropoffTasks((dropoffRes.data ?? []) as FlightTask[]);
    setArrivalsLoading(false);
  }, [dept, today]);

  // ── Fetch schedule ────────────────────────────────────────────────────────────

  const fetchSchedule = useCallback(async () => {
    const driverIds = drivers.map(d => d.id);
    if (driverIds.length === 0) return;
    setSchedLoading(true);
    const days = weekDays(weekStart);
    const weekEnd = days[6];
    try {
      const [schedulesRes, tasksRes] = await Promise.all([
        supabase.from('driver_schedules').select('*').in('driver_id', driverIds).gte('date', weekStart).lte('date', weekEnd),
        supabase.from('driver_tasks').select('driver_id,scheduled_date').in('driver_id', driverIds)
          .gte('scheduled_date', weekStart).lte('scheduled_date', weekEnd).neq('status', 'cancelled'),
      ]);
      const sMap: Record<string, ScheduleEntry> = {};
      for (const s of (schedulesRes.data ?? []) as ScheduleEntry[]) {
        sMap[`${s.driver_id}|${s.date}`] = s;
      }
      setSchedules(sMap);
      const tMap: Record<string, number> = {};
      for (const t of (tasksRes.data ?? []) as { driver_id: string; scheduled_date: string }[]) {
        const key = `${t.driver_id}|${t.scheduled_date}`;
        tMap[key] = (tMap[key] ?? 0) + 1;
      }
      setTaskCounts(tMap);
    } catch { /* driver_schedules may not exist yet */ }
    setSchedLoading(false);
    schedLoadedWeekRef.current = weekStart;
  }, [drivers, weekStart]);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    fetchAll();
    fetchArrivals();
  }, [fetchAll, fetchArrivals]);

  useEffect(() => {
    if (tab === 'schedule' && schedLoadedWeekRef.current !== weekStart) {
      fetchSchedule();
    }
  }, [tab, weekStart, fetchSchedule]);

  // ── Roster handlers ───────────────────────────────────────────────────────────

  const handleSaved = (saved: DriverRow) => {
    setDrivers(prev => {
      const idx = prev.findIndex(d => d.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = { ...next[idx], ...saved }; return next; }
      return [saved, ...prev];
    });
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('users').delete().eq('id', id);
    if (error) { toast.error('Failed to delete driver'); return; }
    toast.success('Driver removed');
    setDrivers(prev => prev.filter(d => d.id !== id));
    setDeleteId(null);
  };

  const handleQuickAssign = async (guest: ArrivalGuest, driverId: string, taskType: 'airport_pickup' | 'airport_dropoff') => {
    const driver = drivers.find(d => d.id === driverId);
    if (!driver) return;
    const { error } = await supabase.from('driver_tasks').insert({
      driver_id: driverId, driver_name: driver.name, task_type: taskType,
      status: 'pending', scheduled_date: today,
      scheduled_time: guest.time ? fmtTime(guest.time) : null,
      guest_id: guest.id, guest_name: guest.fullName,
      location: driver.location, department: dept,
      transport_department_id: driver.transport_department_id ?? null,
      is_suggestion: false,
    });
    if (error) { toast.error('Failed to assign driver'); return; }
    toast.success(`${driver.name} assigned to ${taskType === 'airport_pickup' ? 'pick up' : 'drop off'} ${guest.fullName}`);
    const newTask: FlightTask = { guest_id: guest.id, guest_name: guest.fullName, driver_id: driverId, driver_name: driver.name, status: 'pending' };
    if (taskType === 'airport_pickup') setPickupTasks(p => [...p, newTask]);
    else setDropoffTasks(p => [...p, newTask]);
    fetchAll();
  };

  // ── Schedule handlers ─────────────────────────────────────────────────────────

  const days = weekDays(weekStart);

  const handleCellClick = (driver: DriverRow, date: string) => {
    setEditTarget({ driverId: driver.id, driverName: driver.name, dates: [date] });
    setEditExisting(schedules[`${driver.id}|${date}`] ?? null);
  };

  const handleBulkSet = () => {
    if (selectedDrivers.size === 0) return;
    const firstDriverId = [...selectedDrivers][0];
    const firstName = filtered.find(d => d.id === firstDriverId)?.name ?? '';
    const label = selectedDrivers.size === 1 ? firstName : `${selectedDrivers.size} drivers`;
    setEditTarget({ driverId: [...selectedDrivers].join(','), driverName: label, dates: days });
    setEditExisting(null);
  };

  const handleScheduleSaved = useCallback((entries: ScheduleEntry[]) => {
    if (selectedDrivers.size > 1 && editTarget) {
      const selectedArr = [...selectedDrivers];
      const driverEntries: ScheduleEntry[] = [];
      for (const dId of selectedArr) {
        for (const e of entries) driverEntries.push({ ...e, driver_id: dId });
      }
      supabase.from('driver_schedules').upsert(
        driverEntries.map(e => ({
          driver_id: e.driver_id, date: e.date, status: e.status,
          shift_start: e.shift_start ?? null, shift_end: e.shift_end ?? null, notes: e.notes ?? null,
          set_by: user?.id,
        })),
        { onConflict: 'driver_id,date' }
      ).then(() => {
        const newMap = { ...schedules };
        for (const e of driverEntries) newMap[`${e.driver_id}|${e.date}`] = e;
        setSchedules(newMap);
        setSelectedDrivers(new Set());
        toast.success(`Schedule set for ${selectedArr.length} drivers`);
      });
    } else {
      const newMap = { ...schedules };
      for (const e of entries) newMap[`${e.driver_id}|${e.date}`] = e;
      setSchedules(newMap);
    }
  }, [selectedDrivers, schedules, editTarget, user?.id]);

  const toggleDriverSelect = (id: string) => {
    setSelectedDrivers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ── Derived values ────────────────────────────────────────────────────────────

  const filtered = transportFilter
    ? drivers.filter(d => d.transport_department_id === transportFilter)
    : drivers;

  const total     = filtered.length;
  const available = filtered.filter(d => d.is_available).length;
  const onDuty    = filtered.filter(d => d.tasksToday > 0).length;

  const driverInfos: DriverInfo[] = filtered.map(d => ({
    id: d.id, name: d.name, vehicle_type: d.vehicle_type, vehicle_model: d.vehicle_model,
    vehicle_capacity: d.vehicle_capacity, is_available: d.is_available, location: d.location,
  }));

  const workloadData = useMemo(() => [...filtered].sort((a, b) => b.tasksToday - a.tasksToday), [filtered]);
  const maxTasks = useMemo(() => Math.max(1, ...workloadData.map(d => d.tasksToday)), [workloadData]);
  const overloadedDrivers = workloadData.filter(d => d.tasksToday >= 7);

  const getPickupTask  = (guestId: string) => pickupTasks.find(t => t.guest_id === guestId);
  const getDropoffTask = (guestId: string) => dropoffTasks.find(t => t.guest_id === guestId);
  const unassignedArrivals   = arrivals.filter(g => !getPickupTask(g.id));
  const unassignedDepartures = departures.filter(g => !getDropoffTask(g.id));

  const getTransportDeptName = (tdId?: string | null) =>
    myTransportDepts.find(td => td.id === tdId)?.name ?? '—';

  // Schedule drivers: use filtered list
  const schedDrivers = filtered;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen bg-[#F5F0E8]">
      <DeptSidebar />
      <main className="ml-64 flex-1">
        <TopBar />
        <div className="p-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#1A1A1A]">Drivers</h1>
            <p className="text-sm text-[#4A4A4A] mt-0.5">{dept} — transport teams</p>
          </div>
          <div className="flex items-center gap-3">
            {myTransportDepts.length > 1 && (
              <select value={transportFilter} onChange={e => setTransportFilter(e.target.value)}
                className="border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45] bg-white">
                <option value="">All Teams</option>
                {myTransportDepts.map(td => <option key={td.id} value={td.id}>{td.name}</option>)}
              </select>
            )}
            <Button variant="outline" onClick={() => setReportOpen(true)}
              className="text-[#2D5A45] border-[#2D5A45] hover:bg-[#F5F0E8] gap-2">
              <FileText className="w-4 h-4" /> Daily Report
            </Button>
            <Button onClick={() => { setEditDriver(null); setFormOpen(true); }}
              className="bg-[#2D5A45] hover:bg-[#234839] text-white gap-2">
              <Plus className="w-4 h-4" /> Add Driver
            </Button>
          </div>
        </div>

        {/* Tab pills */}
        <div className="flex gap-1 mb-6 bg-white border border-[#E8E3DB] rounded-xl p-1 w-fit">
          {([['roster', 'Roster', Users], ['schedule', 'Schedule', CalendarDays]] as [PageTab, string, React.ElementType][]).map(([t, label, Icon]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === t ? 'bg-[#2D5A45] text-white' : 'text-[#4A4A4A] hover:bg-[#F5F0E8]'
              }`}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {/* ── TAB: ROSTER ─────────────────────────────────────────────────────── */}
        {tab === 'roster' && (
          <>
            {/* Arrival board */}
            {!arrivalsLoading && (arrivals.length > 0 || departures.length > 0) && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">✈️</span>
                  <h2 className="font-semibold text-[#1A1A1A]">Today's Arrivals &amp; Departures</h2>
                  <span className="text-xs text-[#4A4A4A] bg-[#F5F0E8] px-2 py-0.5 rounded-full">
                    {new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Arrivals */}
                  <div className="bg-white rounded-xl border border-[#E8E3DB] overflow-hidden">
                    <div className="bg-green-50 border-b border-green-100 px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-green-700 font-semibold text-sm">✈️ Arrivals Today</span>
                        <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">{arrivals.length}</span>
                      </div>
                      {unassignedArrivals.length > 0 && (
                        <span className="text-xs text-amber-600">⚠️ {unassignedArrivals.length} no driver</span>
                      )}
                    </div>
                    {arrivals.length === 0 ? (
                      <p className="p-4 text-sm text-[#4A4A4A] text-center">No arrivals today</p>
                    ) : (
                      <div className="divide-y divide-[#E8E3DB]">
                        {arrivals.map(g => {
                          const task = getPickupTask(g.id);
                          const mapUrl = getMapLink(g.airport, g.terminal);
                          const eta = task?.status === 'in_progress' && task.started_at
                            ? calculateETA({ task_type: 'airport_pickup', pickup_location: task.pickup_location, dropoff_location: task.dropoff_location, started_at: task.started_at }) : null;
                          const etaStr  = eta ? formatETA(eta) : null;
                          const etaOver = eta ? isETAOverdue(eta) : false;
                          return (
                            <div key={g.id} className="px-4 py-2.5 text-xs hover:bg-[#F5F0E8]/50">
                              <div className="flex items-center gap-2">
                                <span className="text-[#4A4A4A] w-10 shrink-0 font-mono">{fmtTime(g.time)}</span>
                                <span className="text-[#4A4A4A] w-16 shrink-0 font-mono truncate">{g.flightNumber ?? '—'}</span>
                                <a href={mapUrl} target="_blank" rel="noopener noreferrer"
                                  className="flex items-center gap-0.5 text-[#2D5A45] hover:underline w-16 shrink-0 truncate">
                                  <MapPin className="w-3 h-3 shrink-0" />
                                  <span className="truncate">{g.terminal ?? g.airport ?? '—'}</span>
                                  <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-50" />
                                </a>
                                <span className="font-medium text-[#1A1A1A] flex-1 truncate">{g.fullName}</span>
                                {task ? (
                                  <span className={`flex items-center gap-1 shrink-0 ${task.status === 'in_progress' ? 'text-blue-700' : 'text-green-700'}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full inline-block ${task.status === 'in_progress' ? 'bg-blue-500' : 'bg-green-500'}`} />
                                    {task.driver_name}{task.status === 'completed' ? ' ✅' : ' 🔵'}
                                  </span>
                                ) : (
                                  <select defaultValue="" onChange={e => { if (e.target.value) handleQuickAssign(g, e.target.value, 'airport_pickup'); }}
                                    className="shrink-0 text-xs border border-amber-300 rounded-lg px-1.5 py-1 bg-amber-50 text-amber-800 focus:outline-none focus:border-[#2D5A45] cursor-pointer">
                                    <option value="">Assign ▼</option>
                                    {drivers.filter(d => d.is_available).map(d => (
                                      <option key={d.id} value={d.id}>{d.name}{d.vehicle_type ? ` · ${d.vehicle_type}` : ''}{d.vehicle_capacity ? ` · ${d.vehicle_capacity}p` : ''}</option>
                                    ))}
                                  </select>
                                )}
                              </div>
                              {etaStr && <p className={`ml-[168px] mt-0.5 font-medium ${etaOver ? 'text-red-600' : 'text-blue-600'}`}>{etaStr}</p>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {unassignedArrivals.length > 0 && (
                      <div className="px-4 py-2 bg-amber-50 border-t border-amber-100 text-xs text-amber-700">
                        ⚠️ {unassignedArrivals.length} arrival{unassignedArrivals.length !== 1 ? 's' : ''} have no driver assigned
                      </div>
                    )}
                  </div>

                  {/* Departures */}
                  <div className="bg-white rounded-xl border border-[#E8E3DB] overflow-hidden">
                    <div className="bg-amber-50 border-b border-amber-100 px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-amber-700 font-semibold text-sm">✈️ Departures Today</span>
                        <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">{departures.length}</span>
                      </div>
                      {unassignedDepartures.length > 0 && (
                        <span className="text-xs text-amber-600">⚠️ {unassignedDepartures.length} no driver</span>
                      )}
                    </div>
                    {departures.length === 0 ? (
                      <p className="p-4 text-sm text-[#4A4A4A] text-center">No departures today</p>
                    ) : (
                      <div className="divide-y divide-[#E8E3DB]">
                        {departures.map(g => {
                          const task = getDropoffTask(g.id);
                          const mapUrl = getMapLink(g.airport, g.terminal);
                          const eta = task?.status === 'in_progress' && task.started_at
                            ? calculateETA({ task_type: 'airport_dropoff', pickup_location: task.pickup_location, dropoff_location: task.dropoff_location, started_at: task.started_at }) : null;
                          const etaStr  = eta ? formatETA(eta) : null;
                          const etaOver = eta ? isETAOverdue(eta) : false;
                          return (
                            <div key={g.id} className="px-4 py-2.5 text-xs hover:bg-[#F5F0E8]/50">
                              <div className="flex items-center gap-2">
                                <span className="text-[#4A4A4A] w-10 shrink-0 font-mono">{fmtTime(g.time)}</span>
                                <span className="text-[#4A4A4A] w-16 shrink-0 font-mono truncate">{g.flightNumber ?? '—'}</span>
                                <a href={mapUrl} target="_blank" rel="noopener noreferrer"
                                  className="flex items-center gap-0.5 text-[#2D5A45] hover:underline w-16 shrink-0 truncate">
                                  <MapPin className="w-3 h-3 shrink-0" />
                                  <span className="truncate">{g.terminal ?? g.airport ?? '—'}</span>
                                  <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-50" />
                                </a>
                                <span className="font-medium text-[#1A1A1A] flex-1 truncate">{g.fullName}</span>
                                {task ? (
                                  <span className={`flex items-center gap-1 shrink-0 ${task.status === 'in_progress' ? 'text-blue-700' : 'text-green-700'}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full inline-block ${task.status === 'in_progress' ? 'bg-blue-500' : 'bg-green-500'}`} />
                                    {task.driver_name}{task.status === 'completed' ? ' ✅' : ' 🔵'}
                                  </span>
                                ) : (
                                  <select defaultValue="" onChange={e => { if (e.target.value) handleQuickAssign(g, e.target.value, 'airport_dropoff'); }}
                                    className="shrink-0 text-xs border border-amber-300 rounded-lg px-1.5 py-1 bg-amber-50 text-amber-800 focus:outline-none focus:border-[#2D5A45] cursor-pointer">
                                    <option value="">Assign ▼</option>
                                    {drivers.filter(d => d.is_available).map(d => (
                                      <option key={d.id} value={d.id}>{d.name}{d.vehicle_type ? ` · ${d.vehicle_type}` : ''}{d.vehicle_capacity ? ` · ${d.vehicle_capacity}p` : ''}</option>
                                    ))}
                                  </select>
                                )}
                              </div>
                              {etaStr && <p className={`ml-[168px] mt-0.5 font-medium ${etaOver ? 'text-red-600' : 'text-blue-600'}`}>{etaStr}</p>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {unassignedDepartures.length > 0 && (
                      <div className="px-4 py-2 bg-amber-50 border-t border-amber-100 text-xs text-amber-700">
                        ⚠️ {unassignedDepartures.length} departure{unassignedDepartures.length !== 1 ? 's' : ''} have no driver assigned
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Workload chart */}
            {!loading && filtered.length > 0 && (
              <div className="bg-white rounded-xl border border-[#E8E3DB] mb-6 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-[#2D5A45]" />
                    <h2 className="font-semibold text-[#1A1A1A] text-sm">Driver Workload — Today</h2>
                  </div>
                  {overloadedDrivers.length > 0 && (
                    <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
                      ⚠️ {overloadedDrivers.length} driver{overloadedDrivers.length > 1 ? 's' : ''} overloaded
                    </span>
                  )}
                </div>
                <div className="space-y-2.5">
                  {workloadData.map(d => {
                    const load = d.tasksToday >= 7 ? 'heavy' : d.tasksToday >= 4 ? 'normal' : 'light';
                    const barCls = load === 'heavy' ? 'bg-red-400' : load === 'normal' ? 'bg-amber-400' : 'bg-green-400';
                    const pct = maxTasks > 0 ? Math.round((d.tasksToday / maxTasks) * 100) : 0;
                    return (
                      <div key={d.id} className="flex items-center gap-3 text-sm">
                        <span className="w-36 shrink-0 text-[#1A1A1A] font-medium truncate text-xs">
                          {d.name}
                          {d.transport_department_id && (
                            <span className="text-gray-400 font-normal"> ({getTransportDeptName(d.transport_department_id)})</span>
                          )}
                        </span>
                        <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-4 rounded-full transition-all duration-500 ${barCls}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-20 shrink-0 text-xs text-right text-[#4A4A4A]">{d.tasksToday} task{d.tasksToday !== 1 ? 's' : ''}</span>
                        <span className={`w-14 shrink-0 text-xs font-medium ${load === 'heavy' ? 'text-red-600' : load === 'normal' ? 'text-amber-600' : 'text-green-600'}`}>
                          {load === 'heavy' ? '⚠️ Heavy' : load === 'normal' ? '✅ Normal' : '✅ Light'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              {[
                { icon: Users,        label: 'Total Drivers', value: total,     color: 'bg-blue-50 text-blue-700'   },
                { icon: CheckCircle2, label: 'Available',      value: available, color: 'bg-green-50 text-green-700' },
                { icon: Car,          label: 'On Duty Today',  value: onDuty,    color: 'bg-amber-50 text-amber-700' },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-xl p-4 border border-[#E8E3DB] flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color}`}>
                    <s.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-[#1A1A1A]">{s.value}</p>
                    <p className="text-xs text-[#4A4A4A]">{s.label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Driver roster table */}
            <div className="bg-white rounded-xl border border-[#E8E3DB]">
              <div className="p-4 border-b border-[#E8E3DB]">
                <h2 className="font-semibold text-[#1A1A1A]">Driver Roster</h2>
              </div>
              {loading ? (
                <div className="p-8 text-center text-[#4A4A4A] text-sm">Loading…</div>
              ) : filtered.length === 0 ? (
                <div className="p-8 text-center text-[#4A4A4A] text-sm">
                  {myTransportDepts.length === 0
                    ? 'No transport teams assigned to your department yet.'
                    : 'No drivers in your transport teams.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#E8E3DB] bg-[#F5F0E8]">
                        <th className="px-4 py-3 text-left font-medium text-[#4A4A4A]">Name</th>
                        <th className="px-4 py-3 text-left font-medium text-[#4A4A4A]">Transport Team</th>
                        <th className="px-4 py-3 text-left font-medium text-[#4A4A4A]">Vehicle</th>
                        <th className="px-4 py-3 text-left font-medium text-[#4A4A4A]">Status</th>
                        <th className="px-4 py-3 text-left font-medium text-[#4A4A4A]">Today</th>
                        <th className="px-4 py-3 text-left font-medium text-[#4A4A4A]">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8E3DB]">
                      {filtered.map(d => (
                        <tr key={d.id} className="hover:bg-[#F5F0E8]/50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-medium text-[#1A1A1A]">{d.name}</div>
                            <div className="text-xs text-[#4A4A4A]">
                              {d.is_head_driver && <span className="mr-1 text-amber-600 font-medium">★ Nazim</span>}
                              {d.email}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {d.transport_department_id ? (
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${getTransportDeptBadgeClass(getTransportDeptName(d.transport_department_id))}`}>
                                {getTransportDeptName(d.transport_department_id)}
                              </span>
                            ) : <span className="text-[#4A4A4A]">—</span>}
                          </td>
                          <td className="px-4 py-3 text-[#4A4A4A]">
                            {d.vehicle_type ? `${d.vehicle_type}${d.vehicle_capacity != null ? ` (${d.vehicle_capacity} pax)` : ''}` : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${d.is_available ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {d.is_available ? 'Available' : 'Off Duty'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${d.tasksToday > 0 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                              {d.tasksToday}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <button onClick={() => setViewDriver(d)} title="View Tasks"
                                className="p-1.5 rounded-lg text-[#4A4A4A] hover:bg-[#F5F0E8] hover:text-[#2D5A45] transition-colors">
                                <Eye className="w-4 h-4" />
                              </button>
                              <button onClick={() => { setEditDriver(d); setFormOpen(true); }} title="Edit Driver"
                                className="p-1.5 rounded-lg text-[#4A4A4A] hover:bg-[#F5F0E8] hover:text-[#2D5A45] transition-colors">
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button onClick={() => setMsgDriver(d)} title="Messages"
                                className="p-1.5 rounded-lg text-[#4A4A4A] hover:bg-[#F5F0E8] hover:text-[#2D5A45] transition-colors">
                                <MessageCircle className="w-4 h-4" />
                              </button>
                              <button onClick={() => setMaintViewDriver(d)} title="Maintenance Log"
                                className="p-1.5 rounded-lg text-[#4A4A4A] hover:bg-[#F5F0E8] hover:text-[#2D5A45] transition-colors">
                                <Wrench className="w-4 h-4" />
                              </button>
                              <button onClick={() => setAssignDriver(d)} title="Assign Task"
                                className="p-1.5 rounded-lg text-[#4A4A4A] hover:bg-[#F5F0E8] hover:text-[#2D5A45] transition-colors">
                                <Plus className="w-4 h-4" />
                              </button>
                              {deleteId === d.id ? (
                                <>
                                  <button onClick={() => handleDelete(d.id)} className="text-xs text-red-600 font-medium px-2 py-1 rounded-lg hover:bg-red-50">Confirm</button>
                                  <button onClick={() => setDeleteId(null)} className="text-xs text-[#4A4A4A] px-2 py-1 rounded-lg hover:bg-[#F5F0E8]">No</button>
                                </>
                              ) : (
                                <button onClick={() => setDeleteId(d.id)} title="Remove Driver"
                                  className="p-1.5 rounded-lg text-[#4A4A4A] hover:bg-red-50 hover:text-red-600 transition-colors">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── TAB: SCHEDULE ────────────────────────────────────────────────────── */}
        {tab === 'schedule' && (
          <>
            {/* Week nav */}
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div>
                <p className="text-sm font-medium text-[#1A1A1A]">{fmtWeekRange(weekStart)}</p>
              </div>
              <div className="flex items-center gap-2">
                {selectedDrivers.size > 0 && (
                  <Button variant="outline" onClick={handleBulkSet}
                    className="text-[#2D5A45] border-[#2D5A45] hover:bg-[#F5F0E8] text-sm gap-1">
                    <CalendarDays className="w-4 h-4" />
                    Set Week for {selectedDrivers.size} driver{selectedDrivers.size > 1 ? 's' : ''}
                  </Button>
                )}
                <div className="flex items-center gap-1 bg-white border border-[#E8E3DB] rounded-lg p-0.5">
                  <button onClick={() => { setWeekStart(w => addWeeks(w, -1)); setSelectedDrivers(new Set()); }}
                    className="p-1.5 rounded-md hover:bg-[#F5F0E8] text-[#4A4A4A] transition-colors">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button onClick={() => { setWeekStart(weekStartOf(new Date())); setSelectedDrivers(new Set()); }}
                    className="px-2 py-1 text-xs font-medium text-[#2D5A45] hover:bg-[#F5F0E8] rounded-md transition-colors">
                    Today
                  </button>
                  <button onClick={() => { setWeekStart(w => addWeeks(w, 1)); setSelectedDrivers(new Set()); }}
                    className="p-1.5 rounded-md hover:bg-[#F5F0E8] text-[#4A4A4A] transition-colors">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Legend */}
            <div className="flex gap-3 mb-4 flex-wrap">
              {STATUS_OPTIONS.map(s => (
                <div key={s} className="flex items-center gap-1.5 text-xs text-[#4A4A4A]">
                  <span className={`w-3 h-3 rounded-sm border ${STATUS_META[s].bg} ${STATUS_META[s].border}`} />
                  {STATUS_META[s].emoji} {STATUS_META[s].label}
                </div>
              ))}
              <div className="flex items-center gap-1.5 text-xs text-[#4A4A4A]">
                <span className="w-3 h-3 rounded-sm border bg-gray-50 border-gray-200" /> ⬜ Unset
              </div>
            </div>

            {/* Calendar grid */}
            {schedLoading ? (
              <div className="flex items-center justify-center py-16 text-[#4A4A4A]">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading schedule…
              </div>
            ) : schedDrivers.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#E8E3DB] p-10 text-center text-sm text-[#4A4A4A]">
                No drivers found. Add drivers in the Roster tab.
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-[#E8E3DB] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[700px]">
                    <thead>
                      <tr className="border-b border-[#E8E3DB] bg-[#F5F0E8]">
                        <th className="px-3 py-2.5 text-left w-8">
                          <input type="checkbox"
                            checked={selectedDrivers.size === schedDrivers.length && schedDrivers.length > 0}
                            onChange={e => setSelectedDrivers(e.target.checked ? new Set(schedDrivers.map(d => d.id)) : new Set())}
                            className="accent-[#2D5A45]" />
                        </th>
                        <th className="px-3 py-2.5 text-left font-medium text-[#4A4A4A] min-w-[130px]">Driver</th>
                        {days.map((day, i) => {
                          const isToday = day === today;
                          return (
                            <th key={day} className={`px-2 py-2.5 text-center font-medium text-xs min-w-[90px] ${isToday ? 'text-[#2D5A45]' : 'text-[#4A4A4A]'}`}>
                              <div>{DAY_LABELS[i]}</div>
                              <div className={`text-[10px] font-normal ${isToday ? 'text-[#2D5A45] font-bold' : 'text-[#4A4A4A]'}`}>
                                {fmtDayHeader(day).split(' ').slice(1).join(' ')}
                              </div>
                            </th>
                          );
                        })}
                        <th className="px-3 py-2.5 text-center font-medium text-[#4A4A4A] text-xs">Tasks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8E3DB]">
                      {schedDrivers.map(d => {
                        const isSelected = selectedDrivers.has(d.id);
                        const weekTaskCount = days.reduce((sum, day) => sum + (taskCounts[`${d.id}|${day}`] ?? 0), 0);
                        return (
                          <tr key={d.id} className={`${isSelected ? 'bg-[#F5F0E8]/60' : 'hover:bg-[#F5F0E8]/30'} transition-colors`}>
                            <td className="px-3 py-2">
                              <input type="checkbox" checked={isSelected} onChange={() => toggleDriverSelect(d.id)}
                                className="accent-[#2D5A45]" />
                            </td>
                            <td className="px-3 py-2">
                              <div className="font-medium text-[#1A1A1A] text-xs truncate max-w-[130px]">{d.name}</div>
                              {d.vehicle_type && <div className="text-[10px] text-[#4A4A4A] truncate">{d.vehicle_type}</div>}
                            </td>
                            {days.map(day => {
                              const key   = `${d.id}|${day}`;
                              const entry = schedules[key];
                              const tCount = taskCounts[key] ?? 0;
                              const isToday = day === today;
                              return (
                                <td key={day}
                                  onClick={() => handleCellClick(d, day)}
                                  className={`px-1 py-1.5 text-center cursor-pointer transition-colors ${isToday ? 'ring-1 ring-inset ring-[#2D5A45]/20' : ''}`}>
                                  {entry ? (
                                    <div className={`rounded-md px-1.5 py-1 text-[10px] font-medium border ${STATUS_META[entry.status].bg} ${STATUS_META[entry.status].border} ${STATUS_META[entry.status].text}`}>
                                      <div>{STATUS_META[entry.status].emoji}</div>
                                      {entry.shift_start && <div className="text-[9px] opacity-80">{entry.shift_start.substring(0, 5)}</div>}
                                      {tCount > 0 && <div className="text-[9px] font-bold text-blue-600 mt-0.5">{tCount}t</div>}
                                    </div>
                                  ) : (
                                    <div className="rounded-md px-1.5 py-1 text-[10px] border bg-gray-50 border-gray-200 text-gray-400 hover:bg-gray-100 transition-colors">
                                      <div>—</div>
                                      {tCount > 0 && <div className="text-[9px] font-bold text-blue-600 mt-0.5">{tCount}t</div>}
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                            <td className="px-3 py-2 text-center">
                              <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${weekTaskCount > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                                {weekTaskCount}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-2 border-t border-[#E8E3DB] bg-[#F5F0E8]/50 text-xs text-[#4A4A4A]">
                  Click any cell to set availability. Check rows to bulk-set the whole week.
                </div>
              </div>
            )}
          </>
        )}

        </div>{/* /p-8 */}
      </main>

      {/* ── Dialogs ── */}

      <DeptDriverFormDialog
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditDriver(null); }}
        driver={editDriver}
        transportDepts={myTransportDepts}
        onSaved={saved => { handleSaved(saved); setFormOpen(false); setEditDriver(null); }}
      />

      {viewDriver && (
        <DriverTaskViewDialog
          open={!!viewDriver}
          onClose={() => setViewDriver(null)}
          driverId={viewDriver.id}
          driverName={viewDriver.name}
          locationName={viewDriver.location}
        />
      )}

      {assignDriver && (
        <CreateTaskDialog
          open={!!assignDriver}
          onClose={() => setAssignDriver(null)}
          drivers={driverInfos}
          preselectedDriverId={assignDriver.id}
          locationName={assignDriver.location ?? ''}
          departmentName={dept}
          onCreated={() => fetchAll()}
        />
      )}

      <DailyReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        generatedBy={user?.name ?? 'Department Head'}
      />

      {user && (
        <DriverMessagesDialog
          open={!!msgDriver}
          onClose={() => setMsgDriver(null)}
          driverId={msgDriver?.id ?? ''}
          driverName={msgDriver?.name ?? ''}
          currentUser={{ id: user.id, name: user.name, role: user.role }}
        />
      )}

      {maintViewDriver && (
        <ViewMaintenanceLogDialog
          open={!!maintViewDriver}
          onClose={() => setMaintViewDriver(null)}
          driverId={maintViewDriver.id}
          driverName={maintViewDriver.name}
          vehicleRegistration={maintViewDriver.vehicle_registration ?? undefined}
          onAddEntry={() => { setMaintAddDriver(maintViewDriver); setMaintViewDriver(null); }}
        />
      )}

      {maintAddDriver && (
        <AddMaintenanceDialog
          open={!!maintAddDriver}
          onClose={() => setMaintAddDriver(null)}
          driverId={maintAddDriver.id}
          vehicleRegistration={maintAddDriver.vehicle_registration ?? undefined}
          onSaved={() => setMaintAddDriver(null)}
        />
      )}

      <ScheduleEditDialog
        target={editTarget}
        existing={editExisting}
        onClose={() => { setEditTarget(null); setEditExisting(null); }}
        onSaved={handleScheduleSaved}
        userId={user?.id ?? ''}
      />
    </div>
  );
}
