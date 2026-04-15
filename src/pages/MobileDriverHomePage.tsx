import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPin, Phone, Navigation, Clock, CheckCircle2,
  ChevronRight, AlertCircle, Car, Users, Calendar,
  MessageSquare, X, Check,
} from 'lucide-react';
import MobileDriverLayout from '@/components/MobileDriverLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import type { DriverTask } from '@/types';

// ── Sub-stage for active task (UI only) ──────────────────────────────────────
type SubStage = 'accepted' | 'enRoute' | 'arrived' | 'collected';

const SUB_STAGE_LABELS: Record<SubStage, string> = {
  accepted:  'Accepted',
  enRoute:   'En Route',
  arrived:   'Arrived',
  collected: 'Collected',
};

const SUB_STAGE_ORDER: SubStage[] = ['accepted', 'enRoute', 'arrived', 'collected'];

function getPriorityColor(priority?: string) {
  if (priority === 'vip')    return 'bg-red-100 text-red-700';
  if (priority === 'urgent') return 'bg-amber-100 text-amber-700';
  return 'bg-blue-100 text-blue-700';
}

function getTaskTypeLabel(type?: string) {
  if (type === 'airport_pickup')    return 'Airport Pickup';
  if (type === 'airport_dropoff')   return 'Airport Drop-off';
  if (type === 'mulaqat_transport') return 'Mulaqat Transport';
  return 'Other';
}

