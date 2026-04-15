import { useState, useEffect } from 'react';
import {
  AlertTriangle, CheckCircle2, Clock, Users, Car, ClipboardList,
  ChevronRight, UserCheck, RefreshCw,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import MobileTransportHeadLayout from '@/components/MobileTransportHeadLayout';
import { toast } from 'sonner';

interface DriverRow {
  id: string;
  name: string;
  is_available: boolean;
  vehicle_status?: string;
  active_tasks?: number;
}

interface TodayArrival {
  id: string;
  guest_name: string;
  flight_arrival_time: string | null;
  pickup_location: string | null;
  assigned_driver_id: string | null;
  assigned_driver_name: string | null;
}

interface Alert {
  id: string;
  type: 'unassigned' | 'overdue' | 'maintenance';
  message: string;
}

interface Stats {
  totalDrivers: number;
  availableDrivers: number;
  activeTasks: number;
  completedToday: number;
}

export default function MobileTransportHomePage() {
  const { user } = useAuth();
  const deptId = (user as { transportDepartmentId?: string })?.transportDepartmentId;

  const [stats, setStats] = useState<Stats>({ totalDrivers: 0, availableDrivers: 0, activeTasks: 0, completedToday: 0 });
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [arrivals, setArrivals] = useState<TodayArrival[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [drivers4assign, setDrivers4assign] = useState<DriverRow[]>([]);
  const [assignTarget, setAssignTarget] = useState<TodayArrival | null>(null);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  async function fetchAll() {
    if (!deptId) return;
    setLoading(true);
    try {
      const [driverRes, taskRes, arrivalRes] = await Promise.all([
        supabase.from('users').select('id,name,is_available,vehicle_status').eq('transport_department_id', deptId).eq('role', 'driver').eq('is_head_driver', false),
        supabase.from('driver_tasks').select('id,status,assigned_driver_id').eq('transport_department_id', deptId),
        supabase.from('driver_tasks').select('id,guest_name,flight_arrival_time,pickup_location,assigned_driver_id,assigned_driver_name').eq('transport_department_id', deptId).eq('task_type', 'airport_pickup').gte('flight_arrival_time', today + 'T00:00:00').lte('flight_arrival_time', today + 'T23:59:59'),
      ]);

      const driverList: DriverRow[] = driverRes.data ?? [];
      const taskList = taskRes.data ?? [];

      // enrich drivers with active task count
      const enriched = driverList.map(d => ({
        ...d,
        active_tasks: taskList.filter(t => t.assigned_driver_id === d.id && t.status === 'in_progress').length,
      }));

      const available = enriched.filter(d => d.is_available).length;
      const active = taskList.filter(t => t.status === 'in_progress').length;
      const completedToday = taskList.filter(t => t.status === 'completed').length;

      setStats({ totalDrivers: enriched.length, availableDrivers: available, activeTasks: active, completedToday });
      setDrivers(enriched);
      setArrivals(arrivalRes.data ?? []);

      // Build alerts
      const newAlerts: Alert[] = [];
      const unassigned = (arrivalRes.data ?? []).filter((a: TodayArrival) => !a.assigned_driver_id);
      if (unassigned.length > 0) {
        newAlerts.push({ id: 'ua', type: 'unassigned', message: `${unassigned.length} today's pickup${unassigned.length > 1 ? 's' : ''} unassigned` });
      }
      const overdue = taskList.filter(t => t.status === 'pending').length;
      if (overdue > 2) {
        newAlerts.push({ id: 'od', type: 'overdue', message: `${overdue} tasks still pending` });
      }
      setAlerts(newAlerts);
      setDrivers4assign(enriched.filter(d => d.is_available));
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void fetchAll(); }, [deptId]);

  async function handleAssign(driverId: string) {
    if (!assignTarget) return;
    const driver = drivers.find(d => d.id === driverId);
    if (!driver) return;
    setAssigning(true);
    try {
      const { error } = await supabase.from('driver_tasks').update({
        assigned_driver_id: driverId,
        assigned_driver_name: driver.name,
      }).eq('id', assignTarget.id);
      if (error) throw error;
      toast.success(`Assigned to ${driver.name}`);
      setAssignTarget(null);
      void fetchAll();
    } catch {
      toast.error('Failed to assign driver');
    } finally {
      setAssigning(false);
    }
  }

  const Skeleton = ({ cls = '' }) => (
    <div className={`animate-pulse bg-gray-200 dark:bg-gray-700 rounded-xl ${cls}`} />
  );

  return (
    <MobileTransportHeadLayout>
      <div className="px-4 pt-4 pb-6 space-y-5">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-[#1A1A1A] dark:text-gray-100">Overview</h1>
          <p className="text-sm text-[#4A4A4A] dark:text-gray-400">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>

        {/* Alerts */}
        {alerts.length > 0 && (
          <div className="space-y-2">
            {alerts.map(a => (
              <div
                key={a.id}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${
                  a.type === 'unassigned'
                    ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                    : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
                }`}
              >
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {a.message}
              </div>
            ))}
          </div>
        )}

        {/* Stats 2×2 */}
        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {[0,1,2,3].map(i => <Skeleton key={i} cls="h-24" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Total Drivers',   value: stats.totalDrivers,     icon: Users,        color: 'text-blue-600 dark:text-blue-400',    bg: 'bg-blue-50 dark:bg-blue-900/20'    },
              { label: 'Available',        value: stats.availableDrivers, icon: UserCheck,    color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
              { label: 'Active Tasks',     value: stats.activeTasks,      icon: Car,          color: 'text-amber-600 dark:text-amber-400',  bg: 'bg-amber-50 dark:bg-amber-900/20'  },
              { label: 'Done Today',       value: stats.completedToday,   icon: CheckCircle2, color: 'text-[#2D5A45] dark:text-emerald-400', bg: 'bg-[#F5F0E8] dark:bg-gray-800'   },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className={`rounded-xl p-4 ${bg} border border-[#E8E3DB] dark:border-gray-700`}>
                <Icon className={`w-5 h-5 ${color} mb-2`} />
                <div className={`text-2xl font-bold ${color}`}>{value}</div>
                <div className="text-xs text-[#4A4A4A] dark:text-gray-400 mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Driver status list */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-[#1A1A1A] dark:text-gray-100">Driver Status</h2>
            <button onClick={fetchAll} className="p-1.5 rounded-lg active:bg-gray-100 dark:active:bg-gray-800">
              <RefreshCw className="w-4 h-4 text-[#4A4A4A] dark:text-gray-400" />
            </button>
          </div>
          {loading ? (
            <div className="space-y-2">
              {[0,1,2].map(i => <Skeleton key={i} cls="h-16" />)}
            </div>
          ) : drivers.length === 0 ? (
            <p className="text-sm text-center text-[#4A4A4A] dark:text-gray-500 py-6">No drivers in this department</p>
          ) : (
            <div className="space-y-2">
              {drivers.map(d => (
                <div
                  key={d.id}
                  className="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-xl px-4 py-3 border border-[#E8E3DB] dark:border-gray-700"
                >
                  <div className="w-9 h-9 rounded-full bg-[#D6E4D9] dark:bg-emerald-900/40 flex items-center justify-center text-sm font-semibold text-[#2D5A45] dark:text-emerald-400 shrink-0">
                    {d.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[#1A1A1A] dark:text-gray-100 truncate">{d.name}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${d.is_available ? 'bg-emerald-400' : 'bg-gray-400'}`} />
                      <span className="text-xs text-[#4A4A4A] dark:text-gray-400">
                        {d.is_available ? 'Available' : 'Off duty'}
                        {(d.active_tasks ?? 0) > 0 && ` · ${d.active_tasks} active`}
                      </span>
                    </div>
                  </div>
                  {d.vehicle_status === 'maintenance' && (
                    <span className="text-[10px] bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full font-medium">
                      In service
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Today's arrivals */}
        {arrivals.length > 0 && (
          <div>
            <h2 className="text-base font-semibold text-[#1A1A1A] dark:text-gray-100 mb-3">Today's Arrivals</h2>
            <div className="space-y-2">
              {arrivals.map(a => (
                <div
                  key={a.id}
                  className="bg-white dark:bg-gray-800 rounded-xl px-4 py-3 border border-[#E8E3DB] dark:border-gray-700"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-[#1A1A1A] dark:text-gray-100 truncate">{a.guest_name}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Clock className="w-3 h-3 text-[#4A4A4A] dark:text-gray-500" />
                        <span className="text-xs text-[#4A4A4A] dark:text-gray-400">
                          {a.flight_arrival_time ? new Date(a.flight_arrival_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'}
                          {a.pickup_location ? ` · ${a.pickup_location}` : ''}
                        </span>
                      </div>
                    </div>
                    {a.assigned_driver_name ? (
                      <span className="text-xs bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 px-2 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800 whitespace-nowrap">
                        {a.assigned_driver_name}
                      </span>
                    ) : (
                      <button
                        onClick={() => setAssignTarget(a)}
                        className="flex items-center gap-1 text-xs bg-[#2D5A45] text-white px-3 py-1.5 rounded-lg font-medium active:bg-[#234839] whitespace-nowrap"
                      >
                        <ClipboardList className="w-3 h-3" />
                        Assign
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Assign driver bottom sheet */}
      {assignTarget && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setAssignTarget(null)} />
          <div
            className="relative bg-white dark:bg-gray-900 rounded-t-2xl px-4 pt-4 pb-8 space-y-3"
            style={{ animation: 'slideUp 0.28s ease-out both' }}
          >
            <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600 mx-auto mb-2" />
            <h3 className="text-base font-semibold text-[#1A1A1A] dark:text-gray-100">
              Assign driver for <span className="text-[#2D5A45]">{assignTarget.guest_name}</span>
            </h3>
            {drivers4assign.length === 0 ? (
              <p className="text-sm text-center text-[#4A4A4A] dark:text-gray-500 py-4">No available drivers</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {drivers4assign.map(d => (
                  <button
                    key={d.id}
                    disabled={assigning}
                    onClick={() => handleAssign(d.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[#F5F0E8] dark:bg-gray-800 active:bg-[#E8E3DB] dark:active:bg-gray-700 border border-[#E8E3DB] dark:border-gray-700"
                  >
                    <div className="w-8 h-8 rounded-full bg-[#D6E4D9] dark:bg-emerald-900/40 flex items-center justify-center text-xs font-semibold text-[#2D5A45] dark:text-emerald-400 shrink-0">
                      {d.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-[#1A1A1A] dark:text-gray-100">{d.name}</span>
                    <ChevronRight className="w-4 h-4 text-[#4A4A4A] dark:text-gray-500 ml-auto" />
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setAssignTarget(null)}
              className="w-full py-3 rounded-xl text-sm font-medium text-[#4A4A4A] dark:text-gray-400 bg-gray-100 dark:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </MobileTransportHeadLayout>
  );
}
