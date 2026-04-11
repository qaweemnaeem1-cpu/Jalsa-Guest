import { useCallback, useEffect, useRef, useState } from 'react';
import { Car, ChevronDown, Pencil, Loader2, BarChart2, Wrench, Plus, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { DriverSidebar } from '@/components/DriverSidebar';
import { supabase } from '@/lib/supabase';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { TopBar } from '@/components/TopBar';
import {
  AddMaintenanceDialog, ViewMaintenanceLogDialog,
  type MaintenanceEntry, MAINT_TYPE_META, MAINT_STATUS_META, computeStatus,
} from '@/components/VehicleMaintenanceDialog';

// ── types ─────────────────────────────────────────────────────────────────────

interface MileageStats {
  distanceWeek:   number;
  distanceMonth:  number;
  distanceAll:    number;
  avgPerTrip:     number;
  tripsWithMiles: number;
  fuelCostMonth:  number;
  maintCostTotal: number;
  lastServiceDate?: string;
  nextDueDate?:   string;
}

type VehicleType = 'Car' | 'Van' | 'Minibus' | 'Bus';
const VEHICLE_TYPES: VehicleType[] = ['Car', 'Van', 'Minibus', 'Bus'];

const AVAILABILITY_OPTIONS = [
  { value: true,  label: 'Available', dot: 'bg-green-500' },
  { value: false, label: 'Off Duty',  dot: 'bg-red-500' },
];

// ── helpers ───────────────────────────────────────────────────────────────────

function todayStr()      { return new Date().toISOString().split('T')[0]; }
function weekStartStr()  {
  const d = new Date(); const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d.toISOString().split('T')[0];
}
function monthStartStr() {
  const d = new Date(); d.setDate(1);
  return d.toISOString().split('T')[0];
}
function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}
function daysAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso + 'T00:00:00').getTime()) / 86400000);
  return diff === 0 ? 'today' : diff === 1 ? '1 day ago' : `${diff} days ago`;
}
function daysUntil(iso: string) {
  const diff = Math.ceil((new Date(iso + 'T00:00:00').getTime() - Date.now()) / 86400000);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  return `in ${diff} day${diff === 1 ? '' : 's'}`;
}

// ── EditVehicleDialog ─────────────────────────────────────────────────────────

interface EditDialogProps {
  open: boolean;
  initial: { vehicleType: string; vehicleModel: string; vehicleRegistration: string; vehicleCapacity: string };
  onSave: (vals: { vehicleType: string; vehicleModel: string; vehicleRegistration: string; vehicleCapacity: number }) => Promise<void>;
  onClose: () => void;
}

