/**
 * Task Handover dialog — transfer a pending/in_progress task to another driver.
 * Used by: DriverTasksPage, DriverAllTasksPage, DriverTaskViewDialog,
 *          LocationDriversPage, DeptDriversPage, AdminDriversPage.
 */
import { useEffect, useState } from 'react';
import { ArrowRightLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface HandoverTask {
  id: string;
  driver_id: string;
  driver_name?: string;
  guest_name?: string;
  task_type: string;
  location?: string;
}

interface DriverOption {
  id: string;
  name: string;
  vehicle_type?: string;
  vehicle_capacity?: number;
  is_available?: boolean;
  tasksToday?: number;
}

interface HandoverDialogProps {
  open: boolean;
  onClose: () => void;
  task: HandoverTask | null;
  /** Location to filter available drivers */
  locationName?: string;
  /** Drivers already loaded in the parent (avoids extra fetch) */
  preloadedDrivers?: DriverOption[];
  onHandedOver?: (taskId: string, newDriverId: string, newDriverName: string) => void;
}

const TASK_TYPE_LABELS: Record<string, string> = {
  airport_pickup:    'Airport Pickup',
  airport_dropoff:   'Airport Drop-off',
  mulaqat_transport: 'Mulaqat Transport',
  other:             'Other',
};

export function HandoverDialog({
  open, onClose, task, locationName, preloadedDrivers, onHandedOver,
}: HandoverDialogProps) {
  const [drivers, setDrivers]         = useState<DriverOption[]>([]);
  const [newDriverId, setNewDriverId] = useState('');
  const [reason, setReason]           = useState('');
  const [saving, setSaving]           = useState(false);

  // Reset state on open
  useEffect(() => {
    if (!open) return;
    setNewDriverId('');
    setReason('');
    setSaving(false);

    if (preloadedDrivers) {
      // Exclude the current driver from the list
      setDrivers(preloadedDrivers.filter(d => d.id !== task?.driver_id));
      return;
    }

    // Fetch drivers at this location
    const loc = locationName ?? task?.location ?? '';
    if (!loc) return;

    supabase
      .from('users')
      .select('id,name,vehicle_type,vehicle_capacity,is_available')
      .eq('role', 'driver')
      .eq('location', loc)
      .neq('id', task?.driver_id ?? '')
      .then(async ({ data }) => {
        const driverList = (data ?? []) as DriverOption[];

        // Batch fetch today task counts
        const today = new Date().toISOString().substring(0, 10);
        const { data: taskRows } = await supabase
          .from('driver_tasks')
          .select('driver_id')
          .eq('scheduled_date', today)
          .neq('status', 'cancelled');

        const countMap: Record<string, number> = {};
        for (const t of taskRows ?? []) {
          countMap[t.driver_id] = (countMap[t.driver_id] ?? 0) + 1;
        }

        setDrivers(driverList.map(d => ({ ...d, tasksToday: countMap[d.id] ?? 0 })));
      });
  }, [open, task?.driver_id, task?.location, locationName, preloadedDrivers]);

  const handleHandover = async () => {
    if (!task || !newDriverId) { toast.error('Select a driver'); return; }

    const selected = drivers.find(d => d.id === newDriverId);
    if (!selected) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('driver_tasks')
        .update({
          driver_id:             newDriverId,
          driver_name:           selected.name,
          handed_over_from:      task.driver_id,
          handed_over_from_name: task.driver_name ?? null,
          handed_over_at:        new Date().toISOString(),
          handover_reason:       reason.trim() || null,
          updated_at:            new Date().toISOString(),
        })
        .eq('id', task.id);

      if (error) throw error;
      toast.success(`Task handed over to ${selected.name}`);
      onHandedOver?.(task.id, newDriverId, selected.name);
      onClose();
    } catch {
      toast.error('Failed to handover task');
    } finally {
      setSaving(false);
    }
  };

  if (!task) return null;

  const label = task.guest_name
    ? `${TASK_TYPE_LABELS[task.task_type] ?? task.task_type} — ${task.guest_name}`
    : (TASK_TYPE_LABELS[task.task_type] ?? task.task_type);

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-amber-600" />
            Handover Task
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Task summary */}
          <div className="bg-[#F5F0E8] rounded-xl p-3 space-y-1 text-sm">
            <p className="font-medium text-[#1A1A1A]">{label}</p>
            {task.driver_name && (
              <p className="text-[#4A4A4A]">Currently assigned to: <span className="font-medium">{task.driver_name}</span></p>
            )}
          </div>

          {/* Driver select */}
          <div className="space-y-1.5">
            <Label>Transfer to <span className="text-red-500">*</span></Label>
            {drivers.length === 0 ? (
              <p className="text-sm text-[#4A4A4A] italic">No other drivers available at this location.</p>
            ) : (
              <select
                value={newDriverId}
                onChange={e => setNewDriverId(e.target.value)}
                className="w-full border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45] bg-white"
              >
                <option value="">Select driver…</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                    {d.vehicle_type ? ` · ${d.vehicle_type}` : ''}
                    {d.vehicle_capacity != null ? ` (${d.vehicle_capacity} pax)` : ''}
                    {d.tasksToday != null ? ` · ${d.tasksToday} tasks today` : ''}
                    {d.is_available === false ? ' · Off Duty' : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Reason */}
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Traffic delay, Vehicle issue…"
              rows={2}
              className="w-full border border-[#E8E3DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2D5A45] resize-none bg-white"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            onClick={handleHandover}
            disabled={saving || !newDriverId}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin mr-1.5" />Handing over…</>
              : <><ArrowRightLeft className="w-4 h-4 mr-1.5" />Handover</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
