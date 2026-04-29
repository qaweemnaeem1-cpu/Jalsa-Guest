/**
 * /transport/drivers — My Drivers for Transport Department Head.
 * Shows all drivers in this transport department with full management.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Star, Loader2, Eye, Pencil, MessageCircle, Wrench,
  Plus, Search, ChevronDown, ChevronUp, ClipboardList,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { TransportSidebar } from '@/components/TransportSidebar';
import { TopBar } from '@/components/TopBar';
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
import { CreateTaskDialog } from '@/components/CreateTaskDialog';
import type { DriverInfo } from '@/components/CreateTaskDialog';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DriverRow {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  vehicle_type?: string;
  vehicle_model?: string;
  vehicle_registration?: string;
  vehicle_capacity?: number;
  is_available?: boolean;
  is_head_driver?: boolean;
  transport_department_id?: string;
  todayTaskCount?: number;
  activeTaskLabel?: string;
}

type AvailStatus = 'available' | 'on_task' | 'off_duty' | 'unknown';

function availStatus(d: DriverRow): AvailStatus {
  if (d.activeTaskLabel) return 'on_task';
  if (d.is_available === true) return 'available';
  if (d.is_available === false) return 'off_duty';
  return 'unknown';
}

const STATUS_META: Record<AvailStatus, { label: string; dot: string; badge: string }> = {
  available: { label: 'Available', dot: 'bg-green-500',  badge: 'bg-green-100 text-green-700' },
  on_task:   { label: 'On Task',   dot: 'bg-blue-500',   badge: 'bg-blue-100 text-blue-700' },
  off_duty:  { label: 'Off Duty',  dot: 'bg-amber-500',  badge: 'bg-amber-100 text-amber-700' },
  unknown:   { label: 'Unknown',   dot: 'bg-gray-400',   badge: 'bg-gray-100 text-gray-600' },
};

const VEHICLE_TYPES = ['Car', 'Van', 'Minibus', 'Bus'];

function todayStr() { return new Date().toISOString().split('T')[0]; }

// ── Driver Tasks Dialog ───────────────────────────────────────────────────────

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
      .then(({ data }) => { setTasks((data as DriverTask[]) ?? []); setLoading(false); });
  }, [driver]);

  const TYPE_LABEL: Record<string, string> = {
    airport_pickup: 'Pickup', airport_dropoff: 'Drop-off',
    mulaqat_transport: 'Mulaqat', other: 'Other',
  };
  const STATUS_CLS: Record<string, string> = {
    suggested: 'bg-gray-100 text-gray-600', pending: 'bg-amber-100 text-amber-700',
    in_progress: 'bg-blue-100 text-blue-700', completed: 'bg-green-100 text-green-700',
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
                  {['Date', 'Time', 'Type', 'Guest', 'Route', 'Status'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-[#4A4A4A] uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E3DB]">
                {tasks.map(t => (
                  <tr key={t.id} className="hover:bg-[#F5F0E8]/50">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {new Date(t.scheduled_date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </td>
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
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${STATUS_CLS[t.status] ?? 'bg-gray-100'}`}>
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

function EditVehicleDialog({ driver, onClose, onSaved }: {
  driver: DriverRow | null;
  onClose: () => void;
  onSaved: (id: string, updates: Partial<DriverRow>) => void;
}) {
  const [type, setType]     = useState('');
  const [model, setModel]   = useState('');
  const [reg, setReg]       = useState('');
  const [cap, setCap]       = useState('');
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
      onSaved(driver.id, { vehicle_type: type || undefined, vehicle_model: model || undefined, vehicle_registration: reg || undefined, vehicle_capacity: cap ? Number(cap) : undefined });
      toast.success(`${driver.name}'s vehicle updated`);
      onClose();
    } catch {
      toast.error('Failed to update vehicle');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!driver} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Edit Vehicle — {driver?.name}</DialogTitle></DialogHeader>
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

// ── Add Driver Dialog ─────────────────────────────────────────────────────────

function AddDriverDialog({ open, onClose, transportDeptId, transportDeptName, onSaved }: {
  open: boolean;
  onClose: () => void;
  transportDeptId?: string;
  transportDeptName?: string;
  onSaved: () => void;
}) {
  const [name, setName]   = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [pass, setPass]   = useState('');
  const [vType, setVType] = useState('');
  const [vModel, setVModel] = useState('');
  const [vReg, setVReg]   = useState('');
  const [vCap, setVCap]   = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName(''); setEmail(''); setPhone(''); setPass('');
    setVType(''); setVModel(''); setVReg(''); setVCap('');
  };

  const handleSave = async () => {
    if (!name.trim() || !email.trim()) {
      toast.error('Name and email are required');
      return;
    }
    if (!transportDeptId) {
      toast.error('No transport department assigned');
      return;
    }
    setSaving(true);
    try {
      const insertData = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || null,
        password_hash: pass || null,
        role: 'driver',
        is_head_driver: false,
        is_active: true,
        is_available: true,
        transport_department_id: transportDeptId,
        transport_department_name: transportDeptName ?? null,
        vehicle_type: vType || null,
        vehicle_model: vModel || null,
        vehicle_registration: vReg || null,
        vehicle_capacity: vCap ? Number(vCap) : null,
      };
      console.log('[AddDriver] Insert data:', insertData);
      const { data, error } = await supabase.from('users').insert(insertData).select().single();
      if (error) {
        console.error('[AddDriver] Supabase error:', error.message, error.details, error.hint, error.code);
        toast.error('Failed: ' + (error.message || 'Unknown error'));
        return;
      }
      console.log('[AddDriver] Success:', data);
      toast.success(`Driver "${name.trim()}" added`);
      reset();
      onClose();
      onSaved();
    } catch (err) {
      console.error('[AddDriver] Exception:', err);
      toast.error('Failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Driver</DialogTitle>
          {transportDeptName && <p className="text-sm text-[#4A4A4A]">{transportDeptName}</p>}
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label>Full Name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Driver name"
                className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]" />
            </div>
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com"
                className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]" />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+44 7700 000000"
                className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Password</Label>
              <Input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="Set login password"
                className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]" />
            </div>
          </div>

          <div className="border-t border-[#E8E3DB] pt-3">
            <p className="text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider mb-3">Vehicle Details</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Vehicle Type</Label>
                <select value={vType} onChange={e => setVType(e.target.value)}
                  className="w-full border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45] bg-white">
                  <option value="">Select…</option>
                  {VEHICLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Model</Label>
                <Input value={vModel} onChange={e => setVModel(e.target.value)} placeholder="e.g. Toyota Hiace"
                  className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]" />
              </div>
              <div className="space-y-1.5">
                <Label>Registration</Label>
                <Input value={vReg} onChange={e => setVReg(e.target.value)} placeholder="e.g. LB24 XYZ"
                  className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]" />
              </div>
              <div className="space-y-1.5">
                <Label>Capacity (pax)</Label>
                <Input type="number" min={1} max={99} value={vCap} onChange={e => setVCap(e.target.value)} placeholder="e.g. 8"
                  className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]" />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-[#2D5A45] hover:bg-[#234839] text-white">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin mr-1.5" />Adding…</> : 'Add Driver'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Matching Preferences ──────────────────────────────────────────────────────

const PREF_KEY = 'transport_matching_prefs';

interface MatchingPrefs {
  vipDriverId: string;
  familyMinCap: number;
  notes: string;
}

function MatchingPrefsSection({ drivers }: { drivers: DriverRow[] }) {
  const [open, setOpen]     = useState(false);
  const [prefs, setPrefs]   = useState<MatchingPrefs>({ vipDriverId: '', familyMinCap: 4, notes: '' });
  const [saved, setSaved]   = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(PREF_KEY);
      if (stored) setPrefs(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  const handleSave = () => {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    toast.success('Matching preferences saved');
  };

  return (
    <div className="bg-white rounded-2xl border border-[#E8E3DB] shadow-sm overflow-hidden mt-4">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-[#F5F0E8]/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-[#2D5A45]" />
          <span className="font-semibold text-[#1A1A1A] text-sm">Driver-Guest Matching Preferences</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-[#4A4A4A]" /> : <ChevronDown className="w-4 h-4 text-[#4A4A4A]" />}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-[#E8E3DB]">
          <div className="pt-4 space-y-4">
            <div className="space-y-1.5">
              <Label>VIP guests preferred driver</Label>
              <select
                value={prefs.vipDriverId}
                onChange={e => setPrefs(p => ({ ...p, vipDriverId: e.target.value }))}
                className="w-full border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45] bg-white"
              >
                <option value="">No preference</option>
                {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <p className="text-xs text-[#4A4A4A]">This driver will be suggested first for VIP/Tier 1 guests</p>
            </div>

            <div className="space-y-1.5">
              <Label>Minimum vehicle capacity for families (pax)</Label>
              <Input
                type="number" min={1} max={20}
                value={prefs.familyMinCap}
                onChange={e => setPrefs(p => ({ ...p, familyMinCap: Number(e.target.value) }))}
                className="w-32 border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]"
              />
              <p className="text-xs text-[#4A4A4A]">Warn when assigning a family group to a smaller vehicle</p>
            </div>

            <div className="space-y-1.5">
              <Label>Additional notes / rules</Label>
              <textarea
                rows={3}
                value={prefs.notes}
                onChange={e => setPrefs(p => ({ ...p, notes: e.target.value }))}
                placeholder="e.g. Language matching rules, special vehicle requirements…"
                className="w-full border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45] resize-none"
              />
            </div>

            <Button onClick={handleSave} className="bg-[#2D5A45] hover:bg-[#234839] text-white">
              {saved ? '✓ Saved' : 'Save Preferences'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function TransportDriversPage() {
  const { user } = useAuth();

  const [drivers, setDrivers]     = useState<DriverRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');

  const [viewDriver, setViewDriver]               = useState<DriverRow | null>(null);
  const [editDriver, setEditDriver]               = useState<DriverRow | null>(null);
  const [msgDriver, setMsgDriver]                 = useState<DriverRow | null>(null);
  const [maintViewDriver, setMaintViewDriver]     = useState<DriverRow | null>(null);
  const [maintAddDriver, setMaintAddDriver]       = useState<DriverRow | null>(null);
  const [addDriverOpen, setAddDriverOpen]         = useState(false);
  const [assignTaskDriver, setAssignTaskDriver]   = useState<DriverRow | null>(null);

  const loadedRef = useRef(false);

  const fetchAll = useCallback(async () => {
    if (!user?.transportDepartmentId) return;
    const tdId = user.transportDepartmentId;

    try {
      const { data: driverData } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'driver')
        .eq('transport_department_id', tdId)
        .order('name');

      const rows = (driverData ?? []) as DriverRow[];
      const today = todayStr();
      const driverIds = rows.map(d => d.id);

      if (driverIds.length > 0) {
        const [taskCountRes, activeTasksRes] = await Promise.all([
          supabase
            .from('driver_tasks')
            .select('driver_id')
            .in('driver_id', driverIds)
            .eq('scheduled_date', today)
            .not('status', 'in', '("cancelled","completed")'),
          supabase
            .from('driver_tasks')
            .select('driver_id,guest_name')
            .in('driver_id', driverIds)
            .eq('status', 'in_progress'),
        ]);

        const countMap: Record<string, number> = {};
        for (const t of (taskCountRes.data ?? []) as { driver_id: string }[]) {
          countMap[t.driver_id] = (countMap[t.driver_id] ?? 0) + 1;
        }
        const activeMap: Record<string, string> = {};
        for (const t of (activeTasksRes.data ?? []) as { driver_id: string | null; guest_name: string | null }[]) {
          if (t.driver_id) activeMap[t.driver_id] = t.guest_name ?? 'a guest';
        }

        setDrivers(rows.map(d => ({
          ...d,
          todayTaskCount: countMap[d.id] ?? 0,
          activeTaskLabel: activeMap[d.id],
        })));
      } else {
        setDrivers(rows);
      }
    } catch {
      // best-effort
    } finally {
      setLoading(false);
    }
  }, [user?.transportDepartmentId]);

  useEffect(() => {
    if (!user?.transportDepartmentId || loadedRef.current) return;
    loadedRef.current = true;
    fetchAll();
  }, [user?.transportDepartmentId, fetchAll]);

  // Real-time
  useEffect(() => {
    if (!user?.transportDepartmentId) return;
    const channel = supabase
      .channel('transport-drivers-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_tasks', filter: `transport_department_id=eq.${user.transportDepartmentId}` }, () => {
        fetchAll();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => {
        fetchAll();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.transportDepartmentId, fetchAll]);

  const handleVehicleSaved = useCallback((id: string, updates: Partial<DriverRow>) => {
    setDrivers(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
  }, []);

  // Stats
  const total     = drivers.length;
  const available = drivers.filter(d => availStatus(d) === 'available').length;
  const onTask    = drivers.filter(d => availStatus(d) === 'on_task').length;
  const offDuty   = drivers.filter(d => availStatus(d) === 'off_duty').length;

  const filtered = useMemo(() => {
    if (!search) return drivers;
    const q = search.toLowerCase();
    return drivers.filter(d =>
      d.name.toLowerCase().includes(q) ||
      (d.phone ?? '').toLowerCase().includes(q) ||
      (d.vehicle_model ?? '').toLowerCase().includes(q),
    );
  }, [drivers, search]);

  const driversForTask: DriverInfo[] = drivers.map(d => ({
    id: d.id,
    name: d.name,
    vehicle_type: d.vehicle_type,
    vehicle_model: d.vehicle_model,
    vehicle_capacity: d.vehicle_capacity,
    is_available: d.is_available,
    location: user?.location,
  }));

  return (
    <div className="flex min-h-screen bg-[#F5F0E8]">
      <TransportSidebar />

      <main className="ml-64 flex-1">
        <TopBar />
        <div className="p-8">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-[#1A1A1A] flex items-center gap-2">
                My Drivers
                <span className="text-base font-normal text-[#4A4A4A]">— {user?.transportDepartmentName ?? 'Transport Department'}</span>
                <span className="text-sm font-bold bg-[#2D5A45] text-white px-2 py-0.5 rounded-full">{total}</span>
              </h1>
              <p className="text-sm text-[#4A4A4A] mt-0.5">
                <span className="text-green-600 font-medium">{available} available</span>
                {' · '}<span className="text-blue-600 font-medium">{onTask} on task</span>
                {' · '}<span className="text-amber-600 font-medium">{offDuty} off duty</span>
              </p>
            </div>
            <button
              onClick={() => setAddDriverOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#2D5A45] text-white rounded-xl text-sm font-medium hover:bg-[#234839] transition-colors"
            >
              <Plus className="w-4 h-4" /> Add Driver
            </button>
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Total Drivers', value: total,     color: 'text-[#2D5A45]' },
              { label: 'Available',     value: available, color: 'text-green-600' },
              { label: 'On Task',       value: onTask,    color: 'text-blue-600' },
              { label: 'Off Duty',      value: offDuty,   color: 'text-amber-600' },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl border border-[#E8E3DB] px-5 py-4 text-center shadow-sm">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-[#4A4A4A] mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Search */}
          <div className="mb-4">
            <div className="relative max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A4A4A]" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search drivers…"
                className="w-full pl-9 pr-3 py-2 border border-[#E8E3DB] rounded-lg text-sm bg-white focus:outline-none focus:border-[#2D5A45]"
              />
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-[#E8E3DB] shadow-sm overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-[#4A4A4A]">
                <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading drivers…
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-center py-16 text-sm text-[#4A4A4A]">No drivers found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#E8E3DB] bg-[#F5F0E8]/50">
                      {['Name', 'Phone', 'Vehicle', 'Registration', 'Capacity', 'Status', "Today's Tasks", 'Actions'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#4A4A4A] uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E3DB]">
                    {filtered.map(driver => {
                      const s  = availStatus(driver);
                      const sm = STATUS_META[s];
                      return (
                        <tr key={driver.id} className="hover:bg-[#F5F0E8]/50 transition-colors">
                          {/* Name */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <div className="w-7 h-7 bg-[#2D5A45]/10 rounded-full flex items-center justify-center text-[#2D5A45] font-semibold text-xs shrink-0">
                                {driver.name.charAt(0)}
                              </div>
                              <span className="font-medium text-[#1A1A1A]">{driver.name}</span>
                              {driver.is_head_driver && (
                                <Star className="w-3.5 h-3.5 text-amber-500 shrink-0" fill="currentColor" title="Department Head" />
                              )}
                            </div>
                            {driver.activeTaskLabel && (
                              <p className="text-[10px] text-blue-600 ml-9 mt-0.5">→ {driver.activeTaskLabel}</p>
                            )}
                          </td>

                          {/* Phone */}
                          <td className="px-4 py-3 whitespace-nowrap text-[#4A4A4A]">
                            {driver.phone ? (
                              <a href={`tel:${driver.phone}`} className="text-[#2D5A45] hover:underline">{driver.phone}</a>
                            ) : '—'}
                          </td>

                          {/* Vehicle */}
                          <td className="px-4 py-3 whitespace-nowrap text-[#4A4A4A]">
                            {driver.vehicle_type && driver.vehicle_model
                              ? `${driver.vehicle_type} · ${driver.vehicle_model}`
                              : driver.vehicle_model ?? driver.vehicle_type ?? '—'}
                          </td>

                          {/* Registration */}
                          <td className="px-4 py-3 whitespace-nowrap text-[#4A4A4A]">{driver.vehicle_registration ?? '—'}</td>

                          {/* Capacity */}
                          <td className="px-4 py-3 whitespace-nowrap text-[#4A4A4A]">
                            {driver.vehicle_capacity != null ? `${driver.vehicle_capacity} pax` : '—'}
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${sm.badge}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${sm.dot}`} />
                              {sm.label}
                            </span>
                          </td>

                          {/* Today's Tasks */}
                          <td className="px-4 py-3 whitespace-nowrap text-center">
                            <span className={`font-semibold text-[#1A1A1A] ${(driver.todayTaskCount ?? 0) >= 7 ? 'text-orange-600' : ''}`}>
                              {driver.todayTaskCount ?? 0}
                            </span>
                            {(driver.todayTaskCount ?? 0) >= 7 && <span className="text-orange-500 ml-1 text-xs">⚠</span>}
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setViewDriver(driver)}
                                className="flex items-center gap-1 px-2 py-1 text-xs font-medium border border-[#E8E3DB] text-[#4A4A4A] rounded-lg hover:bg-[#F5F0E8] transition-colors"
                                title="View Tasks"
                              >
                                <Eye className="w-3.5 h-3.5" /> Tasks
                              </button>
                              <button
                                onClick={() => { setAssignTaskDriver(driver); }}
                                className="flex items-center gap-1 px-2 py-1 text-xs font-medium border border-[#2D5A45] text-[#2D5A45] rounded-lg hover:bg-[#F5F0E8] transition-colors"
                                title="Assign Task"
                              >
                                <Plus className="w-3.5 h-3.5" /> Task
                              </button>
                              <button
                                onClick={() => setMsgDriver(driver)}
                                className="p-1.5 text-[#4A4A4A] hover:text-[#2D5A45] rounded-md hover:bg-[#F5F0E8] transition-colors"
                                title="Send Message"
                              >
                                <MessageCircle className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setMaintViewDriver(driver)}
                                className="p-1.5 text-[#4A4A4A] hover:text-amber-600 rounded-md hover:bg-[#F5F0E8] transition-colors"
                                title="Maintenance Log"
                              >
                                <Wrench className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setEditDriver(driver)}
                                className="p-1.5 text-[#4A4A4A] hover:text-[#2D5A45] rounded-md hover:bg-[#F5F0E8] transition-colors"
                                title="Edit Vehicle"
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

          {/* Matching Preferences */}
          <MatchingPrefsSection drivers={drivers} />
        </div>
      </main>

      {/* Dialogs */}
      <DriverTasksDialog driver={viewDriver} onClose={() => setViewDriver(null)} />
      <EditVehicleDialog driver={editDriver} onClose={() => setEditDriver(null)} onSaved={handleVehicleSaved} />
      <AddDriverDialog
        open={addDriverOpen}
        onClose={() => setAddDriverOpen(false)}
        transportDeptId={user?.transportDepartmentId}
        transportDeptName={user?.transportDepartmentName}
        onSaved={fetchAll}
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

      {assignTaskDriver && (
        <CreateTaskDialog
          open={!!assignTaskDriver}
          onClose={() => setAssignTaskDriver(null)}
          drivers={driversForTask}
          preselectedDriverId={assignTaskDriver.id}
          locationName={user?.location}
          departmentName={user?.transportDepartmentName}
          onCreated={() => { setAssignTaskDriver(null); fetchAll(); }}
        />
      )}
    </div>
  );
}
