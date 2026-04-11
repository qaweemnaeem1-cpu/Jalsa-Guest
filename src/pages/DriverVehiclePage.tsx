import { useCallback, useEffect, useRef, useState } from 'react';
import { Car, ChevronDown, Pencil, Loader2, BarChart2 } from 'lucide-react';
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

// ── types ─────────────────────────────────────────────────────────────────────

interface VehicleStats {
  tasksToday: number;
  tasksThisWeek: number;
  totalTrips: number;
  passengersThisWeek: number;
}

type VehicleType = 'Car' | 'Van' | 'Minibus' | 'Bus';
const VEHICLE_TYPES: VehicleType[] = ['Car', 'Van', 'Minibus', 'Bus'];

const AVAILABILITY_OPTIONS: { value: boolean | null; label: string; dot: string }[] = [
  { value: true,  label: 'Available', dot: 'bg-green-500' },
  { value: false, label: 'Off Duty',  dot: 'bg-red-500' },
];

// ── helpers ───────────────────────────────────────────────────────────────────

function todayStr()    { return new Date().toISOString().split('T')[0]; }
function thisWeekStart() {
  const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().split('T')[0];
}

// ── edit dialog ───────────────────────────────────────────────────────────────

interface EditDialogProps {
  open: boolean;
  initial: { vehicleType: string; vehicleModel: string; vehicleRegistration: string; vehicleCapacity: string };
  onSave: (vals: { vehicleType: string; vehicleModel: string; vehicleRegistration: string; vehicleCapacity: number }) => Promise<void>;
  onClose: () => void;
}

