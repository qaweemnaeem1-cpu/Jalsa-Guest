/**
 * /driver/vehicles — fleet overview for Head Drivers.
 * Shows all vehicles at this location with maintenance status.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Car, Loader2, Wrench, Plus, Eye, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { DriverSidebar } from '@/components/DriverSidebar';
import { TopBar } from '@/components/TopBar';
import { supabase } from '@/lib/supabase';
import {
  AddMaintenanceDialog, ViewMaintenanceLogDialog,
  type MaintenanceEntry, MAINT_TYPE_META, computeStatus,
} from '@/components/VehicleMaintenanceDialog';

// ── types ─────────────────────────────────────────────────────────────────────

interface DriverRow {
  id: string;
  name: string;
  phone?: string;
  vehicle_type?: string;
  vehicle_model?: string;
  vehicle_registration?: string;
  vehicle_capacity?: number;
  is_available?: boolean;
}

interface VehicleRow extends DriverRow {
  latestMileage?: number;       // from most recent completed task with end_mileage
  lastMaintDate?: string;       // date of most recent maint entry (non-fuel/wash)
  nextDueDate?: string;         // earliest next_due_date across all entries
  nextDueMileage?: number;
  maintStatus?: 'ok' | 'due_soon' | 'overdue';
  lastMaintType?: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function maintStatusLabel(status?: VehicleRow['maintStatus']) {
  if (status === 'overdue')  return { label: 'OVERDUE',  cls: 'bg-red-100 text-red-700' };
  if (status === 'due_soon') return { label: 'Due Soon',  cls: 'bg-amber-100 text-amber-700' };
  return { label: 'OK', cls: 'bg-green-100 text-green-700' };
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function DriverVehiclesPage() {
  const { user } = useAuth();
  const location = user?.location ?? '';

  const [vehicles, setVehicles]     = useState<VehicleRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [viewDriver, setViewDriver] = useState<VehicleRow | null>(null);
  const [addDriver, setAddDriver]   = useState<VehicleRow | null>(null);
  const loadedRef                   = useRef(false);

  const fetchAll = useCallback(async () => {
    if (!location) return;

    // 1. All drivers at this location
    const { data: driversData } = await supabase
      .from('users')
      .select('id,name,phone,vehicle_type,vehicle_model,vehicle_registration,vehicle_capacity,is_available')
      .eq('role', 'driver')
      .eq('location', location)
      .order('name');

    const drivers = (driversData ?? []) as DriverRow[];
    if (drivers.length === 0) { setVehicles([]); setLoading(false); return; }

    const driverIds = drivers.map(d => d.id);

    // 2. Latest mileage from completed tasks + maintenance entries
    const [tasksRes, maintRes] = await Promise.all([
      supabase
        .from('driver_tasks')
        .select('driver_id,end_mileage,completed_at')
        .in('driver_id', driverIds)
        .eq('status', 'completed')
        .not('end_mileage', 'is', null)
        .order('completed_at', { ascending: false }),
      supabase
        .from('vehicle_maintenance')
        .select('*')
        .in('driver_id', driverIds)
        .order('date', { ascending: false }),
    ]);

    const allTasks = (tasksRes.data ?? []) as { driver_id: string; end_mileage: number; completed_at: string }[];
    const allMaint = (maintRes.data ?? []) as MaintenanceEntry[];

    // Latest mileage per driver
    const latestMileageMap: Record<string, number> = {};
    for (const t of allTasks) {
      if (!(t.driver_id in latestMileageMap)) {
        latestMileageMap[t.driver_id] = t.end_mileage;
      }
    }

    // Maintenance stats per driver
    const maintMap: Record<string, MaintenanceEntry[]> = {};
    for (const m of allMaint) {
      if (!maintMap[m.driver_id]) maintMap[m.driver_id] = [];
      maintMap[m.driver_id].push(m);
    }

    const today = new Date(); today.setHours(0, 0, 0, 0);

    const rows: VehicleRow[] = drivers.map(d => {
      const maint = maintMap[d.id] ?? [];
      const latestMileage = latestMileageMap[d.id];

      // Last service (exclude fuel/wash)
      const serviceEntry = maint.find(m => m.type !== 'fuel' && m.type !== 'wash_clean');

      // Find most urgent next due
      let nextDueDate: string | undefined;
      let nextDueMileage: number | undefined;
      let maintStatus: VehicleRow['maintStatus'] = 'ok';

      for (const m of maint) {
        if (!m.next_due_date && !m.next_due_mileage) continue;
        const s = computeStatus(m);
        if (s === 'overdue') { maintStatus = 'overdue'; }
        else if (s === 'scheduled' && maintStatus !== 'overdue') { maintStatus = 'due_soon'; }

        if (m.next_due_date && (!nextDueDate || m.next_due_date < nextDueDate)) {
          nextDueDate = m.next_due_date;
        }
        if (m.next_due_mileage != null && (!nextDueMileage || m.next_due_mileage < nextDueMileage)) {
          nextDueMileage = m.next_due_mileage;
        }
      }

      return {
        ...d,
        latestMileage,
        lastMaintDate: serviceEntry?.date,
        lastMaintType: serviceEntry?.type,
        nextDueDate,
        nextDueMileage,
        maintStatus,
      };
    });

    setVehicles(rows);
    setLoading(false);
  }, [location]);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    fetchAll();
  }, [fetchAll]);

  const total    = vehicles.length;
  const overdue  = vehicles.filter(v => v.maintStatus === 'overdue').length;
  const dueSoon  = vehicles.filter(v => v.maintStatus === 'due_soon').length;

  return (
    <div className="flex min-h-screen bg-[#F5F0E8]">
      <DriverSidebar />

      <main className="ml-64 flex-1">
        <TopBar />
        <div className="p-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#1A1A1A] flex items-center gap-2">
            <Car className="w-6 h-6 text-[#2D5A45]" /> Vehicles
            {location && <span className="text-base font-normal text-[#4A4A4A]">— {location}</span>}
          </h1>
          <p className="text-sm text-[#4A4A4A] mt-0.5">Fleet overview and maintenance status for your location</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Total Vehicles', value: total,   color: 'bg-blue-50 text-blue-700',   icon: Car },
            { label: 'Overdue Maint.', value: overdue, color: 'bg-red-50 text-red-700',     icon: AlertTriangle },
            { label: 'Due Soon',       value: dueSoon, color: 'bg-amber-50 text-amber-700', icon: Wrench },
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

        {/* Fleet table */}
        <div className="bg-white rounded-xl border border-[#E8E3DB]">
          <div className="p-4 border-b border-[#E8E3DB]">
            <h2 className="font-semibold text-[#1A1A1A]">Fleet Roster</h2>
          </div>

          {loading ? (
            <div className="p-8 text-center text-[#4A4A4A] text-sm flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : vehicles.length === 0 ? (
            <div className="p-8 text-center text-[#4A4A4A] text-sm">No drivers at this location.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E8E3DB] bg-[#F5F0E8]">
                    <th className="px-4 py-3 text-left font-medium text-[#4A4A4A]">Driver</th>
                    <th className="px-4 py-3 text-left font-medium text-[#4A4A4A]">Vehicle</th>
                    <th className="px-4 py-3 text-left font-medium text-[#4A4A4A]">Registration</th>
                    <th className="px-4 py-3 text-left font-medium text-[#4A4A4A]">Capacity</th>
                    <th className="px-4 py-3 text-left font-medium text-[#4A4A4A]">Est. Mileage</th>
                    <th className="px-4 py-3 text-left font-medium text-[#4A4A4A]">Last Service</th>
                    <th className="px-4 py-3 text-left font-medium text-[#4A4A4A]">Next Due</th>
                    <th className="px-4 py-3 text-left font-medium text-[#4A4A4A]">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-[#4A4A4A]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E3DB]">
                  {vehicles.map(v => {
                    const ms = maintStatusLabel(v.maintStatus);
                    const nextDue = [
                      v.nextDueDate    ? fmtDate(v.nextDueDate) : '',
                      v.nextDueMileage ? `${v.nextDueMileage.toLocaleString()} km` : '',
                    ].filter(Boolean).join(' / ');
                    const lastMaintLabel = v.lastMaintDate
                      ? `${fmtDate(v.lastMaintDate)}${v.lastMaintType ? ` · ${MAINT_TYPE_META[v.lastMaintType as keyof typeof MAINT_TYPE_META]?.label ?? v.lastMaintType}` : ''}`
                      : '—';
                    return (
                      <tr key={v.id} className="hover:bg-[#F5F0E8]/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-[#1A1A1A]">{v.name}</div>
                          {v.phone && <div className="text-xs text-[#4A4A4A]">{v.phone}</div>}
                        </td>
                        <td className="px-4 py-3 text-[#4A4A4A]">
                          {v.vehicle_type && v.vehicle_model
                            ? `${v.vehicle_type} · ${v.vehicle_model}`
                            : (v.vehicle_type ?? v.vehicle_model ?? '—')}
                        </td>
                        <td className="px-4 py-3 text-[#4A4A4A] font-mono text-xs">
                          {v.vehicle_registration ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-[#4A4A4A]">
                          {v.vehicle_capacity != null ? `${v.vehicle_capacity} pax` : '—'}
                        </td>
                        <td className="px-4 py-3 text-[#4A4A4A]">
                          {v.latestMileage != null ? `${v.latestMileage.toLocaleString()} km` : '—'}
                        </td>
                        <td className="px-4 py-3 text-[#4A4A4A] text-xs whitespace-nowrap">{lastMaintLabel}</td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap">
                          {nextDue ? (
                            <span className={`font-medium ${v.maintStatus === 'overdue' ? 'text-red-700' : v.maintStatus === 'due_soon' ? 'text-amber-700' : 'text-[#4A4A4A]'}`}>
                              {nextDue}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ms.cls}`}>{ms.label}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => setViewDriver(v)} title="View Maintenance Log"
                              className="p-1.5 rounded-lg text-[#4A4A4A] hover:bg-[#F5F0E8] hover:text-[#2D5A45] transition-colors">
                              <Eye className="w-4 h-4" />
                            </button>
                            <button onClick={() => setAddDriver(v)} title="Add Maintenance Entry"
                              className="p-1.5 rounded-lg text-[#4A4A4A] hover:bg-[#F5F0E8] hover:text-[#2D5A45] transition-colors">
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </div>{/* /p-8 */}
      </main>

      {/* View log dialog */}
      {viewDriver && (
        <ViewMaintenanceLogDialog
          open={!!viewDriver}
          onClose={() => setViewDriver(null)}
          driverId={viewDriver.id}
          driverName={viewDriver.name}
          vehicleRegistration={viewDriver.vehicle_registration}
          onAddEntry={() => { setAddDriver(viewDriver); setViewDriver(null); }}
        />
      )}

      {/* Add entry dialog */}
      {addDriver && (
        <AddMaintenanceDialog
          open={!!addDriver}
          onClose={() => setAddDriver(null)}
          driverId={addDriver.id}
          vehicleRegistration={addDriver.vehicle_registration}
          onSaved={() => { setAddDriver(null); loadedRef.current = false; fetchAll(); }}
        />
      )}
    </div>
  );
}
