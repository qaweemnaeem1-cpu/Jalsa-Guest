/**
 * /admin/drivers — all drivers across the system (Super Admin view).
 * Sub-tabs: Drivers | Tasks | Suggestions
 */
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  Plus, Eye, Pencil, Trash2, Car, Users, CheckCircle2, ClipboardList, FileText,
  MessageCircle, Wrench, ChevronDown, ChevronUp, ArrowLeftRight, BarChart3, MapPin, ExternalLink,
} from 'lucide-react';
import { calculateETA, formatETA, isETAOverdue, getMapLink } from '@/lib/driverMatchUtils';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { SUPER_ADMIN_NAV } from '@/lib/navItems';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DriverFormDialog, type DriverRecord } from '@/components/DriverFormDialog';
import { DriverTaskViewDialog } from '@/components/DriverTaskViewDialog';
import { CreateTaskDialog, type DriverInfo } from '@/components/CreateTaskDialog';
import { DailyReportDialog } from '@/components/DailyReportDialog';
import { DriverMessagesDialog } from '@/components/DriverMessagesDialog';
import { AddMaintenanceDialog, ViewMaintenanceLogDialog } from '@/components/VehicleMaintenanceDialog';
import { ROLE_LABELS } from '@/lib/constants';
import { TopBar } from '@/components/TopBar';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DriverRow extends DriverRecord {
  tasksToday: number;
}

interface TaskRow {
  id: string;
  driver_id: string;
  driver_name?: string;
  task_type: string;
  status: string;
  is_suggestion: boolean;
  scheduled_date: string;
  scheduled_time?: string;
  started_at?: string | null;
  guest_name?: string;
  pickup_location?: string;
  dropoff_location?: string;
  passenger_count?: number;
  location?: string;
  department?: string;
  notes?: string;
}

interface WeeklyReportPrefs {
  driverList: boolean;
  taskSummary: boolean;
  completionRates: boolean;
  mileageData: boolean;
  costData: boolean;
  passengerCounts: boolean;
  vehicleStatus: boolean;
}

type Tab = 'drivers' | 'tasks' | 'suggestions';

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  airport_pickup: 'Airport Pickup', airport_dropoff: 'Airport Drop-off',
  mulaqat_transport: 'Mulaqat Transport', other: 'Other',
};

