/**
 * Daily Driver Report — generates a printable PDF for a given date/location.
 * Used by: DriverAllTasksPage, LocationDriversPage, DeptDriversPage, AdminDriversPage.
 */
import { useEffect, useState } from 'react';
import { FileText, Loader2, Calendar } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/lib/supabase';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

// ── types ─────────────────────────────────────────────────────────────────────

interface ReportTask {
  id: string;
  driver_id?: string;
  driver_name?: string;
  task_type: string;
  status: string;
  scheduled_time?: string;
  guest_name?: string;
  delegation_name?: string;
  pickup_location?: string;
  dropoff_location?: string;
  flight_number?: string;
  passenger_count?: number;
  start_mileage?: number;
  end_mileage?: number;
  notes?: string;
  driver_task_passengers?: { guest_name: string; guest_phone?: string }[];
}

interface ReportDriver {
  id: string;
  name: string;
  phone?: string;
  vehicle_type?: string;
  vehicle_model?: string;
  vehicle_registration?: string;
  vehicle_capacity?: number;
  is_available?: boolean;
  location?: string;
}

interface DailyReportDialogProps {
  open: boolean;
  onClose: () => void;
  /** Pre-selected location (can be overridden by user) */
  defaultLocation?: string;
  /** Name shown in report footer */
  generatedBy?: string;
  /** When set, filter drivers/tasks by transport_department_id instead of location */
  transportDepartmentId?: string;
}

// ── checkbox preferences (localStorage) ──────────────────────────────────────

const PREFS_KEY = 'driverReport_prefs';

interface ReportPrefs {
  driverDetails: boolean;
  taskList: boolean;
  passengerDetails: boolean;
  taskStatus: boolean;
  guestContacts: boolean;
  flightDetails: boolean;
  mileageData: boolean;
}

const DEFAULT_PREFS: ReportPrefs = {
  driverDetails:    true,
  taskList:         true,
  passengerDetails: true,
  taskStatus:       true,
  guestContacts:    false,
  flightDetails:    false,
  mileageData:      false,
};

