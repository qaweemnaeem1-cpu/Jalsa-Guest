/**
 * /dept/drivers — drivers across all locations in this department (Department Head view).
 */
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  Plus, Eye, Pencil, Car, Users, CheckCircle2, FileText, MessageCircle, Wrench,
  BarChart3, ArrowLeftRight, MapPin, ExternalLink,
} from 'lucide-react';
import { getMapLink, calculateETA, formatETA, isETAOverdue } from '@/lib/driverMatchUtils';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { DeptSidebar } from '@/components/DeptSidebar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DriverFormDialog, type DriverRecord } from '@/components/DriverFormDialog';
import { DriverTaskViewDialog } from '@/components/DriverTaskViewDialog';
import { CreateTaskDialog, type DriverInfo } from '@/components/CreateTaskDialog';
import { DailyReportDialog } from '@/components/DailyReportDialog';
import { DriverMessagesDialog } from '@/components/DriverMessagesDialog';
import { AddMaintenanceDialog, ViewMaintenanceLogDialog } from '@/components/VehicleMaintenanceDialog';
import { TopBar } from '@/components/TopBar';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DriverRow extends DriverRecord {
  tasksToday: number;
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

type ReassignDuration = 'today' | 'until_date' | 'permanent';

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtTime = (iso?: string | null): string => {
  if (!iso) return '—';
  const timePart = iso.includes('T') ? iso.split('T')[1]?.substring(0, 5) : '';
  return timePart || iso.substring(0, 10);
};

export default function DeptDriversPage() {
  const { user } = useAuth();
  const dept = user?.department ?? '';

  // ── core state ───────────────────────────────────────────────────────────────
  const [drivers, setDrivers]       = useState<DriverRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [locationFilter, setLocFil] = useState('');

  // existing dialogs
  const [formOpen, setFormOpen]         = useState(false);
  const [reportOpen, setReportOpen]     = useState(false);
  const [editDriver, setEditDriver]     = useState<DriverRecord | null>(null);
  const [viewDriver, setViewDriver]     = useState<DriverRecord | null>(null);
  const [assignDriver, setAssignDriver] = useState<DriverRecord | null>(null);
  const [msgDriver, setMsgDriver]       = useState<DriverRecord | null>(null);
  const [maintViewDriver, setMaintViewDriver] = useState<DriverRecord | null>(null);
  const [maintAddDriver, setMaintAddDriver]   = useState<DriverRecord | null>(null);

  // ── arrival board state ──────────────────────────────────────────────────────
  const [arrivals, setArrivals]         = useState<ArrivalGuest[]>([]);
  const [departures, setDepartures]     = useState<ArrivalGuest[]>([]);
  const [pickupTasks, setPickupTasks]   = useState<FlightTask[]>([]);
  const [dropoffTasks, setDropoffTasks] = useState<FlightTask[]>([]);
  const [arrivalsLoading, setArrivalsLoading] = useState(true);

  // ── reassign state ───────────────────────────────────────────────────────────
  const [reassignOpen, setReassignOpen]         = useState(false);
  const [reassignDriverId, setReassignDriverId] = useState('');
  const [reassignTargetLoc, setReassignTargetLoc] = useState('');
  const [reassignDuration, setReassignDuration] = useState<ReassignDuration>('today');
  const [reassignUntilDate, setReassignUntilDate] = useState('');
  const [reassignReason, setReassignReason]     = useState('');
  const [reassigning, setReassigning]           = useState(false);

  const loadedRef = useRef(false);

  const today = useMemo(() => new Date().toISOString().substring(0, 10), []);

  // ── Fetch drivers ─────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    if (!dept) return;

    const [driversRes, tasksRes] = await Promise.all([
      supabase.from('users')
        .select('id,name,email,phone,location,department,vehicle_type,vehicle_model,vehicle_registration,vehicle_capacity,is_head_driver,is_available')
        .eq('role', 'driver')
        .eq('department', dept),
      supabase.from('driver_tasks')
        .select('driver_id')
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
      supabase.from('guests')
        .select('id,full_name,arrival_time,flight_number,arrival_airport,arrival_terminal,placed_location')
        .eq('assigned_department', dept)
        .gte('arrival_time', today)
        .lte('arrival_time', `${today}T23:59:59`)
        .order('arrival_time'),
      supabase.from('guests')
        .select('id,full_name,departure_time,flight_number,departure_airport,departure_terminal,placed_location')
        .eq('assigned_department', dept)
        .gte('departure_time', today)
        .lte('departure_time', `${today}T23:59:59`)
        .order('departure_time'),
      supabase.from('driver_tasks')
        .select('guest_id,guest_name,driver_id,driver_name,status,started_at,pickup_location,dropoff_location,task_type')
        .eq('task_type', 'airport_pickup')
        .eq('department', dept)
        .eq('scheduled_date', today),
      supabase.from('driver_tasks')
        .select('guest_id,guest_name,driver_id,driver_name,status,started_at,pickup_location,dropoff_location,task_type')
        .eq('task_type', 'airport_dropoff')
        .eq('department', dept)
        .eq('scheduled_date', today),
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

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    fetchAll();
    fetchArrivals();
  }, [fetchAll, fetchArrivals]);

  // ── Handlers ──────────────────────────────────────────────────────────────────

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

  const handleQuickAssign = async (
    guest: ArrivalGuest,
    driverId: string,
    taskType: 'airport_pickup' | 'airport_dropoff',
  ) => {
    const driver = drivers.find(d => d.id === driverId);
    if (!driver) return;
    const { error } = await supabase.from('driver_tasks').insert({
      driver_id: driverId,
      driver_name: driver.name,
      task_type: taskType,
      status: 'pending',
      scheduled_date: today,
      scheduled_time: guest.time ? fmtTime(guest.time) : null,
      guest_id: guest.id,
      guest_name: guest.fullName,
      location: driver.location,
      department: dept,
      is_suggestion: false,
    });
    if (error) { toast.error('Failed to assign driver'); return; }
    toast.success(`${driver.name} assigned to ${taskType === 'airport_pickup' ? 'pick up' : 'drop off'} ${guest.fullName}`);
    const newTask: FlightTask = { guest_id: guest.id, guest_name: guest.fullName, driver_id: driverId, driver_name: driver.name, status: 'pending' };
    if (taskType === 'airport_pickup') setPickupTasks(p => [...p, newTask]);
    else setDropoffTasks(p => [...p, newTask]);
    fetchAll();
  };

  const handleReassign = async () => {
    if (!reassignDriverId || !reassignTargetLoc) { toast.error('Select driver and target location'); return; }
    setReassigning(true);
    const driver = drivers.find(d => d.id === reassignDriverId);
    try {
      if (reassignDuration === 'permanent') {
        const { error } = await supabase.from('users').update({ location: reassignTargetLoc }).eq('id', reassignDriverId);
        if (error) throw error;
        setDrivers(prev => prev.map(d => d.id === reassignDriverId ? { ...d, location: reassignTargetLoc } : d));
        toast.success(`${driver?.name ?? 'Driver'} permanently moved to ${reassignTargetLoc}`);
      } else {
        const duration = reassignDuration === 'today' ? 'today' : `until ${reassignUntilDate}`;
        toast.success(`${driver?.name ?? 'Driver'} temporarily assigned to ${reassignTargetLoc} (${duration})`);
      }
      setReassignOpen(false);
      setReassignDriverId(''); setReassignTargetLoc(''); setReassignReason('');
      setReassignDuration('today'); setReassignUntilDate('');
    } catch {
      toast.error('Reassignment failed');
    } finally {
      setReassigning(false);
    }
  };

  // ── Derived values ─────────────────────────────────────────────────────────────

  const locations = useMemo(() => [...new Set(drivers.map(d => d.location).filter(Boolean))] as string[], [drivers]);
  const filtered  = locationFilter ? drivers.filter(d => d.location === locationFilter) : drivers;

  const total     = filtered.length;
  const available = filtered.filter(d => d.is_available).length;
  const onDuty    = filtered.filter(d => d.tasksToday > 0).length;

  const driverInfos: DriverInfo[] = filtered.map(d => ({
    id: d.id, name: d.name, vehicle_type: d.vehicle_type, vehicle_model: d.vehicle_model,
    vehicle_capacity: d.vehicle_capacity, is_available: d.is_available, location: d.location,
  }));

  // Workload bar chart data
  const workloadData = useMemo(() =>
    [...filtered].sort((a, b) => b.tasksToday - a.tasksToday),
    [filtered]
  );
  const maxTasks = useMemo(() => Math.max(1, ...workloadData.map(d => d.tasksToday)), [workloadData]);
  const overloadedDrivers = workloadData.filter(d => d.tasksToday >= 7);

  // Arrival board helpers
  const getPickupTask = (guestId: string) => pickupTasks.find(t => t.guest_id === guestId);
  const getDropoffTask = (guestId: string) => dropoffTasks.find(t => t.guest_id === guestId);
  const unassignedArrivals  = arrivals.filter(g => !getPickupTask(g.id));
  const unassignedDepartures = departures.filter(g => !getDropoffTask(g.id));

  // Reassign dialog helpers
  const reassignDriver = drivers.find(d => d.id === reassignDriverId);
  const reassignLocOptions = locations.filter(l => l !== reassignDriver?.location);

  // ── Render ─────────────────────────────────────────────────────────────────────

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
            <p className="text-sm text-[#4A4A4A] mt-0.5">{dept} department transport</p>
          </div>
          <div className="flex items-center gap-3">
            <select value={locationFilter} onChange={e => setLocFil(e.target.value)}
              className="border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45] bg-white">
              <option value="">All Locations</option>
              {locations.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <Button variant="outline"
              onClick={() => { setReassignOpen(true); setReassignDriverId(''); setReassignTargetLoc(''); }}
              className="text-[#2D5A45] border-[#2D5A45] hover:bg-[#F5F0E8] gap-2">
              <ArrowLeftRight className="w-4 h-4" /> Reassign Driver
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

        {/* ── ✈️ Arrival Board ──────────────────────────────────────────────────── */}
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
                        ? calculateETA({ task_type: 'airport_pickup', pickup_location: task.pickup_location, dropoff_location: task.dropoff_location, started_at: task.started_at })
                        : null;
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
                              <select
                                defaultValue=""
                                onChange={e => { if (e.target.value) handleQuickAssign(g, e.target.value, 'airport_pickup'); }}
                                className="shrink-0 text-xs border border-amber-300 rounded-lg px-1.5 py-1 bg-amber-50 text-amber-800 focus:outline-none focus:border-[#2D5A45] cursor-pointer">
                                <option value="">Assign ▼</option>
                                {drivers.filter(d => d.is_available).map(d => (
                                  <option key={d.id} value={d.id}>
                                    {d.name}{d.vehicle_type ? ` · ${d.vehicle_type}` : ''}{d.vehicle_capacity ? ` · ${d.vehicle_capacity}p` : ''}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                          {etaStr && (
                            <p className={`ml-[168px] mt-0.5 font-medium ${etaOver ? 'text-red-600' : 'text-blue-600'}`}>
                              {etaStr}
                            </p>
                          )}
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
                        ? calculateETA({ task_type: 'airport_dropoff', pickup_location: task.pickup_location, dropoff_location: task.dropoff_location, started_at: task.started_at })
                        : null;
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
                              <select
                                defaultValue=""
                                onChange={e => { if (e.target.value) handleQuickAssign(g, e.target.value, 'airport_dropoff'); }}
                                className="shrink-0 text-xs border border-amber-300 rounded-lg px-1.5 py-1 bg-amber-50 text-amber-800 focus:outline-none focus:border-[#2D5A45] cursor-pointer">
                                <option value="">Assign ▼</option>
                                {drivers.filter(d => d.is_available).map(d => (
                                  <option key={d.id} value={d.id}>
                                    {d.name}{d.vehicle_type ? ` · ${d.vehicle_type}` : ''}{d.vehicle_capacity ? ` · ${d.vehicle_capacity}p` : ''}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                          {etaStr && (
                            <p className={`ml-[168px] mt-0.5 font-medium ${etaOver ? 'text-red-600' : 'text-blue-600'}`}>
                              {etaStr}
                            </p>
                          )}
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

        {/* ── 📊 Workload Balance ───────────────────────────────────────────────── */}
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
                      {d.location && <span className="text-gray-400 font-normal"> ({d.location})</span>}
                    </span>
                    <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-4 rounded-full transition-all duration-500 ${barCls}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-20 shrink-0 text-xs text-right text-[#4A4A4A]">
                      {d.tasksToday} task{d.tasksToday !== 1 ? 's' : ''}
                    </span>
                    <span className={`w-14 shrink-0 text-xs font-medium ${load === 'heavy' ? 'text-red-600' : load === 'normal' ? 'text-amber-600' : 'text-green-600'}`}>
                      {load === 'heavy' ? '⚠️ Heavy' : load === 'normal' ? '✅ Normal' : '✅ Light'}
                    </span>
                  </div>
                );
              })}
            </div>
            {overloadedDrivers.length > 0 && (
              <div className="mt-3 pt-3 border-t border-[#E8E3DB] text-xs text-amber-700 bg-amber-50 rounded-lg p-2">
                ⚠️ {overloadedDrivers.map(d => d.name).join(', ')} {overloadedDrivers.length > 1 ? 'are' : 'is'} overloaded — consider reassigning tasks using the Reassign Driver button above.
              </div>
            )}
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

        {/* Drivers Table */}
        <div className="bg-white rounded-xl border border-[#E8E3DB]">
          <div className="p-4 border-b border-[#E8E3DB]">
            <h2 className="font-semibold text-[#1A1A1A]">Driver Roster</h2>
          </div>
          {loading ? (
            <div className="p-8 text-center text-[#4A4A4A] text-sm">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-[#4A4A4A] text-sm">No drivers found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E8E3DB] bg-[#F5F0E8]">
                    <th className="px-4 py-3 text-left font-medium text-[#4A4A4A]">Name</th>
                    <th className="px-4 py-3 text-left font-medium text-[#4A4A4A]">Location</th>
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
                      <td className="px-4 py-3 text-[#4A4A4A]">{d.location ?? '—'}</td>
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
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </div>{/* /p-8 */}
      </main>

      {/* ── Existing dialogs ── */}

      <DriverFormDialog
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditDriver(null); }}
        driver={editDriver}
        defaultDepartment={dept}
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

      {/* ── Reassign Dialog ── */}
      <Dialog open={reassignOpen} onOpenChange={o => { if (!o) setReassignOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowLeftRight className="w-5 h-5 text-[#2D5A45]" /> Temporary Reassignment
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div>
              <label className="text-xs font-medium text-[#4A4A4A] block mb-1">Driver</label>
              <select
                value={reassignDriverId}
                onChange={e => { setReassignDriverId(e.target.value); setReassignTargetLoc(''); }}
                className="w-full border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45] bg-white">
                <option value="">Select driver…</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name}{d.location ? ` — ${d.location}` : ''}
                  </option>
                ))}
              </select>
              {reassignDriver && (
                <p className="text-xs text-[#4A4A4A] mt-1">Currently at: <span className="font-medium">{reassignDriver.location ?? '(No location)'}</span></p>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-[#4A4A4A] block mb-1">Temporarily assign to</label>
              <select
                value={reassignTargetLoc}
                onChange={e => setReassignTargetLoc(e.target.value)}
                disabled={!reassignDriverId}
                className="w-full border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45] bg-white disabled:opacity-50">
                <option value="">Select location…</option>
                {reassignLocOptions.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <p className="text-xs text-gray-400 mt-1">Only locations within {dept} department</p>
            </div>

            <div>
              <label className="text-xs font-medium text-[#4A4A4A] block mb-2">Duration</label>
              <div className="space-y-2">
                {([
                  ['today', 'Today only'],
                  ['until_date', 'Until a date'],
                  ['permanent', 'Permanent (update driver\'s location)'],
                ] as [ReassignDuration, string][]).map(([val, label]) => (
                  <label key={val} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={reassignDuration === val} onChange={() => setReassignDuration(val)}
                      className="accent-[#2D5A45]" />
                    <span className="text-sm text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
              {reassignDuration === 'until_date' && (
                <input type="date" value={reassignUntilDate} onChange={e => setReassignUntilDate(e.target.value)}
                  min={today}
                  className="mt-2 w-full border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45]" />
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-[#4A4A4A] block mb-1">Reason (optional)</label>
              <input
                value={reassignReason}
                onChange={e => setReassignReason(e.target.value)}
                placeholder="e.g. Jamia drivers all busy, Hotels has capacity"
                className="w-full border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassignOpen(false)} className="border-[#D4CFC7] text-[#4A4A4A]">Cancel</Button>
            <Button
              onClick={handleReassign}
              disabled={!reassignDriverId || !reassignTargetLoc || (reassignDuration === 'until_date' && !reassignUntilDate) || reassigning}
              className="bg-[#2D5A45] hover:bg-[#234839] text-white">
              {reassigning ? 'Reassigning…' : 'Reassign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
