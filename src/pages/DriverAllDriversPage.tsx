import { useCallback, useEffect, useRef, useState } from 'react';
import { Star, Loader2, Eye, ClipboardList, Pencil, MessageCircle, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { DriverSidebar } from '@/components/DriverSidebar';
import { supabase } from '@/lib/supabase';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { DriverTask } from '@/types';
import { DriverMessagesDialog } from '@/components/DriverMessagesDialog';
import { AddMaintenanceDialog, ViewMaintenanceLogDialog } from '@/components/VehicleMaintenanceDialog';
import { TopBar } from '@/components/TopBar';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DriverRow {
  id: string;
  name: string;
  email: string;
  phone?: string;
  vehicle_type?: string;
  vehicle_model?: string;
  vehicle_registration?: string;
  vehicle_capacity?: number;
  is_available?: boolean;
  is_head_driver?: boolean;
  location?: string;
  department?: string;
  todayTaskCount?: number;
}

type AvailStatus = 'available' | 'off_duty' | 'unknown';

function availStatus(d: DriverRow): AvailStatus {
  if (d.is_available === true) return 'available';
  if (d.is_available === false) return 'off_duty';
  return 'unknown';
}

const STATUS_META: Record<AvailStatus, { label: string; dot: string; badge: string }> = {
  available: { label: 'Available', dot: 'bg-green-500', badge: 'bg-green-100 text-green-700' },
  off_duty:  { label: 'Off Duty',  dot: 'bg-red-500',   badge: 'bg-red-100 text-red-700' },
  unknown:   { label: 'Unknown',   dot: 'bg-gray-400',  badge: 'bg-gray-100 text-gray-600' },
};

function todayStr() { return new Date().toISOString().split('T')[0]; }

// ── Driver Tasks popup ────────────────────────────────────────────────────────

function DriverTasksDialog({ driver, onClose }: { driver: DriverRow | null; onClose: () => void }) {
  const [tasks, setTasks]     = useState<DriverTask[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!driver) return;
    setLoading(true);
    const today = todayStr();
    supabase
      .from('driver_tasks')
      .select('*')
      .eq('driver_id', driver.id)
      .gte('scheduled_date', today)
      .not('status', 'in', '("cancelled")')
      .order('scheduled_date').order('scheduled_time')
      .then(({ data }) => {
        setTasks((data as DriverTask[]) ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [driver]);

  const TYPE_LABEL: Record<string, string> = {
    airport_pickup:    'Pickup',
    airport_dropoff:   'Drop-off',
    mulaqat_transport: 'Mulaqat',
    other:             'Other',
  };
  const STATUS_CLS: Record<string, string> = {
    suggested:   'bg-gray-100 text-gray-600',
    pending:     'bg-amber-100 text-amber-700',
    in_progress: 'bg-blue-100 text-blue-700',
    completed:   'bg-green-100 text-green-700',
  };

  return (
    <Dialog open={!!driver} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{driver?.name} — Upcoming Tasks</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-10 text-[#4A4A4A]">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
          </div>
        ) : tasks.length === 0 ? (
          <p className="text-center py-8 text-sm text-[#4A4A4A]">No upcoming tasks.</p>
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-[#E8E3DB]">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Date</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Time</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Type</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Guest</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Route</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E3DB]">
                {tasks.map(t => (
                  <tr key={t.id} className="hover:bg-[#F5F0E8]/50">
                    <td className="px-3 py-2 whitespace-nowrap">{new Date(t.scheduled_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-[#4A4A4A]">{t.scheduled_time ?? '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
                        {TYPE_LABEL[t.task_type] ?? t.task_type}
                      </span>
                    </td>
                    <td className="px-3 py-2 max-w-[120px] truncate">{t.guest_name ?? t.delegation_name ?? '—'}</td>
                    <td className="px-3 py-2 text-[#4A4A4A] text-xs whitespace-nowrap">
                      {t.pickup_location && t.dropoff_location ? `${t.pickup_location} → ${t.dropoff_location}` : '—'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${STATUS_CLS[t.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {t.status.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Vehicle Dialog ───────────────────────────────────────────────────────

const VEHICLE_TYPES = ['Car', 'Van', 'Minibus', 'Bus'];

function EditVehicleDialog({ driver, onClose, onSaved }: {
  driver: DriverRow | null;
  onClose: () => void;
  onSaved: (id: string, updates: Partial<DriverRow>) => void;
}) {
  const [type, setType]   = useState('');
  const [model, setModel] = useState('');
  const [reg, setReg]     = useState('');
  const [cap, setCap]     = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (driver) {
      setType(driver.vehicle_type ?? '');
      setModel(driver.vehicle_model ?? '');
      setReg(driver.vehicle_registration ?? '');
      setCap(String(driver.vehicle_capacity ?? ''));
    }
  }, [driver]);

  const handleSave = async () => {
    if (!driver) return;
    setSaving(true);
    try {
      const updates = {
        vehicle_type: type || null,
        vehicle_model: model || null,
        vehicle_registration: reg || null,
        vehicle_capacity: cap ? Number(cap) : null,
      };
      const { error } = await supabase.from('users').update(updates).eq('id', driver.id);
      if (error) throw error;
      onSaved(driver.id, {
        vehicle_type: type || undefined,
        vehicle_model: model || undefined,
        vehicle_registration: reg || undefined,
        vehicle_capacity: cap ? Number(cap) : undefined,
      });
      toast.success(`${driver.name}'s vehicle details updated`);
      onClose();
    } catch {
      toast.error('Failed to update vehicle details');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!driver} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Vehicle — {driver?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Vehicle Type</Label>
            <select
              value={type}
              onChange={e => setType(e.target.value)}
              className="w-full border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45] bg-white"
            >
              <option value="">Select type…</option>
              {VEHICLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Model</Label>
            <Input value={model} onChange={e => setModel(e.target.value)} placeholder="e.g. Toyota Hiace"
              className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]" />
          </div>
          <div className="space-y-1.5">
            <Label>Registration</Label>
            <Input value={reg} onChange={e => setReg(e.target.value)} placeholder="e.g. ABC-1234"
              className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]" />
          </div>
          <div className="space-y-1.5">
            <Label>Capacity (passengers)</Label>
            <Input type="number" min={1} max={99} value={cap} onChange={e => setCap(e.target.value)} placeholder="e.g. 8"
              className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-[#2D5A45] hover:bg-[#234839] text-white">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin mr-1.5" />Saving…</> : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DriverAllDriversPage() {
  const { user } = useAuth();

  const [drivers, setDrivers]       = useState<DriverRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [viewDriver, setViewDriver] = useState<DriverRow | null>(null);
  const [editDriver, setEditDriver]   = useState<DriverRow | null>(null);
  const [msgDriver, setMsgDriver]     = useState<DriverRow | null>(null);
  const [maintViewDriver, setMaintViewDriver] = useState<DriverRow | null>(null);
  const [maintAddDriver, setMaintAddDriver]   = useState<DriverRow | null>(null);
  const loadedRef                     = useRef(false);

  // ── fetch drivers + today task counts ───────────────────────────────────────
  useEffect(() => {
    if (!user?.transportDepartmentId || loadedRef.current) return;
    loadedRef.current = true;

    (async () => {
      try {
        const { data: driverData } = await supabase
          .from('users')
          .select('*')
          .eq('role', 'driver')
          .eq('transport_department_id', user.transportDepartmentId)
          .order('name');

        const rows = (driverData as DriverRow[]) ?? [];

        // Fetch today's task counts for all drivers in one query
        const today = todayStr();
        const driverIds = rows.map(d => d.id);
        if (driverIds.length > 0) {
          const { data: taskData } = await supabase
            .from('driver_tasks')
            .select('driver_id')
            .in('driver_id', driverIds)
            .eq('scheduled_date', today)
            .not('status', 'in', '("cancelled","completed")');

          const countMap: Record<string, number> = {};
          for (const t of (taskData ?? []) as { driver_id: string }[]) {
            countMap[t.driver_id] = (countMap[t.driver_id] ?? 0) + 1;
          }
          setDrivers(rows.map(d => ({ ...d, todayTaskCount: countMap[d.id] ?? 0 })));
        } else {
          setDrivers(rows);
        }
      } catch {
        // table may not exist
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.transportDepartmentId]);

  const handleVehicleSaved = useCallback((id: string, updates: Partial<DriverRow>) => {
    setDrivers(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
  }, []);

  // ── stats ────────────────────────────────────────────────────────────────────
  const total     = drivers.length;
  const available = drivers.filter(d => d.is_available === true).length;
  const offDuty   = drivers.filter(d => d.is_available === false).length;

  return (
    <div className="flex min-h-screen bg-[#F5F0E8]">
      <DriverSidebar />

      <main className="ml-64 flex-1">
        <TopBar />
        <div className="p-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#1A1A1A] flex items-center gap-2">
            All Drivers
            {user?.transportDepartmentName && <span className="text-base font-normal text-[#4A4A4A]">— {user.transportDepartmentName}</span>}
            <span className="text-sm font-bold bg-[#2D5A45] text-white px-2 py-0.5 rounded-full">{total}</span>
          </h1>
          <p className="text-sm text-[#4A4A4A] mt-0.5">Drivers in your transport department</p>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Total drivers',  value: total,     color: 'text-[#2D5A45]' },
            { label: 'Available',      value: available,  color: 'text-green-600' },
            { label: 'Off duty',       value: offDuty,    color: 'text-red-600' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-[#E8E3DB] px-5 py-4 text-center shadow-sm">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-[#4A4A4A] mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-[#E8E3DB] shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-[#4A4A4A]">
              <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading drivers…
            </div>
          ) : drivers.length === 0 ? (
            <div className="text-center py-16 text-sm text-[#4A4A4A]">No drivers found in this transport department.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E8E3DB] bg-[#F5F0E8]/50">
                    {['Name', 'Vehicle', 'Registration', 'Capacity', 'Status', "Today's Tasks", 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E3DB]">
                  {drivers.map(driver => {
                    const s = availStatus(driver);
                    const sm = STATUS_META[s];
                    const isMe = driver.id === user?.id;
                    return (
                      <tr key={driver.id} className="hover:bg-[#F5F0E8]/50 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <div className="w-7 h-7 bg-[#2D5A45]/10 rounded-full flex items-center justify-center text-[#2D5A45] font-semibold text-xs shrink-0">
                              {driver.name.charAt(0)}
                            </div>
                            <span className="font-medium text-[#1A1A1A]">{driver.name}</span>
                            {(driver.is_head_driver || isMe) && (
                              <Star className="w-3.5 h-3.5 text-amber-500 shrink-0" fill="currentColor" title={driver.is_head_driver ? 'Nazim Transport' : undefined} />
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-[#4A4A4A]">
                          {driver.vehicle_type && driver.vehicle_model
                            ? `${driver.vehicle_type} · ${driver.vehicle_model}`
                            : driver.vehicle_model ?? driver.vehicle_type ?? '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-[#4A4A4A]">{driver.vehicle_registration ?? '—'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-[#4A4A4A]">
                          {driver.vehicle_capacity != null ? `${driver.vehicle_capacity} pax` : '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${sm.badge}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${sm.dot}`} />
                            {sm.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center">
                          <span className="font-semibold text-[#1A1A1A]">{driver.todayTaskCount ?? 0}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setViewDriver(driver)}
                              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-[#E8E3DB] text-[#4A4A4A] rounded-lg hover:bg-[#F5F0E8] transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" /> View Tasks
                            </button>
                            <button
                              onClick={() => setMsgDriver(driver)}
                              className="p-1.5 text-[#4A4A4A] hover:text-[#2D5A45] rounded-md hover:bg-[#F5F0E8] transition-colors"
                              title="Messages"
                            >
                              <MessageCircle className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setMaintViewDriver(driver)}
                              className="p-1.5 text-[#4A4A4A] hover:text-[#2D5A45] rounded-md hover:bg-[#F5F0E8] transition-colors"
                              title="Maintenance Log"
                            >
                              <Wrench className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setEditDriver(driver)}
                              className="p-1.5 text-[#4A4A4A] hover:text-[#2D5A45] rounded-md hover:bg-[#F5F0E8] transition-colors"
                              title="Edit vehicle"
                            >
                              <Pencil className="w-4 h-4" />
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

      <DriverTasksDialog driver={viewDriver} onClose={() => setViewDriver(null)} />
      <EditVehicleDialog driver={editDriver} onClose={() => setEditDriver(null)} onSaved={handleVehicleSaved} />
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
          onAddEntry={() => { setMaintAddDriver(maintViewDriver); setMaintViewDriver(null); }}
        />
      )}

      {maintAddDriver && (
        <AddMaintenanceDialog
          open={!!maintAddDriver}
          onClose={() => setMaintAddDriver(null)}
          driverId={maintAddDriver.id}
          onSaved={() => setMaintAddDriver(null)}
        />
      )}
    </div>
  );
}