function loadPrefs(): ReportPrefs {
  try {
    const saved = localStorage.getItem(PREFS_KEY);
    return saved ? { ...DEFAULT_PREFS, ...JSON.parse(saved) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(p: ReportPrefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

// ── type labels ───────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  airport_pickup:    'Airport Pickup',
  airport_dropoff:   'Airport Drop-off',
  mulaqat_transport: 'Mulaqat Transport',
  other:             'Other',
};

const STATUS_LABELS: Record<string, string> = {
  pending:     'Pending',
  in_progress: 'In Progress',
  completed:   'Completed',
  cancelled:   'Cancelled',
  suggested:   'Suggested',
};

// ── PDF generation ────────────────────────────────────────────────────────────

interface MaintSummaryEntry {
  driver_id: string;
  driver_name: string;
  type: string;
  next_due_date?: string;
}

function generatePDF(
  selectedDate: string,
  locationName: string,
  drivers: ReportDriver[],
  tasks: ReportTask[],
  prefs: ReportPrefs,
  generatedBy: string,
  maintAlerts?: MaintSummaryEntry[],
) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;

  const dateFmt = new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  // Color palette (RGB)
  const GREEN  = [45, 90, 69]  as [number, number, number];
  const CREAM  = [245, 240, 232] as [number, number, number];
  const DARK   = [26, 26, 26]   as [number, number, number];
  const MID    = [74, 74, 74]   as [number, number, number];

  // Group tasks by driver
  const tasksByDriver: Record<string, ReportTask[]> = {};
  for (const t of tasks) {
    if (!t.driver_id) continue;
    if (!tasksByDriver[t.driver_id]) tasksByDriver[t.driver_id] = [];
    tasksByDriver[t.driver_id].push(t);
  }

  let pageNum = 1;

  function addHeader(title: string) {
    // Green banner
    doc.setFillColor(...GREEN);
    doc.rect(0, 0, pageW, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text('JALSA SALANA UK 2026', pageW / 2, 10, { align: 'center' });
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(title, pageW / 2, 18, { align: 'center' });
    doc.setFontSize(9);
    doc.text(`${dateFmt}  ·  ${locationName || 'All Locations'}`, pageW / 2, 25, { align: 'center' });
    doc.setTextColor(...DARK);
  }

  function addFooter() {
    const now = new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    doc.setFontSize(7);
    doc.setTextColor(...MID);
    doc.text(`Generated: ${now}  ·  By: ${generatedBy}`, margin, pageH - 5);
    doc.text(`Page ${pageNum}`, pageW - margin, pageH - 5, { align: 'right' });
  }

  // ── Page per driver ─────────────────────────────────────────────────────────
  drivers.forEach((driver, dIdx) => {
    if (dIdx > 0) { doc.addPage(); pageNum++; }

    addHeader('DAILY DRIVER REPORT');

    let y = 33;

    // Driver info box
    if (prefs.driverDetails) {
      doc.setFillColor(...CREAM);
      doc.roundedRect(margin, y, pageW - margin * 2, 24, 2, 2, 'F');
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...GREEN);
      doc.text(driver.name, margin + 4, y + 7);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...MID);
      const vehicleStr = [
        driver.vehicle_model,
        driver.vehicle_registration ? `· ${driver.vehicle_registration}` : '',
        driver.vehicle_type ? `(${driver.vehicle_type})` : '',
      ].filter(Boolean).join(' ');
      if (vehicleStr) doc.text(`Vehicle: ${vehicleStr}`, margin + 4, y + 13);
      const line2 = [
        driver.vehicle_capacity != null ? `Capacity: ${driver.vehicle_capacity} pax` : '',
        driver.phone ? `Phone: ${driver.phone}` : '',
        driver.is_available != null ? (driver.is_available ? 'Available' : 'Off Duty') : '',
      ].filter(Boolean).join('   ');
      if (line2) doc.text(line2, margin + 4, y + 19);
      y += 28;
    }

    // Tasks for this driver
    const driverTasks = tasksByDriver[driver.id] ?? [];

    if (prefs.taskList) {
      if (driverTasks.length === 0) {
        doc.setFontSize(9);
        doc.setTextColor(...MID);
        doc.text('No tasks scheduled for this driver.', margin, y + 6);
        y += 12;
      } else {
        const headers = ['#', 'Time', 'Type', 'Guest / Delegation', 'Route'];
        if (prefs.flightDetails) headers.push('Flight');
        if (prefs.taskStatus)    headers.push('Status');
        headers.push('Pax');
        if (prefs.mileageData)   { headers.push('Start km'); headers.push('End km'); headers.push('Dist km'); }

        const rows = driverTasks.map((t, i) => {
          const guestLabel = t.guest_name ?? t.delegation_name ?? '—';
          const route = t.pickup_location && t.dropoff_location
            ? `${t.pickup_location} → ${t.dropoff_location}`
            : (t.pickup_location ?? t.dropoff_location ?? '—');
          const row = [
            String(i + 1),
            t.scheduled_time ?? '—',
            TYPE_LABELS[t.task_type] ?? t.task_type,
            guestLabel,
            route,
          ];
          if (prefs.flightDetails) row.push(t.flight_number ?? '—');
          if (prefs.taskStatus)    row.push(STATUS_LABELS[t.status] ?? t.status);
          row.push(String(t.passenger_count ?? 1));
          if (prefs.mileageData) {
            const dist = t.start_mileage != null && t.end_mileage != null && t.end_mileage > t.start_mileage
              ? String(t.end_mileage - t.start_mileage)
              : '—';
            row.push(t.start_mileage != null ? String(t.start_mileage) : '—');
            row.push(t.end_mileage   != null ? String(t.end_mileage)   : '—');
            row.push(dist);
          }
          return row;
        });

        autoTable(doc, {
          head: [headers],
          body: rows,
          startY: y,
          margin: { left: margin, right: margin },
          styles: { fontSize: 8, cellPadding: 2 },
          headStyles: { fillColor: GREEN, textColor: [255, 255, 255], fontStyle: 'bold' },
          alternateRowStyles: { fillColor: CREAM },
          columnStyles: {
            0: { cellWidth: 8 },
            1: { cellWidth: 14 },
            2: { cellWidth: 28 },
          },
        });

        y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
      }
    }

    // Passenger details
    if (prefs.passengerDetails) {
      const tasksWithPax = driverTasks.filter(t =>
        t.driver_task_passengers && t.driver_task_passengers.length > 0
      );
      if (tasksWithPax.length > 0) {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...DARK);
        doc.text('Passenger Details', margin, y + 5);
        y += 8;

        for (const t of tasksWithPax) {
          const paxHeaders = ['Passenger', ...(prefs.guestContacts ? ['Phone'] : [])];
          const paxRows = (t.driver_task_passengers ?? []).map(p => {
            const row = [p.guest_name];
            if (prefs.guestContacts) row.push(p.guest_phone ?? '—');
            return row;
          });
          const taskLabel = `${TYPE_LABELS[t.task_type] ?? t.task_type}${t.scheduled_time ? ' @ ' + t.scheduled_time : ''}`;
          doc.setFontSize(8);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...MID);
          doc.text(taskLabel, margin, y);
          y += 2;
          autoTable(doc, {
            head: [paxHeaders],
            body: paxRows,
            startY: y,
            margin: { left: margin + 4, right: margin },
            styles: { fontSize: 7.5, cellPadding: 1.5 },
            headStyles: { fillColor: [200, 220, 210], textColor: DARK },
          });
          y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 3;
        }
      }
    }

    // Driver summary
    const completed  = driverTasks.filter(t => t.status === 'completed').length;
    const pending    = driverTasks.filter(t => t.status === 'pending' || t.status === 'in_progress').length;
    const cancelled  = driverTasks.filter(t => t.status === 'cancelled').length;
    const totalPax   = driverTasks.reduce((s, t) => s + (t.passenger_count ?? 1), 0);
    const totalDist  = prefs.mileageData
      ? driverTasks.reduce((s, t) => {
          const d = t.start_mileage != null && t.end_mileage != null && t.end_mileage > t.start_mileage
            ? t.end_mileage - t.start_mileage : 0;
          return s + d;
        }, 0)
      : 0;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MID);
    let summaryLine = `Tasks: ${driverTasks.length}   Completed: ${completed}   Pending: ${pending}   Cancelled: ${cancelled}   Total Passengers: ${totalPax}`;
    if (prefs.mileageData && totalDist > 0) summaryLine += `   Total Distance: ${totalDist} km`;
    doc.text(summaryLine, margin, y + 4);

    addFooter();
  });

  // ── Summary page ────────────────────────────────────────────────────────────
  doc.addPage(); pageNum++;
  addHeader('DAILY SUMMARY');

  let sy = 33;
  const allCompleted = tasks.filter(t => t.status === 'completed').length;
  const allPending   = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress').length;
  const allCancelled = tasks.filter(t => t.status === 'cancelled').length;
  const allPax       = tasks.reduce((s, t) => s + (t.passenger_count ?? 1), 0);

  doc.setFillColor(...CREAM);
  doc.roundedRect(margin, sy, pageW - margin * 2, 36, 2, 2, 'F');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK);
  const stats = [
    ['Total Drivers', String(drivers.length)],
    ['Total Tasks',   String(tasks.length)],
    ['Completed',     String(allCompleted)],
    ['Pending',       String(allPending)],
    ['Cancelled',     String(allCancelled)],
    ['Total Passengers', String(allPax)],
  ];
  stats.forEach(([label, val], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = margin + 4 + col * ((pageW - margin * 2) / 3);
    const y2 = sy + 8 + row * 14;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MID);
    doc.text(label, x, y2);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...GREEN);
    doc.setFontSize(13);
    doc.text(val, x, y2 + 6);
    doc.setFontSize(9);
  });

  sy += 42;

  // Driver performance table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.text('Driver Performance', margin, sy);
  sy += 4;

  const perfRows = drivers.map(d => {
    const dTasks    = tasksByDriver[d.id] ?? [];
    const dComp     = dTasks.filter(t => t.status === 'completed').length;
    const dPend     = dTasks.filter(t => t.status === 'pending' || t.status === 'in_progress').length;
    const dCanc     = dTasks.filter(t => t.status === 'cancelled').length;
    const dots = dTasks.map(t =>
      t.status === 'completed' ? '✅' : t.status === 'cancelled' ? '❌' : '⏳'
    ).join('');
    return [d.name, String(dTasks.length), String(dComp), String(dPend), String(dCanc), dots];
  });

  autoTable(doc, {
    head: [['Driver', 'Total', 'Done', 'Pending', 'Cancelled', 'Tasks']],
    body: perfRows,
    startY: sy,
    margin: { left: margin, right: margin },
    styles: { fontSize: 8.5 },
    headStyles: { fillColor: GREEN, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: CREAM },
  });

  let finalY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // Mileage totals on summary page
  if (prefs.mileageData) {
    const grandTotalDist = tasks.reduce((s, t) => {
      const d = t.start_mileage != null && t.end_mileage != null && t.end_mileage > t.start_mileage
        ? t.end_mileage - t.start_mileage : 0;
      return s + d;
    }, 0);
    if (grandTotalDist > 0) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...GREEN);
      doc.text(`Total Distance: ${grandTotalDist} km`, margin, finalY);
      finalY += 7;
    }
  }

  // Maintenance alerts on summary page
  if (maintAlerts && maintAlerts.length > 0) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...DARK);
    doc.text('Vehicles Needing Attention', margin, finalY);
    finalY += 4;
    for (const a of maintAlerts) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(180, 30, 30);
      doc.text(
        `• ${a.driver_name}: ${a.type.replace(/_/g, ' ')} overdue${a.next_due_date ? ` (due ${new Date(a.next_due_date + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })})` : ''}`,
        margin + 2, finalY,
      );
      finalY += 5;
    }
    finalY += 3;
  }

  const now2 = new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MID);
  doc.text(`Generated: ${now2}  ·  By: ${generatedBy}`, margin, finalY);

  addFooter();

  const fileDate = selectedDate.replace(/-/g, '');
  doc.save(`driver-report-${fileDate}.pdf`);
}

