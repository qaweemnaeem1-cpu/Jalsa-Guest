/**
 * /location/drivers — drivers at this location (Location Manager view).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Eye, Pencil, Trash2, Car, Users, CheckCircle2, FileText, MessageCircle, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { LocationSidebar } from '@/components/LocationSidebar';
import { Button } from '@/components/ui/button';
import { DriverFormDialog, type DriverRecord } from '@/components/DriverFormDialog';
import { DriverTaskViewDialog } from '@/components/DriverTaskViewDialog';
import { CreateTaskDialog, type DriverInfo } from '@/components/CreateTaskDialog';
import { DailyReportDialog } from '@/components/DailyReportDialog';
import { DriverMessagesDialog } from '@/components/DriverMessagesDialog';
import { AddMaintenanceDialog, ViewMaintenanceLogDialog } from '@/components/VehicleMaintenanceDialog';

interface DriverRow extends DriverRecord {
  tasksToday: number;
}

export default function LocationDriversPage() {
  const { user } = useAuth();
  const location = user?.location ?? '';

  const [drivers, setDrivers]     = useState<DriverRow[]>([]);
  const [loading, setLoading]     = useState(true);

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

  // suggestions
  interface SuggestedTask { id: string; task_type: string; scheduled_date: string; scheduled_time?: string; guest_name?: string; pickup_location?: string; dropoff_location?: string; passenger_count?: number; }
  const [suggestions, setSuggestions] = useState<SuggestedTask[]>([]);

  const loadedRef = useRef(false);

  const fetchAll = useCallback(async () => {
    if (!location) return;
    const today = new Date().toISOString().substring(0, 10);

    const [driversRes, tasksRes, suggestionsRes] = await Promise.all([
      supabase.from('users').select('id,name,email,phone,location,department,vehicle_type,vehicle_model,vehicle_registration,vehicle_capacity,is_head_driver,is_available').eq('role', 'driver').eq('location', location),
      supabase.from('driver_tasks').select('driver_id').eq('scheduled_date', today).neq('status', 'cancelled').neq('status', 'suggested'),
      supabase.from('driver_tasks').select('id,task_type,scheduled_date,scheduled_time,guest_name,pickup_location,dropoff_location,passenger_count').eq('location', location).eq('is_suggestion', true).eq('status', 'suggested'),
    ]);

    const countMap: Record<string, number> = {};
    for (const t of tasksRes.data ?? []) {
      countMap[t.driver_id] = (countMap[t.driver_id] ?? 0) + 1;
    }

    setDrivers((driversRes.data ?? []).map(d => ({ ...d, tasksToday: countMap[d.id] ?? 0 })) as DriverRow[]);
    setSuggestions((suggestionsRes.data ?? []) as SuggestedTask[]);
    setLoading(false);
  }, [location]);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    fetchAll();
  }, [fetchAll]);

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

  return (
    <div className="flex min-h-screen bg-[#F5F0E8]">
      <LocationSidebar />
      <main className="ml-64 flex-1 p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#1A1A1A]">Drivers</h1>
            <p className="text-sm text-[#4A4A4A] mt-0.5">{location} · manage transport team</p>
          </div>
          <div className="flex items-center gap-2">
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
      </main>

      {/* Dialogs */}
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
    </div>
  );
}
