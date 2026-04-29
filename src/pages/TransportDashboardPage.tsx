/**
 * /transport/dashboard — Transport Department Head dashboard.
 * Shows alerts, stats, today's arrivals/departures, driver status, and workload balance.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Loader2, Users, UserCheck,
  ClipboardList, Car, ChevronDown, ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { TransportSidebar } from '@/components/TransportSidebar';
import { TopBar } from '@/components/TopBar';
import { supabase } from '@/lib/supabase';
import type { DriverTask, Guest } from '@/types';
import { formatDateShort, formatTime } from '@/utils/dateHelpers';
import { GuestCalendarWidget } from '@/components/shared/GuestCalendarWidget';

// ── helpers ───────────────────────────────────────────────────────────────────

function todayStr() { return new Date().toISOString().split('T')[0]; }

const fmtTime = (iso: string) => formatTime(iso);
const fmtDate = (iso?: string) => formatDateShort(iso);

// ── types ─────────────────────────────────────────────────────────────────────

interface GuestRow {
  id: string;
  full_name: string;
  country?: string;
  designation?: string;
  arrival_date?: string;
  arrival_time?: string;
  departure_date?: string;
  departure_time?: string;
  arrival_flight_number?: string;
  flight_number?: string;
  departure_flight_number?: string;
  arrival_airport?: string;
  departure_airport?: string;
  arrival_terminal?: string;
  departure_terminal?: string;
  location?: string;
  accommodation_department?: string;
  transport_department_id?: string;
  driver_id?: string;
  driver_name?: string;
}

interface DriverRow {
  id: string;
  name: string;
  phone?: string;
  vehicle_type?: string;
  vehicle_model?: string;
  vehicle_registration?: string;
  vehicle_capacity?: number;
  is_available?: boolean;
  is_head_driver?: boolean;
  transport_department_id?: string;
}

interface DriverWithStatus extends DriverRow {
  todayTaskCount: number;
  activeTask?: DriverTask;
}

type AvailStatus = 'available' | 'off_duty' | 'on_task' | 'unknown';
function driverStatus(d: DriverWithStatus): AvailStatus {
  if (d.activeTask) return 'on_task';
  if (d.is_available === true) return 'available';
  if (d.is_available === false) return 'off_duty';
  return 'unknown';
}

const STATUS_DOT: Record<AvailStatus, string> = {
  available: 'bg-green-500',
  on_task:   'bg-blue-500',
  off_duty:  'bg-amber-500',
  unknown:   'bg-gray-400',
};
const STATUS_LABEL: Record<AvailStatus, string> = {
  available: 'Available',
  on_task:   'On Task',
  off_duty:  'Off Duty',
  unknown:   'Unknown',
};

// ── Assign Driver Dropdown ─────────────────────────────────────────────────────

function AssignDriverDropdown({
  guestId,
  guestName,
  taskType,
  drivers,
  onAssigned,
}: {
  guestId: string;
  guestName: string;
  taskType: 'pickup' | 'dropoff';
  drivers: DriverWithStatus[];
  onAssigned: (guestId: string, driverId: string, driverName: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleSelect = async (driver: DriverWithStatus) => {
    setSaving(true);
    setOpen(false);
    try {
      // Update the existing suggested task for this guest if it exists, else create quick task
      const { error } = await supabase
        .from('driver_tasks')
        .update({ driver_id: driver.id, driver_name: driver.name, status: 'pending' })
        .eq('guest_id', guestId)
        .eq('task_type', taskType === 'pickup' ? 'airport_pickup' : 'airport_dropoff')
        .eq('status', 'suggested');

      if (!error) {
        onAssigned(guestId, driver.id, driver.name);
        toast.success(`${driver.name} assigned to ${guestName}`);
      } else {
        toast.error('Failed to assign driver');
      }
    } catch {
      toast.error('Failed to assign driver');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        disabled={saving}
        className="flex items-center gap-1 text-xs font-medium px-2 py-1 bg-amber-50 border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-100 transition-colors"
      >
        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <><span>ASSIGN</span><ChevronDown className="w-3 h-3" /></>}
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-64 bg-white rounded-xl border border-[#E8E3DB] shadow-lg z-50 py-1 max-h-64 overflow-y-auto">
          {drivers.length === 0 ? (
            <p className="px-3 py-2 text-xs text-[#4A4A4A]">No drivers available</p>
          ) : drivers.map(d => {
            const s = driverStatus(d);
            return (
              <button
                key={d.id}
                onClick={() => handleSelect(d)}
                className="w-full text-left px-3 py-2 hover:bg-[#F5F0E8] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[s]}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#1A1A1A] truncate">{d.name}</p>
                    <p className="text-xs text-[#4A4A4A] truncate">
                      {[d.vehicle_type, d.vehicle_model].filter(Boolean).join(' · ')}
                      {d.vehicle_capacity ? ` · ${d.vehicle_capacity} pax` : ''}
                      {' · '}{STATUS_LABEL[s]}
                      {d.todayTaskCount > 0 ? ` (${d.todayTaskCount} tasks)` : ''}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function TransportDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [guests, setGuests]     = useState<GuestRow[]>([]);
  const [drivers, setDrivers]   = useState<DriverWithStatus[]>([]);
  const [tasks, setTasks]       = useState<DriverTask[]>([]);
  const [loading, setLoading]   = useState(true);

  // Track per-guest assigned driver overrides (from dropdown selections)
  const [assignedDrivers, setAssignedDrivers] = useState<Record<string, { id: string; name: string }>>({});

  const loadedRef = useRef(false);
  const today = todayStr();

  const fetchAll = useCallback(async () => {
    if (!user?.transportDepartmentId) return;
    const tdId = user.transportDepartmentId;

    try {
      const [guestsRes, driversRes, tasksRes, activeTasksRes] = await Promise.all([
        supabase
          .from('guests')
          .select('*')
          .eq('transport_department_id', tdId),
        supabase
          .from('users')
          .select('*')
          .eq('role', 'driver')
          .eq('transport_department_id', tdId)
          .order('name'),
        supabase
          .from('driver_tasks')
          .select('*')
          .eq('transport_department_id', tdId)
          .eq('scheduled_date', today),
        supabase
          .from('driver_tasks')
          .select('*')
          .eq('transport_department_id', tdId)
          .eq('status', 'in_progress'),
      ]);

      const guestRows = (guestsRes.data ?? []) as GuestRow[];
      const driverRows = (driversRes.data ?? []) as DriverRow[];
      const taskRows = (tasksRes.data ?? []) as DriverTask[];
      const activeTaskRows = (activeTasksRes.data ?? []) as DriverTask[];

      // Build today task counts per driver
      const countMap: Record<string, number> = {};
      for (const t of taskRows) {
        if (t.driver_id) countMap[t.driver_id] = (countMap[t.driver_id] ?? 0) + 1;
      }

      // Build active task map per driver
      const activeMap: Record<string, DriverTask> = {};
      for (const t of activeTaskRows) {
        if (t.driver_id) activeMap[t.driver_id] = t;
      }

      setGuests(guestRows);
      setTasks(taskRows);
      setDrivers(driverRows.map(d => ({
        ...d,
        todayTaskCount: countMap[d.id] ?? 0,
        activeTask: activeMap[d.id],
      })));
    } catch {
      // tables may not exist yet
    } finally {
      setLoading(false);
    }
  }, [user?.transportDepartmentId, today]);

  useEffect(() => {
    if (!user?.transportDepartmentId || loadedRef.current) return;
    loadedRef.current = true;
    fetchAll();
  }, [user?.transportDepartmentId, fetchAll]);

  // Real-time subscriptions
  useEffect(() => {
    if (!user?.transportDepartmentId) return;
    const tdId = user.transportDepartmentId;

    const channel = supabase
      .channel('transport-dashboard-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_tasks', filter: `transport_department_id=eq.${tdId}` }, () => {
        fetchAll();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guests', filter: `transport_department_id=eq.${tdId}` }, (payload) => {
        if (payload.eventType === 'INSERT') {
          toast.info(`New guest assigned to ${user.transportDepartmentName ?? 'your department'}`);
        }
        fetchAll();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.transportDepartmentId, user?.transportDepartmentName, fetchAll]);

  // ── Derived data ─────────────────────────────────────────────────────────────

  const todayArrivals = guests.filter(g => {
    if (!g.arrival_time) return false;
    const date = g.arrival_time.substring(0, 10);
    return date === today;
  });

  const todayDepartures = guests.filter(g => {
    if (!g.departure_time) return false;
    const date = g.departure_time.substring(0, 10);
    return date === today;
  });

  const totalGuests    = guests.length;
  const totalDrivers   = drivers.length;
  const totalToday     = tasks.length;
  const completedToday = tasks.filter(t => t.status === 'completed').length;
  const unassignedTasks = tasks.filter(t => !t.driver_id && t.status === 'suggested').length;

  // Adapter: map raw DB rows to the Guest shape the shared calendar widget expects
  const calendarGuests = useMemo<Guest[]>(() => guests.map(g => ({
    id: g.id,
    fullName: g.full_name,
    arrival_date: g.arrival_date,
    arrival_time: g.arrival_time,
    arrivalFlightNumber: g.arrival_flight_number ?? g.flight_number,
    arrivalAirport: g.arrival_airport,
    arrivalTerminal: g.arrival_terminal,
    departure_date: g.departure_date,
    departure_time: g.departure_time,
    departureFlightNumber: g.departure_flight_number,
    departureAirport: g.departure_airport,
    departureTerminal: g.departure_terminal,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)), [guests]);
  const driverNameByGuestId = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    for (const g of guests) map[g.id] = g.driver_name;
    return map;
  }, [guests]);

  const noDriverArrivals   = todayArrivals.filter(g => {
    const assigned = assignedDrivers[g.id];
    if (assigned) return false;
    // check if there's a task with driver
    const hasTask = tasks.some(t => t.guest_id === g.id && t.task_type === 'airport_pickup' && t.driver_id);
    return !hasTask;
  }).length;

  const noDriverDepartures = todayDepartures.filter(g => {
    const assigned = assignedDrivers[g.id];
    if (assigned) return false;
    const hasTask = tasks.some(t => t.guest_id === g.id && t.task_type === 'airport_dropoff' && t.driver_id);
    return !hasTask;
  }).length;

  // Vehicles expiring within 7 days (using vehicle_available_to from driver rows)
  // For now, just show drivers on maintenance if we had that data
  const overloadedDrivers = drivers.filter(d => d.todayTaskCount >= 7).length;

  const hasAlerts = noDriverArrivals > 0 || noDriverDepartures > 0 || unassignedTasks > 0 || overloadedDrivers > 0;

  const handleDriverAssigned = useCallback((guestId: string, driverId: string, driverName: string) => {
    setAssignedDrivers(prev => ({ ...prev, [guestId]: { id: driverId, name: driverName } }));
    fetchAll();
  }, [fetchAll]);

  const getGuestDriver = (g: GuestRow, taskType: 'airport_pickup' | 'airport_dropoff') => {
    const override = assignedDrivers[g.id];
    if (override) return override.name;
    const task = tasks.find(t => t.guest_id === g.id && t.task_type === taskType && t.driver_id);
    return task?.driver_name ?? null;
  };

  if (loading) {
    return (
      <div className="flex min-h-screen bg-[#F5F0E8]">
        <TransportSidebar />
        <main className="ml-64 flex-1">
          <TopBar />
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-6 h-6 animate-spin text-[#2D5A45] mr-2" />
            <span className="text-[#4A4A4A]">Loading dashboard…</span>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#F5F0E8]">
      <TransportSidebar />

      <main className="ml-64 flex-1">
        <TopBar />
        <div className="p-8 space-y-6">

          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-[#1A1A1A]">
              {user?.transportDepartmentName ?? 'Transport Department'} Dashboard
            </h1>
            <p className="text-sm text-[#4A4A4A] mt-0.5">
              {user?.name} — Transport Department Head
            </p>
          </div>

          {/* Alerts Panel */}
          {hasAlerts ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {noDriverArrivals > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-700">{noDriverArrivals} arriving today</p>
                    <p className="text-xs text-red-600">No driver assigned</p>
                  </div>
                </div>
              )}
              {noDriverDepartures > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-700">{noDriverDepartures} departing today</p>
                    <p className="text-xs text-amber-600">No driver assigned</p>
                  </div>
                </div>
              )}
              {unassignedTasks > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
                  <ClipboardList className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-700">{unassignedTasks} tasks unassigned</p>
                    <p className="text-xs text-amber-600">Need driver allocation</p>
                  </div>
                </div>
              )}
              {overloadedDrivers > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-orange-700">{overloadedDrivers} drivers overloaded</p>
                    <p className="text-xs text-orange-600">7+ tasks today</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
              <p className="text-sm font-semibold text-green-700">✅ All clear — no urgent items</p>
            </div>
          )}

          {/* Stats Cards */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { icon: UserCheck,    label: 'Guests',       value: totalGuests,    color: 'text-[#2D5A45]' },
              { icon: Users,        label: 'Drivers',      value: totalDrivers,   color: 'text-blue-600' },
              { icon: ClipboardList,label: 'Tasks Today',  value: totalToday,     color: 'text-amber-600' },
              { icon: CheckCircle2, label: 'Completed',    value: completedToday, color: 'text-green-600' },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl border border-[#E8E3DB] px-5 py-4 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <s.icon className={`w-4 h-4 ${s.color}`} />
                  <p className="text-xs text-[#4A4A4A] font-medium">{s.label}</p>
                </div>
                <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Calendar widget (shared) — same 2-col grid as Location Manager */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <GuestCalendarWidget
              guests={calendarGuests}
              title={`📅 ${user?.transportDepartmentName ?? 'Transport'} — Upcoming Schedule`}
              renderGuestLine={(g, type) => {
                const time     = type === 'arrival' ? g.arrival_time     : g.departure_time;
                const flight   = type === 'arrival' ? g.arrivalFlightNumber : g.departureFlightNumber;
                const airport  = type === 'arrival' ? g.arrivalAirport   : g.departureAirport;
                const terminal = type === 'arrival' ? g.arrivalTerminal  : g.departureTerminal;
                const dotCls   = type === 'arrival' ? 'bg-green-500' : 'bg-yellow-500';
                const meta = [flight, airport, terminal ? `T${terminal}` : ''].filter(Boolean).join(' · ');
                const driverName = driverNameByGuestId[g.id];
                return (
                  <>
                    <span className={`w-2 h-2 rounded-full ${dotCls} shrink-0`} />
                    <span className="text-gray-500">{formatTime(time)}</span>
                    <span className="font-medium text-gray-800">{g.fullName}</span>
                    {meta && <span className="text-gray-400 text-xs">{meta}</span>}
                    {driverName ? (
                      <span className="text-xs text-[#2D5A45]">🚐 {driverName}</span>
                    ) : (
                      <span className="text-red-600 text-[11px] font-medium">⚠️ No driver</span>
                    )}
                  </>
                );
              }}
            />
            <div />
          </div>

          {/* Arrivals & Departures */}
          <div className="grid grid-cols-2 gap-4">
            {/* Arrivals */}
            <div className="bg-white rounded-2xl border border-[#E8E3DB] shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
                <h2 className="font-semibold text-blue-900 text-sm">Arrivals Today</h2>
                <span className="text-xs font-bold bg-blue-600 text-white px-2 py-0.5 rounded-full">{todayArrivals.length}</span>
              </div>
              {todayArrivals.length === 0 ? (
                <p className="text-center py-8 text-sm text-[#4A4A4A]">No arrivals today</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#E8E3DB] bg-[#F5F0E8]/50">
                        {['Time', 'Flight', 'Terminal', 'Guest', 'Driver'].map(h => (
                          <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8E3DB]">
                      {todayArrivals.map(g => {
                        const driverName = getGuestDriver(g, 'airport_pickup');
                        return (
                          <tr key={g.id} className="hover:bg-[#F5F0E8]/50">
                            <td className="px-3 py-2 whitespace-nowrap font-medium text-[#1A1A1A]">{fmtTime(g.arrival_time ?? '')}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-[#4A4A4A]">{g.arrival_flight_number ?? '—'}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-[#4A4A4A]">{g.arrival_terminal ?? '—'}</td>
                            <td className="px-3 py-2 max-w-[120px] truncate font-medium text-[#1A1A1A]">{g.full_name}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {driverName ? (
                                <span className="flex items-center gap-1 text-xs text-green-700 font-medium">
                                  <span className="w-2 h-2 bg-green-500 rounded-full" />
                                  {driverName}
                                </span>
                              ) : (
                                <AssignDriverDropdown
                                  guestId={g.id}
                                  guestName={g.full_name}
                                  taskType="pickup"
                                  drivers={drivers}
                                  onAssigned={handleDriverAssigned}
                                />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Departures */}
            <div className="bg-white rounded-2xl border border-[#E8E3DB] shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-purple-50 border-b border-purple-100 flex items-center justify-between">
                <h2 className="font-semibold text-purple-900 text-sm">Departures Today</h2>
                <span className="text-xs font-bold bg-purple-600 text-white px-2 py-0.5 rounded-full">{todayDepartures.length}</span>
              </div>
              {todayDepartures.length === 0 ? (
                <p className="text-center py-8 text-sm text-[#4A4A4A]">No departures today</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#E8E3DB] bg-[#F5F0E8]/50">
                        {['Time', 'Flight', 'Guest', 'Driver'].map(h => (
                          <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8E3DB]">
                      {todayDepartures.map(g => {
                        const driverName = getGuestDriver(g, 'airport_dropoff');
                        return (
                          <tr key={g.id} className="hover:bg-[#F5F0E8]/50">
                            <td className="px-3 py-2 whitespace-nowrap font-medium text-[#1A1A1A]">{fmtTime(g.departure_time ?? '')}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-[#4A4A4A]">{g.departure_flight_number ?? '—'}</td>
                            <td className="px-3 py-2 max-w-[120px] truncate font-medium text-[#1A1A1A]">{g.full_name}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {driverName ? (
                                <span className="flex items-center gap-1 text-xs text-green-700 font-medium">
                                  <span className="w-2 h-2 bg-green-500 rounded-full" />
                                  {driverName}
                                </span>
                              ) : (
                                <AssignDriverDropdown
                                  guestId={g.id}
                                  guestName={g.full_name}
                                  taskType="dropoff"
                                  drivers={drivers}
                                  onAssigned={handleDriverAssigned}
                                />
                              )}
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

          {/* Driver Status + Workload Balance */}
          <div className="grid grid-cols-2 gap-4">
            {/* Driver Status Widget */}
            <div className="bg-white rounded-2xl border border-[#E8E3DB] shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-[#E8E3DB] flex items-center justify-between">
                <h2 className="font-semibold text-[#1A1A1A] text-sm">Driver Status</h2>
                <span className="text-xs text-[#4A4A4A]">Live</span>
              </div>
              <div className="p-4 space-y-2">
                {drivers.length === 0 ? (
                  <p className="text-sm text-[#4A4A4A] text-center py-4">No drivers in this department</p>
                ) : drivers.map(d => {
                  const s = driverStatus(d);
                  return (
                    <div key={d.id} className="flex items-center gap-3 py-1.5">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_DOT[s]}`} />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-sm text-[#1A1A1A]">{d.name}</span>
                        {(d.vehicle_type || d.vehicle_model) && (
                          <span className="text-[#4A4A4A] text-xs ml-1">
                            · {[d.vehicle_type, d.vehicle_model].filter(Boolean).join(' ')}
                          </span>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        {s === 'on_task' && d.activeTask ? (
                          <p className="text-xs text-blue-600">
                            On Task → {d.activeTask.guest_name ?? 'task'}
                          </p>
                        ) : (
                          <p className="text-xs text-[#4A4A4A]">
                            {STATUS_LABEL[s]} ({d.todayTaskCount} tasks today)
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Workload Balance */}
            <div className="bg-white rounded-2xl border border-[#E8E3DB] shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-[#E8E3DB]">
                <h2 className="font-semibold text-[#1A1A1A] text-sm">Driver Workload Today</h2>
              </div>
              <div className="p-4 space-y-3">
                {drivers.length === 0 ? (
                  <p className="text-sm text-[#4A4A4A] text-center py-4">No drivers</p>
                ) : drivers.map(d => {
                  const count = d.todayTaskCount;
                  const maxCount = Math.max(...drivers.map(x => x.todayTaskCount), 1);
                  const pct = Math.round((count / Math.max(maxCount, 10)) * 100);
                  const isHeavy = count >= 7;
                  const barCls = isHeavy ? 'bg-orange-500' : count >= 4 ? 'bg-amber-400' : 'bg-[#2D5A45]';
                  return (
                    <div key={d.id}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-[#1A1A1A] font-medium truncate max-w-[140px]">{d.name}</span>
                        <span className={`text-xs font-medium ${isHeavy ? 'text-orange-600' : 'text-[#4A4A4A]'}`}>
                          {count} tasks {isHeavy ? '⚠ Heavy' : count >= 4 ? '✓ Normal' : '✓ Light'}
                        </span>
                      </div>
                      <div className="h-2 bg-[#F5F0E8] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${barCls}`}
                          style={{ width: `${Math.max(pct, count > 0 ? 5 : 0)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/transport/guests')}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#2D5A45] text-white rounded-xl text-sm font-medium hover:bg-[#234839] transition-colors"
            >
              View Guest Assignments <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate('/transport/drivers')}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-[#2D5A45] text-[#2D5A45] rounded-xl text-sm font-medium hover:bg-[#F5F0E8] transition-colors"
            >
              Manage Drivers <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate('/transport/tasks')}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-[#E8E3DB] text-[#4A4A4A] rounded-xl text-sm font-medium hover:bg-[#F5F0E8] transition-colors"
            >
              View All Tasks <ArrowRight className="w-4 h-4" />
            </button>
          </div>

        </div>
      </main>
    </div>
  );
}
