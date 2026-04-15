import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock, MapPin, Check, X, ChevronRight, ChevronDown, ChevronUp,
  Plane, Users, ClipboardList, RotateCcw, Star,
} from 'lucide-react';
import MobileDriverLayout from '@/components/MobileDriverLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import type { DriverTask } from '@/types';

// ── Types ─────────────────────────────────────────────────────────────────────
type DateFilter = 'today' | 'tomorrow' | 'week' | 'all';
type TypeFilter = 'all' | 'pickups' | 'dropoffs';

// ── Helpers ───────────────────────────────────────────────────────────────────
function getISODate(offsetDays: number) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

function getPriorityStripe(priority?: string) {
  if (priority === 'vip')    return 'border-t-4 border-red-500';
  if (priority === 'urgent') return 'border-t-4 border-amber-500';
  return 'border-t-4 border-gray-200 dark:border-gray-700';
}

function getPriorityBadge(priority?: string) {
  if (priority === 'vip')    return 'bg-red-100 text-red-700';
  if (priority === 'urgent') return 'bg-amber-100 text-amber-700';
  return 'bg-blue-100 text-blue-700';
}

function getTypeLabel(type?: string) {
  if (type === 'airport_pickup')    return 'PICKUP';
  if (type === 'airport_dropoff')   return 'DROPOFF';
  if (type === 'mulaqat_transport') return 'MULAQAT';
  return 'OTHER';
}

function getTypeIcon(type?: string) {
  if (type === 'airport_pickup' || type === 'airport_dropoff') return <Plane className="w-3.5 h-3.5" />;
  if (type === 'mulaqat_transport') return <Users className="w-3.5 h-3.5" />;
  return <Clock className="w-3.5 h-3.5" />;
}

function fmtTime(time?: string) {
  if (!time) return '';
  return time.slice(0, 5); // HH:MM
}

/** Read the UI sub-stage for an in-progress task from localStorage */
function getSubStageLabel(taskId: string): string {
  const s = localStorage.getItem(`task_substage_${taskId}`);
  if (s === 'arrived')   return 'Arrived';
  if (s === 'collected') return 'Collected';
  return 'En Route';
}

// ── Swipeable card ────────────────────────────────────────────────────────────
function SwipeCard({
  onAccept,
  onDecline,
  children,
}: {
  onAccept: () => void;
  onDecline: () => void;
  children: React.ReactNode;
}) {
  const [offset, setOffset] = useState(0);
  const [animating, setAnimating] = useState(false);
  const startX = useRef(0);
  const active = useRef(false);
  const THRESHOLD = 80;

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    active.current = true;
    setAnimating(false);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!active.current) return;
    const delta = e.touches[0].clientX - startX.current;
    setOffset(Math.max(-110, Math.min(110, delta)));
  };

  const onTouchEnd = () => {
    active.current = false;
    setAnimating(true);
    if (offset >= THRESHOLD)       { onAccept(); return; }
    if (offset <= -THRESHOLD)      { onDecline(); return; }
    setOffset(0);
  };

  const revealAccept  = offset > 30;
  const revealDecline = offset < -30;

  return (
    <div className="relative mx-4 mb-3 rounded-2xl overflow-hidden">
      {/* Reveal layer */}
      <div className={`absolute inset-0 flex items-center justify-between px-5 rounded-2xl transition-colors ${
        revealAccept ? 'bg-emerald-100 dark:bg-emerald-900/30' :
        revealDecline ? 'bg-red-100 dark:bg-red-900/30' : ''
      }`}>
        <span className={`flex items-center gap-1 text-sm font-bold text-emerald-700 transition-opacity ${revealAccept ? 'opacity-100' : 'opacity-0'}`}>
          <Check className="w-4 h-4" /> ACCEPT
        </span>
        <span className={`flex items-center gap-1 text-sm font-bold text-red-600 transition-opacity ${revealDecline ? 'opacity-100' : 'opacity-0'}`}>
          DECLINE <X className="w-4 h-4" />
        </span>
      </div>

      {/* Card */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          transform: `translateX(${offset}px)`,
          transition: animating ? 'transform 0.25s ease' : 'none',
        }}
        className="relative z-10"
      >
        {children}
      </div>
    </div>
  );
}