const STATUS_COLORS: Record<string, string> = {
  suggested: 'bg-blue-100 text-blue-700',
  pending: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-emerald-100 text-emerald-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

const DEFAULT_WEEKLY_PREFS: WeeklyReportPrefs = {
  driverList: true, taskSummary: true, completionRates: true,
  mileageData: false, costData: false, passengerCounts: false, vehicleStatus: true,
};

function loadWeeklyPrefs(): WeeklyReportPrefs {
  try {
    const raw = localStorage.getItem('fleet_weekly_report_columns');
    if (raw) return { ...DEFAULT_WEEKLY_PREFS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_WEEKLY_PREFS };
}

function getWeekRange() {
  const today = new Date();
  const day = today.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(today);
  mon.setDate(today.getDate() + diffToMon);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return {
    from: mon.toISOString().substring(0, 10),
    to: sun.toISOString().substring(0, 10),
  };
}

// ── AlertCard helper ──────────────────────────────────────────────────────────

function AlertCard({ type, icon, title, sub, onClick }: {
  type: 'amber' | 'orange' | 'red' | 'blue';
  icon: string; title: string; sub?: string; onClick?: () => void;
}) {
  const colors = {
    amber:  'bg-amber-50 border-amber-200 text-amber-800',
    orange: 'bg-orange-50 border-orange-200 text-orange-800',
    red:    'bg-red-50 border-red-200 text-red-800',
    blue:   'bg-blue-50 border-blue-200 text-blue-800',
  };
  return (
    <div onClick={onClick} className={`flex-1 min-w-[220px] border rounded-xl p-3 ${colors[type]} ${onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}>
      <div className="flex items-center gap-2 font-medium text-sm">{icon} {title}</div>
      {sub && <div className="text-xs mt-1 opacity-75">{sub}</div>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminDriversPage() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const { pathname } = useLocation();

  // core state
  const [tab, setTab]           = useState<Tab>('drivers');
  const [drivers, setDrivers]   = useState<DriverRow[]>([]);
  const [tasks, setTasks]       = useState<TaskRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [overdueMaintCount, setOverdueMaintCount] = useState(0);
  const [fleetOpen, setFleetOpen] = useState(true);

  // filters
  const [deptFilter, setDeptFilter]   = useState('');
  const [locFilter, setLocFilter]     = useState('');
  const [statFilter, setStatFilter]   = useState('');
  const [taskStatus, setTaskStatus]   = useState('');

  // existing dialogs
  const [formOpen, setFormOpen]         = useState(false);
  const [reportOpen, setReportOpen]     = useState(false);
  const [editDriver, setEditDriver]     = useState<DriverRecord | null>(null);
  const [viewDriver, setViewDriver]     = useState<DriverRecord | null>(null);
  const [assignDriver, setAssignDriver] = useState<DriverRecord | null>(null);
  const [msgDriver, setMsgDriver]       = useState<DriverRecord | null>(null);
  const [deleteId, setDeleteId]         = useState<string | null>(null);
  const [maintViewDriver, setMaintViewDriver] = useState<DriverRecord | null>(null);
  const [maintAddDriver, setMaintAddDriver]   = useState<DriverRecord | null>(null);

  // transfer dialog
  const [transferTask, setTransferTask]         = useState<TaskRow | null>(null);
  const [transferDept, setTransferDept]         = useState('');
  const [transferLoc, setTransferLoc]           = useState('');
  const [transferDriverId, setTransferDriverId] = useState('');
  const [transferReason, setTransferReason]     = useState('');
  const [transferring, setTransferring]         = useState(false);

  // weekly report
  const [weeklyReportOpen, setWeeklyReportOpen]           = useState(false);
  const [weeklyReportPrefs, setWeeklyReportPrefs]         = useState<WeeklyReportPrefs>(loadWeeklyPrefs);
  const [weeklyReportFrom, setWeeklyReportFrom]           = useState(() => getWeekRange().from);
  const [weeklyReportTo, setWeeklyReportTo]               = useState(() => getWeekRange().to);
  const [weeklyReportGenerating, setWeeklyReportGenerating] = useState(false);

  const loadedRef = useRef(false);

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    const today = new Date().toISOString().substring(0, 10);
    const [driversRes, tasksRes, maintRes] = await Promise.all([
      supabase.from('users')
        .select('id,name,email,phone,location,department,vehicle_type,vehicle_model,vehicle_registration,vehicle_capacity,is_head_driver,is_available')
        .eq('role', 'driver'),
      supabase.from('driver_tasks')
        .select('id,driver_id,driver_name,task_type,status,is_suggestion,scheduled_date,scheduled_time,started_at,guest_name,pickup_location,dropoff_location,passenger_count,location,department,notes')
        .gte('scheduled_date', today)
        .order('scheduled_date', { ascending: true })
        .order('scheduled_time', { ascending: true })
        .limit(300),
      supabase.from('vehicle_maintenance')
        .select('id', { count: 'exact', head: true })
        .lt('next_due_date', today)
        .not('next_due_date', 'is', null),
    ]);

    const countMap: Record<string, number> = {};
    for (const t of (tasksRes.data ?? []) as TaskRow[]) {
      if (t.scheduled_date === today && t.status !== 'cancelled' && t.status !== 'suggested') {
        countMap[t.driver_id] = (countMap[t.driver_id] ?? 0) + 1;
      }
    }
    setDrivers((driversRes.data ?? []).map(d => ({ ...d, tasksToday: countMap[d.id] ?? 0 })) as DriverRow[]);
    setTasks((tasksRes.data ?? []) as TaskRow[]);
    setOverdueMaintCount(maintRes.count ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    localStorage.setItem('fleet_weekly_report_columns', JSON.stringify(weeklyReportPrefs));
  }, [weeklyReportPrefs]);

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
        const next = [...prev]; next[idx] = { ...next[idx], ...saved }; return next;
      }
      return [{ ...saved, tasksToday: 0 }, ...prev];
    });
  };

  const handleTransfer = async () => {
    if (!transferTask || !transferDriverId) { toast.error('Select a driver'); return; }
    setTransferring(true);
    const target = drivers.find(d => d.id === transferDriverId);
    if (!target) { setTransferring(false); return; }
    const oldLoc = transferTask.location ?? transferTask.department ?? 'original location';
    const noteAddition = `Transferred from ${oldLoc}${transferReason ? ': ' + transferReason : ''}`;
    const newNotes = [transferTask.notes, noteAddition].filter(Boolean).join('\n');
    const { error } = await supabase.from('driver_tasks').update({
      driver_id: transferDriverId,
      driver_name: target.name,
      location: target.location,
      department: target.department,
      notes: newNotes,
    }).eq('id', transferTask.id);
    setTransferring(false);
    if (error) { toast.error('Transfer failed'); return; }
    toast.success(`Task transferred to ${target.name}${target.location ? ' at ' + target.location : ''}`);
    setTransferTask(null); setTransferDept(''); setTransferLoc(''); setTransferDriverId(''); setTransferReason('');
    loadedRef.current = false; fetchAll();
  };

  const handleGenerateWeeklyReport = async () => {
    setWeeklyReportGenerating(true);
    try {
      const [driversRes, tasksRes] = await Promise.all([
        supabase.from('users')
          .select('id,name,email,phone,location,department,vehicle_type,vehicle_model,vehicle_registration,vehicle_capacity,is_available')
          .eq('role', 'driver'),
        supabase.from('driver_tasks')
          .select('id,driver_id,driver_name,task_type,status,scheduled_date,passenger_count,location,department')
          .gte('scheduled_date', weeklyReportFrom)
          .lte('scheduled_date', weeklyReportTo)
          .neq('status', 'cancelled')
          .neq('status', 'suggested'),
      ]);

      const allDrivers = (driversRes.data ?? []) as DriverRow[];
      const allTasks   = (tasksRes.data ?? []) as TaskRow[];

      const doc = new jsPDF('landscape');
      const pageW = 297, pageH = 210, center = pageW / 2, margin = 14;
      const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

      const fmtD = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

      // Page 1: Fleet Summary
      doc.setFontSize(18); doc.setFont('helvetica', 'bold');
      doc.text('JALSA SALANA UK 2026', center, 14, { align: 'center' });
      doc.setFontSize(12); doc.text('WEEKLY FLEET REPORT', center, 21, { align: 'center' });
      doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      doc.text(`Week: ${fmtD(weeklyReportFrom)} — ${fmtD(weeklyReportTo)}`, center, 27, { align: 'center' });
      doc.setLineWidth(0.4); doc.line(margin, 30, pageW - margin, 30);

      const totalTasks = allTasks.length;
      const completedTasks = allTasks.filter(t => t.status === 'completed').length;
      const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      autoTable(doc, {
        startY: 35,
        head: [['Metric', 'Value']],
        body: [
          ['Total Drivers', String(allDrivers.length)],
          ['Available Now', String(allDrivers.filter(d => d.is_available).length)],
          ['Total Tasks (week)', String(totalTasks)],
          ['Completed', `${completedTasks} (${completionRate}%)`],
          ['Pending / In Progress', String(totalTasks - completedTasks)],
        ],
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [45, 90, 69] as [number, number, number], textColor: 255 },
        theme: 'grid',
        margin: { left: margin, right: pageW / 2 + 10 },
      });

      // Department breakdown (right side same page)
      const deptMap: Record<string, { drivers: number; tasks: number; completed: number }> = {};
      for (const d of allDrivers) {
        const dept = d.department ?? 'Unknown';
        if (!deptMap[dept]) deptMap[dept] = { drivers: 0, tasks: 0, completed: 0 };
        deptMap[dept].drivers++;
      }
      for (const t of allTasks) {
        const dept = t.department ?? 'Unknown';
        if (!deptMap[dept]) deptMap[dept] = { drivers: 0, tasks: 0, completed: 0 };
        deptMap[dept].tasks++;
        if (t.status === 'completed') deptMap[dept].completed++;
      }

      autoTable(doc, {
        startY: 35,
        head: [['Department', 'Drivers', 'Tasks', 'Done', 'Rate']],
        body: Object.entries(deptMap).map(([dept, d]) => [
          dept, String(d.drivers), String(d.tasks), String(d.completed),
          d.tasks > 0 ? `${Math.round((d.completed / d.tasks) * 100)}%` : '—',
        ]),
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [45, 90, 69] as [number, number, number], textColor: 255 },
        theme: 'grid',
        margin: { left: pageW / 2 + 10, right: margin },
      });

      // Page 2+: Per department driver breakdown
      if (weeklyReportPrefs.taskSummary || weeklyReportPrefs.driverList) {
        const tasksByDriver: Record<string, TaskRow[]> = {};
        for (const t of allTasks) {
          if (!tasksByDriver[t.driver_id]) tasksByDriver[t.driver_id] = [];
          tasksByDriver[t.driver_id].push(t);
        }
        const driversByDept: Record<string, DriverRow[]> = {};
        for (const d of allDrivers) {
          const dept = d.department ?? 'Unknown';
          if (!driversByDept[dept]) driversByDept[dept] = [];
          driversByDept[dept].push(d);
        }
        for (const [dept, deptDrivers] of Object.entries(driversByDept)) {
          doc.addPage();
          doc.setFontSize(13); doc.setFont('helvetica', 'bold');
          doc.text(`Department: ${dept}`, margin, 14);
          doc.setLineWidth(0.3); doc.line(margin, 17, pageW - margin, 17);

          const colHeaders = ['Driver', 'Location', 'Vehicle'];
          if (weeklyReportPrefs.vehicleStatus) colHeaders.push('Status');
          colHeaders.push('Tasks');
          if (weeklyReportPrefs.completionRates) colHeaders.push('Done', 'Rate');
          if (weeklyReportPrefs.passengerCounts) colHeaders.push('Pax');

          const rows = deptDrivers.map(d => {
            const dTasks = tasksByDriver[d.id] ?? [];
            const done = dTasks.filter(t => t.status === 'completed').length;
            const pax = dTasks.reduce((s, t) => s + (t.passenger_count ?? 0), 0);
            const row: string[] = [
              d.name,
              d.location ?? '—',
              d.vehicle_type ? `${d.vehicle_type}${d.vehicle_model ? ' ' + d.vehicle_model : ''}` : '—',
            ];
            if (weeklyReportPrefs.vehicleStatus) row.push(d.is_available ? 'Available' : 'Off Duty');
            row.push(String(dTasks.length));
            if (weeklyReportPrefs.completionRates) {
              row.push(String(done));
              row.push(dTasks.length > 0 ? `${Math.round((done / dTasks.length) * 100)}%` : '—');
            }
            if (weeklyReportPrefs.passengerCounts) row.push(String(pax));
            return row;
          });

          autoTable(doc, {
            startY: 20,
            head: [colHeaders],
            body: rows,
            styles: { fontSize: 8, cellPadding: 2.5 },
            headStyles: { fillColor: [45, 90, 69] as [number, number, number], textColor: 255 },
            theme: 'grid',
            margin: { left: margin, right: margin },
          });
        }
      }

      // Summary / top performers page
      doc.addPage();
      doc.setFontSize(16); doc.setFont('helvetica', 'bold');
      doc.text('SUMMARY', center, 14, { align: 'center' });
      doc.setLineWidth(0.4); doc.line(margin, 17, pageW - margin, 17);

      const perfMap: Record<string, { name: string; done: number; total: number }> = {};
      for (const d of allDrivers) perfMap[d.id] = { name: d.name, done: 0, total: 0 };
      for (const t of allTasks) {
        if (perfMap[t.driver_id]) {
          perfMap[t.driver_id].total++;
          if (t.status === 'completed') perfMap[t.driver_id].done++;
        }
      }
      const topPerformers = Object.values(perfMap)
        .filter(d => d.total > 0)
        .sort((a, b) => (b.done / b.total) - (a.done / a.total))
        .slice(0, 5);

      autoTable(doc, {
        startY: 22,
        head: [['Top Performers (by Completion Rate)', 'Tasks Done', 'Total', 'Rate']],
        body: topPerformers.map(d => [d.name, String(d.done), String(d.total), `${Math.round((d.done / d.total) * 100)}%`]),
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [45, 90, 69] as [number, number, number], textColor: 255 },
        theme: 'grid',
        margin: { left: margin, right: pageW / 2 + 10 },
      });

      const overloaded = Object.values(perfMap).filter(d => d.total > 6);
      if (overloaded.length > 0) {
        autoTable(doc, {
          startY: lastY() + 8,
          head: [['Overloaded Drivers', 'Task Count', 'Recommendation']],
          body: overloaded.map(d => [d.name, String(d.total), 'Consider redistributing tasks']),
          styles: { fontSize: 9, cellPadding: 3 },
          headStyles: { fillColor: [200, 80, 40] as [number, number, number], textColor: 255 },
          theme: 'grid',
          margin: { left: margin, right: pageW / 2 + 10 },
        });
      }

      // Page footers
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 120, 120);
        doc.text(`Page ${i} of ${pageCount}`, center, pageH - 8, { align: 'center' });
        doc.text(`Generated: ${new Date().toLocaleString()}`, margin, pageH - 8);
        doc.text('Jalsa Guest — Weekly Fleet Report', pageW - margin, pageH - 8, { align: 'right' });
        if (user) doc.text(`By: ${user.name} (${ROLE_LABELS[user.role]})`, margin, pageH - 4);
        doc.setTextColor(0, 0, 0);
      }

      doc.save(`Fleet-Report-${weeklyReportFrom}.pdf`);
      toast.success('Weekly fleet report generated');
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate report');
    } finally {
      setWeeklyReportGenerating(false);
      setWeeklyReportOpen(false);
    }
  };

  // ── Derived values ─────────────────────────────────────────────────────────

  const today = new Date().toISOString().substring(0, 10);
  const todayTasks     = tasks.filter(t => t.scheduled_date === today && !t.is_suggestion && t.status !== 'cancelled');
  const completedToday = todayTasks.filter(t => t.status === 'completed');
  const completionRate = todayTasks.length > 0 ? Math.round((completedToday.length / todayTasks.length) * 100) : 0;
  const vehicleCount   = drivers.filter(d => d.vehicle_type).length;

  const depts = useMemo(() => [...new Set(drivers.map(d => d.department).filter(Boolean))] as string[], [drivers]);
  const locs  = useMemo(() => [...new Set(drivers.map(d => d.location).filter(Boolean))] as string[], [drivers]);

  const filteredDrivers = useMemo(() => drivers.filter(d => {
    if (deptFilter && d.department !== deptFilter) return false;
    if (locFilter  && d.location   !== locFilter)  return false;
    if (statFilter === 'available' && !d.is_available) return false;
    if (statFilter === 'off_duty'  &&  d.is_available) return false;
    return true;
  }), [drivers, deptFilter, locFilter, statFilter]);

  const activeTasks     = tasks.filter(t => !t.is_suggestion && t.status !== 'cancelled');
  const suggestionTasks = tasks.filter(t =>  t.is_suggestion && t.status === 'suggested');
  const filteredTasks   = taskStatus ? activeTasks.filter(t => t.status === taskStatus) : activeTasks;

  const driverInfos: DriverInfo[] = filteredDrivers.map(d => ({
    id: d.id, name: d.name, vehicle_type: d.vehicle_type, vehicle_model: d.vehicle_model,
    vehicle_capacity: d.vehicle_capacity, is_available: d.is_available, location: d.location,
  }));

  // Fleet overview
  const activeTaskMap = useMemo(() => {
    const map: Record<string, { task_type: string; guest_name?: string; started_at?: string | null; pickup_location?: string; dropoff_location?: string }> = {};
    for (const t of tasks) {
      if (t.status === 'in_progress') map[t.driver_id] = {
        task_type: t.task_type, guest_name: t.guest_name,
        started_at: t.started_at, pickup_location: t.pickup_location, dropoff_location: t.dropoff_location,
      };
    }
    return map;
  }, [tasks]);

  const fleetByDept = useMemo(() => {
    const map: Record<string, Record<string, DriverRow[]>> = {};
    for (const d of drivers) {
      const dept = d.department ?? '(No Department)';
      const loc  = d.location  ?? '(No Location)';
      if (!map[dept]) map[dept] = {};
      if (!map[dept][loc]) map[dept][loc] = [];
      map[dept][loc].push(d);
    }
    return map;
  }, [drivers]);

  // Alerts
  const alertOverloaded = useMemo(() => drivers.filter(d => d.tasksToday > 6), [drivers]);
  const hasAlerts = suggestionTasks.length > 0 || alertOverloaded.length > 0 || overdueMaintCount > 0;

  // Transfer derived
  const transferLocOptions = useMemo(() =>
    [...new Set(drivers.filter(d => !transferDept || d.department === transferDept).map(d => d.location).filter(Boolean))] as string[],
    [drivers, transferDept]
  );
  const transferDriverOptions = useMemo(() =>
    drivers.filter(d =>
      (!transferDept || d.department === transferDept) &&
      (!transferLoc  || d.location   === transferLoc) &&
      d.id !== transferTask?.driver_id
    ),
    [drivers, transferDept, transferLoc, transferTask]
  );

  // Stats totals (all drivers)
  const onDutyCount  = drivers.filter(d => d.tasksToday > 0).length;
  const offDutyCount = drivers.filter(d => !d.is_available).length;

  const deptColor = (dept: string) => {
    if (/reserve/i.test(dept))    return 'bg-blue-50 text-blue-700';
    if (/uk\s*jamaat/i.test(dept)) return 'bg-purple-50 text-purple-700';
    return 'bg-teal-50 text-teal-700';
  };

  const activityLabel = (driverId: string, isAvail?: boolean): { text: string; dot: string } => {
    const active = activeTaskMap[driverId];
    if (active) {
      const prefix: Record<string, string> = {
        airport_pickup: 'Picking up', airport_dropoff: 'Dropping off',
        mulaqat_transport: 'Mulaqat run', other: 'On task',
      };
      return {
        text: active.guest_name ? `${prefix[active.task_type] ?? 'On task'}: ${active.guest_name}` : (prefix[active.task_type] ?? 'On task'),
        dot: 'bg-blue-500',
      };
    }
    if (isAvail) return { text: 'Available', dot: 'bg-green-500' };
    return { text: 'Off Duty', dot: 'bg-amber-400' };
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-[#E8E3DB] min-h-screen fixed left-0 top-0">
          <div className="p-4 border-b border-[#E8E3DB]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#2D5A45] rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">J</span>
              </div>
              <div>
                <span className="font-semibold text-[#1A1A1A]">Jalsa Guest</span>
                <p className="text-xs text-[#4A4A4A]">Jalsa Salana UK</p>
              </div>
            </div>
          </div>
          <nav className="p-4 space-y-1">
            <div className="text-xs font-medium text-[#4A4A4A] uppercase tracking-wider mb-2">Main</div>
            {SUPER_ADMIN_NAV.map((item, i) => (
              <button key={i} onClick={() => navigate(item.href)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  pathname === item.href ? 'bg-[#2D5A45] text-white' : 'text-[#4A4A4A] hover:bg-[#F5F0E8]'
                }`}>
                <item.icon className="w-5 h-5" />
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="flex-1 ml-64">
          <TopBar title="Drivers" />
          <div className="p-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-[#1A1A1A]">Drivers</h1>
              <p className="text-sm text-[#4A4A4A] mt-0.5">All transport drivers across all locations</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setWeeklyReportOpen(true)}
                className="text-[#2D5A45] border-[#2D5A45] hover:bg-[#F5F0E8] gap-2">
                <BarChart3 className="w-4 h-4" /> Weekly Report
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

          {/* Alerts Panel */}
          {!loading && (
            <div className="mb-6">
              {hasAlerts ? (
                <div className="flex gap-3 flex-wrap">
                  {suggestionTasks.length > 0 && (
                    <AlertCard type="amber" icon="⚠️"
                      title={`${suggestionTasks.length} task${suggestionTasks.length !== 1 ? 's' : ''} unassigned for today`}
                      sub="Click to view and assign"
                      onClick={() => setTab('suggestions')}
                    />
                  )}
                  {alertOverloaded.length > 0 && (
                    <AlertCard type="orange" icon="📋"
                      title={`${alertOverloaded.length} driver${alertOverloaded.length > 1 ? 's' : ''} overloaded today`}
                      sub={alertOverloaded.map(d => `${d.name}: ${d.tasksToday} tasks`).join(' · ')}
                    />
                  )}
                  {overdueMaintCount > 0 && (
                    <AlertCard type="red" icon="🔧"
                      title={`${overdueMaintCount} vehicle${overdueMaintCount !== 1 ? 's' : ''} with overdue maintenance`}
                      sub="Check maintenance logs for affected drivers"
                    />
                  )}
                </div>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2 text-green-700 text-sm">
                  <span>✅</span>
                  <span className="font-medium">All clear — no urgent driver issues</span>
                </div>
              )}
            </div>
          )}

          {/* Stats — 5 cards */}
          <div className="grid grid-cols-5 gap-4 mb-6">
            {[
              { icon: Users,        label: 'Total Drivers',   value: String(drivers.length), sub: null,                         color: 'bg-blue-50 text-blue-700'    },
              { icon: CheckCircle2, label: 'On Duty / Off',   value: String(onDutyCount),    sub: `Off duty: ${offDutyCount}`,  color: 'bg-green-50 text-green-700'  },
              { icon: Car,          label: 'Vehicles',         value: String(vehicleCount),   sub: `${drivers.length - vehicleCount} without`, color: 'bg-indigo-50 text-indigo-700' },
              { icon: ClipboardList,label: "Today's Tasks",   value: String(todayTasks.length), sub: null,                     color: 'bg-amber-50 text-amber-700'  },
              { icon: CheckCircle2, label: 'Completed',        value: `${completionRate}%`,   sub: `${completedToday.length} done`, color: 'bg-emerald-50 text-emerald-700' },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl p-4 border border-[#E8E3DB]">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${s.color}`}>
                  <s.icon className="w-4 h-4" />
                </div>
                <p className="text-2xl font-bold text-[#1A1A1A]">{s.value}</p>
                <p className="text-xs text-[#4A4A4A]">{s.label}</p>
                {s.sub && <p className="text-xs text-gray-400 mt-0.5">{s.sub}</p>}
              </div>
            ))}
          </div>

          {/* Fleet Overview */}
          <div className="bg-white rounded-xl border border-[#E8E3DB] mb-6">
            <div className="flex items-center justify-between p-4 cursor-pointer select-none"
              onClick={() => setFleetOpen(v => !v)}>
              <div className="flex items-center gap-2">
                <Car className="w-5 h-5 text-[#2D5A45]" />
                <h2 className="font-semibold text-[#1A1A1A]">Fleet Overview</h2>
                <span className="text-xs text-[#4A4A4A] bg-[#F5F0E8] px-2 py-0.5 rounded-full">
                  {drivers.length} drivers
                </span>
              </div>
              <button className="p-1 rounded-lg hover:bg-[#F5F0E8] text-[#4A4A4A] transition-colors">
                {fleetOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
            {fleetOpen && (
              <div className="border-t border-[#E8E3DB] p-4">
                {loading ? (
                  <p className="text-sm text-[#4A4A4A] text-center py-4">Loading…</p>
                ) : Object.keys(fleetByDept).length === 0 ? (
                  <p className="text-sm text-[#4A4A4A] text-center py-4">No drivers loaded.</p>
                ) : (
                  <div className="space-y-5">
                    {Object.entries(fleetByDept).map(([dept, locations]) => (
                      <div key={dept}>
                        <div className={`text-xs font-semibold uppercase tracking-wider px-2 py-1 rounded-md inline-block mb-2 ${deptColor(dept)}`}>
                          {dept}
                        </div>
                        <div className="pl-3 space-y-3">
                          {Object.entries(locations).map(([loc, locDrivers]) => (
                            <div key={loc}>
                              <div className="text-xs font-medium text-[#4A4A4A] mb-1.5">{loc}</div>
                              <div className="space-y-1.5">
                                {locDrivers.map(d => {
                                  const { text, dot } = activityLabel(d.id, d.is_available);
                                  const badgeCls = dot === 'bg-green-500'
                                    ? 'bg-green-50 text-green-700'
                                    : dot === 'bg-blue-500'
                                      ? 'bg-blue-50 text-blue-700'
                                      : 'bg-amber-50 text-amber-700';
                                  const activeTask = activeTaskMap[d.id];
                                  const eta = activeTask?.started_at
                                    ? calculateETA({ task_type: activeTask.task_type, pickup_location: activeTask.pickup_location, dropoff_location: activeTask.dropoff_location, started_at: activeTask.started_at })
                                    : null;
                                  const etaStr  = eta ? formatETA(eta) : null;
                                  const etaOver = eta ? isETAOverdue(eta) : false;
                                  // Map link for active tasks (pickup: airport is pickup_location; dropoff: airport is dropoff_location)
                                  const mapAirport = activeTask
                                    ? (activeTask.task_type === 'airport_pickup' ? activeTask.pickup_location : activeTask.dropoff_location)
                                    : undefined;
                                  const mapUrl = mapAirport ? getMapLink(mapAirport) : null;
                                  return (
                                    <div key={d.id} className="flex items-center gap-2 text-sm flex-wrap">
                                      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                                      <span className="font-medium text-[#1A1A1A] min-w-[120px]">{d.name}</span>
                                      <span className="text-[#4A4A4A] text-xs">{d.vehicle_model ?? d.vehicle_type ?? '—'}</span>
                                      {d.vehicle_registration && (
                                        <span className="text-[#4A4A4A] text-xs font-mono bg-gray-100 px-1.5 rounded">
                                          {d.vehicle_registration}
                                        </span>
                                      )}
                                      <span className={`text-xs px-2 py-0.5 rounded-full ${badgeCls}`}>{text}</span>
                                      {etaStr && (
                                        <span className={`text-xs font-medium ${etaOver ? 'text-red-600' : 'text-blue-600'}`}>
                                          {etaStr}
                                        </span>
                                      )}
                                      {mapUrl && (
                                        <a href={mapUrl} target="_blank" rel="noopener noreferrer"
                                          className="flex items-center gap-0.5 text-xs text-[#2D5A45] hover:underline">
                                          <MapPin className="w-3 h-3" />
                                          <ExternalLink className="w-2.5 h-2.5 opacity-50" />
                                        </a>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 mb-4">
            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
              className="border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45] bg-white">
              <option value="">All Departments</option>
              {depts.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={locFilter} onChange={e => setLocFilter(e.target.value)}
              className="border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45] bg-white">
              <option value="">All Locations</option>
              {locs.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <select value={statFilter} onChange={e => setStatFilter(e.target.value)}
              className="border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45] bg-white">
              <option value="">All Statuses</option>
              <option value="available">Available</option>
              <option value="off_duty">Off Duty</option>
            </select>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-4 bg-white border border-[#E8E3DB] rounded-xl p-1 w-fit">
            {([['drivers', 'Drivers', Users], ['tasks', 'Tasks', ClipboardList], ['suggestions', 'Suggestions', Car]] as [Tab, string, React.ElementType][]).map(([t, label, Icon]) => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-[#2D5A45] text-white' : 'text-[#4A4A4A] hover:bg-[#F5F0E8]'}`}>
                <Icon className="w-4 h-4" /> {label}
                {t === 'suggestions' && suggestionTasks.length > 0 && (
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center ${tab === 'suggestions' ? 'bg-white/30' : 'bg-blue-100 text-blue-700'}`}>
                    {suggestionTasks.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab: Drivers */}
          {tab === 'drivers' && (
            <div className="bg-white rounded-xl border border-[#E8E3DB]">
              {loading ? (
                <div className="p-8 text-center text-[#4A4A4A] text-sm">Loading…</div>
              ) : filteredDrivers.length === 0 ? (
                <div className="p-8 text-center text-[#4A4A4A] text-sm">No drivers found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#E8E3DB] bg-[#F5F0E8]">
                        <th className="px-4 py-3 text-left font-medium text-[#4A4A4A]">Name</th>
                        <th className="px-4 py-3 text-left font-medium text-[#4A4A4A]">Dept / Location</th>
                        <th className="px-4 py-3 text-left font-medium text-[#4A4A4A]">Vehicle</th>
                        <th className="px-4 py-3 text-left font-medium text-[#4A4A4A]">Status</th>
                        <th className="px-4 py-3 text-left font-medium text-[#4A4A4A]">Today</th>
                        <th className="px-4 py-3 text-left font-medium text-[#4A4A4A]">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8E3DB]">
                      {filteredDrivers.map(d => (
                        <tr key={d.id} className="hover:bg-[#F5F0E8]/50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-medium text-[#1A1A1A]">{d.name}</div>
                            <div className="text-xs text-[#4A4A4A]">
                              {d.is_head_driver && <span className="mr-1 text-amber-600 font-medium">★ Nazim</span>}
                              {d.email}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[#4A4A4A] text-xs">
                            <div>{d.department ?? '—'}</div>
                            <div>{d.location ?? '—'}</div>
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
                              <button onClick={() => { setEditDriver(d); setFormOpen(true); }} title="Edit"
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
                                <button onClick={() => setDeleteId(d.id)} title="Remove"
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
          )}

          {/* Tab: Tasks */}
          {tab === 'tasks' && (
            <div className="bg-white rounded-xl border border-[#E8E3DB]">
              <div className="p-4 border-b border-[#E8E3DB] flex items-center gap-3">
                <h2 className="font-semibold text-[#1A1A1A] flex-1">Active Tasks</h2>
                <select value={taskStatus} onChange={e => setTaskStatus(e.target.value)}
                  className="border border-[#E8E3DB] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#2D5A45] bg-white">
                  <option value="">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              {filteredTasks.length === 0 ? (
                <div className="p-8 text-center text-[#4A4A4A] text-sm">No tasks.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#E8E3DB] bg-[#F5F0E8]">
                        <th className="px-4 py-3 text-left font-medium text-[#4A4A4A]">Type</th>
                        <th className="px-4 py-3 text-left font-medium text-[#4A4A4A]">Driver</th>
                        <th className="px-4 py-3 text-left font-medium text-[#4A4A4A]">Guest</th>
                        <th className="px-4 py-3 text-left font-medium text-[#4A4A4A]">Date / Time</th>
                        <th className="px-4 py-3 text-left font-medium text-[#4A4A4A]">Route</th>
                        <th className="px-4 py-3 text-left font-medium text-[#4A4A4A]">Status</th>
                        <th className="px-4 py-3 text-left font-medium text-[#4A4A4A]">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8E3DB]">
                      {filteredTasks.map(t => (
                        <tr key={t.id} className="hover:bg-[#F5F0E8]/50">
                          <td className="px-4 py-3 font-medium text-[#1A1A1A]">{TYPE_LABELS[t.task_type] ?? t.task_type}</td>
                          <td className="px-4 py-3 text-[#4A4A4A]">
                            <div>{t.driver_name ?? '—'}</div>
                            {t.location && <div className="text-xs text-gray-400">{t.location}</div>}
                          </td>
                          <td className="px-4 py-3 text-[#4A4A4A]">{t.guest_name ?? '—'}</td>
                          <td className="px-4 py-3 text-[#4A4A4A]">{t.scheduled_date}{t.scheduled_time && ` · ${t.scheduled_time}`}</td>
                          <td className="px-4 py-3 text-[#4A4A4A] text-xs">{t.pickup_location} → {t.dropoff_location}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[t.status] ?? 'bg-gray-100 text-gray-600'}`}>
                              {t.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => { setTransferTask(t); setTransferDept(''); setTransferLoc(''); setTransferDriverId(''); setTransferReason(''); }}
                              title="Transfer to another driver"
                              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg text-[#2D5A45] border border-[#2D5A45] hover:bg-[#F5F0E8] transition-colors">
                              <ArrowLeftRight className="w-3 h-3" /> Transfer
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tab: Suggestions */}
          {tab === 'suggestions' && (
            <div className="bg-white rounded-xl border border-[#E8E3DB]">
              <div className="p-4 border-b border-[#E8E3DB]">
                <h2 className="font-semibold text-[#1A1A1A]">Auto-generated Suggestions</h2>
                <p className="text-xs text-[#4A4A4A] mt-0.5">Tasks auto-created from guest placement — awaiting driver assignment</p>
              </div>
              {suggestionTasks.length === 0 ? (
                <div className="p-8 text-center text-[#4A4A4A] text-sm">No unassigned suggestions.</div>
              ) : (
                <div className="divide-y divide-[#E8E3DB]">
                  {suggestionTasks.map(t => (
                    <div key={t.id} className="px-4 py-3 flex items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[#1A1A1A]">{TYPE_LABELS[t.task_type] ?? t.task_type}</span>
                          <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">suggestion</span>
                        </div>
                        {t.guest_name && <div className="text-xs text-[#4A4A4A] mt-0.5">Guest: {t.guest_name}</div>}
                        <div className="text-xs text-[#4A4A4A]">
                          {t.scheduled_date}{t.scheduled_time && ` at ${t.scheduled_time}`}
                          {t.location && ` · ${t.location}`}
                          {t.pickup_location && ` · ${t.pickup_location} → ${t.dropoff_location ?? ''}`}
                        </div>
                      </div>
                      <Button size="sm" onClick={() => setAssignDriver(null)}
                        className="bg-[#2D5A45] hover:bg-[#234839] text-white text-xs shrink-0">
                        Assign
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          </div>{/* /p-8 */}
        </main>
      </div>

      {/* ── Dialogs ── */}

      <DriverFormDialog
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditDriver(null); }}
        driver={editDriver}
        onSaved={handleSaved}
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
          preselectedDriverId={assignDriver?.id}
          locationName={assignDriver?.location ?? user?.location ?? ''}
          departmentName={assignDriver?.department ?? undefined}
          onCreated={() => { loadedRef.current = false; fetchAll(); }}
        />
      )}

      <DailyReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        generatedBy={user?.name ?? 'Super Admin'}
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

      {/* Transfer Dialog */}
      <Dialog open={!!transferTask} onOpenChange={o => { if (!o) setTransferTask(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowLeftRight className="w-5 h-5 text-[#2D5A45]" /> Transfer Task to Another Driver
            </DialogTitle>
          </DialogHeader>
          {transferTask && (
            <div className="space-y-4 py-1">
              <div className="bg-[#F5F0E8] rounded-lg p-3 text-sm">
                <p className="font-medium text-[#1A1A1A]">{TYPE_LABELS[transferTask.task_type] ?? transferTask.task_type}</p>
                {transferTask.guest_name && <p className="text-[#4A4A4A] text-xs mt-0.5">Guest: {transferTask.guest_name}</p>}
                <p className="text-[#4A4A4A] text-xs mt-0.5">
                  Currently: <span className="font-medium">{transferTask.driver_name ?? '(Unassigned)'}</span>
                  {(transferTask.location ?? transferTask.department) && ` · ${transferTask.location ?? transferTask.department}`}
                </p>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-[#4A4A4A] block mb-1">Department</label>
                  <select value={transferDept}
                    onChange={e => { setTransferDept(e.target.value); setTransferLoc(''); setTransferDriverId(''); }}
                    className="w-full border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45] bg-white">
                    <option value="">Any Department</option>
                    {depts.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-[#4A4A4A] block mb-1">Location</label>
                  <select value={transferLoc}
                    onChange={e => { setTransferLoc(e.target.value); setTransferDriverId(''); }}
                    className="w-full border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45] bg-white">
                    <option value="">Any Location</option>
                    {transferLocOptions.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-[#4A4A4A] block mb-1">Assign To</label>
                  <select value={transferDriverId} onChange={e => setTransferDriverId(e.target.value)}
                    className="w-full border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45] bg-white">
                    <option value="">Select driver…</option>
                    {transferDriverOptions.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.name}{d.vehicle_type ? ` · ${d.vehicle_type}` : ''}{d.vehicle_capacity != null ? ` · ${d.vehicle_capacity} pax` : ''}{d.location ? ` · ${d.location}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-[#4A4A4A] block mb-1">Reason (optional)</label>
                  <input
                    value={transferReason}
                    onChange={e => setTransferReason(e.target.value)}
                    placeholder="e.g. Original driver unavailable"
                    className="w-full border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45]"
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferTask(null)} className="border-[#D4CFC7] text-[#4A4A4A]">Cancel</Button>
            <Button onClick={handleTransfer} disabled={!transferDriverId || transferring}
              className="bg-[#2D5A45] hover:bg-[#234839] text-white">
              {transferring ? 'Transferring…' : 'Transfer Task'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Weekly Report Dialog */}
      <Dialog open={weeklyReportOpen} onOpenChange={o => { if (!o) setWeeklyReportOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-[#2D5A45]" /> Weekly Fleet Report
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-[#4A4A4A] block mb-1">From</label>
                <input type="date" value={weeklyReportFrom} onChange={e => setWeeklyReportFrom(e.target.value)}
                  className="w-full border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45]" />
              </div>
              <div>
                <label className="text-xs font-medium text-[#4A4A4A] block mb-1">To</label>
                <input type="date" value={weeklyReportTo} onChange={e => setWeeklyReportTo(e.target.value)}
                  className="w-full border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45]" />
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wide mb-2">Include</p>
              <div className="space-y-2">
                {([
                  ['driverList',       'Driver list with vehicle details'],
                  ['taskSummary',      'Task summary per driver'],
                  ['completionRates',  'Completion rates'],
                  ['mileageData',      'Mileage data'],
                  ['costData',         'Fuel / maintenance costs'],
                  ['passengerCounts',  'Passenger counts'],
                  ['vehicleStatus',    'Vehicle availability status'],
                ] as [keyof WeeklyReportPrefs, string][]).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={weeklyReportPrefs[key]}
                      onChange={e => setWeeklyReportPrefs(p => ({ ...p, [key]: e.target.checked }))}
                      className="w-3.5 h-3.5 rounded border-gray-300 accent-[#2D5A45]"
                    />
                    <span className="text-sm text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWeeklyReportOpen(false)} className="border-[#D4CFC7] text-[#4A4A4A]">Cancel</Button>
            <Button onClick={handleGenerateWeeklyReport} disabled={weeklyReportGenerating}
              className="bg-[#2D5A45] hover:bg-[#234839] text-white gap-2">
              <FileText className="w-4 h-4" />
              {weeklyReportGenerating ? 'Generating…' : 'Generate Report'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
