/**
 * /dept/drivers — drivers across all locations in this department (Department Head view).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Eye, Pencil, Car, Users, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { DeptSidebar } from '@/components/DeptSidebar';
import { Button } from '@/components/ui/button';
import { DriverFormDialog, type DriverRecord } from '@/components/DriverFormDialog';
import { DriverTaskViewDialog } from '@/components/DriverTaskViewDialog';
import { CreateTaskDialog, type DriverInfo } from '@/components/CreateTaskDialog';

interface DriverRow extends DriverRecord {
  tasksToday: number;
}

export default function DeptDriversPage() {
  const { user } = useAuth();
  const dept = user?.department ?? '';

  const [drivers, setDrivers]       = useState<DriverRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [locationFilter, setLocFil] = useState('');

  const [formOpen, setFormOpen]         = useState(false);
  const [editDriver, setEditDriver]     = useState<DriverRecord | null>(null);
  const [viewDriver, setViewDriver]     = useState<DriverRecord | null>(null);
  const [assignDriver, setAssignDriver] = useState<DriverRecord | null>(null);

  const loadedRef = useRef(false);

  const fetchAll = useCallback(async () => {
    if (!dept) return;
    const today = new Date().toISOString().substring(0, 10);

    const [driversRes, tasksRes] = await Promise.all([
      supabase.from('users').select('id,name,email,phone,location,department,vehicle_type,vehicle_model,vehicle_registration,vehicle_capacity,is_head_driver,is_available').eq('role', 'driver').eq('department', dept),
      supabase.from('driver_tasks').select('driver_id').eq('scheduled_date', today).neq('status', 'cancelled').neq('status', 'suggested'),
    ]);

    const countMap: Record<string, number> = {};
    for (const t of tasksRes.data ?? []) {
      countMap[t.driver_id] = (countMap[t.driver_id] ?? 0) + 1;
    }

    setDrivers((driversRes.data ?? []).map(d => ({ ...d, tasksToday: countMap[d.id] ?? 0 })) as DriverRow[]);
    setLoading(false);
  }, [dept]);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    fetchAll();
  }, [fetchAll]);

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

  const locations = [...new Set(drivers.map(d => d.location).filter(Boolean))] as string[];
  const filtered = locationFilter ? drivers.filter(d => d.location === locationFilter) : drivers;

  const total     = filtered.length;
  const available = filtered.filter(d => d.is_available).length;
  const onDuty    = filtered.filter(d => d.tasksToday > 0).length;

  const driverInfos: DriverInfo[] = filtered.map(d => ({
    id: d.id, name: d.name, vehicle_type: d.vehicle_type, vehicle_model: d.vehicle_model,
    vehicle_capacity: d.vehicle_capacity, is_available: d.is_available, location: d.location,
  }));

  return (
    <div className="flex min-h-screen bg-[#F5F0E8]">
      <DeptSidebar />
      <main className="ml-64 flex-1 p-8">
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

        {/* Table */}
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
                          {d.is_head_driver && <span className="mr-1 text-amber-600 font-medium">★ Head</span>}
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
      </main>

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
    </div>
  );
}