function EditDialog({ open, initial, onSave, onClose }: EditDialogProps) {
  const [type, setType]     = useState(initial.vehicleType);
  const [model, setModel]   = useState(initial.vehicleModel);
  const [reg, setReg]       = useState(initial.vehicleRegistration);
  const [cap, setCap]       = useState(initial.vehicleCapacity);
  const [saving, setSaving] = useState(false);

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setType(initial.vehicleType);
      setModel(initial.vehicleModel);
      setReg(initial.vehicleRegistration);
      setCap(initial.vehicleCapacity);
    }
  }, [open, initial.vehicleType, initial.vehicleModel, initial.vehicleRegistration, initial.vehicleCapacity]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ vehicleType: type, vehicleModel: model, vehicleRegistration: reg, vehicleCapacity: Number(cap) || 0 });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Vehicle Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Vehicle Type */}
          <div className="space-y-1.5">
            <Label>Vehicle Type</Label>
            <select
              value={type}
              onChange={e => setType(e.target.value)}
              className="w-full border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45] bg-white"
            >
              <option value="">Select type…</option>
              {VEHICLE_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Model */}
          <div className="space-y-1.5">
            <Label>Model</Label>
            <Input
              value={model}
              onChange={e => setModel(e.target.value)}
              placeholder="e.g. Toyota Hiace"
              className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]"
            />
          </div>

          {/* Registration */}
          <div className="space-y-1.5">
            <Label>Registration</Label>
            <Input
              value={reg}
              onChange={e => setReg(e.target.value)}
              placeholder="e.g. ABC-1234"
              className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]"
            />
          </div>

          {/* Capacity */}
          <div className="space-y-1.5">
            <Label>Capacity (passengers)</Label>
            <Input
              type="number"
              min={1}
              max={99}
              value={cap}
              onChange={e => setCap(e.target.value)}
              placeholder="e.g. 8"
              className="border-[#E8E3DB] focus:border-[#2D5A45] focus-visible:ring-[#2D5A45]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#2D5A45] hover:bg-[#234839] text-white"
          >
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

  const [stats, setStats]               = useState<VehicleStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [editOpen, setEditOpen]         = useState(false);
  const [availOpen, setAvailOpen]       = useState(false);
  const [updatingAvail, setUpdatingAvail] = useState(false);
  const availMenuRef                    = useRef<HTMLDivElement>(null);
  const statsLoadedRef                  = useRef(false);

  const today     = todayStr();
  const weekStart = thisWeekStart();

  // ── fetch stats ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id || statsLoadedRef.current) return;
    statsLoadedRef.current = true;

    (async () => {
      try {
        const { data } = await supabase
          .from('driver_tasks')
          .select('scheduled_date, passenger_count')
          .eq('driver_id', user.id)
          .eq('status', 'completed');

        const rows = (data ?? []) as { scheduled_date: string; passenger_count?: number }[];
        const tasksToday     = rows.filter(r => r.scheduled_date === today).length;
        const tasksThisWeek  = rows.filter(r => r.scheduled_date >= weekStart).length;
        const totalTrips     = rows.length;
        const passengersThisWeek = rows
          .filter(r => r.scheduled_date >= weekStart)
          .reduce((acc, r) => acc + (r.passenger_count ?? 0), 0);

        setStats({ tasksToday, tasksThisWeek, totalTrips, passengersThisWeek });
      } catch {
        setStats({ tasksToday: 0, tasksThisWeek: 0, totalTrips: 0, passengersThisWeek: 0 });
      } finally {
        setStatsLoading(false);
      }
    })();
  }, [user?.id, today, weekStart]);

  // ── close availability dropdown on outside click ───────────────────────────
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (availMenuRef.current && !availMenuRef.current.contains(e.target as Node)) {
        setAvailOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // ── availability toggle ────────────────────────────────────────────────────
  const handleSetAvailability = useCallback(async (val: boolean) => {
    if (!user?.id) return;
    setAvailOpen(false);
    setUpdatingAvail(true);
    try {
      const { error } = await supabase.from('users').update({ is_available: val }).eq('id', user.id);
      if (error) throw error;
      updateUser({ isAvailable: val });
      toast.success(`Status set to ${val ? 'Available' : 'Off Duty'}`);
    } catch {
      toast.error('Failed to update status');
    } finally {
      setUpdatingAvail(false);
    }
  }, [user?.id, updateUser]);

  // ── save vehicle details ───────────────────────────────────────────────────
  const handleSaveVehicle = useCallback(async (vals: {
    vehicleType: string; vehicleModel: string; vehicleRegistration: string; vehicleCapacity: number;
  }) => {
    if (!user?.id) return;
    const { error } = await supabase.from('users').update({
      vehicle_type:         vals.vehicleType,
      vehicle_model:        vals.vehicleModel,
      vehicle_registration: vals.vehicleRegistration,
      vehicle_capacity:     vals.vehicleCapacity,
    }).eq('id', user.id);

    if (error) {
      toast.error('Failed to update vehicle details');
      throw error;
    }
    updateUser({
      vehicleType:         vals.vehicleType,
      vehicleModel:        vals.vehicleModel,
      vehicleRegistration: vals.vehicleRegistration,
      vehicleCapacity:     vals.vehicleCapacity,
    });
    toast.success('Vehicle details updated');
  }, [user?.id, updateUser]);

  // ── availability display ───────────────────────────────────────────────────
  const isAvail   = user?.isAvailable;
  const availDot  = isAvail === true ? 'bg-green-500' : isAvail === false ? 'bg-red-500' : 'bg-gray-400';
  const availLabel = isAvail === true ? 'Available' : isAvail === false ? 'Off Duty' : 'Unknown';

  return (
    <div className="flex min-h-screen bg-[#F5F0E8]">
      <DriverSidebar />

      <main className="ml-64 flex-1 p-8 max-w-3xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#1A1A1A]">My Vehicle</h1>
          <p className="text-sm text-[#4A4A4A] mt-0.5">Vehicle details and availability status</p>
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
            <button
              onClick={() => setEditOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-[#E8E3DB] rounded-lg text-[#4A4A4A] hover:bg-[#F5F0E8] transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" /> Edit Details
            </button>
          </div>

          {/* Details grid */}
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

          {/* Status row */}
          <div className="flex items-center justify-between pt-4 border-t border-[#E8E3DB]">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${availDot}`} />
              <span className="text-sm font-medium text-[#1A1A1A]">
                {updatingAvail ? 'Saving…' : availLabel}
              </span>
            </div>

            {/* Availability dropdown */}
            <div className="relative" ref={availMenuRef}>
              <button
                onClick={() => setAvailOpen(o => !o)}
                disabled={updatingAvail}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-[#E8E3DB] rounded-lg text-[#4A4A4A] hover:bg-[#F5F0E8] transition-colors disabled:opacity-50"
              >
                Change <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {availOpen && (
                <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-[#E8E3DB] rounded-xl shadow-lg z-20 overflow-hidden">
                  {AVAILABILITY_OPTIONS.map(opt => (
                    <button
                      key={String(opt.value)}
                      onClick={() => handleSetAvailability(opt.value as boolean)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#1A1A1A] hover:bg-[#F5F0E8] transition-colors"
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${opt.dot}`} />
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats card */}
        <div className="bg-white rounded-2xl border border-[#E8E3DB] shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <BarChart2 className="w-5 h-5 text-[#2D5A45]" />
            <h2 className="font-semibold text-[#1A1A1A]">Vehicle Usage Stats</h2>
          </div>

          {statsLoading ? (
            <div className="flex items-center justify-center py-8 text-[#4A4A4A]">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading stats…
            </div>
          ) : stats ? (
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Tasks today',                  value: stats.tasksToday },
                { label: 'Tasks this week',              value: stats.tasksThisWeek },
                { label: 'Total trips',                  value: stats.totalTrips },
                { label: 'Passengers carried this week', value: stats.passengersThisWeek },
              ].map(s => (
                <div key={s.label} className="bg-[#F5F0E8] rounded-xl px-5 py-4">
                  <p className="text-2xl font-bold text-[#2D5A45]">{s.value}</p>
                  <p className="text-xs text-[#4A4A4A] mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#4A4A4A] text-center py-4">Could not load stats.</p>
          )}
        </div>
      </main>

      {/* Edit dialog */}
      <EditDialog
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
    </div>
  );
}
