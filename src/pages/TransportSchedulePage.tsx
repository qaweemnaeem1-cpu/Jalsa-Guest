/**
 * /transport/schedule — Weekly availability calendar for Transport Department Head.
 * Shows a Mon–Sun grid with all drivers in this transport department × each day.
 * Filters by transport_department_id (not location).
 * Click a cell to set schedule. Row checkboxes enable bulk-set for entire week.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { TransportSidebar } from '@/components/TransportSidebar';
import { supabase } from '@/lib/supabase';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { TopBar } from '@/components/TopBar';

// ── types ─────────────────────────────────────────────────────────────────────

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

interface DriverRow {
  id: string;
  name: string;
  vehicle_type?: string;
  transport_department_id?: string;
}

interface EditTarget {
  driverId: string;
  driverName: string;
  dates: string[];
}

// ── constants ─────────────────────────────────────────────────────────────────

const STATUS_META: Record<ScheduleStatus, { label: string; emoji: string; bg: string; border: string; text: string }> = {
  on_duty:  { label: 'On Duty',  emoji: '🟢', bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700' },
  off_duty: { label: 'Off Duty', emoji: '🟡', bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700' },
  leave:    { label: 'Leave',    emoji: '🔴', bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-700'   },
  half_day: { label: 'Half Day', emoji: '🔵', bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700'  },
};

const STATUS_OPTIONS: ScheduleStatus[] = ['on_duty', 'off_duty', 'leave', 'half_day'];

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ── week helpers ──────────────────────────────────────────────────────────────

function weekStartOf(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

function weekDays(weekStart: string): string[] {
  const days: string[] = [];
  const base = new Date(weekStart + 'T12:00:00');
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
}

function addWeeks(weekStart: string, delta: number): string {
  const d = new Date(weekStart + 'T12:00:00');
  d.setDate(d.getDate() + delta * 7);
  return d.toISOString().split('T')[0];
}

function fmtDayHeader(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
}

function fmtWeekRange(weekStart: string): string {
  const days = weekDays(weekStart);
  const s = new Date(days[0] + 'T12:00:00');
  const e = new Date(days[6] + 'T12:00:00');
  const sStr = s.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const eStr = e.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${sStr} — ${eStr}`;
}

// ── schedule edit dialog ──────────────────────────────────────────────────────

function ScheduleEditDialog({
  target, existing, onClose, onSaved, userId,
}: {
  target: EditTarget | null;
  existing: ScheduleEntry | null;
  onClose: () => void;
  onSaved: (entries: ScheduleEntry[]) => void;
  userId: string;
}) {
  const [status, setStatus]     = useState<ScheduleStatus>('on_duty');
  const [shiftStart, setStart]  = useState('09:00');
  const [shiftEnd, setEnd]      = useState('18:00');
  const [notes, setNotes]       = useState('');
  const [saving, setSaving]     = useState(false);

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

      const { error } = await supabase
        .from('driver_schedules')
        .upsert(records, { onConflict: 'driver_id,date' });

      if (error) throw error;

      const saved: ScheduleEntry[] = records.map(r => ({
        driver_id:   r.driver_id,
        date:        r.date,
        status:      r.status as ScheduleStatus,
        shift_start: r.shift_start ?? undefined,
        shift_end:   r.shift_end ?? undefined,
        notes:       r.notes ?? undefined,
      }));

      toast.success(
        target.dates.length === 1
          ? `Schedule updated for ${target.driverName}`
          : `Schedule set for ${target.dates.length} days — ${target.driverName}`
      );
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
              {new Date(target.dates[0] + 'T12:00:00').toLocaleDateString('en-GB', {
                weekday: 'long', day: 'numeric', month: 'long',
              })}
            </p>
          )}
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Status</Label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value as ScheduleStatus)}
              className="w-full border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45] bg-white"
            >
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{STATUS_META[s].emoji} {STATUS_META[s].label}</option>
              ))}
            </select>
          </div>

          {(status === 'on_duty' || status === 'half_day') && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Shift Start</Label>
                <input
                  type="time"
                  value={shiftStart}
                  onChange={e => setStart(e.target.value)}
                  className="w-full border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45]"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Shift End</Label>
                <input
                  type="time"
                  value={shiftEnd}
                  onChange={e => setEnd(e.target.value)}
                  className="w-full border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45]"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Morning airport runs"
              rows={2}
              className="w-full border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45] resize-none bg-white"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#2D5A45] hover:bg-[#234839] text-white"
          >
            {saving ? <><Loader2 className="w-4 h-4 animate-spin mr-1.5" />Saving…</> : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function TransportSchedulePage() {
  const { user } = useAuth();
  const tdId = user?.transportDepartmentId ?? '';
  const tdName = user?.transportDepartmentName ?? '';

  const today     = new Date().toISOString().split('T')[0];
  const [weekStart, setWeekStart] = useState<string>(() => weekStartOf(new Date()));
  const days = weekDays(weekStart);

  const [drivers, setDrivers]     = useState<DriverRow[]>([]);
  const [schedules, setSchedules] = useState<Record<string, ScheduleEntry>>({});
  const [taskCounts, setTaskCounts] = useState<Record<string, number>>({});
  const [loading, setLoading]     = useState(true);

  const [selectedDrivers, setSelectedDrivers] = useState<Set<string>>(new Set());

  const [editTarget, setEditTarget]   = useState<EditTarget | null>(null);
  const [editExisting, setEditExisting] = useState<ScheduleEntry | null>(null);

  const loadedRef = useRef(false);

  // ── data fetch ────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!tdId) return;
    setLoading(true);
    try {
      const weekEnd = days[6];

      const [driversRes, schedulesRes, tasksRes] = await Promise.all([
        supabase
          .from('users')
          .select('id,name,vehicle_type,transport_department_id')
          .eq('role', 'driver')
          .eq('transport_department_id', tdId)
          .order('name'),
        supabase
          .from('driver_schedules')
          .select('*')
          .gte('date', weekStart)
          .lte('date', weekEnd),
        supabase
          .from('driver_tasks')
          .select('driver_id,scheduled_date')
          .eq('transport_department_id', tdId)
          .gte('scheduled_date', weekStart)
          .lte('scheduled_date', weekEnd)
          .neq('status', 'cancelled'),
      ]);

      setDrivers((driversRes.data ?? []) as DriverRow[]);

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
    } catch {
      // table may not exist yet
    } finally {
      setLoading(false);
    }
  }, [tdId, weekStart]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!loadedRef.current) loadedRef.current = true;
  }, []);

  // ── navigation ────────────────────────────────────────────────────────────────
  const goThisWeek = () => { setWeekStart(weekStartOf(new Date())); setSelectedDrivers(new Set()); };
  const goPrevWeek = () => { setWeekStart(w => addWeeks(w, -1)); setSelectedDrivers(new Set()); };
  const goNextWeek = () => { setWeekStart(w => addWeeks(w, 1)); setSelectedDrivers(new Set()); };

  // ── cell click ────────────────────────────────────────────────────────────────
  const handleCellClick = (driver: DriverRow, date: string) => {
    const key = `${driver.id}|${date}`;
    setEditTarget({ driverId: driver.id, driverName: driver.name, dates: [date] });
    setEditExisting(schedules[key] ?? null);
  };

  // ── bulk set ──────────────────────────────────────────────────────────────────
  const handleBulkSet = () => {
    if (selectedDrivers.size === 0) return;
    const firstDriverId = [...selectedDrivers][0];
    const firstName = drivers.find(d => d.id === firstDriverId)?.name ?? '';
    const label = selectedDrivers.size === 1 ? firstName : `${selectedDrivers.size} drivers`;
    setEditTarget({
      driverId:   [...selectedDrivers].join(','),
      driverName: label,
      dates:      days,
    });
    setEditExisting(null);
  };

  // ── save handler ──────────────────────────────────────────────────────────────
  const handleSaved = useCallback((entries: ScheduleEntry[]) => {
    if (selectedDrivers.size > 1 && editTarget) {
      const selectedArr = [...selectedDrivers];
      const driverEntries: ScheduleEntry[] = [];
      for (const dId of selectedArr) {
        for (const e of entries) {
          driverEntries.push({ ...e, driver_id: dId });
        }
      }
      supabase.from('driver_schedules').upsert(
        driverEntries.map(e => ({
          driver_id:   e.driver_id,
          date:        e.date,
          status:      e.status,
          shift_start: e.shift_start ?? null,
          shift_end:   e.shift_end ?? null,
          notes:       e.notes ?? null,
          set_by:      user?.id,
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
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── render ────────────────────────────────────────────────────────────────────
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
              <CalendarDays className="w-6 h-6 text-[#2D5A45]" />
              Driver Schedule
              {tdName && <span className="text-base font-normal text-[#4A4A4A]">— {tdName}</span>}
            </h1>
            <p className="text-sm text-[#4A4A4A] mt-0.5">{fmtWeekRange(weekStart)}</p>
          </div>

          <div className="flex items-center gap-2">
            {selectedDrivers.size > 0 && (
              <button
                onClick={handleBulkSet}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors"
              >
                <AlertCircle className="w-4 h-4" />
                Set Schedule ({selectedDrivers.size} driver{selectedDrivers.size !== 1 ? 's' : ''})
              </button>
            )}
            <div className="flex items-center gap-1">
              <button onClick={goPrevWeek} className="p-2 border border-[#E8E3DB] rounded-lg hover:bg-white transition-colors" title="Previous week">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={goThisWeek} className="px-3 py-1.5 text-xs font-medium border border-[#E8E3DB] rounded-lg hover:bg-white transition-colors">
                This Week
              </button>
              <button onClick={goNextWeek} className="p-2 border border-[#E8E3DB] rounded-lg hover:bg-white transition-colors" title="Next week">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Calendar grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-[#4A4A4A]">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading schedule…
          </div>
        ) : drivers.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#E8E3DB] p-12 text-center text-[#4A4A4A] text-sm">
            No drivers in this transport department.
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-[#E8E3DB] shadow-sm overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-[#E8E3DB]">
                  <th className="w-8 px-3 py-3 text-left"></th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider min-w-[120px]">Driver</th>
                  {days.map((d, i) => (
                    <th
                      key={d}
                      className={`px-2 py-3 text-center text-xs font-semibold uppercase tracking-wider min-w-[100px] ${
                        d === today
                          ? 'text-[#2D5A45] border-l-2 border-r-2 border-t-2 border-[#2D5A45] rounded-t-md'
                          : 'text-[#4A4A4A]'
                      }`}
                    >
                      {DAY_LABELS[i]}<br />
                      <span className="font-normal normal-case">{fmtDayHeader(d).split(' ')[1]}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E3DB]">
                {drivers.map(driver => {
                  const isSelected = selectedDrivers.has(driver.id);
                  return (
                    <tr key={driver.id} className={`transition-colors ${isSelected ? 'bg-amber-50/50' : 'hover:bg-[#F5F0E8]/30'}`}>
                      <td className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleDriverSelect(driver.id)}
                          className="w-4 h-4 rounded accent-[#2D5A45]"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-[#1A1A1A]">{driver.name}</p>
                        {driver.vehicle_type && (
                          <p className="text-xs text-[#4A4A4A]">{driver.vehicle_type}</p>
                        )}
                      </td>
                      {days.map(date => {
                        const key = `${driver.id}|${date}`;
                        const entry = schedules[key];
                        const count = taskCounts[key] ?? 0;
                        const isToday = date === today;
                        const meta = entry ? STATUS_META[entry.status] : null;

                        return (
                          <td
                            key={date}
                            className={`px-1 py-2 text-center ${isToday ? 'border-l-2 border-r-2 border-[#2D5A45]' : ''}`}
                          >
                            <button
                              onClick={() => handleCellClick(driver, date)}
                              className={`w-full rounded-lg p-2 text-xs transition-all hover:shadow-md hover:scale-105 ${
                                meta
                                  ? `${meta.bg} border ${meta.border} ${meta.text}`
                                  : 'bg-gray-50 border border-dashed border-gray-200 text-gray-400 hover:border-gray-300'
                              }`}
                              title={entry?.notes ?? undefined}
                            >
                              {meta ? (
                                <>
                                  <div className="font-medium">{meta.emoji} {meta.label}</div>
                                  {(entry?.shift_start || entry?.shift_end) && (
                                    <div className="opacity-80 text-[10px]">
                                      {entry?.shift_start && entry?.shift_end
                                        ? `${entry.shift_start.slice(0, 5)}–${entry.shift_end.slice(0, 5)}`
                                        : (entry?.shift_start ?? entry?.shift_end ?? '')}
                                    </div>
                                  )}
                                  {count > 0 && (
                                    <div className="mt-0.5 text-[10px] opacity-70">
                                      {count} task{count !== 1 ? 's' : ''}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <div className="py-1">—</div>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Today bottom border */}
            <div className="flex">
              <div className="w-8 shrink-0" />
              <div className="flex-1" />
              {days.map(d => (
                <div
                  key={d}
                  className={`flex-1 min-w-[100px] ${d === today ? 'border-b-2 border-[#2D5A45] rounded-b-md' : ''}`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-3">
          {STATUS_OPTIONS.map(s => {
            const m = STATUS_META[s];
            return (
              <span key={s} className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${m.bg} border ${m.border} ${m.text}`}>
                {m.emoji} {m.label}
              </span>
            );
          })}
          <span className="text-xs text-[#4A4A4A] flex items-center gap-1">
            — = not set (click to set)
          </span>
        </div>
        </div>
      </main>

      <ScheduleEditDialog
        target={editTarget}
        existing={editExisting}
        onClose={() => { setEditTarget(null); setEditExisting(null); }}
        onSaved={handleSaved}
        userId={user?.id ?? ''}
      />
    </div>
  );
}