// ── New task notification sheet ───────────────────────────────────────────────
function NewTaskSheet({
  task,
  onAccept,
  onDecline,
}: {
  task: DriverTask;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onDecline} />

      {/* Slide-up sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 rounded-t-3xl shadow-2xl p-6 animate-[slideUp_0.3s_ease-out]">
        {/* Handle */}
        <div className="w-10 h-1 bg-gray-300 dark:bg-gray-700 rounded-full mx-auto mb-5" />

        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-0.5">New Task Assigned</p>
            <h3 className="text-lg font-bold text-[#1A1A1A] dark:text-white">{getTaskTypeLabel(task.task_type)}</h3>
          </div>
          <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${getPriorityColor(task.priority)}`}>
            {(task.priority ?? 'normal').toUpperCase()}
          </span>
        </div>

        <div className="space-y-2 mb-5 text-sm text-[#4A4A4A] dark:text-gray-300">
          {task.guest_name && (
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 shrink-0 text-[#2D5A45]" />
              <span>{task.guest_name}</span>
            </div>
          )}
          {task.pickup_location && (
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 shrink-0 text-[#2D5A45]" />
              <span>{task.pickup_location}</span>
            </div>
          )}
          {task.dropoff_location && (
            <div className="flex items-center gap-2">
              <Navigation className="w-4 h-4 shrink-0 text-[#2D5A45]" />
              <span>{task.dropoff_location}</span>
            </div>
          )}
          {task.scheduled_time && (
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 shrink-0 text-[#2D5A45]" />
              <span>{task.scheduled_time} · {task.scheduled_date}</span>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onDecline}
            className="flex-1 py-3.5 rounded-xl border border-[#E8E3DB] dark:border-gray-700 text-[#1A1A1A] dark:text-white font-semibold text-sm flex items-center justify-center gap-2 active:bg-gray-50 dark:active:bg-gray-800"
          >
            <X className="w-4 h-4" /> Decline
          </button>
          <button
            onClick={onAccept}
            className="flex-1 py-3.5 rounded-xl bg-[#2D5A45] text-white font-semibold text-sm flex items-center justify-center gap-2 active:bg-[#234839]"
          >
            <Check className="w-4 h-4" /> Accept
          </button>
        </div>
      </div>
    </>
  );
}

// ── Active task card ──────────────────────────────────────────────────────────
function ActiveTaskCard({
  task,
  subStage,
  onSubStageAdvance,
  onComplete,
}: {
  task: DriverTask;
  subStage: SubStage;
  onSubStageAdvance: () => void;
  onComplete: () => void;
}) {
  const stageIdx = SUB_STAGE_ORDER.indexOf(subStage);
  const isLastStage = stageIdx === SUB_STAGE_ORDER.length - 1;

  const actionLabel = () => {
    if (subStage === 'accepted')  return 'START JOURNEY';
    if (subStage === 'enRoute')   return 'MARK ARRIVED';
    if (subStage === 'arrived')   return 'GUEST COLLECTED';
    return 'TRIP COMPLETED';
  };

  return (
    <div className="mx-4 mt-4 rounded-2xl bg-white dark:bg-gray-900 shadow-md overflow-hidden border border-[#E8E3DB] dark:border-gray-800">
      {/* Header */}
      <div className="bg-[#2D5A45] px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-white/70 text-xs mb-0.5">Active Task</p>
          <h3 className="text-white font-bold text-sm">{getTaskTypeLabel(task.task_type)}</h3>
        </div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${getPriorityColor(task.priority)}`}>
          {(task.priority ?? 'normal').toUpperCase()}
        </span>
      </div>

      <div className="p-4 space-y-3">
        {/* Guest info */}
        {task.guest_name && (
          <div className="flex items-center gap-2 text-sm">
            <Users className="w-4 h-4 text-[#2D5A45] shrink-0" />
            <span className="font-medium text-[#1A1A1A] dark:text-white">{task.guest_name}</span>
          </div>
        )}
        {task.delegation_name && (
          <p className="text-xs text-[#4A4A4A] dark:text-gray-400 -mt-1 pl-6">{task.delegation_name}</p>
        )}

        {/* Route */}
        <div className="bg-[#F5F0E8] dark:bg-gray-800 rounded-xl p-3 space-y-2">
          {task.pickup_location && (
            <div className="flex items-start gap-2 text-sm">
              <div className="w-2 h-2 rounded-full bg-[#2D5A45] mt-1 shrink-0" />
              <span className="text-[#1A1A1A] dark:text-white">{task.pickup_location}</span>
            </div>
          )}
          <div className="w-0.5 h-3 bg-[#D4CFC7] dark:bg-gray-600 ml-[3px]" />
          {task.dropoff_location && (
            <div className="flex items-start gap-2 text-sm">
              <MapPin className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <span className="text-[#1A1A1A] dark:text-white">{task.dropoff_location}</span>
            </div>
          )}
        </div>

        {/* Progress stepper */}
        <div className="flex items-center justify-between pt-1">
          {SUB_STAGE_ORDER.map((s, i) => {
            const done = i < stageIdx;
            const active = i === stageIdx;
            return (
              <div key={s} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      done   ? 'bg-[#2D5A45] text-white'
                      : active ? 'bg-[#2D5A45]/20 border-2 border-[#2D5A45] text-[#2D5A45] dark:border-emerald-400 dark:text-emerald-400'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-400'
                    }`}
                  >
                    {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
                  </div>
                  <span className={`text-[9px] mt-0.5 font-medium ${active ? 'text-[#2D5A45] dark:text-emerald-400' : 'text-gray-400'}`}>
                    {SUB_STAGE_LABELS[s]}
                  </span>
                </div>
                {i < SUB_STAGE_ORDER.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 mb-3 ${i < stageIdx ? 'bg-[#2D5A45]' : 'bg-gray-200 dark:bg-gray-700'}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 pt-1">
          <a
            href={`tel:`}
            className="flex-1 py-3 rounded-xl border border-[#E8E3DB] dark:border-gray-700 flex items-center justify-center gap-1.5 text-sm font-medium text-[#1A1A1A] dark:text-white active:bg-gray-50 dark:active:bg-gray-800"
          >
            <Phone className="w-4 h-4 text-[#2D5A45]" /> Call
          </a>
          <a
            href={task.dropoff_location ? `https://maps.google.com/?q=${encodeURIComponent(task.dropoff_location)}` : '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-3 rounded-xl border border-[#E8E3DB] dark:border-gray-700 flex items-center justify-center gap-1.5 text-sm font-medium text-[#1A1A1A] dark:text-white active:bg-gray-50 dark:active:bg-gray-800"
          >
            <Navigation className="w-4 h-4 text-[#2D5A45]" /> Navigate
          </a>
        </div>

        {/* Main CTA */}
        <button
          onClick={isLastStage ? onComplete : onSubStageAdvance}
          className={`w-full py-4 rounded-xl text-white font-bold text-sm tracking-wide ${
            isLastStage
              ? 'bg-emerald-600 active:bg-emerald-700'
              : 'bg-[#2D5A45] active:bg-[#234839]'
          }`}
        >
          {actionLabel()}
        </button>

        {/* Handover link */}
        <button className="w-full text-xs text-center text-[#4A4A4A] dark:text-gray-400 py-1">
          Request Handover
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MobileDriverHomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [isAvailable, setIsAvailable] = useState(user?.isAvailable ?? true);
  const [todayTasks, setTodayTasks]   = useState<DriverTask[]>([]);
  const [activeTask, setActiveTask]   = useState<DriverTask | null>(null);
  const [newTask, setNewTask]         = useState<DriverTask | null>(null);
  const [subStage, setSubStage]       = useState<SubStage>('accepted');
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [loading, setLoading]         = useState(true);

  const today = new Date().toISOString().split('T')[0];

  // Fetch today's tasks + active task
  const fetchTasks = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('driver_tasks')
      .select('*')
      .eq('driver_id', user.id)
      .eq('scheduled_date', today)
      .neq('status', 'cancelled')
      .order('scheduled_time', { ascending: true });

    if (data) {
      const active = data.find(t => t.status === 'in_progress') ?? null;
      setActiveTask(active as DriverTask | null);
      setTodayTasks(data as DriverTask[]);
    }
    setLoading(false);
  }, [user?.id, today]);

  // Fetch unread messages
  const fetchUnread = useCallback(async () => {
    if (!user?.id) return;
    const { count } = await supabase
      .from('driver_messages')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', user.id)
      .eq('is_read', false);
    setUnreadMessages(count ?? 0);
  }, [user?.id]);

  useEffect(() => {
    fetchTasks();
    fetchUnread();
  }, [fetchTasks, fetchUnread]);

  // Real-time: listen for new suggested tasks assigned to this driver
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`mobile-driver-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'driver_tasks',
          filter: `driver_id=eq.${user.id}`,
        },
        (payload) => {
          const task = payload.new as DriverTask;
          if (task.status === 'suggested' || task.status === 'pending') {
            setNewTask(task);
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  // Accept task
  const handleAccept = async () => {
    if (!newTask) return;
    await supabase
      .from('driver_tasks')
      .update({ status: 'pending' })
      .eq('id', newTask.id);
    setTodayTasks(prev => [...prev, { ...newTask, status: 'pending' }]);
    setNewTask(null);
  };

  // Decline task
  const handleDecline = async () => {
    if (!newTask) return;
    await supabase
      .from('driver_tasks')
      .update({ status: 'cancelled' })
      .eq('id', newTask.id);
    setNewTask(null);
  };

  // Advance sub-stage (only last stage writes to DB)
  const handleSubStageAdvance = async () => {
    const idx = SUB_STAGE_ORDER.indexOf(subStage);
    if (idx < SUB_STAGE_ORDER.length - 1) {
      setSubStage(SUB_STAGE_ORDER[idx + 1]);
    }
  };

  // Trip completed → write to DB
  const handleComplete = async () => {
    if (!activeTask) return;
    await supabase
      .from('driver_tasks')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', activeTask.id);
    setActiveTask(null);
    setSubStage('accepted');
    fetchTasks();
  };

  // Toggle availability (optimistic)
  const handleAvailabilityToggle = async () => {
    const next = !isAvailable;
    setIsAvailable(next);
    if (user?.id) {
      await supabase
        .from('users')
        .update({ is_available: next })
        .eq('id', user.id);
    }
  };

  const pendingTasks = todayTasks.filter(t => t.status === 'pending');

  return (
    <MobileDriverLayout unreadMessages={unreadMessages}>
      {loading ? (
        <div className="flex items-center justify-center h-40 text-[#4A4A4A] dark:text-gray-400 text-sm">
          Loading…
        </div>
      ) : activeTask ? (
        // ── State 3: Active task ──────────────────────────────────────
        <ActiveTaskCard
          task={activeTask}
          subStage={subStage}
          onSubStageAdvance={handleSubStageAdvance}
          onComplete={handleComplete}
        />
      ) : (
        // ── State 1: Idle ─────────────────────────────────────────────
        <div className="px-4 py-4 space-y-4">

          {/* Vehicle card */}
          <div className="rounded-2xl bg-[#2D5A45] dark:bg-gray-900 p-4 text-white shadow-md">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                <Car className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-white/70 text-xs">Your Vehicle</p>
                <p className="font-bold text-sm">
                  {user?.vehicleModel ?? 'No vehicle assigned'}
                </p>
              </div>
              <ChevronRight
                className="ml-auto w-4 h-4 text-white/50 cursor-pointer"
                onClick={() => navigate('/driver/vehicle')}
              />
            </div>
            <div className="flex gap-4 text-sm">
              <div>
                <p className="text-white/60 text-xs">Reg.</p>
                <p className="font-medium">{user?.vehicleRegistration ?? '—'}</p>
              </div>
              <div>
                <p className="text-white/60 text-xs">Type</p>
                <p className="font-medium">{user?.vehicleType ?? '—'}</p>
              </div>
              <div>
                <p className="text-white/60 text-xs">Capacity</p>
                <p className="font-medium">{user?.vehicleCapacity ? `${user.vehicleCapacity} pax` : '—'}</p>
              </div>
            </div>
          </div>

          {/* Availability toggle */}
          <div className="rounded-2xl bg-white dark:bg-gray-900 border border-[#E8E3DB] dark:border-gray-800 p-4 flex items-center justify-between shadow-sm">
            <div>
              <p className="font-semibold text-[#1A1A1A] dark:text-white text-sm">Availability</p>
              <p className={`text-xs mt-0.5 ${isAvailable ? 'text-emerald-600' : 'text-gray-400'}`}>
                {isAvailable ? 'You are on duty' : 'You are off duty'}
              </p>
            </div>
            <button
              onClick={handleAvailabilityToggle}
              className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${
                isAvailable ? 'bg-[#2D5A45]' : 'bg-gray-300 dark:bg-gray-700'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
                  isAvailable ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Today's tasks */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-bold text-[#1A1A1A] dark:text-white text-sm">Today's Tasks</h2>
              <button
                onClick={() => navigate('/driver/tasks')}
                className="text-xs text-[#2D5A45] dark:text-emerald-400 font-medium"
              >
                View all
              </button>
            </div>

            {pendingTasks.length === 0 ? (
              <div className="rounded-2xl bg-white dark:bg-gray-900 border border-[#E8E3DB] dark:border-gray-800 p-6 text-center">
                <Calendar className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <p className="text-sm text-[#4A4A4A] dark:text-gray-400">No tasks scheduled for today</p>
              </div>
            ) : (
              <div className="space-y-2">
                {pendingTasks.map(task => (
                  <div
                    key={task.id}
                    className="rounded-2xl bg-white dark:bg-gray-900 border border-[#E8E3DB] dark:border-gray-800 p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div>
                        <p className="font-semibold text-[#1A1A1A] dark:text-white text-sm">
                          {getTaskTypeLabel(task.task_type)}
                        </p>
                        {task.guest_name && (
                          <p className="text-xs text-[#4A4A4A] dark:text-gray-400 mt-0.5">{task.guest_name}</p>
                        )}
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${getPriorityColor(task.priority)}`}>
                        {(task.priority ?? 'normal').toUpperCase()}
                      </span>
                    </div>
                    {task.scheduled_time && (
                      <div className="flex items-center gap-1.5 text-xs text-[#4A4A4A] dark:text-gray-400 mt-1">
                        <Clock className="w-3.5 h-3.5" />
                        {task.scheduled_time}
                      </div>
                    )}
                    {task.pickup_location && (
                      <div className="flex items-center gap-1.5 text-xs text-[#4A4A4A] dark:text-gray-400 mt-1">
                        <MapPin className="w-3.5 h-3.5" />
                        {task.pickup_location}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Unread messages banner */}
          {unreadMessages > 0 && (
            <button
              onClick={() => navigate('/driver/messages')}
              className="w-full rounded-2xl bg-[#2D5A45]/10 dark:bg-emerald-900/20 border border-[#2D5A45]/20 p-3 flex items-center gap-3"
            >
              <div className="w-8 h-8 rounded-full bg-[#2D5A45] flex items-center justify-center shrink-0">
                <MessageSquare className="w-4 h-4 text-white" />
              </div>
              <div className="text-left flex-1">
                <p className="text-sm font-semibold text-[#2D5A45] dark:text-emerald-400">
                  {unreadMessages} unread {unreadMessages === 1 ? 'message' : 'messages'}
                </p>
                <p className="text-xs text-[#4A4A4A] dark:text-gray-400">Tap to view</p>
              </div>
              <ChevronRight className="w-4 h-4 text-[#2D5A45] dark:text-emerald-400" />
            </button>
          )}
        </div>
      )}

      {/* ── State 2: New task notification sheet ── */}
      {newTask && (
        <NewTaskSheet
          task={newTask}
          onAccept={handleAccept}
          onDecline={handleDecline}
        />
      )}
    </MobileDriverLayout>
  );
}