// ── main component ────────────────────────────────────────────────────────────

export function DailyReportDialog({ open, onClose, defaultLocation, generatedBy = 'Driver Management', transportDepartmentId }: DailyReportDialogProps) {
  const [selectedDate,     setSelectedDate]     = useState(new Date().toISOString().split('T')[0]);
  const [locationInput,    setLocationInput]    = useState(defaultLocation ?? '');
  const [prefs,            setPrefs]            = useState<ReportPrefs>(loadPrefs);
  const [rememberPrefs,    setRememberPrefs]    = useState(true);
  const [generating,       setGenerating]       = useState(false);

  // sync defaultLocation when dialog opens
  useEffect(() => {
    if (open) setLocationInput(defaultLocation ?? '');
  }, [open, defaultLocation]);

  const togglePref = (key: keyof ReportPrefs) => {
    setPrefs(p => ({ ...p, [key]: !p[key] }));
  };

  const handleGenerate = async () => {
    if (rememberPrefs) savePrefs(prefs);
    setGenerating(true);
    try {
      const [tasksRes, driversRes, maintRes] = await Promise.all([
        supabase
          .from('driver_tasks')
          .select('*, driver_task_passengers(guest_name,guest_phone)')
          .eq('scheduled_date', selectedDate)
          .not('status', 'eq', 'suggested')
          .order('scheduled_time'),
        supabase
          .from('users')
          .select('id,name,phone,vehicle_type,vehicle_model,vehicle_registration,vehicle_capacity,is_available,location,transport_department_id')
          .eq('role', 'driver')
          .order('name'),
        supabase
          .from('vehicle_maintenance')
          .select('driver_id,type,next_due_date')
          .not('next_due_date', 'is', null)
          .lte('next_due_date', selectedDate),
      ]);

      let tasks   = (tasksRes.data   ?? []) as ReportTask[];
      let drivers = (driversRes.data ?? []) as ReportDriver[];

      if (transportDepartmentId) {
        // Transport department mode: filter by transport_department_id
        tasks   = tasks.filter(t => (t as ReportTask & { transport_department_id?: string }).transport_department_id === transportDepartmentId);
        drivers = drivers.filter(d => (d as ReportDriver & { transport_department_id?: string }).transport_department_id === transportDepartmentId);
      } else if (locationInput.trim()) {
        // Location mode: filter by location column
        tasks   = tasks.filter(t => (t as ReportTask & { location?: string }).location === locationInput.trim()
          || drivers.find(d => d.id === t.driver_id)?.location === locationInput.trim());
        drivers = drivers.filter(d => d.location === locationInput.trim());
      }

      // only include drivers who have tasks or are in scope
      const driverIdsWithTasks = new Set(tasks.map(t => t.driver_id).filter(Boolean));
      if (transportDepartmentId || locationInput.trim()) {
        // keep all in-scope drivers even with no tasks
      } else {
        drivers = drivers.filter(d => driverIdsWithTasks.has(d.id));
      }

      if (drivers.length === 0 && tasks.length === 0) {
        alert('No data found for this date/location.');
        return;
      }

      // Maintenance alerts — overdue entries for drivers in scope
      const driverIdSet = new Set(drivers.map(d => d.id));
      const rawMaint = (maintRes.data ?? []) as { driver_id: string; type: string; next_due_date?: string }[];
      const maintAlerts: MaintSummaryEntry[] = rawMaint
        .filter(m => driverIdSet.has(m.driver_id))
        .map(m => ({
          driver_id:   m.driver_id,
          driver_name: drivers.find(d => d.id === m.driver_id)?.name ?? m.driver_id,
          type:        m.type,
          next_due_date: m.next_due_date,
        }));

      generatePDF(selectedDate, locationInput.trim(), drivers, tasks, prefs, generatedBy, maintAlerts);
      onClose();
    } catch (e) {
      console.error(e);
      alert('Failed to generate report. Check console for details.');
    } finally {
      setGenerating(false);
    }
  };

  const CHECKBOX_ITEMS: { key: keyof ReportPrefs; label: string }[] = [
    { key: 'driverDetails',    label: 'Driver details (name, vehicle, phone)' },
    { key: 'taskList',         label: 'Task list with times and routes' },
    { key: 'passengerDetails', label: 'Passenger details' },
    { key: 'taskStatus',       label: 'Task status (completed/pending/cancelled)' },
    { key: 'guestContacts',    label: 'Guest contact numbers' },
    { key: 'flightDetails',    label: 'Flight details' },
    { key: 'mileageData',      label: 'Mileage data (start km, end km, distance)' },
  ];

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#2D5A45]" />
            Daily Driver Report
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Date */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Date</Label>
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="w-full border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45]"
            />
          </div>

          {/* Location */}
          <div className="space-y-1.5">
            <Label>Location <span className="text-[#4A4A4A] font-normal">(leave blank for all)</span></Label>
            <input
              type="text"
              value={locationInput}
              onChange={e => setLocationInput(e.target.value)}
              placeholder="e.g. Jamia"
              className="w-full border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45]"
            />
          </div>

          {/* Include checkboxes */}
          <div className="space-y-2">
            <Label>Include</Label>
            <div className="space-y-1.5">
              {CHECKBOX_ITEMS.map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer text-sm text-[#1A1A1A]">
                  <input
                    type="checkbox"
                    checked={prefs[key]}
                    onChange={() => togglePref(key)}
                    className="w-4 h-4 rounded border-[#E8E3DB] text-[#2D5A45] accent-[#2D5A45]"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* Remember preferences */}
          <label className="flex items-center gap-2 cursor-pointer text-sm text-[#4A4A4A] border-t border-[#E8E3DB] pt-3">
            <input
              type="checkbox"
              checked={rememberPrefs}
              onChange={e => setRememberPrefs(e.target.checked)}
              className="w-4 h-4 rounded accent-[#2D5A45]"
            />
            Remember my selections
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={generating}>Cancel</Button>
          <Button
            onClick={handleGenerate}
            disabled={generating || !selectedDate}
            className="bg-[#2D5A45] hover:bg-[#234839] text-white"
          >
            {generating
              ? <><Loader2 className="w-4 h-4 animate-spin mr-1.5" />Generating…</>
              : <><FileText className="w-4 h-4 mr-1.5" />Generate Report</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
