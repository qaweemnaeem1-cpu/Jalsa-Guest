import { useState, useEffect, useCallback } from 'react';
import { Clock, MapPin, CheckCircle2, AlertCircle, ClipboardList } from 'lucide-react';
import MobileDriverLayout from '@/components/MobileDriverLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import type { DriverTask } from '@/types';

type FilterTab = 'today' | 'upcoming' | 'completed';

function getPriorityColor(priority?: string) {
  if (priority === 'vip')    return 'bg-red-100 text-red-700';
  if (priority === 'urgent') return 'bg-amber-100 text-amber-700';
  return 'bg-blue-100 text-blue-700';
}

function getStatusIcon(status: string) {
  if (status === 'completed')  return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
  if (status === 'in_progress') return <AlertCircle className="w-4 h-4 text-amber-500" />;
  return <Clock className="w-4 h-4 text-[#4A4A4A] dark:text-gray-400" />;
}

function getTaskTypeLabel(type?: string) {
  if (type === 'airport_pickup')    return 'Airport Pickup';
  if (type === 'airport_dropoff')   return 'Airport Drop-off';
  if (type === 'mulaqat_transport') return 'Mulaqat Transport';
  return 'Other';
}

export default function MobileDriverTasksPage() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<FilterTab>('today');
  const [tasks, setTasks]   = useState<DriverTask[]>([]);
  const [loading, setLoading] = useState(true);

  const today = new Date().toISOString().split('T')[0];

  const fetchTasks = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    let query = supabase
      .from('driver_tasks')
      .select('*')
      .eq('driver_id', user.id)
      .neq('status', 'cancelled')
      .order('scheduled_date', { ascending: true })
      .order('scheduled_time', { ascending: true });

    if (filter === 'today') {
      query = query.eq('scheduled_date', today).neq('status', 'completed');
    } else if (filter === 'upcoming') {
      query = query.gt('scheduled_date', today);
    } else {
      query = query.eq('status', 'completed');
    }

    const { data } = await query;
    setTasks((data ?? []) as DriverTask[]);
    setLoading(false);
  }, [user?.id, filter, today]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'today',     label: 'Today'     },
    { key: 'upcoming',  label: 'Upcoming'  },
    { key: 'completed', label: 'Completed' },
  ];

  return (
    <MobileDriverLayout>
      <div className="px-4 py-4">
        {/* Filter tabs */}
        <div className="flex gap-1 bg-[#F5F0E8] dark:bg-gray-800 rounded-xl p-1 mb-4">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                filter === t.key
                  ? 'bg-white dark:bg-gray-700 text-[#2D5A45] dark:text-emerald-400 shadow-sm'
                  : 'text-[#4A4A4A] dark:text-gray-400'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40 text-[#4A4A4A] dark:text-gray-400 text-sm">
            Loading…
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <ClipboardList className="w-10 h-10 text-gray-200 dark:text-gray-700" />
            <p className="text-sm text-[#4A4A4A] dark:text-gray-400">No tasks found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map(task => (
              <div
                key={task.id}
                className="bg-white dark:bg-gray-900 rounded-2xl border border-[#E8E3DB] dark:border-gray-800 p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(task.status)}
                    <p className="font-semibold text-[#1A1A1A] dark:text-white text-sm">
                      {getTaskTypeLabel(task.task_type)}
                    </p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${getPriorityColor(task.priority)}`}>
                    {(task.priority ?? 'normal').toUpperCase()}
                  </span>
                </div>

                {task.guest_name && (
                  <p className="text-xs text-[#4A4A4A] dark:text-gray-400 mb-2 pl-6">{task.guest_name}</p>
                )}

                <div className="space-y-1 pl-6">
                  {task.scheduled_time && (
                    <div className="flex items-center gap-1.5 text-xs text-[#4A4A4A] dark:text-gray-400">
                      <Clock className="w-3.5 h-3.5" />
                      {task.scheduled_date} · {task.scheduled_time}
                    </div>
                  )}
                  {task.pickup_location && (
                    <div className="flex items-center gap-1.5 text-xs text-[#4A4A4A] dark:text-gray-400">
                      <MapPin className="w-3.5 h-3.5" />
                      {task.pickup_location}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </MobileDriverLayout>
  );
}