// ── Section header ─────────────────────────────────────────────────────────────
function SectionHeader({
  label,
  count,
  badgeRed,
  collapsible,
  expanded,
  onToggle,
}: {
  label: string;
  count: number;
  badgeRed?: boolean;
  collapsible?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div
      className={`flex items-center justify-between px-4 pt-5 pb-2 ${collapsible ? 'cursor-pointer' : ''}`}
      onClick={collapsible ? onToggle : undefined}
    >
      <div className="flex items-center gap-2">
        <span className="font-bold text-[#1A1A1A] dark:text-white text-sm">{label}</span>
        {count > 0 && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center ${
            badgeRed ? 'bg-red-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
          }`}>
            {count}
          </span>
        )}
      </div>
      {collapsible && (
        <span className="text-[#4A4A4A] dark:text-gray-400">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </span>
      )}
    </div>
  );
}

// ── Suggested task card ────────────────────────────────────────────────────────
function SuggestedCard({ task }: { task: DriverTask }) {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl shadow-sm ${getPriorityStripe(task.priority)}`}>
      {/* VIP special guest banner */}
      {task.priority === 'vip' && (
        <div className="flex items-center gap-1.5 px-4 py-1.5 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 rounded-t-2xl">
          <Star className="w-3.5 h-3.5 text-amber-500 shrink-0" fill="currentColor" />
          <span className="text-xs font-bold text-amber-700 dark:text-amber-400 tracking-wide uppercase">Special Guest</span>
        </div>
      )}
      {/* Top meta row */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getPriorityBadge(task.priority)}`}>
          {(task.priority ?? 'NORMAL').toUpperCase()}
        </span>
        <span className="flex items-center gap-1 text-xs text-[#4A4A4A] dark:text-gray-400 font-medium">
          {getTypeIcon(task.task_type)} {getTypeLabel(task.task_type)}
        </span>
        {task.scheduled_time && (
          <span className="ml-auto text-xs font-semibold text-[#1A1A1A] dark:text-white">
            {fmtTime(task.scheduled_time)}
          </span>
        )}
      </div>

      {/* Guest row */}
      <div className="px-4 pb-3 flex items-start gap-3">
        {/* Photo placeholder */}
        <div className="w-12 h-12 rounded-xl bg-[#2D5A45]/10 dark:bg-emerald-900/30 flex items-center justify-center shrink-0 text-[#2D5A45] dark:text-emerald-400 font-bold text-base">
          {task.guest_name ? task.guest_name[0] : '?'}
        </div>
        <div className="flex-1 min-w-0">
          {task.guest_name && (
            <p className="font-semibold text-[#1A1A1A] dark:text-white text-sm truncate">{task.guest_name}</p>
          )}
          {task.delegation_name && (
            <p className="text-xs text-[#4A4A4A] dark:text-gray-400 truncate">{task.delegation_name}</p>
          )}
          {task.passenger_count && task.passenger_count > 1 && (
            <p className="text-xs text-[#4A4A4A] dark:text-gray-400 flex items-center gap-1 mt-0.5">
              <Users className="w-3 h-3" /> {task.passenger_count} passengers
            </p>
          )}
        </div>
      </div>

      {/* Route */}
      <div className="mx-4 mb-3 bg-[#F5F0E8] dark:bg-gray-700/50 rounded-xl p-3 space-y-1.5">
        {task.pickup_location && (
          <div className="flex items-start gap-2 text-xs">
            <div className="w-2 h-2 rounded-full bg-[#2D5A45] mt-0.5 shrink-0" />
            <span className="text-[#1A1A1A] dark:text-white">{task.pickup_location}</span>
          </div>
        )}
        <div className="w-0.5 h-2 bg-[#D4CFC7] dark:bg-gray-600 ml-[3px]" />
        {task.dropoff_location && (
          <div className="flex items-start gap-2 text-xs">
            <MapPin className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
            <span className="text-[#1A1A1A] dark:text-white">{task.dropoff_location}</span>
          </div>
        )}
        {task.flight_number && (
          <div className="flex items-center gap-2 text-xs text-[#4A4A4A] dark:text-gray-400 pt-0.5">
            <Plane className="w-3 h-3" />
            <span>{task.flight_number}</span>
            {task.passenger_count && <span>· {task.passenger_count} pax</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Active task card ───────────────────────────────────────────────────────────
function ActiveCard({ task, onPress }: { task: DriverTask; onPress: () => void }) {
  const subStageLabel = getSubStageLabel(task.id);
  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-2xl shadow-sm mx-4 mb-3 ${getPriorityStripe(task.priority)} active:scale-[0.98] transition-transform cursor-pointer`}
      onClick={onPress}
    >
      {task.priority === 'vip' && (
        <div className="flex items-center gap-1.5 px-4 py-1.5 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 rounded-t-2xl">
          <Star className="w-3.5 h-3.5 text-amber-500 shrink-0" fill="currentColor" />
          <span className="text-xs font-bold text-amber-700 dark:text-amber-400 tracking-wide uppercase">Special Guest</span>
        </div>
      )}
      <div className="px-4 pt-3 pb-1 flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_6px_2px_rgba(59,130,246,0.5)]" />
        <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wide">In Progress · {subStageLabel}</span>
        <ChevronRight className="ml-auto w-4 h-4 text-[#4A4A4A] dark:text-gray-400" />
      </div>
      <div className="px-4 py-2 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#2D5A45]/10 dark:bg-emerald-900/30 flex items-center justify-center shrink-0 text-[#2D5A45] dark:text-emerald-400 font-bold">
          {task.guest_name ? task.guest_name[0] : '?'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="flex items-center gap-1 text-xs text-[#4A4A4A] dark:text-gray-400">
              {getTypeIcon(task.task_type)} {getTypeLabel(task.task_type)}
            </span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${getPriorityBadge(task.priority)}`}>
              {(task.priority ?? 'Normal').toUpperCase()}
            </span>
            {task.scheduled_time && (
              <span className="text-xs text-[#4A4A4A] dark:text-gray-400">{fmtTime(task.scheduled_time)}</span>
            )}
          </div>
          {task.guest_name && (
            <p className="font-semibold text-[#1A1A1A] dark:text-white text-sm truncate">{task.guest_name}</p>
          )}
          {task.pickup_location && (
            <p className="text-xs text-[#4A4A4A] dark:text-gray-400 truncate mt-0.5">
              📍 {task.pickup_location}{task.dropoff_location ? ` → ${task.dropoff_location}` : ''}
            </p>
          )}
        </div>
      </div>
      <div className="px-4 pb-3">
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl px-3 py-2 flex items-center justify-between">
          <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Tap to manage this task</span>
          <ChevronRight className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
        </div>
      </div>
    </div>
  );
}

// ── Upcoming compact card ──────────────────────────────────────────────────────
function UpcomingCard({ task, onPress }: { task: DriverTask; onPress: () => void }) {
  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm mx-4 mb-2 active:scale-[0.98] transition-transform cursor-pointer overflow-hidden ${task.priority === 'vip' ? 'border-l-4 border-amber-400' : ''}`}
      onClick={onPress}
    >
      {task.priority === 'vip' && (
        <div className="flex items-center gap-1.5 px-4 py-1 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
          <Star className="w-3 h-3 text-amber-500 shrink-0" fill="currentColor" />
          <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 tracking-wide uppercase">Special Guest</span>
        </div>
      )}
      <div className="px-4 py-3 flex items-center gap-3">
      <div className="flex flex-col items-center w-10 shrink-0">
        {task.scheduled_time
          ? <span className="text-xs font-bold text-[#2D5A45] dark:text-emerald-400">{fmtTime(task.scheduled_time)}</span>
          : <Clock className="w-4 h-4 text-[#4A4A4A] dark:text-gray-400" />
        }
        <span className="text-[9px] text-[#4A4A4A] dark:text-gray-500 uppercase mt-0.5">{getTypeLabel(task.task_type)}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${getPriorityBadge(task.priority)}`}>
            {(task.priority ?? 'Normal').toUpperCase()}
          </span>
        </div>
        <p className="text-sm font-medium text-[#1A1A1A] dark:text-white truncate">{task.guest_name ?? '—'}</p>
        {task.pickup_location && (
          <p className="text-xs text-[#4A4A4A] dark:text-gray-400 truncate">{task.pickup_location}</p>
        )}
      </div>
      <ChevronRight className="w-4 h-4 text-[#4A4A4A] dark:text-gray-400 shrink-0" />
      </div>
    </div>
  );
}

// ── Completed compact card ─────────────────────────────────────────────────────
function CompletedCard({ task, onPress }: { task: DriverTask; onPress: () => void }) {
  const duration = (() => {
    if (!task.started_at || !task.completed_at) return null;
    const mins = Math.round((new Date(task.completed_at).getTime() - new Date(task.started_at).getTime()) / 60000);
    return `${mins} min`;
  })();

  return (
    <div
      className="bg-white dark:bg-gray-800 rounded-xl px-4 py-3 shadow-sm mx-4 mb-2 flex items-center gap-3 opacity-70 active:scale-[0.98] transition-transform cursor-pointer"
      onClick={onPress}
    >
      <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
        <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">
          {fmtTime(task.scheduled_time)} · {getTypeLabel(task.task_type)} · Completed
        </p>
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
          {task.guest_name ?? '—'}{task.pickup_location ? ` · ${task.pickup_location}` : ''}{duration ? ` · ${duration}` : ''}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0" />
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────
function EmptyTasks() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16">
      <ClipboardList className="w-16 h-16 text-gray-200 dark:text-gray-700" />
      <p className="text-base font-semibold text-gray-400 dark:text-gray-500">No tasks for today</p>
      <p className="text-sm text-gray-300 dark:text-gray-600">Enjoy the break!</p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MobileDriverTasksPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [dateFilter, setDateFilter] = useState<DateFilter>('today');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [allTasks, setAllTasks]     = useState<DriverTask[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchTasks = useCallback(async (silent = false) => {
    if (!user?.id) return;
    if (!silent) setLoading(true); else setRefreshing(true);

    const { data } = await supabase
      .from('driver_tasks')
      .select('*')
      .eq('driver_id', user.id)
      .neq('status', 'cancelled')
      .order('scheduled_date', { ascending: true })
      .order('scheduled_time', { ascending: true, nullsFirst: false });

    setAllTasks((data ?? []) as DriverTask[]);
    if (!silent) setLoading(false); else setRefreshing(false);
  }, [user?.id]);

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

  // Real-time: new tasks assigned
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`tasks-realtime-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_tasks', filter: `driver_id=eq.${user.id}` }, () => {
        fetchTasks(true);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, fetchTasks]);

  // ── Accept / Decline suggested tasks ─────────────────────────────────────
  const handleAccept = async (task: DriverTask) => {
    await supabase.from('driver_tasks').update({ status: 'pending' }).eq('id', task.id);
    fetchTasks(true);
  };

  const handleDecline = async (task: DriverTask) => {
    await supabase.from('driver_tasks').update({ status: 'cancelled' }).eq('id', task.id);
    fetchTasks(true);
  };

  // ── Derived lists ─────────────────────────────────────────────────────────
  const typeFiltered = typeFilter === 'all' ? allTasks
    : allTasks.filter(t =>
        typeFilter === 'pickups'  ? t.task_type === 'airport_pickup'
        : t.task_type === 'airport_dropoff',
      );

  const suggestedTasks = typeFiltered.filter(t => t.status === 'suggested');
  const activeTasks    = typeFiltered.filter(t => t.status === 'in_progress');

  // Apply date filter only to pending / completed
  const today    = getISODate(0);
  const tomorrow = getISODate(1);
  const weekEnd  = getISODate(6);

  const inDateRange = (task: DriverTask) => {
    const d = task.scheduled_date;
    if (dateFilter === 'today')    return d === today;
    if (dateFilter === 'tomorrow') return d === tomorrow;
    if (dateFilter === 'week')     return d >= today && d <= weekEnd;
    return true;
  };

  const upcomingTasks  = typeFiltered.filter(t => t.status === 'pending'   && inDateRange(t));
  const completedTasks = typeFiltered.filter(t => t.status === 'completed' && inDateRange(t));

  const totalTasks = suggestedTasks.length + activeTasks.length + upcomingTasks.length + completedTasks.length;

  // ── Filter pills ──────────────────────────────────────────────────────────
  const datePills: { key: DateFilter; label: string }[] = [
    { key: 'today',    label: 'Today'     },
    { key: 'tomorrow', label: 'Tomorrow'  },
    { key: 'week',     label: 'This Week' },
    { key: 'all',      label: 'All'       },
  ];
  const typePills: { key: TypeFilter; label: string }[] = [
    { key: 'pickups',  label: 'Pickups'  },
    { key: 'dropoffs', label: 'Dropoffs' },
  ];

  const activePill = (key: DateFilter | TypeFilter) =>
    'bg-[#2D5A45] text-white rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap shrink-0 active:bg-[#234839] transition-colors';
  const inactivePill =
    'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-full px-4 py-2 text-sm whitespace-nowrap shrink-0 active:bg-gray-200 dark:active:bg-gray-700 transition-colors';

  return (
    <MobileDriverLayout unreadMessages={unreadMessages}>
      {/* Filter pills */}
      <div className="flex gap-2 overflow-x-auto px-4 py-3 no-scrollbar">
        {datePills.map(p => (
          <button
            key={p.key}
            onClick={() => setDateFilter(p.key)}
            className={dateFilter === p.key ? activePill(p.key) : inactivePill}
          >
            {p.label}
          </button>
        ))}
        <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 self-center shrink-0" />
        {typePills.map(p => (
          <button
            key={p.key}
            onClick={() => setTypeFilter(prev => prev === p.key ? 'all' : p.key)}
            className={typeFilter === p.key ? activePill(p.key) : inactivePill}
          >
            {p.label}
          </button>
        ))}

        {/* Refresh button */}
        <button
          onClick={() => fetchTasks(true)}
          disabled={refreshing}
          className="ml-auto shrink-0 w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center active:bg-gray-200 dark:active:bg-gray-700 transition-colors"
        >
          <RotateCcw className={`w-4 h-4 text-gray-500 dark:text-gray-400 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-[#4A4A4A] dark:text-gray-400 text-sm">
          Loading…
        </div>
      ) : totalTasks === 0 ? (
        <EmptyTasks />
      ) : (
        <div className="pb-4">

          {/* ── Suggested ── */}
          {suggestedTasks.length > 0 && (
            <div>
              <SectionHeader label="New Tasks" count={suggestedTasks.length} badgeRed />
              {suggestedTasks.map(task => (
                <SwipeCard key={task.id} onAccept={() => handleAccept(task)} onDecline={() => handleDecline(task)}>
                  <SuggestedCard task={task} />
                  {/* Inline Accept / Decline buttons */}
                  <div className="flex gap-3 px-4 pb-4 pt-1">
                    <button
                      onClick={() => handleDecline(task)}
                      className="flex-1 h-12 rounded-xl bg-gray-200 dark:bg-gray-700 text-[#1A1A1A] dark:text-white text-base font-bold flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
                    >
                      <X className="w-4 h-4" /> Decline
                    </button>
                    <button
                      onClick={() => handleAccept(task)}
                      className="flex-1 h-12 rounded-xl bg-[#2D5A45] text-white text-base font-bold flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
                    >
                      <Check className="w-4 h-4" /> Accept
                    </button>
                  </div>
                </SwipeCard>
              ))}
            </div>
          )}

          {/* ── Active ── */}
          {activeTasks.length > 0 && (
            <div>
              <SectionHeader label="Active" count={activeTasks.length} />
              {activeTasks.map(task => (
                <ActiveCard
                  key={task.id}
                  task={task}
                  onPress={() => navigate(`/driver/task/${task.id}`)}
                />
              ))}
            </div>
          )}

          {/* ── Upcoming ── */}
          {upcomingTasks.length > 0 && (
            <div>
              <SectionHeader label="Upcoming" count={upcomingTasks.length} />
              {upcomingTasks.map(task => (
                <UpcomingCard
                  key={task.id}
                  task={task}
                  onPress={() => navigate(`/driver/task/${task.id}`)}
                />
              ))}
            </div>
          )}

          {/* ── Completed (collapsible) ── */}
          {completedTasks.length > 0 && (
            <div>
              <SectionHeader
                label={`Completed ${dateFilter === 'today' ? 'Today' : ''}`}
                count={completedTasks.length}
                collapsible
                expanded={completedExpanded}
                onToggle={() => setCompletedExpanded(p => !p)}
              />
              {completedExpanded && completedTasks.map(task => (
                <CompletedCard
                  key={task.id}
                  task={task}
                  onPress={() => navigate(`/driver/task/${task.id}`)}
                />
              ))}
            </div>
          )}

        </div>
      )}
    </MobileDriverLayout>
  );
}
