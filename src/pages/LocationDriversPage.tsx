/**
 * /location/drivers — drivers at this location (Location Manager view).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Plus, Eye, Pencil, Trash2, Car, Users, CheckCircle2, FileText,
  MessageCircle, Wrench, Printer, Clock, Settings, ChevronDown, ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAuth } from '@/hooks/useAuth';
import {
  loadDriverPreferences, saveDriverPreferences, SUPPORTED_LANGUAGES,
  type DriverPreferences,
} from '@/lib/driverMatchUtils';
import { supabase } from '@/lib/supabase';
import { LocationSidebar } from '@/components/LocationSidebar';
import { Button } from '@/components/ui/button';
import { DriverFormDialog, type DriverRecord } from '@/components/DriverFormDialog';
import { DriverTaskViewDialog } from '@/components/DriverTaskViewDialog';
import { CreateTaskDialog, type DriverInfo } from '@/components/CreateTaskDialog';
import { DailyReportDialog } from '@/components/DailyReportDialog';
import { DriverMessagesDialog } from '@/components/DriverMessagesDialog';
import { AddMaintenanceDialog, ViewMaintenanceLogDialog } from '@/components/VehicleMaintenanceDialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DriverRow extends DriverRecord {
  tasksToday: number;
}

interface DriverStatusRow {
  id: string; name: string; vehicle_type?: string; vehicle_model?: string;
  vehicle_registration?: string; is_available?: boolean;
  activeTask: { task_type: string; guest_name?: string; pickup_location?: string; dropoff_location?: string } | null;
  completedToday: number; pendingToday: number; totalToday: number;
}

interface ScheduleOptions {
  driverVehicle: boolean;
  taskTimesRoutes: boolean;
  guestNames: boolean;
  contactNumbers: boolean;
  flightDetails: boolean;
  passengerPhotos: boolean;
  rememberSelections: boolean;
}

const DEFAULT_SCHEDULE_OPTIONS: ScheduleOptions = {
  driverVehicle: true, taskTimesRoutes: true, guestNames: true,
  contactNumbers: false, flightDetails: false, passengerPhotos: false, rememberSelections: true,
};

const LS_SCHEDULE_KEY = 'daily_transport_schedule_columns';

function loadScheduleOptions(): ScheduleOptions {
  try {
    const saved = localStorage.getItem(LS_SCHEDULE_KEY);
    if (saved) return { ...DEFAULT_SCHEDULE_OPTIONS, ...JSON.parse(saved) };
  } catch { /* empty */ }
  return DEFAULT_SCHEDULE_OPTIONS;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function LocationDriversPage() {
  const { user } = useAuth();
  const location = user?.location ?? '';

  const [drivers, setDrivers]     = useState<DriverRow[]>([]);
  const [loading, setLoading]     = useState(true);

  // Driver status widget data
  const [driverStatusRows, setDriverStatusRows] = useState<DriverStatusRow[]>([]);
  const [unassignedPickups, setUnassignedPickups] = useState(0);

  // dialogs
  const [formOpen, setFormOpen]         = useState(false);
  const [reportOpen, setReportOpen]     = useState(false);
  const [msgDriver, setMsgDriver]       = useState<DriverRecord | null>(null);
  const [editDriver, setEditDriver]     = useState<DriverRecord | null>(null);
  const [viewDriver, setViewDriver]     = useState<DriverRecord | null>(null);
  const [assignDriver, setAssignDriver] = useState<DriverRecord | null>(null);
  const [deleteId, setDeleteId]         = useState<string | null>(null);
  const [maintViewDriver, setMaintViewDriver] = useState<DriverRecord | null>(null);
  const [maintAddDriver, setMaintAddDriver]   = useState<DriverRecord | null>(null);

  // Print Schedule dialog
  const [scheduleOpen, setScheduleOpen]     = useState(false);
  const [scheduleDate, setScheduleDate]     = useState(() => new Date().toISOString().split('T')[0]);
  const [scheduleOpts, setScheduleOpts]     = useState<ScheduleOptions>(loadScheduleOptions);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  // Preferences
  const [prefsOpen, setPrefsOpen]   = useState(false);
  const [prefs, setPrefs]           = useState<DriverPreferences>(() => loadDriverPreferences(location));
  const [prefsSaved, setPrefsSaved] = useState(false);

  // suggestions
  interface SuggestedTask {
    id: string; task_type: string; scheduled_date: string;
    scheduled_time?: string; guest_name?: string;
    pickup_location?: string; dropoff_location?: string; passenger_count?: number;
  }
  const [suggestions, setSuggestions] = useState<SuggestedTask[]>([]);

  const loadedRef = useRef(false);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    if (!location) return;
    const today = new Date().toISOString().substring(0, 10);

    const [driversRes, tasksRes, suggestionsRes] = await Promise.all([
      supabase.from('users')
        .select('id,name,email,phone,location,department,vehicle_type,vehicle_model,vehicle_registration,vehicle_capacity,is_head_driver,is_available')
        .eq('role', 'driver').eq('location', location),
      supabase.from('driver_tasks')
        .select('driver_id,task_type,guest_name,status,scheduled_time,pickup_location,dropoff_location')
        .eq('location', location).eq('scheduled_date', today).neq('status', 'cancelled'),
      supabase.from('driver_tasks')
        .select('id,task_type,scheduled_date,scheduled_time,guest_name,pickup_location,dropoff_location,passenger_count')
        .eq('location', location).eq('is_suggestion', true).eq('status', 'suggested'),
    ]);

    type TaskItem = { driver_id: string; task_type: string; guest_name?: string; status: string; scheduled_time?: string; pickup_location?: string; dropoff_location?: string };
    const tasks = (tasksRes.data ?? []) as TaskItem[];
    const allDrivers = driversRes.data ?? [];

    const countMap: Record<string, number> = {};
    for (const t of tasks) {
      if (t.driver_id) countMap[t.driver_id] = (countMap[t.driver_id] ?? 0) + 1;
    }
    setDrivers(allDrivers.map(d => ({ ...d, tasksToday: countMap[d.id] ?? 0 })) as DriverRow[]);

    // Build driver status widget rows
    const unassigned = tasks.filter(t => !t.driver_id && t.status === 'suggested').length;
    setUnassignedPickups(unassigned);
    const tasksByDriver: Record<string, TaskItem[]> = {};
    for (const t of tasks) {
      if (!t.driver_id) continue;
      if (!tasksByDriver[t.driver_id]) tasksByDriver[t.driver_id] = [];
      tasksByDriver[t.driver_id].push(t);
    }
    setDriverStatusRows(allDrivers.map(d => {
      const dTasks = tasksByDriver[d.id] ?? [];
      const activeTask = dTasks.find(t => t.status === 'in_progress') ?? null;
      return {
        id: d.id, name: d.name, vehicle_type: d.vehicle_type, vehicle_model: d.vehicle_model,
        vehicle_registration: d.vehicle_registration, is_available: d.is_available,
        activeTask: activeTask ? { task_type: activeTask.task_type, guest_name: activeTask.guest_name, pickup_location: activeTask.pickup_location, dropoff_location: activeTask.dropoff_location } : null,
        completedToday: dTasks.filter(t => t.status === 'completed').length,
        pendingToday:   dTasks.filter(t => t.status === 'pending' || t.status === 'in_progress').length,
        totalToday:     dTasks.length,
      };
    }));

    setSuggestions((suggestionsRes.data ?? []) as SuggestedTask[]);
    setLoading(false);
  }, [location]);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    fetchAll();
  }, [fetchAll]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('users').delete().eq('id', id);
    if (error) { toast.error('Failed to delete driver'); return; }
    toast.success('Driver removed');
    setDrivers(prev => prev.filter(d => d.id !== id));
    setDeleteId(null);
  };

  const handleSaved = (saved: DriverRecord) => {
    setDrivers(prev => {
      const idx = prev.findIndex(d => d.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], ...saved };
        return next;
      }
      return [{ ...saved, tasksToday: 0 }, ...prev];
    });
  };

  function handleSavePrefs() {
    saveDriverPreferences(location, prefs);
    setPrefsSaved(true);
    setTimeout(() => setPrefsSaved(false), 2000);
  }

  function toggleScheduleOpt(key: keyof Omit<ScheduleOptions, 'rememberSelections'>) {
    setScheduleOpts(prev => {
      const next = { ...prev, [key]: !prev[key] };
      if (next.rememberSelections) localStorage.setItem(LS_SCHEDULE_KEY, JSON.stringify(next));
      return next;
    });
  }

  // ── PDF generation ────────────────────────────────────────────────────────

  async function handleGenerateSchedule() {
    setScheduleLoading(true);
    try {
      const [tasksRes, driversRes] = await Promise.all([
        supabase.from('driver_tasks')
          .select('id,driver_id,driver_name,task_type,status,scheduled_time,guest_name,pickup_location,dropoff_location,flight_number,passenger_count,notes')
          .eq('location', location)
          .eq('scheduled_date', scheduleDate)
          .neq('status', 'cancelled')
          .neq('status', 'suggested')
          .order('scheduled_time'),
        supabase.from('users')
          .select('id,name,vehicle_type,vehicle_model,vehicle_registration')
          .eq('role', 'driver')
          .eq('location', location),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tasks    = (tasksRes.data ?? []) as any[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const driverArr = (driversRes.data ?? []) as any[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const driverMap: Record<string, any> = {};
      for (const d of driverArr) driverMap[d.id] = d;

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const opts = scheduleOpts;

      // ── Header ──
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.setTextColor(45, 90, 69);
      doc.text('JALSA SALANA UK 2026', 105, 18, { align: 'center' });
      doc.setFontSize(11);
      doc.text('DAILY TRANSPORT SCHEDULE', 105, 25, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(74, 74, 74);
      const dateLabel = new Date(scheduleDate + 'T00:00:00').toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      });
      doc.text(dateLabel, 105, 31, { align: 'center' });
      doc.text(`Location: ${location}`, 105, 36, { align: 'center' });

      // ── Group tasks ──
      const arrivals   = tasks.filter(t => t.task_type === 'airport_pickup');
      const departures = tasks.filter(t => t.task_type === 'airport_dropoff');
      const mulaqat    = tasks.filter(t => t.task_type === 'mulaqat_transport');
      const other      = tasks.filter(t => t.task_type === 'other');

      let y = 44;
      const pageH = 280;
      const lineH = 4.5;

      function checkPage() {
        if (y > pageH - 20) { doc.addPage(); y = 16; }
      }

      function drawSectionHeader(title: string) {
        checkPage();
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(45, 90, 69);
        doc.text(`── ${title} ──────────────────────────────────────────`, 14, y);
        doc.setLineWidth(0.2);
        doc.setDrawColor(45, 90, 69);
        y += 1;
        doc.line(14, y, 196, y);
        y += 4;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function drawTask(t: any) {
        checkPage();
        const driver = driverMap[t.driver_id];
        const time = t.scheduled_time ?? '??:??';

        // Time + driver line
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(26, 26, 26);
        let driverLabel = time;
        if (opts.driverVehicle && driver) {
          const veh = [driver.vehicle_type, driver.vehicle_model].filter(Boolean).join(' ');
          const reg = driver.vehicle_registration ? ` ${driver.vehicle_registration}` : '';
          driverLabel += `  ${driver.name}${veh ? ` (${veh}${reg})` : ''}`;
        } else {
          driverLabel += `  ${t.driver_name ?? '—'}`;
        }
        doc.text(driverLabel, 14, y);
        y += lineH;

        // Guest name
        if (opts.guestNames && t.guest_name) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(26, 26, 26);
          doc.text(`         → ${t.guest_name}`, 14, y);
          y += lineH;
        }

        // Route
        if (opts.taskTimesRoutes && (t.pickup_location || t.dropoff_location)) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(74, 74, 74);
          doc.text(`         ${t.pickup_location ?? ''} → ${t.dropoff_location ?? ''}`, 14, y);
          y += lineH;
        }

        // Flight details
        if (opts.flightDetails && t.flight_number) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(74, 74, 74);
          const pax = t.passenger_count ? ` · ${t.passenger_count} passenger${t.passenger_count !== 1 ? 's' : ''}` : '';
          doc.text(`         Flight: ${t.flight_number}${pax}`, 14, y);
          y += lineH;
        }

        y += 2; // gap between tasks
      }

      // Draw sections
      if (arrivals.length > 0) {
        drawSectionHeader('ARRIVALS');
        for (const t of arrivals) drawTask(t);
        y += 3;
      }
      if (departures.length > 0) {
        drawSectionHeader('DEPARTURES');
        for (const t of departures) drawTask(t);
        y += 3;
      }
      if (mulaqat.length > 0) {
        drawSectionHeader('MULAQAT TRANSPORT');
        for (const t of mulaqat) drawTask(t);
        y += 3;
      }
      if (other.length > 0) {
        drawSectionHeader('OTHER');
        for (const t of other) drawTask(t);
        y += 3;
      }

      // ── Summary section ──
      checkPage();
      drawSectionHeader('SUMMARY');
      const totalTasks      = tasks.length;
      const totalPassengers = tasks.reduce((sum: number, t: { passenger_count?: number }) => sum + (t.passenger_count ?? 1), 0);
      const activeDriverIds = new Set(tasks.map((t: { driver_id: string }) => t.driver_id).filter(Boolean));

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(26, 26, 26);
      const summaryLines = [
        `Total Tasks: ${totalTasks}`,
        `Arrivals: ${arrivals.length}  |  Departures: ${departures.length}  |  Mulaqat: ${mulaqat.length}  |  Other: ${other.length}`,
        `Total Passengers: ${totalPassengers}`,
        `Drivers Active: ${activeDriverIds.size} of ${driverArr.length}`,
      ];
      for (const line of summaryLines) {
        checkPage();
        doc.text(line, 14, y);
        y += 5;
      }

      // ── Footer on all pages ──
      const pageCount = doc.getNumberOfPages();
      const genTime = new Date().toLocaleString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });
      for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(160, 160, 160);
        doc.text(`Generated: ${genTime}`, 14, 289);
        doc.text(`${user?.name ?? ''} — ${location}`, 14, 293);
        doc.text(`Page ${p} of ${pageCount}`, 196, 293, { align: 'right' });
      }

      doc.save(`transport_schedule_${scheduleDate}.pdf`);
      toast.success('Transport schedule generated');
      setScheduleOpen(false);

      // Suppress unused import warning
      void autoTable;
    } catch {
      toast.error('Failed to generate schedule');
    } finally {
      setScheduleLoading(false);
    }
  }

  // ── Derived stats ─────────────────────────────────────────────────────────

  const TYPE_LABELS: Record<string, string> = {
    airport_pickup: 'Airport Pickup', airport_dropoff: 'Airport Drop-off',
    mulaqat_transport: 'Mulaqat Transport', other: 'Other',
  };

  const total     = drivers.length;
  const available = drivers.filter(d => d.is_available).length;
  const onDuty    = drivers.filter(d => d.tasksToday > 0).length;

  const driverInfos: DriverInfo[] = drivers.map(d => ({
    id: d.id, name: d.name, vehicle_type: d.vehicle_type, vehicle_model: d.vehicle_model,
    vehicle_capacity: d.vehicle_capacity, is_available: d.is_available, location: d.location,
  }));

  const SCHEDULE_CHECKBOXES: { key: keyof Omit<ScheduleOptions, 'rememberSelections'>; label: string }[] = [
    { key: 'driverVehicle',    label: 'Driver name and vehicle' },
    { key: 'taskTimesRoutes',  label: 'Task times and routes' },
    { key: 'guestNames',       label: 'Guest names' },
    { key: 'contactNumbers',   label: 'Guest contact numbers' },
    { key: 'flightDetails',    label: 'Flight details' },
    { key: 'passengerPhotos',  label: 'Passenger photos' },
  ];

  return (
    <div className="flex min-h-screen bg-[#F5F0E8]">
      <LocationSidebar />
      <main className="ml-64 flex-1 p-8">

        {/* ── Compact Driver Status Widget ─────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Car className="w-4 h-4 text-[#2D5A45]" />
            <span className="text-sm font-semibold text-[#1A1A1A]">Live Driver Status — {location}</span>
          </div>
          {loading ? (
            <p className="text-xs text-gray-400">Loading…</p>
          ) : driverStatusRows.length === 0 ? (
            <p className="text-xs text-gray-400">No drivers at this location yet.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {driverStatusRows.map(d => {
                const isOnTask = !!d.activeTask;
                const isOff    = !d.is_available;
                const dotCls   = isOnTask ? 'bg-blue-500' : isOff ? 'bg-amber-400' : 'bg-green-500';
                const labelCls = isOnTask ? 'text-blue-600' : isOff ? 'text-amber-600' : 'text-green-600';
                const statusLabel = isOnTask ? 'On Trip' : isOff ? 'Off Duty' : 'Available';
                const subText = isOnTask && d.activeTask
                  ? `→ ${[d.activeTask.pickup_location, d.activeTask.dropoff_location].filter(Boolean).join(' → ')}${d.activeTask.guest_name ? ` (${d.activeTask.guest_name})` : ''}`
                  : isOff ? 'Back on duty soon'
                  : `Today: ${d.totalToday} tasks (${d.completedToday} done, ${d.pendingToday} pending)`;

                return (
                  <div key={d.id} className={`py-2 rounded ${isOnTask ? 'bg-blue-50/40 px-2' : 'px-1'}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${dotCls}`} />
                      <span className="text-xs font-medium text-[#1A1A1A]">{d.name}</span>
                      {d.vehicle_type && <span className="text-xs text-gray-400">{d.vehicle_type}{d.vehicle_model ? ` ${d.vehicle_model}` : ''}</span>}
                      {d.vehicle_registration && <span className="text-xs font-mono text-gray-400">{d.vehicle_registration}</span>}
                      <span className={`ml-auto text-xs ${labelCls}`}>{statusLabel}</span>
                    </div>
                    <p className="text-xs text-gray-400 ml-4 mt-0.5 truncate">{subText}</p>
                  </div>
                );
              })}
            </div>
          )}
          {unassignedPickups > 0 && (
            <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
              ⚠️ {unassignedPickups} task{unassignedPickups !== 1 ? 's' : ''} have no driver assigned
            </div>
          )}
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#1A1A1A]">Drivers</h1>
            <p className="text-sm text-[#4A4A4A] mt-0.5">{location} · manage transport team</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setScheduleOpen(true)}
              className="bg-white text-[#2D5A45] border-[#2D5A45] hover:bg-[#F5F0E8] gap-2"
            >
              <Printer className="w-4 h-4" /> Print Schedule
            </Button>
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

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { icon: Users, label: 'Total Drivers', value: total, color: 'bg-blue-50 text-blue-700' },
            { icon: CheckCircle2, label: 'Available', value: available, color: 'bg-green-50 text-green-700' },
            { icon: Car, label: 'On Duty Today', value: onDuty, color: 'bg-amber-50 text-amber-700' },
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

        {/* Drivers table */}
        <div className="bg-white rounded-xl border border-[#E8E3DB] mb-6">
          <div className="p-4 border-b border-[#E8E3DB]">
            <h2 className="font-semibold text-[#1A1A1A]">Driver Roster</h2>
          </div>
          {loading ? (
            <div className="p-8 text-center text-[#4A4A4A] text-sm">Loading…</div>
          ) : drivers.length === 0 ? (
            <div className="p-8 text-center text-[#4A4A4A] text-sm">No drivers at this location yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E8E3DB] bg-[#F5F0E8]">
                    <th className="px-4 py-3 text-left font-medium text-[#4A4A4A]">Name</th>
                    <th className="px-4 py-3 text-left font-medium text-[#4A4A4A]">Vehicle</th>
                    <th className="px-4 py-3 text-left font-medium text-[#4A4A4A]">Capacity</th>
                    <th className="px-4 py-3 text-left font-medium text-[#4A4A4A]">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-[#4A4A4A]">Today's Tasks</th>
                    <th className="px-4 py-3 text-left font-medium text-[#4A4A4A]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E3DB]">
                  {drivers.map(d => (
                    <tr key={d.id} className="hover:bg-[#F5F0E8]/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#1A1A1A]">{d.name}</div>
                        <div className="text-xs text-[#4A4A4A]">
                          {d.is_head_driver && <span className="mr-1 text-amber-600 font-medium">★ Head</span>}
                          {d.email}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#4A4A4A]">
                        {d.vehicle_type ? `${d.vehicle_type}${d.vehicle_model ? ` · ${d.vehicle_model}` : ''}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-[#4A4A4A]">
                        {d.vehicle_capacity != null ? `${d.vehicle_capacity} pax` : '—'}
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
                          <button onClick={() => { setEditDriver(d); setFormOpen(true); }} title="Edit"
                            className="p-1.5 rounded-lg text-[#4A4A4A] hover:bg-[#F5F0E8] hover:text-[#2D5A45] transition-colors">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => setMsgDriver(d)} title="Messages"
                            className="p-1.5 rounded-lg text-[#4A4A4A] hover:bg-[#F5F0E8] hover:text-[#2D5A45] transition-colors">
                            <MessageCircle className="w-4 h-4" />
                          </button>
                          <button onClick={() => { setAssignDriver(d); }} title="Assign Task"
                            className="p-1.5 rounded-lg text-[#4A4A4A] hover:bg-[#F5F0E8] hover:text-[#2D5A45] transition-colors">
                            <Plus className="w-4 h-4" />
                          </button>
                          <button onClick={() => setMaintViewDriver(d)} title="Maintenance Log"
                            className="p-1.5 rounded-lg text-[#4A4A4A] hover:bg-[#F5F0E8] hover:text-[#2D5A45] transition-colors">
                            <Wrench className="w-4 h-4" />
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

        {/* Auto-generated suggestions */}
        {suggestions.length > 0 && (
          <div className="bg-white rounded-xl border border-[#E8E3DB]">
            <div className="p-4 border-b border-[#E8E3DB] flex items-center gap-2">
              <span className="w-2 h-2 bg-blue-500 rounded-full" />
              <h2 className="font-semibold text-[#1A1A1A]">Unassigned Suggestions</h2>
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{suggestions.length}</span>
            </div>
            <div className="divide-y divide-[#E8E3DB]">
              {suggestions.map(s => (
                <div key={s.id} className="px-4 py-3 flex items-center justify-between gap-4">
                  <div>
                    <span className="text-sm font-medium text-[#1A1A1A]">{TYPE_LABELS[s.task_type] ?? s.task_type}</span>
                    {s.guest_name && <span className="text-xs text-[#4A4A4A] ml-2">· {s.guest_name}</span>}
                    <div className="text-xs text-[#4A4A4A] mt-0.5">
                      {s.scheduled_date}{s.scheduled_time && ` at ${s.scheduled_time}`}
                      {s.pickup_location && ` · ${s.pickup_location} → ${s.dropoff_location ?? ''}`}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => setAssignDriver(null)}
                    className="bg-[#2D5A45] hover:bg-[#234839] text-white text-xs shrink-0">
                    Assign
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* ── ⚙️ Driver Assignment Preferences ─────────────────────────── */}
        <div className="bg-white rounded-xl border border-[#E8E3DB] mt-6">
          <button
            onClick={() => setPrefsOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#F5F0E8]/50 transition-colors rounded-xl"
          >
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-[#2D5A45]" />
              <span className="font-semibold text-[#1A1A1A] text-sm">Driver Assignment Preferences</span>
            </div>
            {prefsOpen ? <ChevronUp className="w-4 h-4 text-[#4A4A4A]" /> : <ChevronDown className="w-4 h-4 text-[#4A4A4A]" />}
          </button>

          {prefsOpen && (
            <div className="border-t border-[#E8E3DB] px-5 py-4 space-y-5">
              {/* VIP Guest Rule */}
              <div>
                <p className="text-sm font-medium text-[#1A1A1A] mb-1">VIP Guest Rule</p>
                <p className="text-xs text-[#4A4A4A] mb-2">
                  Guests with designation "National Amir", "Nazir", or "Khalifa" → always suggest:
                </p>
                <select
                  value={prefs.vipDriver ?? ''}
                  onChange={e => setPrefs(p => ({ ...p, vipDriver: e.target.value || undefined }))}
                  className="border border-[#D4CFC7] rounded-lg px-3 py-2 text-sm text-[#1A1A1A] bg-white focus:outline-none focus:border-[#2D5A45] w-full max-w-xs"
                >
                  <option value="">No preferred driver</option>
                  {drivers.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name}{d.vehicle_type ? ` (${d.vehicle_type})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Language Matching */}
              <div>
                <p className="text-sm font-medium text-[#1A1A1A] mb-1">Language Matching</p>
                <p className="text-xs text-[#4A4A4A] mb-2">
                  Assign preferred drivers to guests based on their country's language.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {SUPPORTED_LANGUAGES.map(lang => (
                    <div key={lang} className="flex items-center gap-2">
                      <span className="text-xs text-[#4A4A4A] w-20 shrink-0">{lang}:</span>
                      <select
                        value={prefs.languageDrivers[lang] ?? ''}
                        onChange={e => setPrefs(p => ({
                          ...p,
                          languageDrivers: {
                            ...p.languageDrivers,
                            [lang]: e.target.value || undefined as unknown as string,
                          },
                        }))}
                        className="flex-1 border border-[#D4CFC7] rounded-md px-2 py-1 text-xs text-[#1A1A1A] bg-white focus:outline-none focus:border-[#2D5A45]"
                      >
                        <option value="">No preference</option>
                        {drivers.map(d => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Vehicle Size Rules — informational */}
              <div>
                <p className="text-sm font-medium text-[#1A1A1A] mb-1">Vehicle Size Rules</p>
                <div className="space-y-1 text-xs text-[#4A4A4A] bg-gray-50 rounded-lg p-3 border border-gray-100">
                  <p>• Family groups (3+ guests) → prefer Van or larger (capacity ≥ 6)</p>
                  <p>• Single guest → prefer available Car (smallest available vehicle)</p>
                  <p className="text-gray-400 italic mt-1">These rules apply automatically during task auto-generation.</p>
                </div>
              </div>

              <div className="flex items-center justify-end pt-2">
                <button
                  onClick={handleSavePrefs}
                  className="px-4 py-2 bg-[#2D5A45] hover:bg-[#234839] text-white text-sm rounded-lg font-medium transition-colors"
                >
                  {prefsSaved ? '✓ Saved' : 'Save Preferences'}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── Dialogs ───────────────────────────────────────────────────────────── */}

      <DriverFormDialog
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditDriver(null); }}
        driver={editDriver}
        defaultLocation={location}
        defaultDepartment={user?.department ?? ''}
        onSaved={handleSaved}
      />

      {viewDriver && (
        <DriverTaskViewDialog
          open={!!viewDriver}
          onClose={() => setViewDriver(null)}
          driverId={viewDriver.id}
          driverName={viewDriver.name}
          locationName={user?.location}
          preloadedDrivers={driverInfos.filter(d => d.id !== viewDriver.id)}
        />
      )}

      {assignDriver && (
        <CreateTaskDialog
          open={!!assignDriver}
          onClose={() => setAssignDriver(null)}
          drivers={driverInfos}
          preselectedDriverId={assignDriver.id}
          locationName={location}
          departmentName={user?.department}
          onCreated={() => fetchAll()}
        />
      )}

      <DailyReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        defaultLocation={location}
        generatedBy={user?.name ?? 'Location Manager'}
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

      {/* ── Print Schedule Dialog ─────────────────────────────────────────── */}
      <Dialog open={scheduleOpen} onOpenChange={o => { if (!o) setScheduleOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#1A1A1A]">
              <Printer className="w-4 h-4 text-[#2D5A45]" /> Daily Transport Schedule
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            {/* Date */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-[#4A4A4A]">Date</label>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-400 shrink-0" />
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={e => setScheduleDate(e.target.value)}
                  className="flex-1 border border-[#D4CFC7] rounded-lg px-3 py-2 text-sm text-[#1A1A1A] bg-white focus:outline-none focus:border-[#2D5A45]"
                />
              </div>
            </div>

            {/* Location */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-[#4A4A4A]">Location</label>
              <input
                type="text"
                value={location}
                readOnly
                className="w-full border border-[#D4CFC7] rounded-lg px-3 py-2 text-sm text-gray-400 bg-gray-50 cursor-not-allowed"
              />
            </div>

            {/* Include options */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-[#4A4A4A]">Include</label>
              <div className="space-y-1.5">
                {SCHEDULE_CHECKBOXES.map(cb => (
                  <label key={cb.key} className="flex items-center gap-2.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={scheduleOpts[cb.key]}
                      onChange={() => toggleScheduleOpt(cb.key)}
                      className="w-4 h-4 rounded border-gray-300 accent-[#2D5A45]"
                    />
                    <span className="text-sm text-[#1A1A1A] group-hover:text-[#2D5A45] transition-colors">
                      {cb.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Remember selections */}
            <label className="flex items-center gap-2.5 cursor-pointer pt-1 border-t border-gray-100">
              <input
                type="checkbox"
                checked={scheduleOpts.rememberSelections}
                onChange={() => setScheduleOpts(prev => {
                  const next = { ...prev, rememberSelections: !prev.rememberSelections };
                  if (next.rememberSelections) localStorage.setItem(LS_SCHEDULE_KEY, JSON.stringify(next));
                  else localStorage.removeItem(LS_SCHEDULE_KEY);
                  return next;
                })}
                className="w-4 h-4 rounded border-gray-300 accent-[#2D5A45]"
              />
              <span className="text-sm text-[#4A4A4A]">Remember selections</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)} className="border-[#D4CFC7] text-[#4A4A4A] h-9 text-sm">Cancel</Button>
            <Button
              disabled={scheduleLoading}
              onClick={handleGenerateSchedule}
              className="bg-[#2D5A45] hover:bg-[#234839] text-white h-9 text-sm gap-2"
            >
              <Printer className="w-4 h-4" />
              {scheduleLoading ? 'Generating…' : 'Generate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