function EditVehicleDialog({ open, initial, onSave, onClose }: EditDialogProps) {
  const [type, setType]     = useState(initial.vehicleType);
  const [model, setModel]   = useState(initial.vehicleModel);
  const [reg, setReg]       = useState(initial.vehicleRegistration);
  const [cap, setCap]       = useState(initial.vehicleCapacity);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setType(initial.vehicleType); setModel(initial.vehicleModel); setReg(initial.vehicleRegistration); setCap(initial.vehicleCapacity); }
  }, [open, initial.vehicleType, initial.vehicleModel, initial.vehicleRegistration, initial.vehicleCapacity]);

  const handleSave = async () => {
    setSaving(true);
    try { await onSave({ vehicleType: type, vehicleModel: model, vehicleRegistration: reg, vehicleCapacity: Number(cap) || 0 }); onClose(); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Edit Vehicle Details</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Vehicle Type</Label>
            <select value={type} onChange={e => setType(e.target.value)}
              className="w-full border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45] bg-white">
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
            <Input type="number" min={1} max={99} value={cap} onChange={e => setCap(e.target.value)}
              className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-[#2D5A45] hover:bg-[#234839] text-white">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin mr-1.5" />Saving…</> : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function DriverVehiclePage() {
  const { user, updateUser } = useAuth();

  const [maintenance, setMaintenance]   = useState<MaintenanceEntry[]>([]);
  const [mileageStats, setMileageStats] = useState<MileageStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [editOpen, setEditOpen]         = useState(false);
  const [availOpen, setAvailOpen]       = useState(false);
  const [updatingAvail, setUpdatingAvail] = useState(false);
  const [addMaintOpen, setAddMaintOpen] = useState(false);
  const [editEntry, setEditEntry]       = useState<MaintenanceEntry | null>(null);
  const [viewLogOpen, setViewLogOpen]   = useState(false);
  const [preselType, setPreselType]     = useState<MaintenanceEntry['type'] | undefined>();
  const availMenuRef                    = useRef<HTMLDivElement>(null);
  const loadedRef                       = useRef(false);

  const today      = todayStr();
  const weekStart  = weekStartStr();
  const monthStart = monthStartStr();

  // ── fetch stats + maintenance ────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id || loadedRef.current) return;
    loadedRef.current = true;

    (async () => {
      try {
        const [tasksRes, maintRes] = await Promise.all([
          supabase
            .from('driver_tasks')
            .select('scheduled_date,start_mileage,end_mileage,passenger_count')
            .eq('driver_id', user.id)
            .eq('status', 'completed'),
          supabase
            .from('vehicle_maintenance')
            .select('*')
            .eq('driver_id', user.id)
            .order('date', { ascending: false }),
        ]);

        const tasks = (tasksRes.data ?? []) as { scheduled_date: string; start_mileage?: number; end_mileage?: number; passenger_count?: number }[];
        const maint = (maintRes.data ?? []) as MaintenanceEntry[];
        setMaintenance(maint);

        // Mileage calcs — only tasks with both mileage readings
        const mileageTasks = tasks.filter(t => t.start_mileage != null && t.end_mileage != null && t.end_mileage > t.start_mileage);
        const dist = (t: typeof mileageTasks[number]) => (t.end_mileage ?? 0) - (t.start_mileage ?? 0);

        const distAll   = mileageTasks.reduce((s, t) => s + dist(t), 0);
        const distWeek  = mileageTasks.filter(t => t.scheduled_date >= weekStart).reduce((s, t) => s + dist(t), 0);
        const distMonth = mileageTasks.filter(t => t.scheduled_date >= monthStart).reduce((s, t) => s + dist(t), 0);
        const avgPerTrip = mileageTasks.length > 0 ? Math.round(distAll / mileageTasks.length) : 0;

        // Cost calcs
        const fuelCostMonth = maint
          .filter(m => m.type === 'fuel' && m.date >= monthStart && m.cost != null)
          .reduce((s, m) => s + (m.cost ?? 0), 0);
        const maintCostTotal = maint
          .filter(m => m.cost != null)
          .reduce((s, m) => s + (m.cost ?? 0), 0);

        const lastService = maint.find(m => m.type !== 'fuel' && m.type !== 'wash_clean');
        const nextDue     = maint.find(m => m.next_due_date);

        setMileageStats({
          distanceWeek: distWeek, distanceMonth: distMonth,
          distanceAll: distAll, avgPerTrip,
          tripsWithMiles: mileageTasks.length,
          fuelCostMonth, maintCostTotal,
          lastServiceDate: lastService?.date,
          nextDueDate: nextDue?.next_due_date,
        });
      } catch {
        setMileageStats({ distanceWeek: 0, distanceMonth: 0, distanceAll: 0, avgPerTrip: 0, tripsWithMiles: 0, fuelCostMonth: 0, maintCostTotal: 0 });
      } finally {
        setStatsLoading(false);
      }
    })();
  }, [user?.id, weekStart, monthStart]);

  // ── close availability dropdown on outside click ───────────────────────────
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (availMenuRef.current && !availMenuRef.current.contains(e.target as Node)) setAvailOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSetAvailability = useCallback(async (val: boolean) => {
    if (!user?.id) return;
    setAvailOpen(false); setUpdatingAvail(true);
    try {
      const { error } = await supabase.from('users').update({ is_available: val }).eq('id', user.id);
      if (error) throw error;
      updateUser({ isAvailable: val });
      toast.success(`Status set to ${val ? 'Available' : 'Off Duty'}`);
    } catch { toast.error('Failed to update status'); }
    finally { setUpdatingAvail(false); }
  }, [user?.id, updateUser]);

  const handleSaveVehicle = useCallback(async (vals: {
    vehicleType: string; vehicleModel: string; vehicleRegistration: string; vehicleCapacity: number;
  }) => {
    if (!user?.id) return;
    const { error } = await supabase.from('users').update({
      vehicle_type: vals.vehicleType, vehicle_model: vals.vehicleModel,
      vehicle_registration: vals.vehicleRegistration, vehicle_capacity: vals.vehicleCapacity,
    }).eq('id', user.id);
    if (error) { toast.error('Failed to update vehicle details'); throw error; }
    updateUser({ vehicleType: vals.vehicleType, vehicleModel: vals.vehicleModel,
      vehicleRegistration: vals.vehicleRegistration, vehicleCapacity: vals.vehicleCapacity });
    toast.success('Vehicle details updated');
  }, [user?.id, updateUser]);

  const handleMaintSaved = (saved: MaintenanceEntry) => {
    setMaintenance(prev => {
      const idx = prev.findIndex(e => e.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [saved, ...prev];
    });
    setEditEntry(null);
    loadedRef.current = false; // allow re-fetch of cost stats
  };

  const handleDeleteMaint = async (id: string) => {
    const { error } = await supabase.from('vehicle_maintenance').delete().eq('id', id);
    if (error) { toast.error('Failed to delete entry'); return; }
    toast.success('Entry deleted');
    setMaintenance(prev => prev.filter(e => e.id !== id));
  };

  const isAvail    = user?.isAvailable;
  const availDot   = isAvail === true ? 'bg-green-500' : isAvail === false ? 'bg-red-500' : 'bg-gray-400';
  const availLabel = isAvail === true ? 'Available' : isAvail === false ? 'Off Duty' : 'Unknown';

  // Overdue / upcoming alerts for maintenance section
  const [deleteId, setDeleteId] = useState<string | null>(null);

  return (
    <div className="flex min-h-screen bg-[#F5F0E8]">
      <DriverSidebar />

      <main className="ml-64 flex-1">
        <TopBar />
        <div className="p-8 max-w-4xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#1A1A1A]">My Vehicle</h1>
          <p className="text-sm text-[#4A4A4A] mt-0.5">Vehicle details, maintenance log & mileage stats</p>
        </div>

        {/* Vehicle card */}
        <div className="bg-white rounded-2xl border border-[#E8E3DB] shadow-sm p-6 mb-6">
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-[#2D5A45]/10 rounded-xl flex items-center justify-center">
                <Car className="w-6 h-6 text-[#2D5A45]" />
              </div>
              <div>
                <h2 className="font-semibold text-[#1A1A1A]">Vehicle Details</h2>
                <p className="text-xs text-[#4A4A4A]">Your assigned vehicle information</p>
              </div>
            </div>
            <button onClick={() => setEditOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-[#E8E3DB] rounded-lg text-[#4A4A4A] hover:bg-[#F5F0E8] transition-colors">
              <Pencil className="w-3.5 h-3.5" /> Edit Details
            </button>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-4 mb-6">
            {[
              { label: 'Type',         value: user?.vehicleType         ?? '—' },
              { label: 'Model',        value: user?.vehicleModel        ?? '—' },
              { label: 'Registration', value: user?.vehicleRegistration ?? '—' },
              { label: 'Capacity',     value: user?.vehicleCapacity != null ? `${user.vehicleCapacity} passengers` : '—' },
            ].map(row => (
              <div key={row.label}>
                <p className="text-xs font-medium text-[#4A4A4A] uppercase tracking-wider mb-0.5">{row.label}</p>
                <p className="text-sm font-semibold text-[#1A1A1A]">{row.value}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-[#E8E3DB]">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${availDot}`} />
              <span className="text-sm font-medium text-[#1A1A1A]">{updatingAvail ? 'Saving…' : availLabel}</span>
            </div>
            <div className="relative" ref={availMenuRef}>
              <button onClick={() => setAvailOpen(o => !o)} disabled={updatingAvail}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-[#E8E3DB] rounded-lg text-[#4A4A4A] hover:bg-[#F5F0E8] transition-colors disabled:opacity-50">
                Change <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {availOpen && (
                <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-[#E8E3DB] rounded-xl shadow-lg z-20 overflow-hidden">
                  {AVAILABILITY_OPTIONS.map(opt => (
                    <button key={String(opt.value)} onClick={() => handleSetAvailability(opt.value as boolean)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#1A1A1A] hover:bg-[#F5F0E8] transition-colors">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${opt.dot}`} />{opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Maintenance Log */}
        <div className="bg-white rounded-2xl border border-[#E8E3DB] shadow-sm mb-6">
          <div className="flex items-center justify-between p-5 border-b border-[#E8E3DB]">
            <div className="flex items-center gap-2">
              <Wrench className="w-5 h-5 text-[#2D5A45]" />
              <h2 className="font-semibold text-[#1A1A1A]">Maintenance Log</h2>
              {maintenance.length > 0 && (
                <span className="text-xs bg-[#2D5A45]/10 text-[#2D5A45] font-medium px-2 py-0.5 rounded-full">
                  {maintenance.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {maintenance.length > 3 && (
                <button onClick={() => setViewLogOpen(true)}
                  className="text-sm text-[#2D5A45] hover:underline font-medium">View All</button>
              )}
              <Button size="sm" onClick={() => { setEditEntry(null); setPreselType(undefined); setAddMaintOpen(true); }}
                className="bg-[#2D5A45] hover:bg-[#234839] text-white gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Add Entry
              </Button>
            </div>
          </div>

          {statsLoading ? (
            <div className="p-8 text-center text-[#4A4A4A] text-sm flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : maintenance.length === 0 ? (
            <div className="p-8 text-center text-[#4A4A4A] text-sm">
              No maintenance entries yet. Add your first entry.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E8E3DB] bg-[#F5F0E8]">
                    <th className="px-4 py-2.5 text-left font-medium text-[#4A4A4A]">Date</th>
                    <th className="px-4 py-2.5 text-left font-medium text-[#4A4A4A]">Type</th>
                    <th className="px-4 py-2.5 text-left font-medium text-[#4A4A4A]">Description</th>
                    <th className="px-4 py-2.5 text-left font-medium text-[#4A4A4A]">Mileage</th>
                    <th className="px-4 py-2.5 text-left font-medium text-[#4A4A4A]">Cost</th>
                    <th className="px-4 py-2.5 text-left font-medium text-[#4A4A4A]">Next Due</th>
                    <th className="px-4 py-2.5 text-left font-medium text-[#4A4A4A]">Status</th>
                    <th className="px-4 py-2.5 text-left font-medium text-[#4A4A4A]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E3DB]">
                  {maintenance.slice(0, 5).map(e => {
                    const effectiveStatus = computeStatus(e);
                    const sm = MAINT_STATUS_META[effectiveStatus];
                    const tm = MAINT_TYPE_META[e.type];
                    const nextDue = [
                      e.next_due_date    ? fmtDate(e.next_due_date) : '',
                      e.next_due_mileage ? `${e.next_due_mileage.toLocaleString()} km` : '',
                    ].filter(Boolean).join(' / ');
                    return (
                      <tr key={e.id} className="hover:bg-[#F5F0E8]/50">
                        <td className="px-4 py-2.5 text-[#1A1A1A] whitespace-nowrap">{fmtDate(e.date)}</td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${tm.cls}`}>{tm.label}</span>
                        </td>
                        <td className="px-4 py-2.5 text-[#4A4A4A] max-w-[160px] truncate">{e.description ?? '—'}</td>
                        <td className="px-4 py-2.5 text-[#4A4A4A] whitespace-nowrap">
                          {e.current_mileage != null ? `${e.current_mileage.toLocaleString()} km` : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-[#4A4A4A] whitespace-nowrap">
                          {e.cost != null ? `£${e.cost.toFixed(2)}` : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-[#4A4A4A] text-xs whitespace-nowrap">{nextDue || '—'}</td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${sm.cls}`}>{sm.label}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1">
                            <button onClick={() => { setEditEntry(e); setAddMaintOpen(true); }} title="Edit"
                              className="p-1 rounded text-[#4A4A4A] hover:text-[#2D5A45] hover:bg-[#F5F0E8]">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            {deleteId === e.id ? (
                              <>
                                <button onClick={() => handleDeleteMaint(e.id)}
                                  className="text-xs text-red-600 font-medium px-1.5 py-0.5 rounded hover:bg-red-50">Yes</button>
                                <button onClick={() => setDeleteId(null)}
                                  className="text-xs text-[#4A4A4A] px-1.5 py-0.5 rounded hover:bg-[#F5F0E8]">No</button>
                              </>
                            ) : (
                              <button onClick={() => setDeleteId(e.id)} title="Delete"
                                className="p-1 rounded text-[#4A4A4A] hover:text-red-600 hover:bg-red-50">
                                <AlertTriangle className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {maintenance.length > 5 && (
                <div className="px-4 py-3 border-t border-[#E8E3DB] text-center">
                  <button onClick={() => setViewLogOpen(true)}
                    className="text-sm text-[#2D5A45] hover:underline font-medium">
                    View all {maintenance.length} entries →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Vehicle Statistics */}
        <div className="bg-white rounded-2xl border border-[#E8E3DB] shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <BarChart2 className="w-5 h-5 text-[#2D5A45]" />
            <h2 className="font-semibold text-[#1A1A1A]">Vehicle Statistics</h2>
          </div>

          {statsLoading ? (
            <div className="flex items-center justify-center py-8 text-[#4A4A4A]">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading stats…
            </div>
          ) : mileageStats ? (
            <div className="space-y-4">
              {/* Distance stats */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Distance This Week',  value: `${mileageStats.distanceWeek.toLocaleString()} km` },
                  { label: 'Distance This Month', value: `${mileageStats.distanceMonth.toLocaleString()} km` },
                  { label: 'Total Distance (all)', value: `${mileageStats.distanceAll.toLocaleString()} km` },
                  { label: 'Average Per Trip',    value: mileageStats.tripsWithMiles > 0 ? `${mileageStats.avgPerTrip} km` : '—' },
                ].map(s => (
                  <div key={s.label} className="bg-[#F5F0E8] rounded-xl px-4 py-3">
                    <p className="text-xl font-bold text-[#2D5A45]">{s.value}</p>
                    <p className="text-xs text-[#4A4A4A] mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Cost + service info */}
              <div className="border-t border-[#E8E3DB] pt-4 grid grid-cols-2 gap-3">
                <div className="bg-[#F5F0E8] rounded-xl px-4 py-3">
                  <p className="text-xl font-bold text-[#2D5A45]">
                    {mileageStats.fuelCostMonth > 0 ? `£${mileageStats.fuelCostMonth.toFixed(2)}` : '—'}
                  </p>
                  <p className="text-xs text-[#4A4A4A] mt-0.5">Fuel Cost This Month</p>
                </div>
                <div className="bg-[#F5F0E8] rounded-xl px-4 py-3">
                  <p className="text-xl font-bold text-[#2D5A45]">
                    {mileageStats.maintCostTotal > 0 ? `£${mileageStats.maintCostTotal.toFixed(2)}` : '—'}
                  </p>
                  <p className="text-xs text-[#4A4A4A] mt-0.5">Total Maintenance Cost</p>
                </div>
                {mileageStats.lastServiceDate && (
                  <div className="bg-[#F5F0E8] rounded-xl px-4 py-3">
                    <p className="text-sm font-bold text-[#1A1A1A]">{fmtDate(mileageStats.lastServiceDate)}</p>
                    <p className="text-xs text-[#4A4A4A] mt-0.5">Last Service ({daysAgo(mileageStats.lastServiceDate)})</p>
                  </div>
                )}
                {mileageStats.nextDueDate && (
                  <div className={`rounded-xl px-4 py-3 ${
                    new Date(mileageStats.nextDueDate + 'T00:00:00') < new Date()
                      ? 'bg-red-50'
                      : (Date.parse(mileageStats.nextDueDate + 'T00:00:00') - Date.now()) / 86400000 <= 7
                        ? 'bg-amber-50'
                        : 'bg-[#F5F0E8]'
                  }`}>
                    <p className="text-sm font-bold text-[#1A1A1A]">{fmtDate(mileageStats.nextDueDate)}</p>
                    <p className="text-xs text-[#4A4A4A] mt-0.5">Next Service Due ({daysUntil(mileageStats.nextDueDate)})</p>
                  </div>
                )}
              </div>

              {mileageStats.tripsWithMiles === 0 && (
                <p className="text-xs text-center text-[#4A4A4A] pt-2">
                  Mileage stats will appear once you record start/end mileage on trips.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-[#4A4A4A] text-center py-4">Could not load stats.</p>
          )}
        </div>
        </div>{/* /p-8 */}
      </main>

      {/* Dialogs */}
      <EditVehicleDialog
        open={editOpen}
        initial={{
          vehicleType:         user?.vehicleType         ?? '',
          vehicleModel:        user?.vehicleModel        ?? '',
          vehicleRegistration: user?.vehicleRegistration ?? '',
          vehicleCapacity:     String(user?.vehicleCapacity ?? ''),
        }}
        onSave={handleSaveVehicle}
        onClose={() => setEditOpen(false)}
      />

      <AddMaintenanceDialog
        open={addMaintOpen}
        onClose={() => { setAddMaintOpen(false); setEditEntry(null); }}
        driverId={user?.id ?? ''}
        vehicleRegistration={user?.vehicleRegistration}
        preselectedType={preselType}
        editEntry={editEntry}
        onSaved={handleMaintSaved}
      />

      <ViewMaintenanceLogDialog
        open={viewLogOpen}
        onClose={() => setViewLogOpen(false)}
        driverId={user?.id ?? ''}
        driverName={user?.name ?? ''}
        vehicleRegistration={user?.vehicleRegistration}
        onAddEntry={() => { setViewLogOpen(false); setEditEntry(null); setAddMaintOpen(true); }}
      />
    </div>
  );
}
