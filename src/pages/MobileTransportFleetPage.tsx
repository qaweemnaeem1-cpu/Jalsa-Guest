import { useState, useEffect } from 'react';
import {
  Car, AlertTriangle, ChevronRight, X, CheckCircle2, Wrench,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import MobileTransportHeadLayout from '@/components/MobileTransportHeadLayout';
import { toast } from 'sonner';

interface VehicleDriver {
  id: string;
  name: string;
  vehicle_type?: string;
  vehicle_model?: string;
  vehicle_reg?: string;
  vehicle_capacity?: number;
  vehicle_status?: string;
  is_available: boolean;
  maintenance_alert?: 'overdue' | 'due' | null;
  next_maintenance_date?: string | null;
}

interface MaintenanceEntry {
  id: string;
  maintenance_type: string;
  maintenance_date: string;
  description?: string;
  cost?: number;
  next_due_date?: string | null;
}

const STATUS_OPTIONS = [
  { value: 'active',       label: 'Active',       color: 'text-emerald-600 dark:text-emerald-400' },
  { value: 'maintenance',  label: 'In Maintenance', color: 'text-red-600 dark:text-red-400'       },
  { value: 'inactive',     label: 'Inactive',     color: 'text-gray-500 dark:text-gray-400'       },
  { value: 'reserved',     label: 'Reserved',     color: 'text-blue-600 dark:text-blue-400'       },
];

function statusColor(s?: string) {
  if (s === 'maintenance') return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';
  if (s === 'inactive')    return 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400';
  if (s === 'reserved')    return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
  return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400';
}

function alertStatus(nextDue?: string | null): 'overdue' | 'due' | null {
  if (!nextDue) return null;
  const diff = Math.ceil((new Date(nextDue).getTime() - Date.now()) / 86400000);
  if (diff < 0) return 'overdue';
  if (diff <= 14) return 'due';
  return null;
}

export default function MobileTransportFleetPage() {
  const { user } = useAuth();
  const deptId = (user as { transportDepartmentId?: string })?.transportDepartmentId;

  const [vehicles, setVehicles] = useState<VehicleDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusSheet, setStatusSheet] = useState<VehicleDriver | null>(null);
  const [maintenanceSheet, setMaintenanceSheet] = useState<{ driver: VehicleDriver; entries: MaintenanceEntry[] } | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  async function fetchAll() {
    if (!deptId) return;
    setLoading(true);
    try {
      const { data: driverData } = await supabase
        .from('users')
        .select('id,name,vehicle_type,vehicle_model,vehicle_reg,vehicle_capacity,vehicle_status,is_available')
        .eq('transport_department_id', deptId)
        .eq('role', 'driver')
        .eq('is_head_driver', false);

      const driverList = (driverData ?? []) as VehicleDriver[];

      // Fetch latest maintenance entry per driver
      const enriched = await Promise.all(
        driverList.map(async (d) => {
          const { data: mData } = await supabase
            .from('vehicle_maintenance')
            .select('next_due_date')
            .eq('driver_id', d.id)
            .order('maintenance_date', { ascending: false })
            .limit(1);
          const nextDue = (mData?.[0] as { next_due_date?: string | null })?.next_due_date ?? null;
          return { ...d, next_maintenance_date: nextDue, maintenance_alert: alertStatus(nextDue) };
        })
      );

      setVehicles(enriched);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void fetchAll(); }, [deptId]);

  async function handleStatusChange(driverId: string, newStatus: string) {
    setUpdatingStatus(true);
    try {
      const { error } = await supabase.from('users').update({ vehicle_status: newStatus }).eq('id', driverId);
      if (error) throw error;
      toast.success('Status updated');
      setStatusSheet(null);
      void fetchAll();
    } catch {
      toast.error('Failed to update status');
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function openMaintenance(driver: VehicleDriver) {
    const { data } = await supabase
      .from('vehicle_maintenance')
      .select('id,maintenance_type,maintenance_date,description,cost,next_due_date')
      .eq('driver_id', driver.id)
      .order('maintenance_date', { ascending: false });
    setMaintenanceSheet({ driver, entries: (data ?? []) as MaintenanceEntry[] });
  }

  const alerts = vehicles.filter(v => v.maintenance_alert);
  const Skeleton = ({ cls = '' }) => (
    <div className={`animate-pulse bg-gray-200 dark:bg-gray-700 rounded-xl ${cls}`} />
  );

  return (
    <MobileTransportHeadLayout>
      <div className="px-4 pt-4 pb-6 space-y-4">

        {/* Header */}
        <h1 className="text-xl font-bold text-[#1A1A1A] dark:text-gray-100">Fleet</h1>

        {/* Maintenance alerts */}
        {alerts.length > 0 && (
          <div className="space-y-2">
            {alerts.map(v => (
              <div
                key={v.id}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium border ${
                  v.maintenance_alert === 'overdue'
                    ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800'
                    : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                }`}
              >
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  {v.name}'s vehicle — maintenance {v.maintenance_alert === 'overdue' ? 'overdue' : 'due soon'}
                  {v.next_maintenance_date ? ` (${v.next_maintenance_date})` : ''}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Fleet list */}
        {loading ? (
          <div className="space-y-3">
            {[0,1,2].map(i => <Skeleton key={i} cls="h-28" />)}
          </div>
        ) : vehicles.length === 0 ? (
          <div className="text-center py-12 text-[#4A4A4A] dark:text-gray-500 text-sm">
            No drivers with vehicle info found
          </div>
        ) : (
          <div className="space-y-3">
            {vehicles.map(v => (
              <div
                key={v.id}
                className="bg-white dark:bg-gray-800 rounded-xl border border-[#E8E3DB] dark:border-gray-700 px-4 py-4"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <Car className="w-5 h-5 text-[#2D5A45] dark:text-emerald-400" />
                    <div>
                      <div className="text-sm font-semibold text-[#1A1A1A] dark:text-gray-100">{v.name}</div>
                      <div className="text-xs text-[#4A4A4A] dark:text-gray-400 mt-0.5">
                        {v.vehicle_type ?? '—'} · {v.vehicle_model ?? '—'} · {v.vehicle_reg ?? 'No reg'}
                      </div>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor(v.vehicle_status)}`}>
                    {v.vehicle_status ?? 'active'}
                  </span>
                </div>

                {v.vehicle_capacity && (
                  <div className="text-xs text-[#4A4A4A] dark:text-gray-400 mb-3">
                    Capacity: {v.vehicle_capacity} passengers
                  </div>
                )}

                {v.maintenance_alert && (
                  <div className={`flex items-center gap-1.5 text-xs font-medium mb-3 ${
                    v.maintenance_alert === 'overdue' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
                  }`}>
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Maintenance {v.maintenance_alert === 'overdue' ? 'overdue' : 'due'}: {v.next_maintenance_date}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setStatusSheet(v)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#F5F0E8] dark:bg-gray-700 text-xs font-medium text-[#2D5A45] dark:text-emerald-400 active:bg-[#E8E3DB] dark:active:bg-gray-600"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    Status
                  </button>
                  <button
                    onClick={() => openMaintenance(v)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#F5F0E8] dark:bg-gray-700 text-xs font-medium text-[#2D5A45] dark:text-emerald-400 active:bg-[#E8E3DB] dark:active:bg-gray-600"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                    History
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Status change bottom sheet */}
      {statusSheet && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setStatusSheet(null)} />
          <div
            className="relative bg-white dark:bg-gray-900 rounded-t-2xl px-4 pt-4 pb-8 space-y-3"
            style={{ animation: 'slideUp 0.28s ease-out both' }}
          >
            <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600 mx-auto mb-1" />
            <h3 className="text-base font-semibold text-[#1A1A1A] dark:text-gray-100">
              Set Status — <span className="text-[#2D5A45]">{statusSheet.name}</span>
            </h3>
            <div className="space-y-2">
              {STATUS_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  disabled={updatingStatus}
                  onClick={() => handleStatusChange(statusSheet.id, opt.value)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border border-[#E8E3DB] dark:border-gray-700 bg-[#F5F0E8] dark:bg-gray-800 active:bg-[#E8E3DB] dark:active:bg-gray-700 ${statusSheet.vehicle_status === opt.value ? 'ring-2 ring-[#2D5A45]' : ''}`}
                >
                  <span className={`text-sm font-medium ${opt.color}`}>{opt.label}</span>
                  {statusSheet.vehicle_status === opt.value && <CheckCircle2 className="w-4 h-4 text-[#2D5A45] dark:text-emerald-400" />}
                </button>
              ))}
            </div>
            <button
              onClick={() => setStatusSheet(null)}
              className="w-full py-3 rounded-xl text-sm font-medium text-[#4A4A4A] dark:text-gray-400 bg-gray-100 dark:bg-gray-800 active:bg-gray-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Maintenance history bottom sheet */}
      {maintenanceSheet && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMaintenanceSheet(null)} />
          <div
            className="relative bg-white dark:bg-gray-900 rounded-t-2xl px-4 pt-4 pb-8"
            style={{ animation: 'slideUp 0.28s ease-out both', maxHeight: '75vh' }}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-[#1A1A1A] dark:text-gray-100">
                {maintenanceSheet.driver.name} — Maintenance Log
              </h3>
              <button onClick={() => setMaintenanceSheet(null)}>
                <X className="w-5 h-5 text-[#4A4A4A] dark:text-gray-400" />
              </button>
            </div>
            <div className="overflow-y-auto space-y-2" style={{ maxHeight: 'calc(75vh - 80px)' }}>
              {maintenanceSheet.entries.length === 0 ? (
                <p className="text-sm text-center text-[#4A4A4A] dark:text-gray-500 py-6">No maintenance records</p>
              ) : (
                maintenanceSheet.entries.map(e => (
                  <div
                    key={e.id}
                    className="bg-[#F5F0E8] dark:bg-gray-800 rounded-xl px-4 py-3 border border-[#E8E3DB] dark:border-gray-700"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-[#1A1A1A] dark:text-gray-100 capitalize">
                        {e.maintenance_type.replace(/_/g, ' ')}
                      </span>
                      <span className="text-xs text-[#4A4A4A] dark:text-gray-400">{e.maintenance_date}</span>
                    </div>
                    {e.description && <p className="text-xs text-[#4A4A4A] dark:text-gray-400">{e.description}</p>}
                    <div className="flex items-center gap-3 mt-1 text-xs text-[#4A4A4A] dark:text-gray-500">
                      {e.cost != null && <span>£{e.cost.toFixed(2)}</span>}
                      {e.next_due_date && <span>Next: {e.next_due_date}</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </MobileTransportHeadLayout>
  );
}
