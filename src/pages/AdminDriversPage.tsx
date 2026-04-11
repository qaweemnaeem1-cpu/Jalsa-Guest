/**
 * /admin/drivers — all drivers across the system (Super Admin view).
 * Sub-tabs: Drivers | Tasks | Suggestions
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Eye, Pencil, Trash2, Car, Users, CheckCircle2, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { SUPER_ADMIN_NAV } from '@/lib/navItems';
import { Button } from '@/components/ui/button';
import { DriverFormDialog, type DriverRecord } from '@/components/DriverFormDialog';
import { DriverTaskViewDialog } from '@/components/DriverTaskViewDialog';
import { CreateTaskDialog, type DriverInfo } from '@/components/CreateTaskDialog';

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
  guest_name?: string;
  pickup_location?: string;
  dropoff_location?: string;
  passenger_count?: number;
  location?: string;
  department?: string;
}

type Tab = 'drivers' | 'tasks' | 'suggestions';

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

export default function AdminDriversPage() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const { pathname } = useLocation();

  const [tab, setTab]           = useState<Tab>('drivers');
  const [drivers, setDrivers]   = useState<DriverRow[]>([]);
  const [tasks, setTasks]       = useState<TaskRow[]>([]);
  const [loading, setLoading]   = useState(true);

  // filters
  const [deptFilter, setDeptFilter]   = useState('');
  const [locFilter, setLocFilter]     = useState('');
  const [statFilter, setStatFilter]   = useState('');
  const [taskStatus, setTaskStatus]   = useState('');

  // dialogs
  const [formOpen, setFormOpen]         = useState(false);
  const [editDriver, setEditDriver]     = useState<DriverRecord | null>(null);
  const [viewDriver, setViewDriver]     = useState<DriverRecord | null>(null);
  const [assignDriver, setAssignDriver] = useState<DriverRecord | null>(null);
  const [deleteId, setDeleteId]         = useState<string | null>(null);

  const loadedRef = useRef(false);

  const fetchAll = useCallback(async () => {
    const today = new Date().toISOString().substring(0, 10);

    const [driversRes, tasksRes] = await Promise.all([
      supabase.from('users').select('id,name,email,phone,location,department,vehicle_type,vehicle_model,vehicle_registration,vehicle_capacity,is_head_driver,is_available').eq('role', 'driver'),
      supabase.from('driver_tasks').select('id,driver_id,driver_name,task_type,status,is_suggestion,scheduled_date,scheduled_time,guest_name,pickup_location,dropoff_location,passenger_count,location,department').gte('scheduled_date', today).order('scheduled_date', { ascending: true }).order('scheduled_time', { ascending: true }).limit(200),
    ]);

    const countMap: Record<string, number> = {};
    for (const t of (tasksRes.data ?? []) as TaskRow[]) {
      if (t.scheduled_date === today && t.status !== 'cancelled' && t.status !== 'suggested') {
        countMap[t.driver_id] = (countMap[t.driver_id] ?? 0) + 1;
      }
    }

    setDrivers((driversRes.data ?? []).map(d => ({ ...d, tasksToday: countMap[d.id] ?? 0 })) as DriverRow[]);
    setTasks((tasksRes.data ?? []) as TaskRow[]);
    setLoading(false);
  }, []);

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
        const next = [...prev]; next[idx] = { ...next[idx], ...saved }; return next;
      }
      return [{ ...saved, tasksToday: 0 }, ...prev];
    });
  };

  const depts = [...new Set(drivers.map(d => d.department).filter(Boolean))] as string[];
  const locs  = [...new Set(drivers.map(d => d.location).filter(Boolean))] as string[];

  const filteredDrivers = drivers.filter(d => {
    if (deptFilter && d.department !== deptFilter) return false;
    if (locFilter && d.location !== locFilter) return false;
    if (statFilter === 'available' && !d.is_available) return false;
    if (statFilter === 'off_duty' && d.is_available) return false;
    return true;
  });

  const activeTasks      = tasks.filter(t => !t.is_suggestion && t.status !== 'cancelled');
  const suggestionTasks  = tasks.filter(t => t.is_suggestion && t.status === 'suggested');

  const filteredTasks = (taskStatus ? activeTasks.filter(t => t.status === taskStatus) : activeTasks);
  const filteredSuggestions = suggestionTasks;

  const driverInfos: DriverInfo[] = filteredDrivers.map(d => ({
    id: d.id, name: d.name, vehicle_type: d.vehicle_type, vehicle_model: d.vehicle_model,
    vehicle_capacity: d.vehicle_capacity, is_available: d.is_available, location: d.location,
  }));

  const total     = filteredDrivers.length;
  const available = filteredDrivers.filter(d => d.is_available).length;
  const onDuty    = filteredDrivers.filter(d => d.tasksToday > 0).length;

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

      <main className="flex-1 ml-64 p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#1A1A1A]">Drivers</h1>
            <p className="text-sm text-[#4A4A4A] mt-0.5">All transport drivers across all locations</p>
          </div>
          <Button onClick={() => { setEditDriver(null); setFormOpen(true); }}
            className="bg-[#2D5A45] hover:bg-[#234839] text-white gap-2">
            <Plus className="w-4 h-4" /> Add Driver
          </Button>
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
              {t === 'suggestions' && filteredSuggestions.length > 0 && (
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center ${tab === 'suggestions' ? 'bg-white/30' : 'bg-blue-100 text-blue-700'}`}>
                  {filteredSuggestions.length}
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
                            {d.is_head_driver && <span className="mr-1 text-amber-600 font-medium">★ Head</span>}
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E3DB]">
                    {filteredTasks.map(t => (
                      <tr key={t.id} className="hover:bg-[#F5F0E8]/50">
                        <td className="px-4 py-3 font-medium text-[#1A1A1A]">{TYPE_LABELS[t.task_type] ?? t.task_type}</td>
                        <td className="px-4 py-3 text-[#4A4A4A]">{t.driver_name ?? '—'}</td>
                        <td className="px-4 py-3 text-[#4A4A4A]">{t.guest_name ?? '—'}</td>
                        <td className="px-4 py-3 text-[#4A4A4A]">{t.scheduled_date}{t.scheduled_time && ` · ${t.scheduled_time}`}</td>
                        <td className="px-4 py-3 text-[#4A4A4A] text-xs">{t.pickup_location} → {t.dropoff_location}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[t.status] ?? 'bg-gray-100 text-gray-600'}`}>
                            {t.status}
                          </span>
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
            {filteredSuggestions.length === 0 ? (
              <div className="p-8 text-center text-[#4A4A4A] text-sm">No unassigned suggestions.</div>
            ) : (
              <div className="divide-y divide-[#E8E3DB]">
                {filteredSuggestions.map(t => (
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
      </main>

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
      </div>
    </div>
  );
}
