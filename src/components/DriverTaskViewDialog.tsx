/**
 * View upcoming/recent tasks for a specific driver.
 * Used by: LocationDriversPage, DeptDriversPage, AdminDriversPage, DriverAllDriversPage.
 */
import { useEffect, useState } from 'react';
import { Loader2, MapPin, Clock, Calendar } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface TaskRow {
  id: string;
  task_type: string;
  status: string;
  scheduled_date: string;
  scheduled_time?: string;
  pickup_location?: string;
  dropoff_location?: string;
  guest_name?: string;
  flight_number?: string;
  passenger_count?: number;
  notes?: string;
}

const TYPE_LABELS: Record<string, string> = {
  airport_pickup: 'Airport Pickup',
  airport_dropoff: 'Airport Drop-off',
  mulaqat_transport: 'Mulaqat Transport',
  other: 'Other',
};

const STATUS_COLORS: Record<string, string> = {
  suggested: 'bg-blue-100 text-blue-700',
  pending: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-emerald-100 text-emerald-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

interface DriverTaskViewDialogProps {
  open: boolean;
  onClose: () => void;
  driverName: string;
  driverId: string;
}

export function DriverTaskViewDialog({ open, onClose, driverName, driverId }: DriverTaskViewDialogProps) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !driverId) return;
    setLoading(true);
    const today = new Date().toISOString().substring(0, 10);
    supabase
      .from('driver_tasks')
      .select('id,task_type,status,scheduled_date,scheduled_time,pickup_location,dropoff_location,guest_name,flight_number,passenger_count,notes')
      .eq('driver_id', driverId)
      .gte('scheduled_date', today)
      .neq('status', 'cancelled')
      .order('scheduled_date', { ascending: true })
      .order('scheduled_time', { ascending: true })
      .limit(30)
      .then(({ data }) => {
        setTasks((data ?? []) as TaskRow[]);
        setLoading(false);
      });
  }, [open, driverId]);

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Tasks — {driverName}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-[#2D5A45]" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-8 text-[#4A4A4A] text-sm">No upcoming tasks</div>
        ) : (
          <div className="space-y-3">
            {tasks.map(t => (
              <div key={t.id} className="border border-[#E8E3DB] rounded-xl p-3 bg-white space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-sm font-medium text-[#1A1A1A]">{TYPE_LABELS[t.task_type] ?? t.task_type}</span>
                    {t.guest_name && <span className="text-xs text-[#4A4A4A] ml-2">· {t.guest_name}</span>}
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[t.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {t.status}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-[#4A4A4A]">
                  <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{t.scheduled_date}</span>
                  {t.scheduled_time && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{t.scheduled_time}</span>}
                  {t.passenger_count && <span>{t.passenger_count} pax</span>}
                  {t.flight_number && <span>✈ {t.flight_number}</span>}
                </div>
                {(t.pickup_location || t.dropoff_location) && (
                  <div className="flex items-center gap-1 text-xs text-[#4A4A4A]">
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span>{t.pickup_location}</span>
                    {t.pickup_location && t.dropoff_location && <span className="mx-1">→</span>}
                    <span>{t.dropoff_location}</span>
                  </div>
                )}
                {t.notes && <p className="text-xs text-[#4A4A4A] italic">{t.notes}</p>}
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
